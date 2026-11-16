import { Task, Person, WorkingCalendar, CalendarPreset } from "../types";

/**
 * Working-calendar inputs for schedule resolution (typically `meta.calendar`,
 * `meta.useWorkingDays`, `data.calendars` and `data.people`).
 */
export interface ScheduleCalendarOptions {
  /** Project-wide working calendar or preset name. */
  calendar?: WorkingCalendar | CalendarPreset;
  /** Named calendars referenced by `task.calendar` / `calendarId` and person calendars. */
  calendars?: Record<string, WorkingCalendar>;
  /** People, used to resolve assignee calendars. */
  people?: Person[];
  /**
   * Use working-day arithmetic for every task. Defaults to true when `calendar` is set.
   * Tasks with their own calendar always use it.
   */
  useWorkingDays?: boolean;
}

/**
 * Execution context passed through the pipeline stages.
 */
export interface PipelineContext {
  /** Default gap days between predecessor and successor tasks. */
  defaultGapDays: number;
  /** Whether auto-cascading is enabled. When false, the cascade returns unchanged copies. */
  autoCascade?: boolean;
  /** Custom options or metadata passed to stages. */
  options?: Record<string, any>;
  /** Diagnostics or warnings captured during stage execution. */
  diagnostics?: string[];
  /** Default project-wide working calendar */
  calendar?: WorkingCalendar;
  /** Dictionary of named working calendars */
  calendars?: Record<string, WorkingCalendar>;
  /** Project team members / people */
  people?: Person[];
  /**
   * Whether working-day calendar arithmetic should be used in schedule cascading.
   * Defaults to true when `calendar` is set; false explicitly disables it.
   */
  useWorkingDays?: boolean;
}

/**
 * Contract for an individual assembly-line stage in the task schedule pipeline.
 * Each stage adheres strictly to the Single Responsibility Principle.
 */
export interface IPipelineStage<TInput = Task[], TOutput = Task[]> {
  /** Unique name identifier of the pipeline stage. */
  readonly name: string;

  /**
   * Executes the stage transformation.
   *
   * @param input - The input data passed into this stage.
   * @param context - The shared pipeline execution context.
   * @returns The transformed output.
   */
  process(input: TInput, context: PipelineContext): TOutput;
}
