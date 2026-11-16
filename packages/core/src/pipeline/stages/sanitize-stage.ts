import { Task } from "../../types";
import { isValidISODate, toEpochDay } from "../../date-math";
import { filterDependsOn } from "../../dependencies";
import { IPipelineStage, PipelineContext } from "../contracts";

/**
 * SanitizeStage:
 * 1. Clamps inverted dates (ensures start <= end) and fills a missing end.
 * 2. Collapses milestones (`milestone: true`) to a single day (end = start).
 * 3. Removes self-dependencies (task depending on itself).
 * 4. Removes dangling dependencies (predecessors that do not exist in the task set).
 * Kept links are preserved exactly as written (types, lags and object form are not lost).
 */
export class SanitizeStage implements IPipelineStage<Task[], Task[]> {
  public readonly name = "SanitizeStage";

  public process(tasks: Task[], context: PipelineContext): Task[] {
    if (!tasks || tasks.length === 0) return [];

    const existingIds = new Set(tasks.map((t) => t?.id));

    return tasks.map((task) => {
      if (!task || typeof task !== "object") return task;
      const copy = { ...task };

      // 1-2. Correct inverted dates, missing ends and milestones with a duration
      if (copy.start && copy.end) {
        const start = toEpochDay(copy.start);
        const end = toEpochDay(copy.end);
        if (start > end) {
          context.diagnostics?.push(`Inverted date for task "${copy.id}" corrected (start > end).`);
          copy.end = copy.start;
        } else if (copy.milestone === true && start < end) {
          context.diagnostics?.push(`Milestone "${copy.id}" collapsed to a single day (end set to start).`);
          copy.end = copy.start;
        }
      } else if (copy.start && !copy.end && isValidISODate(copy.start)) {
        copy.end = copy.start;
      }

      // 3-4. Filter self-dependencies and dangling predecessor IDs, keeping the rest verbatim
      const nextDeps = filterDependsOn(
        copy.dependsOn,
        (rel) => rel.id !== copy.id && existingIds.has(rel.id),
        existingIds
      );
      if (nextDeps !== copy.dependsOn) {
        context.diagnostics?.push(`Removed self-referencing or dangling dependencies from task "${copy.id}".`);
        copy.dependsOn = nextDeps ?? null;
      }

      return copy;
    });
  }
}
