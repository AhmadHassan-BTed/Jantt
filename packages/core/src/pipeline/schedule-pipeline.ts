import { Task } from "../types";
import { DEFAULT_GAP_DAYS } from "../constants";
import { createCalendar } from "../calendar";
import { IPipelineStage, PipelineContext, ScheduleCalendarOptions } from "./contracts";
import { SanitizeStage } from "./stages/sanitize-stage";
import { CycleGuardStage } from "./stages/cycle-guard-stage";
import { CascadeResolveStage } from "./stages/cascade-resolve-stage";
import { CriticalPathStage } from "./stages/critical-path-stage";

export interface SchedulePipelineOptions extends ScheduleCalendarOptions {
  defaultGapDays?: number;
  /** When false, dates are left untouched (Strict mode). Defaults to true. */
  autoCascade?: boolean;
  breakCycles?: boolean;
  includeCriticalPath?: boolean;
  options?: Record<string, any>;
}

/**
 * SchedulePipeline:
 * Composable, contract-driven Pipes-and-Filters assembly line for task schedule processing.
 */
export class SchedulePipeline {
  private stages: IPipelineStage<Task[], Task[]>[] = [];

  constructor(stages: IPipelineStage<Task[], Task[]>[] = []) {
    this.stages = [...stages];
  }

  /**
   * Creates a standard production-ready schedule resolution pipeline.
   */
  public static createDefault(options: { includeCriticalPath?: boolean } = {}): SchedulePipeline {
    const stages: IPipelineStage<Task[], Task[]>[] = [
      new SanitizeStage(),
      new CycleGuardStage(),
      new CascadeResolveStage()
    ];
    if (options.includeCriticalPath) {
      stages.push(new CriticalPathStage());
    }
    return new SchedulePipeline(stages);
  }

  /**
   * Builds the execution context shared by all stages from pipeline options
   * (normalizing the gap and the project calendar).
   */
  public static createContext(options: SchedulePipelineOptions = {}): PipelineContext {
    const gap = options.defaultGapDays;
    // A string project calendar may name an entry of `calendars` as well as a preset
    const calendar =
      typeof options.calendar === "string" && options.calendars?.[options.calendar]
        ? options.calendars[options.calendar]
        : options.calendar;
    return {
      defaultGapDays: typeof gap === "number" && Number.isFinite(gap) ? gap : DEFAULT_GAP_DAYS,
      autoCascade: options.autoCascade ?? true,
      diagnostics: [],
      calendar: calendar ? createCalendar(calendar) : undefined,
      calendars: options.calendars,
      people: options.people,
      useWorkingDays: options.useWorkingDays,
      options: {
        breakCycles: options.breakCycles ?? false,
        ...options.options
      }
    };
  }

  /**
   * Appends a new stage to the pipeline.
   */
  public pipe(stage: IPipelineStage<Task[], Task[]>): this {
    this.stages.push(stage);
    return this;
  }

  /**
   * Returns a copy of the registered stages.
   */
  public getStages(): readonly IPipelineStage<Task[], Task[]>[] {
    return [...this.stages];
  }

  /**
   * Executes the assembly line on the provided tasks.
   *
   * @param tasks - The array of tasks to process.
   * @param options - Pipeline execution configuration.
   * @returns Processed tasks and execution diagnostics.
   */
  public execute(
    tasks: Task[],
    options: SchedulePipelineOptions = {}
  ): { tasks: Task[]; diagnostics: string[]; context: PipelineContext } {
    const context = SchedulePipeline.createContext(options);

    let current = tasks;
    for (const stage of this.stages) {
      current = stage.process(current, context);
    }

    return {
      tasks: current,
      diagnostics: context.diagnostics || [],
      context
    };
  }
}
