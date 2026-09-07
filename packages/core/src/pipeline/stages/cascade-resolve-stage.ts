import { Task } from "../../types";
import { addDays, diffDays } from "../../date-math";
import { getEffectiveGap } from "../../utils";
import { getTaskDependencies } from "../../cpm";
import { IPipelineStage, PipelineContext } from "../contracts";

/**
 * CascadeResolveStage:
 * Implements coordinated multi-predecessor pacing:
 * 1. Multi-Dependency Resolution: If a task depends on multiple tasks (e.g. [A, B]),
 *    it cannot start before max(A.end, B.end) + gapDays. Preserves task duration when shifted.
 * 2. Honors locked tasks (`locked: true`).
 */
export class CascadeResolveStage implements IPipelineStage<Task[], Task[]> {
  public readonly name = "CascadeResolveStage";

  public process(tasks: Task[], context: PipelineContext): Task[] {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return [];
    }
    const liveTasks = tasks.filter((t) => !t._deleted);
    if (liveTasks.length === 0) {
      return [];
    }

    const defaultGapDays = context.defaultGapDays;

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

        // Filter self-dependencies and dangling links
        const explicitDeps = getTaskDependencies(t).filter((depId) => depId !== t.id && Boolean(byId[depId]));
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
}
