import { Task } from "../../types";
import { addDays, diffDays } from "../../date-math";
import { getEffectiveGap } from "../../utils";
import { getTaskDependencyRelations } from "../../dependencies";
import { IPipelineStage, PipelineContext } from "../contracts";

/**
 * CascadeResolveStage:
 * Implements coordinated multi-predecessor pacing:
 * 1. Enterprise 4-Type Dependency Relationships:
 *    - FS (Finish-to-Start)
 *    - SS (Start-to-Start)
 *    - FF (Finish-to-Finish)
 *    - SF (Start-to-Finish)
 *    with positive/negative lead & lag support.
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
        const relations = getTaskDependencyRelations(t).filter((rel) => rel.id !== t.id && Boolean(byId[rel.id]));
        let calculatedMinStart: string | null = null;

        if (relations.length > 0) {
          const defaultGap = getEffectiveGap(t, defaultGapDays);
          const duration = Math.max(diffDays(t.start, t.end), 0);

          for (const rel of relations) {
            const prereq = byId[rel.id];
            if (!prereq) continue;

            const lag = rel.lagDays !== 0 ? rel.lagDays : defaultGap;
            let minForThisDep: string;

            switch (rel.type) {
              case "SS":
                minForThisDep = addDays(prereq.start, lag);
                break;
              case "FF":
                minForThisDep = addDays(addDays(prereq.end, lag), -duration);
                break;
              case "SF":
                minForThisDep = addDays(addDays(prereq.start, lag), -duration);
                break;
              case "FS":
              default:
                minForThisDep = addDays(prereq.end, lag);
                break;
            }

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
