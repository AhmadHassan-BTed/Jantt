import { Task } from "./types";
import { addDays, diffDays, parseISODate } from "./date-math";

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
 * 2. Implicit category pacing: Tasks in the same category without explicit dependencies
 *    are automatically spaced by defaultGapDays in chronological order.
 *
 * Locked tasks (`locked: true`) are never moved.
 *
 * @param tasks - The array of tasks to resolve.
 * @param defaultGapDays - Default spacing between sibling tasks (default: 2).
 * @returns A fresh, schedule-consistent array of tasks.
 */
export function resolveSchedule(tasks: Task[], defaultGapDays = 2): Task[] {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  // Clone tasks so the function is pure and does not mutate inputs
  const byId = Object.fromEntries(
    tasks.map((t) => [
      t.id,
      {
        ...t,
        start: t.start,
        end: t.end
      }
    ])
  );

  // Group unlocked tasks by category for implicit pacing
  const categoryGroups: Record<string, Task[]> = {};
  Object.values(byId)
    .filter((t) => !t.locked)
    .forEach((t) => {
      const cat = t.category || "default";
      (categoryGroups[cat] ||= []).push(t);
    });

  // Determine implicit sibling predecessor per category
  const implicitPrev: Record<string, string> = {};
  Object.values(categoryGroups).forEach((group) => {
    const unexplicit = group.filter((t) => getTaskDependencies(t).length === 0);
    unexplicit.sort((a, b) => parseISODate(a.start).getTime() - parseISODate(b.start).getTime());
    for (let i = 1; i < unexplicit.length; i++) {
      implicitPrev[unexplicit[i].id] = unexplicit[i - 1].id;
    }
  });

  const MAX_PASSES = 24;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (const t of Object.values(byId)) {
      if (t.locked) continue;

      const explicitDeps = getTaskDependencies(t);
      let calculatedMinStart: string | null = null;

      if (explicitDeps.length > 0) {
        const gap = t.gapDays ?? t.minGapDays ?? 0;

        for (const depId of explicitDeps) {
          const prereq = byId[depId];
          if (!prereq) continue;
          const minForThisDep = addDays(prereq.end, gap);
          if (!calculatedMinStart || diffDays(calculatedMinStart, minForThisDep) > 0) {
            calculatedMinStart = minForThisDep;
          }
        }
      } else if (implicitPrev[t.id]) {
        const prereq = byId[implicitPrev[t.id]];
        if (prereq) {
          calculatedMinStart = addDays(prereq.end, defaultGapDays);
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

export interface CriticalPathResult {
  criticalTaskIds: Set<string>;
  criticalDepKeys: Set<string>;
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
  for (let pass = 0; pass < 16; pass++) {
    tasks.forEach((t) => {
      const deps = dependentsMap.get(t.id) || [];
      if (deps.length > 0) {
        let minRequiredLateFinish: string | null = null;
        deps.forEach((depId) => {
          const depTask = byId.get(depId);
          if (!depTask) return;
          const depLF = lateFinishMap.get(depId) || depTask.end;
          const depDuration = Math.max(diffDays(depTask.start, depTask.end), 0);
          const depLS = addDays(depLF, -depDuration);
          const gap = depTask.gapDays ?? depTask.minGapDays ?? 0;
          const requiredLF = addDays(depLS, -gap);

          if (!minRequiredLateFinish || diffDays(requiredLF, minRequiredLateFinish) > 0) {
            minRequiredLateFinish = requiredLF;
          }
        });

        if (minRequiredLateFinish) {
          lateFinishMap.set(t.id, minRequiredLateFinish);
        }
      }
    });
  }

  // Calculate slack and identify critical tasks
  tasks.forEach((t) => {
    const lf = lateFinishMap.get(t.id) || t.end;
    const slack = diffDays(t.end, lf);
    slackMap.set(t.id, Math.max(0, slack));

    // Tasks with minimal slack (<= 0 days) on an active dependency chain or terminal finish
    if (slack <= 0 || t.end === maxProjectFinish) {
      criticalTaskIds.add(t.id);
    }
  });

  // Trace critical links
  tasks.forEach((t) => {
    const depIds = getTaskDependencies(t);
    depIds.forEach((depId) => {
      if (criticalTaskIds.has(t.id) && criticalTaskIds.has(depId)) {
        criticalDepKeys.add(`${depId}->${t.id}`);
      }
    });
  });

  return { criticalTaskIds, criticalDepKeys };
}
