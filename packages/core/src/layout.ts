import {
  JanttData,
  ViewportOptions,
  TaskLayout,
  DependencyLine,
  GridHeader,
  HeaderMonth,
  HeaderWeek,
  HeaderDay,
  JanttLayoutResult,
  Category,
  TimeScale
} from "./types";
import {
  addDays,
  diffDays,
  formatMonthYear,
  getTodayISODate,
  isWeekend,
  maxISODate,
  minISODate,
  parseISODate
} from "./date-math";
import { calculateCriticalPath } from "./resolver";

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
  labelWidth: 340,
  headerHeight: 58,
  startDate: "",
  endDate: "",
  scale: "day",
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
    showCriticalPath: viewportOptions.showCriticalPath ?? (data.meta?.showCriticalPath ?? false),
    showBaselines: viewportOptions.showBaselines ?? (data.meta?.showBaselines ?? true),
    ...viewportOptions
  };

  // Determine overall timeline bounds
  let chartStart = viewportOptions.startDate || data.meta?.start || data.meta?.chartStart;
  let chartEnd = viewportOptions.endDate || data.meta?.end || data.meta?.chartEnd;

  if (!chartStart || !chartEnd) {
    if (tasks.length > 0) {
      let minStart = tasks[0].start || getTodayISODate();
      let maxEnd = tasks[0].end || minStart;

      tasks.forEach((t) => {
        if (t.start) minStart = minISODate(minStart, t.start);
        if (t.end) maxEnd = maxISODate(maxEnd, t.end);
        if (t.baseline?.start) minStart = minISODate(minStart, t.baseline.start);
        if (t.baseline?.end) maxEnd = maxISODate(maxEnd, t.baseline.end);
      });

      // Add generous margin
      if (!chartStart) chartStart = addDays(minStart, -4);
      if (!chartEnd) chartEnd = addDays(maxEnd, 8);
    } else {
      chartStart = addDays(getTodayISODate(), -4);
      chartEnd = addDays(getTodayISODate(), 40);
    }
  }

  // Ensure start is before end
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
    const x = diffDays(chartStart, task.start) * viewport.dayWidth;
    const durationDays = diffDays(task.start, task.end);
    const isMilestone = Boolean(task.milestone || durationDays === 0);
    const width = isMilestone ? 24 : Math.max(durationDays * viewport.dayWidth, 14);
    const y = rowIndex * viewport.rowHeight + barYOffset;

    const cat = categories[task.category] || DEFAULT_CATEGORY;
    const displayLabel = task.label || task.name || task.id;
    const isCritical = criticalTaskIds.has(task.id);

    let baselineLayout: TaskLayout["baselineLayout"] | undefined;
    if (task.baseline && viewport.showBaselines) {
      const bx = diffDays(chartStart, task.baseline.start) * viewport.dayWidth;
      const bDuration = Math.max(diffDays(task.baseline.start, task.baseline.end), 1);
      const bWidth = Math.max(bDuration * viewport.dayWidth, 12);
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
      height: barHeight,
      rowIndex,
      category: cat,
      displayLabel,
      durationDays: Math.max(durationDays, 0),
      isMilestone,
      isCritical,
      baselineLayout
    };

    taskLayouts.push(item);
    layoutById.set(task.id, item);
  });

  // Compute SVG Dependency Lines
  const dependencies: DependencyLine[] = [];

  tasks.forEach((task) => {
    if (!task.dependsOn) return;
    const prereq = layoutById.get(task.dependsOn);
    const curr = layoutById.get(task.id);
    if (!prereq || !curr) return;

    const fromX = prereq.isMilestone ? prereq.x + 12 : prereq.x + prereq.width;
    const fromY = prereq.y + prereq.height / 2;
    const toX = curr.x;
    const toY = curr.y + curr.height / 2;

    let path = "";
    const gap = toX - fromX;

    if (gap >= 16) {
      const c1X = fromX + Math.min(gap / 2, 32);
      const c2X = toX - Math.min(gap / 2, 32);
      path = `M ${fromX} ${fromY} C ${c1X} ${fromY}, ${c2X} ${toY}, ${toX} ${toY}`;
    } else {
      const stepOutX = fromX + 12;
      const stepInX = toX - 12;
      const midY = fromY + (toY > fromY ? 1 : -1) * (viewport.rowHeight / 2);
      path = `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${midY} L ${stepInX} ${midY} L ${stepInX} ${toY} L ${toX} ${toY}`;
    }

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

  // Compute Header Ticks
  const months: HeaderMonth[] = [];
  const weeks: HeaderWeek[] = [];
  const days: HeaderDay[] = [];

  const todayStr = getTodayISODate();
  let todayX: number | null = null;

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

    if (isTodayDay) {
      todayX = dayX + viewport.dayWidth / 2;
    }

    days.push({
      label: String(dObj.getUTCDate()),
      dateStr: dStr,
      dayOfMonth: dObj.getUTCDate(),
      dayOfWeek: dObj.getUTCDay(),
      x: dayX,
      width: viewport.dayWidth,
      isWeekend: isWeekendDay,
      isToday: isTodayDay
    });

    const monthKey = `${dObj.getUTCFullYear()}-${dObj.getUTCMonth()}`;
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
      currentMonthLabel = formatMonthYear(dStr, scale === "month" || scale === "quarter");
    }

    const dayOfWeek = dObj.getUTCDay();
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

  const header: GridHeader = {
    months,
    weeks,
    days,
    todayX,
    totalWidth: canvasWidth,
    totalHeight: viewport.headerHeight,
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
