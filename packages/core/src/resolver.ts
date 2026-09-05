import { Task } from "./types";
import { addDays, diffDays } from "./date-math";
import { getEffectiveGap } from "./utils";
import { DEFAULT_GAP_DAYS } from "./constants";
import { getTaskDependencies } from "./cpm";

export { getTaskDependencies, calculateCriticalPath } from "./cpm";

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
  const liveTasks = tasks.filter((t) => !t._deleted);
  if (liveTasks.length === 0) {
    return [];
  }

  // Pure deep clone of tasks ensuring nested objects (baseline, fields, dependsOn) are not mutated
  const byId = Object.fromEntries(
    liveTasks.map((t) => [
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
