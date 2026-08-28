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
    // Only tasks without explicit dependsOn participate in implicit chain
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
        const duration = Math.max(diffDays(t.start, t.end), 1);
        t.start = minStart;
        t.end = addDays(minStart, duration);
        changed = true;
      }
    }

    if (!changed) break;
  }

  return tasks.map((orig) => byId[orig.id] || { ...orig });
}
