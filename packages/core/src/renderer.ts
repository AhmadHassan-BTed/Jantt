import { JanttData, JanttOptions, Task, TimeScale, LinkRoutingStyle, RowHeightMode } from "./types";
import { layout, computeDependencyPath } from "./layout";
import { InteractionController } from "./controller";
import { createTaskSidebar } from "./sidebar";
import { resolveSchedule, getTaskDependencies } from "./resolver";
import {
  renderToolbar,
  renderGridTable,
  renderTimelineHeader,
  renderTimelineGrid,
  renderDependencyLinks,
  renderTaskBars,
  createTooltipController
} from "./renderers";

export interface JanttInstance {
  update: (data: JanttData, options?: Partial<JanttOptions>) => void;
  destroy: () => void;
  getData: () => JanttData;
}

/**
 * Mounts an enterprise-grade interactive Jantt chart into the given DOM container.
 * Employs modular rendering sub-systems with high cohesion and zero unnecessary coupling.
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
  let currentRouting: LinkRoutingStyle = currentOptions.viewport?.linkRouting || currentData.meta?.linkRouting || "orthogonal";
  let rowHeightMode: RowHeightMode = currentOptions.viewport?.rowHeightMode || "custom";
  let customRowHeight: number = currentOptions.viewport?.rowHeight || 46;
  let showCritical = currentOptions.viewport?.showCriticalPath ?? (currentData.meta?.showCriticalPath ?? false);
  let showBaselines = currentOptions.viewport?.showBaselines ?? (currentData.meta?.showBaselines ?? true);
  let labelWidth = currentOptions.viewport?.labelWidth || 340;
  let filterQuery = currentOptions.searchQuery || "";

  container.innerHTML = "";
  const root = document.createElement("div");
  root.className = `jantt-container ${currentOptions.themeClassName || ""} ${currentOptions.className || ""}`.trim();
  container.appendChild(root);

  // Apply custom theme CSS variables if supplied
  if (currentOptions.theme) {
    Object.entries(currentOptions.theme).forEach(([k, v]) => {
      const varName = k.startsWith("--") ? k : `--jantt-${k}`;
      root.style.setProperty(varName, v);
    });
  }

  const tooltip = createTooltipController({
    theme: currentOptions.theme,
    themeClassName: currentOptions.themeClassName
  });
  let controller: InteractionController;
  let previewWireSvg: SVGPathElement | null = null;
  let activeSidebarInstance: { close: () => void } | null = null;

  const openTaskSidebar = (task: Task) => {
    tooltip.hide();
    activeSidebarInstance?.close();

    // Check if custom sidebar container was configured
    let customContainer: HTMLElement | undefined;
    if (typeof currentOptions.sidebarContainer === "string") {
      customContainer = document.querySelector<HTMLElement>(currentOptions.sidebarContainer) || undefined;
    } else if (currentOptions.sidebarContainer instanceof HTMLElement) {
      customContainer = currentOptions.sidebarContainer;
    }

    activeSidebarInstance = createTaskSidebar({
      task,
      allTasks: currentData.tasks,
      categories: currentData.categories || {},
      container: customContainer,
      theme: currentOptions.theme,
      themeClassName: currentOptions.themeClassName,
      readOnly: currentOptions.readOnly,
      customRenderer: currentOptions.renderDetail,
      onClose: () => {
        activeSidebarInstance = null;
      },
      onSave: (updatedTask) => {
        const nextTasks = currentData.tasks.map((t) =>
          t.id === updatedTask.id ? updatedTask : t
        );
        const resolved = resolveSchedule(nextTasks, currentData.meta?.defaultGapDays ?? 2);
        currentData = { ...currentData, tasks: resolved };
        render();
        currentOptions.onCommit?.(currentData);
      },
      onDelete: (taskId) => {
        const nextTasks = currentData.tasks.filter((t) => t.id !== taskId);
        nextTasks.forEach((t) => {
          const remaining = getTaskDependencies(t).filter((id) => id !== taskId);
          if (remaining.length === 0) {
            t.dependsOn = null;
          } else if (remaining.length === 1) {
            t.dependsOn = remaining[0];
          } else {
            t.dependsOn = remaining;
          }
        });
        const resolved = resolveSchedule(nextTasks, currentData.meta?.defaultGapDays ?? 2);
        currentData = { ...currentData, tasks: resolved };
        render();
        currentOptions.onTaskDelete?.(taskId);
        currentOptions.onCommit?.(currentData);
      }
    });
  };

  const render = () => {
    // 0. Capture scroll positions before re-render so viewport never resets to beginning
    const prevBodyWrap = root.querySelector<HTMLElement>(".jantt-body-wrap");
    const savedScrollLeft = prevBodyWrap ? prevBodyWrap.scrollLeft : 0;
    const savedScrollTop = prevBodyWrap ? prevBodyWrap.scrollTop : 0;

    // 1. Task Search / Filtering
    let displayTasks = currentData.tasks;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      displayTasks = currentData.tasks.filter((t) =>
        (t.label || t.name || t.id).toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q)
      );
    }

    // 2. Dynamic Row Height Calculation
    let effectiveRowHeight = customRowHeight;
    if (rowHeightMode === "fit") {
      const containerH = container.clientHeight || root.clientHeight || 550;
      const headerH = currentOptions.viewport?.headerHeight || 58;
      const toolbarH = 48;
      const availH = Math.max(containerH - headerH - toolbarH - 12, 100);
      const count = Math.max(displayTasks.length, 1);
      effectiveRowHeight = Math.max(26, Math.min(140, Math.floor(availH / count)));
    }

    // 3. Coordinate Layout Calculation
    const layoutResult = layout(
      { ...currentData, tasks: displayTasks },
      {
        ...currentOptions.viewport,
        scale: currentScale,
        linkRouting: currentRouting,
        rowHeight: effectiveRowHeight,
        rowHeightMode,
        showCriticalPath: showCritical,
        showBaselines,
        labelWidth
      }
    );

    const {
      tasks: taskLayouts,
      dependencies,
      header,
      viewport,
      canvasWidth,
      canvasHeight,
      criticalTaskIds
    } = layoutResult;

    // 3. Controller State Machine Setup
    if (!controller) {
      controller = new InteractionController(
        currentData,
        currentOptions,
        viewport.dayWidth,
        render,
        openTaskSidebar,
        (wire) => {
          if (!previewWireSvg) return;
          if (!wire) {
            previewWireSvg.setAttribute("d", "");
          } else {
            const pathStr = computeDependencyPath(
              wire.fromX,
              wire.fromY,
              wire.toX,
              wire.toY,
              viewport.rowHeight,
              currentRouting
            );
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

    // 4. Render Toolbar Subsystem
    const toolbar = renderToolbar({
      meta: currentData.meta,
      taskCount: displayTasks.length,
      currentScale,
      currentRouting,
      rowHeightMode,
      rowHeight: customRowHeight,
      showCritical,
      criticalCount: criticalTaskIds.size,
      searchQuery: filterQuery,
      autoCascade: controller ? controller.isAutoCascade() : true,
      onScaleChange: (s) => {
        currentScale = s;
        currentOptions.onViewportChange?.({
          scale: currentScale,
          linkRouting: currentRouting,
          rowHeight: customRowHeight,
          rowHeightMode,
          showCriticalPath: showCritical,
          showBaselines
        });
        render();
      },
      onRoutingChange: (r) => {
        currentRouting = r;
        currentOptions.onViewportChange?.({
          scale: currentScale,
          linkRouting: currentRouting,
          rowHeight: customRowHeight,
          rowHeightMode,
          showCriticalPath: showCritical,
          showBaselines
        });
        render();
      },
      onRowHeightModeChange: (mode) => {
        rowHeightMode = mode;
        currentOptions.onViewportChange?.({
          scale: currentScale,
          linkRouting: currentRouting,
          rowHeight: customRowHeight,
          rowHeightMode: mode,
          showCriticalPath: showCritical,
          showBaselines
        });
        render();
      },
      onRowHeightChange: (h) => {
        customRowHeight = h;
        rowHeightMode = "custom";
        currentOptions.onViewportChange?.({
          scale: currentScale,
          linkRouting: currentRouting,
          rowHeight: h,
          rowHeightMode: "custom",
          showCriticalPath: showCritical,
          showBaselines
        });
        render();
      },
      onCriticalToggle: () => {
        showCritical = !showCritical;
        currentOptions.onViewportChange?.({
          scale: currentScale,
          linkRouting: currentRouting,
          rowHeight: customRowHeight,
          rowHeightMode,
          showCriticalPath: showCritical,
          showBaselines
        });
        render();
      },
      onAutoCascadeToggle: () => {
        controller.toggleAutoCascade();
        render();
      },
      onSearchChange: (q) => {
        filterQuery = q;
        render();
      }
    });
    root.appendChild(toolbar);

    // 5. Scroll Body Container
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    root.appendChild(bodyWrap);

    // 6. Right Timeline Area Container
    const timelineArea = document.createElement("div");
    timelineArea.className = "jantt-timeline-area";
    timelineArea.style.width = `${canvasWidth}px`;
    timelineArea.style.minWidth = `${canvasWidth}px`;

    // 6a. Timeline Header
    const timelineHeader = renderTimelineHeader(header);
    timelineArea.appendChild(timelineHeader);

    // 6b. Canvas Body Container
    const gridContainer = document.createElement("div");
    gridContainer.style.position = "relative";
    gridContainer.style.width = `${canvasWidth}px`;
    gridContainer.style.height = `${canvasHeight}px`;

    // 7. Render Sticky Data Grid Table & Splitter
    const { labelCol, splitter } = renderGridTable({
      taskLayouts,
      labelWidth,
      headerHeight: header.totalHeight,
      rowHeight: viewport.rowHeight,
      gridContainer,
      controller,
      onTaskClick: openTaskSidebar
    });
    bodyWrap.appendChild(labelCol);
    bodyWrap.appendChild(splitter);

    // 8. Render Timeline Grid Lines & Today Line
    const { gridLayer, todayLine } = renderTimelineGrid({
      header,
      taskLayouts,
      rowHeight: viewport.rowHeight,
      showToday: viewport.showToday
    });
    gridContainer.appendChild(gridLayer);
    if (todayLine) gridContainer.appendChild(todayLine);

    // 9. Render SVG Dependency Connectors & Preview Wire
    const { svg, previewWireSvg: pWire, depPathElements } = renderDependencyLinks({
      dependencies,
      canvasWidth,
      canvasHeight,
      showCritical,
      onLinkDelete: (fromId, toId) => {
        const targetTask = currentData.tasks.find((t) => t.id === toId);
        if (targetTask) {
          const remaining = getTaskDependencies(targetTask).filter((id) => id !== fromId);
          if (remaining.length === 0) {
            targetTask.dependsOn = null;
          } else if (remaining.length === 1) {
            targetTask.dependsOn = remaining[0];
          } else {
            targetTask.dependsOn = remaining;
          }
          const resolved = resolveSchedule(currentData.tasks, currentData.meta?.defaultGapDays ?? 2);
          currentData = { ...currentData, tasks: resolved };
          render();
          currentOptions.onLinkDelete?.(fromId, toId);
          currentOptions.onCommit?.(currentData);
        }
      }
    });
    previewWireSvg = pWire;
    gridContainer.appendChild(svg);

    // 10. Render Task Bars, Milestones, and Progress Handles
    renderTaskBars(
      {
        taskLayouts,
        dependencies,
        depPathElements,
        showCritical,
        showBaselines,
        readOnly: currentOptions.readOnly,
        controller,
        tooltip
      },
      gridContainer
    );

    // Canvas background Marquee / Lasso selection handler
    gridContainer.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest(".jantt-task-bar") &&
        !target.closest(".jantt-milestone") &&
        !target.closest(".jantt-progress-handle") &&
        !target.closest(".jantt-resize-handle") &&
        !target.closest(".jantt-link-port")
      ) {
        controller.startMarqueeSelection(e, gridContainer, taskLayouts);
      }
    });

    gridContainer.addEventListener("contextmenu", (e) => {
      // Prevent browser context menu so right-click lasso works smoothly
      e.preventDefault();
    });

    timelineArea.appendChild(gridContainer);
    bodyWrap.appendChild(timelineArea);

    // Restore scroll positions so moving/editing tasks never jumps scrollbars to the beginning
    if (savedScrollLeft > 0) bodyWrap.scrollLeft = savedScrollLeft;
    if (savedScrollTop > 0) bodyWrap.scrollTop = savedScrollTop;
  };

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      if (rowHeightMode === "fit") {
        render();
      }
    });
    resizeObserver.observe(container);
  }

  render();

  return {
    update: (newData, newOpts) => {
      currentData = {
        ...newData,
        tasks: resolveSchedule(newData.tasks || [], newData.meta?.defaultGapDays ?? 2)
      };
      if (newOpts) {
        currentOptions = { ...currentOptions, ...newOpts };
        if (newOpts.theme) {
          Object.entries(newOpts.theme).forEach(([k, v]) => {
            const varName = k.startsWith("--") ? k : `--jantt-${k}`;
            root.style.setProperty(varName, v);
          });
        }
        if (newOpts.themeClassName !== undefined || newOpts.className !== undefined) {
          root.className = `jantt-container ${currentOptions.themeClassName || ""} ${currentOptions.className || ""}`.trim();
        }
        if (newOpts.viewport?.scale) currentScale = newOpts.viewport.scale;
        if (newOpts.viewport?.linkRouting) currentRouting = newOpts.viewport.linkRouting;
        if (newOpts.viewport?.rowHeight !== undefined) customRowHeight = newOpts.viewport.rowHeight;
        if (newOpts.viewport?.rowHeightMode !== undefined) rowHeightMode = newOpts.viewport.rowHeightMode;
        if (newOpts.viewport?.showCriticalPath !== undefined) showCritical = newOpts.viewport.showCriticalPath;
        if (newOpts.viewport?.showBaselines !== undefined) showBaselines = newOpts.viewport.showBaselines;
        tooltip.updateTheme(currentOptions.theme, currentOptions.themeClassName);
      }
      render();
    },
    destroy: () => {
      resizeObserver?.disconnect();
      tooltip.hide();
      activeSidebarInstance?.close();
      container.innerHTML = "";
    },
    getData: () => currentData
  };
}
