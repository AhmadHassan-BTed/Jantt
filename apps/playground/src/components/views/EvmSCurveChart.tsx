import React, { useEffect, useMemo, useRef, useState } from "react";
import type { JanttData, EVMAnalysis, Task } from "@jantt/core";
import { diffDays, addDays, getTodayISODate, isValidISODate } from "@jantt/core";
import { TrendingUp } from "lucide-react";
import { formatMoney } from "./EvmKpiCards";
import { useI18n } from "../../i18n/I18nProvider";

interface EvmSCurveChartProps {
  parsedData: JanttData;
  /** Core EVM result; EV, AC, BAC and the status date are taken from it so the chart matches the KPI cards. */
  evm: EVMAnalysis;
  currency?: string;
}

export interface SCurvePoint {
  date: string;
  dayIndex: number;
  /** Cumulative planned value (budget scheduled to be earned by `date`). */
  pv: number;
}

export interface SCurveSeries {
  points: SCurvePoint[];
  minDate: string;
  maxDate: string;
  totalDays: number;
  /** Sum of task budgets (the value the planned curve ends on). */
  bac: number;
}

const TARGET_POINTS = 16;

const costOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0);

/** Planned window used for PV: the baseline when valid, else current dates (as core calculateEVM). */
function plannedWindow(task: Task): { start: string; end: string } | null {
  const b = task.baseline;
  if (b && isValidISODate(b.start) && isValidISODate(b.end)) return { start: b.start, end: b.end };
  if (isValidISODate(task.start) && isValidISODate(task.end)) return { start: task.start, end: task.end };
  return null;
}

function plannedFraction(window: { start: string; end: string }, date: string): number {
  if (date >= window.end) return 1;
  if (date <= window.start) return 0;
  return Math.min(1, Math.max(0, diffDays(window.start, date) / Math.max(1, diffDays(window.start, window.end))));
}

/**
 * Time-phased planned value (PV) from project start to finish, sampled at ~16 points and always
 * ending exactly on the last planned finish. Malformed costs count as 0 instead of NaN.
 */
export function computePlannedValueSeries(tasks: Task[]): SCurveSeries | null {
  const planned: Array<{ window: { start: string; end: string }; budget: number }> = [];
  for (const t of tasks || []) {
    if (!t || t._deleted) continue;
    const window = plannedWindow(t);
    if (window) planned.push({ window, budget: costOf(t.estimatedCost) });
  }
  if (planned.length === 0) return null;

  let minDate = planned[0].window.start;
  let maxDate = planned[0].window.end;
  for (const { window } of planned) {
    if (window.start < minDate) minDate = window.start;
    if (window.end > maxDate) maxDate = window.end;
  }

  const totalDays = Math.max(1, diffDays(minDate, maxDate));
  const stepDays = Math.max(1, Math.floor(totalDays / TARGET_POINTS));
  const dayIndices: number[] = [];
  for (let d = 0; d < totalDays; d += stepDays) dayIndices.push(d);
  dayIndices.push(totalDays);

  const points = dayIndices.map((dayIndex) => {
    const date = addDays(minDate, dayIndex);
    let pv = 0;
    for (const { window, budget } of planned) pv += budget * plannedFraction(window, date);
    return { date, dayIndex, pv };
  });

  return {
    points,
    minDate,
    maxDate,
    totalDays,
    bac: planned.reduce((sum, p) => sum + p.budget, 0)
  };
}

const COLORS = { pv: "#38BDF8", ev: "#10B981", ac: "#F59E0B" };

export const EvmSCurveChart: React.FC<EvmSCurveChartProps> = ({ parsedData, evm, currency }) => {
  const { t, locale } = useI18n();
  const [hoveredPoint, setHoveredPoint] = useState<SCurvePoint | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(640);
  const series = useMemo(() => computePlannedValueSeries(parsedData.tasks || []), [parsedData.tasks]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(([entry]) => setChartWidth(Math.max(220, Math.min(640, entry.contentRect.width))));
    resize.observe(chart);
    return () => resize.disconnect();
  }, [Boolean(series?.bac)]);
  const statusDate = isValidISODate(evm.statusDate) ? evm.statusDate : getTodayISODate();
  const money = (val: number) => formatMoney(val, currency, false, locale);

  const cardStyle: React.CSSProperties = {
    borderRadius: "8px",
    background: "var(--jantt-surface, #0B132B)",
    border: "1px solid var(--jantt-border, #1E293B)",
    padding: "16px 20px",
    marginBottom: "20px"
  };

  const heading = (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <TrendingUp size={16} style={{ color: COLORS.pv }} />
      <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "var(--jantt-text, #F8FAFC)" }}>
        {t("health.scurve.title")}
      </h4>
    </div>
  );

  if (!series) return null;

  const bac = Number.isFinite(evm.bac) ? evm.bac : series.bac;
  if (!(bac > 0) || !(series.bac > 0)) {
    return (
      <div style={cardStyle}>
        {heading}
        <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--jantt-text-muted)" }}>
          {t("health.scurve.addCostBefore")} <code>estimatedCost</code> {t("health.scurve.addCostAfter")}
        </p>
      </div>
    );
  }

  const ev = Number.isFinite(evm.ev) ? evm.ev : 0;
  const ac = Number.isFinite(evm.ac) ? evm.ac : 0;
  // No reported actualCost means AC is unknown: show no point rather than a fabricated $0.
  const hasActualCost = evm.costCoverage > 0 || ac > 0;
  const pvNow = Number.isFinite(evm.pv) ? evm.pv : 0;

  const width = chartWidth;
  const height = width < 420 ? 166 : 220;
  const padLeft = 64;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = Math.max(1, bac, series.bac, ev, ac, Number.isFinite(evm.eac) ? evm.eac : 0) * 1.1;
  const xForDay = (dayIndex: number) => padLeft + (dayIndex / series.totalDays) * chartW;
  const getY = (val: number) => padTop + chartH - (val / maxVal) * chartH;

  const pvPath = series.points.map((p, i) => `${i === 0 ? "M" : "L"} ${xForDay(p.dayIndex)} ${getY(p.pv)}`).join(" ");
  const statusDayIndex = Math.min(series.totalDays, Math.max(0, diffDays(series.minDate, statusDate)));
  const statusX = xForDay(statusDayIndex);
  const statusInRange = statusDate >= series.minDate && statusDate <= series.maxDate;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "8px" }}>
        {heading}
        {/* Legends */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "11px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "12px", height: "3px", background: COLORS.pv, borderRadius: "2px" }} />
            <span style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>{t("health.scurve.legendPv")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "8px", height: "8px", background: COLORS.ev, borderRadius: "50%" }} />
            <span style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>{t("health.scurve.legendEv", { amount: money(ev) })}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "8px", height: "8px", background: COLORS.ac, borderRadius: "50%" }} />
            <span style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>{t("health.scurve.legendAc", { amount: hasActualCost ? money(ac) : "n/a" })}</span>
          </div>
        </div>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--jantt-text-muted)" }}>
        {t("health.scurve.description", { date: statusDate })}
      </p>

      <div ref={chartRef} style={{ position: "relative", width: "100%" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("health.scurve.aria", {
            bac: money(series.bac),
            maxDate: series.maxDate,
            statusDate,
            pv: money(pvNow),
            ev: money(ev),
            ac: hasActualCost ? money(ac) : t("health.scurve.actualNotReported")
          })}
          style={{ width: "100%", height: "auto", display: "block" }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            if (relX < padLeft || relX > padLeft + chartW) return;
            const day = ((relX - padLeft) / chartW) * series.totalDays;
            let nearest = series.points[0];
            for (const p of series.points) {
              if (Math.abs(p.dayIndex - day) < Math.abs(nearest.dayIndex - day)) nearest = p;
            }
            setHoveredPoint(nearest);
          }}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Horizontal Grid lines & Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const y = padTop + chartH * (1 - pct);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + chartW}
                  y2={y}
                  style={{ stroke: "var(--jantt-border, rgba(255, 255, 255, 0.06))" }}
                  strokeDasharray="3 3"
                />
                <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize="9.5" fill="var(--jantt-text-muted)" fontFamily="monospace">
                  {money(maxVal * pct)}
                </text>
              </g>
            );
          })}

          {/* Budget at completion reference */}
          <line x1={padLeft} y1={getY(series.bac)} x2={padLeft + chartW} y2={getY(series.bac)} stroke={COLORS.pv} strokeOpacity={0.35} strokeDasharray="6 4" />

          {/* PV Curve (Planned Value) */}
          <path d={pvPath} fill="none" stroke={COLORS.pv} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Status date marker with measured EV / AC */}
          {statusInRange && (
            <line x1={statusX} y1={padTop} x2={statusX} y2={padTop + chartH} stroke="#94A3B8" strokeOpacity={0.6} strokeDasharray="2 3" />
          )}
          {hasActualCost && (
            <circle cx={statusX} cy={getY(ac)} r={5} fill={COLORS.ac} stroke="#0B132B" strokeWidth={1.5}>
              <title>{t("health.scurve.actualTitle", { date: statusDate, amount: money(ac) })}</title>
            </circle>
          )}
          <circle cx={statusX} cy={getY(ev)} r={5} fill={COLORS.ev} stroke="#0B132B" strokeWidth={1.5}>
            <title>{t("health.scurve.earnedTitle", { date: statusDate, amount: money(ev) })}</title>
          </circle>

          {/* Crosshair indicator on hover */}
          {hoveredPoint && (
            <g>
              <line x1={xForDay(hoveredPoint.dayIndex)} y1={padTop} x2={xForDay(hoveredPoint.dayIndex)} y2={padTop + chartH} stroke="rgba(148, 163, 184, 0.5)" strokeDasharray="2 2" />
              <circle cx={xForDay(hoveredPoint.dayIndex)} cy={getY(hoveredPoint.pv)} r={4} fill={COLORS.pv} stroke="#0B132B" strokeWidth={1.5} />
            </g>
          )}

          {/* Date Axis Labels */}
          <text x={padLeft} y={height - 8} fontSize="10" fill="var(--jantt-text-muted)" fontFamily="monospace">
            {series.minDate}
          </text>
          {statusInRange && width >= 420 && (
            <text x={statusX} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--jantt-text-muted)" fontFamily="monospace">
              {t("common.today")}
            </text>
          )}
          <text x={padLeft + chartW} y={height - 8} textAnchor="end" fontSize="10" fill="var(--jantt-text-muted)" fontFamily="monospace">
            {series.maxDate}
          </text>
        </svg>

        <label className="pv-date-control">{t("health.scurve.inspect")}
          <input type="range" min={0} max={series.points.length - 1} step={1}
            aria-valuetext={hoveredPoint ? `${hoveredPoint.date}, ${money(hoveredPoint.pv)}` : series.points[0].date}
            value={Math.max(0, series.points.findIndex(point => point.date === hoveredPoint?.date))}
            onChange={event => setHoveredPoint(series.points[Number(event.target.value)])} />
        </label>
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
            <span style={{ color: "#94A3B8" }}>{t("health.scurve.hoverDate")} <strong>{hoveredPoint.date}</strong></span>
            <span style={{ color: COLORS.pv }}>{t("health.scurve.hoverPlanned")} <strong>{money(hoveredPoint.pv)}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
};
