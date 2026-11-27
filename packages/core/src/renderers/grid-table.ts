import { TaskLayout, Task, Person, Team } from "../types";
import { InteractionController } from "../controller";
import { isTaskDone, sanitizeCssColor } from "../utils";
import { resolveTaskAssignee } from "../team-resolver";
import { MIN_LABEL_WIDTH, MAX_LABEL_WIDTH } from "../constants";

export interface GridTableProps {
  taskLayouts: TaskLayout[];
  labelWidth: number;
  headerHeight: number;
  rowHeight: number;
  gridContainer: HTMLElement;
  getGridContainer?: () => HTMLElement | null;
  controller: InteractionController;
  showCritical?: boolean;
  people?: Person[];
  teams?: Team[];
  onTaskClick: (task: Task) => void;
  onTaskKeyOpen?: (task: Task) => void;
  onAddTask?: () => void;
  /** Keyboard resize of the table (splitter ArrowLeft/ArrowRight/Home/End); the splitter is focusable only when set. */
  onLabelWidthChange?: (width: number) => void;
}

/** Splitter keyboard step in px (Shift + arrow moves four steps). */
const SPLITTER_KEY_STEP = 16;
const FALLBACK_DOT_COLOR = "#64748B";

function span(className: string, text?: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function typePill(kind: "is-milestone" | "is-locked", text: string): HTMLSpanElement {
  const pill = span(`jantt-hover-type-pill ${kind}`, text);
  pill.style.fontSize = "9px";
  pill.style.padding = "0 4px";
  return pill;
}

/**
 * Builds the name cell of a row with DOM APIs only: plan text goes through textContent and colors
 * through allow-listed CSSOM assignments, so no plan value is ever parsed as markup.
 */
function buildNameCell(item: TaskLayout, isDone: boolean, props: GridTableProps): HTMLElement {
  const cell = document.createElement("div");
  cell.className = "jantt-col-name";

  const dot = span("jantt-label-dot");
  dot.style.background = isDone
    ? "var(--jantt-bar-done, #64748B)"
    : sanitizeCssColor(item.category.color, FALLBACK_DOT_COLOR);
  cell.appendChild(dot);

  if (item.task.wbs) {
    const wbs = span("jantt-wbs-pill", String(item.task.wbs));
    wbs.style.cssText =
      "font-family: var(--jantt-font-mono); font-size: 10px; font-weight: 700; color: var(--jantt-text-muted); opacity: 0.8; margin-right: 4px;";
    cell.appendChild(wbs);
  }

  cell.appendChild(span("jantt-label-text", item.displayLabel));

  if (item.task.assignee) {
    const assigneeInfo = resolveTaskAssignee(item.task, props.people, props.teams);
    const avatar = span("jantt-assignee-avatar", assigneeInfo.initials);
    avatar.title = `${assigneeInfo.displayName}${assigneeInfo.team ? ` (${assigneeInfo.team.name})` : ""}`;
    avatar.style.background = sanitizeCssColor(assigneeInfo.avatarColor, FALLBACK_DOT_COLOR);
    cell.appendChild(avatar);
  }

  if (item.isMilestone) cell.appendChild(typePill("is-milestone", "Milestone"));
  if (item.task.locked) cell.appendChild(typePill("is-locked", "Locked"));
  return cell;
}

/**
 * Renders the sticky left multi-column table grid and draggable splitter.
 * The splitter is mounted inside the sticky column (anchored to its right edge) so it follows the
 * column through horizontal and vertical scrolling; `splitter` is returned for callers that need it.
 */
export function renderGridTable(props: GridTableProps): {
  labelCol: HTMLElement;
  splitter: HTMLElement;
} {
  const labelCol = document.createElement("div");
  labelCol.className = "jantt-label-column";
  labelCol.style.width = `${props.labelWidth}px`;

  // Header (static markup)
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

    const rawProgress = item.task.progress;
    const progressRatio = rawProgress === undefined || rawProgress === null ? NaN : Number(rawProgress);
    const progressPct = isDone ? "100%" : Number.isFinite(progressRatio) ? `${Math.round(progressRatio * 100)}%` : "-";

    const meta = document.createElement("div");
    meta.className = "jantt-col-meta";
    meta.textContent = item.durationLabel || `${Number(item.durationDays) || 0}d`;

    const progress = document.createElement("div");
    progress.className = "jantt-col-progress-pill";
    progress.textContent = progressPct;

    row.append(buildNameCell(item, isDone, props), meta, progress);

    row.setAttribute("tabindex", "0");
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Open task details: ${item.displayLabel}`);

    row.addEventListener("click", () => props.onTaskClick(item.task));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        (props.onTaskKeyOpen || props.onTaskClick)(item.task);
      }
    });

    // Synchronized row hover with escaped selector query
    const escapedTaskId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(item.task.id) : item.task.id.replace(/"/g, '\\"');
    row.addEventListener("mouseenter", () => {
      row.classList.add("is-row-highlighted");
      const matchingGridRow = (props.getGridContainer?.() ?? props.gridContainer).querySelector(`[data-grid-row-id="${escapedTaskId}"]`);
      matchingGridRow?.classList.add("is-row-highlighted");
    });
    row.addEventListener("mouseleave", () => {
      row.classList.remove("is-row-highlighted");
      const matchingGridRow = (props.getGridContainer?.() ?? props.gridContainer).querySelector(`[data-grid-row-id="${escapedTaskId}"]`);
      matchingGridRow?.classList.remove("is-row-highlighted");
    });

    labelCol.appendChild(row);
  });

  // Optional Add Task row at bottom of table (static markup)
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
    addRow.setAttribute("tabindex", "0");
    addRow.setAttribute("role", "button");
    addRow.setAttribute("aria-label", "Add a new task");
    addRow.addEventListener("click", () => props.onAddTask?.());
    addRow.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        props.onAddTask?.();
      }
    });
    labelCol.appendChild(addRow);
  }

  // Draggable Splitter (positioned by CSS against the sticky column's right edge)
  const splitter = document.createElement("div");
  splitter.className = "jantt-splitter";
  splitter.title = "Drag to resize table width";
  splitter.setAttribute("role", "separator");
  splitter.setAttribute("aria-orientation", "vertical");
  splitter.setAttribute("aria-label", "Resize task table");
  splitter.setAttribute("aria-valuemin", String(MIN_LABEL_WIDTH));
  splitter.setAttribute("aria-valuemax", String(MAX_LABEL_WIDTH));
  splitter.setAttribute("aria-valuenow", String(Math.round(props.labelWidth)));
  // Identifies the splitter for focus restoration across re-renders
  splitter.setAttribute("data-jantt-splitter", "");
  splitter.addEventListener("pointerdown", (e) => {
    props.controller.startSplitterDrag(e, props.labelWidth);
  });

  const onLabelWidthChange = props.onLabelWidthChange;
  if (onLabelWidthChange) {
    splitter.tabIndex = 0;
    splitter.title = "Drag or use the arrow keys to resize the table";
    splitter.addEventListener("keydown", (e) => {
      const step = SPLITTER_KEY_STEP * (e.shiftKey ? 4 : 1);
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = props.labelWidth - step;
      else if (e.key === "ArrowRight") next = props.labelWidth + step;
      else if (e.key === "Home") next = MIN_LABEL_WIDTH;
      else if (e.key === "End") next = MAX_LABEL_WIDTH;
      if (next === null) return;
      e.preventDefault();
      onLabelWidthChange(next);
    });
  }
  labelCol.appendChild(splitter);

  return { labelCol, splitter };
}
