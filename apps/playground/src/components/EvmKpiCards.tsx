import React, { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Zap,
  Sliders,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import type { EVMResult, CriticalPathResult } from "@jantt/core";

interface EvmKpiCardsProps {
  evm: EVMResult;
  cpm: CriticalPathResult;
}

export const EvmKpiCards: React.FC<EvmKpiCardsProps> = ({ evm, cpm }) => {
  const [showAdvancedEvm, setShowAdvancedEvm] = useState(false);

  const formatCurrency = (val: number) => `$${Math.round(val).toLocaleString()}`;

  const spiColor = evm.spi >= 1.0 ? "#10B981" : evm.spi >= 0.9 ? "#F59E0B" : "#EF4444";
  const cpiColor = evm.cpi >= 1.0 ? "#10B981" : evm.cpi >= 0.9 ? "#F59E0B" : "#EF4444";

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
            <span className="kpi-value">{formatCurrency(evm.bac)}</span>
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              Spent: <strong>{formatCurrency(evm.ac)}</strong> ({evm.bac > 0 ? Math.round((evm.ac / evm.bac) * 100) : 0}%)
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
              {evm.daysRemaining} days left • {evm.taskCountCompleted} of {evm.taskCountTotal} tasks done
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
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: cpm.projectTotalFloat < 0 ? "#EF444420" : "var(--jantt-surface)",
                  color: cpm.projectTotalFloat < 0 ? "#EF4444" : "var(--jantt-text-muted)"
                }}
              >
                {cpm.projectTotalFloat < 0 ? `${cpm.projectTotalFloat}d slack` : `${cpm.projectTotalFloat}d buffer`}
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

        {/* Card 4: Health & Blockers */}
        <div className="summary-kpi-card">
          <div className="kpi-icon-wrap" style={{ color: evm.taskCountBlocked > 0 ? "#F59E0B" : "#10B981" }}>
            <Zap size={20} />
          </div>
          <div className="kpi-data">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="kpi-label">Health &amp; Blockers</span>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)", fontWeight: 500 }}>
          {evm.projectPaceLabel}
        </span>
        <button
          onClick={() => setShowAdvancedEvm(!showAdvancedEvm)}
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
          <span>{showAdvancedEvm ? "Hide Advanced EVM Analytics" : "View Senior EVM Metrics (ANSI/EIA-748)"}</span>
        </button>
      </div>

      {/* 2. ADVANCED EARNED VALUE MANAGEMENT PANEL (For Senior PMs & Operations Research) */}
      {showAdvancedEvm && (
        <div
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
                Earned Value Management Analysis (ANSI/EIA-748)
              </h4>
              <p style={{ fontSize: "11px", color: "var(--jantt-text-muted)", margin: "2px 0 0 0" }}>
                Integrated cost and schedule performance indices with predictive completion forecasting.
              </p>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
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
                SPI: {evm.spi} ({evm.sv >= 0 ? "+" : ""}{formatCurrency(evm.sv)})
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
                CPI: {evm.cpi} ({evm.cv >= 0 ? "+" : ""}{formatCurrency(evm.cv)})
              </span>
            </div>
          </div>

          {/* EVM Metric Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Planned Value (PV)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }}>{formatCurrency(evm.pv)}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>Scheduled work budget</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Earned Value (EV)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: spiColor }}>{formatCurrency(evm.ev)}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>Value of completed work</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Actual Cost (AC)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }}>{formatCurrency(evm.ac)}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>Actual money spent</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Estimate at Finish (EAC)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px", color: evm.vac < 0 ? "#EF4444" : "inherit" }}>
                {formatCurrency(evm.eac)}
              </div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                VAC: {evm.vac >= 0 ? "+" : ""}{formatCurrency(evm.vac)}
              </div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>To-Complete Index (TCPI)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }}>{evm.tcpi}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>Efficiency needed to stay on budget</div>
            </div>

            <div style={{ padding: "10px", borderRadius: "6px", background: "var(--jantt-bg)", border: "1px solid var(--jantt-border)" }}>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Critical Ratio (CR)</div>
              <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--jantt-font-mono)", marginTop: "4px" }}>{evm.criticalRatio}</div>
              <div style={{ fontSize: "10px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>SPI × CPI composite</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
