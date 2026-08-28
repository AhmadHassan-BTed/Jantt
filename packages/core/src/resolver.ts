import { Task } from "./types";
import { addDays, diffDays, parseISODate } from "./date-math";

/**
 * Resolves the scheduling cascade for a list of tasks.
 *
 * Implements two coordinated pacing mechanisms:
 * 1. Explicit dependency (`dependsOn`): A dependent task cannot start before
 *    prerequisite.end + gapDays. Preserves task duration when shifted.
 * 2. Implicit category pacing: Tasks in the same category without an explicit dependsOn
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
    const unexplicit = group.filter((t) => !t.dependsOn);
    unexplicit.sort((a, b) => parseISODate(a.start).getTime() - parseISODate(b.start).getTime());
    for (let i = 1; i < unexplicit.length; i++) {
      implicitPrev[unexplicit[i].id] = unexplicit[i - 1].id;
    }
  });

  const MAX_PASSES = 16;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (const t of Object.values(byId)) {
      if (t.locked) continue;

      const depId = t.dependsOn || implicitPrev[t.id];
      if (!depId || !byId[depId]) continue;

      const prereq = byId[depId];
      const gap = t.dependsOn
        ? (t.gapDays ?? t.minGapDays ?? defaultGapDays)
        : defaultGapDays;

      const minStart = addDays(prereq.end, gap);

      if (diffDays(t.start, minStart) > 0) {
        const duration = Math.max(diffDays(t.start, t.end), 0);
        t.start = minStart;
        t.end = addDays(minStart, duration);
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
 * dictates the project completion date.
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
    if (t.dependsOn && byId.has(t.dependsOn)) {
      dependentsMap.get(t.dependsOn)!.push(t.id);
    }
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
  for (let pass = 0; pass < 12; pass++) {
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
    if (t.dependsOn && criticalTaskIds.has(t.id) && criticalTaskIds.has(t.dependsOn)) {
      criticalDepKeys.add(`${t.dependsOn}->${t.id}`);
    }
  });

  return { criticalTaskIds, criticalDepKeys };
}
