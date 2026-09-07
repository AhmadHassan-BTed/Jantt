import type { Task, Team } from "@jantt/core";
import type { DateFilterMode, CompletedFilterMode, EffectivePerson } from "../../types";

export interface TaskQueryContext {
  dateFilterMode: DateFilterMode;
  dateFilterValue?: string;
  dateFilterRangeStart?: string;
  dateFilterRangeEnd?: string;
  selectedPersonFilter: string;
  effectivePeople?: EffectivePerson[];
  teams?: Team[];
  completedFilterMode: CompletedFilterMode;
  searchQuery?: string;
}

/**
 * Contract for individual task filter stages.
 */
export interface ITaskFilterStage {
  readonly id: string;
  matches(task: Task, context: TaskQueryContext): boolean;
}

/**
 * Contract for task ordering stages.
 */
export interface ITaskSorter {
  readonly id: string;
  sort(tasks: Task[], context: TaskQueryContext): Task[];
}
