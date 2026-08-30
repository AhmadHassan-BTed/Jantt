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
  Category,
  TimeScale,
  LinkRoutingStyle
} from "./types";
import {
  addDays,
  diffDays,
  getTodayISODate,
  isWeekend,
  maxISODate,
  minISODate,
  parseISODate
} from "./date-math";
import { calculateCriticalPath, getTaskDependencies } from "./resolver";

const DEFAULT_CATEGORY: Category = {
  label: "General",
  color: "#3B82F6",
  soft: "#1E293B"
};

const SCALE_DAY_WIDTHS: Record<TimeScale, number> = {
  day: 36,
  week: 18,
  month: 7,
  quarter: 3,
  year: 1.5
};

const DEFAULT_VIEWPORT: Required<Omit<ViewportOptions, "columns">> = {
  dayWidth: 32,
  rowHeight: 46,
  rowHeightMode: "fit",
  labelWidth: 340,
  headerHeight: 58,
  startDate: "",
  endDate: "",
  scale: "day",
  linkRouting: "orthogonal",
  showToday: true,
  showWeekends: true,
  showCriticalPath: false,
  showBaselines: true
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

  const scale: TimeScale =
    viewportOptions.scale || data.meta?.scale || "day";

  const defaultDayWidth = SCALE_DAY_WIDTHS[scale] || 32;

  const viewport: Required<Omit<ViewportOptions, "columns">> & { columns?: ViewportOptions["columns"] } = {
    ...DEFAULT_VIEWPORT,
    dayWidth: viewportOptions.dayWidth || defaultDayWidth,
    scale,
    linkRouting: viewportOptions.linkRouting || data.meta?.linkRouting || "orthogonal",
    showCriticalPath: viewportOptions.showCriticalPath ?? (data.meta?.showCriticalPath ?? false),
    showBaselines: viewportOptions.showBaselines ?? (data.meta?.showBaselines ?? true),
    showToday: viewportOptions.showToday ?? true,
    showWeekends: viewportOptions.showWeekends ?? true,
    rowHeight: viewportOptions.rowHeight || DEFAULT_VIEWPORT.rowHeight,
    rowHeightMode: viewportOptions.rowHeightMode || DEFAULT_VIEWPORT.rowHeightMode,
    labelWidth: viewportOptions.labelWidth || DEFAULT_VIEWPORT.labelWidth,
    headerHeight: viewportOptions.headerHeight || DEFAULT_VIEWPORT.headerHeight,
    startDate: viewportOptions.startDate || "",
    endDate: viewportOptions.endDate || ""
  };

  // Determine overall timeline bounds dynamically based on active tasks
  const todayStr = getTodayISODate();
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

  // Critical path calculation
  const { criticalTaskIds, criticalDepKeys } = calculateCriticalPath(tasks);

  // Compute TaskLayouts
  const barHeight = Math.min(28, viewport.rowHeight - 14);
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
      const size = 16;
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
    const displayLabel = task.label || task.name || task.id;
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
      todayX = dayX + viewport.dayWidth / 2;
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

  const computedHeaderHeight = spansMultipleYears ? 78 : 58;

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
  _rowHeight = 46,
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
  // Route cleanly through the gutter between rows:
  // Step out from predecessor -> drop to mid-row gutter -> step back before successor -> drop to target row -> enter target anchor from left
  const leadOut = 8;
  const leadIn = 8;
  const stepOutX = fromX + leadOut;
  const stepInX = toX - leadIn;
  const midY = Math.round((fromY + toY) / 2);

  if (style === "curved") {
    return `M ${fromX} ${fromY} C ${stepOutX + 6} ${fromY}, ${stepOutX + 6} ${midY}, ${stepOutX} ${midY} L ${stepInX} ${midY} C ${stepInX - 6} ${midY}, ${stepInX - 6} ${toY}, ${stepInX} ${toY} L ${toX} ${toY}`;
  }

  return `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${midY} L ${stepInX} ${midY} L ${stepInX} ${toY} L ${toX} ${toY}`;
}
