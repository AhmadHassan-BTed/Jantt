import React, { useState, useEffect } from "react";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Zap,
  Sliders,
  AlertTriangle,
  CheckCircle2
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
  // `|| 0` folds -0 (e.g. a -0.3 variance) into 0 so it never renders as "-$0".
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

  useEffect(() => {
    const prev = storageService.getItem<Record<string, unknown>>(STORAGE_KEYS.SUMMARY_VIEW_STATE) || {};
    storageService.setItem(STORAGE_KEYS.SUMMARY_VIEW_STATE, { ...prev, showAdvancedEvm });
  }, [showAdvancedEvm]);

  const money = (val: number) => formatMoney(val, currency);
  const signedMoney = (val: number) => formatMoney(val, currency, true);

  // Honest cost reporting: without budgets there is no monetary EVM, and without any reported
  // actualCost the cost indices (CPI, CV, EAC, VAC, TCPI, CR) are placeholders, not measurements.
  const hasCostData = evm.costDataAvailable;
  const isActualCostKnown = evm.costCoverage > 0 || evm.ac > 0;
  const isCostMeasured = hasCostData && evm.costCoverage > 0;
  const coveragePercent = Math.round(evm.costCoverage * 100);
  const costUnavailableText = hasCostData ? "n/a: no actual costs" : "No cost data";
  const costUnavailableHint = hasCostData
    ? "No budgeted task reports an actualCost, so cost performance cannot be measured."
    : "No task has an estimatedCost. Add budgets to measure cost performance.";

  const spiColor = evm.spi >= 1.0 ? "#10B981" : evm.spi >= 0.9 ? "#F59E0B" : "#EF4444";
  const cpiColor = !isCostMeasured ? MUTED : evm.cpi >= 1.0 ? "#10B981" : evm.cpi >= 0.9 ? "#F59E0B" : "#EF4444";
  const isOverBudget = evm.bac > 0 && evm.ac > evm.bac;
  const spentPercent = evm.bac > 0 && Number.isFinite(evm.ac) ? Math.round((evm.ac / evm.bac) * 100) : 0;
  const tcpiText = !isCostMeasured
    ? costUnavailableText
    : Number.isFinite(evm.tcpi)
    ? String(evm.tcpi)
    : "Unachievable within BAC";
  const advancedPanelId = "evm-advanced-panel";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
      {/* 1. INTUITIVE PROJECT PULSE STRIP (For everyday managers, hobbyists, stakeholders) */}
      <div className="summary-kpi-grid">
        {/* Card 1: Budget & Cost */}
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: "var(--jantt-accent)" }}>
            <DollarSign size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Budget &amp; Spend</span>
            <span className="kpi-value">{evm.bac > 0 ? money(evm.bac) : "No budget set"}</span>
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              {isActualCostKnown ? (
                <>
                  Spent: <strong>{money(evm.ac)}</strong>
                  {evm.bac > 0 && ` (${spentPercent}%)`}
                  {isOverBudget && (
                    <strong style={{ color: "#EF4444", marginLeft: "6px" }}>Over by {money(evm.ac - evm.bac)}</strong>
                  )}
                </>
              ) : (
                <>Spent: n/a (no actual costs reported)</>
              )}
            </span>
          </div>
        </div>

        {/* Card 2: Schedule & Pace */}
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: spiColor }}>
            <TrendingUp size={20} />
          </div>
          <div className="kpi-data">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="kpi-label">Progress &amp; Pace</span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: `${spiColor}20`,
                  color: spiColor,
                  textTransform: "uppercase"
                }}
              >
                {evm.scheduleStatus}
              </span>
            </div>
            <span className="kpi-value">{evm.projectProgressPercent}%</span>
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              {evm.daysRemaining} days to forecast finish • {evm.taskCountCompleted} of {evm.taskCountTotal} tasks done
            </span>
          </div>
        </div>

        {/* Card 3: Critical Path & Buffer */}
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: "var(--jantt-critical, #EF4444)" }}>
            <Clock size={20} />
          </div>
          <div className="kpi-data">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="kpi-label">Critical Path</span>
              <span
                title={
                  cpm.projectTotalFloat < 0
                    ? "The forecast finish is later than the target date"
                    : "Days the project finish can slip before it misses the target"
                }
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: cpm.projectTotalFloat < 0 ? "#EF444420" : "var(--jantt-surface)",
                  color: cpm.projectTotalFloat < 0 ? "#EF4444" : "var(--jantt-text-muted)"
                }}
              >
                {cpm.projectTotalFloat < 0
                  ? `${Math.abs(cpm.projectTotalFloat)}d past target`
                  : `${cpm.projectTotalFloat}d buffer`}
              </span>
            </div>
            <span className="kpi-value" style={{ color: "var(--jantt-critical, #EF4444)" }}>
              {cpm.criticalTaskIds.size} Tasks
            </span>
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              {cpm.nearCriticalTaskIds.size} near-critical (&le;3d buffer)
            </span>
          </div>
        </div>

        {/* Card 4: Cost/schedule performance score & blockers */}
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: evm.taskCountBlocked > 0 ? "#F59E0B" : "#10B981" }}>
            <Zap size={20} />
          </div>
          <div className="kpi-data">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                className="kpi-label"
                title="Performance score: starts at 100 and drops when SPI or CPI fall below 1.0 or tasks are blocked by unfinished prerequisites."
              >
                Performance Score
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: evm.overallHealth === "healthy" ? "#10B98120" : "#EF444420",
                  color: evm.overallHealth === "healthy" ? "#10B981" : "#EF4444",
                  textTransform: "uppercase"
                }}
              >
                {evm.overallHealth}
              </span>
            </div>
            <span className="kpi-value">{evm.healthScore}/100</span>
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              {evm.taskCountBlocked > 0 ? (
                <span style={{ color: "#F59E0B", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <AlertTriangle size={12} />
                  <span>{evm.taskCountBlocked} task(s) blocked by prerequisites</span>
                </span>
              ) : (
                <span style={{ color: "#10B981", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={12} />
                  <span>Zero task blockers</span>
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Advanced EVM Toggle Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)", fontWeight: 500 }}>
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
          <span>{showAdvancedEvm ? "Hide Earned Value Details" : "Show Earned Value Details"}</span>
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
                Earned Value Analysis
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
                  background: `${spiColor}15`,
                  color: spiColor,
                  border: `1px solid ${spiColor}40`
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
                  background: `${cpiColor}15`,
                  color: cpiColor,
                  border: `1px solid ${cpiColor}40`
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
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
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isOverBudget ? "#EF4444" : "inherit" }}>{isActualCostKnown ? money(evm.ac) : "n/a"}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                {!isActualCostKnown
                  ? "No task reports an actual cost"
                  : isCostMeasured && coveragePercent < 100
                  ? `Reported on ${coveragePercent}% of the budget`
                  : "Actual money spent"}
              </div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Estimate at Finish (EAC)</div>
              <div
                style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isCostMeasured && evm.vac < 0 ? "#EF4444" : "inherit" }}
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
                style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isCostMeasured && !Number.isFinite(evm.tcpi) ? "#EF4444" : "inherit" }}
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
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>SPI × CPI composite</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
