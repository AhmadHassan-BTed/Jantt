import { useState, useMemo, useEffect, useCallback } from "react";
import {
  type JanttData,
  type Task,
  type Team,
  type ValidationResult,
  getTodayISODate,
  addDays,
  resolveSchedule,
  resolveTaskAssignee,
  validate,
  syncTaskProgressAndStatus
} from "@jantt/core";
import type {
  DateFilterMode,
  KanbanSortRule,
  SummarySortConfig,
  EffectivePerson
} from "../types";
import { PRIORITY_ORDER, STORAGE_KEYS } from "../constants";

interface UseTaskActionsOptions {
  parsedData: JanttData | null;
  setParsedData: (data: JanttData | null) => void;
  setJsonText: (text: string) => void;
  setValidationResult: (res: ValidationResult) => void;
  dateFilterMode: DateFilterMode;
  dateFilterBehavior: "dim" | "hide";
  isTaskMatchingDateFilter: (task: Task) => boolean;
  effectivePeople: EffectivePerson[];
  teams: Team[];
  initialKanbanSort: KanbanSortRule[];
  handleChartCommit?: (data: JanttData) => void;
}

export function useTaskActions({
  parsedData,
  setParsedData,
  setJsonText,
  setValidationResult,
  dateFilterMode,
  dateFilterBehavior,
  isTaskMatchingDateFilter,
  effectivePeople,
  teams,
  initialKanbanSort,
  handleChartCommit
}: UseTaskActionsOptions) {
  const [tasksViewMode, setTasksViewMode] = useState<"cards" | "todo">("cards");
  const [tasksSearchQuery, setTasksSearchQuery] = useState<string>("");
  const [summarySortConfig, setSummarySortConfig] = useState<SummarySortConfig>({ column: "", direction: null });
  const [kanbanSortRules, setKanbanSortRules] = useState<KanbanSortRule[]>(initialKanbanSort);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.KANBAN_SORT, JSON.stringify(kanbanSortRules));
    } catch {}
  }, [kanbanSortRules]);

  const sortedSummaryTasks = useMemo(() => {
    if (!parsedData) return [];
    let baseTasks = (parsedData.tasks || []).filter((t) => !t._deleted);
    if (dateFilterMode !== "all" && dateFilterBehavior === "hide") {
      baseTasks = baseTasks.filter(isTaskMatchingDateFilter);
    }
    // Apply universal status <-> progress auto-sync
    let tasks = baseTasks.map((t) => {
      const synced = syncTaskProgressAndStatus({ status: t.status, progress: t.progress }, t);
      return { ...t, ...synced };
    });
    if (!summarySortConfig.column || !summarySortConfig.direction) return tasks;
    const { column, direction } = summarySortConfig;
    const dir = direction === "asc" ? 1 : -1;
    return [...tasks].sort((a, b) => {
      let va: any, vb: any;
      switch (column) {
        case "wbs": va = a.wbs || ""; vb = b.wbs || ""; break;
        case "name": va = (a.label || a.name || a.id).toLowerCase(); vb = (b.label || b.name || b.id).toLowerCase(); break;
        case "category": va = a.category; vb = b.category; break;
        case "assignee": {
          const aInfo = resolveTaskAssignee(a, effectivePeople, teams);
          const bInfo = resolveTaskAssignee(b, effectivePeople, teams);
          va = aInfo.displayName.toLowerCase();
          vb = bInfo.displayName.toLowerCase();
          break;
        }
        case "start": va = a.start; vb = b.start; break;
        case "end": va = a.end; vb = b.end; break;
        case "budget": va = a.estimatedCost || 0; vb = b.estimatedCost || 0; break;
        case "status": va = a.status || "not-started"; vb = b.status || "not-started"; break;
        case "progress": va = a.progress ?? 0; vb = b.progress ?? 0; break;
        default: return 0;
      }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [parsedData, dateFilterMode, dateFilterBehavior, isTaskMatchingDateFilter, summarySortConfig, effectivePeople, teams]);

  const handleSummarySort = useCallback((column: string) => {
    setSummarySortConfig((prev) => {
      if (prev.column === column) {
        if (prev.direction === "asc") return { column, direction: "desc" };
        if (prev.direction === "desc") return { column: "", direction: null };
      }
      return { column, direction: "asc" };
    });
  }, []);

  const kanbanMultiSort = useCallback(
    (tasks: Task[]): Task[] => {
      if (kanbanSortRules.length === 0) return tasks;
      return [...tasks].sort((a, b) => {
        for (const rule of kanbanSortRules) {
          let va: any, vb: any;
          const dir = rule.direction === "asc" ? 1 : -1;
          switch (rule.field) {
            case "priority":
              va = PRIORITY_ORDER[a.priority || ""] || 0;
              vb = PRIORITY_ORDER[b.priority || ""] || 0;
              break;
            case "start": va = a.start; vb = b.start; break;
            case "end": va = a.end; vb = b.end; break;
            case "wbs": va = a.wbs || "zzz"; vb = b.wbs || "zzz"; break;
            case "assignee": {
              const aInfo = resolveTaskAssignee(a, effectivePeople, teams);
              const bInfo = resolveTaskAssignee(b, effectivePeople, teams);
              va = aInfo.displayName.toLowerCase();
              vb = bInfo.displayName.toLowerCase();
              break;
            }
            case "progress": va = a.progress ?? 0; vb = b.progress ?? 0; break;
            case "name": va = (a.label || a.name || "").toLowerCase(); vb = (b.label || b.name || "").toLowerCase(); break;
            default: continue;
          }
          const cmp = typeof va === "number" ? (va - vb) * dir : String(va).localeCompare(String(vb)) * dir;
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    },
    [kanbanSortRules, effectivePeople, teams]
  );

  const handleAddNewTask = useCallback(() => {
    if (!parsedData) return;
    const activeTasks = (parsedData.tasks || []).filter((t) => !t._deleted);
    const today = getTodayISODate();
    let lastEnd = today;
    if (activeTasks.length > 0) {
      lastEnd = activeTasks[activeTasks.length - 1].end || today;
    }
    const catKeys = Object.keys(parsedData.categories || {});
    const defaultCat = catKeys.length > 0 ? catKeys[0] : "general";
    const nextIdx = activeTasks.length + 1;
    const nowIso = new Date().toISOString();
    const peerId = (() => {
      try {
        let id = localStorage.getItem("jantt_peer_id");
        if (!id) {
          id = `peer-${Math.random().toString(36).slice(2, 8)}`;
          localStorage.setItem("jantt_peer_id", id);
        }
        return id;
      } catch {
        return "peer-serverless";
      }
    })();
    const compositeTs = `${nowIso}#${peerId}`;
    const newTask: Task = {
      id: `task-${Date.now().toString(36)}`,
      wbs: `${nextIdx}.0`,
      label: `New Task ${nextIdx}`,
      category: defaultCat,
      start: lastEnd,
      end: addDays(lastEnd, 7),
      progress: 0,
      status: "not-started",
      dependsOn: activeTasks.length > 0 ? activeTasks[activeTasks.length - 1].id : null,
      gapDays: parsedData.meta?.defaultGapDays ?? 2,
      fieldTimestamps: {
        label: compositeTs,
        start: compositeTs,
        end: compositeTs,
        progress: compositeTs,
        status: compositeTs,
        category: compositeTs,
        dependsOn: compositeTs
      },
      updatedAt: nowIso,
      updatedBy: peerId
    };

    const nextTasks = [...activeTasks, newTask];
    const resolved = resolveSchedule(nextTasks, parsedData.meta?.defaultGapDays ?? 2);
    const updated = {
      ...parsedData,
      meta: {
        ...parsedData.meta,
        updatedAt: nowIso
      },
      tasks: resolved
    };
    if (handleChartCommit) {
      handleChartCommit(updated);
    } else {
      setParsedData(updated);
      setJsonText(JSON.stringify(updated, null, 2));
      setValidationResult(validate(updated));
    }
  }, [parsedData, setParsedData, setJsonText, setValidationResult, handleChartCommit]);

  return {
    tasksViewMode,
    setTasksViewMode,
    tasksSearchQuery,
    setTasksSearchQuery,
    summarySortConfig,
    setSummarySortConfig,
    kanbanSortRules,
    setKanbanSortRules,
    sortedSummaryTasks,
    handleSummarySort,
    kanbanMultiSort,
    handleAddNewTask
  };
}
