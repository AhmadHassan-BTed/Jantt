import { Task, getTodayISODate, isTaskOnDate, addDays } from "@jantt/core";
import { ITaskFilterStage, TaskQueryContext } from "../contracts";

export class DateFilterStage implements ITaskFilterStage {
  public readonly id = "date-filter";

  public matches(task: Task, context: TaskQueryContext): boolean {
    if (task._deleted) return false;
    const mode = context.dateFilterMode;

    if (mode === "all") return true;

    if (mode === "today") {
      return isTaskOnDate(task.start, task.end, getTodayISODate());
    }

    if (mode === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const distanceToMonday = (dayOfWeek + 6) % 7;
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      const weekStart = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
      const weekEnd = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
      return task.start <= weekEnd && task.end >= weekStart;
    }

    if (mode === "date") {
      if (!context.dateFilterValue) return true;
      return isTaskOnDate(task.start, task.end, context.dateFilterValue);
    }

    if (mode === "range") {
      const { dateFilterRangeStart, dateFilterRangeEnd } = context;
      if (!dateFilterRangeStart && !dateFilterRangeEnd) return true;
      const start = dateFilterRangeStart || (dateFilterRangeEnd ? addDays(dateFilterRangeEnd, -30) : "0000-01-01");
      const end = dateFilterRangeEnd || (dateFilterRangeStart ? addDays(dateFilterRangeStart, 30) : "9999-12-31");
      return task.start <= end && task.end >= start;
    }

    return true;
  }
}
