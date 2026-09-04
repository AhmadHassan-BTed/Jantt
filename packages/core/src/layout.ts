import {
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
  isWeekend,
  maxISODate,
  minISODate,
  parseISODate
} from "./date-math";
import { calculateCriticalPath, getTaskDependencies } from "./resolver";
import { clampDayWidth, getTaskDisplayName } from "./utils";
import {
  DEFAULT_CATEGORY,
  SCALE_DAY_WIDTHS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_LABEL_WIDTH,
  DEFAULT_HEADER_HEIGHT,
  MULTI_YEAR_HEADER_HEIGHT
} from "./constants";

export { SCALE_DAY_WIDTHS };

/**
 * Derives the optimal header scale tier from a continuous day width in pixels.
 * - dayWidth >= 28px: Day tier (detailed dates and day names)
 * - 12px <= dayWidth < 28px: Week tier (compact week grouping)
 * - 5px <= dayWidth < 12px: Month tier (month grouping with milestones)
 * - 2.2px <= dayWidth < 5px: Quarter tier (quarterly grouping)
 * - dayWidth < 2.2px: Year tier (multi-year high-level roadmap)
 */
export function getScaleFromDayWidth(dayWidth: number): TimeScale {
  if (dayWidth >= 28) return "day";
  if (dayWidth >= 12) return "week";
  if (dayWidth >= 5) return "month";
  if (dayWidth >= 2.2) return "quarter";
  return "year";
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
  showBaselines: true,
  autoCascade: true
};

/**
 * Computes exact pixel coordinates, scale metrics, milestones, baselines, and critical paths.
 */
export function layout(
  data: JanttData,
  viewportOptions: ViewportOptions = {}
): JanttLayoutResult {
  const tasks = data.tasks || [];
  const categories = data.categories || {};

  // Auto-adjust scale tier based on continuous dayWidth
  let scale: TimeScale;
  let dayWidth: number;

  if (viewportOptions.dayWidth !== undefined && viewportOptions.scale === undefined) {
    dayWidth = clampDayWidth(viewportOptions.dayWidth);
    scale = getScaleFromDayWidth(dayWidth);
  } else if (viewportOptions.scale !== undefined && viewportOptions.dayWidth === undefined) {
    scale = viewportOptions.scale;
    dayWidth = SCALE_DAY_WIDTHS[scale] || 32;
  } else if (viewportOptions.dayWidth !== undefined && viewportOptions.scale !== undefined) {
    dayWidth = clampDayWidth(viewportOptions.dayWidth);
    scale = getScaleFromDayWidth(dayWidth);
  } else {
    scale = data.meta?.scale || "day";
    dayWidth = SCALE_DAY_WIDTHS[scale] || 32;
  }

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
    showBaselines: viewportOptions.showBaselines ?? (data.meta?.showBaselines ?? true),
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
  let minTaskStart = tasks[0]?.start || todayStr;
  let maxTaskEnd = tasks[0]?.end || minTaskStart;

  if (tasks.length > 0) {
    tasks.forEach((t) => {
      if (t.start) minTaskStart = minISODate(minTaskStart, t.start);
      if (t.end) maxTaskEnd = maxISODate(maxTaskEnd, t.end);
      if (t.baseline?.start) minTaskStart = minISODate(minTaskStart, t.baseline.start);
      if (t.baseline?.end) maxTaskEnd = maxISODate(maxTaskEnd, t.baseline.end);
    });
  }

  // Ensure selectedDate is always within calculated timeline runway
  if (viewport.selectedDate) {
    minTaskStart = minISODate(minTaskStart, viewport.selectedDate);
    maxTaskEnd = maxISODate(maxTaskEnd, viewport.selectedDate);
  }

  // Generous runway buffer (scale-dependent)
  const bufferBefore = scale === "year" || scale === "quarter" ? 30 : scale === "month" ? 14 : 4;
  const bufferAfter = scale === "year" || scale === "quarter" ? 90 : scale === "month" ? 30 : 14;

  let chartStart = viewportOptions.startDate || data.meta?.start || data.meta?.chartStart;
  let chartEnd = viewportOptions.endDate || data.meta?.end || data.meta?.chartEnd;

  if (!chartStart) {
    const effectiveStart = viewport.showToday ? minISODate(minTaskStart, todayStr) : minTaskStart;
    chartStart = addDays(effectiveStart, -bufferBefore);
  } else if (diffDays(chartStart, minTaskStart) < 0) {
    // If a task was moved BEFORE the specified chartStart, dynamically expand chartStart
    chartStart = addDays(minTaskStart, -bufferBefore);
  }

  if (!chartEnd) {
    const effectiveEnd = viewport.showToday ? maxISODate(maxTaskEnd, todayStr) : maxTaskEnd;
    chartEnd = addDays(effectiveEnd, bufferAfter);
  } else if (diffDays(chartEnd, maxTaskEnd) > 0) {
    // If a task was pushed forward PAST the specified chartEnd, dynamically expand chartEnd!
    chartEnd = addDays(maxTaskEnd, bufferAfter);
  }

  // Ensure minimum span of at least 7 days
  if (diffDays(chartStart, chartEnd) < 7) {
    chartEnd = addDays(chartStart, 14);
  }

  viewport.startDate = chartStart;
  viewport.endDate = chartEnd;

  const totalDays = Math.max(diffDays(chartStart, chartEnd), 1);
  const canvasWidth = Math.max(totalDays * viewport.dayWidth, 600);
  const canvasHeight = Math.max(tasks.length * viewport.rowHeight, viewport.rowHeight);

  // Critical path calculation (use pre-computed master critical path if provided, or compute on tasks)
  const { criticalTaskIds, criticalDepKeys } =
    viewportOptions.criticalResult || calculateCriticalPath(tasks);

  // Compute TaskLayouts: Proportional bar height (~62% of row height) with vertical padding for dependency clearance
  const verticalPadding = Math.max(8, Math.round(viewport.rowHeight * 0.36));
  const barHeight = Math.max(18, Math.min(48, viewport.rowHeight - verticalPadding));
  const barYOffset = (viewport.rowHeight - barHeight) / 2;

  const taskLayouts: TaskLayout[] = [];
  const layoutById = new Map<string, TaskLayout>();

  tasks.forEach((task, rowIndex) => {
    const isMilestone = Boolean(task.milestone || task.start === task.end || diffDays(task.start, task.end) === 0);
    const durationDays = diffDays(task.start, task.end) + (isMilestone ? 0 : 1);

    const colStartX = diffDays(chartStart, task.start) * viewport.dayWidth;
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
      const colEndX = (diffDays(chartStart, task.end) + 1) * viewport.dayWidth;
      x = colStartX;
      width = Math.max(colEndX - colStartX, 14);
      y = rowIndex * viewport.rowHeight + barYOffset;
      height = barHeight;
      anchorInX = x;
      anchorInY = centerY;
      anchorOutX = x + width;
      anchorOutY = centerY;
    }

    const cat = categories[task.category] || DEFAULT_CATEGORY;
    const displayLabel = getTaskDisplayName(task);
    const isCritical = criticalTaskIds.has(task.id);

    let baselineLayout: TaskLayout["baselineLayout"] | undefined;
    if (task.baseline && viewport.showBaselines) {
      const bx = diffDays(chartStart, task.baseline.start) * viewport.dayWidth;
      const bColEnd = (diffDays(chartStart, task.baseline.end) + 1) * viewport.dayWidth;
      const bWidth = Math.max(bColEnd - bx, 12);
      baselineLayout = {
        x: bx,
        y: y + barHeight + 2,
        width: bWidth,
        height: 4
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
      baselineLayout,
      anchorInX,
      anchorInY,
      anchorOutX,
      anchorOutY
    };

    taskLayouts.push(item);
    layoutById.set(task.id, item);
  });

  // Compute SVG Dependency Lines
  const linkRouting: LinkRoutingStyle = viewport.linkRouting;
  const dependencies: DependencyLine[] = [];

  tasks.forEach((task) => {
    const depIds = getTaskDependencies(task);
    if (depIds.length === 0) return;
    const curr = layoutById.get(task.id);
    if (!curr) return;

    depIds.forEach((depId) => {
      const prereq = layoutById.get(depId);
      if (!prereq) return;

      const fromX = prereq.anchorOutX ?? (prereq.x + prereq.width);
      const fromY = prereq.anchorOutY ?? (prereq.y + prereq.height / 2);
      const toX = curr.anchorInX ?? curr.x;
      const toY = curr.anchorInY ?? (curr.y + curr.height / 2);

      const path = computeDependencyPath(fromX, fromY, toX, toY, viewport.rowHeight, linkRouting);
      const isCritical = criticalDepKeys.has(`${prereq.task.id}->${curr.task.id}`);

      dependencies.push({
        fromTaskId: prereq.task.id,
        toTaskId: curr.task.id,
        fromX,
        fromY,
        toX,
        toY,
        path,
        isCritical
      });
    });
  });

  // Compute Header Ticks
  const startYear = parseISODate(chartStart).getUTCFullYear();
  const endYear = parseISODate(chartEnd).getUTCFullYear();
  const spansMultipleYears = startYear !== endYear;

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

  if (currentYearKey !== -1) {
    years.push({
      label: String(currentYearKey),
      x: currentYearStartX,
      width: canvasWidth - currentYearStartX
    });
  }

  if (currentMonthKey !== "") {
    months.push({
      label: currentMonthLabel,
      x: currentMonthStartX,
      width: canvasWidth - currentMonthStartX
    });
  }

  if (currentWeekNum !== -1) {
    weeks.push({
      label: `Wk ${currentWeekNum}`,
      x: currentWeekStartX,
      width: canvasWidth - currentWeekStartX
    });
  }

  const computedHeaderHeight = spansMultipleYears ? MULTI_YEAR_HEADER_HEIGHT : DEFAULT_HEADER_HEIGHT;

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

/**
 * Calculates the SVG path for a dependency connection wire.
 * Ensures a clean straight horizontal lead-in segment directly entering the target arrowhead
 * at 0 degrees so arrowheads align perfectly without angle skew.
 */
export function computeDependencyPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rowHeight = 46,
  style: LinkRoutingStyle = "orthogonal"
): string {
  // 1. Same row connection
  if (fromY === toY) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  const dx = toX - fromX;

  // 2. Standard forward dependency with space (dx >= 12)
  if (dx >= 12) {
    if (style === "curved") {
      const leadIn = 8;
      const endX = toX - leadIn;
      const cdx = Math.max(endX - fromX, 16);
      const cp1X = fromX + cdx * 0.5;
      const cp2X = endX - cdx * 0.5;
      return `M ${fromX} ${fromY} C ${cp1X} ${fromY}, ${cp2X} ${toY}, ${endX} ${toY} L ${toX} ${toY}`;
    }

    if (style === "direct") {
      const lead = Math.min(10, Math.floor(dx / 2));
      return `M ${fromX} ${fromY} L ${fromX + lead} ${fromY} L ${toX - lead} ${toY} L ${toX} ${toY}`;
    }

    // Default "orthogonal" (Clean 90-degree right angles with mid-split)
    const midX = fromX + Math.round(dx / 2);
    return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
  }

  // 3. Tight gap / adjacent milestone / reverse overlap (dx < 12)
  // Route cleanly through the gutter between rows to avoid cutting through intermediate tasks:
  const leadOut = 8;
  const leadIn = 8;
  const stepOutX = fromX + leadOut;
  const stepInX = toX - leadIn;
  // Route through the boundary gutter directly below source row (or above if going upwards)
  const gutterY = fromY < toY
    ? fromY + Math.round(rowHeight * 0.5)
    : fromY - Math.round(rowHeight * 0.5);

  if (style === "curved") {
    return `M ${fromX} ${fromY} C ${stepOutX + 6} ${fromY}, ${stepOutX + 6} ${gutterY}, ${stepOutX} ${gutterY} L ${stepInX} ${gutterY} C ${stepInX - 6} ${gutterY}, ${stepInX - 6} ${toY}, ${stepInX} ${toY} L ${toX} ${toY}`;
  }

  return `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${gutterY} L ${stepInX} ${gutterY} L ${stepInX} ${toY} L ${toX} ${toY}`;
}
