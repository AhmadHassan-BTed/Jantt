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
import { useI18n } from "../../i18n/I18nProvider";
import type { Locale, MessageKey } from "../../i18n";

const DEFAULT_CURRENCY = "USD";
const formatterCache = new Map<string, Intl.NumberFormat>();

function getMoneyFormatter(currency: string, signed: boolean, locale?: Locale): Intl.NumberFormat {
  const key = `${locale}|${currency}|${signed}`;
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
      formatter = new Intl.NumberFormat(locale, options);
    } catch {
      formatter = new Intl.NumberFormat(locale, { ...options, currency: DEFAULT_CURRENCY });
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
export function formatMoney(value: number, currency: string = DEFAULT_CURRENCY, signed = false, locale?: Locale): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return getMoneyFormatter(currency, signed, locale).format(Math.round(value) || 0);
}

const PV_BASIS_LABELS: Record<EVMAnalysis["pvBasis"], MessageKey> = {
  baseline: "health.evm.pvBasisBaseline",
  mixed: "health.evm.pvBasisMixed",
  current: "health.evm.pvBasisCurrent"
};

const MUTED = "var(--jantt-text-muted)";

interface EvmKpiCardsProps {
  evm: EVMAnalysis;
  cpm: CriticalPathResult;
  currency?: string;
}

export const EvmKpiCards: React.FC<EvmKpiCardsProps> = ({ evm, cpm, currency = DEFAULT_CURRENCY }) => {
  const { t, locale } = useI18n();
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

  const money = (val: number) => formatMoney(val, currency, false, locale);
  const signedMoney = (val: number) => formatMoney(val, currency, true, locale);

  const hasCostData = evm.costDataAvailable;
  const isActualCostKnown = evm.costCoverage > 0 || evm.ac > 0;
  const isCostMeasured = hasCostData && evm.costCoverage > 0;
  const coveragePercent = Math.round(evm.costCoverage * 100);
  const costUnavailableText = hasCostData ? t("health.evm.costUnavailableNa") : t("health.evm.noCostData");
  const costUnavailableHint = hasCostData
    ? t("health.evm.costUnavailableHint1")
    : t("health.evm.costUnavailableHint2");

  const spiColor = evm.spi >= 1.0 ? "var(--jantt-status-good)" : evm.spi >= 0.9 ? "var(--jantt-status-warn)" : "var(--jantt-status-bad)";
  const cpiColor = !isCostMeasured ? MUTED : evm.cpi >= 1.0 ? "var(--jantt-status-good)" : evm.cpi >= 0.9 ? "var(--jantt-status-warn)" : "var(--jantt-status-bad)";
  const isOverBudget = evm.bac > 0 && evm.ac > evm.bac;
  const spentPercent = evm.bac > 0 && Number.isFinite(evm.ac) ? Math.round((evm.ac / evm.bac) * 100) : 0;
  const tcpiText = !isCostMeasured
    ? costUnavailableText
    : Number.isFinite(evm.tcpi)
    ? String(evm.tcpi)
    : t("health.evm.unachievable");

  const advancedPanelId = "evm-advanced-panel";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
      {/* Header with expand/collapse all toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--jantt-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {t("health.evm.title")}
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
          {expandedKeys.size >= 3 ? t("health.evm.collapseAll") : t("health.evm.expandAll")}
        </button>
      </div>

      {/* KPI Accordion List - Compact, space-saving list where each row opens */}
      <div className="kpi-accordion-list" role="region" aria-label={t("health.evm.metricsAria")}>
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
                <span className="kpi-accordion-title">{t("health.shared.budgetSpend")}</span>
                <span className="kpi-accordion-subtitle">
                  {isActualCostKnown ? t("health.shared.spentWithPct", { amount: money(evm.ac), percent: spentPercent }) : t("health.shared.noActualCosts")}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value">{evm.bac > 0 ? money(evm.bac) : t("health.shared.noBudgetSet")}</span>
              <span
                className="kpi-accordion-badge"
                style={{
                  background: isOverBudget ? "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)",
                  color: isOverBudget ? "var(--jantt-status-bad)" : "var(--jantt-status-good)"
                }}
              >
                {isOverBudget ? t("health.shared.overBudget") : t("health.shared.onTrack")}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("budget") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>{t("health.evm.pvBold")}</strong> {hasCostData ? money(evm.pv) : "n/a"}</div>
                <div><strong>{t("health.evm.evBold")}</strong> {hasCostData ? money(evm.ev) : "n/a"}</div>
                <div><strong>{t("health.evm.acBold")}</strong> {isActualCostKnown ? money(evm.ac) : "n/a"}</div>
                <div><strong>{t("health.evm.cvBold")}</strong> {isCostMeasured ? signedMoney(evm.cv) : "n/a"}</div>
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
                    <span>{t("health.evm.spentOfBac", { percent: spentPercent, amount: money(evm.bac) })}</span>
                    <span>{isOverBudget ? t("health.shared.overBy", { amount: money(evm.ac - evm.bac) }) : t("health.evm.remaining", { amount: money(evm.bac - evm.ac) })}</span>
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
                <span className="kpi-accordion-title">{t("health.evm.progressPace")}</span>
                <span className="kpi-accordion-subtitle">
                  {t("health.evm.daysToFinish", { days: evm.daysRemaining, done: evm.taskCountCompleted, total: evm.taskCountTotal })}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value">{t("health.evm.progressWithSpi", { percent: evm.projectProgressPercent, spi: evm.spi })}</span>
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
                <div><strong>{t("health.evm.spiBold")}</strong> {evm.spi} {t("health.evm.spiTarget")}</div>
                <div><strong>{t("health.evm.svBold")}</strong> {hasCostData ? signedMoney(evm.sv) : "n/a"}</div>
                <div><strong>{t("health.evm.tasksCompletedBold")}</strong> {t("health.evm.completedOf", { done: evm.taskCountCompleted, total: evm.taskCountTotal })}</div>
                <div><strong>{t("health.evm.paceStatusBold")}</strong> {evm.projectPaceLabel}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                {t(PV_BASIS_LABELS[evm.pvBasis])} {!hasCostData && t("health.evm.durationWeightedNote")}
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
                <span className="kpi-accordion-title">{t("health.evm.cpiTitle")}</span>
                <span className="kpi-accordion-subtitle">
                  {isCostMeasured ? t("health.evm.budgetCoverage", { percent: coveragePercent }) : costUnavailableText}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value">{t("health.evm.cpiValue", { value: isCostMeasured ? evm.cpi : "n/a" })}</span>
              <span
                className="kpi-accordion-badge"
                style={{
                  background: isCostMeasured && evm.cpi >= 1.0 ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-warn) 15%, transparent)",
                  color: isCostMeasured && evm.cpi >= 1.0 ? "var(--jantt-status-good)" : "var(--jantt-status-warn)"
                }}
              >
                {isCostMeasured ? (evm.cpi >= 1.0 ? t("health.evm.efficient") : t("health.evm.underperforming")) : t("health.evm.noCostDataBadge")}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("cost") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>{t("health.evm.cpiBold")}</strong> {isCostMeasured ? evm.cpi : "n/a"}</div>
                <div><strong>{t("health.evm.cvBold")}</strong> {isCostMeasured ? signedMoney(evm.cv) : "n/a"}</div>
                <div><strong>{t("health.evm.tcpiBold")}</strong> {tcpiText}</div>
                <div><strong>{t("health.evm.crBold")}</strong> {isCostMeasured ? evm.criticalRatio : "n/a"}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                {isCostMeasured ? t("health.evm.cpiExplain") : costUnavailableHint}
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
                <span className="kpi-accordion-title">{t("health.evm.criticalPathTitle")}</span>
                <span className="kpi-accordion-subtitle">
                  {t("health.evm.nearCritical", { count: cpm.nearCriticalTaskIds.size })}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value" style={{ color: "var(--jantt-status-bad)" }}>
                {t("health.evm.criticalCount", { count: cpm.criticalTaskIds.size })}
              </span>
              <span
                className="kpi-accordion-badge"
                style={{
                  background: cpm.projectTotalFloat < 0 ? "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)" : "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)",
                  color: cpm.projectTotalFloat < 0 ? "var(--jantt-status-bad)" : "var(--jantt-status-good)"
                }}
              >
                {cpm.projectTotalFloat < 0
                  ? t("health.shared.floatPastTarget", { days: Math.abs(cpm.projectTotalFloat) })
                  : t("health.shared.floatBuffer", { days: cpm.projectTotalFloat })}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedKeys.has("critical") && (
            <div className="kpi-accordion-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                <div><strong>{t("health.evm.criticalTasksBold")}</strong> {cpm.criticalTaskIds.size}</div>
                <div><strong>{t("health.evm.nearCriticalTasksBold")}</strong> {cpm.nearCriticalTaskIds.size}</div>
                <div><strong>{t("health.evm.projectTotalFloatBold")}</strong> {t("health.shared.daysCount", { count: cpm.projectTotalFloat })}</div>
                <div><strong>{t("health.evm.forecastFinishBold")}</strong> {cpm.projectEarlyFinish || "-"}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                {t("health.evm.criticalExplain")}
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
                <span className="kpi-accordion-title">{t("health.evm.healthTitle")}</span>
                <span className="kpi-accordion-subtitle">
                  {evm.taskCountBlocked > 0 ? t("health.evm.tasksBlocked", { count: evm.taskCountBlocked }) : t("health.evm.zeroBlockers")}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span className="kpi-accordion-value">{t("health.evm.healthScore", { score: evm.healthScore })}</span>
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
                <div><strong>{t("health.evm.healthScoreBold")}</strong> {t("health.evm.healthScoreValue", { score: evm.healthScore })}</div>
                <div><strong>{t("health.evm.overallStatusBold")}</strong> {evm.overallHealth}</div>
                <div><strong>{t("health.evm.blockedTasksBold")}</strong> {evm.taskCountBlocked}</div>
                <div><strong>{t("health.evm.measuredOnBold")}</strong> {evm.statusDate}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                {t("health.evm.healthExplain")}
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
          <span>{showAdvancedEvm ? t("health.evm.hideAdvanced") : t("health.evm.showAdvanced")}</span>
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
                {t("health.evm.fullAnalysis")}
              </h4>
              <p style={{ fontSize: "11px", color: "var(--jantt-text-muted)", margin: "2px 0 0 0" }}>
                {t("health.evm.fullAnalysisDesc", { date: evm.statusDate })}{" "}
                {t(PV_BASIS_LABELS[evm.pvBasis])}
                {!hasCostData && <> {t("health.evm.durationWeightedNote")}</>}
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
                {t("health.evm.spiChip", { spi: evm.spi, detail: hasCostData ? t("health.evm.svValue", { amount: signedMoney(evm.sv) }) : t("health.evm.durationWeighted") })}
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
                  <span title={coveragePercent < 100 ? t("health.evm.coverageTitle", { percent: coveragePercent }) : undefined}>
                    {t("health.evm.cpiChip", { cpi: evm.cpi, cv: signedMoney(evm.cv) })}
                    {coveragePercent < 100 && <>{" "}{t("health.evm.basedOnBudget", { percent: coveragePercent })}</>}
                  </span>
                ) : (
                  <span title={costUnavailableHint}>{t("health.evm.cpiUnavailableChip", { text: costUnavailableText })}</span>
                )}
              </span>
            </div>
          </div>

          {/* EVM Metric Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{t("health.evm.cardPv")}</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }}>{hasCostData ? money(evm.pv) : t("health.evm.noCostData")}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>{t("health.evm.cardPvSub")}</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{t("health.evm.cardEv")}</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: hasCostData ? spiColor : MUTED }}>{hasCostData ? money(evm.ev) : t("health.evm.noCostData")}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>{t("health.evm.cardEvSub")}</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{t("health.evm.cardAc")}</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isOverBudget ? "var(--jantt-status-bad)" : "inherit" }}>{isActualCostKnown ? money(evm.ac) : "n/a"}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                {!isActualCostKnown
                  ? t("health.evm.noActualReported")
                  : isCostMeasured && coveragePercent < 100
                  ? t("health.evm.reportedOnBudget", { percent: coveragePercent })
                  : t("health.evm.cardAcSub")}
              </div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{t("health.evm.cardEac")}</div>
              <div
                style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isCostMeasured && evm.vac < 0 ? "var(--jantt-status-bad)" : "inherit" }}
                title={isCostMeasured ? undefined : costUnavailableHint}
              >
                {isCostMeasured ? money(evm.eac) : costUnavailableText}
              </div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                {isCostMeasured ? t("health.evm.vacValue", { amount: signedMoney(evm.vac) }) : t("health.evm.vacNa")}
              </div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{t("health.evm.cardTcpi")}</div>
              <div
                style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: isCostMeasured && !Number.isFinite(evm.tcpi) ? "var(--jantt-status-bad)" : "inherit" }}
                title={isCostMeasured ? undefined : costUnavailableHint}
              >
                {tcpiText}
              </div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>{t("health.evm.tcpiSub")}</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{t("health.evm.cardCr")}</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }} title={isCostMeasured ? undefined : costUnavailableHint}>
                {isCostMeasured ? evm.criticalRatio : costUnavailableText}
              </div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>{t("health.evm.crSub")}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
