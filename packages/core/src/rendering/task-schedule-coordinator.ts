import { JanttData, Task } from "../types";
import { getTodayISODate, addDays } from "../date-math";
import { getTaskDependencies } from "../resolver";
import { DEFAULT_GAP_DAYS } from "../constants";
import { SchedulePipeline } from "../pipeline";

const defaultPipeline = SchedulePipeline.createDefault();

export class TaskScheduleCoordinator {
  /**
   * Adds a new sequential task to the schedule and resolves dependency dates.
   */
  public static createTask(currentData: JanttData): { nextData: JanttData; newTask: Task } {
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
      id: `task-${Date.now().toString(36)}`,
      wbs: `${nextIdx}.0`,
      label: `New Task ${nextIdx}`,
      category: defaultCat,
      start: lastEnd,
      end: addDays(lastEnd, 7),
      progress: 0,
      status: "not-started",
      dependsOn: currentData.tasks.length > 0 ? currentData.tasks[currentData.tasks.length - 1].id : null,
      gapDays: defaultGap
    };

    const nextTasks = [...currentData.tasks, newTask];
    const resolved = defaultPipeline.execute(nextTasks, { defaultGapDays: defaultGap }).tasks;
    return {
      nextData: { ...currentData, tasks: resolved },
      newTask
    };
  }

  /**
   * Updates an existing task and recalculates the cascade schedule.
   */
  public static updateTask(currentData: JanttData, updatedTask: Task): JanttData {
    const defaultGap = currentData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
    const nextTasks = currentData.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
    const resolved = defaultPipeline.execute(nextTasks, { defaultGapDays: defaultGap }).tasks;
    return { ...currentData, tasks: resolved };
  }

  /**
   * Deletes a task by ID, cleans up any dangling dependency references in downstream tasks,
   * and recalculates the cascade schedule.
   */
  public static deleteTask(currentData: JanttData, taskId: string): JanttData {
    const defaultGap = currentData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
    const nextTasks = currentData.tasks.filter((t) => t.id !== taskId);
    nextTasks.forEach((t) => {
      const remaining = getTaskDependencies(t).filter((id) => id !== taskId);
      if (remaining.length === 0) {
        t.dependsOn = null;
      } else if (remaining.length === 1) {
        t.dependsOn = remaining[0];
      } else {
        t.dependsOn = remaining;
      }
    });
    const resolved = defaultPipeline.execute(nextTasks, { defaultGapDays: defaultGap }).tasks;
    return { ...currentData, tasks: resolved };
  }

  /**
   * Removes a single dependency edge between two tasks and cascades downstream dates.
   */
  public static removeDependency(currentData: JanttData, fromId: string, toId: string): JanttData {
    const targetTask = currentData.tasks.find((t) => t.id === toId);
    if (!targetTask) return currentData;

    const defaultGap = currentData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
    const currentDeps = getTaskDependencies(targetTask);
    const nextDeps = currentDeps.filter((id) => id !== fromId);
    const updatedTask = {
      ...targetTask,
      dependsOn: nextDeps.length === 0 ? null : nextDeps.length === 1 ? nextDeps[0] : nextDeps
    };
    const nextTasks = currentData.tasks.map((t) => (t.id === toId ? updatedTask : t));
    const resolved = defaultPipeline.execute(nextTasks, { defaultGapDays: defaultGap }).tasks;
    return { ...currentData, tasks: resolved };
  }
}
