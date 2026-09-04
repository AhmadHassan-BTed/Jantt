import { Task, CriticalPathResult } from "./types";
import { addDays, diffDays } from "./date-math";
import { getEffectiveGap } from "./utils";
import { DEFAULT_GAP_DAYS } from "./constants";

/**
 * Normalizes task dependencies into a clean string array.
 * Supports string, string[], or comma-separated formats.
 */
export function getTaskDependencies(task: Task | { dependsOn?: string | string[] | null }): string[] {
  if (!task || !task.dependsOn) return [];
  if (Array.isArray(task.dependsOn)) {
    return task.dependsOn
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id.length > 0);
  }
  if (typeof task.dependsOn === "string") {
    if (task.dependsOn.includes(",")) {
      return task.dependsOn
        .split(",")
        .map((s) => s.trim())
        .filter((id) => id.length > 0);
    }
    const trimmed = task.dependsOn.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  return [];
}

/**
 * Resolves the scheduling cascade for a list of tasks.
 *
 * Implements coordinated multi-predecessor pacing:
 * 1. Multi-Dependency Resolution: If a task depends on multiple tasks (e.g. [A, B]),
 *    it cannot start before max(A.end, B.end) + gapDays. Preserves task duration when shifted.
 *
 * Locked tasks (`locked: true`) are never moved.
 *
 * @param tasks - The array of tasks to resolve.
 * @param defaultGapDays - Default spacing between sibling tasks (default: 2).
 * @returns A fresh, schedule-consistent array of tasks.
 */
export function resolveSchedule(tasks: Task[], defaultGapDays = DEFAULT_GAP_DAYS): Task[] {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  // Pure deep clone of tasks ensuring nested objects (baseline, fields, dependsOn) are not mutated
  const byId = Object.fromEntries(
    tasks.map((t) => [
      t.id,
      {
        ...t,
        start: t.start,
        end: t.end,
        baseline: t.baseline ? { ...t.baseline } : undefined,
        fields: t.fields ? { ...t.fields } : undefined,
        dependsOn: Array.isArray(t.dependsOn) ? [...t.dependsOn] : t.dependsOn
      }
    ])
  );

  const MAX_PASSES = 24;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (const t of Object.values(byId)) {
      if (t.locked) continue;

      const explicitDeps = getTaskDependencies(t);
      let calculatedMinStart: string | null = null;

      if (explicitDeps.length > 0) {
        const gap = getEffectiveGap(t, defaultGapDays);

        for (const depId of explicitDeps) {
          const prereq = byId[depId];
          if (!prereq) continue;
          const minForThisDep = addDays(prereq.end, gap);
          if (!calculatedMinStart || diffDays(calculatedMinStart, minForThisDep) > 0) {
            calculatedMinStart = minForThisDep;
          }
        }
      }

      if (calculatedMinStart && diffDays(t.start, calculatedMinStart) > 0) {
        const duration = Math.max(diffDays(t.start, t.end), 0);
        t.start = calculatedMinStart;
        t.end = addDays(calculatedMinStart, duration);
        changed = true;
      }
    }

    if (!changed) break;
  }

  return tasks.map((orig) => byId[orig.id] || { ...orig });
}



/**
 * Calculates the Critical Path of a task network using Early/Late start analysis.
 * Identifies the sequence of dependent tasks with zero total float that directly
 * dictates the project completion date. Supports multi-dependency networks.
 */
export function calculateCriticalPath(tasks: Task[]): CriticalPathResult {
  const criticalTaskIds = new Set<string>();
  const criticalDepKeys = new Set<string>();

  if (!tasks || tasks.length === 0) {
    return { criticalTaskIds, criticalDepKeys };
  }

  const byId = new Map<string, Task>();
  const dependentsMap = new Map<string, string[]>();

  tasks.forEach((t) => {
    byId.set(t.id, t);
    dependentsMap.set(t.id, []);
  });

  tasks.forEach((t) => {
    const depIds = getTaskDependencies(t);
    depIds.forEach((depId) => {
      if (byId.has(depId)) {
        dependentsMap.get(depId)!.push(t.id);
      }
    });
  });

  // Find project max finish date
  let maxProjectFinish = tasks[0].end;
  tasks.forEach((t) => {
    if (diffDays(maxProjectFinish, t.end) > 0) {
      maxProjectFinish = t.end;
    }
  });

  // Backward pass to find late finish and slack
  const lateFinishMap = new Map<string, string>();
  const slackMap = new Map<string, number>();

  // Initialize leaf tasks with maxProjectFinish
  tasks.forEach((t) => {
    const deps = dependentsMap.get(t.id) || [];
    if (deps.length === 0) {
      lateFinishMap.set(t.id, maxProjectFinish);
    }
  });

  // Backward pass propagation
  // Reverse tasks array for backward pass so downstream leaf tasks are processed first
  const reversedTasks = [...tasks].reverse();
  for (let pass = 0; pass < 24; pass++) {
    let changed = false;
    reversedTasks.forEach((t) => {
      const deps = dependentsMap.get(t.id) || [];
      if (deps.length > 0) {
        let minRequiredLateFinish: string | null = null;
        deps.forEach((depId) => {
          const depTask = byId.get(depId);
          if (!depTask) return;
          const depLF = lateFinishMap.get(depId) || depTask.end;
          const depDuration = Math.max(diffDays(depTask.start, depTask.end), 0);
          const depLS = addDays(depLF, -depDuration);
          const gap = getEffectiveGap(depTask, 0);
          const requiredLF = addDays(depLS, -gap);

          if (!minRequiredLateFinish || diffDays(requiredLF, minRequiredLateFinish) > 0) {
            minRequiredLateFinish = requiredLF;
          }
        });

        if (minRequiredLateFinish && lateFinishMap.get(t.id) !== minRequiredLateFinish) {
          lateFinishMap.set(t.id, minRequiredLateFinish);
          changed = true;
        }
      }
    });

    if (!changed) break;
  }

  // Calculate slack and identify critical tasks
  tasks.forEach((t) => {
    const lf = lateFinishMap.get(t.id) || t.end;
    const slack = diffDays(t.end, lf);
    slackMap.set(t.id, Math.max(0, slack));

    // Tasks with minimal slack (<= 0 days) on an active dependency chain or project terminal finish
    if (slack <= 0) {
      criticalTaskIds.add(t.id);
    }
  });

  // Trace critical links: A -> B is critical only if both A and B are critical,
  // and the finish of A plus required gap directly drives the start of B
  tasks.forEach((t) => {
    const depIds = getTaskDependencies(t);
    depIds.forEach((depId) => {
      const prereq = byId.get(depId);
      if (prereq && criticalTaskIds.has(t.id) && criticalTaskIds.has(depId)) {
        const gap = getEffectiveGap(t, 0);
        const expectedStart = addDays(prereq.end, gap);
        if (diffDays(expectedStart, t.start) === 0) {
          criticalDepKeys.add(`${depId}->${t.id}`);
        }
      }
    });
  });

  return { criticalTaskIds, criticalDepKeys };
}
