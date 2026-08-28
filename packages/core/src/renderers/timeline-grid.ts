import { GridHeader, TaskLayout } from "../types";

export interface TimelineGridProps {
  header: GridHeader;
  taskLayouts: TaskLayout[];
  rowHeight: number;
  showToday: boolean;
}

/**
 * Renders the background grid lines, weekend columns, and today marker line.
 */
export function renderTimelineGrid(props: TimelineGridProps): {
  gridLayer: HTMLElement;
  todayLine?: HTMLElement;
} {
  const gridLayer = document.createElement("div");
  gridLayer.className = "jantt-grid-layer";

  // Weekend column highlights
  props.header.days.forEach((d) => {
    if (d.isWeekend) {
      const col = document.createElement("div");
      col.className = "jantt-grid-day-col is-weekend";
      col.style.left = `${d.x}px`;
      col.style.width = `${d.width}px`;
      gridLayer.appendChild(col);
    }
  });

  // Horizontal row separators
  props.taskLayouts.forEach((item) => {
    const rowLine = document.createElement("div");
    rowLine.className = "jantt-grid-row";
    rowLine.style.height = `${props.rowHeight}px`;
    rowLine.setAttribute("data-grid-row-id", item.task.id);
    gridLayer.appendChild(rowLine);
  });

  // Today marker line
  let todayLine: HTMLElement | undefined;
  if (props.header.todayX !== null && props.showToday) {
    todayLine = document.createElement("div");
    todayLine.className = "jantt-today-line";
    todayLine.style.left = `${props.header.todayX}px`;
    todayLine.innerHTML = `<span class="jantt-today-badge">Today</span>`;
  }

  return { gridLayer, todayLine };
}
