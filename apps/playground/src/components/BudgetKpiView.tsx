import React, { useMemo } from "react";
import {
  ArrowUp,
  ArrowDown,
  Check
} from "lucide-react";
import {
  type JanttData,
  type Task,
  type Team,
  resolveTaskAssignee,
  isTaskDone,
  calculateCriticalPath,
  calculateEVM,
  auditScheduleIntegrity
} from "@jantt/core";
import type { SummarySortConfig, EffectivePerson } from "../types";
import { isTaskMatchingPersonFilter } from "../utils";
import { EvmKpiCards } from "./EvmKpiCards";
import { ScheduleHealthCard } from "./ScheduleHealthCard";

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
  selectedPersonFilter?: string;
  dateFilterBehavior?: "dim" | "hide";
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
  teams,
  selectedPersonFilter = "all",
  dateFilterBehavior = "dim"
}) => {
  // 1. Calculate Comprehensive Project Management Math
  const cpm = useMemo(() => {
    return calculateCriticalPath(summaryKpiTasks, {
      targetDate: parsedData.meta?.targetDate as string | undefined,
      defaultGapDays: parsedData.meta?.defaultGapDays
    });
  }, [summaryKpiTasks, parsedData.meta?.targetDate, parsedData.meta?.defaultGapDays]);

  const evm = useMemo(() => {
    return calculateEVM(summaryKpiTasks, {
      defaultGapDays: parsedData.meta?.defaultGapDays
    });
  }, [summaryKpiTasks, parsedData.meta?.defaultGapDays]);

  const audit = useMemo(() => {
    return auditScheduleIntegrity(summaryKpiTasks, cpm);
  }, [summaryKpiTasks, cpm]);

  // Handle local buffer/float sorting if requested
  const displayTasks = useMemo(() => {
    if (summarySortConfig.column === "buffer" && summarySortConfig.direction) {
      const dir = summarySortConfig.direction === "asc" ? 1 : -1;
      return [...sortedSummaryTasks].sort((a, b) => {
        const floatA = cpm.metrics.get(a.id)?.totalFloat ?? 999;
        const floatB = cpm.metrics.get(b.id)?.totalFloat ?? 999;
        return (floatA - floatB) * dir;
      });
    }
    return sortedSummaryTasks;
  }, [sortedSummaryTasks, summarySortConfig, cpm]);

  return (
    <div className="summary-view-container">
      {/* 1. Intuitive Project Pulse + Senior EVM Suite */}
      <EvmKpiCards evm={evm} cpm={cpm} />

      {/* 2. Schedule Health & Integrity Diagnostic Card */}
      <ScheduleHealthCard audit={audit} />

      {/* 3. Work Breakdown & Performance Table */}
      <div className="summary-breakdown-card">
        <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>
          Work Breakdown &amp; Performance Metrics
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
              <th className={`summary-th-sortable ${summarySortConfig.column === "buffer" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("buffer")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Buffer (Slack)</span>
                  {summarySortConfig.column === "buffer" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
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
            {displayTasks.map((t) => {
              const cat = parsedData.categories?.[t.category];
              const isCompleted = isTaskDone(t);
              const effectiveProgress = isCompleted ? 1.0 : (t.progress ?? 0);
              const isPersonMatch = isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams);
              const isDateMatch = isTaskMatchingDateFilter(t);
              const isPersonFiltering = selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:");
              const isDimmed =
                dateFilterBehavior === "dim" && ((!isDateMatch) || (isPersonFiltering && !isPersonMatch));
              const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);

              // CPM & Float metrics
              const scheduleMetrics = cpm.metrics.get(t.id);
              const isCrit = scheduleMetrics?.isCritical ?? false;
              const isNearCrit = scheduleMetrics?.isNearCritical ?? false;
              const tf = scheduleMetrics?.totalFloat ?? 0;
              const ff = scheduleMetrics?.freeFloat ?? 0;

              return (
                <tr key={t.id} className={`${isCompleted ? "summary-row-completed" : ""} ${isDimmed ? "summary-row-dimmed" : ""}`.trim()}>
                  <td style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 700 }}>{t.wbs || "-"}</td>
                  <td style={{ fontWeight: 600, color: isCompleted ? "var(--jantt-text-muted)" : "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>{t.label || t.name || t.id}</span>
                      {isCrit && (
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 800,
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: "var(--jantt-critical, #EF4444)20",
                            color: "var(--jantt-critical, #EF4444)",
                            border: "1px solid var(--jantt-critical, #EF4444)40",
                            textTransform: "uppercase"
                          }}
                        >
                          Critical
                        </span>
                      )}
                    </div>
                  </td>
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
                  <td>
                    <span
                      title={`Total Float: ${tf}d (Project Delay Threshold), Free Float: ${ff}d (Successor Delay Threshold)`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 700,
                        fontFamily: "var(--jantt-font-mono)",
                        color: isCrit ? "var(--jantt-critical, #EF4444)" : tf < 0 ? "#EF4444" : isNearCrit ? "#F59E0B" : "#10B981"
                      }}
                    >
                      {isCrit ? "0d (Critical)" : tf < 0 ? `Overdue ${tf}d` : `${tf}d buffer`}
                    </span>
                  </td>
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
