import React, { useMemo, useState } from "react";
import type { JanttData, EVMResult, CriticalPathResult } from "@jantt/core";
import { diffDays, addDays } from "@jantt/core";
import { TrendingUp } from "lucide-react";

interface EvmSCurveChartProps {
  parsedData: JanttData;
  evm: EVMResult;
  cpm: CriticalPathResult;
}

interface SPoint {
  date: string;
  dayIndex: number;
  pv: number;
  ev: number;
  ac: number;
}

export const EvmSCurveChart: React.FC<EvmSCurveChartProps> = ({ parsedData, evm }) => {
  const [hoveredPoint, setHoveredPoint] = useState<SPoint | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const tasks = useMemo(() => {
    return (parsedData.tasks || []).filter((t) => !t._deleted && t.start && t.end);
  }, [parsedData.tasks]);

  const { points, minDate, maxDate, maxVal } = useMemo(() => {
    if (tasks.length === 0) {
      return { points: [], minDate: "2026-01-01", maxDate: "2026-12-31", maxVal: 10000 };
    }

    let minD = tasks[0].start;
    let maxD = tasks[0].end;
    for (const t of tasks) {
      if (t.start < minD) minD = t.start;
      if (t.end > maxD) maxD = t.end;
    }

    const totalDays = Math.max(1, diffDays(minD, maxD));
    const stepDays = Math.max(1, Math.floor(totalDays / 16));
    const totalBac = Math.max(1, evm.bac);

    const pts: SPoint[] = [];
    const today = new Date().toISOString().split("T")[0];

    for (let d = 0; d <= totalDays; d += stepDays) {
      const curDate = addDays(minD, d);

      // Calculate planned value up to curDate
      let curPv = 0;
      let curEv = 0;
      let curAc = 0;

      for (const t of tasks) {
        const taskBudget = typeof t.estimatedCost === "number" ? t.estimatedCost : 1000;
        const taskActualCost = typeof t.actualCost === "number" ? t.actualCost : taskBudget * 0.9;
        if (curDate >= t.end) {
          curPv += taskBudget;
        } else if (curDate > t.start) {
          const tTotal = Math.max(1, diffDays(t.start, t.end));
          const tPassed = diffDays(t.start, curDate);
          curPv += taskBudget * Math.min(1, tPassed / tTotal);
        }

        // EV and AC only up to today (or end of project if past)
        if (curDate <= today || d === totalDays) {
          const prog = t.progress || 0;
          if (curDate >= t.end) {
            curEv += taskBudget * prog;
            curAc += taskActualCost * prog;
          } else if (curDate > t.start) {
            const tTotal = Math.max(1, diffDays(t.start, t.end));
            const tPassed = diffDays(t.start, curDate);
            const ratio = Math.min(1, tPassed / tTotal);
            curEv += taskBudget * prog * ratio;
            curAc += taskActualCost * prog * ratio;
          }
        }
      }

      pts.push({
        date: curDate,
        dayIndex: d,
        pv: Math.min(totalBac, curPv),
        ev: Math.min(totalBac, curEv),
        ac: curAc
      });
    }

    const highestVal = Math.max(totalBac, evm.eac || totalBac, ...pts.map((p) => Math.max(p.pv, p.ev, p.ac)));

    return {
      points: pts,
      minDate: minD,
      maxDate: maxD,
      maxVal: highestVal * 1.1
    };
  }, [tasks, evm.bac, evm.eac]);

  if (points.length < 2) return null;

  const width = 640;
  const height = 220;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 30;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (idx: number) => padLeft + (idx / (points.length - 1)) * chartW;
  const getY = (val: number) => padTop + chartH - (val / maxVal) * chartH;

  // Build SVG Paths
  const pvPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.pv)}`).join(" ");
  const evPath = points.filter((p) => p.ev > 0 || p.dayIndex === 0).map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.ev)}`).join(" ");
  const acPath = points.filter((p) => p.ac > 0 || p.dayIndex === 0).map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.ac)}`).join(" ");

  const formatCurrency = (val: number) => `$${Math.round(val).toLocaleString()}`;

  return (
    <div
      style={{
        borderRadius: "8px",
        background: "var(--jantt-surface, #0B132B)",
        border: "1px solid var(--jantt-border, #1E293B)",
        padding: "16px 20px",
        marginBottom: "20px"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <TrendingUp size={16} style={{ color: "#38BDF8" }} />
          <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "var(--jantt-text, #F8FAFC)" }}>
            Earned Value S-Curve (ANSI/EIA-748 Standard)
          </h4>
        </div>
        {/* Legends */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "12px", height: "3px", background: "#38BDF8", borderRadius: "2px" }} />
            <span style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>Planned Value (PV)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "12px", height: "3px", background: "#10B981", borderRadius: "2px" }} />
            <span style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>Earned Value (EV)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "12px", height: "3px", background: "#F59E0B", borderRadius: "2px" }} />
            <span style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>Actual Cost (AC)</span>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", minWidth: "480px", display: "block" }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            if (relX >= padLeft && relX <= padLeft + chartW) {
              const ratio = (relX - padLeft) / chartW;
              const idx = Math.round(ratio * (points.length - 1));
              setHoveredPoint(points[idx] || null);
              setHoverX(getX(idx));
            }
          }}
          onMouseLeave={() => {
            setHoveredPoint(null);
            setHoverX(null);
          }}
        >
          {/* Horizontal Grid lines & Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const y = padTop + chartH * (1 - pct);
            const val = maxVal * pct;
            return (
              <g key={i}>
                <line x1={padLeft} y1={y} x2={padLeft + chartW} y2={y} stroke="rgba(255, 255, 255, 0.06)" strokeDasharray="3 3" />
                <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize="9.5" fill="#64748B" fontFamily="monospace">
                  {formatCurrency(val)}
                </text>
              </g>
            );
          })}

          {/* PV Curve (Planned Value) */}
          <path d={pvPath} fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* EV Curve (Earned Value) */}
          <path d={evPath} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* AC Curve (Actual Cost) */}
          <path d={acPath} fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Crosshair indicator on hover */}
          {hoverX !== null && hoveredPoint && (
            <g>
              <line x1={hoverX} y1={padTop} x2={hoverX} y2={padTop + chartH} stroke="rgba(255, 255, 255, 0.3)" strokeDasharray="2 2" />
              <circle cx={hoverX} cy={getY(hoveredPoint.pv)} r={4} fill="#38BDF8" stroke="#0B132B" strokeWidth={1.5} />
              <circle cx={hoverX} cy={getY(hoveredPoint.ev)} r={4} fill="#10B981" stroke="#0B132B" strokeWidth={1.5} />
              <circle cx={hoverX} cy={getY(hoveredPoint.ac)} r={4} fill="#F59E0B" stroke="#0B132B" strokeWidth={1.5} />
            </g>
          )}

          {/* Date Axis Labels */}
          <text x={padLeft} y={height - 8} fontSize="10" fill="#64748B" fontFamily="monospace">
            {minDate}
          </text>
          <text x={padLeft + chartW} y={height - 8} textAnchor="end" fontSize="10" fill="#64748B" fontFamily="monospace">
            {maxDate}
          </text>
        </svg>

        {/* Hover Data Card */}
        {hoveredPoint && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 12,
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid #334155",
              borderRadius: "6px",
              padding: "6px 12px",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              pointerEvents: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
            }}
          >
            <span style={{ color: "#94A3B8" }}>Date: <strong>{hoveredPoint.date}</strong></span>
            <span style={{ color: "#38BDF8" }}>PV: <strong>{formatCurrency(hoveredPoint.pv)}</strong></span>
            <span style={{ color: "#10B981" }}>EV: <strong>{formatCurrency(hoveredPoint.ev)}</strong></span>
            <span style={{ color: "#F59E0B" }}>AC: <strong>{formatCurrency(hoveredPoint.ac)}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
};

