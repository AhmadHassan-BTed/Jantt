import { Task } from "@jantt/core";
import { ITaskFilterStage, TaskQueryContext } from "../contracts";

export class SearchQueryFilterStage implements ITaskFilterStage {
  public readonly id = "search-query-filter";

  public matches(task: Task, context: TaskQueryContext): boolean {
    if (task._deleted) return false;
    const query = context.searchQuery?.trim().toLowerCase();
    if (!query) return true;

    const labelMatch = (task.label || "").toLowerCase().includes(query);
    const idMatch = (task.id || "").toLowerCase().includes(query);
    const catMatch = (task.category || "").toLowerCase().includes(query);
    const assigneeMatch = (task.assignee || "").toLowerCase().includes(query);
    const wbsMatch = (task.wbs || "").toLowerCase().includes(query);

    return labelMatch || idMatch || catMatch || assigneeMatch || wbsMatch;
  }
}
