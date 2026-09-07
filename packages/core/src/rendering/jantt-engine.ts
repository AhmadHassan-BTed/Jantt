import { JanttData, JanttOptions, Task, TimeScale, LinkRoutingStyle, RowHeightMode } from "../types";
import { layout, computeDependencyPath, getScaleFromDayWidth, SCALE_DAY_WIDTHS } from "../layout";
import { InteractionController } from "../controller";
import { createTaskSidebar } from "../sidebar";
import { resolveSchedule, calculateCriticalPath } from "../resolver";
import { clampDayWidth } from "../utils";
import { DEFAULT_GAP_DAYS, DEFAULT_ROW_HEIGHT, DEFAULT_LABEL_WIDTH } from "../constants";
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
} from "../renderers";
import { ViewportCoordinator, ViewportCoordinationState } from "./viewport-coordinator";
import { TaskScheduleCoordinator } from "./task-schedule-coordinator";

export interface JanttInstance {
  update: (data: JanttData, options?: Partial<JanttOptions>) => void;
  destroy: () => void;
  getData: () => JanttData;
  filterByDate: (dateStr: string | null) => void;
  getSelectedDate: () => string | null;
  setDayWidth: (dayWidth: number) => void;
  getDayWidth: () => number;
}

export class JanttRendererEngine {
  private container: HTMLElement;
  private root: HTMLElement;
  private currentData: JanttData;
  private currentOptions: JanttOptions;

  private state: ViewportCoordinationState;
  private isSettingsOpen = false;

  private tooltip: ReturnType<typeof createTooltipController>;
  private controller!: InteractionController;
  private previewWireSvg: SVGPathElement | null = null;
  private activeSidebarInstance: { close: () => void } | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private lastObservedWidth = 0;
  private lastObservedHeight = 0;
  private resizeTimer: number | null = null;
  private todayTimer: ReturnType<typeof setInterval> | null = null;

  constructor(container: HTMLElement, initialData: JanttData, options: JanttOptions = {}) {
    this.container = container;
    this.currentData = {
      ...initialData,
      tasks: resolveSchedule(initialData.tasks || [], initialData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS)
    };
    this.currentOptions = { ...options };

    const initialScale: TimeScale = this.currentOptions.viewport?.scale || this.currentData.meta?.scale || "day";
    const initialDayWidth: number =
      this.currentOptions.viewport?.dayWidth || SCALE_DAY_WIDTHS[initialScale] || 36;
    const initialRouting: LinkRoutingStyle =
      this.currentOptions.viewport?.linkRouting || this.currentData.meta?.linkRouting || "orthogonal";
    const initialRowHeightMode: RowHeightMode = this.currentOptions.viewport?.rowHeightMode || "fit";
    const initialCustomRowHeight: number = this.currentOptions.viewport?.rowHeight || DEFAULT_ROW_HEIGHT;
    const initialShowCritical =
      this.currentOptions.viewport?.showCriticalPath ?? (this.currentData.meta?.showCriticalPath ?? false);
    const initialShowBaselines =
      this.currentOptions.viewport?.showBaselines ?? (this.currentData.meta?.showBaselines ?? true);
    const initialLabelWidth = this.currentOptions.viewport?.labelWidth || DEFAULT_LABEL_WIDTH;
    const initialFilterQuery = this.currentOptions.searchQuery || "";
    const initialSelectedDate: string | null =
      this.currentOptions.selectedDate ?? this.currentOptions.viewport?.selectedDate ?? null;

    this.state = {
      currentScale: initialScale,
      currentDayWidth: initialDayWidth,
      currentRouting: initialRouting,
      rowHeightMode: initialRowHeightMode,
      customRowHeight: initialCustomRowHeight,
      showCritical: initialShowCritical,
      showBaselines: initialShowBaselines,
      labelWidth: initialLabelWidth,
      filterQuery: initialFilterQuery,
      selectedDateFilter: initialSelectedDate,
      renderedDayWidth: initialDayWidth,
      renderedStartDate: "",
      dragAnchorLeftmostDays: null,
      dragAnchorStartDate: ""
    };

    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = `jantt-container ${this.currentOptions.themeClassName || ""} ${this.currentOptions.className || ""}`.trim();
    this.container.appendChild(this.root);

    this.applyThemeStyles();

    this.tooltip = createTooltipController({
      theme: this.currentOptions.theme,
      themeClassName: this.currentOptions.themeClassName
    });
  }

  private applyThemeStyles() {
    if (this.currentOptions.theme) {
      Object.entries(this.currentOptions.theme).forEach(([k, v]) => {
        const varName = k.startsWith("--") ? k : `--jantt-${k}`;
        this.root.style.setProperty(varName, v);
      });
    }
  }

  private broadcastViewport() {
    ViewportCoordinator.broadcastChange(
      this.currentOptions,
      this.state,
      this.state.customRowHeight,
      this.controller ? this.controller.isAutoCascade() : (this.currentOptions.viewport?.autoCascade ?? this.currentOptions.autoCascade ?? true)
    );
  }

  private handleDayWidthChange = (newWidth: number) => {
    const prevDayWidth = this.state.currentDayWidth;
    const clamped = clampDayWidth(newWidth);
    if (clamped === prevDayWidth) return;

    this.state.currentDayWidth = clamped;
    this.state.currentScale = getScaleFromDayWidth(this.state.currentDayWidth);
    this.currentOptions.onDayWidthChange?.(this.state.currentDayWidth);
    this.broadcastViewport();
    this.render();
  };

  private openTaskSidebar = (task: Task) => {
    this.tooltip.hide();
    this.activeSidebarInstance?.close();

    let customContainer: HTMLElement | undefined;
    if (typeof this.currentOptions.sidebarContainer === "string") {
      customContainer = document.querySelector<HTMLElement>(this.currentOptions.sidebarContainer) || undefined;
    } else if (this.currentOptions.sidebarContainer instanceof HTMLElement) {
      customContainer = this.currentOptions.sidebarContainer;
    }

    this.activeSidebarInstance = createTaskSidebar({
      task,
      allTasks: this.currentData.tasks,
      categories: this.currentData.categories || {},
      container: customContainer,
      theme: this.currentOptions.theme,
      themeClassName: this.currentOptions.themeClassName,
      readOnly: this.currentOptions.readOnly,
      customRenderer: this.currentOptions.renderDetail,
      onClose: () => {
        this.activeSidebarInstance = null;
      },
      onSave: (updatedTask) => {
        this.currentData = TaskScheduleCoordinator.updateTask(this.currentData, updatedTask);
        this.render();
        this.currentOptions.onCommit?.(this.currentData);
      },
      onDelete: (taskId) => {
        this.currentData = TaskScheduleCoordinator.deleteTask(this.currentData, taskId);
        this.render();
        this.currentOptions.onTaskDelete?.(taskId);
        this.currentOptions.onCommit?.(this.currentData);
      }
    });
  };

  private handleAddTask = () => {
    const { nextData, newTask } = TaskScheduleCoordinator.createTask(this.currentData);
    this.currentData = nextData;
    this.render();
    this.openTaskSidebar(newTask);
    this.currentOptions.onTaskAdd?.(newTask);
    this.currentOptions.onCommit?.(this.currentData);
  };

  public render = () => {
    // 0. Capture scroll positions before re-render
    const prevScrollWrap = this.root.querySelector<HTMLElement>(".jantt-body-wrap");
    const savedScrollLeft = prevScrollWrap ? prevScrollWrap.scrollLeft : 0;
    const savedScrollTop = prevScrollWrap ? prevScrollWrap.scrollTop : 0;
    const hadPreviousRender =
      prevScrollWrap !== null && this.state.renderedStartDate !== "" && this.state.renderedDayWidth > 0;

    // 1. Compute master critical path across complete schedule graph
    const masterCriticalResult = calculateCriticalPath(this.currentData.tasks);
    this.root.classList.toggle("jantt-show-critical", this.state.showCritical);

    // 2. Filter tasks for display
    const displayTasks = ViewportCoordinator.filterDisplayTasks(
      this.currentData.tasks,
      this.state.filterQuery,
      this.state.selectedDateFilter,
      this.currentOptions
    );

    // 3. Dynamic Row Height Calculation
    const effectiveRowHeight = ViewportCoordinator.calculateRowHeight(
      this.container,
      this.root,
      this.currentData.tasks,
      displayTasks.length,
      this.state.rowHeightMode,
      this.state.customRowHeight,
      this.currentOptions.viewport,
      this.currentOptions.readOnly
    );

    // 4. Coordinate Layout Calculation
    const layoutResult = layout(
      { ...this.currentData, tasks: displayTasks },
      {
        ...this.currentOptions.viewport,
        scale: this.state.currentScale,
        dayWidth: this.state.currentDayWidth,
        linkRouting: this.state.currentRouting,
        rowHeight: effectiveRowHeight,
        rowHeightMode: this.state.rowHeightMode,
        showCriticalPath: this.state.showCritical,
        showBaselines: this.state.showBaselines,
        labelWidth: this.state.labelWidth,
        selectedDate: this.state.selectedDateFilter,
        criticalResult: masterCriticalResult
      }
    );

    const { tasks: taskLayouts, dependencies, header, viewport, canvasWidth, canvasHeight } = layoutResult;
    const newStartDate = layoutResult.viewport.startDate;

    const targetScrollLeft = ViewportCoordinator.calculateScrollTarget(
      savedScrollLeft,
      hadPreviousRender,
      newStartDate,
      this.state.currentDayWidth,
      this.state
    );

    // 5. Controller State Machine Setup
    if (!this.controller) {
      this.controller = new InteractionController(
        this.currentData,
        this.currentOptions,
        viewport.dayWidth,
        this.render,
        this.openTaskSidebar,
        (wire) => {
          if (!this.previewWireSvg) return;
          if (!wire) {
            this.previewWireSvg.setAttribute("d", "");
          } else {
            const pathStr = computeDependencyPath(
              wire.fromX,
              wire.fromY,
              wire.toX,
              wire.toY,
              viewport.rowHeight,
              this.state.currentRouting
            );
            this.previewWireSvg.setAttribute("d", pathStr);
          }
        },
        (newW) => {
          this.state.labelWidth = newW;
          this.render();
        },
        this.root
      );
    } else {
      this.controller.updateData(this.currentData, viewport.dayWidth, this.currentOptions, this.root);
    }

    // 6. Render or Update Toolbar Subsystem in-place
    let toolbar = this.root.querySelector<HTMLElement>(".jantt-toolbar");
    const toolbarProps: ToolbarProps = {
      meta: this.currentData.meta,
      taskCount: displayTasks.length,
      currentScale: this.state.currentScale,
      currentRouting: this.state.currentRouting,
      rowHeightMode: this.state.rowHeightMode,
      rowHeight: effectiveRowHeight,
      showCritical: this.state.showCritical,
      showBaselines: this.state.showBaselines,
      criticalCount: masterCriticalResult.criticalTaskIds.size,
      searchQuery: this.state.filterQuery,
      autoCascade: this.controller.isAutoCascade(),
      dayWidth: this.state.currentDayWidth,
      isSettingsOpen: this.isSettingsOpen,
      onSettingsOpenChange: (open: boolean) => {
        this.isSettingsOpen = open;
      },
      onDayWidthChange: this.handleDayWidthChange,
      onScaleChange: (s: TimeScale) => {
        this.state.currentScale = s;
        this.state.currentDayWidth = SCALE_DAY_WIDTHS[s] || 36;
        this.currentOptions.onDayWidthChange?.(this.state.currentDayWidth);
        this.broadcastViewport();
        this.render();
      },
      onRoutingChange: (r: LinkRoutingStyle) => {
        this.state.currentRouting = r;
        this.broadcastViewport();
        this.render();
      },
      onRowHeightModeChange: (mode: RowHeightMode) => {
        this.state.rowHeightMode = mode;
        this.broadcastViewport();
        this.render();
      },
      onRowHeightChange: (h: number) => {
        this.state.customRowHeight = h;
        this.state.rowHeightMode = "custom";
        this.broadcastViewport();
        this.render();
      },
      onCriticalToggle: () => {
        this.state.showCritical = !this.state.showCritical;
        this.broadcastViewport();
        this.render();
      },
      onBaselinesToggle: () => {
        this.state.showBaselines = !this.state.showBaselines;
        this.broadcastViewport();
        this.render();
      },
      onAutoCascadeToggle: () => {
        this.controller.toggleAutoCascade();
        this.broadcastViewport();
        this.render();
      },
      selectedDate: this.state.selectedDateFilter,
      showDateFilterBadge:
        this.currentOptions.showDateFilterBadge !== false &&
        this.currentOptions.viewport?.showDateFilterBadge !== false,
      onClearDateFilter: () => {
        this.state.selectedDateFilter = null;
        this.currentOptions.onClearDateFilter?.();
        this.broadcastViewport();
        this.render();
      },
      onSearchChange: (q: string) => {
        this.state.filterQuery = q;
        this.render();
      },
      onAddTask: this.currentOptions.readOnly ? undefined : this.handleAddTask,
      onOpenAutoSave: this.currentOptions.onOpenAutoSave,
      onImportJson: this.currentOptions.onImportJson,
      onExportJson: this.currentOptions.onExportJson,
      onExportCsv: this.currentOptions.onExportCsv
    };

    if (toolbar && toolbar.isConnected) {
      updateToolbar(toolbar, toolbarProps);
    } else {
      toolbar = renderToolbar(toolbarProps);
      this.root.prepend(toolbar);
    }

    // Clean up previous scroll body container before mounting updated body
    const oldBodyWrap = this.root.querySelector<HTMLElement>(".jantt-body-wrap");
    if (oldBodyWrap) {
      oldBodyWrap.remove();
    }

    // 7. Scroll Body Container
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    if (this.state.rowHeightMode === "fit") {
      bodyWrap.style.overflowY = "hidden";
    }

    // Ctrl + Wheel / Cmd + Wheel zoom pivoted from leftmost visible edge
    bodyWrap.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newDayWidth = clampDayWidth(this.state.currentDayWidth * zoomFactor);
        if (newDayWidth !== this.state.currentDayWidth) {
          this.handleDayWidthChange(newDayWidth);
        }
      }
    }, { passive: false });

    this.root.appendChild(bodyWrap);

    // 8. Right Timeline Area Container
    const timelineArea = document.createElement("div");
    timelineArea.className = "jantt-timeline-area";
    timelineArea.style.width = `${canvasWidth}px`;
    timelineArea.style.minWidth = `${canvasWidth}px`;

    // 8a. Timeline Header
    const timelineHeader = renderTimelineHeader(header, {
      selectedDate: this.state.selectedDateFilter,
      dayWidth: this.state.currentDayWidth,
      showToday: viewport.showToday,
      showTodayTag: viewport.showTodayTag,
      onColumnResize: (w) => this.handleDayWidthChange(w),
      onColumnResizeStart: () => {
        const wrap = this.root.querySelector<HTMLElement>(".jantt-body-wrap");
        if (wrap && this.state.renderedDayWidth > 0 && this.state.renderedStartDate) {
          this.state.dragAnchorLeftmostDays = wrap.scrollLeft / this.state.renderedDayWidth;
          this.state.dragAnchorStartDate = this.state.renderedStartDate;
        }
      },
      onColumnResizeEnd: () => {
        this.state.dragAnchorLeftmostDays = null;
        this.state.dragAnchorStartDate = "";
      },
      onDateClick: (dateStr: string) => {
        const shouldFilter =
          this.currentOptions.filterTasksByDate !== false &&
          this.currentOptions.viewport?.filterTasksByDate !== false;
        if (shouldFilter) {
          this.state.selectedDateFilter = this.state.selectedDateFilter === dateStr ? null : dateStr;
        }
        this.currentOptions.onDateClick?.(dateStr);
        this.broadcastViewport();
        this.render();
      }
    });
    timelineArea.appendChild(timelineHeader);

    // 8b. Canvas Body Container
    const hasAddRow = !this.currentOptions.readOnly;
    const addRowHeight = hasAddRow ? Math.min(viewport.rowHeight, 38) : 0;
    const totalCanvasHeight = canvasHeight + addRowHeight;

    const gridContainer = document.createElement("div");
    gridContainer.style.position = "relative";
    gridContainer.style.width = `${canvasWidth}px`;
    gridContainer.style.height = `${totalCanvasHeight}px`;

    // 9. Render Sticky Data Grid Table & Splitter
    const { labelCol, splitter } = renderGridTable({
      taskLayouts,
      labelWidth: this.state.labelWidth,
      headerHeight: header.totalHeight,
      rowHeight: viewport.rowHeight,
      gridContainer,
      controller: this.controller,
      showCritical: this.state.showCritical,
      people: this.currentData.people,
      teams: this.currentData.teams,
      onTaskClick: this.openTaskSidebar,
      onAddTask: this.currentOptions.readOnly ? undefined : this.handleAddTask
    });
    bodyWrap.appendChild(labelCol);
    bodyWrap.appendChild(splitter);

    // 10. Render Timeline Grid Lines & Today Line
    const { gridLayer, todayLine } = renderTimelineGrid({
      header,
      taskLayouts,
      rowHeight: viewport.rowHeight,
      showToday: viewport.showToday,
      showCritical: this.state.showCritical,
      hasAddRow,
      selectedDate: this.state.selectedDateFilter
    });
    gridContainer.appendChild(gridLayer);
    if (todayLine) gridContainer.appendChild(todayLine);

    // 11. Render SVG Dependency Connectors & Preview Wire
    const { svg, previewWireSvg: pWire, depPathElements } = renderDependencyLinks({
      dependencies,
      canvasWidth,
      canvasHeight,
      showCritical: this.state.showCritical,
      onLinkDelete: (fromId, toId) => {
        this.currentData = TaskScheduleCoordinator.removeDependency(this.currentData, fromId, toId);
        this.render();
        this.currentOptions.onCommit?.(this.currentData);
      }
    });
    this.previewWireSvg = pWire;
    gridContainer.appendChild(svg);

    // 12. Render Task Bars, Milestones, and Progress Handles
    renderTaskBars(
      {
        taskLayouts,
        dependencies,
        depPathElements,
        showCritical: this.state.showCritical,
        showBaselines: this.state.showBaselines,
        readOnly: this.currentOptions.readOnly,
        people: this.currentData.people,
        teams: this.currentData.teams,
        controller: this.controller,
        tooltip: this.tooltip
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
        this.controller.startMarqueeSelection(e, gridContainer, taskLayouts);
      }
    });

    gridContainer.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    timelineArea.appendChild(gridContainer);
    bodyWrap.appendChild(timelineArea);

    this.state.renderedDayWidth = this.state.currentDayWidth;
    this.state.renderedStartDate = newStartDate;

    // Restore scroll positions pivoted from leftmost visible edge
    if (hadPreviousRender) {
      bodyWrap.scrollLeft = targetScrollLeft;
    } else if (savedScrollLeft > 0) {
      bodyWrap.scrollLeft = savedScrollLeft;
    }
    if (savedScrollTop > 0) bodyWrap.scrollTop = savedScrollTop;
  };

  public mount(): JanttInstance {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (Math.abs(width - this.lastObservedWidth) > 2 || Math.abs(height - this.lastObservedHeight) > 2) {
          this.lastObservedWidth = width;
          this.lastObservedHeight = height;
          if (this.resizeTimer) cancelAnimationFrame(this.resizeTimer);
          this.resizeTimer = requestAnimationFrame(() => {
            this.render();
          });
        }
      });
      this.resizeObserver.observe(this.container);
    }

    if (typeof window !== "undefined") {
      this.todayTimer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
          this.render();
        }
      }, 60000);
    }

    this.render();

    return {
      update: (newData, newOpts) => {
        this.currentData = {
          ...newData,
          tasks: resolveSchedule(newData.tasks || [], newData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS)
        };
        if (newOpts) {
          this.currentOptions = { ...this.currentOptions, ...newOpts };
          this.applyThemeStyles();
          if (newOpts.themeClassName !== undefined || newOpts.className !== undefined) {
            this.root.className = `jantt-container ${this.currentOptions.themeClassName || ""} ${this.currentOptions.className || ""}`.trim();
          }
          if (newOpts.viewport?.dayWidth !== undefined) {
            this.state.currentDayWidth = newOpts.viewport.dayWidth;
            this.state.currentScale = getScaleFromDayWidth(this.state.currentDayWidth);
          } else if (newOpts.viewport?.scale) {
            this.state.currentScale = newOpts.viewport.scale;
            this.state.currentDayWidth = SCALE_DAY_WIDTHS[this.state.currentScale] || 36;
          }
          if (newOpts.viewport?.linkRouting) this.state.currentRouting = newOpts.viewport.linkRouting;
          if (newOpts.viewport?.rowHeight !== undefined) this.state.customRowHeight = newOpts.viewport.rowHeight;
          if (newOpts.viewport?.rowHeightMode !== undefined) this.state.rowHeightMode = newOpts.viewport.rowHeightMode;
          if (newOpts.viewport?.showCriticalPath !== undefined) this.state.showCritical = newOpts.viewport.showCriticalPath;
          if (newOpts.viewport?.showBaselines !== undefined) this.state.showBaselines = newOpts.viewport.showBaselines;
          if (newOpts.viewport?.autoCascade !== undefined) {
            this.controller.setAutoCascade(newOpts.viewport.autoCascade);
          } else if (newOpts.autoCascade !== undefined) {
            this.controller.setAutoCascade(newOpts.autoCascade);
          }
          if (newOpts.showDateFilterBadge !== undefined) {
            this.currentOptions.showDateFilterBadge = newOpts.showDateFilterBadge;
          }
          if (newOpts.filterTasksByDate !== undefined) {
            this.currentOptions.filterTasksByDate = newOpts.filterTasksByDate;
          }
          if (newOpts.selectedDate !== undefined) {
            this.state.selectedDateFilter = newOpts.selectedDate;
          } else if (newOpts.viewport?.selectedDate !== undefined) {
            this.state.selectedDateFilter = newOpts.viewport.selectedDate;
          }
          this.tooltip.updateTheme(this.currentOptions.theme, this.currentOptions.themeClassName);
        }
        this.render();
      },
      destroy: () => {
        const oldToolbar = this.root.querySelector<HTMLElement>(".jantt-toolbar");
        (oldToolbar as any)?.__cleanup?.();
        if (this.resizeTimer) cancelAnimationFrame(this.resizeTimer);
        if (this.todayTimer) clearInterval(this.todayTimer);
        this.resizeObserver?.disconnect();
        this.tooltip.hide();
        this.controller?.destroy();
        this.activeSidebarInstance?.close();
        this.container.innerHTML = "";
      },
      getData: () => this.currentData,
      filterByDate: (dateStr: string | null) => {
        this.state.selectedDateFilter = dateStr;
        this.broadcastViewport();
        this.render();
      },
      getSelectedDate: () => this.state.selectedDateFilter,
      setDayWidth: (w: number) => this.handleDayWidthChange(w),
      getDayWidth: () => this.state.currentDayWidth
    };
  }
}
