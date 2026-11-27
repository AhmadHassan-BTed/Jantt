import {
  JanttData,
  JanttOptions,
  Task,
  TaskLayout,
  TimeScale,
  TimeFormat,
  LinkRoutingStyle,
  RowHeightMode,
  ViewportOptions,
  CriticalPathResult,
  JanttLayoutResult
} from "../types";
import { layout, buildSubTicks, getSubDayTickStepMinutes, computeChartBounds, computeDependencyPath, getScaleFromDayWidth, SCALE_DAY_WIDTHS } from "../layout";
import { InteractionController } from "../controller";
import { createTaskSidebar } from "../sidebar";
import { resolveSchedule, calculateCriticalPath } from "../resolver";
import { clampDayWidth, isTaskDone } from "../utils";
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
  setDayWidth: (dayWidth: number, anchorClientX?: number) => void;
  getDayWidth: () => number;
  scrollToToday: () => void;
  getScrollPosition: () => { scrollLeft: number; scrollTop: number };
  setScrollPosition: (scrollLeft: number, scrollTop: number) => void;
}

/** Elements whose keyboard focus survives a re-render (matched by their identifying attribute). */
const FOCUS_RESTORE_ATTRS = ["data-task-id", "data-row-id", "data-date", "data-jantt-splitter"] as const;

/** Canvas descendants that own their pointer gestures (the canvas pan/marquee must not start). */
const CANVAS_OWN_GESTURE_SELECTOR =
  ".jantt-task-bar, .jantt-milestone, .jantt-milestone-label, .jantt-bar-outside-label, .jantt-progress-handle, .jantt-resize-handle, .jantt-link-port, .jantt-dep-hit, .jantt-link-remove-chip";

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
  private lastInputData: JanttData;
  private lastInputSnapshot: string;
  private lastResolvedSnapshot: string;
  private currentOptions: JanttOptions;

  private state: ViewportCoordinationState;
  private isSettingsOpen = false;

  private tooltip: ReturnType<typeof createTooltipController>;
  private controller!: InteractionController;
  private previewWireSvg: SVGPathElement | null = null;
  private activeSidebarInstance: { close: () => void } | null = null;
  private lastLabelTaskTap: { id: string; time: number } | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private lastObservedWidth = 0;
  private lastObservedHeight = 0;
  private resizeTimer: number | null = null;
  private todayTimer: ReturnType<typeof setInterval> | null = null;
  private frameRenderId: number | null = null;
  private wheelSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private windowFrameId: number | null = null;
  private timelineAreaEl: HTMLElement | null = null;
  private gridContainerEl: HTMLElement | null = null;
  private labelColumnEl: HTMLElement | null = null;
  private labelSignature: unknown[] = [];
  private structureSignature: unknown[] = [];
  private lastLayoutResult: JanttLayoutResult | null = null;
  private barNodes: ReturnType<typeof renderTaskBars>["barNodes"] = new Map();
  private readonly depPathElements = new Map<string, SVGPathElement>();
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
  private criticalCache: { tasks: Task[]; gap: number; targetDate: unknown; calendar: unknown; useWorkingDays: unknown; calendars: unknown; people: unknown; result: CriticalPathResult } | null = null;
  /** Schedule warnings last seen per source, so persistent problems are reported to onError once. */
  private seenDiagnostics: Record<"load" | "edit", Set<string>> = { load: new Set(), edit: new Set() };

  /** Latest rendered geometry, used by out-of-render updates (link preview, today line). */
  private lastRowHeight = DEFAULT_ROW_HEIGHT;
  private lastLayoutDayWidth = 0;
  private renderedToday = "";
  /** A Ctrl/Cmd+wheel zoom anchor is pending: the next render consumes and clears it. */
  private wheelZoomAnchored = false;
  /** True while dragging a timeline header column/handle: defers host viewport broadcasts until release. */
  private isColumnDragging = false;
  /** Rendered pixel window for sub-day ticks (triggers lightweight panning updates near edges). */
  private renderedSubTickWindow: { startX: number; endX: number; totalWidth: number; scale: TimeScale } | null = null;

  constructor(container: HTMLElement, initialData: JanttData, options: JanttOptions = {}) {
    this.container = container;
    this.currentOptions = { ...options };
    this.lastInputData = initialData;
    this.lastInputSnapshot = JSON.stringify(initialData);
    this.currentData = { ...initialData, tasks: this.resolveTasks(initialData) };
    this.lastResolvedSnapshot = JSON.stringify(this.currentData);

    const initialScale: TimeScale = this.currentOptions.viewport?.scale || this.currentData.meta?.scale || "day";
    const initialDayWidth: number = clampDayWidth(
      this.currentOptions.viewport?.dayWidth || SCALE_DAY_WIDTHS[initialScale] || 36
    );
    const initialTimeFormat: TimeFormat =
      (this.currentOptions.viewport?.timeFormat || this.currentData.meta?.timeFormat) === "24h" ? "24h" : "12h";
    const initialRouting: LinkRoutingStyle =
      this.currentOptions.viewport?.linkRouting || this.currentData.meta?.linkRouting || "orthogonal";
    const initialRowHeightMode: RowHeightMode = this.currentOptions.viewport?.rowHeightMode || "fit";
    const initialCustomRowHeight: number = this.currentOptions.viewport?.rowHeight || DEFAULT_ROW_HEIGHT;
    const initialShowCritical =
      this.currentOptions.viewport?.showCriticalPath ?? (this.currentData.meta?.showCriticalPath ?? false);
    const initialShowBaselines =
      this.currentOptions.viewport?.showBaselines ?? (this.currentData.meta?.showBaselines ?? false);
    const initialLabelWidth = this.currentOptions.viewport?.labelWidth || DEFAULT_LABEL_WIDTH;
    const initialFilterQuery = this.currentOptions.searchQuery || "";
    const initialSelectedDate: string | null =
      this.currentOptions.selectedDate ?? this.currentOptions.viewport?.selectedDate ?? null;

    this.state = {
      currentScale: getScaleFromDayWidth(initialDayWidth),
      currentDayWidth: initialDayWidth,
      timeFormat: initialTimeFormat,
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
      themeClassName: this.currentOptions.themeClassName,
      timeFormat: this.state.timeFormat
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
    const calendar = data.meta?.calendar;
    const useWorkingDays = data.meta?.useWorkingDays;
    const { calendars, people } = data;
    const cached = this.criticalCache;
    if (cached && cached.tasks === data.tasks && cached.gap === gap && cached.targetDate === targetDate &&
      cached.calendar === calendar && cached.useWorkingDays === useWorkingDays && cached.calendars === calendars && cached.people === people) {
      return cached.result;
    }
    const result = calculateCriticalPath(data.tasks, { defaultGapDays: gap, targetDate, calendar, useWorkingDays, calendars, people });
    this.criticalCache = { tasks: data.tasks, gap, targetDate, calendar, useWorkingDays, calendars, people, result };
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
  private applyDayWidth(newWidth: number, emitHost = true): boolean {
    const clamped = clampDayWidth(newWidth);
    if (!Number.isFinite(clamped) || clamped === this.state.currentDayWidth) return false;

    this.state.currentDayWidth = clamped;
    this.state.currentScale = getScaleFromDayWidth(clamped);
    if (emitHost) {
      this.currentOptions.onDayWidthChange?.(clamped);
      this.broadcastViewport();
    }
    return true;
  }

  private handleDayWidthChange = (newWidth: number) => {
    if (this.applyDayWidth(newWidth, true)) this.render();
  };

  /** Fast path during active header column drag: repaints directly without triggering host re-renders per frame. */
  private handleColumnDragResize = (newWidth: number) => {
    if (this.applyDayWidth(newWidth, false)) this.render();
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
    // Anchor before applying so all wheel events in this frame share the same date.
    const anchorNow = !this.wheelZoomAnchored && this.state.dragAnchorLeftmostDays === null;
    if (anchorNow) {
      this.setZoomAnchor(e.clientX);
      this.wheelZoomAnchored = true;
    }
    if (this.applyDayWidth(this.state.currentDayWidth * zoomFactor, false)) {
      this.root.classList.add("is-zooming");
      if (this.wheelSettleTimer !== null) clearTimeout(this.wheelSettleTimer);
      this.wheelSettleTimer = setTimeout(() => {
        this.wheelSettleTimer = null;
        if (this.isColumnDragging) return;
        this.root.classList.remove("is-zooming");
        this.currentOptions.onDayWidthChange?.(this.state.currentDayWidth);
        this.broadcastViewport();
      }, 140);
      this.scheduleFrameRender();
    } else if (anchorNow) {
      this.wheelZoomAnchored = false;
      this.clearZoomAnchor();
    }
  };

  /** Canvas background press: drag to pan, Shift/Ctrl/Cmd drag for marquee selection. */
  private handleCanvasPointerDown = (e: PointerEvent) => {
    const wrap = this.bodyWrap;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      const hasHScroll = wrap.scrollWidth > wrap.clientWidth;
      const hasVScroll = wrap.scrollHeight > wrap.clientHeight;
      // Never hijack native scrollbar drags (or slight misses right along the bottom/right scrollbar lip)
      // into inverted canvas panning.
      if (hasHScroll && e.clientY >= rect.top + wrap.clientHeight - 6) return;
      if (hasVScroll && e.clientX >= rect.left + wrap.clientWidth - 4) return;
    }
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
    bodyWrap.addEventListener(
      "scroll",
      () => {
        if (this.destroyed || !this.renderedSubTickWindow) return;
        const win = this.renderedSubTickWindow;
        const left = bodyWrap.scrollLeft;
        const labelColW = this.currentOptions.hideLabelColumn ? 0 : this.state.labelWidth;
        const visibleW = Math.max(bodyWrap.clientWidth - labelColW, 300);
        const right = left + visibleW;
        const margin = 450;
        if (
          (left < win.startX + margin && win.startX > 2) ||
          (right > win.endX - margin && win.endX < win.totalWidth - 2)
        ) {
          if (this.windowFrameId !== null) return;
          this.windowFrameId = requestAnimationFrame(() => {
            this.windowFrameId = null;
            if (!this.destroyed) this.refreshViewportWindow();
          });
        }
      },
      { passive: true }
    );
    this.root.appendChild(bodyWrap);
    this.bodyWrap = bodyWrap;
    return bodyWrap;
  }

  private openTaskSidebar = (task: Task) => {
    this.tooltip.hide();
    if (this.currentOptions.onOpenTaskDetails) { this.currentOptions.onOpenTaskDetails(task); return; }
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
      timeFormat: this.state.timeFormat,
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

  /** Smoothly centers the timeline scroll viewport on the Today vertical line. */
  public scrollToToday = () => {
    if (this.destroyed || !this.bodyWrap || !this.state.renderedStartDate || this.lastLayoutDayWidth <= 0) return;
    const now = this.currentOptions.viewport?.currentTime || new Date();
    const todayStr = getTodayISODate(now);
    const dayOffset = diffDays(this.state.renderedStartDate, todayStr) + getTodayProgressFraction(now);
    const todayX = dayOffset * this.lastLayoutDayWidth;
    const labelCol = this.bodyWrap.querySelector<HTMLElement>(".jantt-label-column");
    const labelW = labelCol ? labelCol.offsetWidth : (this.currentOptions.hideLabelColumn ? 0 : this.state.labelWidth);
    const visibleTimelineW = Math.max(0, this.bodyWrap.clientWidth - labelW);
    const maxScroll = Math.max(0, this.bodyWrap.scrollWidth - this.bodyWrap.clientWidth);
    const target = Math.max(0, Math.min(maxScroll, Math.round(todayX - visibleTimelineW / 2)));
    if (typeof this.bodyWrap.scrollTo === "function") {
      this.bodyWrap.scrollTo({ left: target, behavior: "smooth" });
    } else {
      this.bodyWrap.scrollLeft = target;
    }
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
      timeFormat: this.state.timeFormat,
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
      onTimeFormatChange: (fmt: TimeFormat) => {
        if (this.state.timeFormat === fmt) return;
        this.state.timeFormat = fmt;
        this.tooltip.updateTheme(this.resolveThemeVars(), this.currentOptions.themeClassName, fmt);
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

  private createTimelineHeader(
    { header, viewport }: JanttLayoutResult,
    visibleXRange?: { startX: number; endX: number }
  ): HTMLElement {
    return renderTimelineHeader(header, {
      visibleXRange,
      selectedDate: this.state.selectedDateFilter,
      dayWidth: this.state.currentDayWidth,
      showToday: viewport.showToday,
      showTodayTag: viewport.showTodayTag,
      signal: this.lifecycle.signal,
      onColumnResize: (w) => this.handleColumnDragResize(w),
      // The grabbed date stays under the pointer for the whole drag session
      onColumnResizeStart: (clientX) => {
        this.wheelZoomAnchored = false; // the drag session owns the anchor until it ends
        this.isColumnDragging = true;
        if (this.wheelSettleTimer !== null) clearTimeout(this.wheelSettleTimer);
        this.wheelSettleTimer = null;
        this.root.classList.add("is-zooming");
        this.setZoomAnchor(clientX);
      },
      onColumnResizeEnd: () => {
        this.clearZoomAnchor();
        if (this.isColumnDragging) {
          this.isColumnDragging = false;
          this.root.classList.remove("is-zooming");
          // Persist/sync the settled zoom once on drag release (prevents React round-trip stutter mid-drag)
          this.currentOptions.onDayWidthChange?.(this.state.currentDayWidth);
          this.broadcastViewport();
        }
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
  }

  private visibleWindow(scrollLeft: number): { startX: number; endX: number } {
    const labelW = this.currentOptions.hideLabelColumn ? 0 : this.state.labelWidth;
    const visibleW = Math.max((this.bodyWrap?.clientWidth || this.container.clientWidth || 1200) - labelW, 360);
    let overscan = Math.max(visibleW * 0.75, 800);
    if (this.state.currentScale === "hour" || this.state.currentScale === "minute") {
      const tickWidth = getSubDayTickStepMinutes(this.state.currentScale, this.state.currentDayWidth) * this.state.currentDayWidth / 1440;
      // Reserve the visible viewport first: the tick cap must never leave a 4K screen blank.
      overscan = Math.min(overscan, Math.max(0, (218 * tickWidth - visibleW) / 2));
    }
    return { startX: Math.max(0, scrollLeft - overscan), endX: scrollLeft + visibleW + overscan };
  }

  private rememberWindow(result: JanttLayoutResult, range?: { startX: number; endX: number }) {
    this.renderedSubTickWindow = range ? {
      startX: range.startX, endX: Math.min(range.endX, result.canvasWidth),
      totalWidth: result.canvasWidth, scale: result.header.scale
    } : null;
  }

  /** Replaces only the vector/background layers. Bars and the sticky table stay mounted. */
  private replaceViewportLayers(result: JanttLayoutResult, visibleXRange?: { startX: number; endX: number }) {
    const { header, tasks: taskLayouts, viewport, dependencies, canvasWidth, canvasHeight } = result;
    const grid = this.gridContainerEl!;
    const focus = this.captureFocus();
    this.timelineAreaEl!.querySelector(".jantt-timeline-header")!.replaceWith(this.createTimelineHeader(result, visibleXRange));
    const { gridLayer, todayLine } = renderTimelineGrid({
      header, taskLayouts, rowHeight: viewport.rowHeight, showToday: viewport.showToday,
      showCritical: this.state.showCritical, hasAddRow: !this.currentOptions.readOnly,
      selectedDate: this.state.selectedDateFilter, visibleXRange
    });
    // Carry row hover state to the replacement grid while its label stays under the pointer.
    grid.querySelectorAll(".jantt-grid-row.is-row-highlighted").forEach(row => {
      const id = row.getAttribute("data-grid-row-id");
      if (id) gridLayer.querySelector(`[data-grid-row-id="${cssAttrValue(id)}"]`)?.classList.add("is-row-highlighted");
    });
    grid.querySelector(".jantt-grid-layer")!.replaceWith(gridLayer);
    const oldToday = grid.querySelector<HTMLElement>(".jantt-today-line");
    if (oldToday && todayLine) oldToday.style.left = todayLine.style.left;
    else if (todayLine) grid.appendChild(todayLine);
    else oldToday?.remove();
    const activePaths = new Map(Array.from(this.depPathElements, ([key, path]) => [key, {
      active: path.classList.contains("is-active"), chain: path.classList.contains("is-critical-chain")
    }]));
    const wire = this.previewWireSvg?.getAttribute("d");
    const { svg, previewWireSvg } = renderDependencyLinks({
      dependencies, canvasWidth, canvasHeight, visibleXRange, depPathElements: this.depPathElements,
      showCritical: this.state.showCritical,
      onLinkDelete: this.currentOptions.readOnly ? undefined : this.handleLinkDelete,
      taskLabels: new Map(taskLayouts.map(t => [t.task.id, t.displayLabel]))
    });
    for (const [key, path] of this.depPathElements) {
      const previous = activePaths.get(key);
      if (!previous?.active) continue;
      path.classList.add("is-active");
      if (previous.chain) path.classList.add("is-critical-chain");
      path.setAttribute("marker-end", previous.chain ? `url(#${svg.dataset.arrowCriticalId})` : path.dataset.activeMarker!);
    }
    if (wire) previewWireSvg.setAttribute("d", wire);
    this.previewWireSvg = previewWireSvg;
    grid.querySelector(".jantt-svg-overlay")!.replaceWith(svg);
    this.rememberWindow(result, visibleXRange);
    this.restoreFocus(focus);
  }

  /** Passive horizontal panning never invokes layout or rebuilds the interactive task DOM. */
  private refreshViewportWindow() {
    const result = this.lastLayoutResult;
    if (!result || !this.bodyWrap || !this.timelineAreaEl || !this.gridContainerEl) return;
    const range = this.visibleWindow(this.bodyWrap.scrollLeft);
    if (result.header.scale === "hour" || result.header.scale === "minute") {
      result.header.subTicks = buildSubTicks(result.header.scale, result.viewport.dayWidth,
        result.header.startDate, result.header.totalDays, this.state.timeFormat, range);
    }
    this.replaceViewportLayers(result, range);
  }

  private patchTaskBars(taskLayouts: TaskLayout[]) {
    for (const item of taskLayouts) {
      const nodes = this.barNodes.get(item.task.id)!;
      nodes.bar.style.left = `${item.x}px`;
      nodes.bar.style.width = `${item.width}px`;
      nodes.bar.classList.toggle("is-selected", this.controller.isSelected(item.task.id));
      if (nodes.baseline && item.baselineLayout) {
        nodes.baseline.style.left = `${item.baselineLayout.x}px`;
        nodes.baseline.style.width = `${item.baselineLayout.width}px`;
      }
      // Width-dependent badges retain the same visibility rules across zoom thresholds.
      if (!nodes.isMilestone && Number.isFinite(item.task.progress)) {
        let badges = nodes.bar.querySelector<HTMLElement>(".jantt-bar-badges");
        const percent = badges?.querySelector(".jantt-bar-percent");
        if (item.width < 90) {
          percent?.remove();
          if (badges?.childElementCount === 0) badges.remove();
        }
        else if (!percent) {
          if (!badges) {
            badges = document.createElement("div");
            badges.className = "jantt-bar-badges";
            nodes.bar.querySelector(".jantt-bar-content")!.appendChild(badges);
          }
          const next = document.createElement("span");
          next.className = "jantt-bar-percent";
          next.textContent = `${Math.round(Math.min(1, Math.max(0, isTaskDone(item.task) ? 1 : item.task.progress!)) * 100)}%`;
          badges.prepend(next);
        }
      }
    }
  }

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
    let toolbar: HTMLElement | null = null;
    if (this.currentOptions.showToolbar !== false) {
      toolbar = this.root.querySelector<HTMLElement>(".jantt-toolbar");
      if (!toolbar || toolbar.parentElement !== this.root) {
        toolbar = renderToolbar(this.buildToolbarProps(displayTasks.length, criticalCount, this.lastRowHeight));
        this.root.prepend(toolbar);
      }
    } else {
      const existingToolbar = this.root.querySelector<HTMLElement>(".jantt-toolbar");
      if (existingToolbar) existingToolbar.remove();
    }

    // 4. Dynamic Row Height Calculation & Coordinate Layout
    const layoutData: JanttData = { ...this.currentData, tasks: displayTasks };
    const layoutOptions: ViewportOptions = {
      ...this.currentOptions.viewport,
      scale: this.state.currentScale,
      dayWidth: this.state.currentDayWidth,
      timeFormat: this.state.timeFormat,
      linkRouting: this.state.currentRouting,
      rowHeightMode: this.state.rowHeightMode,
      showCriticalPath: this.state.showCritical,
      showBaselines: this.state.showBaselines,
      labelWidth: this.state.labelWidth,
      selectedDate: this.state.selectedDateFilter,
      criticalResult: masterCriticalResult
    };
    const predictedBounds = computeChartBounds(layoutData, layoutOptions);
    const targetScrollLeft = ViewportCoordinator.calculateScrollTarget(
      savedScrollLeft,
      hadPreviousRender,
      predictedBounds.startDate,
      this.state.currentDayWidth,
      this.state
    );
    const predictedCanvasWidth = Math.max(predictedBounds.totalDays * this.state.currentDayWidth, 600);
    if (this.state.currentScale === "hour" || this.state.currentScale === "minute" || predictedCanvasWidth > 5000) {
      layoutOptions.visibleXRange = this.visibleWindow(targetScrollLeft);
    }

    const effectiveRowHeight = ViewportCoordinator.calculateRowHeight(
      this.container,
      this.root,
      layoutData,
      layoutOptions,
      this.state.rowHeightMode,
      this.state.customRowHeight,
      this.currentOptions.readOnly,
      predictedBounds
    );
    const layoutResult = layout(layoutData, { ...layoutOptions, rowHeight: effectiveRowHeight }, predictedBounds);

    const { tasks: taskLayouts, dependencies, header, viewport, canvasWidth, canvasHeight } = layoutResult;
    const newStartDate = layoutResult.viewport.startDate;
    this.lastRowHeight = viewport.rowHeight;
    this.rememberWindow(layoutResult, layoutOptions.visibleXRange);

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
            this.state.currentRouting, wire.fromSide, wire.toSide
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
    if (toolbar) {
      updateToolbar(toolbar, this.buildToolbarProps(displayTasks.length, criticalCount, effectiveRowHeight));
    }

    const labelSignature = [this.currentData.tasks, displayTasks.length, this.state.filterQuery,
      this.state.selectedDateFilter, this.state.labelWidth, header.totalHeight, viewport.rowHeight,
      this.state.showCritical, this.currentOptions.hideLabelColumn, this.currentOptions.readOnly,
      this.currentData.people, this.currentData.teams, this.state.timeFormat, this.currentData.categories,
      masterCriticalResult, this.currentOptions.theme, this.currentOptions.themeClassName,
      this.currentOptions.className, getTodayISODate(viewport.currentTime)];
    const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    const reuseLabel = Boolean(this.labelColumnEl?.parentElement === this.bodyWrap && same(labelSignature, this.labelSignature));
    const structureSignature = [...labelSignature, this.state.showBaselines, this.state.currentRouting];
    const patchInPlace = !this.currentOptions.hideLabelColumn && this.timelineAreaEl?.parentElement === this.bodyWrap &&
      this.gridContainerEl?.parentElement === this.timelineAreaEl && this.barNodes.size === taskLayouts.length &&
      same(structureSignature, this.structureSignature);

    if (patchInPlace) {
      this.timelineAreaEl!.style.width = `${canvasWidth}px`;
      this.timelineAreaEl!.style.minWidth = `${canvasWidth}px`;
      this.gridContainerEl!.style.width = `${canvasWidth}px`;
      this.replaceViewportLayers(layoutResult, layoutOptions.visibleXRange);
      this.patchTaskBars(taskLayouts);
    } else {
      // 7. Right Timeline Area Container
      const timelineArea = document.createElement("div");
      timelineArea.className = "jantt-timeline-area";
      timelineArea.style.width = `${canvasWidth}px`;
      timelineArea.style.minWidth = `${canvasWidth}px`;

      // 7a. Timeline Header
      const timelineHeader = this.createTimelineHeader(layoutResult, layoutOptions.visibleXRange);
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

      const hideLabelColumn = Boolean(this.currentOptions.hideLabelColumn);
      this.root.classList.toggle("jantt-label-col-hidden", hideLabelColumn);

      // 8. Render Sticky Data Grid Table (omitted when hideLabelColumn is active)
      const labelCol = hideLabelColumn
        ? null
        : reuseLabel ? this.labelColumnEl : renderGridTable({
            taskLayouts,
            labelWidth: this.state.labelWidth,
            headerHeight: header.totalHeight,
            rowHeight: viewport.rowHeight,
            gridContainer,
            getGridContainer: () => this.gridContainerEl,
            controller: this.controller,
            showCritical: this.state.showCritical,
            people: this.currentData.people,
            teams: this.currentData.teams,
            onTaskClick: (task: Task) => {
              if (this.currentOptions.mobileDoubleTapToOpen) {
                const now = Date.now();
                if (this.lastLabelTaskTap?.id === task.id && now - this.lastLabelTaskTap.time <= 420) {
                  this.lastLabelTaskTap = null;
                  this.currentOptions.onTaskClick?.(task);
                  this.openTaskSidebar(task);
                } else {
                  this.lastLabelTaskTap = { id: task.id, time: now };
                  this.controller.selectTask(task.id, false);
                }
                return;
              }
              this.currentOptions.onTaskClick?.(task);
              this.openTaskSidebar(task);
            },
            onTaskKeyOpen: (task: Task) => {
              this.lastLabelTaskTap = null;
              this.currentOptions.onTaskClick?.(task);
              this.openTaskSidebar(task);
            },
            onAddTask: this.currentOptions.readOnly ? undefined : this.handleAddTask,
            onLabelWidthChange: this.handleLabelWidthChange
          }).labelCol;

      // 9. Render Timeline Grid Lines & Today Line
      const { gridLayer, todayLine } = renderTimelineGrid({
        header,
        taskLayouts,
        rowHeight: viewport.rowHeight,
        showToday: viewport.showToday,
        showCritical: this.state.showCritical,
        hasAddRow,
        selectedDate: this.state.selectedDateFilter,
        visibleXRange: layoutOptions.visibleXRange
      });
      gridContainer.appendChild(gridLayer);
      if (todayLine) gridContainer.appendChild(todayLine);

      // 10. Render SVG Dependency Connectors & Preview Wire (links are not editable in read-only mode)
      const { svg, previewWireSvg: pWire, depPathElements } = renderDependencyLinks({
        dependencies,
        canvasWidth,
        canvasHeight,
        visibleXRange: layoutOptions.visibleXRange,
        depPathElements: this.depPathElements,
        showCritical: this.state.showCritical,
        onLinkDelete: this.currentOptions.readOnly ? undefined : this.handleLinkDelete,
        taskLabels: this.currentOptions.readOnly
          ? undefined
          : new Map(taskLayouts.map((t) => [t.task.id, t.displayLabel]))
      });
      this.previewWireSvg = pWire;
      gridContainer.appendChild(svg);

      // 11. Render Task Bars, Milestones, and Progress Handles
      this.barNodes = renderTaskBars(
        {
          taskLayouts,
          dependencies,
          depPathElements,
          showCritical: this.state.showCritical,
          showBaselines: this.state.showBaselines,
          readOnly: this.currentOptions.readOnly,
          timeFormat: this.state.timeFormat,
          showOutsideLabels: hideLabelColumn,
          people: this.currentData.people,
          teams: this.currentData.teams,
          controller: this.controller,
          tooltip: this.tooltip
        },
        gridContainer
      ).barNodes;
      timelineArea.appendChild(gridContainer);

      // 12. Swap the new body in only once it is fully built (a failed render keeps the previous one)
      const bodyWrap = this.ensureBodyWrap();
      if (reuseLabel && labelCol) {
        this.timelineAreaEl?.remove();
        bodyWrap.appendChild(timelineArea);
      } else if (labelCol) {
        bodyWrap.replaceChildren(labelCol, timelineArea);
      } else {
        bodyWrap.replaceChildren(timelineArea);
      }
      this.timelineAreaEl = timelineArea;
      this.gridContainerEl = gridContainer;
      this.labelColumnEl = labelCol;
    }
    this.labelSignature = labelSignature;
    this.structureSignature = structureSignature;
    this.lastLayoutResult = layoutResult;
    const bodyWrap = this.bodyWrap!;
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
    this.isColumnDragging = false;
    this.lifecycle.abort();
    const oldToolbar = this.root.querySelector<HTMLElement>(".jantt-toolbar");
    (oldToolbar as any)?.__cleanup?.();
    if (this.resizeTimer) cancelAnimationFrame(this.resizeTimer);
    if (this.frameRenderId !== null) cancelAnimationFrame(this.frameRenderId);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.wheelSettleTimer !== null) clearTimeout(this.wheelSettleTimer);
    if (this.windowFrameId !== null) cancelAnimationFrame(this.windowFrameId);
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
        // Explicit updates may reuse a mutated object (including getData()). Identity alone
        // cannot distinguish those edits from a viewport update or restoring an older plan.
        // Wheel/slider zoom uses setDayWidth directly, so this comparison stays off that path.
        const inputSnapshot = JSON.stringify(newData);
        const resolvedSnapshot = newData === this.currentData ? inputSnapshot : JSON.stringify(this.currentData);
        const unchangedInput = newData === this.lastInputData && inputSnapshot === this.lastInputSnapshot;
        if (resolvedSnapshot !== this.lastResolvedSnapshot || (newData !== this.currentData && !unchangedInput)) {
          this.currentData = { ...newData, tasks: this.resolveTasks(newData) };
          this.lastInputData = newData;
          this.lastInputSnapshot = inputSnapshot;
          this.lastResolvedSnapshot = JSON.stringify(this.currentData);
        }
        if (newOpts) {
          if (newOpts.searchQuery !== undefined) {
            this.state.filterQuery = newOpts.searchQuery;
          }
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
          if (newOpts.viewport?.timeFormat) {
            this.state.timeFormat = newOpts.viewport.timeFormat === "24h" ? "24h" : "12h";
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
          this.tooltip.updateTheme(this.resolveThemeVars(), this.currentOptions.themeClassName, this.state.timeFormat);
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
      setDayWidth: (w: number, anchorClientX?: number) => {
        if (this.destroyed) return;
        if (anchorClientX === undefined) { this.handleDayWidthChange(w); return; }
        this.setZoomAnchor(anchorClientX);
        try { this.handleDayWidthChange(w); }
        finally { this.clearZoomAnchor(); }
      },
      getDayWidth: () => this.state.currentDayWidth,
      scrollToToday: () => this.scrollToToday(),
      getScrollPosition: () => ({
        scrollLeft: this.bodyWrap?.scrollLeft || 0,
        scrollTop: this.bodyWrap?.scrollTop || 0
      }),
      setScrollPosition: (scrollLeft: number, scrollTop: number) => {
        if (this.destroyed || !this.bodyWrap) return;
        if (Number.isFinite(scrollLeft) && scrollLeft >= 0) this.bodyWrap.scrollLeft = scrollLeft;
        if (Number.isFinite(scrollTop) && scrollTop >= 0) this.bodyWrap.scrollTop = scrollTop;
      }
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
