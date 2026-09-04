import { TaskLayout, Task, Person, Team } from "../types";
import { InteractionController } from "../controller";
import { escapeHtml, isTaskDone } from "../utils";
import { resolveTaskAssignee } from "../team-resolver";

export interface GridTableProps {
  taskLayouts: TaskLayout[];
  labelWidth: number;
  headerHeight: number;
  rowHeight: number;
  gridContainer: HTMLElement;
  controller: InteractionController;
  showCritical?: boolean;
  people?: Person[];
  teams?: Team[];
  onTaskClick: (task: Task) => void;
  onAddTask?: () => void;
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
    <div style="text-align: center;" title="Duration (Days)">Days</div>
    <div style="text-align: center;" title="Progress Percentage">Prog</div>
  `;
  labelCol.appendChild(labelHeader);

  // Rows
  props.taskLayouts.forEach((item) => {
    const isDone = isTaskDone(item.task);
    const isCrit = Boolean(props.showCritical && item.isCritical);
    const row = document.createElement("div");
    row.className = `jantt-label-row ${isDone ? "is-done" : ""} ${isCrit ? "is-critical" : ""}`;
    row.style.height = `${props.rowHeight}px`;
    row.setAttribute("data-row-id", item.task.id);

    const progressPct = isDone
      ? "100%"
      : item.task.progress !== undefined && item.task.progress !== null
      ? `${Math.round(item.task.progress * 100)}%`
      : "-";

    const wbsBadge = item.task.wbs
      ? `<span class="jantt-wbs-pill" style="font-family: var(--jantt-font-mono); font-size: 10px; font-weight: 700; color: var(--jantt-text-muted); opacity: 0.8; margin-right: 4px;">${escapeHtml(item.task.wbs)}</span>`
      : "";

    let assigneeBadge = "";
    if (item.task.assignee) {
      const assigneeInfo = resolveTaskAssignee(item.task, props.people, props.teams);
      assigneeBadge = `<span class="jantt-assignee-avatar" title="${escapeHtml(assigneeInfo.displayName)}${assigneeInfo.team ? ` (${escapeHtml(assigneeInfo.team.name)})` : ""}" style="background: ${assigneeInfo.avatarColor};">${escapeHtml(assigneeInfo.initials)}</span>`;
    }

    row.innerHTML = `
      <div class="jantt-col-name">
        <span class="jantt-label-dot" style="background: ${isDone ? "var(--jantt-bar-done, #64748B)" : item.category.color};"></span>
        ${wbsBadge}
        <span class="jantt-label-text">${escapeHtml(item.displayLabel)}</span>
        ${assigneeBadge}
        ${item.isMilestone ? '<span class="jantt-hover-type-pill is-milestone" style="font-size: 9px; padding: 0 4px;">Milestone</span>' : ""}
        ${item.task.locked ? '<span class="jantt-hover-type-pill is-locked" style="font-size: 9px; padding: 0 4px;">Locked</span>' : ""}
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

  // Optional Add Task row at bottom of table
  if (props.onAddTask) {
    const addRow = document.createElement("div");
    addRow.className = "jantt-label-row jantt-label-add-row";
    addRow.style.height = `${Math.min(props.rowHeight, 38)}px`;
    addRow.title = "Add a new task";
    addRow.innerHTML = `
      <div class="jantt-col-name" style="color: var(--jantt-accent); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Add Task</span>
      </div>
      <div></div>
      <div></div>
    `;
    addRow.addEventListener("click", () => props.onAddTask?.());
    labelCol.appendChild(addRow);
  }

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
