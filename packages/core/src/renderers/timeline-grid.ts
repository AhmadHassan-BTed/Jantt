import { GridHeader, TaskLayout } from "../types";

export interface TimelineGridProps {
  header: GridHeader;
  taskLayouts: TaskLayout[];
  rowHeight: number;
  showToday: boolean;
  hasAddRow?: boolean;
}

/**
 * Renders the background grid lines, vertical day columns, horizontal row lines, and today marker.
 */
export function renderTimelineGrid(props: TimelineGridProps): {
  gridLayer: HTMLElement;
  todayLine?: HTMLElement;
} {
  const gridLayer = document.createElement("div");
  gridLayer.className = "jantt-grid-layer";

  // 1. Vertical day column boundary grid lines extending from header day cells
  props.header.days.forEach((d) => {
    const col = document.createElement("div");
    col.className = `jantt-grid-day-col ${d.isWeekend ? "is-weekend" : ""}`;
    col.style.left = `${d.x}px`;
    col.style.width = `${d.width}px`;
    gridLayer.appendChild(col);
  });

  // 2. Low-opacity horizontal row boundary lines extending across the timeline
  props.taskLayouts.forEach((item) => {
    const rowLine = document.createElement("div");
    rowLine.className = "jantt-grid-row";
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

  // 3. Today marker line
  let todayLine: HTMLElement | undefined;
  if (props.header.todayX !== null && props.showToday) {
    todayLine = document.createElement("div");
    todayLine.className = "jantt-today-line";
    todayLine.style.left = `${props.header.todayX}px`;
    todayLine.innerHTML = `<span class="jantt-today-badge">Today</span>`;
  }

  return { gridLayer, todayLine };
}
