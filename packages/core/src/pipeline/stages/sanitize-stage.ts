import { Task } from "../../types";
import { parseISODate } from "../../date-math";
import { getTaskDependencies } from "../../cpm";
import { IPipelineStage, PipelineContext } from "../contracts";

/**
 * SanitizeStage:
 * 1. Clamps inverted dates (ensures start <= end).
 * 2. Removes self-dependencies (task depending on itself).
 * 3. Removes dangling dependencies (predecessors that do not exist in the task set).
 */
export class SanitizeStage implements IPipelineStage<Task[], Task[]> {
  public readonly name = "SanitizeStage";

  public process(tasks: Task[], context: PipelineContext): Task[] {
    if (!tasks || tasks.length === 0) return [];

    const existingIds = new Set(tasks.map((t) => t.id));

    return tasks.map((task) => {
      const copy = { ...task };

      // 1. Check and correct inverted dates
      if (copy.start && copy.end) {
        const dStart = parseISODate(copy.start);
        const dEnd = parseISODate(copy.end);
        if (dStart > dEnd) {
          context.diagnostics?.push(`Inverted date for task "${copy.id}" corrected (start > end).`);
          copy.end = copy.start;
        }
      } else if (copy.start && !copy.end) {
        copy.end = copy.start;
      }

      // 2. Filter self-dependencies and dangling predecessor IDs
      const rawDeps = getTaskDependencies(copy);
      const validDeps = rawDeps.filter((depId) => depId !== copy.id && existingIds.has(depId));

      if (rawDeps.length !== validDeps.length) {
        if (validDeps.length === 0) {
          copy.dependsOn = null;
        } else if (validDeps.length === 1) {
          copy.dependsOn = validDeps[0];
        } else {
          copy.dependsOn = validDeps;
        }
      }

      return copy;
    });
  }
}
