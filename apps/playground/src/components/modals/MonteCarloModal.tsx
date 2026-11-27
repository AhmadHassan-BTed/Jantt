/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dice5,
  Play,
  TrendingUp,
  BarChart2,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { FinishConfidence } from "./FinishConfidence";
import "../views/health.css";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey, MessageParams } from "../../i18n";
import { Modal, ModalHeader } from "./ModalHost";
import type { JanttData, MonteCarloResult, ScheduleWorkerClient, TaskCriticalityMetric } from "@jantt/core";
import { DEFAULT_GAP_DAYS, createScheduleWorkerClient } from "@jantt/core";
// Vite bundles the worker and hands back its URL (dev and build); see the worker file.
import monteCarloWorkerUrl from "../../workers/monteCarlo.worker?worker&url";

export interface MonteCarloModalProps {
  show: boolean;
  onClose: () => void;
  parsedData: JanttData | null;
}

/** Duration spread applied to tasks that carry no PERT estimate of their own (right-skewed, like real schedules). */
const UNCERTAINTY_PRESETS = [
  { id: "low", optimistic: 0.08, pessimistic: 0.14 },
  { id: "standard", optimistic: 0.2, pessimistic: 0.35 },
  { id: "high", optimistic: 0.32, pessimistic: 0.56 }
] as const;

type UncertaintyId = (typeof UNCERTAINTY_PRESETS)[number]["id"];

const ITERATION_OPTIONS: number[] = [500, 1000, 2000, 5000];

const TOP_DRIVER_COUNT = 7;

/** A deep run of a large plan on a slow device can take a while; past this the run is reported as failed. */
const SIMULATION_TIMEOUT_MS = 120_000;

const describeSimulationError = (err: unknown, t: (key: MessageKey, params?: MessageParams) => string): string => {
  if (err instanceof Error && err.name === "TimeoutError") {
    return t("montecarlo.error.timeout");
  }
  return err instanceof Error && err.message ? err.message : t("montecarlo.error.unknown");
};

const formatPct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** Tasks most often on the critical path first; duration sensitivity breaks ties. Never-critical tasks are not drivers. */
const rankCriticalityDrivers = (metrics: TaskCriticalityMetric[]) =>
  metrics
    .filter((m) => m.criticalityIndex > 0)
    .sort((a, b) => b.criticalityIndex - a.criticalityIndex || b.sensitivityIndex - a.sensitivityIndex)
    .slice(0, TOP_DRIVER_COUNT);

interface SimulationRun {
  planSignature: string;
  iterations: number;
  uncertainty: UncertaintyId;
  result: MonteCarloResult;
}

const kpiCardStyle: React.CSSProperties = {
  background: "var(--jantt-surface, #F8FAFC)",
  border: "1px solid var(--jantt-border, #E2E8F0)",
  borderRadius: "8px",
  padding: "10px 12px"
};

const selectStyle: React.CSSProperties = {
  fontSize: "12px",
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid var(--jantt-border)",
  background: "var(--jantt-bg)",
  color: "var(--jantt-text)"
};

export const MonteCarloModal: React.FC<MonteCarloModalProps> = ({
  show,
  onClose,
  parsedData
}) => {
  const { t, locale } = useI18n();
  const uncertaintyLabel = (id: UncertaintyId) =>
    id === "low"
      ? t("montecarlo.uncertainty.low")
      : id === "high"
      ? t("montecarlo.uncertainty.high")
      : t("montecarlo.uncertainty.standard");
  const iterationLabel = (value: number) =>
    value === 500
      ? t("montecarlo.runs500")
      : value === 1000
      ? t("montecarlo.runs1000")
      : value === 5000
      ? t("montecarlo.runs5000")
      : t("montecarlo.runs2000");
  const riskLevelLabel = (level: string) =>
    level === "critical"
      ? t("montecarlo.risk.critical")
      : level === "high"
      ? t("montecarlo.risk.high")
      : level === "medium"
      ? t("montecarlo.risk.medium")
      : t("montecarlo.risk.low");
  const [iterations, setIterations] = useState<number>(2000);
  const [uncertainty, setUncertainty] = useState<UncertaintyId>("standard");
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const runSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  // One worker per open dialog, created on the first run.
  const clientRef = useRef<ScheduleWorkerClient | null>(null);

  const liveTasks = useMemo(() => {
    return (parsedData?.tasks || []).filter((t) => !t._deleted);
  }, [parsedData]);
  // Same default gap as the schedule cascade, so simulated overruns propagate like real ones.
  const rawGapDays = parsedData?.meta?.defaultGapDays;
  const gapDays = typeof rawGapDays === "number" && Number.isFinite(rawGapDays) ? rawGapDays : DEFAULT_GAP_DAYS;

  // Content signature of the simulated schedule; only computed while the dialog is visible.
  const planSignature = useMemo(
    () => (show ? `${gapDays}|${JSON.stringify(liveTasks)}` : ""),
    [show, gapDays, liveTasks]
  );

  // Terminating is the only way to stop a simulation that is already running in the worker.
  const disposeWorker = useCallback(() => {
    clientRef.current?.terminate();
    clientRef.current = null;
  }, []);

  const cancelPendingRun = useCallback(() => {
    runSeqRef.current += 1;
    if (inFlightRef.current) {
      inFlightRef.current = false;
      disposeWorker();
    }
    setIsSimulating(false);
  }, [disposeWorker]);

  const handleRunSimulation = useCallback(() => {
    if (!liveTasks.length) return;
    cancelPendingRun();
    const seq = runSeqRef.current;
    const preset = UNCERTAINTY_PRESETS.find((p) => p.id === uncertainty) ?? UNCERTAINTY_PRESETS[1];
    const snapshot = { planSignature, iterations, uncertainty };
    setIsSimulating(true);
    setError(null);
    inFlightRef.current = true;

    // Results of a cancelled run (dialog closed, newer run started) are dropped.
    const settle = (apply: () => void) => {
      if (seq !== runSeqRef.current) return;
      inFlightRef.current = false;
      apply();
      setIsSimulating(false);
    };

    // Without Worker support the client runs the same code asynchronously on the main thread.
    const client = (clientRef.current ??= createScheduleWorkerClient(monteCarloWorkerUrl, {
      timeoutMs: SIMULATION_TIMEOUT_MS
    }));
    client
      .runMonteCarlo(liveTasks, {
        iterations,
        defaultOptimisticVariance: preset.optimistic,
        defaultPessimisticVariance: preset.pessimistic,
        defaultGapDays: gapDays
      })
      .then(
        (next: MonteCarloResult) => settle(() => setRun({ ...snapshot, result: next })),
        (err: unknown) =>
          settle(() => {
            console.error("Monte Carlo simulation failed:", err);
            // A timed-out worker is still busy; the next run gets a fresh one.
            if (err instanceof Error && err.name === "TimeoutError") disposeWorker();
            setError(describeSimulationError(err, t));
          })
      );
  }, [liveTasks, gapDays, iterations, uncertainty, planSignature, cancelPendingRun, disposeWorker, t]);

  const isPlanStale = run !== null && run.planSignature !== planSignature;
  const isSettingsStale = run !== null && (run.iterations !== iterations || run.uncertainty !== uncertainty);

  // On open: keep a result that still matches the plan (and its random draw); otherwise drop it,
  // so another plan's (or an older version's) numbers never show, and re-run.
  // On close: stop in-flight work and release the worker thread.
  useEffect(() => {
    if (!show) {
      cancelPendingRun();
      disposeWorker();
      return;
    }
    if (run && run.planSignature === planSignature) return;
    setRun(null);
    setError(null);
    handleRunSimulation();
    // Only the open/close transition triggers this; later changes surface as a stale banner instead.
  }, [show]);

  useEffect(
    () => () => {
      cancelPendingRun();
      disposeWorker();
    },
    [cancelPendingRun, disposeWorker]
  );

  const result = run?.result ?? null;
  const p50 = result?.percentiles.P50;
  const p80 = result?.percentiles.P80;
  const p90 = result?.percentiles.P90;
  const p95 = result?.percentiles.P95;
  const hasResult = Boolean(result && result.iterations > 0 && p50 && p80 && p90 && p95);

  const topDrivers = useMemo(
    () => (result ? rankCriticalityDrivers(result.taskCriticality) : []),
    [result]
  );

  if (!show) return null;

  const riskBufferDays = hasResult && p95 && result
    ? Math.max(p95.durationDays - result.baselineDurationDays, 0)
    : 0;

  const scheduleRiskLevel =
    riskBufferDays > 14 ? "critical" : riskBufferDays > 7 ? "high" : riskBufferDays > 3 ? "medium" : "low";

  const riskColor =
    scheduleRiskLevel === "low"
      ? "var(--jantt-status-good)"
      : scheduleRiskLevel === "medium"
      ? "var(--jantt-status-warn)"
      : "var(--jantt-status-bad)";

  const kpis = hasResult && result && p50 && p80 && p95
    ? [
        { label: t("montecarlo.kpi.planned"), value: result.baselineDurationDays, sub: t("montecarlo.kpi.finish", { date: result.baselineCompletionDate }), color: "var(--jantt-text)" },
        { label: t("montecarlo.kpi.p50"), value: p50.durationDays, sub: p50.completionDate, color: "var(--jantt-status-info)" },
        { label: t("montecarlo.kpi.p80"), value: p80.durationDays, sub: p80.completionDate, color: "var(--jantt-status-good)" },
        { label: t("montecarlo.kpi.p95"), value: p95.durationDays, sub: p95.completionDate, color: riskColor }
      ]
    : [];

  const staleMessage = isPlanStale
    ? t("montecarlo.stalePlan")
    : isSettingsStale
    ? t("montecarlo.staleSettings")
    : null;

  return (
    <Modal onClose={onClose} maxWidth={680}>
      <ModalHeader
        icon={<Dice5 size={18} />}
        title={t("montecarlo.title")}
        subtitle={t("montecarlo.subtitle")}
      />

      {/* Content */}
      <div className="prompt-modal-body risk-simulation" style={{ padding: "16px 20px", gap: "16px" }}>
        {/* Simulation Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            background: "var(--jantt-surface, #F8FAFC)",
            border: "1px solid var(--jantt-border, #E2E8F0)",
            borderRadius: "8px",
            padding: "12px 14px",
            gap: "12px",
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label htmlFor="mc-iterations" style={{ fontSize: "11px", fontWeight: 600, color: "var(--jantt-text-muted)" }}>
                {t("montecarlo.runsLabel")}
              </label>
              <select
                id="mc-iterations"
                value={iterations}
                disabled={isSimulating}
                onChange={(e) => setIterations(Number(e.target.value))}
                style={selectStyle}
              >
                {ITERATION_OPTIONS.map((value) => (
                  <option key={value} value={value}>{iterationLabel(value)}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label htmlFor="mc-uncertainty" style={{ fontSize: "11px", fontWeight: 600, color: "var(--jantt-text-muted)" }}>
                {t("montecarlo.uncertaintyLabel")}
              </label>
              <input type="range" id="mc-uncertainty" min="0" max={UNCERTAINTY_PRESETS.length - 1} step="1"
                value={UNCERTAINTY_PRESETS.findIndex(preset => preset.id === uncertainty)}
                disabled={isSimulating} aria-valuetext={uncertaintyLabel(uncertainty)}
                onChange={event => setUncertainty(UNCERTAINTY_PRESETS[Number(event.target.value)].id)}
                aria-describedby="mc-uncertainty-hint" />
              {UNCERTAINTY_PRESETS.filter(preset => preset.id === uncertainty).map(preset =>
                <output htmlFor="mc-uncertainty" key={preset.id}>{t("montecarlo.uncertaintyRange", {
                  label: uncertaintyLabel(preset.id),
                  optimistic: formatPct(preset.optimistic),
                  pessimistic: formatPct(preset.pessimistic)
                })}</output>)}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {isSimulating && (
              <button type="button" className="btn-nav" onClick={cancelPendingRun} style={{ height: "34px" }}>
                {t("common.cancel")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSimulating || liveTasks.length === 0}
              onClick={handleRunSimulation}
              aria-busy={isSimulating}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                fontSize: "12.5px",
                fontWeight: 600
              }}
            >
              {isSimulating ? <RefreshCw size={14} className="spin-sync-icon" /> : <Play size={14} />}
              <span>{isSimulating ? t("montecarlo.simulating") : run ? t("montecarlo.rerun") : t("montecarlo.run")}</span>
            </button>
          </div>

          <p id="mc-uncertainty-hint" style={{ flexBasis: "100%", margin: 0, fontSize: "11px", color: "var(--jantt-text-muted)" }}>
            {t("montecarlo.uncertaintyHint.before")}
            <code>pert</code>
            {t("montecarlo.uncertaintyHint.or")}
            <code>optimistic</code>/<code>pessimistic</code>
            {t("montecarlo.uncertaintyHint.after")}
          </p>
        </div>

        {liveTasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 12px", fontSize: "12.5px", color: "var(--jantt-text-muted)" }}>
            {t("montecarlo.empty")}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "12px",
              color: "var(--jantt-text)"
            }}
          >
            <AlertTriangle size={16} style={{ color: "var(--jantt-status-bad)", flexShrink: 0, marginTop: "1px" }} />
            <span>
              <strong>{t("montecarlo.failedTitle")}</strong> {error}
              {result ? ` ${t("montecarlo.previousResults")}` : ""}
            </span>
          </div>
        )}

        {staleMessage && hasResult && !isSimulating && (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              flexWrap: "wrap",
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "12px",
              color: "var(--jantt-text)"
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <AlertTriangle size={14} style={{ color: "var(--jantt-status-warn)", flexShrink: 0 }} />
              <span><strong>{t("montecarlo.staleTitle")}</strong> {staleMessage}</span>
            </span>
            <button type="button" className="btn-nav" onClick={handleRunSimulation} style={{ height: "28px" }}>
              <RefreshCw size={12} />
              <span>{t("montecarlo.rerunShort")}</span>
            </button>
          </div>
        )}

        {/* Results Display */}
        {hasResult && result && p90 && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px", opacity: staleMessage || isSimulating ? 0.6 : 1 }}
            aria-busy={isSimulating}
          >
            <FinishConfidence result={result} />
            {/* Top KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
              {kpis.map((kpi) => (
                <div key={kpi.label} style={kpiCardStyle}>
                  <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", fontWeight: 600 }}>{kpi.label}</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: kpi.color }}>{t("montecarlo.daysValue", { value: kpi.value })}</div>
                  <div style={{ fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* Schedule Buffer Recommendation Box */}
            <div
              style={{
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                borderRadius: "8px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 260px" }}>
                <TrendingUp size={16} style={{ color: "var(--jantt-status-info)", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "var(--jantt-text)" }}>
                  <strong>{t("montecarlo.buffer.title")}</strong> {t("montecarlo.buffer.before")}{" "}
                  <strong>
                    {t("montecarlo.buffer.days", {
                      count: Math.max(p90.durationDays - result.baselineDurationDays, 0)
                    })}
                  </strong>
                  {t("montecarlo.buffer.after", { runs: result.iterations.toLocaleString(locale) })}
                </span>
              </div>
              <span
                title={t("montecarlo.risk.title")}
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: `color-mix(in srgb, ${riskColor} 13%, transparent)`,
                  color: riskColor,
                  flexShrink: 0
                }}
              >
                {t("montecarlo.risk.value", { level: riskLevelLabel(scheduleRiskLevel) })}
              </span>
            </div>

            {/* Criticality Index Table */}
            <div>
              <div style={{ fontSize: "12.5px", fontWeight: 700, marginBottom: "8px", color: "var(--jantt-text)", display: "flex", alignItems: "center", gap: "6px" }}>
                <BarChart2 size={14} />
                <span>{t("montecarlo.drivers.title")}</span>
                <span style={{ fontWeight: 500, fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                  {t("montecarlo.drivers.subtitle")}
                </span>
              </div>

              <div
                style={{
                  background: "var(--jantt-surface, #F8FAFC)",
                  border: "1px solid var(--jantt-border, #E2E8F0)",
                  borderRadius: "8px",
                  overflowX: "auto"
                }}
              >
                {topDrivers.length === 0 ? (
                  <div style={{ padding: "14px", fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                    {t("montecarlo.drivers.empty")}
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--jantt-border)", background: "var(--jantt-surface-hover, #F1F5F9)" }}>
                        <th scope="col" style={{ padding: "8px 12px", textAlign: "left", fontSize: "11px", color: "var(--jantt-text-muted)" }}>{t("montecarlo.table.task")}</th>
                        <th scope="col" style={{ padding: "8px 12px", textAlign: "left", width: "140px", fontSize: "11px", color: "var(--jantt-text-muted)" }}>{t("montecarlo.table.criticality")}</th>
                        <th scope="col" style={{ padding: "8px 12px", textAlign: "right", width: "80px", fontSize: "11px", color: "var(--jantt-text-muted)" }}>{t("montecarlo.table.onCriticalPath")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDrivers.map((item) => {
                        const pct = Math.round(item.criticalityIndex);
                        const barColor = pct >= 80 ? "var(--jantt-status-bad)" : pct >= 50 ? "var(--jantt-status-warn)" : "var(--jantt-status-info)";

                        return (
                          <tr key={item.taskId} style={{ borderBottom: "1px solid var(--jantt-border-subtle, #E2E8F0)" }}>
                            <td style={{ padding: "7px 12px", fontWeight: 500, color: "var(--jantt-text)", wordBreak: "break-word" }}>
                              <span style={{ fontFamily: "monospace", color: "var(--jantt-text-muted)", marginRight: "6px" }}>
                                {item.taskId}
                              </span>
                              {item.label || item.taskId}
                            </td>
                            <td style={{ padding: "7px 12px" }}>
                              <div
                                role="presentation"
                                style={{
                                  width: "100%",
                                  height: "6px",
                                  borderRadius: "3px",
                                  background: "var(--jantt-border)",
                                  overflow: "hidden"
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.min(pct, 100)}%`,
                                    height: "100%",
                                    background: barColor,
                                    borderRadius: "3px"
                                  }}
                                />
                              </div>
                            </td>
                            <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: barColor }}>
                              {pct}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="prompt-modal-footer" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn-nav" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
};
