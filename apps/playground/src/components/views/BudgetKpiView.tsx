import React, { useState, useMemo, useEffect } from "react";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";
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
  BarChart3,
  Dice5,
  X,
  ChevronDown
} from "lucide-react";
import {
  type JanttData,
  type Task,
  type Team,
  type ScheduleHealthOptions,
  resolveTaskAssignee,
  isTaskDone,
  calculateCriticalPath,
  calculateEVM,
  auditScheduleIntegrity,
  diffDays,
  getTodayISODate,
  isValidISODate,
  sanitizeCssColor
} from "@jantt/core";
import type { SummarySortConfig, CompletedFilterMode, EffectivePerson } from "../../types";
import { isTaskMatchingPersonFilter } from "../../utils";
import { ResourceLevelingPanel } from "./ResourceLevelingPanel";
import "./health.css";
import { EvmKpiCards, formatMoney, getPlanCurrency } from "./EvmKpiCards";
import { ScheduleHealthCard } from "./ScheduleHealthCard";
import { EvmSCurveChart, computePlannedValueSeries } from "./EvmSCurveChart";
import { tintColor } from "./KanbanView";
const MonteCarloModal = React.lazy(() =>
  import("../modals/MonteCarloModal").then(module => ({ default: module.MonteCarloModal }))
);

interface BudgetKpiViewProps {
  isMobile?: boolean;
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
  completedFilterMode?: CompletedFilterMode;
  /**
   * Opens the Monte Carlo dialog hosted by the app shell (ModalHost), so it survives view
   * switches. Without it the view hosts the dialog itself.
   */
  onOpenMonteCarlo?: () => void;
  onCommit?: (data: JanttData) => void;
  readOnly?: boolean;
  onPromptFork?: () => void;
}

type QuickFilter = "all" | "ready" | "blocked" | "bottleneck";

const QUICK_FILTER_LABELS: Record<Exclude<QuickFilter, "all">, string> = {
  ready: "Ready to Start",
  blocked: "Blocked",
  bottleneck: "Critical Bottlenecks"
};

/**
 * Total-float label driven by the float value itself (never by the critical flag), so
 * negative float (target breached) and positive float on the least-float path stay visible.
 */
export function formatFloatLabel(totalFloat: number): string {
  if (totalFloat < 0) return `${Math.abs(totalFloat)}d past target`;
  if (totalFloat === 0) return "0d (Bottleneck)";
  return `${totalFloat}d buffer`;
}

function describeFloatForPeople(totalFloat: number): string {
  if (totalFloat < 0) {
    return `Planned to finish ${Math.abs(totalFloat)} day(s) after the target date unless it is recovered`;
  }
  if (totalFloat === 0) return "No slack: any delay to this task delays the project finish";
  return `Can slip by ${totalFloat} day(s) without delaying the project finish`;
}

const SORTABLE_COLUMNS: ReadonlyArray<{ id: string; label: (essential: boolean, currency: string) => string }> = [
  { id: "wbs", label: () => "WBS" },
  { id: "name", label: () => "Task Name" },
  { id: "category", label: () => "Category" },
  { id: "assignee", label: () => "Assignee / Team" },
  { id: "start", label: () => "Start" },
  { id: "end", label: () => "End" },
  { id: "buffer", label: (essential) => (essential ? "Wiggle Room" : "Total Float (Slack)") },
  { id: "budget", label: (_essential, currency) => `Budget (${currency})` },
  { id: "status", label: () => "Status" },
  { id: "progress", label: () => "Progress" }
];

export const BudgetKpiView: React.FC<BudgetKpiViewProps> = ({
  isMobile = false,
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
  dateFilterBehavior = "dim",
  completedFilterMode = "show",
  onCommit,
  readOnly = false,
  onPromptFork,
  onOpenMonteCarlo
}) => {
  // Mode switcher: "essential" (simple/hobbyist/team lead) vs "advanced" (senior PM/EVM/audit)
  const [viewMode, setViewMode] = useState<"essential" | "advanced">(() => {
    const saved = storageService.getItem<{ viewMode?: string }>(STORAGE_KEYS.SUMMARY_VIEW_STATE);
    return saved?.viewMode === "advanced" ? "advanced" : "essential";
  });
  const [taskLimit, setTaskLimit] = useState(40);
  const [showScenarios, setShowScenarios] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(() => {
    const saved = storageService.getItem<{ quickFilter?: QuickFilter }>(STORAGE_KEYS.SUMMARY_VIEW_STATE);
    return saved?.quickFilter || "all";
  });
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [expandedEssentialKeys, setExpandedEssentialKeys] = useState<Set<string>>(() => new Set(["time", "budget"]));
  const toggleEssentialKey = (key: string) => {
    setExpandedEssentialKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const prev = storageService.getItem<Record<string, unknown>>(STORAGE_KEYS.SUMMARY_VIEW_STATE) || {};
    storageService.setItem(STORAGE_KEYS.SUMMARY_VIEW_STATE, { ...prev, viewMode, quickFilter });
  }, [viewMode, quickFilter]);

  const currency = getPlanCurrency(parsedData);
  const money = (val: number) => formatMoney(val, currency);
  const rawTargetDate = parsedData.meta?.targetDate;
  const targetDate = typeof rawTargetDate === "string" && isValidISODate(rawTargetDate) ? rawTargetDate : undefined;

  // 1. Calculate Comprehensive Project Management Math on the full project schedule
  const allProjectTasks = useMemo(() => {
    return (parsedData.tasks || []).filter((t) => !t._deleted);
  }, [parsedData.tasks]);

  const cpm = useMemo(() => {
    return calculateCriticalPath(allProjectTasks, {
      targetDate,
      defaultGapDays: parsedData.meta?.defaultGapDays,
      calendar: parsedData.meta?.calendar,
      useWorkingDays: parsedData.meta?.useWorkingDays,
      calendars: parsedData.calendars,
      people: parsedData.people
    });
  }, [allProjectTasks, targetDate, parsedData.meta, parsedData.calendars, parsedData.people]);

  const evm = useMemo(() => calculateEVM(allProjectTasks), [allProjectTasks]);

  // DCMA float/duration thresholds are working days: measure them on the plan's calendar when it
  // schedules in working days (same rule as the cascade: explicit useWorkingDays wins, else a calendar).
  const planCalendar = parsedData.meta?.calendar;
  const usesWorkingDays = parsedData.meta?.useWorkingDays ?? Boolean(planCalendar);
  const planCalendars = parsedData.calendars;
  const healthOptions = useMemo<ScheduleHealthOptions | undefined>(() => {
    if (!usesWorkingDays) return undefined;
    // A string calendar may name an entry of `calendars` as well as a preset.
    const named = typeof planCalendar === "string" ? planCalendars?.[planCalendar] : undefined;
    return { calendar: named ?? planCalendar ?? "standard" };
  }, [usesWorkingDays, planCalendar, planCalendars]);

  const audit = useMemo(
    () => auditScheduleIntegrity(allProjectTasks, cpm, healthOptions),
    [allProjectTasks, cpm, healthOptions]
  );

  // Ready / blocked use the same definition as the EVM engine (whole plan, dangling links ignored),
  // so filters never flip a task's state and both dashboard modes report the same blockers.
  const { readyTaskIds, blockedTaskIds } = useMemo(() => {
    const ready = new Set<string>();
    const blocked = new Set<string>();
    for (const t of summaryKpiTasks) {
      if (isTaskDone(t)) continue;
      if (evm.taskMetrics.get(t.id)?.isBlocked) blocked.add(t.id);
      else ready.add(t.id);
    }
    return { readyTaskIds: ready, blockedTaskIds: blocked };
  }, [summaryKpiTasks, evm]);

  // The quick filter belongs to Essential mode; it never silently narrows the Advanced table.
  const activeQuickFilter: QuickFilter = viewMode === "essential" ? quickFilter : "all";

  // Handle local buffer/float sorting and quick filtering
  const displayTasks = useMemo(() => {
    // summaryKpiTasks is the single source of truth for visibility (date, person, completed filters).
    const visibleIds = new Set(summaryKpiTasks.map((t) => t.id));
    let tasks = sortedSummaryTasks.filter((t) => visibleIds.has(t.id));

    if (activeQuickFilter === "ready") {
      tasks = tasks.filter((t) => readyTaskIds.has(t.id));
    } else if (activeQuickFilter === "blocked") {
      tasks = tasks.filter((t) => blockedTaskIds.has(t.id));
    } else if (activeQuickFilter === "bottleneck") {
      tasks = tasks.filter((t) => cpm.criticalTaskIds.has(t.id));
    }

    if (completedFilterMode === "filter") {
      tasks = tasks.filter((t) => !isTaskDone(t));
    }

    if (summarySortConfig.column === "buffer" && summarySortConfig.direction) {
      const dir = summarySortConfig.direction === "asc" ? 1 : -1;
      return [...tasks].sort((a, b) => {
        const floatA = cpm.metrics.get(a.id)?.totalFloat ?? 999;
        const floatB = cpm.metrics.get(b.id)?.totalFloat ?? 999;
        return (floatA - floatB) * dir;
      });
    }

    return tasks;
  }, [sortedSummaryTasks, summaryKpiTasks, summarySortConfig, cpm, activeQuickFilter, completedFilterMode, readyTaskIds, blockedTaskIds]);

  // Time remaining is counted to the date that is shown (forecast finish), with the target alongside.
  const today = getTodayISODate();
  const forecastFinish = cpm.projectEarlyFinish;
  const daysToForecast = forecastFinish ? Math.max(0, diffDays(today, forecastFinish)) : 0;
  const daysLateVsTarget = forecastFinish && targetDate ? diffDays(targetDate, forecastFinish) : 0;

  const budgetTrend = useMemo(() => {
    if (!isMobile || viewMode !== "essential" || evm.bac <= 0) return null;
    const series = computePlannedValueSeries(allProjectTasks);
    if (!series || !series.bac) return null;
    return series.points.map(point => `${point.dayIndex / series.totalDays * 100},${23 - point.pv / series.bac * 21}`).join(" ");
  }, [allProjectTasks, evm.bac, viewMode, isMobile]);

  const pathSpan = useMemo(() => {
    let longest = 0;
    for (const path of cpm.criticalPaths) {
      const first = cpm.metrics.get(path[0]), last = cpm.metrics.get(path[path.length - 1]);
      if (first && last) longest = Math.max(longest, diffDays(first.earlyStart, last.earlyFinish));
    }
    return longest;
  }, [cpm]);

  const slip = useMemo(() => {
    const delays = allProjectTasks.flatMap(task => {
      if (!task.baseline?.end || !isValidISODate(task.baseline.end) || !isValidISODate(task.end)) return [];
      const days = diffDays(task.baseline.end, task.end);
      return days > 0 ? [{ days, label: task.label || task.name || task.id }] : [];
    }).sort((a, b) => b.days - a.days);
    if (!delays.length) return null;
    const top = delays.slice(0, 3);
    const pct = Math.round(100 * top.reduce((sum, item) => sum + item.days, 0) / delays.reduce((sum, item) => sum + item.days, 0));
    return { top, pct };
  }, [allProjectTasks]);
  const isOverBudget = evm.bac > 0 && evm.ac > evm.bac;
  // Actual cost is unknown (not $0) when no task reports one, and cost performance is measured
  // only on budgeted tasks that report an actual cost (the same rule as the EVM cards).
  const isActualCostKnown = evm.costCoverage > 0 || evm.ac > 0;
  const isCostMeasured = evm.costDataAvailable && evm.costCoverage > 0;
  const spentPercent = evm.bac > 0 && Number.isFinite(evm.ac) ? Math.round((evm.ac / evm.bac) * 100) : 0;
  const openMonteCarlo = onOpenMonteCarlo ?? (() => setShowMonteCarlo(true));

  const quickFilterButton = (id: QuickFilter, label: React.ReactNode, color: string, activeBg: string) => (
    <button
      type="button"
      onClick={() => setQuickFilter(id)}
      aria-pressed={quickFilter === id}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 10px",
        borderRadius: "5px",
        border: "1px solid var(--jantt-border)",
        background: quickFilter === id ? activeBg : "var(--jantt-bg)",
        color: quickFilter === id ? "var(--jantt-accent-contrast, #FFFFFF)" : color,
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer"
      }}
    >
      {label}
    </button>
  );

  return (
    <div className={`summary-view-container ${isMobile ? "handheld-health" : ""}`}>
      {/* SECTION SWITCHER: Clearly distinguishes Essential (Hobbyist) vs Advanced PM (Professional) */}
      <div className="summary-mode-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          {!isMobile && (
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--jantt-text)" }}>
              View Dashboard:
            </span>
          )}
          <div className="summary-mode-tabs" role="group" aria-label="Dashboard detail level">
            {(["essential", "advanced"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={`summary-mode-tab ${viewMode === mode ? "is-active" : ""}`}
              >
                {mode === "essential" ? <Sparkles size={13} /> : <BarChart3 size={13} />}
                <span>{isMobile ? (mode === "essential" ? "Essential" : "Advanced PM") : mode === "essential" ? "Essential (Simple & Visual)" : "Advanced PM (EVM & Audit)"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Status pill summary & Monte Carlo Trigger */}
        <div className="summary-mode-status">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--jantt-text-muted)" }}>
            <span>Pace: <strong style={{ color: evm.scheduleStatus === "ahead" ? "var(--jantt-status-good)" : evm.scheduleStatus === "behind" ? "var(--jantt-status-bad)" : "inherit" }}>{evm.scheduleStatus}</strong></span>
            <span>•</span>
            {isCostMeasured ? (
              <span>Spend: <strong style={{ color: evm.costStatus === "under-budget" ? "var(--jantt-status-good)" : evm.costStatus === "over-budget" ? "var(--jantt-status-bad)" : "inherit" }}>{evm.costStatus}</strong></span>
            ) : (
              <span title={evm.costDataAvailable ? "No budgeted task reports an actualCost" : "No task has an estimatedCost"}>
                Spend: <strong>n/a</strong>
              </span>
            )}
          </div>

          {onCommit && <button type="button" className="summary-monte-carlo-btn" aria-expanded={showScenarios}
            onClick={() => setShowScenarios(open => !open)}><Layers size={14} />Schedule scenarios</button>}
          <button
            type="button"
            onClick={openMonteCarlo}
            className="summary-monte-carlo-btn"
            title="Run Monte Carlo Probabilistic Risk Simulation (2,000+ iterations)"
          >
            <Dice5 size={14} style={{ color: "var(--jantt-status-warn)" }} />
            <span>{isMobile ? "Delivery risk" : "Monte Carlo Risk Analysis"}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {showScenarios && onCommit && <ResourceLevelingPanel data={parsedData} onCommit={onCommit} readOnly={readOnly} onPromptFork={onPromptFork} />}
      {/* SECTION 1: ESSENTIAL MODE (For Everyday Hobbyists, Solo Devs & Management) */}
      {/* ========================================================================= */}
      {viewMode === "essential" && (
        <div className="health-essential" style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          <div className="kpi-accordion-list" role="region" aria-label="Essential Project Highlights">
            {/* Row 1: Time Countdown */}
            <div className={`kpi-accordion-item ${expandedEssentialKeys.has("time") ? "is-expanded" : ""}`}>
              <button
                type="button"
                className="kpi-accordion-header"
                onClick={() => toggleEssentialKey("time")}
                aria-expanded={expandedEssentialKeys.has("time")}
              >
                <div className="kpi-accordion-lead">
                  <div className="kpi-accordion-icon" style={{ background: "color-mix(in srgb, var(--jantt-accent) 15%, transparent)", color: "var(--jantt-accent)" }}>
                    <Clock size={16} />
                  </div>
                  <div className="kpi-accordion-title-wrap">
                    <span className="kpi-accordion-title">Time Remaining</span>
                    <span className="kpi-accordion-subtitle">
                      Forecast finish: {forecastFinish || "-"}
                      {targetDate && ` · Target: ${targetDate}`}
                    </span>
                  </div>
                </div>
                <div className="kpi-accordion-trailing">
                  <span className="kpi-accordion-value">{daysToForecast} Days</span>
                  {daysLateVsTarget > 0 ? (
                    <span className="kpi-accordion-badge" style={{ background: "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)", color: "var(--jantt-status-bad)" }}>
                      {daysLateVsTarget}d late
                    </span>
                  ) : (
                    <span className="kpi-accordion-badge" style={{ background: "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)", color: "var(--jantt-status-good)" }}>
                      On Track
                    </span>
                  )}
                  <ChevronDown size={14} className="kpi-accordion-chevron" />
                </div>
              </button>
              {expandedEssentialKeys.has("time") && (
                <div className="kpi-accordion-body">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                    <div><strong>Forecast Finish:</strong> {forecastFinish || "Not scheduled"}</div>
                    <div><strong>Target Date:</strong> {targetDate || "None specified"}</div>
                    <div><strong>Calendar Days Left:</strong> {daysToForecast} days</div>
                    <div><strong>Schedule Slippage:</strong> {daysLateVsTarget > 0 ? `${daysLateVsTarget} days past target` : "None (on schedule)"}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Row 2: Budget & Remaining Cash */}
            <div className={`kpi-accordion-item ${expandedEssentialKeys.has("budget") ? "is-expanded" : ""}`}>
              <button
                type="button"
                className="kpi-accordion-header"
                onClick={() => toggleEssentialKey("budget")}
                aria-expanded={expandedEssentialKeys.has("budget")}
              >
                <div className="kpi-accordion-lead">
                  <div className="kpi-accordion-icon" style={{ background: "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)", color: "var(--jantt-status-good)" }}>
                    <DollarSign size={16} />
                  </div>
                  <div className="kpi-accordion-title-wrap">
                    <span className="kpi-accordion-title">Budget &amp; Spend</span>
                    <span className="kpi-accordion-subtitle">
                      {!isActualCostKnown ? "No actual costs reported" : `Spent: ${money(evm.ac)} (${spentPercent}%)`}
                    </span>
                  </div>
                </div>
                <div className="kpi-accordion-trailing">
                  <span className="kpi-accordion-value">{evm.bac > 0 ? money(evm.bac) : "No budget set"}</span>
                  <span
                    className="kpi-accordion-badge"
                    style={{
                      background: isOverBudget ? "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)",
                      color: isOverBudget ? "var(--jantt-status-bad)" : "var(--jantt-status-good)"
                    }}
                  >
                    {isOverBudget ? "Over Budget" : "Funded"}
                  </span>
                  <ChevronDown size={14} className="kpi-accordion-chevron" />
                </div>
              </button>
              {expandedEssentialKeys.has("budget") && (
                <div className="kpi-accordion-body">
                  {budgetTrend && (
                    <div style={{ marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>Cumulative Planned Budget:</span>
                      <svg className="budget-sparkline" viewBox="0 0 100 26" role="img" aria-label="Cumulative planned budget over the project" style={{ width: "100%", height: "30px", marginTop: "4px" }}>
                        <polyline points={budgetTrend} fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                    <div><strong>Budget at Completion (BAC):</strong> {evm.bac > 0 ? money(evm.bac) : "n/a"}</div>
                    <div><strong>Actual Cost (AC):</strong> {isActualCostKnown ? money(evm.ac) : "n/a"}</div>
                    <div><strong>Cash Remaining:</strong> {evm.bac > 0 ? (isOverBudget ? `Over by ${money(evm.ac - evm.bac)}` : money(evm.bac - evm.ac)) : "n/a"}</div>
                    <div><strong>Percent Spent:</strong> {spentPercent}%</div>
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Overall Task Progress */}
            <div className={`kpi-accordion-item ${expandedEssentialKeys.has("progress") ? "is-expanded" : ""}`}>
              <button
                type="button"
                className="kpi-accordion-header"
                onClick={() => toggleEssentialKey("progress")}
                aria-expanded={expandedEssentialKeys.has("progress")}
              >
                <div className="kpi-accordion-lead">
                  <div className="kpi-accordion-icon" style={{ background: "color-mix(in srgb, var(--jantt-status-info) 15%, transparent)", color: "var(--jantt-status-info)" }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="kpi-accordion-title-wrap">
                    <span className="kpi-accordion-title">Work Done &amp; Progress</span>
                    <span className="kpi-accordion-subtitle">
                      {evm.taskCountCompleted} of {evm.taskCountTotal} tasks completed
                    </span>
                  </div>
                </div>
                <div className="kpi-accordion-trailing">
                  <span className="kpi-accordion-value">{evm.projectProgressPercent}%</span>
                  <span className="kpi-accordion-badge" style={{ background: "color-mix(in srgb, var(--jantt-status-info) 15%, transparent)", color: "var(--jantt-status-info)" }}>
                    {evm.projectProgressPercent >= 100 ? "Completed" : "In Progress"}
                  </span>
                  <ChevronDown size={14} className="kpi-accordion-chevron" />
                </div>
              </button>
              {expandedEssentialKeys.has("progress") && (
                <div className="kpi-accordion-body">
                  <div style={{ height: "6px", width: "100%", background: "var(--jantt-border)", borderRadius: "3px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, evm.projectProgressPercent)}%`,
                        background: "var(--jantt-status-info)"
                      }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginTop: "6px" }}>
                    <div><strong>Tasks Completed:</strong> {evm.taskCountCompleted}</div>
                    <div><strong>Tasks Remaining:</strong> {evm.taskCountTotal - evm.taskCountCompleted}</div>
                    <div><strong>Total Tasks in Plan:</strong> {evm.taskCountTotal}</div>
                    <div><strong>Schedule Pace:</strong> {evm.scheduleStatus}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Row 4: Bottleneck Tasks */}
            <div className={`kpi-accordion-item ${expandedEssentialKeys.has("bottlenecks") ? "is-expanded" : ""}`}>
              <button
                type="button"
                className="kpi-accordion-header"
                onClick={() => toggleEssentialKey("bottlenecks")}
                aria-expanded={expandedEssentialKeys.has("bottlenecks")}
              >
                <div className="kpi-accordion-lead">
                  <div className="kpi-accordion-icon" style={{ background: "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)", color: "var(--jantt-status-bad)" }}>
                    <Layers size={16} />
                  </div>
                  <div className="kpi-accordion-title-wrap">
                    <span className="kpi-accordion-title">Bottleneck Tasks (Critical Chain)</span>
                    <span className="kpi-accordion-subtitle">
                      {pathSpan} calendar days on critical path · {formatFloatLabel(cpm.projectTotalFloat)}
                    </span>
                  </div>
                </div>
                <div className="kpi-accordion-trailing">
                  <span className="kpi-accordion-value" style={{ color: "var(--jantt-status-bad)" }}>
                    {cpm.criticalTaskIds.size} Tasks
                  </span>
                  <ChevronDown size={14} className="kpi-accordion-chevron" />
                </div>
              </button>
              {expandedEssentialKeys.has("bottlenecks") && (
                <div className="kpi-accordion-body">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                    <div><strong>Critical Tasks (0 Slack):</strong> {cpm.criticalTaskIds.size}</div>
                    <div><strong>Longest Critical Path:</strong> {pathSpan} calendar days</div>
                    <div><strong>Project Total Float:</strong> {formatFloatLabel(cpm.projectTotalFloat)}</div>
                    <div><strong>Float Description:</strong> {describeFloatForPeople(cpm.projectTotalFloat)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Filter Action Bar for everyday productivity */}
          <div
            className="summary-quick-filter-bar"
            role="group"
            aria-label="Quick filter"
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
            {quickFilterButton("all", <>All Tasks ({summaryKpiTasks.length})</>, "var(--jantt-text)", "var(--jantt-accent)")}
            {quickFilterButton(
              "ready",
              <>
                <PlayCircle size={12} />
                <span>Ready to Start ({readyTaskIds.size})</span>
              </>,
              "var(--jantt-status-good)",
              "var(--jantt-status-good)"
            )}
            {quickFilterButton(
              "blocked",
              <>
                <AlertTriangle size={12} />
                <span>Blocked Tasks ({blockedTaskIds.size})</span>
              </>,
              "var(--jantt-status-warn)",
              "var(--jantt-status-warn)"
            )}
            {quickFilterButton(
              "bottleneck",
              <>
                <Layers size={12} />
                <span>Critical Bottlenecks ({cpm.criticalTaskIds.size})</span>
              </>,
              "var(--jantt-status-bad)",
              "var(--jantt-status-bad)"
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: ADVANCED PM MODE (For Senior Technical PMs, EVM, & Audits)     */}
      {/* ========================================================================= */}
      {viewMode === "advanced" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
          {/* Advanced EVM Metrics Panel */}
          <EvmKpiCards evm={evm} cpm={cpm} currency={currency} />

          {/* S-Curve Cumulative Cost vs Progress Visualization */}
          <EvmSCurveChart parsedData={parsedData} evm={evm} currency={currency} />

          {/* Schedule Health & Integrity Diagnostic Card */}
          <ScheduleHealthCard audit={audit} hasTargetDate={Boolean(targetDate)} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* WORK BREAKDOWN & METRICS TABLE (Adaptable to Active Mode)                 */}
      {/* ========================================================================= */}
      {slip && <details className="health-slippage">
        <summary>{slip.top.length} {slip.top.length === 1 ? "task accounts" : "tasks account"} for {slip.pct}% of late task-days</summary>
        <ul>{slip.top.map((item, index) => <li key={index}>{item.label}<strong>+{item.days}d</strong></li>)}</ul>
        <small>Compared with each task’s baseline finish.</small>
      </details>}
      <div className="summary-breakdown-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <span>{viewMode === "essential" ? "Work Breakdown & Wiggle Room" : "Work Breakdown & Schedule Performance (CPM / Float)"}</span>
            {activeQuickFilter !== "all" && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 4px 2px 8px",
                  borderRadius: "100px",
                  border: "1px solid var(--jantt-border)",
                  color: "var(--jantt-text)"
                }}
              >
                Filter: {QUICK_FILTER_LABELS[activeQuickFilter]}
                <button
                  type="button"
                  onClick={() => setQuickFilter("all")}
                  aria-label="Clear quick filter"
                  title="Clear quick filter"
                  style={{ display: "inline-flex", background: "none", border: "none", cursor: "pointer", color: "var(--jantt-text-muted)", padding: "2px" }}
                >
                  <X size={11} />
                </button>
              </span>
            )}
            {summarySortConfig.column && (
              <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--jantt-text-muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span>Sorted by {summarySortConfig.column}</span>
                {summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                <button
                  type="button"
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

        {isMobile && (
          <>
            <select
              className="summary-mobile-sort-select"
              aria-label="Sort breakdown tasks"
              value={summarySortConfig.column || "wbs"}
              onChange={(event) => setSummarySortConfig({ column: event.target.value, direction: summarySortConfig.direction || "asc" })}
            >
              <option value="wbs">WBS</option><option value="name">Name</option><option value="buffer">Float / Wiggle Room</option><option value="budget">Budget</option><option value="status">Status</option><option value="progress">Progress</option>
            </select>
            <div className="summary-mobile-card-list">
              {displayTasks.slice(0, taskLimit).map((task) => {
                const metric = cpm.metrics.get(task.id);
                const completed = isTaskDone(task);
                const progress = completed ? 100 : Math.round(Math.min(1, Math.max(0, Number(task.progress) || 0)) * 100);
                const blocked = blockedTaskIds.has(task.id);
                const critical = Boolean(metric?.isCritical);
                return <article className={`summary-mobile-card ${metric?.totalFloat === 0 ? "zero-float" : ""}`} key={task.id}>
                  <div className="summary-mobile-card-top">
                    <span className="kanban-wbs-badge">{task.wbs || "-"}</span>
                    <span className="summary-mobile-card-title">{task.label || task.name || task.id}</span>
                    <span className={`kanban-prio-badge is-status-${(task.status || "not-started").replace("-", "")}`}>
                      {completed ? "Done" : critical ? "Critical" : blocked ? "Blocked" : "Ready"}
                    </span>
                  </div>
                  <div className="summary-mobile-card-bottom"><span>{metric?.totalFloat === undefined ? "Float -" : `Float ${formatFloatLabel(metric.totalFloat)}`}</span><span>{typeof task.estimatedCost === "number" ? money(task.estimatedCost) : "-"}</span><span>{progress}%</span></div>
                  <div className="summary-mobile-progress-track"><div className="summary-mobile-progress-fill" style={{ width: `${progress}%` }} /></div>
                </article>;
              })}
            </div>
            {taskLimit < displayTasks.length && <button type="button" className="health-more-tasks" onClick={() => setTaskLimit(current => current + 40)}>
              Show {Math.min(40, displayTasks.length - taskLimit)} more tasks
            </button>}
          </>
        )}
        {!isMobile && <table className="summary-table">
          <thead>
            <tr>
              {SORTABLE_COLUMNS.map((col) => {
                const isSorted = summarySortConfig.column === col.id && Boolean(summarySortConfig.direction);
                const label = col.label(viewMode === "essential", currency);
                return (
                  <th
                    key={col.id}
                    className={`summary-th-sortable ${isSorted ? "is-sorted" : ""}`}
                    aria-sort={isSorted ? (summarySortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => handleSummarySort(col.id)}
                      title={`Sort by ${label}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        background: "none",
                        border: "none",
                        padding: 0,
                        font: "inherit",
                        color: "inherit",
                        textTransform: "inherit",
                        letterSpacing: "inherit",
                        cursor: "pointer"
                      }}
                    >
                      <span>{label}</span>
                      {isSorted && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayTasks.map((t) => {
              const cat = parsedData.categories?.[t.category];
              const isCompleted = isTaskDone(t);
              const effectiveProgress = isCompleted ? 1.0 : Math.min(1, Math.max(0, Number(t.progress) || 0));
              const isPersonMatch = isTaskMatchingPersonFilter(t, selectedPersonFilter, effectivePeople, teams);
              const isDateMatch = isTaskMatchingDateFilter(t);
              const isPersonFiltering = selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:");
              const isFilterDimmed =
                dateFilterBehavior === "dim" && ((!isDateMatch) || (isPersonFiltering && !isPersonMatch));
              const isCompletedDimmed = completedFilterMode === "dim" && isCompleted;
              const isDimmed = isFilterDimmed || isCompletedDimmed;
              const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
              const teamColor = sanitizeCssColor(assigneeInfo.team?.color, "var(--jantt-accent)");
              const status = typeof t.status === "string" && t.status ? t.status : "not-started";

              // CPM & Float metrics
              const scheduleMetrics = cpm.metrics.get(t.id);
              const isCrit = scheduleMetrics?.isCritical ?? false;
              const isNearCrit = scheduleMetrics?.isNearCritical ?? false;
              const tf = scheduleMetrics?.totalFloat;
              const ff = scheduleMetrics?.freeFloat ?? 0;
              const isBlocked = blockedTaskIds.has(t.id);
              const isReady = readyTaskIds.has(t.id);
              const floatColor =
                tf === undefined
                  ? "var(--jantt-text-muted)"
                  : tf < 0
                  ? "var(--jantt-status-bad)"
                  : isCrit
                  ? "var(--jantt-status-bad)"
                  : isNearCrit
                  ? "var(--jantt-status-warn)"
                  : "var(--jantt-status-good)";

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
                            background: tintColor("var(--jantt-status-bad)", 12),
                            color: "var(--jantt-status-bad)",
                            border: `1px solid ${tintColor("var(--jantt-status-bad)", 25)}`,
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
                            color: "var(--jantt-status-good)",
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
                            color: "var(--jantt-status-warn)",
                            border: "1px solid #F59E0B40"
                          }}
                        >
                          Blocked
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="jantt-label-dot" style={{ background: isCompleted ? "var(--jantt-bar-done, #64748B)" : sanitizeCssColor(cat?.color, "var(--jantt-accent)"), display: "inline-block", marginRight: "6px" }} />
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
                              background: tintColor(teamColor, 10),
                              color: teamColor,
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
                    {tf === undefined ? (
                      <span style={{ color: floatColor }}>-</span>
                    ) : (
                      <span
                        title={viewMode === "essential" ? describeFloatForPeople(tf) : `Total Float: ${tf}d, Free Float: ${ff}d`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          fontFamily: "var(--jantt-font-mono)",
                          color: floatColor
                        }}
                      >
                        {formatFloatLabel(tf)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: "var(--jantt-font-mono)" }}>
                    {typeof t.estimatedCost === "number" && Number.isFinite(t.estimatedCost) && t.estimatedCost !== 0
                      ? money(t.estimatedCost)
                      : "-"}
                  </td>
                  <td>
                    <span className={`kanban-prio-badge is-status-${status.replace("-", "")}`}>
                      {status}
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
        </table>}
      </div>

      {!onOpenMonteCarlo && showMonteCarlo && (
        <React.Suspense fallback={<p role="status">Loading simulation…</p>}>
          <MonteCarloModal show onClose={() => setShowMonteCarlo(false)} parsedData={parsedData} />
        </React.Suspense>
      )}
    </div>
  );
};
