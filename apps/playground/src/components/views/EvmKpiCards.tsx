import React, { useState, useEffect } from "react";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Zap,
  Sliders,
  ChevronDown,
  Activity
} from "lucide-react";
import type { EVMAnalysis, CriticalPathResult, JanttData } from "@jantt/core";

const DEFAULT_CURRENCY = "USD";
const formatterCache = new Map<string, Intl.NumberFormat>();

function getMoneyFormatter(currency: string, signed: boolean): Intl.NumberFormat {
  const key = `${currency}|${signed}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const options: Intl.NumberFormatOptions = {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      ...(signed ? { signDisplay: "exceptZero" as const } : {})
    };
    try {
      formatter = new Intl.NumberFormat(undefined, options);
    } catch {
      formatter = new Intl.NumberFormat(undefined, { ...options, currency: DEFAULT_CURRENCY });
    }
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** The plan's ISO 4217 currency (`meta.currency`), defaulting to USD. */
export function getPlanCurrency(data?: Pick<JanttData, "meta"> | null): string {
  const raw = data?.meta?.currency;
  return typeof raw === "string" && /^[A-Za-z]{3}$/.test(raw.trim()) ? raw.trim().toUpperCase() : DEFAULT_CURRENCY;
}

/**
 * Locale-aware money formatting in the plan currency ("-$1,234", "+€50" when `signed`).
 * Non-finite input (e.g. a cost imported as text) renders as "—" instead of "$NaN".
 */
export function formatMoney(value: number, currency: string = DEFAULT_CURRENCY, signed = false): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return getMoneyFormatter(currency, signed).format(Math.round(value) || 0);
}

const PV_BASIS_LABELS: Record<EVMAnalysis["pvBasis"], string> = {
  baseline: "Planned value follows the task baselines.",
  mixed: "Planned value follows baselines where set, current dates elsewhere.",
  current: "Planned value follows current dates (no baseline set)."
};

const MUTED = "var(--jantt-text-muted)";

interface EvmKpiCardsProps {
  evm: EVMAnalysis;
  cpm: CriticalPathResult;
  currency?: string;
}

export const EvmKpiCards: React.FC<EvmKpiCardsProps> = ({ evm, cpm, currency = DEFAULT_CURRENCY }) => {
  const [showAdvancedEvm, setShowAdvancedEvm] = useState<boolean>(() => {
    const saved = storageService.getItem<{ showAdvancedEvm?: boolean }>(STORAGE_KEYS.SUMMARY_VIEW_STATE);
    return Boolean(saved?.showAdvancedEvm);
  });

  // Track expanded accordion items by ID (defaults to budget and schedule open)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(["budget", "schedule"]));

  const toggleKey = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedKeys.size >= 3) {
      setExpandedKeys(new Set());
    } else {
      setExpandedKeys(new Set(["budget", "schedule", "cost", "critical", "health"]));
    }
  };

  useEffect(() => {
    const prev = storageService.getItem<Record<string, unknown>>(STORAGE_KEYS.SUMMARY_VIEW_STATE) || {};
    storageService.setItem(STORAGE_KEYS.SUMMARY_VIEW_STATE, { ...prev, showAdvancedEvm });
  }, [showAdvancedEvm]);

  const money = (val: number) => formatMoney(val, currency);
  const signedMoney = (val: number) => formatMoney(val, currency, true);

  const hasCostData = evm.costDataAvailable;
  const isActualCostKnown = evm.costCoverage > 0 || evm.ac > 0;
  const isCostMeasured = hasCostData && evm.costCoverage > 0;
  const coveragePercent = Math.round(evm.costCoverage * 100);
  const costUnavailableText = hasCostData ? "n/a: no actual costs" : "No cost data";
  const costUnavailableHint = hasCostData
    ? "No budgeted task reports an actualCost, so cost performance cannot be measured."
    : "No task has an estimatedCost. Add budgets to measure cost performance.";

  const spiColor = evm.spi >= 1.0 ? "var(--jantt-status-good)" : evm.spi >= 0.9 ? "var(--jantt-status-warn)" : "var(--jantt-status-bad)";
  const cpiColor = !isCostMeasured ? MUTED : evm.cpi >= 1.0 ? "var(--jantt-status-good)" : evm.cpi >= 0.9 ? "var(--jantt-status-warn)" : "var(--jantt-status-bad)";
  const isOverBudget = evm.bac > 0 && evm.ac > evm.bac;
  const spentPercent = evm.bac > 0 && Number.isFinite(evm.ac) ? Math.round((evm.ac / evm.bac) * 100) : 0;
  const tcpiText = !isCostMeasured
    ? costUnavailableText
    : Number.isFinite(evm.tcpi)
    ? String(evm.tcpi)
    : "Unachievable within BAC";

  const advancedPanelId = "evm-advanced-panel";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
      {/* Header with expand/collapse all toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--jantt-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Performance Metrics &amp; EVM
        </span>
        <button
          type="button"
          onClick={toggleAll}
          style={{
            background: "none",
            border: "1px solid var(--jantt-border)",
            borderRadius: "6px",
            padding: "3px 8px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--jantt-accent)",
            cursor: "pointer"
          }}
        >
          {expandedKeys.size >= 3 ? "Collapse All" : "Expand All"}
        </button>
      </div>

      {/* KPI Accordion List - Compact, space-saving list where each row opens */}
      <div className="kpi-accordion-list" role="region" aria-label="Project Performance Metrics">
        {/* Row 1: Budget & Spend */}
        <div className={`kpi-accordion-item ${expandedKeys.has("budget") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleKey("budget")}
            aria-expanded={expandedKeys.has("budget")}
          >
            <div className="kpi-accordion-lead">
              <div className="kpi-accordion-icon" style={{ background: "color-mix(in srgb, var(--jantt-accent) 15%, transparent)", color: "var(--jantt-accent)" }}>
                <DollarSign size={16} />
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Budget &amp; Spend</span>
                <span className="kpi-accordion-subtitle">
                  {isActualCostKnown ? `Spent: ${money(evm.ac)} (${spentPercent}%)` : "No actual costs reported"}
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
                {isOverBudget ? "Over Budget" : "On Track"}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("budget") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>Planned Value (PV):</strong> {hasCostData ? money(evm.pv) : "n/a"}</div>
                <div><strong>Earned Value (EV):</strong> {hasCostData ? money(evm.ev) : "n/a"}</div>
                <div><strong>Actual Cost (AC):</strong> {isActualCostKnown ? money(evm.ac) : "n/a"}</div>
                <div><strong>Cost Variance (CV):</strong> {isCostMeasured ? signedMoney(evm.cv) : "n/a"}</div>
              </div>
              {evm.bac > 0 && (
                <div style={{ marginTop: "4px" }}>
                  <div style={{ height: "6px", width: "100%", background: "var(--jantt-border)", borderRadius: "3px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, spentPercent)}%`,
                        background: isOverBudget ? "var(--jantt-status-bad)" : "var(--jantt-accent)"
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "4px" }}>
                    <span>{spentPercent}% spent of total BAC ({money(evm.bac)})</span>
                    <span>{isOverBudget ? `Over by ${money(evm.ac - evm.bac)}` : `${money(evm.bac - evm.ac)} remaining`}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Progress & Schedule Pace (SPI) */}
        <div className={`kpi-accordion-item ${expandedKeys.has("schedule") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleKey("schedule")}
            aria-expanded={expandedKeys.has("schedule")}
          >
            <div className="kpi-accordion-lead">
              <div className="kpi-accordion-icon" style={{ background: `color-mix(in srgb, ${spiColor} 15%, transparent)`, color: spiColor }}>
                <TrendingUp size={16} />
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Progress &amp; Schedule Pace</span>
                <span className="kpi-accordion-subtitle">
                  {evm.daysRemaining}d to finish · {evm.taskCountCompleted}/{evm.taskCountTotal} tasks done
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value">{evm.projectProgressPercent}% (SPI {evm.spi})</span>
              <span
                className="kpi-accordion-badge"
                style={{
                  background: `color-mix(in srgb, ${spiColor} 15%, transparent)`,
                  color: spiColor
                }}
              >
                {evm.scheduleStatus}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("schedule") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>Schedule Index (SPI):</strong> {evm.spi} (Target: &ge; 1.00)</div>
                <div><strong>Schedule Variance (SV):</strong> {hasCostData ? signedMoney(evm.sv) : "n/a"}</div>
                <div><strong>Tasks Completed:</strong> {evm.taskCountCompleted} of {evm.taskCountTotal}</div>
                <div><strong>Pace Status:</strong> {evm.projectPaceLabel}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                {PV_BASIS_LABELS[evm.pvBasis]} {!hasCostData && "Without budgets, SPI and progress are duration-weighted."}
              </div>
            </div>
          )}
        </div>

        {/* Row 3: Cost Efficiency (CPI) */}
        <div className={`kpi-accordion-item ${expandedKeys.has("cost") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleKey("cost")}
            aria-expanded={expandedKeys.has("cost")}
          >
            <div className="kpi-accordion-lead">
              <div className="kpi-accordion-icon" style={{ background: `color-mix(in srgb, ${cpiColor} 15%, transparent)`, color: cpiColor }}>
                <Activity size={16} />
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Cost Performance Index (CPI)</span>
                <span className="kpi-accordion-subtitle">
                  {isCostMeasured ? `${coveragePercent}% budget coverage` : costUnavailableText}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value">CPI: {isCostMeasured ? evm.cpi : "n/a"}</span>
              <span
                className="kpi-accordion-badge"
                style={{
                  background: isCostMeasured && evm.cpi >= 1.0 ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-warn) 15%, transparent)",
                  color: isCostMeasured && evm.cpi >= 1.0 ? "var(--jantt-status-good)" : "var(--jantt-status-warn)"
                }}
              >
                {isCostMeasured ? (evm.cpi >= 1.0 ? "Efficient" : "Underperforming") : "No Cost Data"}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("cost") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>Cost Index (CPI):</strong> {isCostMeasured ? evm.cpi : "n/a"}</div>
                <div><strong>Cost Variance (CV):</strong> {isCostMeasured ? signedMoney(evm.cv) : "n/a"}</div>
                <div><strong>TCPI (BAC):</strong> {tcpiText}</div>
                <div><strong>Critical Ratio (CR):</strong> {isCostMeasured ? evm.criticalRatio : "n/a"}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                {isCostMeasured ? "CPI measures the value of work completed against the actual money spent. A CPI >= 1.0 means the project is running efficiently." : costUnavailableHint}
              </div>
            </div>
          )}
        </div>

        {/* Row 4: Critical Path & Buffer Slack */}
        <div className={`kpi-accordion-item ${expandedKeys.has("critical") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleKey("critical")}
            aria-expanded={expandedKeys.has("critical")}
          >
            <div className="kpi-accordion-lead">
              <div className="kpi-accordion-icon" style={{ background: "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)", color: "var(--jantt-status-bad)" }}>
                <Clock size={16} />
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Critical Path &amp; Slack</span>
                <span className="kpi-accordion-subtitle">
                  {cpm.nearCriticalTaskIds.size} near-critical tasks (&le;3d buffer)
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value" style={{ color: "var(--jantt-status-bad)" }}>
                {cpm.criticalTaskIds.size} Critical
              </span>
              <span
                className="kpi-accordion-badge"
                style={{
                  background: cpm.projectTotalFloat < 0 ? "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)",
                  color: cpm.projectTotalFloat < 0 ? "var(--jantt-status-bad)" : "var(--jantt-status-good)"
                }}
              >
                {cpm.projectTotalFloat < 0 ? `${Math.abs(cpm.projectTotalFloat)}d past target` : `${cpm.projectTotalFloat}d buffer`}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("critical") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>Critical Tasks:</strong> {cpm.criticalTaskIds.size}</div>
                <div><strong>Near-Critical Tasks:</strong> {cpm.nearCriticalTaskIds.size}</div>
                <div><strong>Project Total Float:</strong> {cpm.projectTotalFloat} days</div>
                <div><strong>Forecast Finish:</strong> {cpm.projectEarlyFinish || "-"}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                Any delay to a critical task directly pushes out the project completion date. Focus delivery on the critical chain to protect the finish date.
              </div>
            </div>
          )}
        </div>

        {/* Row 5: Performance Score & Blockers */}
        <div className={`kpi-accordion-item ${expandedKeys.has("health") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleKey("health")}
            aria-expanded={expandedKeys.has("health")}
          >
            <div className="kpi-accordion-lead">
              <div className="kpi-accordion-icon" style={{ background: evm.taskCountBlocked > 0 ? "color-mix(in srgb, var(--jantt-status-warn) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)", color: evm.taskCountBlocked > 0 ? "var(--jantt-status-warn)" : "var(--jantt-status-good)" }}>
                <Zap size={16} />
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Health Score &amp; Blockers</span>
                <span className="kpi-accordion-subtitle">
                  {evm.taskCountBlocked > 0 ? `${evm.taskCountBlocked} task(s) blocked` : "Zero task blockers"}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value">{evm.healthScore}/100</span>
              <span
                className="kpi-accordion-badge"
                style={{
                  background: evm.overallHealth === "healthy" ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)",
                  color: evm.overallHealth === "healthy" ? "var(--jantt-status-good)" : "var(--jantt-status-bad)"
                }}
              >
                {evm.overallHealth}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("health") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>Health Score:</strong> {evm.healthScore} / 100</div>
                <div><strong>Overall Status:</strong> {evm.overallHealth}</div>
                <div><strong>Blocked Tasks:</strong> {evm.taskCountBlocked}</div>
                <div><strong>Measured On:</strong> {evm.statusDate}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                Score begins at 100 and drops when SPI or CPI decrease below 1.0 or when open tasks are blocked by unfinished predecessor dependencies.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced EVM Toggle Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
        <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", fontWeight: 500 }}>
          {evm.projectPaceLabel}
        </span>
        <button
          type="button"
          onClick={() => setShowAdvancedEvm(!showAdvancedEvm)}
          aria-expanded={showAdvancedEvm}
          aria-controls={advancedPanelId}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "none",
            border: "1px solid var(--jantt-border)",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--jantt-accent)",
            cursor: "pointer"
          }}
        >
          <Sliders size={12} />
          <span>{showAdvancedEvm ? "Hide Detailed EVM Table" : "Show Detailed EVM Table"}</span>
        </button>
      </div>

      {/* 2. ADVANCED EARNED VALUE MANAGEMENT PANEL (For Senior PMs & Operations Research) */}
      {showAdvancedEvm && (
        <div
          id={advancedPanelId}
          style={{
            padding: "16px",
            borderRadius: "8px",
            background: "var(--jantt-surface)",
            border: "1px solid var(--jantt-border)",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h4 style={{ fontSize: "13px", fontWeight: 700, margin: 0, color: "var(--jantt-text)" }}>
                Earned Value Full Analysis
              </h4>
              <p style={{ fontSize: "11px", color: "var(--jantt-text-muted)", margin: "2px 0 0 0" }}>
                Cost and schedule performance indices with a completion forecast, measured on {evm.statusDate}.{" "}
                {PV_BASIS_LABELS[evm.pvBasis]}
                {!hasCostData && " Without budgets, SPI and progress are duration-weighted."}
              </p>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: `color-mix(in srgb, ${spiColor} 8%, transparent)`,
                  color: spiColor,
                  border: `1px solid color-mix(in srgb, ${spiColor} 25%, transparent)`
                }}
              >
                SPI: {evm.spi} ({hasCostData ? `SV ${signedMoney(evm.sv)}` : "duration-weighted"})
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: `color-mix(in srgb, ${cpiColor} 8%, transparent)`,
                  color: cpiColor,
                  border: `1px solid color-mix(in srgb, ${cpiColor} 25%, transparent)`
                }}
              >
                {isCostMeasured ? (
                  <span title={coveragePercent < 100 ? `Measured on the tasks that report an actualCost (${coveragePercent}% of the budget)` : undefined}>
                    CPI: {evm.cpi} (CV {signedMoney(evm.cv)}){coveragePercent < 100 && ` · based on ${coveragePercent}% of budget`}
                  </span>
                ) : (
                  <span title={costUnavailableHint}>CPI: {costUnavailableText}</span>
                )}
              </span>
            </div>
          </div>

          {/* EVM Metric Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Planned Value (PV)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }}>{hasCostData ? money(evm.pv) : "No cost data"}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>Scheduled work budget</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Earned Value (EV)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: hasCostData ? spiColor : MUTED }}>{hasCostData ? money(evm.ev) : "No cost data"}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>Value of completed work</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Actual Cost (AC)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isOverBudget ? "var(--jantt-status-bad)" : "inherit" }}>{isActualCostKnown ? money(evm.ac) : "n/a"}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                {!isActualCostKnown
                  ? "No task reports actual cost"
                  : isCostMeasured && coveragePercent < 100
                  ? `Reported on ${coveragePercent}% of budget`
                  : "Actual money spent"}
              </div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Estimate at Finish (EAC)</div>
              <div
                style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isCostMeasured && evm.vac < 0 ? "var(--jantt-status-bad)" : "inherit" }}
                title={isCostMeasured ? undefined : costUnavailableHint}
              >
                {isCostMeasured ? money(evm.eac) : costUnavailableText}
              </div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                {isCostMeasured ? `VAC: ${signedMoney(evm.vac)}` : "VAC: n/a"}
              </div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>To-Complete Index (TCPI)</div>
              <div
                style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isCostMeasured && !Number.isFinite(evm.tcpi) ? "var(--jantt-status-bad)" : "inherit" }}
                title={isCostMeasured ? undefined : costUnavailableHint}
              >
                {tcpiText}
              </div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>Efficiency needed to stay on budget</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Critical Ratio (CR)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }} title={isCostMeasured ? undefined : costUnavailableHint}>
                {isCostMeasured ? evm.criticalRatio : costUnavailableText}
              </div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>SPI x CPI composite</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
