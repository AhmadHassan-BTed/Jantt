import React from "react";
import { MoreTaskRows, usePhoneListPage } from "./PhoneListPage";
import { BoardCard, EditableBoardTitle } from "./BoardCard";
import { SearchQueryFilterStage } from "../../services/query/filters/search-query-filter-stage";
import { triggerHaptic } from "../../services/platform";
import { TaskPresenceTag } from "../cloud/RoomPresenceStack";
import type { RoomPresence } from "../../firebase/types";
import { Modal, ModalHeader, useMediaQuery } from "../modals/ModalHost";
import "./board-tasks.css";
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
export function applyTaskStatus(tasks: Task[], taskId: string | ReadonlySet<string>, status: string): Task[] {
  return tasks.map((item) => {
    if (item._deleted || (typeof taskId === "string" ? item.id !== taskId : !taskId.has(item.id))) return item;
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

const shortDateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const boardSearch = new SearchQueryFilterStage();

export function formatShortRange(start: string, end: string): string {
  const parse = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(value) || date.toISOString().slice(0, 10) !== value
      ? null
      : date;
  };
  const a = parse(start);
  const b = parse(end);
  if (!a || !b) return start === end ? start : `${start} - ${end}`;
  const fmt = (date: Date) => shortDateFormatter.format(date);
  if (start === end) return fmt(a);
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
    ? `${fmt(a).replace(/\s\d+$/, "")} ${a.getUTCDate()}–${b.getUTCDate()}`
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
  remotePresence?: RoomPresence[];
  searchQuery?: string;
  onQuickTask?: (status: WorkflowStatus) => void;
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
  remotePresence,
  searchQuery = "",
  onQuickTask,
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
    return KANBAN_COLUMNS.find(col => col.id === saved?.mobileActiveCol)?.id || "not-started";
  });
  React.useEffect(() => {
    storageService.setItem(STORAGE_KEYS.KANBAN_VIEW_STATE, { mobileActiveCol });
  }, [mobileActiveCol]);
  const [limitColumn, setLimitColumn] = React.useState<WorkflowStatus | null>(null);
  const [limitDraft, setLimitDraft] = React.useState("");
  const rawLimits = parsedData.meta?.kanbanWipLimits;
  const limits = rawLimits && typeof rawLimits === "object" ? rawLimits as Record<string, unknown> : {};
  const getLimit = (column: WorkflowStatus) => {
    const value = limits[column];
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  const isFoldable = useMediaQuery("(min-width: 600px) and (max-width: 840px) and (min-height: 520px)");
  const [focusedTask, setFocusedTask] = React.useState<string | null>(null);
  const focusRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (focusedTask) focusRef.current?.querySelector<HTMLButtonElement>(".is-board-focus .board-open-task")?.focus({ preventScroll: false });
  }, [focusedTask, mobileActiveCol]);
  const [moveAnnouncement, setMoveAnnouncement] = React.useState("");
  const [sortOpen, setSortOpen] = React.useState(false);
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
    const statusName = TASK_STATUS_OPTIONS.find(option => option.id === status)?.label || status;
    setMoveAnnouncement(`${task.label || task.name || task.id} moved to ${statusName}`);
    triggerHaptic(task.milestone && status === "completed" ? "success" : "light");
    handleChartCommit({ ...parsedData, tasks: applyTaskStatus(parsedData.tasks, taskId, status) });
  };

  const endDrag = () => {
    setDragTaskId(null);
    setDropColumn(null);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchContext = { dateFilterMode, selectedPersonFilter, effectivePeople, teams, completedFilterMode, searchQuery: normalizedQuery };
  const isVisible = (task: Task) => {
    if (completedFilterMode === "filter" && isTaskDone(task)) return false;
    if (hasActiveFilter && dateFilterBehavior === "hide" && !isTaskActiveMatch(task)) return false;
    return !normalizedQuery || boardSearch.matches(task, searchContext) ||
      (Array.isArray(task.tags) && task.tags.some(tag => typeof tag === "string" && tag.toLowerCase().includes(normalizedQuery)));
  };
  const sortColumn = (tasks: Task[]) => {
    const sorted = kanbanMultiSort(tasks);
    return isPersonSorting ? sortTasksByAssignee(sorted, effectivePeople, teams) : sorted;
  };

  const columns = KANBAN_COLUMNS.map((col) => {
    const colTasks = sortColumn(tasksByColumn.get(col.id) || []);
    const visibleTasks = colTasks.filter(isVisible);
    const matchingCount = colTasks.filter((t) => {
      if (completedFilterMode === "filter" && isTaskDone(t)) return false;
      return isTaskActiveMatch(t);
    }).length;
    const displayTotal =
      completedFilterMode === "filter" ? colTasks.filter((t) => !isTaskDone(t)).length : colTasks.length;
    // Existing sort rules determine where a moved card lands. Show that exact slot while dragging.
    let insertion = -1;
    if (dropColumn === col.id && dragTaskId) {
      const dragged = parsedData.tasks.find(task => task.id === dragTaskId && !task._deleted);
      if (dragged && getKanbanColumn(dragged) !== col.id) {
        const candidates = new Set(visibleTasks.map(task => task.id));
        candidates.add(dragged.id);
        const movedTasks = applyTaskStatus(parsedData.tasks.filter(task => candidates.has(task.id)), dragged.id, col.id);
        const preview = sortColumn(movedTasks).filter(isVisible);
        insertion = preview.findIndex(task => task.id === dragged.id);
      }
    }
    return { col, visibleTasks, matchingCount, displayTotal, insertion, count: colTasks.length };
  });

  const selectedColumn = columns.find(({ col }) => col.id === mobileActiveCol);
  const visibleColumnId = searchQuery.trim() && !selectedColumn?.visibleTasks.length
    ? columns.find(column => column.visibleTasks.length)?.col.id || mobileActiveCol
    : mobileActiveCol;
  const page = usePhoneListPage(JSON.stringify([visibleColumnId, searchQuery, dateFilterMode, selectedPersonFilter, completedFilterMode]), isMobile && !isFoldable);
  const placeholder = <div className="board-drop-slot" aria-hidden="true" />;
  return (
    <div className={`kanban-outer-wrap ${isMobile ? "phone-board" : ""}`}>
      <span role="status" className="board-sr-status">{moveAnnouncement}</span>
      {/* Mobile Column Tab Switcher */}
      <div className="mobile-kanban-tabs">
        {columns.map(({ col, matchingCount, displayTotal, visibleTasks }) => (
          <button
            key={col.id}
            type="button"
            className={`mobile-kanban-tab ${visibleColumnId === col.id ? "is-active" : ""}`}
            aria-pressed={visibleColumnId === col.id}
            disabled={Boolean(searchQuery.trim() && !visibleTasks.length)}
            onClick={() => setMobileActiveCol(col.id)}
          >
            <span>{col.shortLabel}</span>
            <span className="mobile-kanban-tab-count">{searchQuery.trim() ? visibleTasks.length : hasActiveFilter ? matchingCount : displayTotal}</span>
          </button>
        ))}
      </div>

      {/* Multi-Sort Bar */}
      {isMobile && <button type="button" className="board-sort-toggle" aria-expanded={sortOpen} onClick={() => setSortOpen(open => !open)}>
        <SortAsc size={15} />Sort{kanbanSortRules.length > 0 && <span>{kanbanSortRules.map(rule => rule.field).join(", ")}</span>}
      </button>}
      {(!isMobile || sortOpen) && <div className="kanban-sort-bar">
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
      </div>}

      {/* Kanban Columns */}
      <div className={isFoldable ? "board-split-layout" : "board-column-layout"}>
      {isFoldable && <aside className="board-master-list" aria-label="Board task list">
        {columns.flatMap(({ col, visibleTasks }) => visibleTasks.map(task =>
          <button key={task.id} type="button" aria-pressed={focusedTask === task.id}
            onClick={() => { setMobileActiveCol(col.id); setFocusedTask(task.id); }}>
            {task.label || task.name || task.id}<small>{col.shortLabel}</small>
          </button>
        ))}
      </aside>}
      <div className="kanban-view-container" ref={focusRef}>
        {columns.filter(({ col }) => (!isMobile && !isFoldable) || col.id === visibleColumnId).map(({ col, visibleTasks, matchingCount, displayTotal, insertion, count }) => (
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
              <span className="kanban-col-title">{col.shortLabel}</span>
              <button type="button" className={`kanban-col-count board-wip-limit ${getLimit(col.id) && count > getLimit(col.id)! ? "is-over" : ""}`}
                aria-label={`${col.shortLabel} work in progress limit, ${count} tasks, ${getLimit(col.id) ?? "unlimited"}`}
                title={getLimit(col.id) ? `${count} of ${getLimit(col.id)} WIP limit` : "Set work in progress limit"}
                disabled={isViewer} onClick={() => { setLimitDraft(String(getLimit(col.id) ?? "")); setLimitColumn(col.id); }}>
                {searchQuery.trim() ? visibleTasks.length : hasActiveFilter ? `${matchingCount}/${displayTotal}` : displayTotal}
                {getLimit(col.id) && <> / {getLimit(col.id)}{count > getLimit(col.id)! && " · over limit"}</>}
              </button>
              {!isViewer && onQuickTask && <button type="button" className="board-column-add" onClick={() => onQuickTask(col.id)} aria-label={`Quick task in ${col.shortLabel}`}>
                <Plus size={18} aria-hidden="true" />
              </button>}
            </div>
            <div className="kanban-card-list">
              {(visibleTasks.length > page.limit ? visibleTasks.slice(0, page.limit) : visibleTasks).map((t, index) => {
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
                const editableTitle = <EditableBoardTitle title={title} readOnly={isViewer} mobile={isMobile}
                  onSave={label => {
                    if (isViewer) return;
                    handleChartCommit({ ...parsedData, tasks: parsedData.tasks.map(item =>
                      item.id === t.id && !item._deleted ? { ...item, label } : item) });
                  }} />;
                return (
                  <React.Fragment key={t.id}>
                  {insertion === index && placeholder}
                  <BoardCard title={title} mobile={isMobile} readOnly={isViewer}
                    onSwipe={status => moveTask(t.id, status)} onOpen={() => openTaskDetailSidebar(t)}
                    className={`kanban-card ${isFoldable && focusedTask === t.id ? "is-board-focus" : ""} ${dragTaskId === t.id ? "is-dragging" : ""} ${isMobile ? "is-mobile-card" : ""} ${isMobile && selectedMobileTaskId === t.id ? "is-mobile-selected" : ""} ${isCompleted ? "is-completed" : ""} ${isDimmed ? "kanban-card-dimmed" : ""}`}
                    style={{ ...(dragTaskId === t.id ? { opacity: 0.5 } : {}), ...(isMobile ? { borderLeftColor: catColor } : {}) }}
                    draggable={!isViewer && !isMobile}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragTaskId(t.id);
                    }}
                    onDragEnd={endDrag}
                  >
                    {isMobile ? <>
                      <div className="kanban-mobile-row-top">
                        {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                        {editableTitle}
                        {t.priority && <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>}
                      </div>
                      <div className="kanban-mobile-row-bottom">
                        <span className="kanban-mobile-date">{shortRange}</span>
                        {t.assignee && <span className="task-person-avatar" style={{ borderColor: assigneeInfo.avatarColor }}>{assigneeInfo.initials}</span>}
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
                      {editableTitle}
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
                                color: "var(--jantt-text)",
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
                    <TaskPresenceTag users={remotePresence} taskId={t.id} />
                  </BoardCard>
                  </React.Fragment>
                );
              })}
              <MoreTaskRows count={visibleTasks.length} limit={page.limit} onMore={page.loadMore} />
              {insertion === visibleTasks.length && placeholder}
              {!visibleTasks.length && insertion < 0 && <p className="board-empty">{searchQuery.trim() ? "No matching tasks" : "No tasks in this column"}</p>}
            </div>
          </div>
        ))}
      </div>
      </div>
      {limitColumn && !isViewer && <Modal onClose={() => setLimitColumn(null)} maxWidth={360}>
        <ModalHeader title="Work in progress limit" />
        <form className="task-action-form" onSubmit={event => {
          event.preventDefault();
          const value = Number(limitDraft);
          if (limitDraft && (!Number.isSafeInteger(value) || value < 1)) return;
          const nextLimits = { ...limits };
          if (limitDraft) nextLimits[limitColumn] = value;
          else delete nextLimits[limitColumn];
          handleChartCommit({ ...parsedData, meta: { ...parsedData.meta, kanbanWipLimits: nextLimits } });
          setLimitColumn(null);
        }}>
          <label>{KANBAN_COLUMNS.find(col => col.id === limitColumn)?.shortLabel} column capacity
            <input data-autofocus type="number" min={1} step={1} placeholder="Unlimited" value={limitDraft}
              onChange={event => setLimitDraft(event.target.value)} />
          </label>
          <button className="btn-nav is-primary" type="submit">Save limit</button>
        </form>
      </Modal>}
    </div>
  );
};
