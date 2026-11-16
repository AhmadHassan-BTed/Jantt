import { Task } from "./types";
import { DEFAULT_GAP_DAYS } from "./constants";
import { buildDependencyGraph } from "./dependencies";
import { CascadeResolveStage } from "./pipeline/stages/cascade-resolve-stage";
import { SchedulePipeline } from "./pipeline/schedule-pipeline";
import { ScheduleCalendarOptions } from "./pipeline/contracts";

export { getTaskDependencies, calculateCriticalPath } from "./cpm";

/**
 * Detects whether a set of tasks contains circular dependencies (including a task that depends
 * on itself). Duplicate ids are not treated as cycles.
 */
export function hasDependencyCycle(tasks: Task[]): boolean {
  const graph = buildDependencyGraph(tasks);
  return graph.selfReferences.length > 0 || graph.cycles.length > 0;
}

/** Options accepted by {@link resolveSchedule} in place of a bare gap number. */
export interface ResolveScheduleOptions extends ScheduleCalendarOptions {
  /** Default gap (days) between a predecessor's finish and an FS successor's start. Default: 2. */
  defaultGapDays?: number;
  /** When false, tasks are returned unchanged (Strict mode). Default: true. */
  autoCascade?: boolean;
  /** Receives human-readable warnings (cycles, duplicate ids, locked-task conflicts, bad dates). */
  diagnostics?: string[];
}

const defaultCascadeStage = new CascadeResolveStage();

/**
 * Resolves the scheduling cascade for a list of tasks.
 *
 * Every unlocked task is moved to the earliest start that all of its dependencies allow
 * (FS/SS/FF/SF with lead/lag; FS links without a lag use the task's `gapDays` or the default
 * gap), preserving its duration. Runs in one topological pass, so the result is idempotent.
 * Locked tasks (`locked: true`) are never moved. Links inside a dependency cycle are ignored.
 * Tasks are never moved earlier and tasks without dependencies are never moved.
 *
 * This is the cascade stage of `SchedulePipeline.createDefault()` without the sanitize and cycle
 * guard stages, on purpose: it runs on every drag frame and must never rewrite `dependsOn` or
 * repair dates the user did not touch. It still produces the same dates as the full pipeline,
 * because the cascade itself ignores dangling links, self links, cycle links and duplicate ids,
 * and treats an inverted range as zero duration. Use the pipeline when the data should also be
 * repaired (dangling links removed, inverted dates fixed).
 *
 * @param tasks - The array of tasks to resolve.
 * @param gapOrOptions - Default FS gap in days (default: 2), or {@link ResolveScheduleOptions}
 *   to also pass working calendars, Strict mode and a diagnostics sink.
 * @returns A fresh, schedule-consistent array of tasks.
 */
export function resolveSchedule(
  tasks: Task[],
  gapOrOptions: number | ResolveScheduleOptions = DEFAULT_GAP_DAYS
): Task[] {
  const options: ResolveScheduleOptions =
    typeof gapOrOptions === "object" && gapOrOptions !== null ? gapOrOptions : { defaultGapDays: gapOrOptions };
  const context = SchedulePipeline.createContext(options);
  if (options.diagnostics) context.diagnostics = options.diagnostics;
  return defaultCascadeStage.process(tasks, context);
}
