import React from "react";
import {
  SortAsc,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  Calendar,
  Check
} from "lucide-react";
import {
  type JanttData,
  type Task,
  type Team,
  resolveTaskAssignee,
  syncTaskProgressAndStatus,
  sanitizeCssColor,
  isTaskDone
} from "@jantt/core";
import type {
  KanbanSortRule,
  KanbanSortField,
  DateFilterMode,
  CompletedFilterMode,
  EffectivePerson
} from "../../types";
import { isTaskMatchingPersonFilter, sortTasksByAssignee } from "../../utils";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";

/** Workflow statuses offered by every status control (Kanban and Tasks views). */
export const TASK_STATUS_OPTIONS = [
  { id: "not-started", label: "To Do" },
  { id: "in-progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "submitted", label: "In Review" },
  { id: "completed", label: "Completed" }
] as const;

export type WorkflowStatus = (typeof TASK_STATUS_OPTIONS)[number]["id"];

const KNOWN_STATUSES = new Set<string>(TASK_STATUS_OPTIONS.map((o) => o.id));

/** The status a select should show: aliases normalised, unknown values kept verbatim. */
export function getStatusValue(task: Task): string {
  const raw = typeof task.status === "string" ? task.status.trim() : "";
  if (!raw) return "not-started";
  if (raw === "done") return "completed";
  return raw;
}

/** The board column a task lives in: finished work wins, unknown statuses fall back to To Do. */
export function getKanbanColumn(task: Task): WorkflowStatus {
  if (isTaskDone(task)) return "completed";
  const status = getStatusValue(task);
  return KNOWN_STATUSES.has(status) ? (status as WorkflowStatus) : "not-started";
}

/** Returns `tasks` with one task moved to `status`, keeping progress consistent with it. */
export function applyTaskStatus(tasks: Task[], taskId: string, status: string): Task[] {
  return tasks.map((item) => {
    if (item.id !== taskId) return item;
    const next: Task = { ...item, ...syncTaskProgressAndStatus({ status }, item) };
    // Re-opening finished work must actually re-open it (core keeps 100% for these statuses).
    if (status !== "completed" && typeof next.progress === "number" && next.progress >= 1) {
      next.progress = 0.75;
    }
    return next;
  });
}

/** `color-mix` tint that is valid for any CSS color (hex of any length, names, rgb(), var()). */
export function tintColor(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

export function formatShortRange(start: string, end: string): string {
  const parse = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(value) || date.toISOString().slice(0, 10) !== value
      ? null
      : date;
  };
  const a = parse(start);
  const b = parse(end);
  if (!a || !b) return start === end ? start : `${start} - ${end}`;
  const fmt = (date: Date) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
  if (start === end) return fmt(a);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
    ? `${fmt(a).replace(/\s\d+$/, "")} ${a.getDate()}-${b.getDate()}`
    : `${fmt(a)}-${fmt(b)}`;
}

export interface TaskStatusSelectProps {
  task: Task;
  value: string;
  disabled?: boolean;
  optionPrefix?: string;
  onStatusChange: (status: string) => void;
}

/** Status dropdown shared by Kanban cards and both Tasks layouts. */
export const TaskStatusSelect: React.FC<TaskStatusSelectProps> = ({
  task,
  value,
  disabled = false,
  optionPrefix = "",
  onStatusChange
}) => (
  <select
    className="kanban-status-select"
    value={value}
    disabled={disabled}
    aria-label={`Status of ${task.label || task.name || task.id}`}
    title={disabled ? "Read-only: make a local copy to change status" : undefined}
    onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => e.stopPropagation()}
    onChange={(e) => {
      e.stopPropagation();
      if (e.target.value !== value) onStatusChange(e.target.value);
    }}
  >
    {!KNOWN_STATUSES.has(value) && (
      <option value={value} disabled>
        {value}
      </option>
    )}
    {TASK_STATUS_OPTIONS.map((opt) => (
      <option key={opt.id} value={opt.id}>
        {optionPrefix}
        {opt.label}
      </option>
    ))}
  </select>
);

/** Keyboard activation (Enter / Space) for clickable, non-button containers. */
export function onActivateKey(action: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };
}

interface KanbanViewProps {
  isMobile?: boolean;
  parsedData: JanttData;
  kanbanSortRules: KanbanSortRule[];
  setKanbanSortRules: (rules: KanbanSortRule[]) => void;
  kanbanMultiSort: (tasks: Task[]) => Task[];
  dateFilterMode: DateFilterMode;
  dateFilterBehavior: "dim" | "hide";
  completedFilterMode?: CompletedFilterMode;
  isTaskMatchingDateFilter: (task: Task) => boolean;
  effectivePeople: EffectivePerson[];
  teams: Team[];
  selectedPersonFilter?: string;
  openTaskDetailSidebar: (task: Task) => void;
  selectedMobileTaskId?: string | null;
  /** Must be the guarded plan commit (viewer / pending-login checks + undo snapshot). */
  handleChartCommit: (data: JanttData) => void;
  isViewer?: boolean;
  onPromptFork?: () => void;
}

const KANBAN_COLUMNS: ReadonlyArray<{ id: WorkflowStatus; label: string; shortLabel: string }> = [
  { id: "not-started", label: "To Do / Not Started", shortLabel: "To Do" },
  { id: "in-progress", label: "In Progress", shortLabel: "In Progress" },
  { id: "blocked", label: "Blocked", shortLabel: "Blocked" },
  { id: "submitted", label: "In Review / Submitted", shortLabel: "Review" },
  { id: "completed", label: "Completed", shortLabel: "Done" }
];

export const KanbanView: React.FC<KanbanViewProps> = ({
  isMobile = false,
  parsedData,
  kanbanSortRules,
  setKanbanSortRules,
  kanbanMultiSort,
  dateFilterMode,
  dateFilterBehavior,
  completedFilterMode = "show",
  isTaskMatchingDateFilter,
  effectivePeople,
  teams,
  selectedPersonFilter = "all",
  openTaskDetailSidebar,
  selectedMobileTaskId = null,
  handleChartCommit,
  isViewer = false,
  onPromptFork
}) => {
  const isPersonFiltering =
    selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:");
  const isPersonSorting = selectedPersonFilter === "sort:assignee";
  const hasActiveFilter = dateFilterMode !== "all" || isPersonFiltering;

  const isTaskMatchingPerson = (t: Task) =>
    isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams);

  const isTaskActiveMatch = (t: Task) =>
    isTaskMatchingDateFilter(t) && isTaskMatchingPerson(t);

  const [mobileActiveCol, setMobileActiveCol] = React.useState<string>(() => {
    const saved = storageService.getItem<{ mobileActiveCol?: string }>(STORAGE_KEYS.KANBAN_VIEW_STATE);
    return typeof saved?.mobileActiveCol === "string" && saved.mobileActiveCol ? saved.mobileActiveCol : "not-started";
  });
  React.useEffect(() => {
    storageService.setItem(STORAGE_KEYS.KANBAN_VIEW_STATE, { mobileActiveCol });
  }, [mobileActiveCol]);
  const [dragTaskId, setDragTaskId] = React.useState<string | null>(null);
  const [dropColumn, setDropColumn] = React.useState<WorkflowStatus | null>(null);

  const tasksByColumn = React.useMemo(() => {
    const groups = new Map<WorkflowStatus, Task[]>(KANBAN_COLUMNS.map((c) => [c.id, []]));
    for (const t of parsedData.tasks || []) {
      if (!t._deleted) groups.get(getKanbanColumn(t))!.push(t);
    }
    return groups;
  }, [parsedData.tasks]);

  const moveTask = (taskId: string, status: string) => {
    if (isViewer) {
      onPromptFork?.();
      return;
    }
    const task = (parsedData.tasks || []).find((t) => t.id === taskId && !t._deleted);
    if (!task || (getKanbanColumn(task) === status && getStatusValue(task) === status)) return;
    handleChartCommit({ ...parsedData, tasks: applyTaskStatus(parsedData.tasks, taskId, status) });
  };

  const endDrag = () => {
    setDragTaskId(null);
    setDropColumn(null);
  };

  const columns = KANBAN_COLUMNS.map((col) => {
    let colTasks = kanbanMultiSort(tasksByColumn.get(col.id) || []);
    if (isPersonSorting) {
      colTasks = sortTasksByAssignee(colTasks, effectivePeople, teams);
    }
    let visibleTasks = colTasks;
    if (hasActiveFilter && dateFilterBehavior === "hide") {
      visibleTasks = visibleTasks.filter(isTaskActiveMatch);
    }
    if (completedFilterMode === "filter") {
      visibleTasks = visibleTasks.filter((t) => !isTaskDone(t));
    }
    const matchingCount = colTasks.filter((t) => {
      if (completedFilterMode === "filter" && isTaskDone(t)) return false;
      return isTaskActiveMatch(t);
    }).length;
    const displayTotal =
      completedFilterMode === "filter" ? colTasks.filter((t) => !isTaskDone(t)).length : colTasks.length;
    return { col, visibleTasks, matchingCount, displayTotal };
  });

  return (
    <div className="kanban-outer-wrap">
      {/* Mobile Column Tab Switcher */}
      <div className="mobile-kanban-tabs">
        {columns.map(({ col, matchingCount, displayTotal }) => (
          <button
            key={col.id}
            type="button"
            className={`mobile-kanban-tab ${mobileActiveCol === col.id ? "is-active" : ""}`}
            onClick={() => {
              setMobileActiveCol(col.id);
              const el = document.getElementById(`kanban-col-${col.id}`);
              el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }}
          >
            <span>{col.shortLabel}</span>
            <span className="mobile-kanban-tab-count">{hasActiveFilter ? matchingCount : displayTotal}</span>
          </button>
        ))}
      </div>

      {/* Multi-Sort Bar */}
      <div className="kanban-sort-bar">
        <span className="kanban-sort-label">
          <SortAsc size={12} />
          {isMobile ? "Sort:" : "Sort by:"}
        </span>
        {kanbanSortRules.map((rule, idx) => (
          <div key={idx} className="kanban-sort-chip">
            <select
              className="kanban-sort-field-select"
              value={rule.field}
              aria-label={`Sort rule ${idx + 1} field`}
              onChange={(e) => {
                const updated = [...kanbanSortRules];
                updated[idx] = { ...rule, field: e.target.value as KanbanSortField };
                setKanbanSortRules(updated);
              }}
            >
              <option value="priority">Priority</option>
              <option value="start">Start Date</option>
              <option value="end">End Date</option>
              <option value="wbs">WBS</option>
              <option value="assignee">Assignee</option>
              <option value="progress">Progress</option>
              <option value="name">Task Name</option>
            </select>
            <button
              type="button"
              className="kanban-sort-dir-btn"
              title={rule.direction === "asc" ? "Ascending - click to reverse" : "Descending - click to reverse"}
              aria-label={`Sort rule ${idx + 1}: ${rule.direction === "asc" ? "ascending" : "descending"}, click to reverse`}
              onClick={() => {
                const updated = [...kanbanSortRules];
                updated[idx] = { ...rule, direction: rule.direction === "asc" ? "desc" : "asc" };
                setKanbanSortRules(updated);
              }}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              {rule.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            </button>
            {kanbanSortRules.length > 1 && (
              <button
                type="button"
                className="kanban-sort-remove-btn"
                title="Remove this sort rule"
                aria-label={`Remove sort rule ${idx + 1}`}
                onClick={() => setKanbanSortRules(kanbanSortRules.filter((_, i) => i !== idx))}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        {kanbanSortRules.length < 4 && (
          <button
            type="button"
            className="kanban-sort-add-btn"
            onClick={() => setKanbanSortRules([...kanbanSortRules, { field: "start", direction: "asc" }])}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <Plus size={11} />
            <span>{isMobile ? "Sort" : "Add Sort"}</span>
          </button>
        )}
      </div>

      {/* Kanban Columns */}
      <div className="kanban-view-container">
        {columns.map(({ col, visibleTasks, matchingCount, displayTotal }) => (
          <div
            key={col.id}
            id={`kanban-col-${col.id}`}
            className="kanban-column"
            role="group"
            aria-label={`${col.label} column`}
            style={
              dropColumn === col.id
                ? { outline: "2px dashed var(--jantt-accent)", outlineOffset: "-4px" }
                : undefined
            }
            onDragOver={(e) => {
              if (!dragTaskId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropColumn !== col.id) setDropColumn(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDropColumn((current) => (current === col.id ? null : current));
              }
            }}
            onDrop={(e) => {
              if (!dragTaskId) return;
              e.preventDefault();
              const taskId = dragTaskId;
              endDrag();
              moveTask(taskId, col.id);
            }}
          >
            <div className="kanban-col-header">
              <span className="kanban-col-title">{col.label}</span>
              <span className="kanban-col-count">
                {hasActiveFilter ? `${matchingCount}/${displayTotal}` : displayTotal}
              </span>
            </div>
            <div className="kanban-card-list">
              {visibleTasks.map((t) => {
                const cat = parsedData.categories?.[t.category];
                // Plan colors are untrusted (rooms, share links): never let url() beacons reach a style.
                const catColor = sanitizeCssColor(cat?.color, "var(--jantt-accent)");
                const isCompleted = isTaskDone(t);
                const isPersonMatch = isTaskMatchingPerson(t);
                const isDateMatch = isTaskMatchingDateFilter(t);
                const isFilterDimmed =
                  hasActiveFilter && dateFilterBehavior === "dim" && (!isPersonMatch || !isDateMatch);
                const isCompletedDimmed = completedFilterMode === "dim" && isCompleted;
                const isDimmed = isFilterDimmed || isCompletedDimmed;
                const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                const title = t.label || t.name || t.id;
                const teamColor = sanitizeCssColor(assigneeInfo.team?.color, "var(--jantt-accent)");
                const shortRange = formatShortRange(t.start, t.end);
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open details for ${title}`}
                    className={`kanban-card ${isMobile ? "is-mobile-card" : ""} ${isMobile && selectedMobileTaskId === t.id ? "is-mobile-selected" : ""} ${isCompleted ? "is-completed" : ""} ${isDimmed ? "kanban-card-dimmed" : ""}`}
                    style={{ ...(dragTaskId === t.id ? { opacity: 0.5 } : {}), ...(isMobile ? { borderLeftColor: catColor } : {}) }}
                    draggable={!isViewer}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragTaskId(t.id);
                    }}
                    onDragEnd={endDrag}
                    onClick={() => openTaskDetailSidebar(t)}
                    onKeyDown={onActivateKey(() => openTaskDetailSidebar(t))}
                  >
                    {isMobile ? <>
                      <div className="kanban-mobile-row-top">
                        {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                        <span className="kanban-mobile-title">{title}</span>
                        {t.priority && <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>}
                      </div>
                      <div className="kanban-mobile-row-bottom">
                        <span className="kanban-mobile-date">{shortRange}</span>
                        {t.assignee && <span className="kanban-mobile-avatar" style={{ background: assigneeInfo.avatarColor }}>{assigneeInfo.initials}</span>}
                        <span className="kanban-mobile-status-wrap"><TaskStatusSelect task={t} value={col.id} disabled={isViewer} optionPrefix="" onStatusChange={(status) => moveTask(t.id, status)} /></span>
                      </div>
                    </> : <>
                    <div className="kanban-card-top">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="kanban-cat-dot" style={{ background: catColor }} />
                        <span className="kanban-cat-label">{cat?.label || t.category}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {isDimmed && (
                          <span className="task-dimmed-tag" title="Task is dimmed by the active filters">
                            {isCompletedDimmed ? "Completed" : !isPersonMatch ? "Other Assignee" : "Outside Date"}
                          </span>
                        )}
                        {t.priority && (
                          <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>
                        )}
                      </div>
                    </div>
                    {/* WBS Number + Task Title */}
                    <div className="kanban-card-title-row">
                      {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                      <h4 className="kanban-card-title">{title}</h4>
                    </div>
                    <div className="kanban-card-meta">
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Calendar size={11} />
                        <span>{t.start} → {t.end}</span>
                      </div>
                      {t.assignee && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              background: assigneeInfo.avatarColor,
                              color: "#FFFFFF",
                              fontSize: "9px",
                              fontWeight: 700,
                              flexShrink: 0
                            }}
                          >
                            {assigneeInfo.initials}
                          </span>
                          <span>{assigneeInfo.displayName}</span>
                          {assigneeInfo.team && (
                            <span
                              style={{
                                fontSize: "9px",
                                fontWeight: 700,
                                background: tintColor(teamColor, 12),
                                color: teamColor,
                                padding: "1px 5px",
                                borderRadius: "4px"
                              }}
                            >
                              {assigneeInfo.team.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Progress: hide for completed, show checkmark */}
                    {isCompleted ? (
                      <div className="kanban-card-complete-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Check size={11} />
                        <span>Done</span>
                      </div>
                    ) : typeof t.progress === "number" && Number.isFinite(t.progress) ? (
                      <div className="kanban-card-prog-wrap">
                        <div
                          className="kanban-card-prog-bar"
                          style={{ width: `${Math.round(Math.min(1, Math.max(0, t.progress)) * 100)}%` }}
                        />
                      </div>
                    ) : null}
                    <div className="kanban-card-footer">
                      <TaskStatusSelect
                        task={t}
                        value={col.id}
                        disabled={isViewer}
                        optionPrefix="Move to: "
                        onStatusChange={(status) => moveTask(t.id, status)}
                      />
                    </div>
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
