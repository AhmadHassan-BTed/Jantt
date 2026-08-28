import { JanttData, JanttOptions, Task } from "./types";
import { layout } from "./layout";
import { InteractionController } from "./controller";
import { createDetailModal } from "./detail-modal";
import { formatHumanDate } from "./date-math";
import { resolveSchedule } from "./resolver";

export interface JanttInstance {
  update: (data: JanttData, options?: Partial<JanttOptions>) => void;
  destroy: () => void;
  getData: () => JanttData;
}

/**
 * Mounts a full interactive Jantt chart into the given DOM container.
 */
export function renderJantt(
  container: HTMLElement,
  initialData: JanttData,
  options: JanttOptions = {}
): JanttInstance {
  let currentData: JanttData = {
    ...initialData,
    tasks: resolveSchedule(initialData.tasks || [], initialData.meta?.defaultGapDays ?? 2)
  };
  let currentOptions: JanttOptions = { ...options };

  container.innerHTML = "";
  const root = document.createElement("div");
  root.className = "jantt-container";
  container.appendChild(root);

  // Apply custom theme CSS variables if supplied
  if (currentOptions.theme) {
    Object.entries(currentOptions.theme).forEach(([k, v]) => {
      const varName = k.startsWith("--") ? k : `--jantt-${k}`;
      root.style.setProperty(varName, v);
    });
  }

  let controller: InteractionController;

  const openTaskModal = (task: Task) => {
    createDetailModal({
      task,
      categories: currentData.categories || {},
      customRenderer: currentOptions.renderDetail,
      onClose: () => {},
      onSave: (updatedTask) => {
        const nextTasks = currentData.tasks.map((t) =>
          t.id === updatedTask.id ? updatedTask : t
        );
        const resolved = resolveSchedule(nextTasks, currentData.meta?.defaultGapDays ?? 2);
        currentData = { ...currentData, tasks: resolved };
        render();
        currentOptions.onCommit?.(currentData);
      }
    });
  };

  const render = () => {
    const layoutResult = layout(currentData, currentOptions.viewport);
    const { tasks: taskLayouts, dependencies, header, viewport, canvasWidth, canvasHeight } = layoutResult;

    if (!controller) {
      controller = new InteractionController(
        currentData,
        currentOptions,
        viewport.dayWidth,
        render,
        openTaskModal
      );
    } else {
      controller.updateData(currentData, viewport.dayWidth);
    }

    root.innerHTML = "";

    // 1. Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "jantt-toolbar";
    const titleText = currentData.meta?.title || "Project Schedule";
    toolbar.innerHTML = `
      <div class="jantt-title-block">
        <span class="jantt-title">${escapeHtml(titleText)}</span>
        <span class="jantt-badge">${currentData.tasks.length} tasks</span>
      </div>
      <div class="jantt-actions">
        <span style="font-size: 11px; color: var(--jantt-text-dim); font-family: var(--jantt-font-mono);">
          Pacing Gap: ${currentData.meta?.defaultGapDays ?? 2}d
        </span>
      </div>
    `;
    root.appendChild(toolbar);

    // 2. Body Wrap
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    root.appendChild(bodyWrap);

    // 3. Left Sticky Label Column
    const labelCol = document.createElement("div");
    labelCol.className = "jantt-label-column";
    labelCol.style.width = `${viewport.labelWidth}px`;

    const labelHeader = document.createElement("div");
    labelHeader.className = "jantt-label-header";
    labelHeader.style.height = `${viewport.headerHeight}px`;
    labelHeader.textContent = "Tasks & Milestones";
    labelCol.appendChild(labelHeader);

    taskLayouts.forEach((item) => {
      const row = document.createElement("div");
      row.className = "jantt-label-row";
      row.style.height = `${viewport.rowHeight}px`;
      row.title = `${item.displayLabel} (${item.durationDays}d)`;

      row.innerHTML = `
        <span class="jantt-label-dot" style="background: ${item.category.color};"></span>
        <span class="jantt-label-text">${escapeHtml(item.displayLabel)}</span>
        ${item.task.locked ? '<span style="font-size: 10px; opacity: 0.6;">🔒</span>' : ""}
      `;

      row.addEventListener("click", () => openTaskModal(item.task));
      labelCol.appendChild(row);
    });

    bodyWrap.appendChild(labelCol);

    // 4. Right Timeline Area
    const timelineArea = document.createElement("div");
    timelineArea.className = "jantt-timeline-area";
    timelineArea.style.width = `${canvasWidth}px`;
    timelineArea.style.minWidth = `${canvasWidth}px`;

    // 4a. Timeline Header
    const timelineHeader = document.createElement("div");
    timelineHeader.className = "jantt-timeline-header";
    timelineHeader.style.height = `${viewport.headerHeight}px`;

    // Months row
    const monthsRow = document.createElement("div");
    monthsRow.className = "jantt-header-months";
    header.months.forEach((m) => {
      const mCell = document.createElement("div");
      mCell.className = "jantt-month-cell";
      mCell.style.width = `${m.width}px`;
      mCell.textContent = m.label;
      monthsRow.appendChild(mCell);
    });
    timelineHeader.appendChild(monthsRow);

    // Days row
    const daysRow = document.createElement("div");
    daysRow.className = "jantt-header-days";
    header.days.forEach((d) => {
      const dCell = document.createElement("div");
      dCell.className = `jantt-day-cell ${d.isWeekend ? "is-weekend" : ""} ${d.isToday ? "is-today" : ""}`;
      dCell.style.width = `${d.width}px`;
      dCell.title = d.dateStr;
      dCell.innerHTML = `<span>${d.label}</span>`;
      daysRow.appendChild(dCell);
    });
    timelineHeader.appendChild(daysRow);

    timelineArea.appendChild(timelineHeader);

    // 4b. Grid Layer & Canvas Body
    const gridContainer = document.createElement("div");
    gridContainer.style.position = "relative";
    gridContainer.style.width = `${canvasWidth}px`;
    gridContainer.style.height = `${canvasHeight}px`;

    // Grid row separators & weekend columns
    const gridLayer = document.createElement("div");
    gridLayer.className = "jantt-grid-layer";

    header.days.forEach((d) => {
      if (d.isWeekend) {
        const col = document.createElement("div");
        col.className = "jantt-grid-day-col is-weekend";
        col.style.left = `${d.x}px`;
        col.style.width = `${d.width}px`;
        gridLayer.appendChild(col);
      }
    });

    taskLayouts.forEach(() => {
      const rowLine = document.createElement("div");
      rowLine.className = "jantt-grid-row";
      rowLine.style.height = `${viewport.rowHeight}px`;
      gridLayer.appendChild(rowLine);
    });

    gridContainer.appendChild(gridLayer);

    // 4c. Today Indicator Line
    if (header.todayX !== null && viewport.showToday) {
      const todayLine = document.createElement("div");
      todayLine.className = "jantt-today-line";
      todayLine.style.left = `${header.todayX}px`;
      todayLine.innerHTML = `<span class="jantt-today-badge">Today</span>`;
      gridContainer.appendChild(todayLine);
    }

    // 4d. SVG Overlay for Dependency Connector Lines
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "jantt-svg-overlay");
    svg.setAttribute("width", String(canvasWidth));
    svg.setAttribute("height", String(canvasHeight));
    svg.setAttribute("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`);

    // Arrow markers
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="jantt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--jantt-dep-line)" />
      </marker>
      <marker id="jantt-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--jantt-dep-line-active)" />
      </marker>
    `;
    svg.appendChild(defs);

    const depPathElements = new Map<string, SVGPathElement>();

    dependencies.forEach((dep) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", dep.path);
      path.setAttribute("class", "jantt-dep-path");
      path.setAttribute("marker-end", "url(#jantt-arrow)");
      path.setAttribute("data-from", dep.fromTaskId);
      path.setAttribute("data-to", dep.toTaskId);
      svg.appendChild(path);

      depPathElements.set(`${dep.fromTaskId}->${dep.toTaskId}`, path);
    });

    gridContainer.appendChild(svg);

    // 4e. Task Bars
    taskLayouts.forEach((item) => {
      const bar = document.createElement("div");
      bar.className = `jantt-task-bar ${item.task.locked ? "is-locked" : ""}`;
      bar.style.left = `${item.x}px`;
      bar.style.top = `${item.y}px`;
      bar.style.width = `${item.width}px`;
      bar.style.height = `${item.height}px`;
      bar.style.background = item.category.color;
      bar.setAttribute("tabindex", "0");
      bar.setAttribute("role", "button");
      bar.setAttribute(
        "aria-label",
        `${item.displayLabel}, Category: ${item.category.label}, Start: ${formatHumanDate(item.task.start)}, End: ${formatHumanDate(item.task.end)}, Duration: ${item.durationDays} days`
      );

      // Progress fill
      if (item.task.progress !== undefined && item.task.progress !== null && item.task.progress > 0) {
        const progressFill = document.createElement("div");
        progressFill.className = "jantt-task-progress";
        progressFill.style.width = `${Math.min(item.task.progress * 100, 100)}%`;
        bar.appendChild(progressFill);
      }

      // Content
      const content = document.createElement("div");
      content.className = "jantt-bar-content";
      content.innerHTML = `
        <span>${escapeHtml(item.displayLabel)}</span>
        ${item.task.locked ? '<span style="font-size: 11px;">🔒</span>' : ""}
        ${item.task.urgent ? '<span style="font-size: 11px; color: #FECDD3;">⚡</span>' : ""}
      `;
      bar.appendChild(content);

      // Resize Handle (Right edge)
      if (!item.task.locked && !currentOptions.readOnly) {
        const handle = document.createElement("div");
        handle.className = "jantt-resize-handle";
        handle.setAttribute("title", "Drag to resize duration");
        handle.addEventListener("pointerdown", (e) => {
          controller.startDrag(e, item.task, "resize", bar);
        });
        bar.appendChild(handle);
      }

      // Pointer event for move/click
      bar.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).classList.contains("jantt-resize-handle")) return;
        controller.startDrag(e, item.task, "move", bar);
      });

      // Keyboard event
      bar.addEventListener("keydown", (e) => {
        controller.handleKeyDown(e, item.task);
      });

      // Hover dependency highlight
      bar.addEventListener("mouseenter", () => {
        dependencies.forEach((dep) => {
          if (dep.fromTaskId === item.task.id || dep.toTaskId === item.task.id) {
            const el = depPathElements.get(`${dep.fromTaskId}->${dep.toTaskId}`);
            if (el) {
              el.classList.add("is-active");
              el.setAttribute("marker-end", "url(#jantt-arrow-active)");
            }
          }
        });
      });

      bar.addEventListener("mouseleave", () => {
        dependencies.forEach((dep) => {
          if (dep.fromTaskId === item.task.id || dep.toTaskId === item.task.id) {
            const el = depPathElements.get(`${dep.fromTaskId}->${dep.toTaskId}`);
            if (el) {
              el.classList.remove("is-active");
              el.setAttribute("marker-end", "url(#jantt-arrow)");
            }
          }
        });
      });

      gridContainer.appendChild(bar);
    });

    timelineArea.appendChild(gridContainer);
    bodyWrap.appendChild(timelineArea);
  };

  render();

  return {
    update: (newData, newOpts) => {
      currentData = {
        ...newData,
        tasks: resolveSchedule(newData.tasks || [], newData.meta?.defaultGapDays ?? 2)
      };
      if (newOpts) {
        currentOptions = { ...currentOptions, ...newOpts };
      }
      render();
    },
    destroy: () => {
      container.innerHTML = "";
    },
    getData: () => currentData
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
