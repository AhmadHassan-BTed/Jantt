/**
 * Jantt Canvas High-Performance Timeline Renderer
 *
 * Renders 10,000 to 100,000+ tasks on a 2D canvas using virtualized viewport windowing.
 * All per-task geometry (day offsets, durations, dependency edges, critical path) is computed
 * once per plan, so a frame never parses dates or walks the whole plan for bars or labels.
 * Drawing happens in CSS pixels and is scaled to the backing store (`devicePixelRatio`).
 */

import type { JanttData, Task, DependencyType, HorizontalVirtualWindow, VerticalVirtualWindow } from "@jantt/core";
import {
  calculateCriticalPath,
  computeVerticalVirtualWindow,
  computeHorizontalVirtualWindow,
  getTaskDependencyRelations,
  isValidISODate
} from "@jantt/core";
import { SpatialGanttGrid, type HitTestResult } from "./spatial-grid.js";

export interface CanvasColorConfig {
  background: string;
  rowAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  critical: string;
  gridLine: string;
}

export interface CanvasRendererOptions {
  rowHeight?: number;
  dayWidth?: number;
  headerHeight?: number;
  showCriticalPath?: boolean;
  /** Base color preset; `colors` overrides individual entries ("custom" uses the dark preset as base). */
  theme?: "swiss-dark" | "swiss-light" | "custom";
  colors?: Partial<CanvasColorConfig>;
}

export interface ViewportState {
  scrollX: number;
  scrollY: number;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  /** Ratio of backing-store pixels to CSS pixels (size the canvas to width * dpr). Defaults to 1. */
  devicePixelRatio?: number;
}

const DEFAULT_DARK_COLORS: CanvasColorConfig = {
  background: "#080D18",
  rowAlt: "rgba(255, 255, 255, 0.02)",
  border: "#1E293B",
  text: "#F8FAFC",
  textMuted: "#64748B",
  primary: "#38BDF8",
  critical: "#EF4444",
  gridLine: "rgba(255, 255, 255, 0.05)"
};

const DEFAULT_LIGHT_COLORS: CanvasColorConfig = {
  background: "#FFFFFF",
  rowAlt: "rgba(0, 0, 0, 0.02)",
  border: "#E2E8F0",
  text: "#0F172A",
  textMuted: "#64748B",
  primary: "#2563EB",
  critical: "#EF4444",
  gridLine: "rgba(0, 0, 0, 0.05)"
};

const DAY_MS = 86400000;
const DEFAULT_START_DAY = Date.UTC(2026, 0, 1) / DAY_MS;
const DEFAULT_END_DAY = Date.UTC(2026, 11, 31) / DAY_MS;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LABEL_FONT = "12px sans-serif";
const GROUP_FONT = "bold 12px sans-serif";
const MONTH_FONT = "600 11px sans-serif";
const DAY_FONT = "11px sans-serif";
const LABEL_CACHE_LIMIT = 4096;
const LINK_STUB = 8;
const DARK_LABEL = "#0F172A";
const LIGHT_LABEL = "#FFFFFF";

interface DependencyEdge {
  pred: number;
  succ: number;
  type: DependencyType;
}

export class CanvasTimelineRenderer {
  private plan: JanttData;
  private rowHeight: number;
  private dayWidth: number;
  private headerHeight: number;
  private showCriticalPath: boolean;
  private theme: string;
  private colorOverrides: Partial<CanvasColorConfig>;
  private colors: CanvasColorConfig;
  private spatialGrid: SpatialGanttGrid;
  private timelineStart = "2026-01-01";
  private timelineEnd = "2026-12-31";
  private totalDays = 365;

  // Per-plan index, rebuilt only when the plan changes.
  private indexedTasks: Task[] | undefined;
  private indexedTaskCount = 0;
  private rows: Task[] = [];
  private startDays = new Float64Array(0); // day offset from timelineStart; NaN when undated
  private spanDays = new Float64Array(0); // inclusive duration in days (>= 1)
  private milestones = new Uint8Array(0);
  private edges: DependencyEdge[] = [];
  private timelineStartDay = DEFAULT_START_DAY; // days since the Unix epoch
  private criticalIds: Set<string> | null = null;
  private criticalEdges = new Uint8Array(0); // 1 when edges[k] is drawn as a critical link
  private planVersion = 0;

  private labelCache = new Map<string, string>();
  private labelColorCache = new Map<string, string>();
  private minimapLayer: { key: string; canvas: OffscreenCanvas } | null = null;

  constructor(plan: JanttData, options: CanvasRendererOptions = {}) {
    this.plan = plan;
    this.rowHeight = options.rowHeight || 36;
    this.dayWidth = options.dayWidth || 40;
    this.headerHeight = options.headerHeight || 48;
    this.showCriticalPath = options.showCriticalPath ?? true;
    this.theme = options.theme || "swiss-dark";
    this.colorOverrides = { ...(options.colors || {}) };
    this.colors = this.resolveColors();

    this.indexPlan();
    this.spatialGrid = new SpatialGanttGrid(this.rows, this.timelineStart, this.rowHeight, this.dayWidth);
  }

  /**
   * Replaces the plan. Plans are treated as immutable: passing the same plan object with the
   * same tasks array again is a no-op, so pass a new object (or tasks array) after edits.
   */
  public setPlan(plan: JanttData) {
    if (plan === this.plan && plan.tasks === this.indexedTasks && (plan.tasks?.length || 0) === this.indexedTaskCount) {
      return;
    }
    this.plan = plan;
    this.indexPlan();
    this.spatialGrid.update(this.rows, this.timelineStart, this.rowHeight, this.dayWidth);
  }

  public updateOptions(options: Partial<CanvasRendererOptions>) {
    if (options.rowHeight !== undefined && options.rowHeight > 0) this.rowHeight = options.rowHeight;
    if (options.dayWidth !== undefined && options.dayWidth > 0) this.dayWidth = options.dayWidth;
    if (options.headerHeight !== undefined && options.headerHeight >= 0) this.headerHeight = options.headerHeight;
    if (options.showCriticalPath !== undefined) this.showCriticalPath = options.showCriticalPath;
    if (options.theme !== undefined) this.theme = options.theme;
    if (options.colors) this.colorOverrides = { ...this.colorOverrides, ...options.colors };
    if (options.theme !== undefined || options.colors) {
      this.colors = this.resolveColors();
      this.labelColorCache.clear(); // unparseable bar colors fall back to the theme text color
    }
    this.spatialGrid.update(this.rows, this.timelineStart, this.rowHeight, this.dayWidth);
  }

  private resolveColors(): CanvasColorConfig {
    const base = this.theme === "swiss-light" ? DEFAULT_LIGHT_COLORS : DEFAULT_DARK_COLORS;
    return { ...base, ...this.colorOverrides };
  }

  /** Builds the per-plan index: live rows, timeline bounds, day offsets and dependency edges. */
  private indexPlan() {
    const tasks = this.plan.tasks || [];
    this.indexedTasks = this.plan.tasks;
    this.indexedTaskCount = tasks.length;

    // Soft-deleted tombstones are never drawn, indexed or hit-tested.
    const rows = tasks.filter((t) => t && !t._deleted);
    const count = rows.length;
    const startDays = new Float64Array(count);
    const spanDays = new Float64Array(count);
    const milestones = new Uint8Array(count);

    let minDay = dayNumber(this.plan.meta?.start);
    let maxDay = dayNumber(this.plan.meta?.end);
    for (let i = 0; i < count; i++) {
      const start = dayNumber(rows[i].start);
      const end = dayNumber(rows[i].end);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        startDays[i] = NaN;
        continue;
      }
      startDays[i] = start;
      spanDays[i] = Math.max(1, end - start + 1);
      // Only flagged tasks are diamonds; a single-day task is a one-day bar (MS Project / P6 semantics).
      milestones[i] = rows[i].milestone === true ? 1 : 0;
      if (!(start >= minDay)) minDay = start;
      if (!(end <= maxDay)) maxDay = end;
    }

    if (Number.isNaN(minDay)) minDay = Number.isNaN(maxDay) ? DEFAULT_START_DAY : Math.min(maxDay, DEFAULT_START_DAY);
    if (Number.isNaN(maxDay)) maxDay = Math.max(minDay, DEFAULT_END_DAY);
    if (maxDay < minDay) maxDay = minDay;

    // Pad 7 days before and 14 days after.
    const firstDay = minDay - 7;
    const lastDay = maxDay + 14;
    for (let i = 0; i < count; i++) startDays[i] -= firstDay;

    this.timelineStartDay = firstDay;
    this.timelineStart = formatDay(firstDay);
    this.timelineEnd = formatDay(lastDay);
    this.totalDays = Math.max(1, lastDay - firstDay + 1);

    const indexById = new Map<string, number>();
    rows.forEach((t, i) => {
      if (!indexById.has(t.id)) indexById.set(t.id, i);
    });
    const edges: DependencyEdge[] = [];
    for (let i = 0; i < count; i++) {
      if (rows[i].dependsOn === undefined || rows[i].dependsOn === null) continue;
      // Known ids keep an id such as "render-3d" from being read as "render" with a 3-day lead.
      for (const rel of getTaskDependencyRelations(rows[i], indexById)) {
        const pred = indexById.get(rel.id);
        if (pred !== undefined && pred !== i) edges.push({ pred, succ: i, type: rel.type });
      }
    }

    this.rows = rows;
    this.startDays = startDays;
    this.spanDays = spanDays;
    this.milestones = milestones;
    this.edges = edges;
    this.criticalIds = null;
    this.minimapLayer = null;
    this.planVersion++;
  }

  /**
   * Critical task ids (and critical links), resolved lazily once per plan. Tasks flagged
   * `critical: true` are taken as a critical path the caller already computed (a second CPM run
   * costs seconds on 100k-task plans); otherwise the CPM engine runs with the plan's gap and
   * target date so the canvas agrees with the other views.
   */
  private getCriticalIds(): Set<string> {
    if (!this.criticalIds) {
      const { rows, edges } = this;
      let ids: Set<string> | undefined;
      let links: Set<string> | null = null;
      for (const t of rows) {
        if (t.critical === true) (ids ??= new Set()).add(t.id);
      }
      if (!ids) {
        const meta = this.plan.meta;
        try {
          const result = calculateCriticalPath(rows, {
            targetDate: typeof meta?.targetDate === "string" ? meta.targetDate : undefined,
            defaultGapDays: meta?.defaultGapDays
          });
          ids = result.criticalTaskIds;
          links = result.criticalDepKeys;
        } catch {
          ids = new Set();
        }
      }
      const flags = new Uint8Array(edges.length);
      for (let k = 0; k < edges.length; k++) {
        const pred = rows[edges[k].pred].id;
        const succ = rows[edges[k].succ].id;
        flags[k] = (links ? links.has(`${pred}->${succ}`) : ids.has(pred) && ids.has(succ)) ? 1 : 0;
      }
      this.criticalIds = ids;
      this.criticalEdges = flags;
    }
    return this.criticalIds;
  }

  public hitTest(canvasX: number, canvasY: number, viewport: ViewportState): HitTestResult | null {
    // Points over the sticky header or outside the canvas never resolve to a (hidden) task row.
    if (canvasY < this.headerHeight || canvasY > viewport.height || canvasX < 0 || canvasX > viewport.width) {
      return null;
    }
    const worldX = canvasX + viewport.scrollX;
    const worldY = canvasY + viewport.scrollY - this.headerHeight;
    return this.spatialGrid.hitTest(worldX, worldY);
  }

  public render(ctx: CanvasRenderingContext2D, viewport: ViewportState) {
    const totalCount = this.rows.length;

    const { width, height, scrollX, scrollY } = viewport;
    const { rowHeight, dayWidth, headerHeight, colors } = this;
    const dpr = viewport.devicePixelRatio && viewport.devicePixelRatio > 0 ? viewport.devicePixelRatio : 1;

    ctx.save();
    // Everything below is drawn in CSS pixels; the backing store is (width * dpr) x (height * dpr).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Clear background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    // 2. Compute 2D Virtual Windows (O(1) culling)
    const bodyHeight = Math.max(0, height - headerHeight);
    const vertWindow = computeVerticalVirtualWindow(totalCount, rowHeight, scrollY, bodyHeight, 5);
    const horizWindow = computeHorizontalVirtualWindow(this.totalDays, dayWidth, scrollX, width, 5);
    const critical = this.showCriticalPath ? this.getCriticalIds() : null;

    // 3. Clip to the body so bars, highlights and links never paint over the sticky header
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, headerHeight, width, bodyHeight);
    ctx.clip();

    ctx.translate(-scrollX, -scrollY + headerHeight);

    // 4. Draw alternating rows, weekend columns & vertical grid lines
    this.drawGrid(ctx, vertWindow, horizWindow);

    // 5. Draw visible task bars and milestones
    this.drawTaskBars(ctx, vertWindow, horizWindow, critical);

    // 6. Draw dependencies
    this.drawDependencies(ctx, vertWindow, horizWindow, critical);

    ctx.restore();

    // 7. Draw sticky header on top
    this.drawHeader(ctx, viewport, horizWindow);

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, vert: VerticalVirtualWindow, horiz: HorizontalVirtualWindow) {
    const { rowHeight, dayWidth, colors } = this;
    const gridLeft = horiz.startDayOffset * dayWidth;
    const gridRight = (horiz.endDayOffset + 1) * dayWidth;
    const top = vert.startIndex * rowHeight;
    const bottom = vert.endIndex * rowHeight;

    // Alternating row stripes and weekend columns share the subtle stripe tint
    ctx.fillStyle = colors.rowAlt;
    for (let i = vert.startIndex; i < vert.endIndex; i++) {
      if (i % 2 === 1) {
        ctx.fillRect(gridLeft, i * rowHeight, gridRight - gridLeft, rowHeight);
      }
    }
    if (dayWidth >= 8) {
      for (let d = horiz.startDayOffset; d <= horiz.endDayOffset; d++) {
        const dow = dayOfWeek(this.timelineStartDay + d);
        if (dow === 0 || dow === 6) ctx.fillRect(d * dayWidth, top, dayWidth, bottom - top);
      }
    }

    // Vertical day grid lines
    ctx.strokeStyle = colors.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let d = horiz.startDayOffset; d <= horiz.endDayOffset; d++) {
      const x = d * dayWidth;
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    ctx.stroke();

    // Vertical Today indicator line
    const now = new Date();
    const todayEpochDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
    const todayFraction = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
    const todayOffset = todayEpochDay - this.timelineStartDay + todayFraction;
    if (todayOffset >= horiz.startDayOffset - 1 && todayOffset <= horiz.endDayOffset + 1) {
      const tx = todayOffset * dayWidth;
      ctx.save();
      ctx.strokeStyle = colors.critical || "#EF4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, top);
      ctx.lineTo(tx, Math.max(bottom, top + 2000));
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawTaskBars(
    ctx: CanvasRenderingContext2D,
    vert: VerticalVirtualWindow,
    horiz: HorizontalVirtualWindow,
    critical: Set<string> | null
  ) {
    const { rows, startDays, spanDays, milestones, rowHeight, dayWidth, colors } = this;
    const categories = this.plan.categories || {};

    const BAR_HEIGHT = Math.max(16, rowHeight - 12);
    const BAR_Y_OFFSET = (rowHeight - BAR_HEIGHT) / 2;

    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (let i = vert.startIndex; i < vert.endIndex; i++) {
      const t = rows[i];
      const startDay = startDays[i];
      if (!t || Number.isNaN(startDay)) continue;
      const durationDays = spanDays[i];

      // Horizontal culling
      if (startDay + durationDays < horiz.startDayOffset || startDay > horiz.endDayOffset) {
        continue;
      }

      const barX = startDay * dayWidth;
      const barY = i * rowHeight + BAR_Y_OFFSET;
      const barW = durationDays * dayWidth;
      const textY = barY + BAR_HEIGHT / 2;
      const label = String(t.label || t.name || t.id);
      const isCritical = critical !== null && critical.has(t.id);

      // Task color, then category color, then the theme primary (matches the DOM renderer)
      const barColor = (typeof t.color === "string" && t.color) || categories[t.category]?.color || colors.primary;

      if (milestones[i]) {
        // Draw Milestone Diamond
        const size = BAR_HEIGHT * 0.8;
        const cx = barX + dayWidth / 2;

        ctx.save();
        ctx.translate(cx, textY);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = barColor;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        if (isCritical) {
          ctx.strokeStyle = colors.critical;
          ctx.lineWidth = 2;
          ctx.strokeRect(-size / 2 - 1, -size / 2 - 1, size + 2, size + 2);
        }
        ctx.restore();

        ctx.fillStyle = colors.text;
        ctx.fillText(label, cx + size * Math.SQRT1_2 + 6, textY);
      } else if (t.isGroup || t.type === "group" || t.type === "summary") {
        // Draw Summary / Group Parent Bracket [=======]
        ctx.fillStyle = isCritical ? colors.critical : colors.text;
        const bracketH = 8;
        ctx.fillRect(barX, barY + 2, barW, bracketH);
        // Downward end chevrons
        ctx.beginPath();
        ctx.moveTo(barX, barY + 2);
        ctx.lineTo(barX, barY + BAR_HEIGHT - 2);
        ctx.lineTo(barX + 6, barY + 2 + bracketH);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(barX + barW, barY + 2);
        ctx.lineTo(barX + barW, barY + BAR_HEIGHT - 2);
        ctx.lineTo(barX + barW - 6, barY + 2 + bracketH);
        ctx.closePath();
        ctx.fill();

        // Label Text for Group
        ctx.fillStyle = colors.text;
        ctx.font = GROUP_FONT;
        ctx.fillText(label, barX + barW + 8, textY);
        ctx.font = LABEL_FONT;
      } else {
        // Draw Task Bar
        const radius = 4;
        ctx.fillStyle = barColor;
        this.fillRoundedRect(ctx, barX, barY, barW, BAR_HEIGHT, radius);

        // Progress Fill
        if (typeof t.progress === "number" && t.progress > 0) {
          const progW = barW * Math.min(1, t.progress);
          ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
          this.fillRoundedRect(ctx, barX, barY, progW, BAR_HEIGHT, radius);
        }

        // Critical Path Highlight (computed CPM path)
        if (isCritical) {
          ctx.strokeStyle = colors.critical;
          ctx.lineWidth = 2;
          ctx.strokeRect(barX - 1, barY - 1, barW + 2, BAR_HEIGHT + 2);
        }

        // Label: inside wide bars (truncated with an ellipsis, contrast-aware), otherwise after the bar
        if (barW > 60) {
          ctx.fillStyle = this.labelColorOn(barColor);
          ctx.fillText(this.fitLabel(ctx, label, barW - 16), barX + 8, textY);
        } else {
          ctx.fillStyle = colors.text;
          ctx.fillText(label, barX + barW + 6, textY);
        }
      }
    }
  }

  /** X of a row's start edge or inclusive end edge; milestones anchor on their diamond tips. */
  private anchorX(row: number, atEnd: boolean, halfDiamond: number): number {
    const x = this.startDays[row] * this.dayWidth;
    if (this.milestones[row]) {
      const cx = x + this.dayWidth / 2;
      return atEnd ? cx + halfDiamond : cx - halfDiamond;
    }
    return atEnd ? x + this.spanDays[row] * this.dayWidth : x;
  }

  private drawDependencies(
    ctx: CanvasRenderingContext2D,
    vert: VerticalVirtualWindow,
    horiz: HorizontalVirtualWindow,
    critical: Set<string> | null
  ) {
    const { edges, startDays, dayWidth, rowHeight, colors } = this;
    if (edges.length === 0 || vert.endIndex <= vert.startIndex) return;
    const criticalEdges = critical !== null ? this.criticalEdges : null;

    const firstRow = vert.startIndex;
    const lastRow = vert.endIndex - 1;
    const minX = horiz.startDayOffset * dayWidth - LINK_STUB;
    const maxX = (horiz.endDayOffset + 1) * dayWidth + LINK_STUB;
    const halfDiamond = Math.max(16, rowHeight - 12) * 0.8 * Math.SQRT1_2;

    // Keep every link whose vertical span crosses the window, so links between off-screen rows
    // that pass through the viewport are drawn too.
    const normal: number[] = [];
    const criticalLinks: number[] = [];
    for (let k = 0; k < edges.length; k++) {
      const { pred, succ, type } = edges[k];
      if ((pred < succ ? succ : pred) < firstRow || (pred < succ ? pred : succ) > lastRow) continue;
      if (Number.isNaN(startDays[pred]) || Number.isNaN(startDays[succ])) continue;
      const fromX = this.anchorX(pred, type === "FS" || type === "FF", halfDiamond);
      const toX = this.anchorX(succ, type === "FF" || type === "SF", halfDiamond);
      if (Math.max(fromX, toX) + LINK_STUB < minX || Math.min(fromX, toX) - LINK_STUB > maxX) continue;
      (criticalEdges !== null && criticalEdges[k] === 1 ? criticalLinks : normal).push(k);
    }

    this.strokeLinks(ctx, normal, colors.primary, halfDiamond);
    this.strokeLinks(ctx, criticalLinks, colors.critical, halfDiamond);
  }

  /**
   * Draws orthogonal links in one stroke and one fill per color. A link leaves the predecessor's
   * start or end edge (by type), enters the successor's start edge from the left or its end edge
   * from the right, and detours along the row boundary when the two would otherwise backtrack.
   */
  private strokeLinks(ctx: CanvasRenderingContext2D, links: number[], color: string, halfDiamond: number) {
    if (links.length === 0) return;
    const { edges, rowHeight } = this;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    for (const k of links) {
      const { pred, succ, type } = edges[k];
      const fromEnd = type === "FS" || type === "FF";
      const entryDir = type === "FF" || type === "SF" ? -1 : 1; // travel direction into the successor
      const fromX = this.anchorX(pred, fromEnd, halfDiamond);
      const toX = this.anchorX(succ, entryDir < 0, halfDiamond);
      const fromY = pred * rowHeight + rowHeight / 2;
      const toY = succ * rowHeight + rowHeight / 2;
      const exitX = fromX + (fromEnd ? LINK_STUB : -LINK_STUB);
      const entryX = toX - entryDir * LINK_STUB;

      ctx.moveTo(fromX, fromY);
      ctx.lineTo(exitX, fromY);
      if ((entryX - exitX) * entryDir >= 0) {
        ctx.lineTo(exitX, toY);
      } else {
        const midY = toY - (Math.sign(toY - fromY) * rowHeight) / 2;
        ctx.lineTo(exitX, midY);
        ctx.lineTo(entryX, midY);
        ctx.lineTo(entryX, toY);
      }
      ctx.lineTo(toX, toY);
    }
    ctx.stroke();

    // Arrow heads point along the final segment
    ctx.beginPath();
    for (const k of links) {
      const { succ, type } = edges[k];
      const entryDir = type === "FF" || type === "SF" ? -1 : 1;
      const toX = this.anchorX(succ, entryDir < 0, halfDiamond);
      const toY = succ * rowHeight + rowHeight / 2;
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - entryDir * 5, toY - 4);
      ctx.lineTo(toX - entryDir * 5, toY + 4);
      ctx.closePath();
    }
    ctx.fill();
  }

  private drawHeader(ctx: CanvasRenderingContext2D, viewport: ViewportState, horiz: HorizontalVirtualWindow) {
    const { width, scrollX } = viewport;
    const { headerHeight, dayWidth, colors } = this;
    const tierY = Math.round(headerHeight / 2);

    // Header Background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, headerHeight);

    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, headerHeight);
    ctx.clip();
    ctx.translate(-scrollX, 0);
    ctx.textBaseline = "middle";

    // Top tier: month / year labels; the leftmost one sticks to the visible edge until pushed out.
    const firstVisible = Math.max(0, Math.floor(scrollX / dayWidth));
    const lastVisible = Math.min(this.totalDays, Math.ceil((scrollX + width) / dayWidth));
    ctx.font = MONTH_FONT;
    ctx.textAlign = "left";
    ctx.fillStyle = colors.text;
    ctx.strokeStyle = colors.border;
    ctx.beginPath();

    const first = new Date((this.timelineStartDay + firstVisible) * DAY_MS);
    let year = first.getUTCFullYear();
    let month = first.getUTCMonth();
    for (;;) {
      const monthStart = Date.UTC(year, month, 1) / DAY_MS - this.timelineStartDay;
      if (monthStart > lastVisible) break;
      const nextMonthX = (Date.UTC(year, month + 1, 1) / DAY_MS - this.timelineStartDay) * dayWidth;
      const monthX = monthStart * dayWidth;
      const text = `${MONTH_LABELS[month]} ${year}`;
      const textWidth = ctx.measureText(text).width;
      const pinned = monthX < scrollX;
      if (pinned || nextMonthX - monthX >= textWidth + 12) {
        const textX = pinned ? Math.min(scrollX + 6, nextMonthX - textWidth - 6) : monthX + 6;
        ctx.fillText(text, textX, tierY / 2 + 1);
      }
      if (monthStart >= firstVisible) {
        ctx.moveTo(monthX, 0);
        ctx.lineTo(monthX, headerHeight);
      }
      month++;
      if (month === 12) {
        month = 0;
        year++;
      }
    }
    ctx.stroke();

    // Bottom tier: every day number when there is room, otherwise Mondays only
    const everyDay = dayWidth >= 18;
    if (everyDay || dayWidth * 7 >= 28) {
      ctx.font = DAY_FONT;
      ctx.textAlign = "center";
      ctx.fillStyle = colors.textMuted;
      const dayY = tierY + (headerHeight - tierY) / 2;
      for (let d = horiz.startDayOffset; d <= horiz.endDayOffset; d++) {
        const day = this.timelineStartDay + d;
        if (!everyDay && dayOfWeek(day) !== 1) continue;
        ctx.fillText(String(new Date(day * DAY_MS).getUTCDate()), d * dayWidth + dayWidth / 2, dayY);
      }
    }

    ctx.restore();
  }

  /** Fits a label into maxWidth with a trailing ellipsis (binary search), memoized per width. */
  private fitLabel(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
    const key = `${Math.floor(maxWidth)}\u0000${label}`;
    const cached = this.labelCache.get(key);
    if (cached !== undefined) return cached;

    let fitted = label;
    if (ctx.measureText(label).width > maxWidth) {
      const chars = Array.from(label);
      let lo = 0;
      let hi = chars.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(`${chars.slice(0, mid).join("")}…`).width <= maxWidth) lo = mid;
        else hi = mid - 1;
      }
      fitted = lo > 0 ? `${chars.slice(0, lo).join("")}…` : "";
    }

    if (this.labelCache.size >= LABEL_CACHE_LIMIT) this.labelCache.clear();
    this.labelCache.set(key, fitted);
    return fitted;
  }

  /** Dark or light label color with readable contrast on the given bar color. */
  private labelColorOn(barColor: string): string {
    let color = this.labelColorCache.get(barColor);
    if (color === undefined) {
      const rgb = parseRgb(barColor);
      color = rgb ? ((0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.6 ? DARK_LABEL : LIGHT_LABEL) : this.colors.text;
      if (this.labelColorCache.size >= 256) this.labelColorCache.clear();
      this.labelColorCache.set(barColor, color);
    }
    return color;
  }

  private fillRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  public getWorldBounds() {
    return {
      totalDays: this.totalDays,
      totalWorldWidth: Math.max(1, this.totalDays * this.dayWidth),
      totalWorldHeight: Math.max(1, this.rows.length * this.rowHeight),
      timelineStart: this.timelineStart,
      timelineEnd: this.timelineEnd
    };
  }

  /**
   * Draws the overview minimap into a minimapWidth x minimapHeight (CSS px) area, scaled to the
   * minimap canvas's own backing store. Task bars are cached in an OffscreenCanvas layer and
   * redrawn only when the plan, size or colors change; each call just blits it and the viewport box.
   */
  public renderMinimap(
    ctx: CanvasRenderingContext2D,
    minimapWidth: number,
    minimapHeight: number,
    viewport: ViewportState
  ) {
    const totalCount = this.rows.length;
    const { colors } = this;
    const backingWidth = ctx.canvas?.width;
    const pixelRatio = backingWidth && minimapWidth > 0 ? backingWidth / minimapWidth : 1;

    ctx.save();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, minimapWidth, minimapHeight);

    // Background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, minimapWidth, minimapHeight);

    if (totalCount === 0) {
      ctx.restore();
      return { scaleX: 1, scaleY: 1, totalWorldWidth: 1, totalWorldHeight: 1 };
    }

    const totalWorldWidth = Math.max(1, this.totalDays * this.dayWidth);
    const totalWorldHeight = Math.max(1, totalCount * this.rowHeight);

    const scaleX = minimapWidth / totalWorldWidth;
    const scaleY = minimapHeight / totalWorldHeight;

    // Micro task bars
    this.drawMinimapBars(ctx, minimapWidth, minimapHeight, pixelRatio);

    // Viewport Frustum Box
    const vx = viewport.scrollX * scaleX;
    const vy = viewport.scrollY * scaleY;
    const vw = Math.min(minimapWidth, viewport.width * scaleX);
    const vh = Math.min(minimapHeight, (viewport.height - this.headerHeight) * scaleY);

    ctx.globalAlpha = 0.15;
    ctx.fillStyle = colors.primary;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.restore();

    return { scaleX, scaleY, totalWorldWidth, totalWorldHeight };
  }

  private drawMinimapBars(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number) {
    const critical = this.showCriticalPath ? this.getCriticalIds() : null;
    if (typeof OffscreenCanvas === "undefined") {
      this.paintMinimapBars(ctx, width, height, critical);
      return;
    }

    const key = [this.planVersion, width, height, pixelRatio, this.rowHeight, this.colors.primary, this.colors.critical, critical ? 1 : 0].join("|");
    if (!this.minimapLayer || this.minimapLayer.key !== key) {
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * pixelRatio)), Math.max(1, Math.round(height * pixelRatio)));
      const layerCtx = canvas.getContext("2d");
      if (!layerCtx) {
        this.paintMinimapBars(ctx, width, height, critical);
        return;
      }
      layerCtx.scale(pixelRatio, pixelRatio);
      this.paintMinimapBars(layerCtx, width, height, critical);
      this.minimapLayer = { key, canvas };
    }
    ctx.drawImage(this.minimapLayer.canvas, 0, 0, width, height);
  }

  private paintMinimapBars(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    critical: Set<string> | null
  ) {
    const { rows, startDays, spanDays, rowHeight } = this;
    const xPerDay = width / this.totalDays;
    const yPerRow = height / rows.length;
    const barHeight = Math.max(1.5, (yPerRow * (rowHeight - 8)) / rowHeight);

    // One pass per color keeps fillStyle changes to two per paint.
    for (const pass of critical ? [false, true] : [false]) {
      ctx.fillStyle = pass ? this.colors.critical : this.colors.primary;
      for (let i = 0; i < rows.length; i++) {
        if (Number.isNaN(startDays[i])) continue;
        if (critical && critical.has(rows[i].id) !== pass) continue;
        ctx.fillRect(startDays[i] * xPerDay, i * yPerRow, Math.max(2, spanDays[i] * xPerDay), barHeight);
      }
    }
  }
}

/** Days since the Unix epoch for a valid YYYY-MM-DD value, otherwise NaN. */
function dayNumber(value: unknown): number {
  if (typeof value !== "string" || !isValidISODate(value)) return NaN;
  return Date.parse(`${value.split("T")[0].trim()}T00:00:00Z`) / DAY_MS;
}

function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday (1970-01-01 was a Thursday). */
function dayOfWeek(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

/** Parses #rgb / #rrggbb(aa) / rgb(a)() colors; null for anything else. */
function parseRgb(color: string): [number, number, number] | null {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(value);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
