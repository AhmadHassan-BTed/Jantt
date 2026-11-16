import { Task, resolveTaskAssignee } from "@jantt/core";
import { ITaskFilterStage, TaskQueryContext } from "../contracts";

export class SearchQueryFilterStage implements ITaskFilterStage {
  public readonly id = "search-query-filter";

  public matches(task: Task, context: TaskQueryContext): boolean {
    if (task._deleted) return false;
    const query = context.searchQuery?.trim().toLowerCase();
    if (!query) return true;

    const includes = (value: unknown) => typeof value === "string" && value.toLowerCase().includes(query);
    if (
      includes(task.label || task.name) ||
      includes(task.id) ||
      includes(task.category) ||
      includes(task.assignee) ||
      includes(task.wbs)
    ) {
      return true;
    }

    // Match the resolved person / team name, not only the raw assignee id
    if (context.effectivePeople?.length || context.teams?.length) {
      const info = resolveTaskAssignee(task, context.effectivePeople || [], context.teams || []);
      return includes(info.displayName) || includes(info.team?.name);
    }
    return false;
  }
}
