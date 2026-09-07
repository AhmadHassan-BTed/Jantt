import { Task } from "@jantt/core";
import { ITaskFilterStage, TaskQueryContext } from "../contracts";
import { isTaskMatchingPersonFilter } from "../../../utils";

export class AssigneeFilterStage implements ITaskFilterStage {
  public readonly id = "assignee-filter";

  public matches(task: Task, context: TaskQueryContext): boolean {
    if (task._deleted) return false;
    return isTaskMatchingPersonFilter(
      task,
      context.selectedPersonFilter,
      context.effectivePeople || [],
      context.teams || []
    );
  }
}
