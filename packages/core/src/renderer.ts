import { JanttData, JanttOptions, Task, TimeScale } from "./types";
import { layout } from "./layout";
import { InteractionController } from "./controller";
import { createDetailModal } from "./detail-modal";
import { formatHumanDate, diffDays } from "./date-math";
import { resolveSchedule } from "./resolver";

export interface JanttInstance {
  update: (data: JanttData, options?: Partial<JanttOptions>) => void;
  destroy: () => void;
  getData: () => JanttData;
}

/**
 * Mounts a supercharged, DHTMLX-grade interactive Jantt chart into the given DOM container.
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
  let currentScale: TimeScale = currentOptions.viewport?.scale || currentData.meta?.scale || "day";
  let showCritical = currentOptions.viewport?.showCriticalPath ?? (currentData.meta?.showCriticalPath ?? false);
  let labelWidth = currentOptions.viewport?.labelWidth || 340;
  let filterQuery = currentOptions.searchQuery || "";

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
  let previewWireSvg: SVGPathElement | null = null;
  let activeTooltip: HTMLElement | null = null;

  const openTaskModal = (task: Task) => {
    hideTooltip();
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

  const showTooltip = (task: Task, e: MouseEvent) => {
    hideTooltip();
    const duration = diffDays(task.start, task.end);
    const cat = currentData.categories?.[task.category] || { label: task.category, color: "#3B82F6" };

    const tip = document.createElement("div");
    tip.className = "jantt-tooltip";
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 290)}px`;
    tip.style.top = `${Math.min(e.clientY + 14, window.innerHeight - 200)}px`;

    tip.innerHTML = `
      <div class="jantt-tooltip-title">${escapeHtml(task.label || task.name || task.id)}</div>
      <div class="jantt-tooltip-meta">
        <div style="color: ${cat.color}; font-weight: 600; margin-bottom: 2px;">● ${escapeHtml(cat.label)}</div>
        <div><strong>Timeline:</strong> ${formatHumanDate(task.start)} → ${formatHumanDate(task.end)} (${duration}d)</div>
        ${task.progress !== undefined && task.progress !== null ? `<div><strong>Progress:</strong> ${Math.round(task.progress * 100)}%</div>` : ""}
        ${task.dependsOn ? `<div><strong>Prerequisite:</strong> ${escapeHtml(task.dependsOn)}</div>` : ""}
        ${task.notes ? `<div style="margin-top: 4px; font-style: italic; color: var(--jantt-text);">${escapeHtml(task.notes)}</div>` : ""}
      </div>
    `;

    document.body.appendChild(tip);
    activeTooltip = tip;
  };

  const hideTooltip = () => {
    if (activeTooltip && activeTooltip.parentNode) {
      activeTooltip.parentNode.removeChild(activeTooltip);
      activeTooltip = null;
    }
  };

  const render = () => {
    // Filter tasks if search query active
    let displayTasks = currentData.tasks;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      displayTasks = currentData.tasks.filter((t) =>
        (t.label || t.name || t.id).toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q)
      );
    }

    const layoutResult = layout(
      { ...currentData, tasks: displayTasks },
      {
        ...currentOptions.viewport,
        scale: currentScale,
        showCriticalPath: showCritical,
        labelWidth
      }
    );

    const { tasks: taskLayouts, dependencies, header, viewport, canvasWidth, canvasHeight, criticalTaskIds } = layoutResult;

    if (!controller) {
      controller = new InteractionController(
        currentData,
        currentOptions,
        viewport.dayWidth,
        render,
        openTaskModal,
        (wire) => {
          if (!previewWireSvg) return;
          if (!wire) {
            previewWireSvg.setAttribute("d", "");
          } else {
            const midX = wire.fromX + Math.round((wire.toX - wire.fromX) / 2);
            const pathStr = `M ${wire.fromX} ${wire.fromY} L ${midX} ${wire.fromY} L ${midX} ${wire.toY} L ${wire.toX} ${wire.toY}`;
            previewWireSvg.setAttribute("d", pathStr);
          }
        },
        (newW) => {
          labelWidth = newW;
          render();
        }
      );
    } else {
      controller.updateData(currentData, viewport.dayWidth);
    }

    root.innerHTML = "";

    // 1. Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "jantt-toolbar";

    const titleBlock = document.createElement("div");
    titleBlock.className = "jantt-title-block";
    titleBlock.innerHTML = `
      <span class="jantt-title">${escapeHtml(currentData.meta?.title || "Project Schedule")}</span>
      <span class="jantt-badge">${displayTasks.length} tasks</span>
    `;
    toolbar.appendChild(titleBlock);

    const controls = document.createElement("div");
    controls.className = "jantt-toolbar-controls";

    // Zoom Scale Switcher
    const scaleGroup = document.createElement("div");
    scaleGroup.className = "jantt-scale-group";
    (["day", "week", "month", "quarter", "year"] as TimeScale[]).forEach((s) => {
      const btn = document.createElement("button");
      btn.className = `jantt-scale-btn ${s === currentScale ? "is-active" : ""}`;
      btn.textContent = s;
      btn.addEventListener("click", () => {
        currentScale = s;
        render();
      });
      scaleGroup.appendChild(btn);
    });
    controls.appendChild(scaleGroup);

    // Critical Path Toggle
    const critBtn = document.createElement("button");
    critBtn.className = `jantt-critical-btn ${showCritical ? "is-active" : ""}`;
    critBtn.innerHTML = `<span>⚡</span><span>Critical Path (${criticalTaskIds.size})</span>`;
    critBtn.addEventListener("click", () => {
      showCritical = !showCritical;
      render();
    });
    controls.appendChild(critBtn);

    // Search input
    const searchBox = document.createElement("div");
    searchBox.className = "jantt-search-box";
    searchBox.innerHTML = `
      <span style="font-size: 11px; opacity: 0.6;">🔍</span>
      <input type="text" class="jantt-search-input" placeholder="Search tasks..." value="${escapeHtml(filterQuery)}" />
    `;
    const sInput = searchBox.querySelector<HTMLInputElement>(".jantt-search-input")!;
    sInput.addEventListener("input", (e) => {
      filterQuery = (e.target as HTMLInputElement).value;
      render();
    });
    controls.appendChild(searchBox);

    toolbar.appendChild(controls);
    root.appendChild(toolbar);

    // 2. Body Wrap
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    root.appendChild(bodyWrap);

    // 3. Left Sticky Multi-Column Table Grid
    const labelCol = document.createElement("div");
    labelCol.className = "jantt-label-column";
    labelCol.style.width = `${labelWidth}px`;

    const labelHeader = document.createElement("div");
    labelHeader.className = "jantt-label-header";
    labelHeader.style.height = `${viewport.headerHeight}px`;
    labelHeader.innerHTML = `
      <div>Task & Category</div>
      <div style="text-align: center;">Duration</div>
      <div style="text-align: center;">Progress</div>
    `;
    labelCol.appendChild(labelHeader);

    taskLayouts.forEach((item) => {
      const row = document.createElement("div");
      row.className = "jantt-label-row";
      row.style.height = `${viewport.rowHeight}px`;
      row.setAttribute("data-row-id", item.task.id);

      const progressPct = item.task.progress !== undefined && item.task.progress !== null
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

      row.addEventListener("click", () => openTaskModal(item.task));

      // Row hover sync
      row.addEventListener("mouseenter", () => {
        row.classList.add("is-row-highlighted");
        const matchingGridRow = gridContainer.querySelector(`[data-grid-row-id="${item.task.id}"]`);
        matchingGridRow?.classList.add("is-row-highlighted");
      });
      row.addEventListener("mouseleave", () => {
        row.classList.remove("is-row-highlighted");
        const matchingGridRow = gridContainer.querySelector(`[data-grid-row-id="${item.task.id}"]`);
        matchingGridRow?.classList.remove("is-row-highlighted");
      });

      labelCol.appendChild(row);
    });

    bodyWrap.appendChild(labelCol);

    // Draggable Splitter
    const splitter = document.createElement("div");
    splitter.className = "jantt-splitter";
    splitter.style.left = `${labelWidth - 3}px`;
    splitter.title = "Drag to resize table width";
    splitter.addEventListener("pointerdown", (e) => {
      controller.startSplitterDrag(e, labelWidth);
    });
    bodyWrap.appendChild(splitter);

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

    // 4b. Canvas Body
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

    taskLayouts.forEach((item) => {
      const rowLine = document.createElement("div");
      rowLine.className = "jantt-grid-row";
      rowLine.style.height = `${viewport.rowHeight}px`;
      rowLine.setAttribute("data-grid-row-id", item.task.id);
      gridLayer.appendChild(rowLine);
    });

    gridContainer.appendChild(gridLayer);

    // Today indicator
    if (header.todayX !== null && viewport.showToday) {
      const todayLine = document.createElement("div");
      todayLine.className = "jantt-today-line";
      todayLine.style.left = `${header.todayX}px`;
      todayLine.innerHTML = `<span class="jantt-today-badge">Today</span>`;
      gridContainer.appendChild(todayLine);
    }

    // SVG Overlay
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "jantt-svg-overlay");
    svg.setAttribute("width", String(canvasWidth));
    svg.setAttribute("height", String(canvasHeight));
    svg.setAttribute("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`);

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="jantt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--jantt-dep-line)" />
      </marker>
      <marker id="jantt-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--jantt-dep-line-active)" />
      </marker>
      <marker id="jantt-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--jantt-critical)" />
      </marker>
    `;
    svg.appendChild(defs);

    // Live preview wire
    previewWireSvg = document.createElementNS("http://www.w3.org/2000/svg", "path");
    previewWireSvg.setAttribute("class", "jantt-link-preview-line");
    svg.appendChild(previewWireSvg);

    const depPathElements = new Map<string, SVGPathElement>();

    dependencies.forEach((dep) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", dep.path);
      const isCrit = showCritical && dep.isCritical;
      path.setAttribute("class", `jantt-dep-path ${isCrit ? "is-critical" : ""}`);
      path.setAttribute("marker-end", isCrit ? "url(#jantt-arrow-critical)" : "url(#jantt-arrow)");
      path.setAttribute("data-from", dep.fromTaskId);
      path.setAttribute("data-to", dep.toTaskId);
      path.setAttribute("title", `Dependency: ${dep.fromTaskId} → ${dep.toTaskId} (Click to remove link)`);

      // Click to delete dependency
      path.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetTask = currentData.tasks.find((t) => t.id === dep.toTaskId);
        if (targetTask) {
          targetTask.dependsOn = null;
          const resolved = resolveSchedule(currentData.tasks, currentData.meta?.defaultGapDays ?? 2);
          currentData = { ...currentData, tasks: resolved };
          render();
          currentOptions.onLinkDelete?.(dep.fromTaskId, dep.toTaskId);
          currentOptions.onCommit?.(currentData);
        }
      });

      svg.appendChild(path);
      depPathElements.set(`${dep.fromTaskId}->${dep.toTaskId}`, path);
    });

    gridContainer.appendChild(svg);

    // 4c. Task Bars & Milestone Markers
    taskLayouts.forEach((item) => {
      // Baseline ghost bar if present
      if (item.baselineLayout && viewport.showBaselines) {
        const baseBar = document.createElement("div");
        baseBar.className = "jantt-baseline-bar";
        baseBar.style.left = `${item.baselineLayout.x}px`;
        baseBar.style.top = `${item.baselineLayout.y}px`;
        baseBar.style.width = `${item.baselineLayout.width}px`;
        baseBar.style.height = `${item.baselineLayout.height}px`;
        baseBar.title = `Baseline Plan: ${item.task.baseline?.start} to ${item.task.baseline?.end}`;
        gridContainer.appendChild(baseBar);
      }

      if (item.isMilestone) {
        // Milestone Diamond
        const mStone = document.createElement("div");
        mStone.className = `jantt-milestone ${showCritical && item.isCritical ? "is-critical" : ""}`;
        mStone.style.left = `${item.x}px`;
        mStone.style.top = `${item.y + (item.height - 20) / 2}px`;
        mStone.style.background = item.category.color;
        mStone.setAttribute("data-task-id", item.task.id);
        mStone.setAttribute("tabindex", "0");
        mStone.setAttribute("role", "button");
        mStone.setAttribute("aria-label", `Milestone: ${item.displayLabel}, Date: ${item.task.start}`);

        mStone.addEventListener("pointerdown", (e) => {
          controller.startDrag(e, item.task, "move", mStone);
        });
        mStone.addEventListener("mouseenter", (e) => showTooltip(item.task, e));
        mStone.addEventListener("mouseleave", hideTooltip);

        // Milestone linking ports
        if (!item.task.locked && !currentOptions.readOnly) {
          const portR = document.createElement("div");
          portR.className = "jantt-link-port jantt-link-port-right";
          portR.title = "Drag to link dependency";
          portR.addEventListener("pointerdown", (e) => {
            controller.startDrag(e, item.task, "link", portR);
          });
          mStone.appendChild(portR);
        }

        gridContainer.appendChild(mStone);
        return;
      }

      // Standard Task Bar
      const bar = document.createElement("div");
      bar.className = `jantt-task-bar ${item.task.locked ? "is-locked" : ""} ${showCritical && item.isCritical ? "is-critical" : ""}`;
      bar.style.left = `${item.x}px`;
      bar.style.top = `${item.y}px`;
      bar.style.width = `${item.width}px`;
      bar.style.height = `${item.height}px`;
      bar.style.background = item.category.color;
      bar.setAttribute("data-task-id", item.task.id);
      bar.setAttribute("tabindex", "0");
      bar.setAttribute("role", "button");
      bar.setAttribute(
        "aria-label",
        `${item.displayLabel}, Category: ${item.category.label}, Start: ${formatHumanDate(item.task.start)}, End: ${formatHumanDate(item.task.end)}, Duration: ${item.durationDays} days`
      );

      // Progress fill
      const progressRatio = item.task.progress ?? 0;
      const progressFill = document.createElement("div");
      progressFill.className = "jantt-task-progress";
      progressFill.style.width = `${Math.min(progressRatio * 100, 100)}%`;

      // Inline progress drag handle
      if (!item.task.locked && !currentOptions.readOnly) {
        const pHandle = document.createElement("div");
        pHandle.className = "jantt-progress-handle";
        pHandle.title = `Drag progress (${Math.round(progressRatio * 100)}%)`;
        pHandle.addEventListener("pointerdown", (e) => {
          controller.startDrag(e, item.task, "progress", bar);
        });
        progressFill.appendChild(pHandle);
      }
      bar.appendChild(progressFill);

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
        handle.title = "Drag to resize duration";
        handle.addEventListener("pointerdown", (e) => {
          controller.startDrag(e, item.task, "resize", bar);
        });
        bar.appendChild(handle);

        // Circular Link Ports (DHTMLX Style)
        const portL = document.createElement("div");
        portL.className = "jantt-link-port jantt-link-port-left";
        portL.title = "Dependency target port";
        bar.appendChild(portL);

        const portR = document.createElement("div");
        portR.className = "jantt-link-port jantt-link-port-right";
        portR.title = "Drag wire to connect prerequisite";
        portR.addEventListener("pointerdown", (e) => {
          controller.startDrag(e, item.task, "link", portR);
        });
        bar.appendChild(portR);
      }

      // Pointer event for move/click
      bar.addEventListener("pointerdown", (e) => {
        const target = e.target as HTMLElement;
        if (
          target.classList.contains("jantt-resize-handle") ||
          target.classList.contains("jantt-progress-handle") ||
          target.classList.contains("jantt-link-port")
        ) {
          return;
        }
        controller.startDrag(e, item.task, "move", bar);
      });

      bar.addEventListener("keydown", (e) => {
        controller.handleKeyDown(e, item.task);
      });

      // Hover Tooltip & Dependency Highlights
      bar.addEventListener("mouseenter", (e) => {
        showTooltip(item.task, e);
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
        hideTooltip();
        dependencies.forEach((dep) => {
          if (dep.fromTaskId === item.task.id || dep.toTaskId === item.task.id) {
            const el = depPathElements.get(`${dep.fromTaskId}->${dep.toTaskId}`);
            if (el) {
              el.classList.remove("is-active");
              const isCrit = showCritical && dep.isCritical;
              el.setAttribute("marker-end", isCrit ? "url(#jantt-arrow-critical)" : "url(#jantt-arrow)");
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
        if (newOpts.viewport?.scale) currentScale = newOpts.viewport.scale;
        if (newOpts.viewport?.showCriticalPath !== undefined) showCritical = newOpts.viewport.showCriticalPath;
      }
      render();
    },
    destroy: () => {
      hideTooltip();
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
