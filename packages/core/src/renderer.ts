import { JanttData, JanttOptions, Task, TimeScale, LinkRoutingStyle, RowHeightMode } from "./types";
import { layout, computeDependencyPath, getScaleFromDayWidth, SCALE_DAY_WIDTHS } from "./layout";
import { InteractionController } from "./controller";
import { createTaskSidebar } from "./sidebar";
import { resolveSchedule, getTaskDependencies, calculateCriticalPath } from "./resolver";
import { addDays, diffDays, getTodayISODate, isTaskOnDate, parseISODate } from "./date-math";
import { clampDayWidth, buildViewportSnapshot } from "./utils";
import {
  DEFAULT_GAP_DAYS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_LABEL_WIDTH,
  DEFAULT_HEADER_HEIGHT,
  MULTI_YEAR_HEADER_HEIGHT,
  TOOLBAR_HEIGHT,
  ADD_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT
} from "./constants";
import {
  renderToolbar,
  updateToolbar,
  ToolbarProps,
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
  filterByDate: (dateStr: string | null) => void;
  getSelectedDate: () => string | null;
  setDayWidth: (dayWidth: number) => void;
  getDayWidth: () => number;
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
    tasks: resolveSchedule(initialData.tasks || [], initialData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS)
  };
  let currentOptions: JanttOptions = { ...options };
  let currentScale: TimeScale = currentOptions.viewport?.scale || currentData.meta?.scale || "day";
  let currentDayWidth: number =
    currentOptions.viewport?.dayWidth ||
    SCALE_DAY_WIDTHS[currentScale] ||
    36;
  let currentRouting: LinkRoutingStyle = currentOptions.viewport?.linkRouting || currentData.meta?.linkRouting || "orthogonal";
  let rowHeightMode: RowHeightMode = currentOptions.viewport?.rowHeightMode || "fit";
  let customRowHeight: number = currentOptions.viewport?.rowHeight || DEFAULT_ROW_HEIGHT;
  let showCritical = currentOptions.viewport?.showCriticalPath ?? (currentData.meta?.showCriticalPath ?? false);
  let showBaselines = currentOptions.viewport?.showBaselines ?? (currentData.meta?.showBaselines ?? true);
  let labelWidth = currentOptions.viewport?.labelWidth || DEFAULT_LABEL_WIDTH;
  let filterQuery = currentOptions.searchQuery || "";
  let selectedDateFilter: string | null = currentOptions.selectedDate ?? currentOptions.viewport?.selectedDate ?? null;
  let isSettingsOpen = false;

  const broadcastViewportChange = () => {
    currentOptions.onViewportChange?.(
      buildViewportSnapshot({
        scale: currentScale,
        dayWidth: currentDayWidth,
        linkRouting: currentRouting,
        rowHeight: customRowHeight,
        rowHeightMode,
        showCriticalPath: showCritical,
        showBaselines,
        autoCascade: controller ? controller.isAutoCascade() : (currentOptions.viewport?.autoCascade ?? currentOptions.autoCascade ?? true),
        selectedDate: selectedDateFilter,
        labelWidth
      })
    );
  };

  let renderedDayWidth: number = currentDayWidth;
  let renderedStartDate: string = "";
  let dragAnchorLeftmostDays: number | null = null;
  let dragAnchorStartDate: string = "";

  const handleColumnResizeStart = () => {
    const bodyWrap = root.querySelector<HTMLElement>(".jantt-body-wrap");
    if (bodyWrap && renderedDayWidth > 0 && renderedStartDate) {
      dragAnchorLeftmostDays = bodyWrap.scrollLeft / renderedDayWidth;
      dragAnchorStartDate = renderedStartDate;
    }
  };

  const handleColumnResizeEnd = () => {
    dragAnchorLeftmostDays = null;
    dragAnchorStartDate = "";
  };

  const handleDayWidthChange = (newWidth: number) => {
    const prevDayWidth = currentDayWidth;
    const clamped = clampDayWidth(newWidth);
    if (clamped === prevDayWidth) return;

    currentDayWidth = clamped;
    currentScale = getScaleFromDayWidth(currentDayWidth);
    currentOptions.onDayWidthChange?.(currentDayWidth);
    broadcastViewportChange();

    render();
  };

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

  const handleAddTask = () => {
    const today = getTodayISODate();
    let lastEnd = today;
    if (currentData.tasks.length > 0) {
      lastEnd = currentData.tasks[currentData.tasks.length - 1].end || today;
    }
    const catKeys = Object.keys(currentData.categories || {});
    const defaultCat = catKeys.length > 0 ? catKeys[0] : "general";
    const nextIdx = currentData.tasks.length + 1;
    const newTask: Task = {
      id: `task-${Date.now().toString(36)}`,
      wbs: `${nextIdx}.0`,
      label: `New Task ${nextIdx}`,
      category: defaultCat,
      start: lastEnd,
      end: addDays(lastEnd, 7),
      progress: 0,
      status: "not-started",
      dependsOn: currentData.tasks.length > 0 ? currentData.tasks[currentData.tasks.length - 1].id : null,
      gapDays: currentData.meta?.defaultGapDays ?? 2
    };

    const nextTasks = [...currentData.tasks, newTask];
    const resolved = resolveSchedule(nextTasks, currentData.meta?.defaultGapDays ?? 2);
    currentData = { ...currentData, tasks: resolved };
    render();
    openTaskSidebar(newTask);
    currentOptions.onTaskAdd?.(newTask);
    currentOptions.onCommit?.(currentData);
  };

  const render = () => {
    // 0. Capture scroll positions before re-render so viewport never resets to beginning
    const prevScrollWrap = root.querySelector<HTMLElement>(".jantt-body-wrap");
    const savedScrollLeft = prevScrollWrap ? prevScrollWrap.scrollLeft : 0;
    const savedScrollTop = prevScrollWrap ? prevScrollWrap.scrollTop : 0;
    const hadPreviousRender = prevScrollWrap !== null && renderedStartDate !== "" && renderedDayWidth > 0;

    // 1. Compute master critical path across complete schedule graph before any display filtering
    const masterCriticalResult = calculateCriticalPath(currentData.tasks);

    // 2. Task Search / Filtering for display
    let displayTasks = currentData.tasks;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      displayTasks = currentData.tasks.filter((t) =>
        (t.label || t.name || t.id).toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q)
      );
    }
    if (selectedDateFilter) {
      displayTasks = displayTasks.filter((t) => {
        if (!t.start || !t.end) return false;
        return isTaskOnDate(t.start, t.end, selectedDateFilter!);
      });
    }

    // 3. Dynamic Row Height Calculation
    let effectiveRowHeight = customRowHeight;
    if (rowHeightMode === "fit") {
      const containerH = container.clientHeight || root.clientHeight || 550;
      let minStart = currentData.tasks[0]?.start || getTodayISODate(currentOptions.viewport?.currentTime);
      let maxEnd = currentData.tasks[currentData.tasks.length - 1]?.end || minStart;
      currentData.tasks.forEach((t) => {
        if (t.start && t.start < minStart) minStart = t.start;
        if (t.end && t.end > maxEnd) maxEnd = t.end;
      });
      const spansMulti = parseISODate(minStart).getUTCFullYear() !== parseISODate(maxEnd).getUTCFullYear();
      const headerH = spansMulti ? MULTI_YEAR_HEADER_HEIGHT : (currentOptions.viewport?.headerHeight || DEFAULT_HEADER_HEIGHT);
      const existingToolbar = root.querySelector<HTMLElement>(".jantt-toolbar");
      const toolbarH = existingToolbar ? existingToolbar.offsetHeight : TOOLBAR_HEIGHT;
      const addRowH = currentOptions.readOnly ? 0 : ADD_ROW_HEIGHT;
      const borderBuffer = 6;
      const availH = Math.max(containerH - headerH - toolbarH - addRowH - borderBuffer, 100);
      const count = Math.max(displayTasks.length, 1);
      effectiveRowHeight = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.floor(availH / count)));
    }

    // 4. Coordinate Layout Calculation
    const layoutResult = layout(
      { ...currentData, tasks: displayTasks },
      {
        ...currentOptions.viewport,
        scale: currentScale,
        dayWidth: currentDayWidth,
        linkRouting: currentRouting,
        rowHeight: effectiveRowHeight,
        rowHeightMode,
        showCriticalPath: showCritical,
        showBaselines,
        labelWidth,
        selectedDate: selectedDateFilter,
        criticalResult: masterCriticalResult
      }
    );

    const {
      tasks: taskLayouts,
      dependencies,
      header,
      viewport,
      canvasWidth,
      canvasHeight
    } = layoutResult;

    const newStartDate = layoutResult.viewport.startDate;

    let targetScrollLeft: number = savedScrollLeft;
    if (hadPreviousRender) {
      if (dragAnchorLeftmostDays !== null && dragAnchorStartDate) {
        // Continuous column header drag session: anchor to drag start to prevent floating drift
        const startDeltaDays = diffDays(newStartDate, dragAnchorStartDate);
        const newLeftmostDays = Math.max(0, dragAnchorLeftmostDays + startDeltaDays);
        targetScrollLeft = Math.max(0, Math.round(newLeftmostDays * currentDayWidth));
      } else if (currentDayWidth !== renderedDayWidth || newStartDate !== renderedStartDate) {
        // Discrete zoom / scale changes / wheel / slider
        const prevLeftmostDays = savedScrollLeft / renderedDayWidth;
        const startDeltaDays = diffDays(newStartDate, renderedStartDate);
        const newLeftmostDays = Math.max(0, prevLeftmostDays + startDeltaDays);
        targetScrollLeft = Math.max(0, Math.round(newLeftmostDays * currentDayWidth));
      }
    }

    // 5. Controller State Machine Setup
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
      controller.updateData(currentData, viewport.dayWidth, currentOptions);
    }

    // 6. Render or Update Toolbar Subsystem in-place
    let toolbar = root.querySelector<HTMLElement>(".jantt-toolbar");
    const toolbarProps: ToolbarProps = {
      meta: currentData.meta,
      taskCount: displayTasks.length,
      currentScale,
      currentRouting,
      rowHeightMode,
      rowHeight: effectiveRowHeight,
      showCritical,
      showBaselines,
      criticalCount: masterCriticalResult.criticalTaskIds.size,
      searchQuery: filterQuery,
      autoCascade: controller.isAutoCascade(),
      dayWidth: currentDayWidth,
      isSettingsOpen,
      onSettingsOpenChange: (open: boolean) => {
        isSettingsOpen = open;
      },
      onDayWidthChange: handleDayWidthChange,
      onScaleChange: (s: TimeScale) => {
        currentScale = s;
        currentDayWidth = SCALE_DAY_WIDTHS[s] || 36;
        currentOptions.onDayWidthChange?.(currentDayWidth);
        broadcastViewportChange();
        render();
      },
      onRoutingChange: (r: LinkRoutingStyle) => {
        currentRouting = r;
        broadcastViewportChange();
        render();
      },
      onRowHeightModeChange: (mode: RowHeightMode) => {
        rowHeightMode = mode;
        broadcastViewportChange();
        render();
      },
      onRowHeightChange: (h: number) => {
        customRowHeight = h;
        rowHeightMode = "custom";
        broadcastViewportChange();
        render();
      },
      onCriticalToggle: () => {
        showCritical = !showCritical;
        broadcastViewportChange();
        render();
      },
      onBaselinesToggle: () => {
        showBaselines = !showBaselines;
        broadcastViewportChange();
        render();
      },
      onAutoCascadeToggle: () => {
        controller.toggleAutoCascade();
        broadcastViewportChange();
        render();
      },
      selectedDate: selectedDateFilter,
      onClearDateFilter: () => {
        selectedDateFilter = null;
        currentOptions.onClearDateFilter?.();
        broadcastViewportChange();
        render();
      },
      onSearchChange: (q: string) => {
        filterQuery = q;
        render();
      },
      onAddTask: currentOptions.readOnly ? undefined : handleAddTask
    };

    if (toolbar && toolbar.isConnected) {
      updateToolbar(toolbar, toolbarProps);
    } else {
      toolbar = renderToolbar(toolbarProps);
      root.prepend(toolbar);
    }

    // Clean up previous scroll body container before mounting updated body
    const oldBodyWrap = root.querySelector<HTMLElement>(".jantt-body-wrap");
    if (oldBodyWrap) {
      oldBodyWrap.remove();
    }

    // 7. Scroll Body Container
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    if (rowHeightMode === "fit") {
      bodyWrap.style.overflowY = "hidden";
    }

    // Ctrl + Wheel / Cmd + Wheel zoom pivoted from leftmost visible edge
    bodyWrap.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newDayWidth = clampDayWidth(currentDayWidth * zoomFactor);
        if (newDayWidth !== currentDayWidth) {
          handleDayWidthChange(newDayWidth);
        }
      }
    }, { passive: false });

    root.appendChild(bodyWrap);

    // 6. Right Timeline Area Container
    const timelineArea = document.createElement("div");
    timelineArea.className = "jantt-timeline-area";
    timelineArea.style.width = `${canvasWidth}px`;
    timelineArea.style.minWidth = `${canvasWidth}px`;

    // 6a. Timeline Header
    const timelineHeader = renderTimelineHeader(header, {
      selectedDate: selectedDateFilter,
      dayWidth: currentDayWidth,
      onColumnResize: (w) => handleDayWidthChange(w),
      onColumnResizeStart: handleColumnResizeStart,
      onColumnResizeEnd: handleColumnResizeEnd,
      onDateClick: (dateStr: string) => {
        selectedDateFilter = selectedDateFilter === dateStr ? null : dateStr;
        currentOptions.onDateClick?.(dateStr);
        broadcastViewportChange();
        render();
      }
    });
    timelineArea.appendChild(timelineHeader);

    // 6b. Canvas Body Container
    const hasAddRow = !currentOptions.readOnly;
    const addRowHeight = hasAddRow ? Math.min(viewport.rowHeight, 38) : 0;
    const totalCanvasHeight = canvasHeight + addRowHeight;

    const gridContainer = document.createElement("div");
    gridContainer.style.position = "relative";
    gridContainer.style.width = `${canvasWidth}px`;
    gridContainer.style.height = `${totalCanvasHeight}px`;

    // 7. Render Sticky Data Grid Table & Splitter
    const { labelCol, splitter } = renderGridTable({
      taskLayouts,
      labelWidth,
      headerHeight: header.totalHeight,
      rowHeight: viewport.rowHeight,
      gridContainer,
      controller,
      onTaskClick: openTaskSidebar,
      onAddTask: currentOptions.readOnly ? undefined : handleAddTask
    });
    bodyWrap.appendChild(labelCol);
    bodyWrap.appendChild(splitter);

    // 8. Render Timeline Grid Lines & Today Line
    const { gridLayer, todayLine } = renderTimelineGrid({
      header,
      taskLayouts,
      rowHeight: viewport.rowHeight,
      showToday: viewport.showToday,
      hasAddRow,
      selectedDate: selectedDateFilter
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

    renderedDayWidth = currentDayWidth;
    renderedStartDate = newStartDate;

    // Restore scroll positions pivoted from leftmost visible edge
    if (hadPreviousRender) {
      bodyWrap.scrollLeft = targetScrollLeft;
    } else if (savedScrollLeft > 0) {
      bodyWrap.scrollLeft = savedScrollLeft;
    }
    if (savedScrollTop > 0) bodyWrap.scrollTop = savedScrollTop;
  };

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    let resizeTimer: any = null;
    resizeObserver = new ResizeObserver(() => {
      if (rowHeightMode === "fit") {
        if (resizeTimer) cancelAnimationFrame(resizeTimer);
        resizeTimer = requestAnimationFrame(() => {
          render();
        });
      }
    });
    resizeObserver.observe(container);
  }

  let todayTimer: any = null;
  if (typeof window !== "undefined") {
    todayTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
        render();
      }
    }, 60000);
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
        if (newOpts.viewport?.dayWidth !== undefined) {
          currentDayWidth = newOpts.viewport.dayWidth;
          currentScale = getScaleFromDayWidth(currentDayWidth);
        } else if (newOpts.viewport?.scale) {
          currentScale = newOpts.viewport.scale;
          currentDayWidth = SCALE_DAY_WIDTHS[currentScale] || 36;
        }
        if (newOpts.viewport?.linkRouting) currentRouting = newOpts.viewport.linkRouting;
        if (newOpts.viewport?.rowHeight !== undefined) customRowHeight = newOpts.viewport.rowHeight;
        if (newOpts.viewport?.rowHeightMode !== undefined) rowHeightMode = newOpts.viewport.rowHeightMode;
        if (newOpts.viewport?.showCriticalPath !== undefined) showCritical = newOpts.viewport.showCriticalPath;
        if (newOpts.viewport?.showBaselines !== undefined) showBaselines = newOpts.viewport.showBaselines;
        if (newOpts.viewport?.autoCascade !== undefined) {
          controller.setAutoCascade(newOpts.viewport.autoCascade);
        } else if (newOpts.autoCascade !== undefined) {
          controller.setAutoCascade(newOpts.autoCascade);
        }
        if (newOpts.selectedDate !== undefined) {
          selectedDateFilter = newOpts.selectedDate;
        } else if (newOpts.viewport?.selectedDate !== undefined) {
          selectedDateFilter = newOpts.viewport.selectedDate;
        }
        tooltip.updateTheme(currentOptions.theme, currentOptions.themeClassName);
      }
      render();
    },
    destroy: () => {
      const oldToolbar = root.querySelector<HTMLElement>(".jantt-toolbar");
      (oldToolbar as any)?.__cleanup?.();
      if (todayTimer) clearInterval(todayTimer);
      resizeObserver?.disconnect();
      tooltip.hide();
      activeSidebarInstance?.close();
      container.innerHTML = "";
    },
    getData: () => currentData,
    filterByDate: (dateStr: string | null) => {
      selectedDateFilter = dateStr;
      broadcastViewportChange();
      render();
    },
    getSelectedDate: () => selectedDateFilter,
    setDayWidth: (w: number) => handleDayWidthChange(w),
    getDayWidth: () => currentDayWidth
  };
}
