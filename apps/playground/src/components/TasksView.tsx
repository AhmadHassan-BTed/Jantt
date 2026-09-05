import React from "react";
import {
  CheckSquare,
  X,
  Kanban,
  ListTodo,
  Users,
  Plus,
  CheckCircle2,
  Calendar,
  Trash2,
  Check
} from "lucide-react";
import {
  type JanttData,
  type Task,
  type Team,
  resolveTaskAssignee,
  resolveTeamById,
  resolveSchedule,
  syncTaskProgressAndStatus,
  isTaskDone,
  getTaskDependencies
} from "@jantt/core";
import type { DateFilterMode, CompletedFilterMode, EffectivePerson } from "../types";
import { isTaskMatchingPersonFilter, sortTasksByAssignee } from "../utils";

interface TasksViewProps {
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
  openTaskDetailSidebar: (task: Task) => void;
  handleChartCommit: (data: JanttData) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
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
  openTaskDetailSidebar,
  handleChartCommit
}) => {
  const activeTasks = (parsedData.tasks || []).filter((t) => !t._deleted);
  const matchingDateFilterTasks = activeTasks.filter(isTaskMatchingDateFilter);

  const handleDeleteTask = React.useCallback(
    (taskIdToDelete: string) => {
      const active = (parsedData.tasks || []).filter((item) => item.id !== taskIdToDelete && !item._deleted);
      const pruned = active.map((item) => {
        const remaining = getTaskDependencies(item).filter((id) => id !== taskIdToDelete);
        return {
          ...item,
          dependsOn: remaining.length === 0 ? null : (remaining.length === 1 ? remaining[0] : remaining)
        };
      });
      const nowIso = new Date().toISOString();
      const tombstones = {
        ...(parsedData.meta?.tombstones || {}),
        [taskIdToDelete]: { deletedAt: nowIso, entityType: "task" }
      };
      const resolved = resolveSchedule(pruned, parsedData.meta?.defaultGapDays ?? 2);
      handleChartCommit({
        ...parsedData,
        meta: {
          ...parsedData.meta,
          tombstones
        },
        tasks: resolved
      });
    },
    [parsedData, handleChartCommit]
  );

  return (
    <div className="tasks-view-container">
      {/* Header with Title, Stats, Search, View Mode, Person Filter, Add Task */}
      <div className="tasks-view-header">
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
          {/* Search Filter */}
          <div className="tasks-search-wrap">
            <input
              type="text"
              className="tasks-search-input"
              placeholder="Search tasks, WBS, tags..."
              value={tasksSearchQuery}
              onChange={(e) => setTasksSearchQuery(e.target.value)}
            />
            {tasksSearchQuery && (
              <button
                className="tasks-search-clear"
                onClick={() => setTasksSearchQuery("")}
                title="Clear search"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Mode Selector: Cards vs Todo Checklist */}
          <div className="tasks-mode-group">
            <button
              className={`tasks-mode-btn ${tasksViewMode === "cards" ? "is-active" : ""}`}
              onClick={() => setTasksViewMode("cards")}
              title="Display as detailed task cards"
            >
              <Kanban size={12} />
              Cards
            </button>
            <button
              className={`tasks-mode-btn ${tasksViewMode === "todo" ? "is-active" : ""}`}
              onClick={() => setTasksViewMode("todo")}
              title="Display as interactive Todo checklist"
            >
              <ListTodo size={12} />
              Todo List
            </button>
          </div>

          {/* Person / Team Filter */}
          <div className="today-view-person-filter">
            <Users size={13} />
            <select
              className="today-person-select"
              value={selectedPersonFilter}
              onChange={(e) => setSelectedPersonFilter(e.target.value)}
            >
              <option value="all">All People &amp; Teams</option>
              <option value="sort:assignee">Sort by Assignee (A-Z)</option>
              {teams.length > 0 && (
                <optgroup label="Teams / Squads">
                  {teams.map((tm) => (
                    <option key={tm.id} value={`team:${tm.id}`}>
                      Team: {tm.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {effectivePeople.length > 0 && (
                <optgroup label="Team Members & Assignees">
                  {effectivePeople.map((p) => {
                    const pTeam = resolveTeamById(teams, p.teamId);
                    const count = activeTasks.filter((t) => t.assignee === p.name || t.assignee === p.id).length;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name}{count > 0 ? ` (${count} tasks)` : ""}{pTeam ? ` • ${pTeam.name}` : ""}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>

          {/* + Add Task Button */}
          <button
            className="btn-nav is-primary"
            style={{ padding: "5px 10px", borderRadius: "7px", fontSize: "11.5px" }}
            onClick={handleAddNewTask}
            title="Create a new task in this project"
          >
            <Plus size={12} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* Tasks Content: Checklist or Cards */}
      {(() => {
        let tasksToDisplay =
          dateFilterMode !== "all" && dateFilterBehavior === "hide"
            ? activeTasks.filter(isTaskMatchingDateFilter)
            : activeTasks;

        const isPersonFiltering =
          selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:");
        const isPersonSorting = selectedPersonFilter === "sort:assignee";

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

        if (tasksSearchQuery.trim()) {
          const q = tasksSearchQuery.toLowerCase();
          tasksToDisplay = tasksToDisplay.filter((t) =>
            (t.label || t.name || t.id).toLowerCase().includes(q) ||
            (t.wbs || "").toLowerCase().includes(q) ||
            (t.category || "").toLowerCase().includes(q) ||
            (t.assignee || "").toLowerCase().includes(q)
          );
        }

        if (tasksToDisplay.length === 0) {
          return (
            <div className="today-empty-state">
              <CheckCircle2 size={48} style={{ color: "#10B981" }} />
              <h3>All Clear!</h3>
              <p>
                No tasks matching your active filter criteria and search query.
                {(dateFilterMode !== "all" || completedFilterMode === "filter") && (
                  <button
                    className="date-filter-reset-btn"
                    style={{ marginTop: "12px", display: "inline-flex" }}
                    onClick={() => setDateFilterMode("all")}
                  >
                    Show All Tasks
                  </button>
                )}
              </p>
            </div>
          );
        }

        if (tasksViewMode === "todo") {
          return (
            <div className="tasks-todo-list">
              {tasksToDisplay.map((t) => {
                const cat = parsedData.categories?.[t.category];
                const catColor = cat?.color || "var(--jantt-accent)";
                const isCompleted = isTaskDone(t);
                const isPersonMatch = isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams);
                const isDateMatch = isTaskMatchingDateFilter(t);
                const isFilterDimmed =
                  dateFilterBehavior === "dim" && ((dateFilterMode !== "all" && !isDateMatch) || (isPersonFiltering && !isPersonMatch));
                const isCompletedDimmed = completedFilterMode === "dim" && isCompleted;
                const isDimmed = isFilterDimmed || isCompletedDimmed;
                const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                return (
                  <div
                    key={t.id}
                    className={`tasks-todo-row ${isCompleted ? "is-completed" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                    style={{ borderLeftColor: catColor }}
                    onClick={() => openTaskDetailSidebar(t)}
                  >
                    <div className="tasks-todo-left">
                      <button
                        className={`tasks-checkbox-btn ${isCompleted ? "is-checked" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus = isCompleted ? "in-progress" : "completed";
                          const synced = syncTaskProgressAndStatus({ status: nextStatus }, t);
                          const updatedTasks = parsedData.tasks.map((item) =>
                            item.id === t.id ? { ...item, ...synced } : item
                          );
                          handleChartCommit({ ...parsedData, tasks: updatedTasks });
                        }}
                        title={isCompleted ? "Mark as in progress" : "Mark as completed"}
                      >
                        {isCompleted ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <div style={{ width: 16, height: 16, border: "2px solid var(--jantt-border-strong)", borderRadius: 4 }} />
                        )}
                      </button>
                      <div className="tasks-todo-body">
                        <div className="tasks-todo-title-wrap">
                          {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                          <span className="kanban-cat-dot" style={{ background: catColor }} />
                          <span className="kanban-cat-label" style={{ fontSize: "11px" }}>{cat?.label || t.category}</span>
                          <span className={`tasks-todo-title ${isCompleted ? "is-struck" : ""}`}>
                            {t.label || t.name || t.id}
                          </span>
                          {isDimmed && (
                            <span className="task-dimmed-tag" title="Task falls outside active filter criteria">
                              {!isPersonMatch ? "Other Assignee" : "Outside Date"}
                            </span>
                          )}
                          {t.priority && (
                            <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>
                          )}
                        </div>
                        <div className="tasks-todo-meta">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <Calendar size={11} /> {t.start} → {t.end}
                          </span>
                          {t.assignee && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ width: 14, height: 14, borderRadius: "50%", background: assigneeInfo.avatarColor, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: 700 }}>
                                {assigneeInfo.initials}
                              </span>
                              <span>{assigneeInfo.displayName}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="tasks-todo-right">
                      <select
                        className="kanban-status-select"
                        value={t.status || "not-started"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const newStatus = e.target.value;
                          let newProgress = t.progress;
                          if (newStatus === "completed") newProgress = 1.0;
                          else if (newStatus === "submitted" && (t.progress ?? 0) < 0.75) newProgress = 0.75;
                          else if (newStatus === "not-started") newProgress = 0;
                          const updatedTasks = parsedData.tasks.map((item) =>
                            item.id === t.id ? { ...item, status: newStatus as any, progress: newProgress } : item
                          );
                          handleChartCommit({ ...parsedData, tasks: updatedTasks });
                        }}
                      >
                        <option value="not-started">To Do</option>
                        <option value="in-progress">In Progress</option>
                        <option value="submitted">Submitted</option>
                        <option value="completed">Completed</option>
                      </select>
                      <button
                        className="kanban-sort-remove-btn"
                        title="Delete task"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTask(t.id);
                        }}
                      >
                        <Trash2 size={13} style={{ color: "var(--jantt-text-muted)" }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // Otherwise Detailed Cards mode
        return (
          <div className="today-task-grid">
            {tasksToDisplay.map((t) => {
              const cat = parsedData.categories?.[t.category];
              const catColor = cat?.color || "var(--jantt-accent)";
              const isCompleted = isTaskDone(t);
              const isPersonMatch = isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams);
              const isDateMatch = isTaskMatchingDateFilter(t);
              const isFilterDimmed =
                dateFilterBehavior === "dim" && ((dateFilterMode !== "all" && !isDateMatch) || (isPersonFiltering && !isPersonMatch));
              const isCompletedDimmed = completedFilterMode === "dim" && isCompleted;
              const isDimmed = isFilterDimmed || isCompletedDimmed;
              const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
              return (
                <div
                  key={t.id}
                  className={`today-task-card ${isCompleted ? "is-completed" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                  style={{ borderTopColor: catColor }}
                  onClick={() => openTaskDetailSidebar(t)}
                >
                  <div className="today-card-header">
                    <div className="today-card-category">
                      <span className="kanban-cat-dot" style={{ background: catColor }} />
                      <span>{cat?.label || t.category}</span>
                      {isDimmed && (
                        <span className="task-dimmed-tag" title="Task is dimmed">
                          {isCompletedDimmed ? "Completed" : !isPersonMatch ? "Other Assignee" : "Outside Date"}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                      {t.priority && <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>}
                      <button
                        className={`tasks-card-check-btn ${isCompleted ? "is-checked" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus = isCompleted ? "in-progress" : "completed";
                          const synced = syncTaskProgressAndStatus({ status: nextStatus }, t);
                          const updatedTasks = parsedData.tasks.map((item) =>
                            item.id === t.id ? { ...item, ...synced } : item
                          );
                          handleChartCommit({ ...parsedData, tasks: updatedTasks });
                        }}
                      >
                        {isCompleted ? <Check size={11} /> : null}
                        <span>{isCompleted ? "Done" : "Check"}</span>
                      </button>
                    </div>
                  </div>
                  <h3 className="today-card-title">{t.label || t.name || t.id}</h3>
                  <div className="today-card-meta">
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Calendar size={11} /> {t.start} → {t.end}
                    </span>
                    {t.assignee && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            background: assigneeInfo.avatarColor,
                            color: "#FFFFFF",
                            fontSize: "10px",
                            fontWeight: 700
                          }}
                        >
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
                              background: `${assigneeInfo.team.color || "var(--jantt-accent)"}1F`,
                              color: assigneeInfo.team.color || "var(--jantt-accent)",
                              padding: "2px 6px",
                              borderRadius: "100px",
                              border: `1px solid ${assigneeInfo.team.color || "var(--jantt-accent)"}40`
                            }}
                          >
                            {assigneeInfo.team.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {isCompleted ? (
                    <div className="today-card-complete" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Check size={11} />
                      <span>Completed</span>
                    </div>
                  ) : (
                    <div className="today-card-progress">
                      <div className="today-prog-bar-wrap">
                        <div className="today-prog-bar-fill" style={{ width: `${Math.round((t.progress ?? 0) * 100)}%`, background: catColor }} />
                      </div>
                      <span className="today-prog-pct">{Math.round((t.progress ?? 0) * 100)}%</span>
                    </div>
                  )}
                  <div className="today-card-actions" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <select
                      className="kanban-status-select"
                      value={t.status || "not-started"}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        const newStatus = e.target.value;
                        const synced = syncTaskProgressAndStatus({ status: newStatus as any }, t);
                        const updatedTasks = parsedData.tasks.map((item) =>
                          item.id === t.id ? { ...item, ...synced } : item
                        );
                        handleChartCommit({ ...parsedData, tasks: updatedTasks });
                      }}
                    >
                      <option value="not-started">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="submitted">Submitted</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button
                      className="kanban-sort-remove-btn"
                      title="Delete task"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTask(t.id);
                      }}
                    >
                      <Trash2 size={13} style={{ color: "var(--jantt-text-muted)" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};
