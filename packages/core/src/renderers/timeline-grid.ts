import { GridHeader, TaskLayout } from "../types";

export interface TimelineGridProps {
  visibleXRange?: { startX: number; endX: number };
  header: GridHeader;
  taskLayouts: TaskLayout[];
  rowHeight: number;
  showToday: boolean;
  showCritical?: boolean;
  hasAddRow?: boolean;
  selectedDate?: string | null;
}

function appendColumn(gridLayer: HTMLElement, className: string, x: number, width: number): void {
  const col = document.createElement("div");
  col.className = className;
  col.style.left = `${x}px`;
  col.style.width = `${width}px`;
  gridLayer.appendChild(col);
}

/**
 * Renders the background grid lines, vertical columns, horizontal row lines, and today marker.
 * Vertical columns follow the lowest rendered header tier (days at day/week scale, weeks at month
 * scale, months beyond), so zoomed-out charts do not draw one node per 1-5px day.
 */
export function renderTimelineGrid(props: TimelineGridProps): {
  gridLayer: HTMLElement;
  todayLine?: HTMLElement;
} {
  const gridLayer = document.createElement("div");
  gridLayer.className = "jantt-grid-layer";
  const scale = props.header.scale;
  const window = props.header.totalWidth > 5000 ? props.visibleXRange : undefined;
  const appendVisibleColumn = (layer: HTMLElement, className: string, x: number, width: number) => {
    if (window && (x + width < window.startX || x > window.endX)) return;
    appendColumn(layer, className, x, width);
  };

  // 1. Vertical column boundary grid lines extending from the header's lowest tier
  if (scale === "month" || scale === "quarter" || scale === "year") {
    const columns = scale === "month" ? props.header.weeks : props.header.months;
    columns.forEach((c) => appendVisibleColumn(gridLayer, "jantt-grid-day-col", c.x, c.width));
    const selected = props.selectedDate ? props.header.days.find((d) => d.dateStr === props.selectedDate) : undefined;
    if (selected) {
      appendVisibleColumn(gridLayer, "jantt-grid-day-col is-selected-date-col", selected.x, selected.width);
    }
  } else if ((scale === "hour" || scale === "minute") && props.header.subTicks && props.header.subTicks.length > 0) {
    const ticks = props.header.subTicks;
    const minX = ticks[0].x;
    const maxX = ticks[ticks.length - 1].x + ticks[ticks.length - 1].width;
    props.header.days.forEach((d) => {
      if (d.x + d.width < minX || d.x > maxX) return;
      const isSelected = props.selectedDate === d.dateStr;
      if (d.isWeekend || isSelected) {
        const tintClass = `jantt-grid-day-col jantt-grid-day-tint ${d.isWeekend ? "is-weekend" : ""} ${
          isSelected ? "is-selected-date-col" : ""
        }`.trim();
        appendVisibleColumn(gridLayer, tintClass, d.x, d.width);
      }
    });
    ticks.forEach((tick) => {
      const cls = `jantt-grid-day-col jantt-grid-subtick ${tick.isDayStart ? "is-day-start" : ""} ${
        tick.isHourStart ? "is-hour-start" : ""
      } ${tick.isMajor ? "is-major" : ""}`.trim();
      appendVisibleColumn(gridLayer, cls, tick.x, tick.width);
    });
  } else {
    props.header.days.forEach((d) => {
      const isSelected = props.selectedDate === d.dateStr;
      const className = `jantt-grid-day-col ${d.isWeekend ? "is-weekend" : ""} ${
        isSelected ? "is-selected-date-col" : ""
      }`.trim();
      appendVisibleColumn(gridLayer, className, d.x, d.width);
    });
  }

  // 2. Low-opacity horizontal row boundary lines extending across the timeline
  props.taskLayouts.forEach((item) => {
    const isCrit = Boolean(props.showCritical && item.isCritical);
    const rowLine = document.createElement("div");
    rowLine.className = `jantt-grid-row ${isCrit ? "is-critical" : ""}`.trim();
    rowLine.style.height = `${props.rowHeight}px`;
    rowLine.setAttribute("data-grid-row-id", item.task.id);
    gridLayer.appendChild(rowLine);
  });

  // 2b. Optional bottom Add Task grid row to maintain 1:1 table-to-grid height symmetry
  if (props.hasAddRow) {
    const addRowLine = document.createElement("div");
    addRowLine.className = "jantt-grid-row jantt-grid-add-row";
    addRowLine.style.height = `${Math.min(props.rowHeight, 38)}px`;
    gridLayer.appendChild(addRowLine);
  }

  // 3. Today vertical guide line (badge is systematically anchored to the sticky timeline header)
  let todayLine: HTMLElement | undefined;
  if (props.header.todayX !== null && props.showToday) {
    todayLine = document.createElement("div");
    todayLine.className = "jantt-today-line";
    todayLine.style.left = `${props.header.todayX}px`;
  }

  return { gridLayer, todayLine };
}
