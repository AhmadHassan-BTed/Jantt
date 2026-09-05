import React, { useState, useMemo } from "react";
import {
  ArrowUp,
  ArrowDown,
  Check,
  Clock,
  DollarSign,
  CheckCircle2,
  Layers,
  PlayCircle,
  AlertTriangle,
  Sparkles,
  BarChart3
} from "lucide-react";
import {
  type JanttData,
  type Task,
  type Team,
  resolveTaskAssignee,
  isTaskDone,
  calculateCriticalPath,
  calculateEVM,
  auditScheduleIntegrity,
  getTaskDependencies
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
  // Mode switcher: "essential" (simple/hobbyist/team lead) vs "advanced" (senior PM/EVM/audit)
  const [viewMode, setViewMode] = useState<"essential" | "advanced">("essential");
  const [quickFilter, setQuickFilter] = useState<"all" | "ready" | "blocked" | "bottleneck">("all");

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

  // Tasks ready to start (not done, and all prerequisites are 100% completed)
  const byId = useMemo(() => {
    const map = new Map<string, Task>();
    summaryKpiTasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [summaryKpiTasks]);

  const { readyTaskIds, blockedTaskIds } = useMemo(() => {
    const ready = new Set<string>();
    const blocked = new Set<string>();

    summaryKpiTasks.forEach((t) => {
      if (isTaskDone(t)) return;
      const deps = getTaskDependencies(t);
      if (deps.length === 0) {
        ready.add(t.id);
        return;
      }
      let allPrereqsDone = true;
      for (const dId of deps) {
        const prereq = byId.get(dId);
        if (!prereq || !isTaskDone(prereq)) {
          allPrereqsDone = false;
          break;
        }
      }
      if (allPrereqsDone) {
        ready.add(t.id);
      } else {
        blocked.add(t.id);
      }
    });

    return { readyTaskIds: ready, blockedTaskIds: blocked };
  }, [summaryKpiTasks, byId]);

  // Handle local buffer/float sorting and quick filtering
  const displayTasks = useMemo(() => {
    let tasks = [...sortedSummaryTasks];

    if (quickFilter === "ready") {
      tasks = tasks.filter((t) => readyTaskIds.has(t.id));
    } else if (quickFilter === "blocked") {
      tasks = tasks.filter((t) => blockedTaskIds.has(t.id));
    } else if (quickFilter === "bottleneck") {
      tasks = tasks.filter((t) => cpm.criticalTaskIds.has(t.id));
    }

    if (summarySortConfig.column === "buffer" && summarySortConfig.direction) {
      const dir = summarySortConfig.direction === "asc" ? 1 : -1;
      return tasks.sort((a, b) => {
        const floatA = cpm.metrics.get(a.id)?.totalFloat ?? 999;
        const floatB = cpm.metrics.get(b.id)?.totalFloat ?? 999;
        return (floatA - floatB) * dir;
      });
    }

    return tasks;
  }, [sortedSummaryTasks, summarySortConfig, cpm, quickFilter, readyTaskIds, blockedTaskIds]);

  return (
    <div className="summary-view-container">
      {/* SECTION SWITCHER: Clearly distinguishes Essential (Hobbyist) vs Advanced PM (Professional) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "18px",
          padding: "10px 14px",
          borderRadius: "8px",
          background: "var(--jantt-surface)",
          border: "1px solid var(--jantt-border)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--jantt-text)" }}>
            View Dashboard:
          </span>
          <div style={{ display: "inline-flex", background: "var(--jantt-bg)", padding: "2px", borderRadius: "6px", border: "1px solid var(--jantt-border)" }}>
            <button
              onClick={() => setViewMode("essential")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 12px",
                borderRadius: "4px",
                border: "none",
                background: viewMode === "essential" ? "var(--jantt-accent)" : "transparent",
                color: viewMode === "essential" ? "var(--jantt-accent-contrast, #FFFFFF)" : "var(--jantt-text-muted)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              <Sparkles size={13} />
              <span>Essential (Simple &amp; Visual)</span>
            </button>
            <button
              onClick={() => setViewMode("advanced")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 12px",
                borderRadius: "4px",
                border: "none",
                background: viewMode === "advanced" ? "var(--jantt-accent)" : "transparent",
                color: viewMode === "advanced" ? "var(--jantt-accent-contrast, #FFFFFF)" : "var(--jantt-text-muted)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              <BarChart3 size={13} />
              <span>Advanced PM (EVM &amp; Audit)</span>
            </button>
          </div>
        </div>

        {/* Status pill summary */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--jantt-text-muted)" }}>
          <span>Pace: <strong style={{ color: evm.scheduleStatus === "ahead" ? "#10B981" : evm.scheduleStatus === "behind" ? "#EF4444" : "inherit" }}>{evm.scheduleStatus}</strong></span>
          <span>•</span>
          <span>Spend: <strong style={{ color: evm.costStatus === "under-budget" ? "#10B981" : evm.costStatus === "over-budget" ? "#EF4444" : "inherit" }}>{evm.costStatus}</strong></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: ESSENTIAL MODE (For Everyday Hobbyists, Solo Devs & Management) */}
      {/* ========================================================================= */}
      {viewMode === "essential" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
          <div className="summary-kpi-grid">
            {/* Card 1: Time Countdown */}
            <div className="summary-kpi-card">
              <div className="kpi-icon-wrap" style={{ color: "var(--jantt-accent)" }}>
                <Clock size={20} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Time Remaining</span>
                <span className="kpi-value">{evm.daysRemaining} Days</span>
                <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                  Target Finish: {cpm.projectLateFinish || cpm.projectEarlyFinish}
                </span>
              </div>
            </div>

            {/* Card 2: Budget & Remaining Cash */}
            <div className="summary-kpi-card">
              <div className="kpi-icon-wrap" style={{ color: "#10B981" }}>
                <DollarSign size={20} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Budget &amp; Spend</span>
                <span className="kpi-value">${evm.bac.toLocaleString()}</span>
                <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                  Spent: ${evm.ac.toLocaleString()} • <strong>${Math.max(0, evm.bac - evm.ac).toLocaleString()} left</strong>
                </span>
              </div>
            </div>

            {/* Card 3: Overall Task Progress */}
            <div className="summary-kpi-card">
              <div className="kpi-icon-wrap" style={{ color: "#3B82F6" }}>
                <CheckCircle2 size={20} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Work Done</span>
                <span className="kpi-value">{evm.projectProgressPercent}%</span>
                <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                  {evm.taskCountCompleted} of {evm.taskCountTotal} tasks finished
                </span>
              </div>
            </div>

            {/* Card 4: Bottleneck Tasks (Zero Buffer) */}
            <div className="summary-kpi-card">
              <div className="kpi-icon-wrap" style={{ color: "var(--jantt-critical, #EF4444)" }}>
                <Layers size={20} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Bottleneck Tasks</span>
                <span className="kpi-value" style={{ color: "var(--jantt-critical, #EF4444)" }}>
                  {cpm.criticalTaskIds.size} Tasks
                </span>
                <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                  Zero buffer (delaying these delays project)
                </span>
              </div>
            </div>
          </div>

          {/* Quick Filter Action Bar for everyday productivity */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              padding: "10px 14px",
              borderRadius: "8px",
              background: "var(--jantt-surface)",
              border: "1px solid var(--jantt-border)"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--jantt-text-muted)", textTransform: "uppercase", marginRight: "4px" }}>
              Quick Filter:
            </span>
            <button
              onClick={() => setQuickFilter("all")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "5px",
                border: "1px solid var(--jantt-border)",
                background: quickFilter === "all" ? "var(--jantt-accent)" : "var(--jantt-bg)",
                color: quickFilter === "all" ? "var(--jantt-accent-contrast, #FFFFFF)" : "var(--jantt-text)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              All Tasks ({summaryKpiTasks.length})
            </button>
            <button
              onClick={() => setQuickFilter("ready")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "5px",
                border: "1px solid var(--jantt-border)",
                background: quickFilter === "ready" ? "#10B981" : "var(--jantt-bg)",
                color: quickFilter === "ready" ? "#FFFFFF" : "#10B981",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <PlayCircle size={12} />
              <span>Ready to Start ({readyTaskIds.size})</span>
            </button>
            <button
              onClick={() => setQuickFilter("blocked")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "5px",
                border: "1px solid var(--jantt-border)",
                background: quickFilter === "blocked" ? "#F59E0B" : "var(--jantt-bg)",
                color: quickFilter === "blocked" ? "#FFFFFF" : "#F59E0B",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <AlertTriangle size={12} />
              <span>Blocked Tasks ({blockedTaskIds.size})</span>
            </button>
            <button
              onClick={() => setQuickFilter("bottleneck")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "5px",
                border: "1px solid var(--jantt-border)",
                background: quickFilter === "bottleneck" ? "var(--jantt-critical, #EF4444)" : "var(--jantt-bg)",
                color: quickFilter === "bottleneck" ? "#FFFFFF" : "var(--jantt-critical, #EF4444)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <Layers size={12} />
              <span>Critical Bottlenecks ({cpm.criticalTaskIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: ADVANCED PM MODE (For Senior Technical PMs, EVM, & Audits)     */}
      {/* ========================================================================= */}
      {viewMode === "advanced" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
          {/* Advanced EVM Metrics Panel */}
          <EvmKpiCards evm={evm} cpm={cpm} />

          {/* Schedule Health & Integrity Diagnostic Card */}
          <ScheduleHealthCard audit={audit} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* WORK BREAKDOWN & METRICS TABLE (Adaptable to Active Mode)                 */}
      {/* ========================================================================= */}
      <div className="summary-breakdown-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>
            {viewMode === "essential" ? "Work Breakdown & Wiggle Room" : "Work Breakdown & Schedule Performance (CPM / Float)"}
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
          <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
            Showing {displayTasks.length} of {summaryKpiTasks.length} tasks
          </span>
        </div>

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
                  <span>{viewMode === "essential" ? "Wiggle Room" : "Total Float (Slack)"}</span>
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
              const isBlocked = blockedTaskIds.has(t.id);
              const isReady = readyTaskIds.has(t.id);

              return (
                <tr key={t.id} className={`${isCompleted ? "summary-row-completed" : ""} ${isDimmed ? "summary-row-dimmed" : ""}`.trim()}>
                  <td style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 700 }}>{t.wbs || "-"}</td>
                  <td style={{ fontWeight: 600, color: isCompleted ? "var(--jantt-text-muted)" : "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>{t.label || t.name || t.id}</span>
                      {isCrit && (
                        <span
                          title="Critical: Delaying this task directly delays the final completion date"
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
                      {isReady && !isCrit && (
                        <span
                          title="Ready: All prerequisites are done, can start now"
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: "#10B98120",
                            color: "#10B981",
                            border: "1px solid #10B98140"
                          }}
                        >
                          Ready
                        </span>
                      )}
                      {isBlocked && (
                        <span
                          title="Blocked: Waiting on one or more prerequisites"
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: "#F59E0B20",
                            color: "#F59E0B",
                            border: "1px solid #F59E0B40"
                          }}
                        >
                          Blocked
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
                      title={viewMode === "essential" ? `Can slip by ${tf} days without delaying the project deadline` : `Total Float: ${tf}d, Free Float: ${ff}d`}
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
                      {isCrit ? "0d (Bottleneck)" : tf < 0 ? `Overdue ${tf}d` : `${tf}d buffer`}
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
