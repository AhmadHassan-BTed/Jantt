import React from "react";
import {
  DollarSign,
  TrendingUp,
  Zap,
  Clock,
  ArrowUp,
  ArrowDown,
  Check
} from "lucide-react";
import {
  type JanttData,
  type Task,
  type Team,
  resolveTaskAssignee,
  isTaskDone
} from "@jantt/core";
import type { SummarySortConfig, EffectivePerson } from "../types";

interface BudgetKpiViewProps {
  parsedData: JanttData;
  summaryKpiTasks: Task[];
  summarySortConfig: SummarySortConfig;
  setSummarySortConfig: React.Dispatch<React.SetStateAction<SummarySortConfig>>;
  handleSummarySort: (column: string) => void;
  sortedSummaryTasks: Task[];
  isTaskMatchingDateFilter: (task: Task) => boolean;
  effectivePeople: EffectivePerson[];
  teams: Team[];
}

export const BudgetKpiView: React.FC<BudgetKpiViewProps> = ({
  parsedData,
  summaryKpiTasks,
  summarySortConfig,
  setSummarySortConfig,
  handleSummarySort,
  sortedSummaryTasks,
  isTaskMatchingDateFilter,
  effectivePeople,
  teams
}) => {
  return (
    <div className="summary-view-container">
      <div className="summary-kpi-grid">
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: "var(--jantt-accent)" }}>
            <DollarSign size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Total Estimated Budget</span>
            <span className="kpi-value">
              ${summaryKpiTasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: "#10B981" }}>
            <TrendingUp size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Project Progress</span>
            <span className="kpi-value">
              {Math.round(
                (summaryKpiTasks.reduce((sum, t) => sum + (isTaskDone(t) ? 1 : (t.progress || 0)), 0) /
                  Math.max(summaryKpiTasks.length, 1)) *
                  100
              )}%
            </span>
          </div>
        </div>
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: "var(--jantt-today)" }}>
            <Zap size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Total Active Tasks</span>
            <span className="kpi-value">{summaryKpiTasks.length}</span>
          </div>
        </div>
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: "var(--jantt-critical)" }}>
            <Clock size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Milestones Tracked</span>
            <span className="kpi-value">{summaryKpiTasks.filter((t) => t.milestone).length}</span>
          </div>
        </div>
      </div>

      <div className="summary-breakdown-card">
        <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>
          Work Breakdown &amp; Category Distribution
          {summarySortConfig.column && (
            <span style={{ fontSize: "11px", fontWeight: 400, marginLeft: "10px", color: "var(--jantt-text-muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span>Sorted by {summarySortConfig.column}</span>
              {summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
              <button
                onClick={() => setSummarySortConfig({ column: "", direction: null })}
                style={{ marginLeft: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--jantt-accent)", fontSize: "11px" }}
              >Clear</button>
            </span>
          )}
        </h3>
        <table className="summary-table">
          <thead>
            <tr>
              {(["wbs", "name", "category", "assignee"] as const).map((col) => (
                <th key={col} className={`summary-th-sortable ${summarySortConfig.column === col ? "is-sorted" : ""}`} onClick={() => handleSummarySort(col)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span>{col === "wbs" ? "WBS" : col === "name" ? "Task Name" : col === "category" ? "Category" : "Assignee / Team"}</span>
                    {summarySortConfig.column === col && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </span>
                </th>
              ))}
              <th className={`summary-th-sortable ${summarySortConfig.column === "start" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("start")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Start</span>
                  {summarySortConfig.column === "start" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </span>
              </th>
              <th className={`summary-th-sortable ${summarySortConfig.column === "end" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("end")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>End</span>
                  {summarySortConfig.column === "end" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </span>
              </th>
              <th className={`summary-th-sortable ${summarySortConfig.column === "budget" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("budget")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Budget ($)</span>
                  {summarySortConfig.column === "budget" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </span>
              </th>
              <th className={`summary-th-sortable ${summarySortConfig.column === "status" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("status")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Status</span>
                  {summarySortConfig.column === "status" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </span>
              </th>
              <th className={`summary-th-sortable ${summarySortConfig.column === "progress" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("progress")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Progress</span>
                  {summarySortConfig.column === "progress" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedSummaryTasks.map((t) => {
              const cat = parsedData.categories?.[t.category];
              const isCompleted = isTaskDone(t);
              const effectiveProgress = isCompleted ? 1.0 : (t.progress ?? 0);
              const isDimmed = !isTaskMatchingDateFilter(t);
              const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
              return (
                <tr key={t.id} className={`${isCompleted ? "summary-row-completed" : ""} ${isDimmed ? "summary-row-dimmed" : ""}`.trim()}>
                  <td style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 700 }}>{t.wbs || "-"}</td>
                  <td style={{ fontWeight: 600, color: isCompleted ? "var(--jantt-text-muted)" : "inherit" }}>{t.label || t.name || t.id}</td>
                  <td>
                    <span className="jantt-label-dot" style={{ background: isCompleted ? "var(--jantt-bar-done, #64748B)" : (cat?.color || "var(--jantt-accent)"), display: "inline-block", marginRight: "6px" }} />
                    {cat?.label || t.category}
                  </td>
                  <td>
                    {t.assignee ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
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
                            fontWeight: 700,
                            flexShrink: 0
                          }}
                        >
                          {assigneeInfo.initials}
                        </span>
                        <span style={{ fontWeight: 500 }}>{assigneeInfo.displayName}</span>
                        {assigneeInfo.team && (
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: 600,
                              background: `${assigneeInfo.team.color || "var(--jantt-accent)"}1A`,
                              color: assigneeInfo.team.color || "var(--jantt-accent)",
                              padding: "1px 5px",
                              borderRadius: "4px"
                            }}
                          >
                            {assigneeInfo.team.name}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--jantt-text-muted)" }}>-</span>
                    )}
                  </td>
                  <td style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }}>{t.start}</td>
                  <td style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }}>{t.end}</td>
                  <td style={{ fontFamily: "var(--jantt-font-mono)" }}>
                    {t.estimatedCost ? `$${t.estimatedCost.toLocaleString()}` : "-"}
                  </td>
                  <td>
                    <span className={`kanban-prio-badge is-status-${(t.status || "not-started").replace("-", "")}`}>
                      {t.status || "not-started"}
                    </span>
                  </td>
                  <td>
                    {isCompleted ? (
                      <span className="progress-complete-badge" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <Check size={11} />
                        <span>100%</span>
                      </span>
                    ) : (
                      <div className="summary-progress-cell">
                        <div className="summary-mini-progress-bar">
                          <div className="summary-mini-progress-fill" style={{ width: `${Math.round(effectiveProgress * 100)}%` }} />
                        </div>
                        <span className="summary-progress-pct">{Math.round(effectiveProgress * 100)}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
