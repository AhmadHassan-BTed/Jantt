import { Task } from "@jantt/core";
import { ITaskFilterStage, ITaskSorter, TaskQueryContext } from "./contracts";
import { DateFilterStage } from "./filters/date-filter-stage";
import { AssigneeFilterStage } from "./filters/assignee-filter-stage";
import { CompletionFilterStage } from "./filters/completion-filter-stage";
import { SearchQueryFilterStage } from "./filters/search-query-filter-stage";

/**
 * TaskQueryPipeline:
 * Composable assembly line for filtering and sorting tasks across all application views.
 */
export class TaskQueryPipeline {
  private filters: ITaskFilterStage[] = [];
  private sorters: ITaskSorter[] = [];

  constructor(filters: ITaskFilterStage[] = [], sorters: ITaskSorter[] = []) {
    this.filters = [...filters];
    this.sorters = [...sorters];
  }

  /**
   * Creates a standard production-ready query pipeline.
   */
  public static createDefault(): TaskQueryPipeline {
    return new TaskQueryPipeline([
      new DateFilterStage(),
      new AssigneeFilterStage(),
      new CompletionFilterStage(),
      new SearchQueryFilterStage()
    ]);
  }

  public addFilter(filter: ITaskFilterStage): this {
    this.filters.push(filter);
    return this;
  }

  public addSorter(sorter: ITaskSorter): this {
    this.sorters.push(sorter);
    return this;
  }

  /**
   * Tests whether a single task satisfies all active filter stages.
   */
  public matches(task: Task, context: TaskQueryContext): boolean {
    if (!task || task._deleted) return false;
    for (const filter of this.filters) {
      if (!filter.matches(task, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Runs the full filter assembly line across a collection of tasks.
   */
  public filter(tasks: Task[], context: TaskQueryContext): Task[] {
    if (!tasks || tasks.length === 0) return [];
    return tasks.filter((t) => this.matches(t, context));
  }

  /**
   * Executes both filtering and sorting stages.
   */
  public execute(tasks: Task[], context: TaskQueryContext): Task[] {
    const filtered = this.filter(tasks, context);
    let sorted = filtered;
    for (const sorter of this.sorters) {
      sorted = sorter.sort(sorted, context);
    }
    return sorted;
  }
}
