import {
  Category,
  JanttData,
  ViewportOptions,
  TaskLayout,
  DependencyLine,
  GridHeader,
  HeaderYear,
  HeaderMonth,
  HeaderWeek,
  HeaderDay,
  JanttLayoutResult,
  TimeScale,
  LinkRoutingStyle,
  CriticalPathResult
} from "./types";
import {
  addDays,
  diffDays,
  getTodayISODate,
  getTodayProgressFraction,
  isValidISODate,
  isWeekend,
  maxISODate,
  minISODate,
  parseISODate
} from "./date-math";
import { calculateCriticalPath } from "./resolver";
import { getTaskDependencyRelations } from "./dependencies";
import { clampDayWidth, getTaskDisplayName, sanitizeCssColor } from "./utils";
import {
  DEFAULT_CATEGORY,
  DEFAULT_GAP_DAYS,
  SCALE_DAY_WIDTHS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_LABEL_WIDTH,
  DEFAULT_HEADER_HEIGHT,
  MULTI_YEAR_HEADER_HEIGHT
} from "./constants";

export { SCALE_DAY_WIDTHS };
/** @deprecated Import `sanitizeCssColor` from the utils module (the single color allow-list). */
export { sanitizeCssColor };

/**
 * Derives the optimal header scale tier from a continuous day width in pixels.
 * - dayWidth >= 28px: Day tier (detailed dates and day names)
 * - 12px <= dayWidth < 28px: Week tier (compact day numbers)
 * - 5px <= dayWidth < 12px: Month tier (months over ISO weeks)
 * - 2.2px < dayWidth < 5px: Quarter tier (quarters over months)
 * - dayWidth <= 2.2px: Year tier (multi-year roadmap). The `year` preset width
 *   (SCALE_DAY_WIDTHS.year) maps back to "year", so presets round-trip.
 */
export function getScaleFromDayWidth(dayWidth: number): TimeScale {
  if (dayWidth >= 28) return "day";
  if (dayWidth >= 12) return "week";
  if (dayWidth >= 5) return "month";
  if (dayWidth > SCALE_DAY_WIDTHS.year) return "quarter";
  return "year";
}

/**
 * Upper bound on the rendered timeline span (~10 years). Every rendered day costs header and grid
 * work, so an absurd date (typo year, hostile shared plan) must never be able to freeze the tab.
 */
const MAX_TIMELINE_DAYS = 3660;

/**
 * Header height in px for the rendered tiers (multi-year spans add a year row).
 * An explicit `viewport.headerHeight` acts as a minimum.
 */
export function resolveHeaderHeight(spansMultipleYears: boolean, minHeight?: number): number {
  const tiersHeight = spansMultipleYears ? MULTI_YEAR_HEADER_HEIGHT : DEFAULT_HEADER_HEIGHT;
  return Math.max(tiersHeight, minHeight || 0);
}

export interface ChartBounds {
  startDate: string;
  endDate: string;
  totalDays: number;
  spansMultipleYears: boolean;
}

function resolveScale(data: JanttData, viewportOptions: ViewportOptions): { scale: TimeScale; dayWidth: number } {
  if (viewportOptions.dayWidth !== undefined) {
    const dayWidth = clampDayWidth(viewportOptions.dayWidth);
    return { scale: getScaleFromDayWidth(dayWidth), dayWidth };
  }
  // Unknown or empty scale names (e.g. hand-edited meta.scale) fall back to the day tier
  const requested = viewportOptions.scale || data.meta?.scale;
  const scale: TimeScale =
    requested && Object.prototype.hasOwnProperty.call(SCALE_DAY_WIDTHS, requested) ? requested : "day";
  return { scale, dayWidth: SCALE_DAY_WIDTHS[scale] };
}

/**
 * Computes the timeline window exactly as {@link layout} does, so callers that need the header
 * height before laying out (fit-to-container row sizing) always agree with the rendered chart.
 */
export function computeChartBounds(data: JanttData, viewportOptions: ViewportOptions = {}): ChartBounds {
  const tasks = (data.tasks || []).filter((t) => !t._deleted);
  const { scale } = resolveScale(data, viewportOptions);
  const showToday = viewportOptions.showToday ?? true;
  const todayStr = getTodayISODate(viewportOptions.currentTime);

  // Only real calendar dates may influence the window: one bad value must not yield NaN bounds.
  let minTaskStart = "";
  let maxTaskEnd = "";
  const include = (dateStr: unknown) => {
    if (typeof dateStr !== "string" || !isValidISODate(dateStr)) return;
    minTaskStart = minTaskStart ? minISODate(minTaskStart, dateStr) : dateStr;
    maxTaskEnd = maxTaskEnd ? maxISODate(maxTaskEnd, dateStr) : dateStr;
  };
  tasks.forEach((t) => {
    include(t.start);
    include(t.end);
    include(t.baseline?.start);
    include(t.baseline?.end);
  });
  if (!minTaskStart) {
    minTaskStart = todayStr;
    maxTaskEnd = todayStr;
  }

  // Ensure selectedDate is always within calculated timeline runway
  include(viewportOptions.selectedDate);

  // Generous runway buffer (scale-dependent)
  const bufferBefore = scale === "year" || scale === "quarter" ? 30 : scale === "month" ? 14 : 4;
  const bufferAfter = scale === "year" || scale === "quarter" ? 90 : scale === "month" ? 30 : 14;

  const firstValidDate = (...candidates: unknown[]): string =>
    (candidates.find((c) => typeof c === "string" && isValidISODate(c)) as string | undefined) || "";
  let chartStart = firstValidDate(viewportOptions.startDate, data.meta?.start, data.meta?.chartStart);
  let chartEnd = firstValidDate(viewportOptions.endDate, data.meta?.end, data.meta?.chartEnd);

  if (!chartStart) {
    const effectiveStart = showToday ? minISODate(minTaskStart, todayStr) : minTaskStart;
    chartStart = addDays(effectiveStart, -bufferBefore);
  } else if (diffDays(chartStart, minTaskStart) < 0) {
    // If a task was moved BEFORE the specified chartStart, dynamically expand chartStart
    chartStart = addDays(minTaskStart, -bufferBefore);
  }

  if (!chartEnd) {
    const effectiveEnd = showToday ? maxISODate(maxTaskEnd, todayStr) : maxTaskEnd;
    chartEnd = addDays(effectiveEnd, bufferAfter);
  } else if (diffDays(chartEnd, maxTaskEnd) > 0) {
    // If a task was pushed forward PAST the specified chartEnd, dynamically expand chartEnd!
    chartEnd = addDays(maxTaskEnd, bufferAfter);
  }

  // Ensure minimum span of at least 7 days
  if (diffDays(chartStart, chartEnd) < 7) {
    chartEnd = addDays(chartStart, 14);
  }

  // Bound the span: first drop extensions caused by explicit bounds or a distant "today", then
  // hard-cap whatever is left so pathological plans stay renderable.
  if (diffDays(chartStart, chartEnd) > MAX_TIMELINE_DAYS) {
    const taskWindowStart = addDays(minTaskStart, -bufferBefore);
    const taskWindowEnd = addDays(maxTaskEnd, bufferAfter);
    if (diffDays(chartStart, taskWindowStart) > 0) chartStart = taskWindowStart;
    if (diffDays(taskWindowEnd, chartEnd) > 0) chartEnd = taskWindowEnd;
    if (diffDays(chartStart, chartEnd) > MAX_TIMELINE_DAYS) {
      chartEnd = addDays(chartStart, MAX_TIMELINE_DAYS);
    }
  }

  return {
    startDate: chartStart,
    endDate: chartEnd,
    totalDays: Math.max(diffDays(chartStart, chartEnd), 1),
    spansMultipleYears: parseISODate(chartStart).getUTCFullYear() !== parseISODate(chartEnd).getUTCFullYear()
  };
}

const DEFAULT_VIEWPORT: Required<Omit<ViewportOptions, "columns" | "currentTime" | "selectedDate" | "criticalResult" | "showDateFilterBadge" | "filterTasksByDate">> = {
  dayWidth: 32,
  rowHeight: DEFAULT_ROW_HEIGHT,
  rowHeightMode: "fit",
  labelWidth: DEFAULT_LABEL_WIDTH,
  headerHeight: DEFAULT_HEADER_HEIGHT,
  startDate: "",
  endDate: "",
  scale: "day",
  linkRouting: "orthogonal",
  showToday: true,
  showTodayTag: false,
  showWeekends: true,
  showCriticalPath: false,
  showBaselines: false,
  autoCascade: true
};

/**
 * Computes exact pixel coordinates, scale metrics, milestones, baselines, and critical paths.
 */
export function layout(
  data: JanttData,
  viewportOptions: ViewportOptions = {}
): JanttLayoutResult {
  const tasks = (data.tasks || []).filter((t) => !t._deleted);
  const categories = data.categories || {};

  // Auto-adjust scale tier based on continuous dayWidth (an explicit dayWidth always wins)
  const { scale, dayWidth } = resolveScale(data, viewportOptions);

  const viewport: Required<Omit<ViewportOptions, "columns" | "currentTime" | "selectedDate" | "criticalResult" | "showDateFilterBadge" | "filterTasksByDate">> & {
    columns?: ViewportOptions["columns"];
    currentTime?: Date;
    selectedDate?: string | null;
    showDateFilterBadge?: boolean;
    filterTasksByDate?: boolean;
    criticalResult?: CriticalPathResult;
  } = {
    ...DEFAULT_VIEWPORT,
    dayWidth,
    scale,
    linkRouting: viewportOptions.linkRouting || data.meta?.linkRouting || "orthogonal",
    showCriticalPath: viewportOptions.showCriticalPath ?? (data.meta?.showCriticalPath ?? false),
    showBaselines: viewportOptions.showBaselines ?? (data.meta?.showBaselines ?? false),
    showToday: viewportOptions.showToday ?? true,
    showTodayTag: viewportOptions.showTodayTag ?? false,
    showWeekends: viewportOptions.showWeekends ?? true,
    autoCascade: viewportOptions.autoCascade ?? (data.meta?.autoCascade ?? true),
    rowHeight: viewportOptions.rowHeight || DEFAULT_VIEWPORT.rowHeight,
    rowHeightMode: viewportOptions.rowHeightMode || DEFAULT_VIEWPORT.rowHeightMode,
    labelWidth: viewportOptions.labelWidth || DEFAULT_VIEWPORT.labelWidth,
    headerHeight: viewportOptions.headerHeight || DEFAULT_VIEWPORT.headerHeight,
    startDate: viewportOptions.startDate || "",
    endDate: viewportOptions.endDate || "",
    currentTime: viewportOptions.currentTime,
    selectedDate: viewportOptions.selectedDate,
    showDateFilterBadge: viewportOptions.showDateFilterBadge,
    filterTasksByDate: viewportOptions.filterTasksByDate,
    criticalResult: viewportOptions.criticalResult
  };

  // Determine overall timeline bounds dynamically based on active tasks
  const todayStr = getTodayISODate(viewport.currentTime);
  const bounds = computeChartBounds(data, viewportOptions);
  const chartStart = bounds.startDate;
  const chartEnd = bounds.endDate;
  const totalDays = bounds.totalDays;

  viewport.startDate = chartStart;
  viewport.endDate = chartEnd;

  const canvasWidth = Math.max(totalDays * viewport.dayWidth, 600);
  const canvasHeight = Math.max(tasks.length * viewport.rowHeight, viewport.rowHeight);

  // Critical path (the engine passes its master result; otherwise computed with the plan's gap and
  // deadline so the highlighted chain matches the cascade that drew the bars)
  const criticalResult =
    viewportOptions.criticalResult ||
    calculateCriticalPath(tasks, {
      defaultGapDays: data.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS,
      targetDate: data.meta?.targetDate,
      calendar: data.meta?.calendar,
      useWorkingDays: data.meta?.useWorkingDays,
      calendars: data.calendars,
      people: data.people
    });
  const { criticalTaskIds, criticalDepKeys } = criticalResult;

  // Compute TaskLayouts: Proportional bar height (~62% of row height) with vertical padding for dependency clearance
  const verticalPadding = Math.max(8, Math.round(viewport.rowHeight * 0.36));
  const barHeight = Math.max(18, Math.min(48, viewport.rowHeight - verticalPadding));
  let barYOffset = (viewport.rowHeight - barHeight) / 2;

  // Baseline ghost bars sit under the bar; when the row is too short for bar + baseline, lift the
  // pair so the baseline never bleeds into the next row.
  const BASELINE_GAP = 2;
  const BASELINE_HEIGHT = 4;
  if (viewport.showBaselines && tasks.some((t) => t.baseline)) {
    const block = barHeight + BASELINE_GAP + BASELINE_HEIGHT;
    if (barYOffset + block > viewport.rowHeight - 1) {
      barYOffset = Math.max(1, (viewport.rowHeight - block) / 2);
    }
  }

  // Resolve each category once: own keys only (no prototype lookups such as "constructor") and a
  // sanitized color, so every layout consumer receives safe values.
  const categoryCache = new Map<string, Category>();
  const resolveCategory = (key: unknown): Category => {
    const id = typeof key === "string" ? key : String(key ?? "");
    let cat = categoryCache.get(id);
    if (!cat) {
      const raw = Object.prototype.hasOwnProperty.call(categories, id) ? categories[id] : undefined;
      cat = raw && typeof raw === "object"
        ? { ...raw, color: sanitizeCssColor(raw.color, DEFAULT_CATEGORY.color) }
        : DEFAULT_CATEGORY;
      categoryCache.set(id, cat);
    }
    return cat;
  };

  const taskLayouts: TaskLayout[] = [];
  const layoutById = new Map<string, TaskLayout>();

  tasks.forEach((task, rowIndex) => {
    const rawDiff = diffDays(task.start, task.end);
    // Only flagged tasks are milestones: a start === end task is a one-day bar, exactly as the
    // cascade and the CPM schedule it.
    const isMilestone = task.milestone === true;
    const durationDays = isMilestone ? 0 : Math.max(0, rawDiff) + 1;

    const centerY = rowIndex * viewport.rowHeight + viewport.rowHeight / 2;

    let x: number;
    let y: number;
    let width: number;
    let height: number;
    let anchorInX: number;
    let anchorInY: number;
    let anchorOutX: number;
    let anchorOutY: number;

    if (isMilestone) {
      const colStartX = diffDays(chartStart, task.start) * viewport.dayWidth;
      const centerX = colStartX + viewport.dayWidth / 2;
      const size = Math.max(14, Math.min(22, Math.round(barHeight * 0.62)));
      const radius = size * 0.7071;
      x = centerX;
      y = centerY;
      width = size;
      height = size;
      anchorInX = Math.round(centerX - radius);
      anchorInY = centerY;
      anchorOutX = Math.round(centerX + radius);
      anchorOutY = centerY;
    } else {
      const earlierDate = rawDiff < 0 ? task.end : task.start;
      const laterDate = rawDiff < 0 ? task.start : task.end;
      const colStartX = diffDays(chartStart, earlierDate) * viewport.dayWidth;
      const colEndX = (diffDays(chartStart, laterDate) + 1) * viewport.dayWidth;
      x = colStartX;
      width = Math.max(colEndX - colStartX, 14);
      y = rowIndex * viewport.rowHeight + barYOffset;
      height = barHeight;
      anchorInX = x;
      anchorInY = y + height / 2;
      anchorOutX = x + width;
      anchorOutY = anchorInY;
    }

    const cat = resolveCategory(task.category);
    const displayLabel = String(getTaskDisplayName(task) ?? "");
    const isCritical = criticalTaskIds.has(task.id);
    const scheduleMetrics = criticalResult.metrics?.get(task.id);

    let baselineLayout: TaskLayout["baselineLayout"] | undefined;
    if (task.baseline && viewport.showBaselines) {
      const bDiff = diffDays(task.baseline.start, task.baseline.end);
      const bEarlier = bDiff < 0 ? task.baseline.end : task.baseline.start;
      const bLater = bDiff < 0 ? task.baseline.start : task.baseline.end;
      const bx = diffDays(chartStart, bEarlier) * viewport.dayWidth;
      const bColEnd = (diffDays(chartStart, bLater) + 1) * viewport.dayWidth;
      const bWidth = Math.max(bColEnd - bx, 12);
      // Milestone y is the diamond center; bars use their top edge.
      const visualBottom = isMilestone ? centerY + height / 2 : y + height;
      const rowBottom = (rowIndex + 1) * viewport.rowHeight;
      baselineLayout = {
        x: bx,
        y: Math.min(visualBottom + BASELINE_GAP, rowBottom - BASELINE_HEIGHT - 1),
        width: bWidth,
        height: BASELINE_HEIGHT,
        start: task.baseline.start,
        end: task.baseline.end,
        varianceDays: diffDays(task.baseline.end, task.end)
      };
    }

    const item: TaskLayout = {
      task,
      x,
      y,
      width,
      height,
      rowIndex,
      category: cat,
      displayLabel,
      durationDays: Math.max(durationDays, 0),
      isMilestone,
      isCritical,
      scheduleMetrics,
      baselineLayout,
      anchorInX,
      anchorInY,
      anchorOutX,
      anchorOutY
    };

    taskLayouts.push(item);
    // Duplicate ids: links attach to the first occurrence, the one the cascade and CPM schedule
    if (!layoutById.has(task.id)) layoutById.set(task.id, item);
  });

  // Compute SVG Dependency Lines
  const linkRouting: LinkRoutingStyle = viewport.linkRouting;
  const dependencies: DependencyLine[] = [];

  tasks.forEach((task, rowIndex) => {
    // Laid-out ids resolve ids that look like lag shorthand ("render-3d" is a task, not "render" - 3d)
    const relations = getTaskDependencyRelations(task, layoutById);
    if (relations.length === 0) return;
    const curr = layoutById.get(task.id);
    if (!curr || curr.rowIndex !== rowIndex) return;

    relations.forEach((rel) => {
      const prereq = layoutById.get(rel.id);
      if (!prereq) return;

      const fromStart = rel.type === "SS" || rel.type === "SF";
      const toEnd = rel.type === "FF" || rel.type === "SF";

      const fromX = fromStart ? (prereq.anchorInX ?? prereq.x) : (prereq.anchorOutX ?? (prereq.x + prereq.width));
      const fromY = fromStart ? (prereq.anchorInY ?? (prereq.y + prereq.height / 2)) : (prereq.anchorOutY ?? (prereq.y + prereq.height / 2));
      const toX = toEnd ? (curr.anchorOutX ?? (curr.x + curr.width)) : (curr.anchorInX ?? curr.x);
      const toY = toEnd ? (curr.anchorOutY ?? (curr.y + curr.height / 2)) : (curr.anchorInY ?? (curr.y + curr.height / 2));

      const path = computeDependencyPath(
        fromX,
        fromY,
        toX,
        toY,
        viewport.rowHeight,
        linkRouting,
        fromStart ? "start" : "end",
        toEnd ? "end" : "start"
      );
      const isCritical = criticalDepKeys.has(`${prereq.task.id}->${curr.task.id}`);

      dependencies.push({
        fromTaskId: prereq.task.id,
        toTaskId: curr.task.id,
        fromX,
        fromY,
        toX,
        toY,
        path,
        isCritical,
        type: rel.type,
        lagDays: rel.lagDays
      });
    });
  });

  // Compute Header Ticks
  const spansMultipleYears = bounds.spansMultipleYears;

  // Collect all task start and end boundary dates across the project
  const taskBoundaryDates = new Set<string>();
  tasks.forEach((t) => {
    if (t.start) taskBoundaryDates.add(t.start);
    if (t.end) taskBoundaryDates.add(t.end);
    if (t.baseline?.start) taskBoundaryDates.add(t.baseline.start);
    if (t.baseline?.end) taskBoundaryDates.add(t.baseline.end);
  });

  const years: HeaderYear[] = [];
  const months: HeaderMonth[] = [];
  const weeks: HeaderWeek[] = [];
  const days: HeaderDay[] = [];

  let todayX: number | null = null;

  let currentYearKey = -1;
  let currentYearStartX = 0;

  let currentMonthKey = "";
  let currentMonthStartX = 0;
  let currentMonthLabel = "";

  let currentWeekNum = -1;
  let currentWeekStartX = 0;

  for (let i = 0; i < totalDays; i++) {
    const dStr = addDays(chartStart, i);
    const dObj = parseISODate(dStr);
    const dayX = i * viewport.dayWidth;
    const isWeekendDay = isWeekend(dStr);
    const isTodayDay = dStr === todayStr;
    const isTaskBoundary = taskBoundaryDates.has(dStr);

    if (isTodayDay) {
      const dayProgress = getTodayProgressFraction(viewport.currentTime);
      todayX = Math.round((dayX + viewport.dayWidth * dayProgress) * 10) / 10;
    }

    const dayNumber = dObj.getUTCDate();
    const dayOfWeek = dObj.getUTCDay();
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    days.push({
      label: String(dayNumber).padStart(2, "0"),
      dayName: dayNames[dayOfWeek],
      dateStr: dStr,
      dayOfMonth: dayNumber,
      dayOfWeek,
      x: dayX,
      width: viewport.dayWidth,
      isWeekend: isWeekendDay,
      isToday: isTodayDay,
      isTaskBoundary
    });

    // Year tier tracking
    const yNum = dObj.getUTCFullYear();
    if (yNum !== currentYearKey) {
      if (currentYearKey !== -1) {
        years.push({
          label: String(currentYearKey),
          x: currentYearStartX,
          width: dayX - currentYearStartX
        });
      }
      currentYearKey = yNum;
      currentYearStartX = dayX;
    }

    // Month tier tracking
    const monthKey = `${yNum}-${dObj.getUTCMonth()}`;
    if (monthKey !== currentMonthKey) {
      if (currentMonthKey !== "") {
        months.push({
          label: currentMonthLabel,
          x: currentMonthStartX,
          width: dayX - currentMonthStartX
        });
      }
      currentMonthKey = monthKey;
      currentMonthStartX = dayX;
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const mName = monthNames[dObj.getUTCMonth()];
      currentMonthLabel = spansMultipleYears ? mName : `${mName} ${yNum}`;
    }

    // Week tier tracking
    if (dayOfWeek === 1 || i === 0) {
      if (currentWeekNum !== -1) {
        weeks.push({
          label: `Wk ${currentWeekNum}`,
          x: currentWeekStartX,
          width: dayX - currentWeekStartX
        });
      }
      currentWeekNum = getWeekNumber(dObj);
      currentWeekStartX = dayX;
    }
  }

  const gridTotalWidth = totalDays * viewport.dayWidth;

  if (currentYearKey !== -1) {
    years.push({
      label: String(currentYearKey),
      x: currentYearStartX,
      width: Math.max(gridTotalWidth - currentYearStartX, 0)
    });
  }

  if (currentMonthKey !== "") {
    months.push({
      label: currentMonthLabel,
      x: currentMonthStartX,
      width: Math.max(gridTotalWidth - currentMonthStartX, 0)
    });
  }

  if (currentWeekNum !== -1) {
    weeks.push({
      label: `Wk ${currentWeekNum}`,
      x: currentWeekStartX,
      width: Math.max(gridTotalWidth - currentWeekStartX, 0)
    });
  }

  const computedHeaderHeight = resolveHeaderHeight(spansMultipleYears, viewportOptions.headerHeight);

  const header: GridHeader = {
    years,
    months,
    weeks,
    days,
    spansMultipleYears,
    todayX,
    totalWidth: canvasWidth,
    totalHeight: computedHeaderHeight,
    startDate: chartStart,
    endDate: chartEnd,
    totalDays,
    scale
  };

  return {
    tasks: taskLayouts,
    dependencies,
    header,
    viewport,
    canvasWidth,
    canvasHeight,
    criticalTaskIds
  };
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Which edge of a bar a dependency wire is attached to. */
export type DependencyAnchorSide = "start" | "end";

/**
 * Calculates the SVG path for a dependency connection wire.
 * Ensures a clean straight horizontal lead-in segment directly entering the target arrowhead
 * at 0 degrees so arrowheads align perfectly without angle skew.
 *
 * `fromSide`/`toSide` select the anchored bar edges (FS = end→start, the default; SS = start→start;
 * FF = end→end; SF = start→end). Wires always leave a bar away from its body and enter the target
 * edge from outside, so start-anchored links exit leftwards and end-anchored targets are entered
 * from the right with a left-pointing arrow.
 */
export function computeDependencyPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rowHeight = 46,
  style: LinkRoutingStyle = "orthogonal",
  fromSide: DependencyAnchorSide = "end",
  toSide: DependencyAnchorSide = "start"
): string {
  if (Math.abs(toX - fromX) < 2 && Math.abs(toY - fromY) < 2) {
    return "";
  }

  // Horizontal travel direction when leaving the predecessor and when arriving at the successor.
  const outDir = fromSide === "end" ? 1 : -1;
  const inDir = toSide === "start" ? 1 : -1;

  // SS / FF: both anchors face the same way, so wrap around the outer edge on a vertical rail
  // that clears both bars.
  if (outDir !== inDir) {
    const railX = outDir === 1 ? Math.max(fromX, toX) + 16 : Math.min(fromX, toX) - 16;
    if (style === "curved") {
      const endX = toX - inDir * 8;
      return `M ${fromX} ${fromY} C ${railX} ${fromY}, ${railX} ${toY}, ${endX} ${toY} L ${toX} ${toY}`;
    }
    return `M ${fromX} ${fromY} L ${railX} ${fromY} L ${railX} ${toY} L ${toX} ${toY}`;
  }

  // FS (dir = 1) and SF (dir = -1) travel the same way at both ends: SF mirrors the FS routing.
  const dir = outDir;

  // 1. Same row connection
  if (fromY === toY) {
    if ((toX - fromX) * dir >= 0) {
      return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    }
    const dropY = fromY + Math.round(rowHeight * 0.45);
    const stepOutX = fromX + dir * 8;
    const stepInX = toX - dir * 8;
    return `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${dropY} L ${stepInX} ${dropY} L ${stepInX} ${toY} L ${toX} ${toY}`;
  }

  // Forward distance along the travel direction
  const dx = (toX - fromX) * dir;

  // 2. Standard forward dependency with space (dx >= 12)
  if (dx >= 12) {
    if (style === "curved") {
      const leadIn = 8;
      const endX = toX - dir * leadIn;
      const cdx = Math.max((endX - fromX) * dir, 16);
      const cp1X = fromX + dir * cdx * 0.5;
      const cp2X = endX - dir * cdx * 0.5;
      return `M ${fromX} ${fromY} C ${cp1X} ${fromY}, ${cp2X} ${toY}, ${endX} ${toY} L ${toX} ${toY}`;
    }

    if (style === "direct") {
      const lead = Math.min(10, Math.floor(dx / 2));
      return `M ${fromX} ${fromY} L ${fromX + dir * lead} ${fromY} L ${toX - dir * lead} ${toY} L ${toX} ${toY}`;
    }

    // Default "orthogonal" (Clean 90-degree right angles with mid-split)
    const midX = fromX + Math.round((toX - fromX) / 2);
    return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
  }

  // 3. Tight gap / adjacent milestone / reverse overlap (dx < 12)
  // Route cleanly through the gutter between rows to avoid cutting through intermediate tasks:
  const stepOutX = fromX + dir * 8;
  const stepInX = toX - dir * 8;
  // Route through the boundary gutter directly below source row (or above if going upwards)
  const gutterY = fromY < toY
    ? fromY + Math.round(rowHeight * 0.5)
    : fromY - Math.round(rowHeight * 0.5);

  if (style === "curved") {
    return `M ${fromX} ${fromY} C ${stepOutX + dir * 6} ${fromY}, ${stepOutX + dir * 6} ${gutterY}, ${stepOutX} ${gutterY} L ${stepInX} ${gutterY} C ${stepInX - dir * 6} ${gutterY}, ${stepInX - dir * 6} ${toY}, ${stepInX} ${toY} L ${toX} ${toY}`;
  }

  return `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${gutterY} L ${stepInX} ${gutterY} L ${stepInX} ${toY} L ${toX} ${toY}`;
}
