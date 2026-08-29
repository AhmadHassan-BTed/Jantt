import { JanttData, JanttOptions, Task, TimeScale, LinkRoutingStyle } from "./types";
import { layout, computeDependencyPath } from "./layout";
import { InteractionController } from "./controller";
import { createDetailModal } from "./detail-modal";
import { resolveSchedule } from "./resolver";
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
  let showCritical = currentOptions.viewport?.showCriticalPath ?? (currentData.meta?.showCriticalPath ?? false);
  let showBaselines = currentOptions.viewport?.showBaselines ?? (currentData.meta?.showBaselines ?? true);
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

  const tooltip = createTooltipController();
  let controller: InteractionController;
  let previewWireSvg: SVGPathElement | null = null;

  const openTaskModal = (task: Task) => {
    tooltip.hide();
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

    // 2. Coordinate Layout Calculation
    const layoutResult = layout(
      { ...currentData, tasks: displayTasks },
      {
        ...currentOptions.viewport,
        scale: currentScale,
        linkRouting: currentRouting,
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
        openTaskModal,
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
      showCritical,
      criticalCount: criticalTaskIds.size,
      searchQuery: filterQuery,
      onScaleChange: (scale) => {
        currentScale = scale;
        render();
      },
      onRoutingChange: (routing) => {
        currentRouting = routing;
        render();
      },
      onCriticalToggle: () => {
        showCritical = !showCritical;
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
      onTaskClick: openTaskModal
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
          targetTask.dependsOn = null;
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

    timelineArea.appendChild(gridContainer);
    bodyWrap.appendChild(timelineArea);

    // Restore scroll positions so moving/editing tasks never jumps scrollbars to the beginning
    if (savedScrollLeft > 0) bodyWrap.scrollLeft = savedScrollLeft;
    if (savedScrollTop > 0) bodyWrap.scrollTop = savedScrollTop;
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
        if (newOpts.viewport?.linkRouting) currentRouting = newOpts.viewport.linkRouting;
        if (newOpts.viewport?.showCriticalPath !== undefined) showCritical = newOpts.viewport.showCriticalPath;
        if (newOpts.viewport?.showBaselines !== undefined) showBaselines = newOpts.viewport.showBaselines;
      }
      render();
    },
    destroy: () => {
      tooltip.hide();
      container.innerHTML = "";
    },
    getData: () => currentData
  };
}
