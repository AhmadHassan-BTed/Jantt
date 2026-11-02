import React, { useState, useMemo } from "react";
import {
  X,
  Dice5,
  Play,
  TrendingUp,
  BarChart2
} from "lucide-react";
import type { JanttData, MonteCarloResult } from "@jantt/core";
import { runMonteCarloSimulation } from "@jantt/core";

export interface MonteCarloModalProps {
  show: boolean;
  onClose: () => void;
  parsedData: JanttData | null;
}

export const MonteCarloModal: React.FC<MonteCarloModalProps> = ({
  show,
  onClose,
  parsedData
}) => {
  const [iterations, setIterations] = useState<number>(2000);
  const [varianceFactor, setVarianceFactor] = useState<number>(0.25);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  const liveTasks = useMemo(() => {
    return (parsedData?.tasks || []).filter((t) => !t._deleted);
  }, [parsedData]);

  const handleRunSimulation = () => {
    if (!liveTasks.length) return;
    setIsSimulating(true);

    setTimeout(() => {
      try {
        const res = runMonteCarloSimulation(liveTasks, {
          iterations,
          defaultOptimisticVariance: varianceFactor * 0.8,
          defaultPessimisticVariance: varianceFactor * 1.4
        });
        setResult(res);
      } finally {
        setIsSimulating(false);
      }
    }, 50);
  };

  // Run automatically on first mount if no result
  React.useEffect(() => {
    if (show && !result && liveTasks.length > 0) {
      handleRunSimulation();
    }
  }, [show]);

  if (!show) return null;

  const riskBufferDays = result
    ? Math.max(result.percentiles.P95.durationDays - result.baselineDurationDays, 0)
    : 0;

  const scheduleRiskLevel =
    riskBufferDays > 14 ? "critical" : riskBufferDays > 7 ? "high" : riskBufferDays > 3 ? "medium" : "low";

  const riskColor =
    scheduleRiskLevel === "low"
      ? "#10B981"
      : scheduleRiskLevel === "medium"
      ? "#F59E0B"
      : "#EF4444";

  return (
    <div className="prompt-modal-backdrop" onClick={onClose}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "680px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(245, 158, 11, 0.15)",
                color: "#F59E0B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Dice5 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Monte Carlo Schedule Risk Analysis
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                Probabilistic simulation to calculate completion confidence intervals and task critical bottlenecks.
              </p>
            </div>
          </div>
          <button className="prompt-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Simulation Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--jantt-surface, #F8FAFC)",
              border: "1px solid var(--jantt-border, #E2E8F0)",
              borderRadius: "8px",
              padding: "12px 14px",
              gap: "12px",
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--jantt-text-muted)" }}>
                  SIMULATION RUNS
                </label>
                <select
                  value={iterations}
                  onChange={(e) => setIterations(Number(e.target.value))}
                  style={{
                    fontSize: "12px",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--jantt-border)",
                    background: "var(--jantt-bg)",
                    color: "var(--jantt-text)"
                  }}
                >
                  <option value={500}>500 runs</option>
                  <option value={1000}>1,000 runs</option>
                  <option value={2000}>2,000 runs (Recommended)</option>
                  <option value={5000}>5,000 runs (Deep Audit)</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--jantt-text-muted)" }}>
                  TASK UNCERTAINTY
                </label>
                <select
                  value={varianceFactor}
                  onChange={(e) => setVarianceFactor(Number(e.target.value))}
                  style={{
                    fontSize: "12px",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--jantt-border)",
                    background: "var(--jantt-bg)",
                    color: "var(--jantt-text)"
                  }}
                >
                  <option value={0.1}>Low (&plusmn;10% variance)</option>
                  <option value={0.25}>Standard (&plusmn;25% variance)</option>
                  <option value={0.4}>High (&plusmn;40% variance)</option>
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary"
              disabled={isSimulating || liveTasks.length === 0}
              onClick={handleRunSimulation}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                fontSize: "12.5px",
                fontWeight: 600
              }}
            >
              <Play size={14} />
              <span>{isSimulating ? "Simulating..." : "Run Monte Carlo"}</span>
            </button>
          </div>

          {/* Results Display */}
          {result && (
            <>
              {/* Top KPI Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
                <div
                  style={{
                    background: "var(--jantt-surface, #F8FAFC)",
                    border: "1px solid var(--jantt-border, #E2E8F0)",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", fontWeight: 600 }}>BASELINE DURATION</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--jantt-text)" }}>
                    {result.baselineDurationDays}d
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                    Finish: {result.baselineCompletionDate}
                  </div>
                </div>

                <div
                  style={{
                    background: "var(--jantt-surface, #F8FAFC)",
                    border: "1px solid var(--jantt-border, #E2E8F0)",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", fontWeight: 600 }}>P50 (MEDIAN)</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#3B82F6" }}>
                    {result.percentiles.P50.durationDays}d
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                    {result.percentiles.P50.completionDate}
                  </div>
                </div>

                <div
                  style={{
                    background: "var(--jantt-surface, #F8FAFC)",
                    border: "1px solid var(--jantt-border, #E2E8F0)",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", fontWeight: 600 }}>P80 CONFIDENCE</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#10B981" }}>
                    {result.percentiles.P80.durationDays}d
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                    {result.percentiles.P80.completionDate}
                  </div>
                </div>

                <div
                  style={{
                    background: "var(--jantt-surface, #F8FAFC)",
                    border: "1px solid var(--jantt-border, #E2E8F0)",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", fontWeight: 600 }}>P95 COMMITTED</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: riskColor }}>
                    {result.percentiles.P95.durationDays}d
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                    {result.percentiles.P95.completionDate}
                  </div>
                </div>
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
                  gap: "12px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <TrendingUp size={16} style={{ color: "#3B82F6", flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", color: "var(--jantt-text)" }}>
                    <strong>Recommended Contingency Buffer:</strong> Add{" "}
                    <strong>
                      {Math.max(result.percentiles.P90.durationDays - result.baselineDurationDays, 0)} days
                    </strong>{" "}
                    of buffer to achieve 90% confidence of on-time delivery.
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: `${riskColor}22`,
                    color: riskColor,
                    flexShrink: 0
                  }}
                >
                  Risk: {scheduleRiskLevel}
                </span>
              </div>

              {/* Criticality Index Table */}
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 700, marginBottom: "8px", color: "var(--jantt-text)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <BarChart2 size={14} />
                  <span>Task Criticality Bottlenecks (Top Critical Path Drivers)</span>
                </div>

                <div
                  style={{
                    background: "var(--jantt-surface, #F8FAFC)",
                    border: "1px solid var(--jantt-border, #E2E8F0)",
                    borderRadius: "8px",
                    overflow: "hidden"
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--jantt-border)", background: "var(--jantt-bg-muted, #F1F5F9)" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "11px", color: "var(--jantt-text-muted)" }}>TASK</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", width: "140px", fontSize: "11px", color: "var(--jantt-text-muted)" }}>CRITICALITY</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", width: "80px", fontSize: "11px", color: "var(--jantt-text-muted)" }}>PROBABILITY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.taskCriticality.slice(0, 7).map((item) => {
                        const pct = Math.round(item.criticalityIndex);
                        const barColor = pct >= 80 ? "#EF4444" : pct >= 50 ? "#F59E0B" : "#3B82F6";

                        return (
                          <tr key={item.taskId} style={{ borderBottom: "1px solid var(--jantt-border-subtle, #E2E8F0)" }}>
                            <td style={{ padding: "7px 12px", fontWeight: 500, color: "var(--jantt-text)" }}>
                              <span style={{ fontFamily: "monospace", color: "var(--jantt-text-muted)", marginRight: "6px" }}>
                                {item.taskId}
                              </span>
                              {item.label || item.taskId}
                            </td>
                            <td style={{ padding: "7px 12px" }}>
                              <div
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
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="prompt-modal-footer">
          <button className="btn-nav" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
