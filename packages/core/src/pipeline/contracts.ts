import { Task, Person, WorkingCalendar } from "../types";

/**
 * Execution context passed through the pipeline stages.
 */
export interface PipelineContext {
  /** Default gap days between predecessor and successor tasks. */
  defaultGapDays: number;
  /** Whether auto-cascading is enabled. */
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
  /** Whether working-day calendar arithmetic should be used in schedule cascading */
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
