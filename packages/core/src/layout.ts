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
  Category
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

const DEFAULT_CATEGORY: Category = {
  label: "General",
  color: "#3B82F6",
  soft: "#1E293B"
};

const DEFAULT_VIEWPORT: Required<ViewportOptions> = {
  dayWidth: 32,
  rowHeight: 46,
  labelWidth: 240,
  headerHeight: 58,
  startDate: "",
  endDate: "",
  showToday: true,
  showWeekends: true
};

/**
 * Computes exact pixel coordinates and layout geometry for bars, header ticks, and SVG lines.
 */
export function layout(
  data: JanttData,
  viewportOptions: ViewportOptions = {}
): JanttLayoutResult {
  const tasks = data.tasks || [];
  const categories = data.categories || {};

  const viewport: Required<ViewportOptions> = {
    ...DEFAULT_VIEWPORT,
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
      });

      // Add generous margin
      if (!chartStart) chartStart = addDays(minStart, -3);
      if (!chartEnd) chartEnd = addDays(maxEnd, 5);
    } else {
      chartStart = addDays(getTodayISODate(), -3);
      chartEnd = addDays(getTodayISODate(), 30);
    }
  }

  // Ensure start is before end
  if (diffDays(chartStart, chartEnd) < 7) {
    chartEnd = addDays(chartStart, 14);
  }

  viewport.startDate = chartStart;
  viewport.endDate = chartEnd;

  const totalDays = Math.max(diffDays(chartStart, chartEnd), 1);
  const canvasWidth = totalDays * viewport.dayWidth;
  const canvasHeight = Math.max(tasks.length * viewport.rowHeight, viewport.rowHeight);

  // Compute TaskLayouts
  const barHeight = Math.min(32, viewport.rowHeight - 12);
  const barYOffset = (viewport.rowHeight - barHeight) / 2;

  const taskLayouts: TaskLayout[] = [];
  const layoutById = new Map<string, TaskLayout>();

  tasks.forEach((task, rowIndex) => {
    const x = diffDays(chartStart, task.start) * viewport.dayWidth;
    const durationDays = Math.max(diffDays(task.start, task.end), 1);
    const width = Math.max(durationDays * viewport.dayWidth, 16);
    const y = rowIndex * viewport.rowHeight + barYOffset;

    const cat = categories[task.category] || DEFAULT_CATEGORY;
    const displayLabel = task.label || task.name || task.id;

    const item: TaskLayout = {
      task,
      x,
      y,
      width,
      height: barHeight,
      rowIndex,
      category: cat,
      displayLabel,
      durationDays
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

    const fromX = prereq.x + prereq.width;
    const fromY = prereq.y + prereq.height / 2;
    const toX = curr.x;
    const toY = curr.y + curr.height / 2;

    let path = "";
    const gap = toX - fromX;

    if (gap >= 16) {
      // Standard forward stepped bezier
      const c1X = fromX + Math.min(gap / 2, 32);
      const c2X = toX - Math.min(gap / 2, 32);
      path = `M ${fromX} ${fromY} C ${c1X} ${fromY}, ${c2X} ${toY}, ${toX} ${toY}`;
    } else {
      // Backward or tight jump: step out and route cleanly
      const stepOutX = fromX + 12;
      const stepInX = toX - 12;
      const midY = fromY + (toY > fromY ? 1 : -1) * (viewport.rowHeight / 2);
      path = `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${midY} L ${stepInX} ${midY} L ${stepInX} ${toY} L ${toX} ${toY}`;
    }

    dependencies.push({
      fromTaskId: prereq.task.id,
      toTaskId: curr.task.id,
      fromX,
      fromY,
      toX,
      toY,
      path
    });
  });

  // Compute Grid Header ticks
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

    // Days row
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

    // Months tracking
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
      currentMonthLabel = formatMonthYear(dStr, false);
    }

    // Weeks tracking (starting on Monday: day === 1)
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

  // Push trailing month
  if (currentMonthKey !== "") {
    months.push({
      label: currentMonthLabel,
      x: currentMonthStartX,
      width: canvasWidth - currentMonthStartX
    });
  }

  // Push trailing week
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
    totalDays
  };

  return {
    tasks: taskLayouts,
    dependencies,
    header,
    viewport,
    canvasWidth,
    canvasHeight
  };
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
