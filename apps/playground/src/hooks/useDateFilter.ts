import { useState, useEffect, useMemo, useCallback } from "react";
import {
  type JanttData,
  type Task,
  type TimeScale,
  getTodayISODate,
  isTaskOnDate
} from "@jantt/core";
import type { DateFilterMode, ActiveView } from "../types";
import { STORAGE_KEYS } from "../constants";

interface UseDateFilterOptions {
  initialMode: DateFilterMode;
  parsedData: JanttData | null;
  activeView: ActiveView;
  currentScale?: TimeScale;
  currentDayWidth?: number;
}

export function useDateFilter({
  initialMode,
  parsedData,
  activeView,
  currentScale,
  currentDayWidth
}: UseDateFilterOptions) {
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>(initialMode);
  const [dateFilterValue, setDateFilterValue] = useState<string>(getTodayISODate());
  const [dateFilterRangeStart, setDateFilterRangeStart] = useState<string>("");
  const [dateFilterRangeEnd, setDateFilterRangeEnd] = useState<string>("");
  const [dateFilterBehavior, setDateFilterBehavior] = useState<"dim" | "hide">("dim");

  const handleSetRangeStart = useCallback((newStart: string) => {
    setDateFilterRangeStart(newStart);
    if (newStart && dateFilterRangeEnd && newStart > dateFilterRangeEnd) {
      setDateFilterRangeEnd(newStart);
    }
  }, [dateFilterRangeEnd]);

  const handleSetRangeEnd = useCallback((newEnd: string) => {
    setDateFilterRangeEnd(newEnd);
    if (newEnd && dateFilterRangeStart && newEnd < dateFilterRangeStart) {
      setDateFilterRangeStart(newEnd);
    }
  }, [dateFilterRangeStart]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DATE_FILTER_MODE, dateFilterMode);
    } catch {}
  }, [dateFilterMode]);

  const dateFilterActiveDate = useMemo(() => {
    if (dateFilterMode === "today") return getTodayISODate();
    if (dateFilterMode === "date") return dateFilterValue || null;
    if (dateFilterMode === "range") return dateFilterRangeStart || null;
    return null;
  }, [dateFilterMode, dateFilterValue, dateFilterRangeStart]);

  const isTaskMatchingDateFilter = useCallback(
    (task: Task): boolean => {
      if (dateFilterMode === "all") return true;
      if (dateFilterMode === "today") {
        return isTaskOnDate(task.start, task.end, getTodayISODate());
      }
      if (dateFilterMode === "week") {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const distanceToMonday = (dayOfWeek + 6) % 7;
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
        const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
        const weekStart = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
        const weekEnd = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
        return task.start <= weekEnd && task.end >= weekStart;
      }
      if (dateFilterMode === "date") {
        if (!dateFilterValue) return true;
        return isTaskOnDate(task.start, task.end, dateFilterValue);
      }
      if (dateFilterMode === "range") {
        if (!dateFilterRangeStart && !dateFilterRangeEnd) return true;
        const start = dateFilterRangeStart || "0000-01-01";
        const end = dateFilterRangeEnd || "9999-12-31";
        return task.start <= end && task.end >= start;
      }
      return true;
    },
    [dateFilterMode, dateFilterValue, dateFilterRangeStart, dateFilterRangeEnd]
  );

  const matchingTasksCount = useMemo(() => {
    if (!parsedData) return 0;
    return parsedData.tasks.filter(isTaskMatchingDateFilter).length;
  }, [parsedData, isTaskMatchingDateFilter]);

  const summaryKpiTasks = useMemo(() => {
    if (!parsedData) return [];
    if (dateFilterMode !== "all" && dateFilterBehavior === "hide") {
      return parsedData.tasks.filter(isTaskMatchingDateFilter);
    }
    return parsedData.tasks;
  }, [parsedData, dateFilterMode, dateFilterBehavior, isTaskMatchingDateFilter]);

  const dateFilterActiveSummary = useMemo(() => {
    if (dateFilterMode === "all") return null;
    const total = parsedData?.tasks.length || 0;
    const countText = `${matchingTasksCount} of ${total} tasks active`;
    if (dateFilterMode === "today") return { label: `Today (${getTodayISODate()})`, countText };
    if (dateFilterMode === "week") return { label: `This Week`, countText };
    if (dateFilterMode === "date") return { label: dateFilterValue || "Selected Date", countText };
    if (dateFilterMode === "range") {
      const from = dateFilterRangeStart || "Start";
      const to = dateFilterRangeEnd || "End";
      return { label: `${from} → ${to}`, countText };
    }
    return null;
  }, [dateFilterMode, dateFilterValue, dateFilterRangeStart, dateFilterRangeEnd, matchingTasksCount, parsedData]);

  // Apply Gantt date filter dimming via DOM after render
  useEffect(() => {
    const applyGanttDimming = () => {
      if (activeView !== "gantt" || dateFilterMode === "all" || dateFilterBehavior === "hide") {
        document.querySelectorAll<HTMLElement | SVGElement>("[data-task-id], [data-row-id], [data-grid-row-id], .jantt-dep-path").forEach((el) => {
          el.classList.remove("jantt-task-dimmed");
        });
        return;
      }

      document.querySelectorAll<HTMLElement>("[data-task-id], [data-row-id], [data-grid-row-id]").forEach((el) => {
        const taskId = el.dataset.taskId || el.dataset.rowId || el.dataset.gridRowId;
        const task = parsedData?.tasks.find((t) => t.id === taskId);
        if (task && !isTaskMatchingDateFilter(task)) {
          el.classList.add("jantt-task-dimmed");
        } else {
          el.classList.remove("jantt-task-dimmed");
        }
      });

      document.querySelectorAll<SVGElement>(".jantt-dep-path").forEach((path) => {
        const fromId = path.getAttribute("data-from");
        const toId = path.getAttribute("data-to");
        const fromTask = parsedData?.tasks.find((t) => t.id === fromId);
        const toTask = parsedData?.tasks.find((t) => t.id === toId);
        const isFromMatch = fromTask ? isTaskMatchingDateFilter(fromTask) : true;
        const isToMatch = toTask ? isTaskMatchingDateFilter(toTask) : true;
        if (!isFromMatch || !isToMatch) {
          path.classList.add("jantt-task-dimmed");
        } else {
          path.classList.remove("jantt-task-dimmed");
        }
      });
    };

    const handle = requestAnimationFrame(applyGanttDimming);
    const timer = window.setTimeout(applyGanttDimming, 60);
    return () => {
      cancelAnimationFrame(handle);
      window.clearTimeout(timer);
    };
  }, [
    activeView,
    currentScale,
    currentDayWidth,
    dateFilterMode,
    dateFilterValue,
    dateFilterBehavior,
    dateFilterRangeStart,
    dateFilterRangeEnd,
    parsedData,
    isTaskMatchingDateFilter
  ]);

  return {
    dateFilterMode,
    setDateFilterMode,
    dateFilterValue,
    setDateFilterValue,
    dateFilterRangeStart,
    setDateFilterRangeStart: handleSetRangeStart,
    dateFilterRangeEnd,
    setDateFilterRangeEnd: handleSetRangeEnd,
    dateFilterBehavior,
    setDateFilterBehavior,
    dateFilterActiveDate,
    isTaskMatchingDateFilter,
    matchingTasksCount,
    summaryKpiTasks,
    ganttFilteredTasks: summaryKpiTasks,
    dateFilterActiveSummary
  };
}
