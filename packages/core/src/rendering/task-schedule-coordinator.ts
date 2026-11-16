import { JanttData, Task } from "../types";
import { getTodayISODate, addDays } from "../date-math";
import { filterDependsOn, TaskIdLookup } from "../dependencies";
import { DEFAULT_GAP_DAYS } from "../constants";
import { SchedulePipeline, SchedulePipelineOptions } from "../pipeline";

const defaultPipeline = SchedulePipeline.createDefault();

/** Per-edit scheduling switches that the plan itself does not carry. */
export interface ScheduleRunOptions {
  /** The chart's live Auto-Cascade flag; false (Strict mode) leaves dependent dates untouched. Default: true. */
  autoCascade?: boolean;
  /** Receives the pipeline's warnings (cycles, duplicate ids, repaired dates or links). */
  diagnostics?: string[];
}

export interface DeleteTaskOptions extends ScheduleRunOptions {
  /** Tombstone time recorded in `meta.tombstones` (default: now, ISO-8601). */
  deletedAt?: string;
}

function generateTaskId(existing: ReadonlySet<string>): string {
  for (;;) {
    const random =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
        : Math.random().toString(36).slice(2, 12);
    const id = `task-${Date.now().toString(36)}-${random}`;
    if (!existing.has(id)) return id;
  }
}

/** Next free top-level WBS code: continues the plan's highest top-level number (no duplicates, no gaps for nested WBS). */
function nextTopLevelWbs(tasks: Task[]): string {
  let max = 0;
  tasks.forEach((t) => {
    const top = typeof t.wbs === "string" ? parseInt(t.wbs.split(".")[0], 10) : NaN;
    if (Number.isFinite(top) && top > max) max = top;
  });
  // Plans without numeric WBS codes keep the sequential (row-number) default
  return `${(max > 0 ? max : tasks.length) + 1}.0`;
}

/**
 * Immutable schedule edits made outside the gesture controller (sidebar save/delete, Add Task,
 * link removal). Every method returns a new plan container and never mutates the input objects.
 */
export class TaskScheduleCoordinator {
  /**
   * Pipeline options for a plan: its default gap and working calendars (`meta.calendar`,
   * `meta.useWorkingDays`, `calendars`, assignee calendars via `people`), so every edit path
   * schedules exactly like the initial load.
   */
  public static scheduleOptions(data: JanttData, autoCascade?: boolean): SchedulePipelineOptions {
    return {
      defaultGapDays: data.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS,
      autoCascade,
      calendar: data.meta?.calendar,
      useWorkingDays: data.meta?.useWorkingDays,
      calendars: data.calendars,
      people: data.people
    };
  }

  private static resolve(data: JanttData, tasks: Task[], run?: ScheduleRunOptions): Task[] {
    const result = defaultPipeline.execute(tasks, TaskScheduleCoordinator.scheduleOptions(data, run?.autoCascade));
    if (run?.diagnostics && result.diagnostics.length > 0) run.diagnostics.push(...result.diagnostics);
    return result.tasks;
  }

  /**
   * Returns `task` without any dependency entry pointing at `predecessorId`, keeping every other
   * entry exactly as authored (type, lag, object or shorthand form). Returns the same object when
   * nothing references the predecessor, and a copy otherwise (never mutates shared task objects).
   */
  public static withoutDependency(task: Task, predecessorId: string, knownIds?: TaskIdLookup): Task {
    const next = filterDependsOn(task.dependsOn, (rel) => rel.id !== predecessorId, knownIds);
    if (next === task.dependsOn) return task;
    return { ...task, dependsOn: next ?? null };
  }

  /**
   * Adds a new sequential task to the schedule and resolves dependency dates.
   */
  public static createTask(currentData: JanttData, run?: ScheduleRunOptions): { nextData: JanttData; newTask: Task } {
    const defaultGap = currentData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
    const today = getTodayISODate();
    let lastEnd = today;
    if (currentData.tasks.length > 0) {
      lastEnd = currentData.tasks[currentData.tasks.length - 1].end || today;
    }
    const catKeys = Object.keys(currentData.categories || {});
    const defaultCat = catKeys.length > 0 ? catKeys[0] : "general";
    const nextIdx = currentData.tasks.length + 1;
    const newTask: Task = {
      id: generateTaskId(new Set(currentData.tasks.map((t) => t.id))),
      wbs: nextTopLevelWbs(currentData.tasks),
      label: `New Task ${nextIdx}`,
      category: defaultCat,
      start: lastEnd,
      end: addDays(lastEnd, 7),
      progress: 0,
      status: "not-started",
      dependsOn: currentData.tasks.length > 0 ? currentData.tasks[currentData.tasks.length - 1].id : null,
      gapDays: defaultGap
    };

    const resolved = TaskScheduleCoordinator.resolve(currentData, [...currentData.tasks, newTask], run);
    return {
      nextData: { ...currentData, tasks: resolved },
      newTask
    };
  }

  /**
   * Updates an existing task and recalculates the cascade schedule.
   */
  public static updateTask(currentData: JanttData, updatedTask: Task, run?: ScheduleRunOptions): JanttData {
    const nextTasks = currentData.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
    return { ...currentData, tasks: TaskScheduleCoordinator.resolve(currentData, nextTasks, run) };
  }

  /**
   * Deletes a task by ID, removes dangling references to it from successors (preserving every
   * other typed dependency), records a `meta.tombstones` entry so a 3-way merge cannot resurrect
   * the task from a collaborator's copy, and recalculates the cascade schedule.
   * Returns `currentData` unchanged when no task has that id.
   */
  public static deleteTask(currentData: JanttData, taskId: string, options?: DeleteTaskOptions): JanttData {
    if (!currentData.tasks.some((t) => t.id === taskId)) return currentData;
    const knownIds = new Set(currentData.tasks.map((t) => t.id));
    const nextTasks = currentData.tasks
      .filter((t) => t.id !== taskId)
      .map((t) => TaskScheduleCoordinator.withoutDependency(t, taskId, knownIds));
    const deletedAt = options?.deletedAt || new Date().toISOString();
    return {
      ...currentData,
      meta: {
        ...currentData.meta,
        tombstones: { ...currentData.meta?.tombstones, [taskId]: { deletedAt, entityType: "task" } }
      },
      tasks: TaskScheduleCoordinator.resolve(currentData, nextTasks, options)
    };
  }

  /**
   * Removes a single dependency edge between two tasks and cascades downstream dates.
   */
  public static removeDependency(currentData: JanttData, fromId: string, toId: string, run?: ScheduleRunOptions): JanttData {
    const targetTask = currentData.tasks.find((t) => t.id === toId);
    if (!targetTask) return currentData;

    const knownIds = new Set(currentData.tasks.map((t) => t.id));
    const updatedTask = TaskScheduleCoordinator.withoutDependency(targetTask, fromId, knownIds);
    if (updatedTask === targetTask) return currentData;

    const nextTasks = currentData.tasks.map((t) => (t.id === toId ? updatedTask : t));
    return { ...currentData, tasks: TaskScheduleCoordinator.resolve(currentData, nextTasks, run) };
  }
}
