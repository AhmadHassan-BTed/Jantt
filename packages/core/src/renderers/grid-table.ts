import { TaskLayout, Task } from "../types";
import { InteractionController } from "../controller";

export interface GridTableProps {
  taskLayouts: TaskLayout[];
  labelWidth: number;
  headerHeight: number;
  rowHeight: number;
  gridContainer: HTMLElement;
  controller: InteractionController;
  onTaskClick: (task: Task) => void;
}

/**
 * Renders the sticky left multi-column table grid and draggable splitter.
 */
export function renderGridTable(props: GridTableProps): {
  labelCol: HTMLElement;
  splitter: HTMLElement;
} {
  const labelCol = document.createElement("div");
  labelCol.className = "jantt-label-column";
  labelCol.style.width = `${props.labelWidth}px`;

  // Header
  const labelHeader = document.createElement("div");
  labelHeader.className = "jantt-label-header";
  labelHeader.style.height = `${props.headerHeight}px`;
  labelHeader.innerHTML = `
    <div>Task & Category</div>
    <div style="text-align: center;">Duration</div>
    <div style="text-align: center;">Progress</div>
  `;
  labelCol.appendChild(labelHeader);

  // Rows
  props.taskLayouts.forEach((item) => {
    const row = document.createElement("div");
    row.className = "jantt-label-row";
    row.style.height = `${props.rowHeight}px`;
    row.setAttribute("data-row-id", item.task.id);

    const progressPct =
      item.task.progress !== undefined && item.task.progress !== null
        ? `${Math.round(item.task.progress * 100)}%`
        : "-";

    row.innerHTML = `
      <div class="jantt-col-name">
        <span class="jantt-label-dot" style="background: ${item.category.color};"></span>
        <span class="jantt-label-text">${escapeHtml(item.displayLabel)}</span>
        ${item.isMilestone ? '<span style="font-size: 10px;" title="Milestone">💎</span>' : ""}
        ${item.task.locked ? '<span style="font-size: 10px;" title="Locked">🔒</span>' : ""}
      </div>
      <div class="jantt-col-meta">${item.durationDays}d</div>
      <div class="jantt-col-progress-pill">${progressPct}</div>
    `;

    row.addEventListener("click", () => props.onTaskClick(item.task));

    // Synchronized row hover
    row.addEventListener("mouseenter", () => {
      row.classList.add("is-row-highlighted");
      const matchingGridRow = props.gridContainer.querySelector(`[data-grid-row-id="${item.task.id}"]`);
      matchingGridRow?.classList.add("is-row-highlighted");
    });
    row.addEventListener("mouseleave", () => {
      row.classList.remove("is-row-highlighted");
      const matchingGridRow = props.gridContainer.querySelector(`[data-grid-row-id="${item.task.id}"]`);
      matchingGridRow?.classList.remove("is-row-highlighted");
    });

    labelCol.appendChild(row);
  });

  // Draggable Splitter
  const splitter = document.createElement("div");
  splitter.className = "jantt-splitter";
  splitter.style.left = `${props.labelWidth - 3}px`;
  splitter.title = "Drag to resize table width";
  splitter.addEventListener("pointerdown", (e) => {
    props.controller.startSplitterDrag(e, props.labelWidth);
  });

  return { labelCol, splitter };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
