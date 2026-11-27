import React from "react";
import { MoreTaskRows, usePhoneListPage } from "./PhoneListPage";
import { TaskPresenceTag } from "../cloud/RoomPresenceStack";
import type { RoomPresence } from "../../firebase/types";
import { triggerHaptic } from "../../services/platform";
import { ChecklistActionDialog, checklistActions, type ChecklistAction, type TaskSelection } from "./ChecklistActionDialog";
import {
  CheckSquare,
  X,
  Kanban,
  ListTodo,
  Plus,
  CheckCircle2,
  Calendar,
  UserRound,
  Trash2,
  Check
} from "lucide-react";
import {
  type JanttData,
  type Task,
  type Team,
  resolveTaskAssignee,
  isTaskDone,
  filterDependsOn,
  sanitizeCssColor,
  type TaskIdLookup
} from "@jantt/core";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";
import { ResourceLevelingPanel } from "./ResourceLevelingPanel";
import type { DateFilterMode, CompletedFilterMode, EffectivePerson } from "../../types";
import { deleteTasks, getPeerId, isTaskMatchingPersonFilter, sortTasksByAssignee } from "../../utils";
import { TaskStatusSelect, applyTaskStatus, getStatusValue, tintColor, formatShortRange } from "./KanbanView";

interface TasksViewProps {
  remotePresence?: RoomPresence[];
  isMobile?: boolean;
  selectedMobileTaskId?: string | null;
  timeFormat?: "12h" | "24h";
  parsedData: JanttData;
  dateFilterMode: DateFilterMode;
  dateFilterBehavior: "dim" | "hide";
  completedFilterMode?: CompletedFilterMode;
  isTaskMatchingDateFilter: (task: Task) => boolean;
  tasksSearchQuery: string;
  setTasksSearchQuery: (q: string) => void;
  tasksViewMode: "cards" | "todo";
  setTasksViewMode: (mode: "cards" | "todo") => void;
  selectedPersonFilter: string;
  setSelectedPersonFilter: (filter: string) => void;
  teams: Team[];
  effectivePeople: EffectivePerson[];
  handleAddNewTask: () => void;
  setDateFilterMode: (mode: DateFilterMode) => void;
  setCompletedFilterMode?: (mode: CompletedFilterMode) => void;
  openTaskDetailSidebar: (task: Task) => void;
  /** Must be the guarded plan commit (viewer / pending-login checks + undo snapshot). */
  handleChartCommit: (data: JanttData) => void;
  isViewer?: boolean;
  onPromptFork?: () => void;
}

/**
 * Removes only the relations pointing at `removedId`, keeping every other link exactly as
 * written (types, lags, object or string form). Returns the same reference when nothing
 * changes so untouched tasks keep their sync timestamps. Pass the plan's task ids as
 * `knownIds` so ids such as "model-3d" are not misread as "model" with a lead.
 *
 * @deprecated Thin wrapper kept for existing callers; use core `filterDependsOn` directly.
 */
export function removeDependencyOn(
  dependsOn: Task["dependsOn"],
  removedId: string,
  knownIds?: TaskIdLookup
): Task["dependsOn"] {
  return filterDependsOn(dependsOn, (rel) => rel.id !== removedId, knownIds) as Task["dependsOn"];
}

const asLower = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value)).toLowerCase();

export const TasksView: React.FC<TasksViewProps> = ({
  isMobile = false,
  remotePresence,
  timeFormat = "12h",
  parsedData,
  dateFilterMode,
  dateFilterBehavior,
  completedFilterMode = "show",
  isTaskMatchingDateFilter,
  tasksSearchQuery,
  setTasksSearchQuery,
  tasksViewMode,
  setTasksViewMode,
  selectedPersonFilter,
  setSelectedPersonFilter,
  teams,
  effectivePeople,
  handleAddNewTask,
  setDateFilterMode,
  setCompletedFilterMode,
  openTaskDetailSidebar,
  selectedMobileTaskId = null,
  handleChartCommit,
  isViewer = false,
  onPromptFork
}) => {
  const page = usePhoneListPage(JSON.stringify([tasksViewMode, tasksSearchQuery, dateFilterMode, selectedPersonFilter, completedFilterMode]), isMobile);
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [selection, setSelection] = React.useState<TaskSelection | null>(null);
  const toggleSelected = (id: string) => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelection = () => {
    setSelecting(previous => !previous);
    setSelected(new Set());
  };
  const [showResourceLeveling, setShowResourceLeveling] = React.useState<boolean>(() => {
    const saved = storageService.getItem<{ showResourceLeveling?: boolean }>(STORAGE_KEYS.TASKS_VIEW_STATE);
    return Boolean(saved?.showResourceLeveling);
  });
  React.useEffect(() => {
    const prev = storageService.getItem<Record<string, unknown>>(STORAGE_KEYS.TASKS_VIEW_STATE) || {};
    storageService.setItem(STORAGE_KEYS.TASKS_VIEW_STATE, { ...prev, showResourceLeveling });
  }, [showResourceLeveling]);
  const activeTasks = (parsedData.tasks || []).filter((t) => !t._deleted);
  const matchingDateFilterTasks = activeTasks.filter(isTaskMatchingDateFilter);

  const isPersonFiltering =
    selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:");
  const isPersonSorting = selectedPersonFilter === "sort:assignee";
  const hasActiveConstraint =
    dateFilterMode !== "all" ||
    completedFilterMode === "filter" ||
    isPersonFiltering ||
    tasksSearchQuery.trim() !== "";

  const requestEdit = () => {
    if (isViewer) {
      onPromptFork?.();
      return false;
    }
    return true;
  };

  const handleStatusChange = (taskId: string, status: string) => {
    if (!requestEdit()) return;
    const task = parsedData.tasks.find(item => item.id === taskId);
    triggerHaptic(task?.milestone && status === "completed" ? "success" : "light");
    handleChartCommit({ ...parsedData, tasks: applyTaskStatus(parsedData.tasks, taskId, status) });
  };

  const handleToggleDone = (t: Task) => handleStatusChange(t.id, isTaskDone(t) ? "in-progress" : "completed");

  const deleteSelected = (ids: Set<string>) => {
    if (!requestEdit()) return;
    const deletedAt = `${new Date().toISOString()}#${getPeerId()}`;
    const result = deleteTasks(parsedData, ids, deletedAt);
    const kept = new Map(result.tasks.map(task => [task.id, task]));
    // Keep the soft-deleted rows in their original positions for legacy sync peers.
    const tasks = parsedData.tasks.map(task => kept.get(task.id) || { ...task, _deleted: true, deletedAt });
    handleChartCommit({ ...result, tasks });
    triggerHaptic("warning");
  };

  const handleDeleteTask = (task: Task) => {
    if (!requestEdit()) return;
    const label = task.label || task.name || task.id;
    if (window.confirm(`Delete task "${label}"? Links from other tasks to it will be removed.`)) deleteSelected(new Set([task.id]));
  };

  const resetAllConstraints = () => {
    setDateFilterMode("all");
    setCompletedFilterMode?.("show");
    if (isPersonFiltering) setSelectedPersonFilter("all");
    setTasksSearchQuery("");
  };

  const renderEmptyState = () => {
    if (activeTasks.length === 0) {
      return (
        <div className="today-empty-state">
          <ListTodo size={48} style={{ color: "var(--jantt-accent)" }} />
          <h3>No tasks yet</h3>
          <p>
            {isViewer
              ? "This shared plan has no tasks. Make a local copy to start planning."
              : "Add your first task to start planning this project."}
            <button
              type="button"
              className="date-filter-reset-btn"
              style={{ marginTop: "12px", display: "inline-flex" }}
              onClick={() => (isViewer ? onPromptFork?.() : handleAddNewTask())}
            >
              {isViewer ? "Make a Local Copy" : "Add Task"}
            </button>
          </p>
        </div>
      );
    }
    return (
      <div className="today-empty-state">
        <CheckCircle2 size={48} style={{ color: "#10B981" }} />
        <h3>No matching tasks</h3>
        <p>
          None of the {activeTasks.length} task{activeTasks.length === 1 ? "" : "s"} match the active filters and search.
          {hasActiveConstraint && (
            <button
              type="button"
              className="date-filter-reset-btn"
              style={{ marginTop: "12px", display: "inline-flex" }}
              onClick={resetAllConstraints}
            >
              Show All Tasks
            </button>
          )}
        </p>
      </div>
    );
  };

  return (
    <div className={`tasks-view-container ${isMobile ? "phone-checklist" : ""}`}>
      {/* Header with Title, Stats, Search, View Mode, Add Task (person filter lives in the filter bar) */}
      {isMobile ? (
        <div className="tasks-view-header is-mobile-compact">
          <span className="tasks-mobile-stats">{matchingDateFilterTasks.length} tasks • {matchingDateFilterTasks.filter((t) => isTaskDone(t)).length} done</span>
          <div className="tasks-mobile-controls">
            <div className="tasks-mode-group" role="group" aria-label="Task layout">
              <button type="button" className={`tasks-mode-btn ${tasksViewMode === "cards" ? "is-active" : ""}`} onClick={() => setTasksViewMode("cards")} aria-pressed={tasksViewMode === "cards"}>Cards</button>
              <button type="button" className={`tasks-mode-btn ${tasksViewMode === "todo" ? "is-active" : ""}`} onClick={() => setTasksViewMode("todo")} aria-pressed={tasksViewMode === "todo"}>List</button>
            </div>
            {tasksViewMode === "todo" && !isViewer && <button type="button" className="btn-nav" aria-label={selecting ? "Finish selection" : "Select tasks"} aria-pressed={selecting} onClick={toggleSelection}>
              {selecting ? "Done" : "Select"}
            </button>}
            <button type="button" className="btn-nav" onClick={() => setShowResourceLeveling((shown) => !shown)} aria-expanded={showResourceLeveling}>Level</button>
          </div>
        </div>
      ) : <div className="tasks-view-header">
        <div className="tasks-view-title-section">
          <CheckSquare size={22} style={{ color: "var(--jantt-accent)" }} />
          <div>
            <h2 className="tasks-view-title">Tasks &amp; Detailed Todo</h2>
            <span className="tasks-view-subtitle">
              {matchingDateFilterTasks.length} task{matchingDateFilterTasks.length === 1 ? "" : "s"}
              {dateFilterMode !== "all" ? " matching active date filter" : " in project"}
              {" • "}
              {matchingDateFilterTasks.filter((t) => isTaskDone(t)).length} completed
              {" • "}
              {matchingDateFilterTasks.filter((t) => t.status === "in-progress").length} in progress
            </span>
          </div>
        </div>

        <div className="tasks-view-toolbar">
          <button type="button" className="btn-nav" onClick={() => setShowResourceLeveling((shown) => !shown)} aria-expanded={showResourceLeveling}>Resource leveling</button>
          {/* Search Filter */}
          <div className="tasks-search-wrap">
            <input
              type="text"
              className="tasks-search-input"
              placeholder="Search tasks, WBS, tags..."
              aria-label="Search tasks"
              value={tasksSearchQuery}
              onChange={(e) => setTasksSearchQuery(e.target.value)}
            />
            {tasksSearchQuery && (
              <button
                type="button"
                className="tasks-search-clear"
                onClick={() => setTasksSearchQuery("")}
                title="Clear search"
                aria-label="Clear search"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Mode Selector: Cards vs Todo Checklist */}
          <div className="tasks-mode-group" role="group" aria-label="Task layout">
            <button
              type="button"
              className={`tasks-mode-btn ${tasksViewMode === "cards" ? "is-active" : ""}`}
              onClick={() => setTasksViewMode("cards")}
              aria-pressed={tasksViewMode === "cards"}
              title="Display as detailed task cards"
            >
              <Kanban size={12} />
              Cards
            </button>
            <button
              type="button"
              className={`tasks-mode-btn ${tasksViewMode === "todo" ? "is-active" : ""}`}
              onClick={() => setTasksViewMode("todo")}
              aria-pressed={tasksViewMode === "todo"}
              title="Display as interactive Todo checklist"
            >
              <ListTodo size={12} />
              Todo List
            </button>
          </div>

          {/* + Add Task Button */}
          {!isViewer && (
            <button
              type="button"
              className="btn-nav is-primary"
              style={{ padding: "5px 10px", borderRadius: "7px", fontSize: "11.5px" }}
              onClick={handleAddNewTask}
              title="Create a new task in this project"
            >
              <Plus size={12} />
              <span>Add Task</span>
            </button>
          )}
        </div>
      </div>}

      {showResourceLeveling && <ResourceLevelingPanel data={parsedData} onCommit={handleChartCommit} readOnly={isViewer} onPromptFork={onPromptFork} />}

      {/* Tasks Content: Checklist or Cards */}
      {(() => {
        let tasksToDisplay =
          dateFilterMode !== "all" && dateFilterBehavior === "hide"
            ? activeTasks.filter(isTaskMatchingDateFilter)
            : activeTasks;

        if (isPersonFiltering && dateFilterBehavior === "hide") {
          tasksToDisplay = tasksToDisplay.filter((t) =>
            isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams)
          );
        }

        if (isPersonSorting) {
          tasksToDisplay = sortTasksByAssignee(tasksToDisplay, effectivePeople, teams);
        }

        if (completedFilterMode === "filter") {
          tasksToDisplay = tasksToDisplay.filter((t) => !isTaskDone(t));
        }

        const q = tasksSearchQuery.trim().toLowerCase();
        if (q) {
          tasksToDisplay = tasksToDisplay.filter((t) =>
            asLower(t.label || t.name || t.id).includes(q) ||
            asLower(t.id).includes(q) ||
            asLower(t.wbs).includes(q) ||
            asLower(t.category).includes(q) ||
            asLower(t.assignee).includes(q) ||
            (Array.isArray(t.tags) && t.tags.some((tag) => asLower(tag).includes(q)))
          );
        }

        if (tasksToDisplay.length === 0) {
          return renderEmptyState();
        }

        const pageTasks = tasksToDisplay.length > page.limit ? tasksToDisplay.slice(0, page.limit) : tasksToDisplay;
        const moreRows = <MoreTaskRows count={tasksToDisplay.length} limit={page.limit} onMore={page.loadMore} />;
        const describeDim = (t: Task) => {
          const isCompleted = isTaskDone(t);
          const isPersonMatch = isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams);
          const isDateMatch = isTaskMatchingDateFilter(t);
          const isFilterDimmed =
            dateFilterBehavior === "dim" && ((dateFilterMode !== "all" && !isDateMatch) || (isPersonFiltering && !isPersonMatch));
          const isCompletedDimmed = completedFilterMode === "dim" && isCompleted;
          return {
            isCompleted,
            isDimmed: isFilterDimmed || isCompletedDimmed,
            dimReason: isCompletedDimmed ? "Completed" : isPersonFiltering && !isPersonMatch ? "Other Assignee" : "Outside Date"
          };
        };

        const renderDeleteButton = (t: Task) =>
          isViewer ? null : (
            <button
              type="button"
              className="kanban-sort-remove-btn"
              title="Delete task"
              aria-label={`Delete task ${t.label || t.name || t.id}`}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTask(t);
              }}
            >
              <Trash2 size={13} style={{ color: "var(--jantt-text-muted)" }} />
            </button>
          );

        if (tasksViewMode === "todo") {
          const marked = tasksToDisplay.filter(task => selected.has(task.id));
          return (
            <div className="tasks-todo-list">
              {!isViewer && (!isMobile || selecting) && <div className="checklist-selection-bar">
                {!isMobile && <button type="button" aria-pressed={selecting} onClick={toggleSelection}>{selecting ? "Done" : "Select tasks"}</button>}
                {selecting && <>
                  <button type="button" onClick={() => setSelected(marked.length === tasksToDisplay.length ? new Set() : new Set(tasksToDisplay.map(task => task.id)))}>
                    {marked.length === tasksToDisplay.length ? "Clear" : "Select all"}
                  </button>
                  <span aria-live="polite">{marked.length} selected</span>
                  <select aria-label="Bulk action" disabled={!marked.length} value="" onChange={event => {
                    setSelection({ action: event.target.value as ChecklistAction, ids: new Set(marked.map(task => task.id)) });
                  }}>
                    <option value="" disabled>Actions</option>
                    {Object.entries(checklistActions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </>}
              </div>}
              {pageTasks.map((t) => {
                const cat = parsedData.categories?.[t.category];
                const catColor = sanitizeCssColor(cat?.color, "var(--jantt-accent)");
                const { isCompleted, isDimmed, dimReason } = describeDim(t);
                const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                const title = t.label || t.name || t.id;
                const dateLabel = formatShortRange(t.start, t.end, timeFormat);
                const assigneeLabel = t.assignee ? [assigneeInfo.initials, assigneeInfo.displayName].join(" ") : "Unassigned";
                if (isMobile) return <div key={t.id} role="group" aria-label={title}
                  className={`tasks-todo-row phone-task-line ${isCompleted ? "is-completed" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                  style={{ borderLeftColor: catColor }}>
                  {selecting && !isViewer ? <label className="phone-task-check"><input type="checkbox" checked={selected.has(t.id)}
                    aria-label={`Select ${title}`} onChange={() => toggleSelected(t.id)} /></label> :
                    <button type="button" className="phone-task-check" disabled={isViewer} aria-pressed={isCompleted}
                      aria-label={`Mark ${title} as ${isCompleted ? "in progress" : "completed"}`} onClick={() => handleToggleDone(t)}>
                      {isCompleted ? <CheckCircle2 size={18} /> : <span className="phone-checkbox-outline" />}
                    </button>}
                  <button type="button" className="phone-task-title" aria-label={`Open details for ${title}`}
                    onClick={() => openTaskDetailSidebar(t)}>{title}</button>
                  <button type="button" className="phone-task-member" disabled={isViewer} aria-label={`${assigneeLabel}. Assign member to ${title}`}
                    title={assigneeInfo.displayName} onClick={() => setSelection({ action: "assignee", ids: new Set([t.id]) })}>
                    {t.assignee ? <span className="task-person-avatar" style={{ borderColor: assigneeInfo.avatarColor }}>{assigneeInfo.initials}</span> : <UserRound size={16} />}
                  </button>
                  <div className="phone-task-controls">
                    <button type="button" className="checklist-row-action" disabled={isViewer} aria-label={`${dateLabel}. Edit dates for ${title}`}
                      onClick={() => setSelection({ action: "dates", ids: new Set([t.id]) })}>
                      <Calendar size={13} /> {dateLabel}
                    </button>
                    <TaskStatusSelect task={t} value={getStatusValue(t)} disabled={isViewer} onStatusChange={status => handleStatusChange(t.id, status)} />
                  </div>
                  <TaskPresenceTag users={remotePresence} taskId={t.id} />
                </div>;
                return (
                  <div
                    key={t.id}
                    role="group"
                    aria-label={title}
                    className={`tasks-todo-row ${isMobile && selectedMobileTaskId === t.id ? "is-mobile-selected" : ""} ${isCompleted ? "is-completed" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                    style={{ borderLeftColor: catColor }}
                    onClick={event => {
                      if (!(event.target as HTMLElement).closest("button, input, select, label")) openTaskDetailSidebar(t);
                    }}
                  >
                    <div className="tasks-todo-left">
                      {selecting && !isViewer ? <label className="checklist-checkbox">
                        <input type="checkbox" checked={selected.has(t.id)} aria-label={`Select ${title}`} onChange={() => toggleSelected(t.id)} />
                      </label> :
                      <button
                        type="button"
                        className={`tasks-checkbox-btn ${isCompleted ? "is-checked" : ""}`}
                        disabled={isViewer}
                        aria-pressed={isCompleted}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleDone(t);
                        }}
                        title={isViewer ? "Read-only" : isCompleted ? "Mark as in progress" : "Mark as completed"}
                        aria-label={isCompleted ? `Mark ${title} as in progress` : `Mark ${title} as completed`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <div style={{ width: 16, height: 16, border: "2px solid var(--jantt-border-strong)", borderRadius: 4 }} />
                        )}
                      </button>}
                      <div className="tasks-todo-body">
                        <div className="tasks-todo-title-wrap">
                          {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                          <span className="kanban-cat-dot" style={{ background: catColor }} />
                          <span className="kanban-cat-label" style={{ fontSize: "11px" }}>{cat?.label || t.category}</span>
                          <button type="button" className={`tasks-todo-title checklist-open-task ${isCompleted ? "is-struck" : ""}`}
                            aria-label={`Open details for ${title}`} onClick={() => openTaskDetailSidebar(t)}>{title}</button>
                          {isDimmed && (
                            <span className="task-dimmed-tag" title="Task is dimmed by the active filters">
                              {dimReason}
                            </span>
                          )}
                          {t.priority && (
                            <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>
                          )}
                        </div>
                        <div className="tasks-todo-meta">
                          <button type="button" className="checklist-row-action" disabled={isViewer} aria-label={`${dateLabel}. Edit dates for ${title}`}
                            onClick={() => setSelection({ action: "dates", ids: new Set([t.id]) })}>
                            <Calendar size={13} /> {dateLabel}
                          </button>
                          <button type="button" className="checklist-row-action" disabled={isViewer} aria-label={`${assigneeLabel}. Assign member to ${title}`}
                            onClick={() => setSelection({ action: "assignee", ids: new Set([t.id]) })}>
                            {t.assignee ? <span className="task-person-avatar" style={{ borderColor: assigneeInfo.avatarColor }}>{assigneeInfo.initials}</span> : <UserRound size={13} />}
                            {t.assignee ? assigneeInfo.displayName : "Unassigned"}
                          </button>
                        </div>
                        <TaskPresenceTag users={remotePresence} taskId={t.id} />
                      </div>
                    </div>

                    <div className="tasks-todo-right">
                      <TaskStatusSelect
                        task={t}
                        value={getStatusValue(t)}
                        disabled={isViewer}
                        onStatusChange={(status) => handleStatusChange(t.id, status)}
                      />
                      {renderDeleteButton(t)}
                    </div>
                  </div>
                );
              })}
              {moreRows}
            </div>
          );
        }

        // Otherwise Detailed Cards mode
        return (
          <div className="today-task-grid">
            {pageTasks.map((t) => {
              const cat = parsedData.categories?.[t.category];
              const catColor = sanitizeCssColor(cat?.color, "var(--jantt-accent)");
              const { isCompleted, isDimmed, dimReason } = describeDim(t);
              const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
              const title = t.label || t.name || t.id;
              const teamColor = sanitizeCssColor(assigneeInfo.team?.color, "var(--jantt-accent)");
              const progressPct = Math.round(Math.min(1, Math.max(0, Number(t.progress) || 0)) * 100);
              return (
                <div
                  key={t.id}
                  role="group"
                  aria-label={title}
                  className={`${isMobile ? "today-card is-mobile-card" : "today-task-card"} ${isMobile && selectedMobileTaskId === t.id ? "is-mobile-selected" : ""} ${isCompleted ? "is-completed" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                  style={isMobile ? { borderLeftColor: catColor } : { borderTopColor: catColor }}
                  onClick={event => {
                    if (!(event.target as HTMLElement).closest("button, input, select, label")) openTaskDetailSidebar(t);
                  }}
                >
                  <TaskPresenceTag users={remotePresence} taskId={t.id} />
                  {isMobile ? <>
                  <div className="tasks-mobile-card-top">
                    <button type="button" className={`tasks-card-check-btn ${isCompleted ? "is-checked" : ""}`} disabled={isViewer} aria-pressed={isCompleted} aria-label={isCompleted ? "Mark as in progress" : "Mark as completed"} onClick={(e) => { e.stopPropagation(); handleToggleDone(t); }}>{isCompleted ? <Check size={11} /> : null}</button>
                    {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                    <h3 className="tasks-mobile-card-title"><button type="button" className="checklist-open-task" aria-label={`Open details for ${title}`}
                      onClick={() => openTaskDetailSidebar(t)}>{title}</button></h3>
                    {t.priority && <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>}
                  </div>
                  <div className="tasks-mobile-card-bottom">
                    <span className="kanban-mobile-date">{formatShortRange(t.start, t.end, timeFormat)}</span>
                    {t.assignee && <span className="task-person-avatar" style={{ borderColor: assigneeInfo.avatarColor }}>{assigneeInfo.initials}</span>}
                    <span className="tasks-mobile-prog-chip">{progressPct}%</span>
                    <TaskStatusSelect task={t} value={getStatusValue(t)} disabled={isViewer} onStatusChange={(status) => handleStatusChange(t.id, status)} />
                    {renderDeleteButton(t)}
                  </div>
                  </> : <>
                  <div className="today-card-header">
                    <div className="today-card-category">
                      <span className="kanban-cat-dot" style={{ background: catColor }} />
                      <span>{cat?.label || t.category}</span>
                      {isDimmed && (
                        <span className="task-dimmed-tag" title="Task is dimmed by the active filters">
                          {dimReason}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                      {t.priority && <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>}
                      {!isMobile && <button
                        type="button"
                        className={`tasks-card-check-btn ${isCompleted ? "is-checked" : ""}`}
                        disabled={isViewer}
                        aria-pressed={isCompleted}
                        title={isViewer ? "Read-only" : isCompleted ? "Mark as in progress" : "Mark as completed"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleDone(t);
                        }}
                      >
                        {isCompleted ? <Check size={11} /> : null}
                        <span>{isCompleted ? "Done" : "Check"}</span>
                      </button>}
                    </div>
                  </div>
                  <h3 className="today-card-title"><button type="button" className="checklist-open-task" aria-label={`Open details for ${title}`}
                    onClick={() => openTaskDetailSidebar(t)}>{title}</button></h3>
                  <div className="today-card-meta">
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Calendar size={11} /> {t.start} → {t.end}
                    </span>
                    {t.assignee && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                        <span className="task-person-avatar" style={{ borderColor: assigneeInfo.avatarColor }}>
                          {assigneeInfo.initials}
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--jantt-text)" }}>{assigneeInfo.displayName}</span>
                        {assigneeInfo.role && (
                          <span style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>({assigneeInfo.role})</span>
                        )}
                        {assigneeInfo.team && (
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: 700,
                              background: tintColor(teamColor, 12),
                              color: "var(--jantt-text)",
                              padding: "2px 6px",
                              borderRadius: "100px",
                              border: `1px solid ${tintColor(teamColor, 25)}`
                            }}
                          >
                            {assigneeInfo.team.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {!isMobile && (isCompleted ? (
                    <div className="today-card-complete" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Check size={11} />
                      <span>Completed</span>
                    </div>
                  ) : (
                    <div className="today-card-progress">
                      <div className="today-prog-bar-wrap">
                        <div className="today-prog-bar-fill" style={{ width: `${progressPct}%`, background: catColor }} />
                      </div>
                      <span className="today-prog-pct">{progressPct}%</span>
                    </div>
                  ))}
                  <div className={isMobile ? "task-card-mobile-actions" : "today-card-actions"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {isMobile && <button type="button" className={`tasks-card-check-btn ${isCompleted ? "is-checked" : ""}`} disabled={isViewer} aria-pressed={isCompleted} aria-label={isCompleted ? "Mark as in progress" : "Mark as completed"} onClick={(e) => { e.stopPropagation(); handleToggleDone(t); }}>{isCompleted ? <Check size={11} /> : null}</button>}
                    <TaskStatusSelect
                      task={t}
                      value={getStatusValue(t)}
                      disabled={isViewer}
                      onStatusChange={(status) => handleStatusChange(t.id, status)}
                    />
                    {renderDeleteButton(t)}
                  </div>
                  </>}
                </div>
              );
            })}
            {moreRows}
          </div>
        );
      })()}
      {selection && !isViewer && <ChecklistActionDialog selection={selection} plan={parsedData} people={effectivePeople}
        onCommit={handleChartCommit} onDelete={deleteSelected} onClose={() => setSelection(null)} />}
    </div>
  );
};
