import {
  JanttData,
  JanttOptions,
  Task,
  TaskLayout,
  TimeScale,
  LinkRoutingStyle,
  RowHeightMode,
  ViewportOptions,
  CriticalPathResult
} from "../types";
import { layout, computeDependencyPath, getScaleFromDayWidth, SCALE_DAY_WIDTHS } from "../layout";
import { InteractionController } from "../controller";
import { createTaskSidebar } from "../sidebar";
import { resolveSchedule, calculateCriticalPath } from "../resolver";
import { clampDayWidth } from "../utils";
import { diffDays, getTodayISODate, getTodayProgressFraction } from "../date-math";
import {
  DEFAULT_GAP_DAYS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_LABEL_WIDTH,
  MIN_LABEL_WIDTH,
  MAX_LABEL_WIDTH
} from "../constants";
import { applyThemeVariables, themeManager } from "../themes/manager";
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
import { TaskScheduleCoordinator, ScheduleRunOptions } from "./task-schedule-coordinator";

export interface JanttInstance {
  update: (data: JanttData, options?: Partial<JanttOptions>) => void;
  destroy: () => void;
  getData: () => JanttData;
  filterByDate: (dateStr: string | null) => void;
  getSelectedDate: () => string | null;
  setDayWidth: (dayWidth: number) => void;
  getDayWidth: () => number;
}

/** Elements whose keyboard focus survives a re-render (matched by their identifying attribute). */
const FOCUS_RESTORE_ATTRS = ["data-task-id", "data-row-id", "data-date", "data-jantt-splitter"] as const;

/** Canvas descendants that own their pointer gestures (the canvas pan/marquee must not start). */
const CANVAS_OWN_GESTURE_SELECTOR =
  ".jantt-task-bar, .jantt-milestone, .jantt-progress-handle, .jantt-resize-handle, .jantt-link-port, .jantt-dep-hit, .jantt-link-remove-chip";

/** Plans larger than this debounce search re-renders while typing; smaller plans filter instantly. */
const SEARCH_DEBOUNCE_TASK_THRESHOLD = 200;
const SEARCH_DEBOUNCE_MS = 150;

function cssAttrValue(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
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
  private frameRenderId: number | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Aborted on destroy: tears down window-level listeners owned by this chart (e.g. header drags). */
  private readonly lifecycle = new AbortController();
  private destroyed = false;

  /**
   * Persistent scroll body: created once, its content is swapped on each render, and its wheel,
   * canvas-pointer and context-menu listeners are attached once (they read the latest render state).
   */
  private bodyWrap: HTMLElement | null = null;
  /** Task layouts of the latest render (the delegated canvas pan/marquee handler reads them). */
  private lastTaskLayouts: TaskLayout[] = [];
  /** Critical path of the last task array: viewport-only renders (zoom, scroll anchors, search) reuse it. */
  private criticalCache: { tasks: Task[]; gap: number; targetDate: unknown; result: CriticalPathResult } | null = null;
  /** Schedule warnings last seen per source, so persistent problems are reported to onError once. */
  private seenDiagnostics: Record<"load" | "edit", Set<string>> = { load: new Set(), edit: new Set() };

  /** Latest rendered geometry, used by out-of-render updates (link preview, today line). */
  private lastRowHeight = DEFAULT_ROW_HEIGHT;
  private lastLayoutDayWidth = 0;
  private renderedToday = "";
  /** A Ctrl/Cmd+wheel zoom anchor is pending: the next render consumes and clears it. */
  private wheelZoomAnchored = false;

  constructor(container: HTMLElement, initialData: JanttData, options: JanttOptions = {}) {
    this.container = container;
    this.currentOptions = { ...options };
    this.currentData = { ...initialData, tasks: this.resolveTasks(initialData) };

    const initialScale: TimeScale = this.currentOptions.viewport?.scale || this.currentData.meta?.scale || "day";
    const initialDayWidth: number = clampDayWidth(
      this.currentOptions.viewport?.dayWidth || SCALE_DAY_WIDTHS[initialScale] || 36
    );
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
      currentScale: getScaleFromDayWidth(initialDayWidth),
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
      dragAnchorStartDate: "",
      dragAnchorOffsetPx: 0
    };
    this.lastRowHeight = initialCustomRowHeight;

    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = `jantt-container ${this.currentOptions.themeClassName || ""} ${this.currentOptions.className || ""}`.trim();
    this.container.appendChild(this.root);

    this.applyThemeStyles();

    // Body-mounted hover cards receive the resolved theme tokens, so they always match the chart.
    this.tooltip = createTooltipController({
      theme: this.resolveThemeVars(),
      themeClassName: this.currentOptions.themeClassName
    });
  }

  /**
   * Theme tokens for this chart: the registered theme matching `themeClassName` (so a class name
   * alone fully themes the chart and its popups), overridden by any explicit `theme` tokens.
   */
  private resolveThemeVars(): Record<string, string> | undefined {
    const registered = themeManager.getThemeByClassName(this.currentOptions.themeClassName)?.vars;
    const explicit = this.currentOptions.theme;
    return registered && explicit ? { ...registered, ...explicit } : explicit ?? registered;
  }

  private applyThemeStyles() {
    applyThemeVariables(this.root, this.resolveThemeVars());
  }

  /** Delivers an error to the host's `onError`; returns false when no handler is registered. */
  private notifyError(error: unknown): boolean {
    const handler = this.currentOptions.onError;
    if (!handler) return false;
    try {
      handler(error instanceof Error ? error : new Error(String(error)));
    } catch (handlerError) {
      // intentionally ignored by the chart: a failing host handler must not break rendering
      console.error("[Jantt] onError handler threw:", handlerError);
    }
    return true;
  }

  /**
   * Reports schedule warnings (cycles, duplicate ids, locked-task conflicts, repaired dates) through
   * `onError`. Only warnings not already seen from either source are reported, so a persistent
   * problem is announced once instead of on every re-render or host echo of the same plan.
   */
  private reportDiagnostics(source: "load" | "edit", messages: string[]) {
    const { load, edit } = this.seenDiagnostics;
    const fresh = messages.filter((m) => !load.has(m) && !edit.has(m));
    this.seenDiagnostics[source] = new Set(messages);
    if (fresh.length === 0) return;
    this.notifyError(new Error(fresh.length === 1 ? fresh[0] : `${fresh.length} schedule warnings:\n${fresh.join("\n")}`));
  }

  /** Cascades a plan's tasks with its gap and working calendars (the canonical load-time resolve). */
  private resolveTasks(data: JanttData): Task[] {
    const diagnostics: string[] = [];
    const tasks = resolveSchedule(data.tasks || [], { ...TaskScheduleCoordinator.scheduleOptions(data), diagnostics });
    this.reportDiagnostics("load", diagnostics);
    return tasks;
  }

  /** Critical path of the current tasks with the plan's gap and deadline; memoized per task array. */
  private criticalPathFor(data: JanttData): CriticalPathResult {
    const gap = data.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
    const targetDate = data.meta?.targetDate;
    const cached = this.criticalCache;
    if (cached && cached.tasks === data.tasks && cached.gap === gap && cached.targetDate === targetDate) {
      return cached.result;
    }
    const result = calculateCriticalPath(data.tasks, { defaultGapDays: gap, targetDate });
    this.criticalCache = { tasks: data.tasks, gap, targetDate, result };
    return result;
  }

  private isAutoCascade(): boolean {
    return this.controller
      ? this.controller.isAutoCascade()
      : (this.currentOptions.viewport?.autoCascade ?? this.currentOptions.autoCascade ?? (this.currentData.meta?.autoCascade ?? true));
  }

  private broadcastViewport() {
    ViewportCoordinator.broadcastChange(this.currentOptions, this.state, this.state.customRowHeight, this.isAutoCascade());
  }

  /**
   * Hands the host a fresh plan container. The controller later replaces `tasks` on the engine's
   * own container (copy-on-write), which must never rewrite a payload the host already holds
   * (e.g. an undo-history entry).
   */
  private emitCommit() {
    this.currentOptions.onCommit?.({ ...this.currentData });
  }

  /** Run options for a coordinator edit: the chart's live Auto-Cascade flag and a warnings sink. */
  private editRun(): ScheduleRunOptions & { diagnostics: string[] } {
    return { autoCascade: this.isAutoCascade(), diagnostics: [] };
  }

  /** Adopts the result of a coordinator edit and re-renders; returns false when nothing changed. */
  private applyEdit(next: JanttData, run: { diagnostics: string[] }): boolean {
    this.reportDiagnostics("edit", run.diagnostics);
    if (next === this.currentData) return false;
    this.currentData = next;
    this.render();
    return true;
  }

  /**
   * Pins the date under `clientX` (or the left edge of the visible timeline when omitted) so
   * zoom renders keep it at the same screen position until the anchor is cleared.
   */
  private setZoomAnchor(clientX?: number) {
    const wrap = this.bodyWrap;
    if (!wrap || this.state.renderedDayWidth <= 0 || !this.state.renderedStartDate) return;
    const area = wrap.querySelector<HTMLElement>(".jantt-timeline-area");
    // Pointer offset from the visible timeline's left edge (right of the sticky task table)
    const offsetPx =
      clientX !== undefined && area ? Math.max(0, clientX - area.getBoundingClientRect().left - wrap.scrollLeft) : 0;
    this.state.dragAnchorLeftmostDays = (wrap.scrollLeft + offsetPx) / this.state.renderedDayWidth;
    this.state.dragAnchorOffsetPx = offsetPx;
    this.state.dragAnchorStartDate = this.state.renderedStartDate;
  }

  private clearZoomAnchor() {
    this.state.dragAnchorLeftmostDays = null;
    this.state.dragAnchorStartDate = "";
    this.state.dragAnchorOffsetPx = 0;
  }

  /** Renders once on the next animation frame (high-frequency input such as wheel zoom). */
  private scheduleFrameRender() {
    if (this.frameRenderId !== null || this.destroyed) return;
    this.frameRenderId = requestAnimationFrame(() => {
      this.frameRenderId = null;
      this.render();
    });
  }

  /** Applies a new day width to the viewport state; returns false when nothing changed. */
  private applyDayWidth(newWidth: number): boolean {
    const clamped = clampDayWidth(newWidth);
    if (!Number.isFinite(clamped) || clamped === this.state.currentDayWidth) return false;

    this.state.currentDayWidth = clamped;
    this.state.currentScale = getScaleFromDayWidth(clamped);
    this.currentOptions.onDayWidthChange?.(clamped);
    this.broadcastViewport();
    return true;
  }

  private handleDayWidthChange = (newWidth: number) => {
    if (this.applyDayWidth(newWidth)) this.render();
  };

  /** Keyboard resize of the task table (splitter arrows); the drag gesture uses the controller. */
  private handleLabelWidthChange = (width: number) => {
    const next = Math.round(Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, width)));
    if (!Number.isFinite(next) || next === this.state.labelWidth) return;
    this.state.labelWidth = next;
    this.render();
    this.broadcastViewport();
  };

  /**
   * Ctrl + Wheel / Cmd + Wheel zoom anchored at the pointer (the date under it stays put). The
   * factor follows the wheel delta (smooth for trackpad pinch, ~25% per mouse notch) and the chart
   * renders once per frame.
   */
  private handleWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const deltaPx = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const zoomFactor = Math.min(2, Math.max(0.5, Math.exp(-deltaPx * 0.0025)));
    // Anchor before applying: a host that re-renders synchronously from onDayWidthChange
    // consumes the anchor in that render instead.
    const anchorNow = !this.wheelZoomAnchored && this.state.dragAnchorLeftmostDays === null;
    if (anchorNow) {
      this.setZoomAnchor(e.clientX);
      this.wheelZoomAnchored = true;
    }
    if (this.applyDayWidth(this.state.currentDayWidth * zoomFactor)) {
      this.scheduleFrameRender();
    } else if (anchorNow) {
      this.wheelZoomAnchored = false;
      this.clearZoomAnchor();
    }
  };

  /** Canvas background press: drag to pan, Shift/Ctrl/Cmd drag for marquee selection. */
  private handleCanvasPointerDown = (e: PointerEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const canvas = target?.closest<HTMLElement>(".jantt-grid-container");
    if (!target || !canvas || target.closest(CANVAS_OWN_GESTURE_SELECTOR)) return;
    this.controller.startCanvasDrag(e, canvas, this.lastTaskLayouts);
  };

  private ensureBodyWrap(): HTMLElement {
    if (this.bodyWrap && this.bodyWrap.parentElement === this.root) return this.bodyWrap;
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    bodyWrap.addEventListener("wheel", this.handleWheel, { passive: false });
    bodyWrap.addEventListener("pointerdown", this.handleCanvasPointerDown);
    bodyWrap.addEventListener("contextmenu", (e) => {
      if (e.target instanceof Element && e.target.closest(".jantt-grid-container")) e.preventDefault();
    });
    this.root.appendChild(bodyWrap);
    this.bodyWrap = bodyWrap;
    return bodyWrap;
  }

  private openTaskSidebar = (task: Task) => {
    this.tooltip.hide();
    this.activeSidebarInstance?.close();

    let customContainer: HTMLElement | undefined;
    if (typeof this.currentOptions.sidebarContainer === "string") {
      customContainer = document.querySelector<HTMLElement>(this.currentOptions.sidebarContainer) || undefined;
    } else if (this.currentOptions.sidebarContainer instanceof HTMLElement) {
      customContainer = this.currentOptions.sidebarContainer;
    }

    let inst: ReturnType<typeof createTaskSidebar>;
    inst = createTaskSidebar({
      task,
      allTasks: this.currentData.tasks,
      categories: this.currentData.categories || {},
      container: customContainer,
      theme: this.resolveThemeVars(),
      themeClassName: this.currentOptions.themeClassName,
      readOnly: this.currentOptions.readOnly,
      // Same gap and working calendars as the cascade, so conflict hints match the drawn schedule
      scheduleOptions: TaskScheduleCoordinator.scheduleOptions(this.currentData),
      customRenderer: this.currentOptions.renderDetail,
      onError: (error) => {
        this.notifyError(error);
      },
      onClose: () => {
        if (this.activeSidebarInstance === inst) {
          this.activeSidebarInstance = null;
        }
      },
      onSave: (updatedTask) => {
        if (this.currentOptions.readOnly) return;
        const run = this.editRun();
        if (this.applyEdit(TaskScheduleCoordinator.updateTask(this.currentData, updatedTask, run), run)) {
          this.emitCommit();
        }
      },
      onDelete: (taskId) => {
        if (this.currentOptions.readOnly) return;
        const run = this.editRun();
        if (!this.applyEdit(TaskScheduleCoordinator.deleteTask(this.currentData, taskId, run), run)) return;
        this.currentOptions.onTaskDelete?.(taskId);
        this.emitCommit();
      }
    });
    this.activeSidebarInstance = inst;
  };

  private handleAddTask = () => {
    if (this.currentOptions.readOnly) return;
    const run = this.editRun();
    const { nextData, newTask } = TaskScheduleCoordinator.createTask(this.currentData, run);
    this.applyEdit(nextData, run);
    this.openTaskSidebar(newTask);
    this.currentOptions.onTaskAdd?.(newTask);
    this.emitCommit();
  };

  private handleLinkDelete = (fromId: string, toId: string) => {
    if (this.currentOptions.readOnly) return;
    const run = this.editRun();
    if (!this.applyEdit(TaskScheduleCoordinator.removeDependency(this.currentData, fromId, toId, run), run)) return;
    this.currentOptions.onLinkDelete?.(fromId, toId);
    this.emitCommit();
  };

  /** Moves the today guide line/pin to the current time; full re-render only when the date rolls over. */
  private tickToday() {
    if (this.destroyed) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const fixedTime = this.currentOptions.viewport?.currentTime;
    if (fixedTime) return; // A pinned clock never moves
    const now = new Date();
    if (getTodayISODate(now) !== this.renderedToday) {
      this.render();
      return;
    }
    if (!this.state.renderedStartDate || this.lastLayoutDayWidth <= 0) return;
    const dayOffset = diffDays(this.state.renderedStartDate, this.renderedToday) + getTodayProgressFraction(now);
    const left = `${Math.round(dayOffset * this.lastLayoutDayWidth * 10) / 10}px`;
    this.root.querySelectorAll<HTMLElement>(".jantt-today-line, .jantt-header-today-marker").forEach((el) => {
      el.style.left = left;
    });
  }

  private captureFocus(): { attr: string; value: string; el: HTMLElement } | null {
    if (typeof document === "undefined") return null;
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || !this.root.contains(active)) return null;
    for (const attr of FOCUS_RESTORE_ATTRS) {
      const el = active.closest<HTMLElement>(`[${attr}]`);
      if (el && this.root.contains(el)) return { attr, value: el.getAttribute(attr) || "", el };
    }
    return null;
  }

  private restoreFocus(target: { attr: string; value: string; el: HTMLElement } | null) {
    if (!target || target.el.isConnected) return;
    const next = this.root.querySelector<HTMLElement>(`[${target.attr}="${cssAttrValue(target.value)}"]`);
    if (!next) return;
    if (target.attr === "data-date") {
      // Keep the header a single (roving) tab stop on the date the user was on
      this.root.querySelectorAll<HTMLElement>('.jantt-day-cell[tabindex="0"]').forEach((cell) => {
        cell.tabIndex = -1;
      });
      next.tabIndex = 0;
    }
    next.focus({ preventScroll: true });
  }

  private buildToolbarProps(taskCount: number, criticalCount: number, rowHeight: number): ToolbarProps {
    return {
      meta: this.currentData.meta,
      taskCount,
      currentScale: this.state.currentScale,
      currentRouting: this.state.currentRouting,
      rowHeightMode: this.state.rowHeightMode,
      rowHeight,
      showCritical: this.state.showCritical,
      showBaselines: this.state.showBaselines,
      criticalCount,
      searchQuery: this.state.filterQuery,
      autoCascade: this.isAutoCascade(),
      readOnly: this.currentOptions.readOnly,
      dayWidth: this.state.currentDayWidth,
      isSettingsOpen: this.isSettingsOpen,
      onSettingsOpenChange: (open: boolean) => {
        this.isSettingsOpen = open;
      },
      onDayWidthChange: this.handleDayWidthChange,
      onScaleChange: (s: TimeScale) => {
        this.state.currentDayWidth = SCALE_DAY_WIDTHS[s] || 36;
        this.state.currentScale = getScaleFromDayWidth(this.state.currentDayWidth);
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
        if (this.currentOptions.readOnly) return;
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
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = null;
        if (this.currentData.tasks.length > SEARCH_DEBOUNCE_TASK_THRESHOLD) {
          this.searchTimer = setTimeout(() => {
            this.searchTimer = null;
            this.render();
          }, SEARCH_DEBOUNCE_MS);
        } else {
          this.render();
        }
      },
      onAddTask: this.currentOptions.readOnly ? undefined : this.handleAddTask,
      onOpenAutoSave: this.currentOptions.onOpenAutoSave,
      onImportJson: this.currentOptions.onImportJson,
      onExportJson: this.currentOptions.onExportJson,
      onExportCsv: this.currentOptions.onExportCsv
    };
  }

  /**
   * Re-renders the chart. Never throws to the host when `onError` is registered: a failed render
   * (renders also run from animation frames, the ResizeObserver and timers, which no host wrapper
   * covers) is reported there and the previous chart body stays on screen.
   */
  public render = () => {
    if (this.destroyed) return;
    try {
      this.renderFrame();
    } catch (error) {
      if (!this.notifyError(error)) throw error;
    }
  };

  private renderFrame() {
    // Cards anchored to bars that are about to be replaced would otherwise stay stuck on screen
    this.tooltip.hide();
    const focusTarget = this.captureFocus();

    // 0. Capture scroll positions before re-render
    const prevScrollWrap = this.bodyWrap?.parentElement === this.root ? this.bodyWrap : null;
    const savedScrollLeft = prevScrollWrap ? prevScrollWrap.scrollLeft : 0;
    const savedScrollTop = prevScrollWrap ? prevScrollWrap.scrollTop : 0;
    const hadPreviousRender =
      prevScrollWrap !== null && this.state.renderedStartDate !== "" && this.state.renderedDayWidth > 0;

    // 1. Master critical path across the complete schedule graph (reused while tasks are unchanged)
    const masterCriticalResult = this.criticalPathFor(this.currentData);
    const criticalCount = masterCriticalResult.criticalTaskIds.size;
    this.root.classList.toggle("jantt-show-critical", this.state.showCritical);

    // 2. Filter tasks for display
    const displayTasks = ViewportCoordinator.filterDisplayTasks(
      this.currentData.tasks,
      this.state.filterQuery,
      this.state.selectedDateFilter,
      this.currentOptions
    );

    // 3. Toolbar is mounted first so fit sizing measures its real (possibly wrapped) height
    let toolbar = this.root.querySelector<HTMLElement>(".jantt-toolbar");
    if (!toolbar || toolbar.parentElement !== this.root) {
      toolbar = renderToolbar(this.buildToolbarProps(displayTasks.length, criticalCount, this.lastRowHeight));
      this.root.prepend(toolbar);
    }

    // 4. Dynamic Row Height Calculation & Coordinate Layout
    const layoutData: JanttData = { ...this.currentData, tasks: displayTasks };
    const layoutOptions: ViewportOptions = {
      ...this.currentOptions.viewport,
      scale: this.state.currentScale,
      dayWidth: this.state.currentDayWidth,
      linkRouting: this.state.currentRouting,
      rowHeightMode: this.state.rowHeightMode,
      showCriticalPath: this.state.showCritical,
      showBaselines: this.state.showBaselines,
      labelWidth: this.state.labelWidth,
      selectedDate: this.state.selectedDateFilter,
      criticalResult: masterCriticalResult
    };
    const effectiveRowHeight = ViewportCoordinator.calculateRowHeight(
      this.container,
      this.root,
      layoutData,
      layoutOptions,
      this.state.rowHeightMode,
      this.state.customRowHeight,
      this.currentOptions.readOnly
    );
    const layoutResult = layout(layoutData, { ...layoutOptions, rowHeight: effectiveRowHeight });

    const { tasks: taskLayouts, dependencies, header, viewport, canvasWidth, canvasHeight } = layoutResult;
    const newStartDate = layoutResult.viewport.startDate;
    this.lastRowHeight = viewport.rowHeight;

    const targetScrollLeft = ViewportCoordinator.calculateScrollTarget(
      savedScrollLeft,
      hadPreviousRender,
      newStartDate,
      this.state.currentDayWidth,
      this.state
    );
    if (this.wheelZoomAnchored) {
      this.wheelZoomAnchored = false;
      this.clearZoomAnchor();
    }

    // 5. Controller State Machine Setup (the controller replaces this.currentData.tasks copy-on-write)
    if (!this.controller) {
      this.controller = new InteractionController(
        this.currentData,
        this.currentOptions,
        viewport.dayWidth,
        this.render,
        this.openTaskSidebar,
        (wire) => {
          const wireEl = this.previewWireSvg;
          if (!wireEl) return;
          if (!wire) {
            wireEl.setAttribute("d", "");
            return;
          }
          // Wire coordinates are canvas-relative; route with the latest rendered row height
          const pathStr = computeDependencyPath(
            wire.fromX,
            wire.fromY,
            wire.toX,
            wire.toY,
            this.lastRowHeight,
            this.state.currentRouting
          );
          wireEl.setAttribute("d", pathStr);
        },
        (newW, isFinal) => {
          this.state.labelWidth = newW;
          this.render();
          // Persist the final width (onViewportChange) once the drag ends, not on every frame
          if (isFinal) this.broadcastViewport();
        },
        this.root
      );
    } else {
      this.controller.updateData(this.currentData, viewport.dayWidth, this.currentOptions, this.root);
    }

    // 6. Update Toolbar Subsystem in-place
    updateToolbar(toolbar, this.buildToolbarProps(displayTasks.length, criticalCount, effectiveRowHeight));

    // 7. Right Timeline Area Container
    const timelineArea = document.createElement("div");
    timelineArea.className = "jantt-timeline-area";
    timelineArea.style.width = `${canvasWidth}px`;
    timelineArea.style.minWidth = `${canvasWidth}px`;

    // 7a. Timeline Header
    const timelineHeader = renderTimelineHeader(header, {
      selectedDate: this.state.selectedDateFilter,
      dayWidth: this.state.currentDayWidth,
      showToday: viewport.showToday,
      showTodayTag: viewport.showTodayTag,
      signal: this.lifecycle.signal,
      onColumnResize: (w) => this.handleDayWidthChange(w),
      // The grabbed date stays under the pointer for the whole drag session
      onColumnResizeStart: (clientX) => {
        this.wheelZoomAnchored = false; // the drag session owns the anchor until it ends
        this.setZoomAnchor(clientX);
      },
      onColumnResizeEnd: () => this.clearZoomAnchor(),
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

    // 7b. Canvas Body Container: an isolated stacking context (see .jantt-grid-container), so bars,
    // critical-path styling, links and the marquee can never paint over the sticky header or table.
    const hasAddRow = !this.currentOptions.readOnly;
    const addRowHeight = hasAddRow ? Math.min(viewport.rowHeight, 38) : 0;
    const totalCanvasHeight = canvasHeight + addRowHeight;

    const gridContainer = document.createElement("div");
    gridContainer.className = "jantt-grid-container";
    gridContainer.style.position = "relative";
    gridContainer.style.width = `${canvasWidth}px`;
    gridContainer.style.height = `${totalCanvasHeight}px`;

    // 8. Render Sticky Data Grid Table (the splitter lives inside the sticky column)
    const { labelCol } = renderGridTable({
      taskLayouts,
      labelWidth: this.state.labelWidth,
      headerHeight: header.totalHeight,
      rowHeight: viewport.rowHeight,
      gridContainer,
      controller: this.controller,
      showCritical: this.state.showCritical,
      people: this.currentData.people,
      teams: this.currentData.teams,
      onTaskClick: (task: Task) => {
        this.currentOptions.onTaskClick?.(task);
        this.openTaskSidebar(task);
      },
      onAddTask: this.currentOptions.readOnly ? undefined : this.handleAddTask,
      onLabelWidthChange: this.handleLabelWidthChange
    });

    // 9. Render Timeline Grid Lines & Today Line
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

    // 10. Render SVG Dependency Connectors & Preview Wire (links are not editable in read-only mode)
    const { svg, previewWireSvg: pWire, depPathElements } = renderDependencyLinks({
      dependencies,
      canvasWidth,
      canvasHeight,
      showCritical: this.state.showCritical,
      onLinkDelete: this.currentOptions.readOnly ? undefined : this.handleLinkDelete,
      taskLabels: this.currentOptions.readOnly
        ? undefined
        : new Map(taskLayouts.map((t) => [t.task.id, t.displayLabel]))
    });
    this.previewWireSvg = pWire;
    gridContainer.appendChild(svg);

    // 11. Render Task Bars, Milestones, and Progress Handles
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
    timelineArea.appendChild(gridContainer);

    // 12. Swap the new body in only once it is fully built (a failed render keeps the previous one)
    const bodyWrap = this.ensureBodyWrap();
    bodyWrap.replaceChildren(labelCol, timelineArea);
    this.lastTaskLayouts = taskLayouts;

    this.state.renderedDayWidth = this.state.currentDayWidth;
    this.state.renderedStartDate = newStartDate;
    this.lastLayoutDayWidth = viewport.dayWidth;
    this.renderedToday = getTodayISODate(viewport.currentTime);

    // Restore scroll positions pivoted from leftmost visible edge
    if (hadPreviousRender) {
      bodyWrap.scrollLeft = targetScrollLeft;
    } else if (savedScrollLeft > 0) {
      bodyWrap.scrollLeft = savedScrollLeft;
    }
    if (savedScrollTop > 0) bodyWrap.scrollTop = savedScrollTop;

    // Keyboard users keep their place: re-focus the replacement of the bar/row/date they were on
    this.restoreFocus(focusTarget);
  }

  /** Releases every timer, observer, listener and DOM node owned by the chart (idempotent). */
  private teardown() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lifecycle.abort();
    const oldToolbar = this.root.querySelector<HTMLElement>(".jantt-toolbar");
    (oldToolbar as any)?.__cleanup?.();
    if (this.resizeTimer) cancelAnimationFrame(this.resizeTimer);
    if (this.frameRenderId !== null) cancelAnimationFrame(this.frameRenderId);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.todayTimer) clearInterval(this.todayTimer);
    this.resizeObserver?.disconnect();
    this.tooltip.hide();
    this.controller?.destroy();
    this.activeSidebarInstance?.close();
    this.container.innerHTML = "";
  }

  public mount(): JanttInstance {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || this.destroyed) return;
        const { width, height } = entry.contentRect;
        if (Math.abs(width - this.lastObservedWidth) > 2 || Math.abs(height - this.lastObservedHeight) > 2) {
          this.lastObservedWidth = width;
          this.lastObservedHeight = height;
          if (this.resizeTimer) cancelAnimationFrame(this.resizeTimer);
          this.resizeTimer = requestAnimationFrame(() => {
            this.resizeTimer = null;
            this.render();
          });
        }
      });
      this.resizeObserver.observe(this.container);
    }

    if (typeof window !== "undefined") {
      this.todayTimer = setInterval(() => this.tickToday(), 60000);
    }

    try {
      this.render();
    } catch (error) {
      // The caller never receives an instance to destroy, so nothing may outlive a failed mount
      this.teardown();
      throw error;
    }

    return {
      update: (newData, newOpts) => {
        if (this.destroyed) return;
        if (newOpts) {
          // Options first: the resolve below reports its warnings to the latest onError
          this.currentOptions = { ...this.currentOptions, ...newOpts };
        }
        this.currentData = { ...newData, tasks: this.resolveTasks(newData) };
        if (newOpts) {
          if (newOpts.themeClassName !== undefined || newOpts.className !== undefined) {
            this.root.className = `jantt-container ${this.currentOptions.themeClassName || ""} ${this.currentOptions.className || ""}`.trim();
          }
          this.applyThemeStyles();
          if (newOpts.viewport?.dayWidth !== undefined) {
            this.state.currentDayWidth = clampDayWidth(newOpts.viewport.dayWidth);
            this.state.currentScale = getScaleFromDayWidth(this.state.currentDayWidth);
          } else if (newOpts.viewport?.scale) {
            this.state.currentDayWidth = SCALE_DAY_WIDTHS[newOpts.viewport.scale] || 36;
            this.state.currentScale = getScaleFromDayWidth(this.state.currentDayWidth);
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
          this.tooltip.updateTheme(this.resolveThemeVars(), this.currentOptions.themeClassName);
        }
        this.render();
      },
      destroy: () => this.teardown(),
      getData: () => this.currentData,
      filterByDate: (dateStr: string | null) => {
        if (this.destroyed) return;
        this.state.selectedDateFilter = dateStr;
        this.broadcastViewport();
        this.render();
      },
      getSelectedDate: () => this.state.selectedDateFilter,
      setDayWidth: (w: number) => {
        if (this.destroyed) return;
        this.handleDayWidthChange(w);
      },
      getDayWidth: () => this.state.currentDayWidth
    };
  }
}

/**
 * Mounts an interactive Jantt chart into the given DOM container.
 *
 * @param container The host HTMLElement where the chart will be mounted
 * @param initialData The initial Jantt plan specification
 * @param options Optional configuration parameters and lifecycle hooks
 * @returns A JanttInstance for programmatic updates and state inspection
 */
export function renderJantt(container: HTMLElement, initialData: JanttData, options: JanttOptions = {}): JanttInstance {
  return new JanttRendererEngine(container, initialData, options).mount();
}
