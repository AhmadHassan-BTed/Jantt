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

interface KanbanViewProps {
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
  handleChartCommit: (data: JanttData) => void;
}

export const KanbanView: React.FC<KanbanViewProps> = ({
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
  handleChartCommit
}) => {
  const isPersonFiltering =
    selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:");
  const isPersonSorting = selectedPersonFilter === "sort:assignee";
  const hasActiveFilter = dateFilterMode !== "all" || isPersonFiltering;

  const isTaskMatchingPerson = (t: Task) =>
    isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams);

  const isTaskActiveMatch = (t: Task) =>
    isTaskMatchingDateFilter(t) && isTaskMatchingPerson(t);
  return (
    <div className="kanban-outer-wrap">
      {/* Multi-Sort Bar */}
      <div className="kanban-sort-bar">
        <span className="kanban-sort-label">
          <SortAsc size={12} />
          Sort by:
        </span>
        {kanbanSortRules.map((rule, idx) => (
          <div key={idx} className="kanban-sort-chip">
            <select
              className="kanban-sort-field-select"
              value={rule.field}
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
              className="kanban-sort-dir-btn"
              title={rule.direction === "asc" ? "Ascending — click to reverse" : "Descending — click to reverse"}
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
                className="kanban-sort-remove-btn"
                title="Remove this sort rule"
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
            className="kanban-sort-add-btn"
            onClick={() => setKanbanSortRules([...kanbanSortRules, { field: "start", direction: "asc" }])}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <Plus size={11} />
            <span>Add Sort</span>
          </button>
        )}
      </div>

      {/* Kanban Columns */}
      <div className="kanban-view-container">
        {(
          [
            { id: "not-started", label: "To Do / Not Started" },
            { id: "in-progress", label: "In Progress" },
            { id: "submitted", label: "In Review / Submitted" },
            { id: "completed", label: "Completed" }
          ] as const
        ).map((col) => {
          let colTasks = kanbanMultiSort(
            (parsedData.tasks || []).filter((t) => !t._deleted).filter((t) => {
              if (col.id === "not-started") return !t.status || t.status === "not-started";
              return t.status === col.id;
            })
          );
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

          return (
            <div key={col.id} className="kanban-column">
              <div className="kanban-col-header">
                <span className="kanban-col-title">{col.label}</span>
                <span className="kanban-col-count">
                  {hasActiveFilter ? `${matchingCount}/${displayTotal}` : displayTotal}
                </span>
              </div>
              <div className="kanban-card-list">
                {visibleTasks.map((t) => {
                  const cat = parsedData.categories?.[t.category];
                  const catColor = cat?.color || "var(--jantt-accent)";
                  const isCompleted = isTaskDone(t);
                  const isPersonMatch = isTaskMatchingPerson(t);
                  const isDateMatch = isTaskMatchingDateFilter(t);
                  const isFilterDimmed =
                    hasActiveFilter && dateFilterBehavior === "dim" && (!isPersonMatch || !isDateMatch);
                  const isCompletedDimmed = completedFilterMode === "dim" && isCompleted;
                  const isDimmed = isFilterDimmed || isCompletedDimmed;
                  const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                  return (
                    <div
                      key={t.id}
                      className={`kanban-card ${isCompleted ? "is-completed" : ""} ${isDimmed ? "kanban-card-dimmed" : ""}`}
                      onClick={() => openTaskDetailSidebar(t)}
                    >
                      <div className="kanban-card-top">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className="kanban-cat-dot" style={{ background: catColor }} />
                          <span className="kanban-cat-label">{cat?.label || t.category}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          {isDimmed && (
                            <span className="task-dimmed-tag" title="Task falls outside active filter criteria">
                              {!isPersonMatch ? "Other Assignee" : "Outside Date"}
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
                        <h4 className="kanban-card-title">{t.label || t.name || t.id}</h4>
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
                                  background: `${assigneeInfo.team.color || "var(--jantt-accent)"}1F`,
                                  color: assigneeInfo.team.color || "var(--jantt-accent)",
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
                      ) : t.progress !== undefined && t.progress !== null ? (
                        <div className="kanban-card-prog-wrap">
                          <div className="kanban-card-prog-bar" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                        </div>
                      ) : null}
                      <div className="kanban-card-footer">
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
                          <option value="not-started">Move to: To Do</option>
                          <option value="in-progress">Move to: In Progress</option>
                          <option value="submitted">Move to: In Review</option>
                          <option value="completed">Move to: Completed</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
