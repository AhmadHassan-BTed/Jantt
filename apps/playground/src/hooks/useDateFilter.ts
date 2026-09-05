import { useState, useEffect, useMemo, useCallback } from "react";
import {
  type JanttData,
  type Task,
  type Team,
  type TimeScale,
  getTodayISODate,
  isTaskOnDate,
  isTaskDone
} from "@jantt/core";
import type { DateFilterMode, CompletedFilterMode, ActiveView, EffectivePerson } from "../types";
import { STORAGE_KEYS } from "../constants";
import { isTaskMatchingPersonFilter, sortTasksByAssignee } from "../utils";

interface UseDateFilterOptions {
  initialMode: DateFilterMode;
  initialCompletedMode?: CompletedFilterMode;
  parsedData: JanttData | null;
  activeView: ActiveView;
  currentScale?: TimeScale;
  currentDayWidth?: number;
  selectedPersonFilter?: string;
  effectivePeople?: EffectivePerson[];
  teams?: Team[];
}

export function useDateFilter({
  initialMode,
  initialCompletedMode = "show",
  parsedData,
  activeView,
  currentScale,
  currentDayWidth,
  selectedPersonFilter = "all",
  effectivePeople = [],
  teams = []
}: UseDateFilterOptions) {
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>(initialMode);
  const [dateFilterValue, setDateFilterValue] = useState<string>(getTodayISODate());
  const [dateFilterRangeStart, setDateFilterRangeStart] = useState<string>("");
  const [dateFilterRangeEnd, setDateFilterRangeEnd] = useState<string>("");
  const [dateFilterBehavior, setDateFilterBehavior] = useState<"dim" | "hide">("dim");
  const [completedFilterMode, setCompletedFilterMode] = useState<CompletedFilterMode>(initialCompletedMode);

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.COMPLETED_FILTER_MODE, completedFilterMode);
    } catch {}
  }, [completedFilterMode]);

  const dateFilterActiveDate = useMemo(() => {
    if (dateFilterMode === "today") return getTodayISODate();
    if (dateFilterMode === "date") return dateFilterValue || null;
    return null;
  }, [dateFilterMode, dateFilterValue]);

  const isPersonFiltering =
    selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:");
  const isPersonSorting = selectedPersonFilter === "sort:assignee";
  const hasActiveFilter = dateFilterMode !== "all" || isPersonFiltering;

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

  const isTaskMatchingPerson = useCallback(
    (task: Task): boolean => {
      return isTaskMatchingPersonFilter(task, selectedPersonFilter, effectivePeople, teams);
    },
    [selectedPersonFilter, effectivePeople, teams]
  );

  const isTaskMatchingActiveFilter = useCallback(
    (task: Task): boolean => {
      return isTaskMatchingDateFilter(task) && isTaskMatchingPerson(task);
    },
    [isTaskMatchingDateFilter, isTaskMatchingPerson]
  );

  const matchingTasksCount = useMemo(() => {
    if (!parsedData) return 0;
    return parsedData.tasks.filter((t) => {
      if (completedFilterMode === "filter" && isTaskDone(t)) return false;
      return isTaskMatchingActiveFilter(t);
    }).length;
  }, [parsedData, completedFilterMode, isTaskMatchingActiveFilter]);

  const summaryKpiTasks = useMemo(() => {
    if (!parsedData) return [];
    let tasks = parsedData.tasks;
    if (completedFilterMode === "filter") {
      tasks = tasks.filter((t) => !isTaskDone(t));
    }
    if (hasActiveFilter && dateFilterBehavior === "hide") {
      tasks = tasks.filter(isTaskMatchingActiveFilter);
    }
    return tasks;
  }, [parsedData, completedFilterMode, hasActiveFilter, dateFilterBehavior, isTaskMatchingActiveFilter]);

  const ganttFilteredTasks = useMemo(() => {
    if (!parsedData) return [];
    let tasks = parsedData.tasks;
    if (completedFilterMode === "filter") {
      tasks = tasks.filter((t) => !isTaskDone(t));
    }
    if (hasActiveFilter && dateFilterBehavior === "hide") {
      tasks = tasks.filter(isTaskMatchingActiveFilter);
    }
    if (isPersonSorting) {
      tasks = sortTasksByAssignee(tasks, effectivePeople, teams);
    }
    return tasks;
  }, [parsedData, completedFilterMode, hasActiveFilter, dateFilterBehavior, isTaskMatchingActiveFilter, isPersonSorting, effectivePeople, teams]);

  const dateFilterActiveSummary = useMemo(() => {
    if (dateFilterMode === "all" && !isPersonFiltering && completedFilterMode === "show") return null;
    const total = parsedData?.tasks.length || 0;
    const countText = `${matchingTasksCount} of ${total} tasks active`;
    let label = "";

    if (dateFilterMode === "today") label = `Today (${getTodayISODate()})`;
    else if (dateFilterMode === "week") label = `This Week`;
    else if (dateFilterMode === "date") label = dateFilterValue || "Selected Date";
    else if (dateFilterMode === "range") {
      const from = dateFilterRangeStart || "Start";
      const to = dateFilterRangeEnd || "End";
      label = `${from} → ${to}`;
    }

    if (isPersonFiltering) {
      const personName =
        teams.find((t) => `team:${t.id}` === selectedPersonFilter)?.name ||
        effectivePeople.find((p) => p.id === selectedPersonFilter)?.name ||
        selectedPersonFilter;
      label = label ? `${label} • ${personName}` : personName;
    }

    if (completedFilterMode === "filter") {
      label = label ? `${label} • Hide Completed` : "Hide Completed";
    } else if (completedFilterMode === "dim") {
      label = label ? `${label} • Dim Completed` : "Dim Completed";
    }

    return { label, countText };
  }, [
    dateFilterMode,
    dateFilterValue,
    dateFilterRangeStart,
    dateFilterRangeEnd,
    isPersonFiltering,
    selectedPersonFilter,
    completedFilterMode,
    matchingTasksCount,
    parsedData,
    teams,
    effectivePeople
  ]);

  // Apply Gantt date & person filter and completed dimming via DOM after render
  useEffect(() => {
    const applyGanttDimming = () => {
      const isDateDimActive = hasActiveFilter && dateFilterBehavior === "dim";
      const isCompletedDimActive = completedFilterMode === "dim";

      if (activeView !== "gantt" || (!isDateDimActive && !isCompletedDimActive)) {
        document.querySelectorAll<HTMLElement | SVGElement>("[data-task-id], [data-row-id], [data-grid-row-id], .jantt-dep-path").forEach((el) => {
          el.classList.remove("jantt-task-dimmed");
        });
        return;
      }

      document.querySelectorAll<HTMLElement>("[data-task-id], [data-row-id], [data-grid-row-id]").forEach((el) => {
        const taskId = el.dataset.taskId || el.dataset.rowId || el.dataset.gridRowId;
        const task = parsedData?.tasks.find((t) => t.id === taskId);
        if (!task) return;

        const isDateMismatch = isDateDimActive && !isTaskMatchingActiveFilter(task);
        const isCompletedDim = isCompletedDimActive && isTaskDone(task);

        if (isDateMismatch || isCompletedDim) {
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

        const isFromMismatch = isDateDimActive && fromTask && !isTaskMatchingActiveFilter(fromTask);
        const isToMismatch = isDateDimActive && toTask && !isTaskMatchingActiveFilter(toTask);
        const isFromCompletedDim = isCompletedDimActive && fromTask && isTaskDone(fromTask);
        const isToCompletedDim = isCompletedDimActive && toTask && isTaskDone(toTask);

        if (isFromMismatch || isToMismatch || isFromCompletedDim || isToCompletedDim) {
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
    completedFilterMode,
    dateFilterRangeStart,
    dateFilterRangeEnd,
    selectedPersonFilter,
    hasActiveFilter,
    parsedData,
    isTaskMatchingActiveFilter
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
    completedFilterMode,
    setCompletedFilterMode,
    dateFilterActiveDate,
    isTaskMatchingDateFilter,
    isTaskMatchingPerson,
    isTaskMatchingActiveFilter,
    hasActiveFilter,
    matchingTasksCount,
    summaryKpiTasks,
    ganttFilteredTasks,
    dateFilterActiveSummary
  };
}
