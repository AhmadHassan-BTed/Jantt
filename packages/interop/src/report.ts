/**
 * High-Resolution Vector PDF Booklet & Executive Report Engine
 *
 * Generates publication-ready, multi-page landscape executive reports and
 * standalone vector SVG Gantt timelines featuring:
 * - Page 1: Executive Cover Dashboard with ANSI/EIA-748 EVM KPIs, DCMA-14 schedule health score & milestone checklist
 * - Page 2+: Auto-paginated vector SVG timeline slices with orthogonal dependency paths & critical path highlights
 * - Print-optimized CSS (@page landscape, vector font rendering, page-break management)
 */

import { Task, EVMResult, ScheduleHealthResult, CriticalPathResult } from "@jantt/core";
import { calculateEVM } from "@jantt/core";
import { auditScheduleIntegrity } from "@jantt/core";
import { calculateCriticalPath } from "@jantt/core";
import { diffDays, addDays, isValidISODate } from "@jantt/core";
import { getTaskDependencyRelations } from "@jantt/core";

export interface ExecutiveReportOptions {
  title?: string;
  projectCode?: string;
  author?: string;
  statusDate?: string;
  tasksPerPage?: number;
  theme?: "corporate" | "dark" | "light";
  includeEvm?: boolean;
  includeHealth?: boolean;
  includeMilestones?: boolean;
  includeTimeline?: boolean;
}

/**
 * Generates a standalone, print-ready HTML booklet with embedded vector SVGs,
 * EVM financial scorecards, DCMA-14 health analytics, and paginated timeline charts.
 *
 * Ideal for `window.print()`, export to PDF, Puppeteer, Playwright, or direct browser archiving.
 */
export function exportExecutiveReportHtml(tasks: Task[], options: ExecutiveReportOptions = {}): string {
  const title = options.title || "Executive Project Status & Schedule Health Report";
  const projectCode = options.projectCode || "PROJ-EXEC";
  const author = options.author || "Jantt Enterprise PM Engine";
  const todayStr = new Date().toISOString().split("T")[0];
  const statusDate = options.statusDate || todayStr;
  const tasksPerPage = Math.max(options.tasksPerPage || 20, 5);
  const theme = options.theme || "corporate";

  const liveTasks = (tasks || []).filter((t) => !t._deleted);

  // Perform operational PM analytics
  let evm: EVMResult | null = null;
  let cpm: CriticalPathResult | null = null;
  let health: ScheduleHealthResult | null = null;

  try {
    evm = calculateEVM(liveTasks, { statusDate });
  } catch {
    // fallback if dates are malformed
  }

  try {
    cpm = calculateCriticalPath(liveTasks);
    if (cpm) {
      health = auditScheduleIntegrity(liveTasks, cpm);
    }
  } catch {
    // fallback
  }

  // Identify milestones
  const milestones = liveTasks.filter((t) => {
    const isM = Boolean(t.milestone);
    const zeroDur = t.start && t.end && diffDays(t.start, t.end) === 0;
    return isM || zeroDur;
  });

  // Calculate timeline bounding dates
  let minDate = statusDate;
  let maxDate = statusDate;
  liveTasks.forEach((t) => {
    if (t.start && (!minDate || t.start < minDate)) minDate = t.start;
    if (t.end && (!maxDate || t.end > maxDate)) maxDate = t.end;
  });

  if (!minDate || !isValidISODate(minDate)) minDate = todayStr;
  if (!maxDate || !isValidISODate(maxDate)) maxDate = addDays(minDate, 30);
  if (minDate > maxDate) maxDate = addDays(minDate, 14);

  // Pad timeline bounds by 3 days on each end
  const chartStart = addDays(minDate, -2);
  const chartEnd = addDays(maxDate, 5);
  const totalDays = Math.max(diffDays(chartStart, chartEnd), 7);

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

    ${options.includeEvm !== false && evm ? renderEvmScorecard(evm, isDark, primary, success, warning, danger) : ""}
    ${options.includeHealth !== false && health ? renderHealthScorecard(health, cpm, isDark, success, warning, danger) : ""}
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
      const svgTimeline = renderSvgTimelinePage(pageTasks, chartStart, totalDays, cpm, statusDate, isDark);

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
      grid-template-columns: repeat(4, 1fr);
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
    <span>Jantt Executive PDF Booklet & Report Preview</span>
    <button class="print-btn" onclick="window.print()">Print / Export PDF</button>
  </div>

  ${coverHtml}
  ${timelinePagesHtml}
</body>
</html>`;
}

function renderEvmScorecard(evm: EVMResult, isDark: boolean, primary: string, success: string, warning: string, danger: string): string {
  const cpiColor = evm.cpi >= 1.0 ? success : (evm.cpi >= 0.9 ? warning : danger);
  const spiColor = evm.spi >= 1.0 ? success : (evm.spi >= 0.9 ? warning : danger);
  const cvColor = evm.cv >= 0 ? success : danger;
  const svColor = evm.sv >= 0 ? success : danger;

  return `
  <div class="section-title">
    <span>ANSI/EIA-748 Earned Value Management (EVM) Performance</span>
    <span class="badge ${evm.overallHealth === "healthy" ? "badge-success" : (evm.overallHealth === "at-risk" ? "badge-warning" : "badge-danger")}">${escapeHtml(evm.overallHealth)}</span>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Cost Performance (CPI)</div>
      <div class="kpi-value" style="color: ${cpiColor}">${evm.cpi.toFixed(2)}</div>
      <div class="kpi-sub">${evm.cpi >= 1.0 ? "Under / On Budget" : "Over Budget"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Schedule Performance (SPI)</div>
      <div class="kpi-value" style="color: ${spiColor}">${evm.spi.toFixed(2)}</div>
      <div class="kpi-sub">${evm.spi >= 1.0 ? "Ahead / On Schedule" : "Behind Schedule"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Cost Variance (CV)</div>
      <div class="kpi-value" style="color: ${cvColor}">$${formatNumber(evm.cv)}</div>
      <div class="kpi-sub">${evm.cvPercent ? evm.cvPercent.toFixed(1) + "%" : ""}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Schedule Variance (SV)</div>
      <div class="kpi-value" style="color: ${svColor}">$${formatNumber(evm.sv)}</div>
      <div class="kpi-sub">${evm.svPercent ? evm.svPercent.toFixed(1) + "%" : ""}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Budget at Completion (BAC)</div>
      <div class="kpi-value">$${formatNumber(evm.bac)}</div>
      <div class="kpi-sub">Total Baseline Plan</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Estimate at Compl. (EAC)</div>
      <div class="kpi-value">$${formatNumber(evm.eac)}</div>
      <div class="kpi-sub">VAC: $${formatNumber(evm.vac)}</div>
    </div>
  </div>
  `;
}

function renderHealthScorecard(health: ScheduleHealthResult, cpm: CriticalPathResult | null, isDark: boolean, success: string, warning: string, danger: string): string {
  const gradeColor = health.healthScore >= 90 ? success : (health.healthScore >= 75 ? warning : danger);

  return `
  <div class="section-title">
    <span>DCMA-14 Schedule Logic & Integrity Diagnostics</span>
    <span>Score: ${health.healthScore}%</span>
  </div>

  <div class="health-grid">
    <div class="health-grade-box">
      <div class="grade-circle" style="background: rgba(59, 130, 246, 0.15); color: ${gradeColor}; border: 2px solid ${gradeColor};">
        ${health.grade}
      </div>
      <div style="font-weight: 700; font-size: 14px;">Grade ${health.grade}</div>
      <div style="font-size: 11px; color: #94a3b8;">${health.healthScore}/100 Integrity</div>
    </div>

    <div class="health-metrics-list">
      <div class="metric-item">
        <div class="kpi-label">Missing Logic</div>
        <div class="kpi-value">${health.missingLogicCount}</div>
        <div class="kpi-sub">${health.missingLogicCount === 0 ? "Perfect connectivity" : "Missing dependencies"}</div>
      </div>
      <div class="metric-item">
        <div class="kpi-label">Negative Float</div>
        <div class="kpi-value" style="color: ${health.negativeFloatCount > 0 ? danger : "inherit"}">${health.negativeFloatCount}</div>
        <div class="kpi-sub">${health.negativeFloatCount === 0 ? "No hard slips" : "Critical deadline violation"}</div>
      </div>
      <div class="metric-item">
        <div class="kpi-label">High Float (>44d)</div>
        <div class="kpi-value">${health.highFloatCount}</div>
        <div class="kpi-sub">Unconstrained buffer</div>
      </div>
      <div class="metric-item">
        <div class="kpi-label">Critical Path</div>
        <div class="kpi-value" style="color: ${cpm && cpm.criticalTaskIds.size > 0 ? success : warning}">
          ${cpm ? cpm.criticalTaskIds.size : 0}
        </div>
        <div class="kpi-sub">Critical activities</div>
      </div>
    </div>
  </div>
  `;
}

function renderMilestoneSection(milestones: Task[], statusDate: string, cpm: CriticalPathResult | null): string {
  return `
  <div class="section-title">
    <span>Milestone Gate Checklist</span>
    <span>${milestones.length} Strategic Gateways</span>
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
      ${milestones.slice(0, 10).map((m) => {
        const isDone = (m.progress ?? 0) >= 1 || m.status === "done" || m.status === "completed";
        const isOverdue = !isDone && m.end && m.end < statusDate;
        const isCrit = cpm && cpm.criticalTaskIds.has(m.id);
        const statusBadge = isDone
          ? `<span class="badge badge-success">Completed</span>`
          : (isOverdue ? `<span class="badge badge-danger">Overdue</span>` : `<span class="badge badge-warning">Pending</span>`);

        return `
        <tr>
          <td style="font-family: ui-monospace, monospace; font-weight: 600;">${escapeHtml(m.id)}</td>
          <td style="font-weight: 600;">${escapeHtml(m.label || m.name || m.id)}</td>
          <td>${escapeHtml(m.end || m.start || "-")}</td>
          <td>${statusBadge}</td>
          <td>${isCrit ? `<span class="badge badge-danger">Driving Critical</span>` : `Standard`}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
  `;
}

/**
 * Renders a crisp vector SVG timeline representing a single page of tasks.
 */
function renderSvgTimelinePage(
  tasks: Task[],
  chartStart: string,
  totalDays: number,
  cpm: CriticalPathResult | null,
  statusDate: string,
  isDark: boolean
): string {
  const rowHeight = 32;
  const headerHeight = 36;
  const tableWidth = 320;
  const chartWidth = 780;
  const svgWidth = tableWidth + chartWidth;
  const svgHeight = headerHeight + tasks.length * rowHeight + 10;

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
  if (statusDate >= chartStart && statusDate <= addDays(chartStart, totalDays)) {
    const sOffset = diffDays(chartStart, statusDate);
    const sx = tableWidth + sOffset * pxPerDay;
    statusMarker = `
      <line x1="${sx}" y1="0" x2="${sx}" y2="${svgHeight}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,3" />
      <text x="${sx + 4}" y="14" font-size="9" font-weight="700" fill="#ef4444" font-family="sans-serif">STATUS DATE</text>
    `;
  }

  // Build task map for Y coordinates
  const taskYMap = new Map<string, number>();
  tasks.forEach((t, i) => {
    taskYMap.set(t.id, headerHeight + i * rowHeight + rowHeight / 2);
  });

  // Render task rows
  let taskRows = "";
  let depPaths = "";

  tasks.forEach((t, i) => {
    const y = headerHeight + i * rowHeight;
    const isCrit = cpm && cpm.criticalTaskIds.has(t.id);
    const isMs = Boolean(t.milestone) || (t.start && t.end && diffDays(t.start, t.end) === 0);
    const duration = (t.start && t.end) ? Math.max(diffDays(t.start, t.end), 0) : 1;

    // Row alternating background
    const rowBg = i % 2 === 1 ? (isDark ? "#172033" : "#f8fafc") : "transparent";
    taskRows += `<rect x="0" y="${y}" width="${svgWidth}" height="${rowHeight}" fill="${rowBg}" />`;

    // Table text columns: ID, Name, Dates, Progress
    const progressPct = (t.progress !== undefined && t.progress !== null) ? `${Math.round(t.progress * 100)}%` : "0%";
    taskRows += `
      <text x="10" y="${y + 20}" font-size="11" font-weight="600" fill="${isCrit ? "#ef4444" : textMain}" font-family="monospace">${escapeHtml(t.id.slice(0, 8))}</text>
      <text x="70" y="${y + 20}" font-size="11" font-weight="${isCrit ? "700" : "500"}" fill="${textMain}" font-family="sans-serif">${escapeHtml((t.label || t.name || t.id).slice(0, 26))}</text>
      <text x="260" y="${y + 20}" font-size="10" fill="${textMuted}" font-family="sans-serif">${progressPct}</text>
    `;

    // Bar or Milestone geometry
    if (t.start && t.end) {
      const startOffset = diffDays(chartStart, t.start);
      const barX = tableWidth + startOffset * pxPerDay;
      const barWidth = Math.max(duration * pxPerDay, 4);
      const barY = y + 8;
      const barHeight = rowHeight - 16;
      const barColor = isCrit ? "#ef4444" : (t.color || "#3b82f6");

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

    // Dependencies
    const deps = getTaskDependencyRelations(t);
    deps.forEach((rel) => {
      const predY = taskYMap.get(rel.id);
      if (predY !== undefined) {
        const predTask = tasks.find((item) => item.id === rel.id);
        if (predTask && predTask.end && t.start) {
          const predEndOffset = diffDays(chartStart, predTask.end);
          const succStartOffset = diffDays(chartStart, t.start);
          const x1 = tableWidth + predEndOffset * pxPerDay;
          const y1 = predY;
          const x2 = tableWidth + succStartOffset * pxPerDay;
          const y2 = y + rowHeight / 2;

          const midX = x1 + 10;
          const stroke = isCrit ? "#ef4444" : "#94a3b8";
          depPaths += `<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="${isCrit ? "none" : "2,2"}" marker-end="url(#arrow)" />`;
        }
      }
    });
  });

  return `
  <svg class="timeline-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94a3b8" />
      </marker>
    </defs>
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
  </svg>
  `;
}

/**
 * Exports a standalone, high-resolution vector SVG representation of the entire schedule network.
 * Ready for vector graphic software (Adobe Illustrator, Inkscape, Figma, CAD).
 */
export function exportExecutiveReportSvg(tasks: Task[], options: ExecutiveReportOptions = {}): string {
  const liveTasks = (tasks || []).filter((t) => !t._deleted);
  const statusDate = options.statusDate || new Date().toISOString().split("T")[0];
  const isDark = options.theme === "dark";

  let cpm: CriticalPathResult | null = null;
  try {
    cpm = calculateCriticalPath(liveTasks);
  } catch {
    // fallback
  }

  let minDate = statusDate;
  let maxDate = statusDate;
  liveTasks.forEach((t) => {
    if (t.start && (!minDate || t.start < minDate)) minDate = t.start;
    if (t.end && (!maxDate || t.end > maxDate)) maxDate = t.end;
  });

  const chartStart = addDays(minDate || statusDate, -2);
  const chartEnd = addDays(maxDate || statusDate, 5);
  const totalDays = Math.max(diffDays(chartStart, chartEnd), 7);

  return renderSvgTimelinePage(liveTasks, chartStart, totalDays, cpm, statusDate, isDark);
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
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(val: string): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(num: number | undefined): string {
  if (num === undefined || isNaN(num)) return "0";
  return Math.round(num).toLocaleString();
}
