import { useState, useEffect, useMemo, useCallback } from "react";
import {
  type JanttData,
  type Task,
  type Team,
  type TimeScale,
  getTodayISODate,
  isTaskDone
} from "@jantt/core";
import type { DateFilterMode, CompletedFilterMode, ActiveView, EffectivePerson } from "../types";
import { STORAGE_KEYS } from "../constants";
import { sortTasksByAssignee } from "../utils";
import { storageService } from "../services/storage";

/** Date value, range and Dim/Hide behaviour (the mode itself is persisted under STORAGE_KEYS.DATE_FILTER_MODE). */
const DATE_FILTER_DETAILS_KEY = "jantt_date_filter_details";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface DateFilterDetails {
  value: string;
  rangeStart: string;
  rangeEnd: string;
  behavior: "dim" | "hide";
}

function loadDateFilterDetails(): DateFilterDetails {
  const fallback: DateFilterDetails = { value: getTodayISODate(), rangeStart: "", rangeEnd: "", behavior: "dim" };
  try {
    const parsed = storageService.getItem<Partial<DateFilterDetails>>(DATE_FILTER_DETAILS_KEY);
    if (!parsed || typeof parsed !== "object") return fallback;
    const date = (v: unknown, def: string) => (typeof v === "string" && (v === "" || ISO_DATE.test(v)) ? v : def);
    return {
      value: date(parsed.value, fallback.value) || fallback.value,
      rangeStart: date(parsed.rangeStart, ""),
      rangeEnd: date(parsed.rangeEnd, ""),
      behavior: parsed.behavior === "hide" ? "hide" : "dim"
    };
  } catch {
    return fallback;
  }
}

/** Gantt elements that carry a task id (bars, label rows, grid rows). */
const TASK_ELEMENT_SELECTOR = "[data-task-id], [data-row-id], [data-grid-row-id]";
const DIMMED_CLASS = "jantt-task-dimmed";

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

import { DateFilterStage, AssigneeFilterStage } from "../services/query";

const dateFilterStage = new DateFilterStage();
const assigneeFilterStage = new AssigneeFilterStage();

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
  const [initialDetails] = useState(loadDateFilterDetails);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>(initialMode);
  const [dateFilterValue, setDateFilterValue] = useState<string>(initialDetails.value);
  const [dateFilterRangeStart, setDateFilterRangeStart] = useState<string>(initialDetails.rangeStart);
  const [dateFilterRangeEnd, setDateFilterRangeEnd] = useState<string>(initialDetails.rangeEnd);
  const [dateFilterBehavior, setDateFilterBehavior] = useState<"dim" | "hide">(initialDetails.behavior);
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
    storageService.setItem(STORAGE_KEYS.DATE_FILTER_MODE, dateFilterMode);
  }, [dateFilterMode]);

  useEffect(() => {
    storageService.setItem(STORAGE_KEYS.COMPLETED_FILTER_MODE, completedFilterMode);
  }, [completedFilterMode]);

  useEffect(() => {
    const details: DateFilterDetails = {
      value: dateFilterValue,
      rangeStart: dateFilterRangeStart,
      rangeEnd: dateFilterRangeEnd,
      behavior: dateFilterBehavior
    };
    storageService.setItem(DATE_FILTER_DETAILS_KEY, details);
  }, [dateFilterValue, dateFilterRangeStart, dateFilterRangeEnd, dateFilterBehavior]);

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
      return dateFilterStage.matches(task, {
        dateFilterMode,
        dateFilterValue,
        dateFilterRangeStart,
        dateFilterRangeEnd,
        selectedPersonFilter,
        completedFilterMode
      });
    },
    [dateFilterMode, dateFilterValue, dateFilterRangeStart, dateFilterRangeEnd, selectedPersonFilter, completedFilterMode]
  );

  const isTaskMatchingPerson = useCallback(
    (task: Task): boolean => {
      return assigneeFilterStage.matches(task, {
        dateFilterMode,
        selectedPersonFilter,
        effectivePeople,
        teams,
        completedFilterMode
      });
    },
    [selectedPersonFilter, effectivePeople, teams, dateFilterMode, completedFilterMode]
  );

  const isTaskMatchingActiveFilter = useCallback(
    (task: Task): boolean => {
      return isTaskMatchingDateFilter(task) && isTaskMatchingPerson(task);
    },
    [isTaskMatchingDateFilter, isTaskMatchingPerson]
  );

  const matchingTasksCount = useMemo(() => {
    if (!parsedData) return 0;
    return (parsedData.tasks || [])
      .filter((t) => !t._deleted)
      .filter((t) => {
        if (completedFilterMode === "filter" && isTaskDone(t)) return false;
        return isTaskMatchingActiveFilter(t);
      }).length;
  }, [parsedData, completedFilterMode, isTaskMatchingActiveFilter]);

  const summaryKpiTasks = useMemo(() => {
    if (!parsedData) return [];
    let tasks = (parsedData.tasks || []).filter((t) => !t._deleted);
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
    let tasks = (parsedData.tasks || []).filter((t) => !t._deleted);
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
    const total = (parsedData?.tasks || []).filter((t) => !t._deleted).length;
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

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of parsedData?.tasks || []) map.set(task.id, task);
    return map;
  }, [parsedData]);

  // Apply Gantt date/person dimming and completed dimming to the rendered chart.
  // Scoped to the chart container, O(elements) per pass, and re-applied when the engine
  // re-renders rows (virtualisation, zoom, edits) instead of relying on timers.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root: ParentNode = document.querySelector(".chart-container-card") || document;
    const isDateDimActive = hasActiveFilter && dateFilterBehavior === "dim";
    const isCompletedDimActive = completedFilterMode === "dim";

    if (activeView !== "gantt" || (!isDateDimActive && !isCompletedDimActive)) {
      root.querySelectorAll(`.${DIMMED_CLASS}`).forEach((el) => el.classList.remove(DIMMED_CLASS));
      return;
    }

    const dimCache = new Map<string, boolean>();
    const isDimmed = (taskId: string | null | undefined): boolean => {
      if (!taskId) return false;
      const cached = dimCache.get(taskId);
      if (cached !== undefined) return cached;
      const task = tasksById.get(taskId);
      const result = Boolean(
        task &&
          ((isDateDimActive && !isTaskMatchingActiveFilter(task)) || (isCompletedDimActive && isTaskDone(task)))
      );
      dimCache.set(taskId, result);
      return result;
    };

    const applyGanttDimming = () => {
      root.querySelectorAll<HTMLElement>(TASK_ELEMENT_SELECTOR).forEach((el) => {
        const taskId = el.dataset.taskId || el.dataset.rowId || el.dataset.gridRowId;
        el.classList.toggle(DIMMED_CLASS, isDimmed(taskId));
      });
      root.querySelectorAll<SVGElement>(".jantt-dep-path").forEach((path) => {
        const dim = isDimmed(path.getAttribute("data-from")) || isDimmed(path.getAttribute("data-to"));
        path.classList.toggle(DIMMED_CLASS, dim);
      });
    };

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyGanttDimming();
      });
    };
    schedule();
    // childList only: our own class toggles are attribute mutations and cannot retrigger this.
    const observer =
      typeof MutationObserver !== "undefined" && root !== document ? new MutationObserver(schedule) : null;
    observer?.observe(root as Node, { childList: true, subtree: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [
    activeView,
    currentScale,
    currentDayWidth,
    completedFilterMode,
    dateFilterBehavior,
    hasActiveFilter,
    tasksById,
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
