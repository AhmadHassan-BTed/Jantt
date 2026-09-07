import { Task, isTaskDone } from "@jantt/core";
import { ITaskFilterStage, TaskQueryContext } from "../contracts";

export class CompletionFilterStage implements ITaskFilterStage {
  public readonly id = "completion-filter";

  public matches(task: Task, context: TaskQueryContext): boolean {
    if (task._deleted) return false;
    if (context.completedFilterMode === "filter") {
      return !isTaskDone(task);
    }
    return true;
  }
}
