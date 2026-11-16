/**
 * Executive Report Engine (print-ready HTML booklet & standalone vector SVG)
 *
 * Generates multi-page landscape executive reports, which the browser's print dialog
 * saves as PDF, and standalone vector SVG Gantt timelines featuring:
 * - Page 1: Executive Cover Dashboard with ANSI/EIA-748 EVM KPIs, a schedule health score
 *   (selected DCMA checks, each listed with its result) & milestone checklist
 * - Page 2+: Auto-paginated vector SVG timeline slices with orthogonal dependency paths & critical path highlights
 * - Print-optimized CSS (@page landscape, vector font rendering, page-break management)
 *
 * A task is a milestone only when it is flagged `milestone: true`; a single-day task is a bar.
 */

import type { Task, CriticalPathResult, EVMAnalysis, ScheduleHealthReport } from "@jantt/core";
import { calculateEVM } from "@jantt/core";
import { auditScheduleIntegrity } from "@jantt/core";
import { calculateCriticalPath } from "@jantt/core";
import { diffDays, addDays, isValidISODate, getTodayISODate } from "@jantt/core";
import { getTaskDependencyRelations } from "@jantt/core";
import { sanitizeXmlText } from "./ms-project.js";

export interface ExecutiveReportOptions {
  title?: string;
  projectCode?: string;
  author?: string;
  /** Status (data) date, YYYY-MM-DD. Defaults to today's local date, like the chart's today line. */
  statusDate?: string;
  tasksPerPage?: number;
  theme?: "corporate" | "dark" | "light";
  includeEvm?: boolean;
  includeHealth?: boolean;
  includeMilestones?: boolean;
  includeTimeline?: boolean;
  /** The plan's `meta.defaultGapDays`, so the critical path matches the cascaded schedule. */
  defaultGapDays?: number;
  /** The plan's `meta.targetDate`; tasks that finish after it get negative float. */
  targetDate?: string;
}

/**
 * Generates a standalone, print-ready HTML booklet with embedded vector SVGs,
 * EVM financial scorecards, schedule health analytics, and paginated timeline charts.
 *
 * Ideal for `window.print()`, export to PDF, Puppeteer, Playwright, or direct browser archiving.
 */
export function exportExecutiveReportHtml(tasks: Task[], options: ExecutiveReportOptions = {}): string {
  const title = options.title || "Executive Project Status & Schedule Health Report";
  const projectCode = options.projectCode || "PROJ-EXEC";
  const author = options.author || "Jantt Enterprise PM Engine";
  const statusDate = options.statusDate || getTodayISODate();
  // Whole rows only: a fractional or non-numeric value would split pages unevenly.
  const tasksPerPage = Math.max(Math.floor(Number(options.tasksPerPage)) || 20, 5);
  const theme = options.theme || "corporate";

  const liveTasks = (tasks || []).filter((t) => t && !t._deleted);

  // Perform operational PM analytics
  let evm: EVMAnalysis | null = null;
  let health: ScheduleHealthReport | null = null;

  try {
    evm = calculateEVM(liveTasks, { statusDate });
  } catch {
    // fallback if dates are malformed
  }

  const cpm = criticalPathOf(liveTasks, options);
  if (cpm) {
    try {
      health = auditScheduleIntegrity(liveTasks, cpm);
    } catch {
      // fallback
    }
  }

  // Identify milestones
  const milestones = liveTasks.filter(isMilestoneTask);

  const { chartStart, totalDays } = computeChartRange(liveTasks, statusDate);
  const rowById = indexRows(liveTasks);

  // Paginate tasks
  const pages: Task[][] = [];
  if (liveTasks.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < liveTasks.length; i += tasksPerPage) {
      pages.push(liveTasks.slice(i, i + tasksPerPage));
    }
  }

  const isDark = theme === "dark";
  const bg = isDark ? "#0f172a" : "#f8fafc";
  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const text = isDark ? "#f1f5f9" : "#0f172a";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const border = isDark ? "#334155" : "#e2e8f0";
  const primary = "#3b82f6";
  const success = "#10b981";
  const warning = "#f59e0b";
  const danger = "#ef4444";

  // Build Executive Cover (Page 1)
  const coverHtml = `
  <section class="report-page cover-page">
    <header class="report-header">
      <div class="brand">
        <div class="brand-badge">JANTT ENTERPRISE</div>
        <span class="proj-code">${escapeHtml(projectCode)}</span>
      </div>
      <h1 class="report-title">${escapeHtml(title)}</h1>
      <div class="report-meta">
        <div><strong>Status Date:</strong> ${escapeHtml(statusDate)}</div>
        <div><strong>Prepared By:</strong> ${escapeHtml(author)}</div>
        <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
        <div><strong>Total Activities:</strong> ${liveTasks.length}</div>
      </div>
    </header>

    ${options.includeEvm !== false && evm ? renderEvmScorecard(evm, success, warning, danger) : ""}
    ${options.includeHealth !== false && health ? renderHealthScorecard(health, cpm, success, warning, danger) : ""}
    ${options.includeMilestones !== false && milestones.length > 0 ? renderMilestoneSection(milestones, statusDate, cpm) : ""}

    <footer class="page-footer">
      <span>${escapeHtml(title)} &bull; Page 1</span>
      <span>Confidential &bull; Generated by Jantt</span>
    </footer>
  </section>
  `;

  // Build Timeline Pages (Page 2+)
  let timelinePagesHtml = "";
  if (options.includeTimeline !== false && liveTasks.length > 0) {
    pages.forEach((pageTasks, pageIdx) => {
      const pageNum = pageIdx + 2;
      const svgTimeline = renderSvgTimelinePage(pageTasks, {
        chartStart,
        totalDays,
        cpm,
        statusDate,
        isDark,
        rowById,
        firstRow: pageIdx * tasksPerPage
      });

      timelinePagesHtml += `
      <section class="report-page timeline-page">
        <header class="page-sub-header">
          <div>
            <h2>Schedule Network Timeline (Part ${pageIdx + 1} of ${pages.length})</h2>
            <p class="subtitle">${escapeHtml(title)} &bull; Activities ${pageIdx * tasksPerPage + 1} to ${Math.min((pageIdx + 1) * tasksPerPage, liveTasks.length)} of ${liveTasks.length}</p>
          </div>
          <div class="legend">
            <span class="legend-item"><span class="swatch crit"></span> Critical Path</span>
            <span class="legend-item"><span class="swatch reg"></span> Active Task</span>
            <span class="legend-item"><span class="swatch ms"></span> Milestone</span>
          </div>
        </header>

        <div class="timeline-container">
          ${svgTimeline}
        </div>

        <footer class="page-footer">
          <span>${escapeHtml(title)} &bull; Page ${pageNum} of ${pages.length + 1}</span>
          <span>Confidential &bull; Generated by Jantt</span>
        </footer>
      </section>
      `;
    });
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: landscape;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: ${bg};
      color: ${text};
      line-height: 1.5;
      font-size: 13px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-page {
      width: 100%;
      min-height: 100vh;
      padding: 24px;
      margin-bottom: 24px;
      background: ${cardBg};
      border: 1px solid ${border};
      display: flex;
      flex-direction: column;
      position: relative;
      page-break-after: always;
      break-after: page;
    }
    @media print {
      body {
        background: transparent;
      }
      .report-page {
        border: none;
        padding: 0;
        margin: 0;
        min-height: auto;
        page-break-after: always;
        break-after: page;
      }
      .no-print {
        display: none !important;
      }
    }
    .report-header {
      border-bottom: 2px solid ${border};
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .brand-badge {
      background: ${primary};
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .proj-code {
      font-family: ui-monospace, monospace;
      color: ${textSecondary};
      font-weight: 600;
      font-size: 12px;
    }
    .report-title {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .report-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      color: ${textSecondary};
      font-size: 12px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      margin: 16px 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${textSecondary};
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: ${isDark ? "#111827" : "#f1f5f9"};
      border: 1px solid ${border};
      border-radius: 6px;
      padding: 10px 14px;
    }
    .kpi-label {
      font-size: 11px;
      color: ${textSecondary};
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .kpi-value {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .kpi-sub {
      font-size: 10px;
      margin-top: 2px;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: ${success}; }
    .badge-warning { background: rgba(245, 158, 11, 0.15); color: ${warning}; }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: ${danger}; }
    .badge-muted { background: rgba(148, 163, 184, 0.15); color: ${textSecondary}; }
    .kpi-of { font-size: 12px; font-weight: 600; color: ${textSecondary}; }
    .muted { color: ${textSecondary}; }

    .health-grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    .health-grade-box {
      background: ${isDark ? "#111827" : "#f1f5f9"};
      border: 1px solid ${border};
      border-radius: 6px;
      padding: 16px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .grade-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 900;
      margin-bottom: 8px;
    }
    .health-metrics-list {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }
    .metric-item {
      background: ${isDark ? "#111827" : "#f1f5f9"};
      border: 1px solid ${border};
      border-radius: 6px;
      padding: 10px 12px;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 16px;
    }
    table.data-table th, table.data-table td {
      padding: 8px 12px;
      border: 1px solid ${border};
      text-align: left;
    }
    table.data-table th {
      background: ${isDark ? "#111827" : "#f1f5f9"};
      font-weight: 700;
      color: ${textSecondary};
      font-size: 11px;
      text-transform: uppercase;
    }

    .page-sub-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid ${border};
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .page-sub-header h2 {
      font-size: 18px;
      font-weight: 800;
    }
    .page-sub-header .subtitle {
      font-size: 11px;
      color: ${textSecondary};
    }
    .legend {
      display: flex;
      gap: 16px;
      font-size: 11px;
      font-weight: 600;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      width: 14px;
      height: 10px;
      border-radius: 2px;
    }
    .swatch.crit { background: ${danger}; }
    .swatch.reg { background: ${primary}; }
    .swatch.ms {
      width: 10px;
      height: 10px;
      transform: rotate(45deg);
      background: ${warning};
    }

    .timeline-container {
      width: 100%;
      overflow: hidden;
      flex: 1;
    }
    .timeline-svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .page-footer {
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid ${border};
      display: flex;
      justify-content: space-between;
      color: ${textSecondary};
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .print-bar {
      position: sticky;
      top: 0;
      background: ${isDark ? "#1e293b" : "#3b82f6"};
      color: #fff;
      padding: 10px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      z-index: 1000;
    }
    .print-btn {
      background: #fff;
      color: #1e293b;
      font-weight: 700;
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
    }
    .print-btn:hover {
      background: #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <span>Jantt Executive Report Preview</span>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  ${coverHtml}
  ${timelinePagesHtml}
</body>
</html>`;
}

/**
 * EVM cards that never present a placeholder as a measurement: cost figures read "n/a" when the
 * plan has no budgets or no task reports an actual cost, CPI says how much of the budget it covers,
 * and schedule figures say what planned value was measured against.
 */
function renderEvmScorecard(evm: EVMAnalysis, success: string, warning: string, danger: string): string {
  // Results without these fields (older cores) are treated as fully measured.
  const hasCost = evm.costDataAvailable !== false;
  const coverage = typeof evm.costCoverage === "number" && Number.isFinite(evm.costCoverage) ? evm.costCoverage : 1;
  const costMeasured = hasCost && coverage > 0;
  const noCostReason = hasCost ? "No actual costs reported" : "No cost data";
  const indexColor = (value: number) => (value >= 1.0 ? success : value >= 0.9 ? warning : danger);
  const varianceColor = (value: number) => (value >= 0 ? success : danger);
  const pvBasis =
    evm.pvBasis === "baseline" ? "PV vs. baseline" : evm.pvBasis === "mixed" ? "PV vs. baseline where set" : "PV vs. current dates (no baseline)";

  const card = (label: string, value: string, sub: string, color?: string) => `
    <div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value"${color ? ` style="color: ${color}"` : ""}>${value}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`;
  const notMeasured = (label: string, reason: string) => card(label, "n/a", reason, "inherit");

  // Rounded down, so a partly reported budget never reads as 100%.
  const coverageLabel = coverage < 0.01 ? "&lt;1%" : `${Math.floor(coverage * 100 + 1e-9)}%`;
  const cpiSub = coverage < 1 ? `Based on ${coverageLabel} of budget` : evm.cpi >= 1.0 ? "Under / On Budget" : "Over Budget";

  return `
  <div class="section-title">
    <span>ANSI/EIA-748 Earned Value Management (EVM) Performance</span>
    <span>
      <span class="badge badge-muted">${hasCost ? pvBasis : "Schedule only &bull; no cost data"}</span>
      <span class="badge ${evm.overallHealth === "healthy" ? "badge-success" : (evm.overallHealth === "at-risk" ? "badge-warning" : "badge-danger")}">${escapeHtml(evm.overallHealth)}</span>
    </span>
  </div>

  <div class="kpi-grid">
    ${costMeasured ? card("Cost Performance (CPI)", formatIndex(evm.cpi), cpiSub, indexColor(evm.cpi)) : notMeasured("Cost Performance (CPI)", noCostReason)}
    ${card("Schedule Performance (SPI)", formatIndex(evm.spi), `${evm.spi >= 1.0 ? "Ahead / On Schedule" : "Behind Schedule"}${hasCost ? "" : " (duration-weighted)"}`, indexColor(evm.spi))}
    ${costMeasured ? card("Cost Variance (CV)", formatMoney(evm.cv), formatPercent(evm.cvPercent, 1), varianceColor(evm.cv)) : notMeasured("Cost Variance (CV)", noCostReason)}
    ${hasCost
      ? card("Schedule Variance (SV)", formatMoney(evm.sv), formatPercent(evm.svPercent, 1), varianceColor(evm.sv))
      : card("Schedule Variance (SV)", formatPercent(evm.svPercent, 1), "Duration-weighted", varianceColor(evm.svPercent))}
    ${hasCost ? card("Budget at Completion (BAC)", formatMoney(evm.bac), "Total Baseline Plan") : notMeasured("Budget at Completion (BAC)", "No cost data")}
    ${costMeasured ? card("Estimate at Compl. (EAC)", formatMoney(evm.eac), `VAC: ${formatMoney(evm.vac)}`) : notMeasured("Estimate at Compl. (EAC)", noCostReason)}
  </div>
  `;
}

/** Health grade plus every check it is computed from, so each score deduction is explained. */
function renderHealthScorecard(health: ScheduleHealthReport, cpm: CriticalPathResult | null, success: string, warning: string, danger: string): string {
  const gradeColor = health.healthScore >= 90 ? success : (health.healthScore >= 75 ? warning : danger);
  const checks = Array.isArray(health.checks) ? health.checks : [];
  const criticalCount = cpm ? cpm.criticalTaskIds.size : 0;

  const checkItems = checks.map((check) => {
    const applicable = check.eligible > 0;
    const verdict = !applicable
      ? `<span class="badge badge-muted">n/a</span>`
      : check.passed ? `<span class="badge badge-success">Pass</span>` : `<span class="badge badge-danger">Fail</span>`;
    const limit = check.threshold > 0 ? `limit &le; ${formatPercent(check.threshold * 100, 0)}` : "none allowed";
    const penalty = check.penalty > 0 ? ` &bull; &minus;${check.penalty} pts` : "";
    return `
      <div class="metric-item">
        <div class="kpi-label">${typeof check.dcmaCheck === "number" ? `#${check.dcmaCheck} ` : ""}${escapeHtml(check.label)}</div>
        <div class="kpi-value" style="color: ${applicable && !check.passed ? danger : "inherit"}">${check.failed}<span class="kpi-of"> / ${check.eligible}</span></div>
        <div class="kpi-sub">${verdict} ${limit}${penalty}</div>
      </div>`;
  });

  return `
  <div class="section-title">
    <span>Schedule Health (selected DCMA checks)</span>
    <span>Score: ${health.healthScore}/100</span>
  </div>

  <div class="health-grid">
    <div class="health-grade-box">
      <div class="grade-circle" style="background: rgba(59, 130, 246, 0.15); color: ${gradeColor}; border: 2px solid ${gradeColor};">
        ${escapeHtml(health.grade)}
      </div>
      <div style="font-weight: 700; font-size: 14px;">Grade ${escapeHtml(health.grade)}</div>
      <div class="kpi-sub muted">${criticalCount} critical ${criticalCount === 1 ? "activity" : "activities"}</div>
    </div>

    <div class="health-metrics-list">
      ${checkItems.length > 0 ? checkItems.join("") : `<div class="metric-item">${escapeHtml(health.summary || "No tasks to audit")}</div>`}
    </div>
  </div>
  `;
}

const MILESTONE_ROWS = 10;

function renderMilestoneSection(milestones: Task[], statusDate: string, cpm: CriticalPathResult | null): string {
  const isDone = (m: Task) => (m.progress ?? 0) >= 1 || m.status === "done" || m.status === "completed";
  const dueDate = (m: Task) => m.end || m.start || "";
  const isOverdue = (m: Task) => !isDone(m) && Boolean(m.end) && m.end < statusDate;
  // Overdue gates first, then by due date, so a truncated list never hides the urgent ones.
  const sorted = [...milestones].sort((a, b) => {
    const overdueOrder = Number(isOverdue(b)) - Number(isOverdue(a));
    if (overdueOrder !== 0) return overdueOrder;
    const da = dueDate(a);
    const db = dueDate(b);
    return da < db ? -1 : da > db ? 1 : 0;
  });
  const shown = sorted.slice(0, MILESTONE_ROWS);
  const hiddenCount = sorted.length - shown.length;

  return `
  <div class="section-title">
    <span>Milestone Gate Checklist</span>
    <span>${milestones.length} Strategic Gateways${hiddenCount > 0 ? ` (top ${shown.length} shown)` : ""}</span>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 80px;">ID</th>
        <th>Milestone Deliverable</th>
        <th style="width: 110px;">Due Date</th>
        <th style="width: 100px;">Status</th>
        <th style="width: 100px;">Critical Path</th>
      </tr>
    </thead>
    <tbody>
      ${shown.map((m) => {
        const isCrit = cpm && cpm.criticalTaskIds.has(m.id);
        const statusBadge = isDone(m)
          ? `<span class="badge badge-success">Completed</span>`
          : (isOverdue(m) ? `<span class="badge badge-danger">Overdue</span>` : `<span class="badge badge-warning">Pending</span>`);

        return `
        <tr>
          <td style="font-family: ui-monospace, monospace; font-weight: 600;">${escapeHtml(m.id)}</td>
          <td style="font-weight: 600;">${escapeHtml(m.label || m.name || m.id)}</td>
          <td>${escapeHtml(m.end || m.start || "-")}</td>
          <td>${statusBadge}</td>
          <td>${isCrit ? `<span class="badge badge-danger">Driving Critical</span>` : `Standard`}</td>
        </tr>`;
      }).join("")}
      ${hiddenCount > 0 ? `<tr><td colspan="5" style="font-style: italic;">+${hiddenCount} more milestone${hiddenCount === 1 ? "" : "s"} not shown</td></tr>` : ""}
    </tbody>
  </table>
  `;
}

interface TimelinePageContext {
  chartStart: string;
  totalDays: number;
  cpm: CriticalPathResult | null;
  statusDate: string;
  isDark: boolean;
  /** Every task with its row across all pages, so links from other pages can be drawn as stubs. */
  rowById: Map<string, { task: Task; row: number }>;
  /** Row index (across all pages) of this page's first task. */
  firstRow: number;
  /** Optional caption drawn above the chart and exposed as the SVG <title>. */
  title?: string;
}

/**
 * Renders a crisp vector SVG timeline representing a single page of tasks.
 */
function renderSvgTimelinePage(tasks: Task[], page: TimelinePageContext): string {
  const { chartStart, totalDays, cpm, statusDate, isDark, rowById, firstRow, title } = page;
  const rowHeight = 32;
  const headerHeight = 36;
  const tableWidth = 320;
  const chartWidth = 780;
  const svgWidth = tableWidth + chartWidth;
  const svgHeight = headerHeight + tasks.length * rowHeight + 10;
  const titleBand = title ? 30 : 0;

  const bg = isDark ? "#0f172a" : "#ffffff";
  const gridLine = isDark ? "#1e293b" : "#e2e8f0";
  const textMuted = isDark ? "#94a3b8" : "#64748b";
  const textMain = isDark ? "#f1f5f9" : "#0f172a";

  const pxPerDay = chartWidth / totalDays;

  // Render day / week columns
  let gridCols = "";
  let headerCells = "";
  const interval = Math.max(Math.round(totalDays / 12), 1);

  for (let d = 0; d < totalDays; d += interval) {
    const curDate = addDays(chartStart, d);
    const x = tableWidth + d * pxPerDay;
    gridCols += `<line x1="${x}" y1="${headerHeight}" x2="${x}" y2="${svgHeight}" stroke="${gridLine}" stroke-width="1" />`;
    headerCells += `<text x="${x + 4}" y="${headerHeight - 12}" font-size="10" fill="${textMuted}" font-family="sans-serif">${curDate.slice(5)}</text>`;
  }

  // Status date marker
  let statusMarker = "";
  if (isValidISODate(statusDate) && statusDate >= chartStart && statusDate <= addDays(chartStart, totalDays)) {
    const sOffset = diffDays(chartStart, statusDate);
    const sx = tableWidth + sOffset * pxPerDay;
    statusMarker = `
      <line x1="${sx}" y1="0" x2="${sx}" y2="${svgHeight}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,3" />
      <text x="${sx + 4}" y="14" font-size="9" font-weight="700" fill="#ef4444" font-family="sans-serif">STATUS DATE</text>
    `;
  }

  // X of a task's start edge or (inclusive) end edge; milestones anchor on their diamond.
  const anchorX = (task: Task, atEnd: boolean): number | null => {
    if (!isValidISODate(task.start) || !isValidISODate(task.end)) return null;
    const offset = atEnd && !isMilestoneTask(task) ? diffDays(chartStart, task.end) + 1 : diffDays(chartStart, task.start);
    return tableWidth + offset * pxPerDay;
  };

  // Render task rows
  let taskRows = "";
  let depPaths = "";

  tasks.forEach((t, i) => {
    const y = headerHeight + i * rowHeight;
    const isCrit = Boolean(cpm && cpm.criticalTaskIds.has(t.id));
    const hasDates = isValidISODate(t.start) && isValidISODate(t.end);
    const isMs = isMilestoneTask(t);

    // Row alternating background
    const rowBg = i % 2 === 1 ? (isDark ? "#172033" : "#f8fafc") : "transparent";
    taskRows += `<rect x="0" y="${y}" width="${svgWidth}" height="${rowHeight}" fill="${rowBg}" />`;

    // Table text columns: ID, Name, Dates, Progress
    const progressPct = (t.progress !== undefined && t.progress !== null) ? `${Math.round(t.progress * 100)}%` : "0%";
    taskRows += `
      <text x="10" y="${y + 20}" font-size="11" font-weight="600" fill="${isCrit ? "#ef4444" : textMain}" font-family="monospace">${escapeHtml(clip(String(t.id), 8))}</text>
      <text x="70" y="${y + 20}" font-size="11" font-weight="${isCrit ? "700" : "500"}" fill="${textMain}" font-family="sans-serif">${escapeHtml(clip(String(t.label || t.name || t.id), 26))}</text>
      <text x="260" y="${y + 20}" font-size="10" fill="${textMuted}" font-family="sans-serif">${progressPct}</text>
    `;

    // Bar or Milestone geometry
    if (hasDates) {
      const startOffset = diffDays(chartStart, t.start);
      const barX = tableWidth + startOffset * pxPerDay;
      // Inclusive end, matching the on-screen Gantt (a 2-day task spans 2 day columns).
      const duration = Math.max(diffDays(t.start, t.end), 0) + 1;
      const barWidth = Math.max(duration * pxPerDay, 4);
      const barY = y + 8;
      const barHeight = rowHeight - 16;
      const barColor = isCrit ? "#ef4444" : sanitizeColor(t.color, "#3b82f6");

      if (isMs) {
        // Milestone Diamond
        const cx = barX;
        const cy = y + rowHeight / 2;
        const size = 7;
        taskRows += `
          <polygon points="${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" />
        `;
      } else {
        // Regular Bar
        taskRows += `
          <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="3" fill="${barColor}" fill-opacity="0.3" stroke="${barColor}" stroke-width="1.5" />
        `;

        // Progress Fill
        if (t.progress !== undefined && t.progress !== null && t.progress > 0) {
          const progWidth = Math.min(barWidth * Math.min(t.progress, 1), barWidth);
          taskRows += `
            <rect x="${barX}" y="${barY}" width="${progWidth}" height="${barHeight}" rx="3" fill="${barColor}" />
          `;
        }
      }
    }

    // Dependencies, anchored by link type (FS/FF leave the predecessor's end, FF/SF enter the successor's end).
    // Known ids keep an id such as "render-3d" from being read as "render" with a 3-day lead.
    for (const rel of getTaskDependencyRelations(t, rowById)) {
      const pred = rowById.get(rel.id);
      if (!pred) continue;
      const fromEnd = rel.type === "FS" || rel.type === "FF";
      const toEnd = rel.type === "FF" || rel.type === "SF";
      const x1 = anchorX(pred.task, fromEnd);
      const x2 = anchorX(t, toEnd);
      if (x1 === null || x2 === null) continue;

      const y2 = y + rowHeight / 2;
      const isCritLink = Boolean(cpm && (cpm.criticalDepKeys.has(`${rel.id}->${t.id}`) || (isCrit && cpm.criticalTaskIds.has(rel.id))));
      const stroke = isCritLink ? "#ef4444" : "#94a3b8";
      const style = `fill="none" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="${isCritLink ? "none" : "2,2"}" marker-end="url(#${isCritLink ? "arrow-crit" : "arrow"})"`;
      const localRow = pred.row - firstRow;

      if (localRow >= 0 && localRow < tasks.length) {
        const y1 = headerHeight + localRow * rowHeight + rowHeight / 2;
        const midX = x1 + (fromEnd ? 10 : -10);
        depPaths += `<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" ${style} />`;
      } else {
        // Predecessor on another page: enter from the page edge and label it with its id.
        const above = localRow < 0;
        const yEdge = above ? headerHeight : headerHeight + tasks.length * rowHeight;
        depPaths += `<path d="M ${x1} ${yEdge} V ${y2} H ${x2}" ${style} />`;
        depPaths += `<text x="${x1 + 3}" y="${above ? yEdge + 9 : yEdge - 3}" font-size="8" fill="${textMuted}" font-family="sans-serif">${above ? "&#8593;" : "&#8595;"} ${escapeHtml(clip(rel.id, 16))}</text>`;
      }
    }
  });

  const body = `
    <!-- Background -->
    <rect width="${svgWidth}" height="${svgHeight}" fill="${bg}" />
    <!-- Header background -->
    <rect x="0" y="0" width="${svgWidth}" height="${headerHeight}" fill="${isDark ? "#1e293b" : "#f1f5f9"}" />
    <line x1="0" y1="${headerHeight}" x2="${svgWidth}" y2="${headerHeight}" stroke="${gridLine}" stroke-width="1" />
    <!-- Table columns separator -->
    <line x1="${tableWidth}" y1="0" x2="${tableWidth}" y2="${svgHeight}" stroke="${gridLine}" stroke-width="1.5" />

    <!-- Table Header Text -->
    <text x="10" y="22" font-size="11" font-weight="700" fill="${textMuted}" font-family="sans-serif">ID</text>
    <text x="70" y="22" font-size="11" font-weight="700" fill="${textMuted}" font-family="sans-serif">ACTIVITY LABEL</text>
    <text x="260" y="22" font-size="11" font-weight="700" fill="${textMuted}" font-family="sans-serif">PROG</text>

    <!-- Timeline Date Header -->
    ${headerCells}

    <!-- Timeline Grid lines -->
    ${gridCols}

    <!-- Rows & Bars -->
    ${taskRows}

    <!-- Dependency Arrows -->
    ${depPaths}

    <!-- Status Marker -->
    ${statusMarker}
  `;

  return `
  <svg class="timeline-svg" viewBox="0 0 ${svgWidth} ${svgHeight + titleBand}" xmlns="http://www.w3.org/2000/svg"${title ? ` role="img"` : ""}>
    ${title ? `<title>${escapeHtml(title)}</title>` : ""}
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94a3b8" />
      </marker>
      <marker id="arrow-crit" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
      </marker>
    </defs>
    ${title
      ? `<rect width="${svgWidth}" height="${titleBand}" fill="${bg}" />
    <text x="10" y="20" font-size="14" font-weight="700" fill="${textMain}" font-family="sans-serif">${escapeHtml(title)}</text>
    <g transform="translate(0 ${titleBand})">${body}</g>`
      : body}
  </svg>
  `;
}

/**
 * Exports a standalone, high-resolution vector SVG representation of the entire schedule network.
 * Ready for vector graphic software (Adobe Illustrator, Inkscape, Figma, CAD).
 */
export function exportExecutiveReportSvg(tasks: Task[], options: ExecutiveReportOptions = {}): string {
  const liveTasks = (tasks || []).filter((t) => t && !t._deleted);
  const statusDate = options.statusDate || getTodayISODate();
  const isDark = options.theme === "dark";
  const cpm = criticalPathOf(liveTasks, options);

  const { chartStart, totalDays } = computeChartRange(liveTasks, statusDate);

  return renderSvgTimelinePage(liveTasks, {
    chartStart,
    totalDays,
    cpm,
    statusDate,
    isDark,
    rowById: indexRows(liveTasks),
    firstRow: 0,
    title: options.title
  });
}

/**
 * Triggers a browser download of the Executive Report HTML file.
 */
export function downloadExecutiveReport(tasks: Task[], options: ExecutiveReportOptions = {}, filename = "jantt-executive-report.html"): void {
  if (typeof window === "undefined" || !window.document) return;
  const htmlContent = exportExecutiveReportHtml(tasks, options);
  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in Firefox and Safari; release it once it has started.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

/**
 * Timeline range covering every valid task date and the status date, padded 2 days before and
 * 6 days after (one extra day because task ends are inclusive). Malformed dates are ignored.
 */
function computeChartRange(tasks: Task[], statusDate: string): { chartStart: string; totalDays: number } {
  const anchor = isValidISODate(statusDate) ? statusDate : new Date().toISOString().slice(0, 10);
  let minDate = anchor;
  let maxDate = anchor;
  for (const t of tasks) {
    if (isValidISODate(t.start) && t.start < minDate) minDate = t.start;
    if (isValidISODate(t.end) && t.end > maxDate) maxDate = t.end;
  }
  const chartStart = addDays(minDate, -2);
  const chartEnd = addDays(maxDate, 6);
  return { chartStart, totalDays: Math.max(diffDays(chartStart, chartEnd), 7) };
}

function indexRows(tasks: Task[]): Map<string, { task: Task; row: number }> {
  const rows = new Map<string, { task: Task; row: number }>();
  tasks.forEach((task, row) => rows.set(task.id, { task, row }));
  return rows;
}

/** CPM with the plan's gap and target date (validated by core), so the highlight matches the cascade. */
function criticalPathOf(tasks: Task[], options: ExecutiveReportOptions): CriticalPathResult | null {
  try {
    return calculateCriticalPath(tasks, { defaultGapDays: options.defaultGapDays, targetDate: options.targetDate });
  } catch {
    return null;
  }
}

/** Only flagged tasks are milestones (MS Project / P6 semantics); a single-day task is a bar. */
function isMilestoneTask(t: Task): boolean {
  return t.milestone === true;
}

/** Accepts hex, rgb()/hsl() and named colors; anything else (e.g. attribute-breaking input) falls back. */
function sanitizeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) || /^(?:rgb|hsl)a?\([\d.,%\s/]+\)$/i.test(color) || /^[a-z]+$/i.test(color)
    ? color
    : fallback;
}

/** Truncates by code point so emoji and other astral characters are never split. */
function clip(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : Array.from(text).slice(0, maxChars).join("");
}

function escapeHtml(val: unknown): string {
  return sanitizeXmlText(String(val ?? ""))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Whole dollars with the sign before the symbol ("-$1,200"); "n/a" for non-finite values. */
function formatMoney(num: number | undefined): string {
  if (typeof num !== "number" || !Number.isFinite(num)) return "n/a";
  const rounded = Math.round(num);
  return `${rounded < 0 ? "-" : ""}$${Math.abs(rounded).toLocaleString("en-US")}`;
}

function formatIndex(num: number | undefined): string {
  return typeof num === "number" && Number.isFinite(num) ? num.toFixed(2) : "n/a";
}

function formatPercent(num: number | undefined, decimals: number): string {
  return typeof num === "number" && Number.isFinite(num) ? `${num.toFixed(decimals)}%` : "";
}
