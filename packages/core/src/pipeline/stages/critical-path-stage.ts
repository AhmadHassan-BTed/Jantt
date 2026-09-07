import { Task, CriticalPathResult } from "../../types";
import { calculateCriticalPath } from "../../cpm";
import { IPipelineStage, PipelineContext } from "../contracts";

/**
 * CriticalPathStage:
 * Computes forward and backward pass CPM metrics (Total Float, Free Float, Early/Late dates)
 * and flags tasks on the critical path.
 */
export class CriticalPathStage implements IPipelineStage<Task[], Task[]> {
  public readonly name = "CriticalPathStage";

  public process(tasks: Task[], context: PipelineContext): Task[] {
    if (!tasks || tasks.length === 0) return [];

    const cpmResult: CriticalPathResult = calculateCriticalPath(tasks, {
      defaultGapDays: context.defaultGapDays,
      ...context.options?.cpmOptions
    });

    if (!context.options) {
      context.options = {};
    }
    context.options.cpmResult = cpmResult;

    // Return tasks decorated with critical flag
    return tasks.map((task) => {
      const isCritical = cpmResult.criticalTaskIds.has(task.id);
      if (task.critical === isCritical) {
        return task;
      }
      return { ...task, critical: isCritical };
    });
  }
}
