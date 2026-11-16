import { JanttData, Task, JanttOptions, TaskLayout } from "./types";
import { addDays, diffDays } from "./date-math";
import { resolveSchedule } from "./resolver";
import { DEFAULT_GAP_DAYS } from "./constants";
import { TaskScheduleCoordinator } from "./rendering/task-schedule-coordinator";
import {
  DragMode,
  DragState,
  GestureContext,
  IGestureStrategy,
  InteractionHooks,
  MoveGestureStrategy,
  ResizeGestureStrategy,
  ProgressGestureStrategy,
  LinkGestureStrategy,
  SplitterGestureStrategy,
  MarqueeGestureStrategy,
  PanGestureStrategy,
  constrainedStart
} from "./controller/index";

/**
 * Gesture types are exported for typing only (e.g. tests and host adapters); they are not an
 * extension point: the controller's strategy table is fixed.
 */
export type { DragMode, DragState, GestureContext, IGestureStrategy, InteractionHooks };

type LiveLinkWire = { fromX: number; fromY: number; toX: number; toY: number };

/** Pointer travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 3;
/** Width (px) of the auto-scroll zone along the visible timeline edges. */
const EDGE_ZONE_PX = 50;
/** Auto-scroll speed (px per frame) at the very edge; it ramps up linearly across the zone. */
const MAX_AUTO_SCROLL_PX = 15;
/** Touch taps: maximum travel (px) and duration (ms) that still count as a tap. */
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 450;
/** Modes whose moves rewrite task data (and therefore need a re-render). */
const DATA_MODES: ReadonlySet<DragMode> = new Set<DragMode>(["move", "resize", "progress"]);

const hasOwn = Object.prototype.hasOwnProperty;

/** True when both tasks are the same object or have the same own fields (shallow, no allocation). */
function sameFields(a: Task, b: Task): boolean {
  if (a === b) return true;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  let fields = 0;
  for (const key in x) {
    if (!hasOwn.call(x, key)) continue;
    if (!hasOwn.call(y, key) || x[key] !== y[key]) return false;
    fields++;
  }
  for (const key in y) {
    if (hasOwn.call(y, key)) fields--;
  }
  return fields === 0;
}

/** Speed for one axis: negative near `min`, positive near `max`, 0 elsewhere. */
function edgeSpeed(pos: number, min: number, max: number): number {
  if (max - min <= EDGE_ZONE_PX * 2) return 0;
  if (pos > max - EDGE_ZONE_PX) return Math.ceil(MAX_AUTO_SCROLL_PX * Math.min(1, (pos - (max - EDGE_ZONE_PX)) / EDGE_ZONE_PX));
  if (pos < min + EDGE_ZONE_PX) return -Math.ceil(MAX_AUTO_SCROLL_PX * Math.min(1, (min + EDGE_ZONE_PX - pos) / EDGE_ZONE_PX));
  return 0;
}

/**
 * Enterprise gesture and interaction controller for Jantt.
 * Employs the Strategy Pattern to decouple gesture mechanics into isolated, testable strategies.
 *
 * Data contract: the controller edits `data.tasks` copy-on-write (it replaces the array and the
 * task objects it changes, never mutating them), and hands `onChange` / `onCommit` a fresh
 * container. Payloads given to hosts are therefore never modified by later interactions. With
 * `hooks.onDataChange`, the container itself is replaced too and handed to the host, so the
 * host owns the only copy of the plan; without it, `tasks` is replaced on the given container.
 */
export class InteractionController {
  private data: JanttData;
  private options: JanttOptions;
  private readonly hooks: InteractionHooks;
  private dragState: DragState | null = null;
  private dayWidth: number;
  private defaultGapDays: number;
  private selectedTaskIds = new Set<string>();
  private autoCascade: boolean = true;
  private onRenderRequest: () => void;
  private openModalHandler: (task: Task) => void;
  private onLiveLinkUpdate?: (wireData: LiveLinkWire | null) => void;
  private onSplitResize?: (newWidth: number, isFinal?: boolean) => void;
  private container?: HTMLElement;
  private renderRafId: number | null = null;
  private changePending = false;
  /** A queued frame must render fully (anything other than a drag frame asked for it). */
  private fullFramePending = false;
  /** `data.tasks` as last drawn by a full render during the current gesture (drag fast path). */
  private paintedTasks: Task[] | null = null;
  private splitRafId: number | null = null;
  private pendingSplitWidth = 0;
  private autoScrollRafId: number | null = null;
  private lastPointerEvent: PointerEvent | null = null;
  private captureEl: HTMLElement | null = null;
  private readonly tapCleanups = new Set<() => void>();
  private readonly splitResizeProxy = (width: number, isFinal?: boolean) => this.queueSplitResize(width, isFinal);
  private readonly ctx: GestureContext;

  private readonly strategies = new Map<DragMode, IGestureStrategy>([
    ["move", new MoveGestureStrategy()],
    ["resize", new ResizeGestureStrategy()],
    ["progress", new ProgressGestureStrategy()],
    ["link", new LinkGestureStrategy()],
    ["split", new SplitterGestureStrategy()],
    ["marquee", new MarqueeGestureStrategy()],
    ["pan", new PanGestureStrategy()]
  ] as Array<[DragMode, IGestureStrategy]>);

  /** `hooks` (optional) lets an engine own the plan data and patch drag frames itself. */
  constructor(
    data: JanttData,
    options: JanttOptions,
    dayWidth: number,
    onRenderRequest: () => void,
    openModalHandler: (task: Task) => void,
    onLiveLinkUpdate?: (wireData: LiveLinkWire | null) => void,
    onSplitResize?: (newWidth: number, isFinal?: boolean) => void,
    container?: HTMLElement,
    hooks: InteractionHooks = {}
  ) {
    this.data = data;
    this.options = options;
    this.hooks = hooks;
    this.dayWidth = dayWidth;
    this.defaultGapDays = data.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
    this.autoCascade = options.viewport?.autoCascade ?? options.autoCascade ?? (data.meta?.autoCascade ?? true);
    this.onRenderRequest = onRenderRequest;
    this.openModalHandler = openModalHandler;
    this.onLiveLinkUpdate = onLiveLinkUpdate;
    this.onSplitResize = onSplitResize;
    this.container = container;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);
    this.onDragKeyDown = this.onDragKeyDown.bind(this);
    this.autoScrollTick = this.autoScrollTick.bind(this);

    // One long-lived context: getters always read the controller's current state, so pointer
    // events do not allocate a new context object each time.
    const self = this;
    this.ctx = {
      get data() {
        return self.data;
      },
      get options() {
        return self.options;
      },
      get dayWidth() {
        return self.dayWidth;
      },
      get defaultGapDays() {
        return self.defaultGapDays;
      },
      get autoCascade() {
        return self.autoCascade;
      },
      get container() {
        return self.container;
      },
      selectedTaskIds: this.selectedTaskIds,
      openModalHandler: (task) => this.openModalHandler(task),
      get onLiveLinkUpdate() {
        return self.onLiveLinkUpdate;
      },
      get onSplitResize() {
        return self.onSplitResize ? self.splitResizeProxy : undefined;
      },
      onRenderRequest: () => this.renderNow(),
      scheduleRender: () => this.scheduleRender(),
      selectTask: (taskId, toggle) => this.selectTask(taskId, toggle),
      clearSelection: () => this.clearSelection(),
      setTasks: (tasks, triggerCascade) => this.setTasks(tasks, triggerCascade),
      commitData: () => this.commit(),
      resolve: (tasks) => this.resolve(tasks)
    };
  }

  public updateData(newData: JanttData, dayWidth?: number, newOptions?: JanttOptions, container?: HTMLElement) {
    this.data = newData;
    if (dayWidth) this.dayWidth = dayWidth;
    if (container) this.container = container;
    if (newOptions) {
      this.options = newOptions;
      if (newOptions.viewport?.autoCascade !== undefined) {
        this.autoCascade = newOptions.viewport.autoCascade;
      } else if (newOptions.autoCascade !== undefined) {
        this.autoCascade = newOptions.autoCascade;
      }
    }
    this.defaultGapDays = newData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
  }

  /** The live plan object the controller edits (the one last passed to the constructor or updateData). */
  public getData(): JanttData {
    return this.data;
  }

  public destroy() {
    this.endGesture();
    if (this.renderRafId !== null) {
      window.cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    if (this.splitRafId !== null) {
      window.cancelAnimationFrame(this.splitRafId);
      this.splitRafId = null;
    }
    this.tapCleanups.forEach((cleanup) => cleanup());
    this.changePending = false;
    this.selectedTaskIds.clear();
  }

  public getSelectedTaskIds(): Set<string> {
    return this.selectedTaskIds;
  }

  public isSelected(taskId: string): boolean {
    return this.selectedTaskIds.has(taskId);
  }

  public clearSelection() {
    if (this.selectedTaskIds.size === 0) return;
    this.selectedTaskIds.clear();
    this.renderNow();
  }

  public isAutoCascade(): boolean {
    return this.autoCascade;
  }

  public setAutoCascade(val: boolean) {
    if (this.autoCascade === val) return;
    this.autoCascade = val;
    this.renderNow();
  }

  public toggleAutoCascade(): boolean {
    this.autoCascade = !this.autoCascade;
    // Viewers may flip the view flag, but must not rewrite (or commit) the schedule.
    if (this.autoCascade && !this.options.readOnly) {
      this.applyTasks(this.resolve(this.data.tasks));
      this.commit();
    }
    return this.autoCascade;
  }

  public toggleTaskLock(taskId: string) {
    if (this.options.readOnly) return;
    const task = this.findTask(taskId);
    if (!task) return;
    this.setTasks(
      this.data.tasks.map((t) => (t === task ? { ...t, locked: !t.locked } : t)),
      true
    );
    this.renderNow(true);
    this.restoreFocus(taskId);
    this.commit();
  }

  public selectTask(taskId: string, toggle = false) {
    this.applySelection(taskId, toggle);
    this.renderNow();
  }

  /** Aborts the active gesture: restores the pre-gesture tasks and fires onChange (never onCommit). */
  public cancelDrag(): void {
    const state = this.endGesture();
    if (!state) return;
    if (state.mode === "link") {
      this.onLiveLinkUpdate?.(null);
    } else if (state.mode === "split" && state.moved && state.origLabelWidth !== undefined) {
      this.queueSplitResize(state.origLabelWidth, true);
    }
    if (state.origTasks && this.data.tasks !== state.origTasks) {
      this.applyTasks(state.origTasks);
      this.renderNow(true);
    }
  }

  public startMarqueeSelection(e: PointerEvent, canvasEl: HTMLElement, taskLayouts: TaskLayout[]) {
    if (this.dragState || this.options.readOnly) return;
    // On touch devices, touch interactions on background should pan/scroll the canvas natively, never start marquee
    if (e.pointerType === "touch" && (this.options.disableDragOnTouch !== false || this.options.isMobile)) return;
    if (e.button !== 0 && e.button !== 2) return;

    e.preventDefault();

    const canvasRect = canvasEl.getBoundingClientRect();
    const startCanvasX = e.clientX - canvasRect.left + canvasEl.scrollLeft;
    const startCanvasY = e.clientY - canvasRect.top + canvasEl.scrollTop;

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && this.selectedTaskIds.size > 0) {
      this.selectedTaskIds.clear();
      canvasEl.querySelectorAll<HTMLElement>(".is-selected[data-task-id]").forEach((bar) => bar.classList.remove("is-selected"));
    }

    const selectionBox = document.createElement("div");
    selectionBox.className = "jantt-selection-box";
    selectionBox.style.left = `${startCanvasX}px`;
    selectionBox.style.top = `${startCanvasY}px`;
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    canvasEl.appendChild(selectionBox);

    this.beginGesture(e, {
      mode: "marquee",
      startX: e.clientX,
      startY: e.clientY,
      canvasStartX: startCanvasX,
      canvasStartY: startCanvasY,
      moved: false,
      pointerId: e.pointerId,
      selectionBoxEl: selectionBox,
      canvasEl,
      taskLayouts
    });
  }

  public startDrag(e: PointerEvent, task: Task, mode: DragMode, el?: HTMLElement) {
    if (this.dragState) return; // One gesture at a time: ignore a second finger or pointer.

    const current = this.findTask(task.id) ?? task;
    const viewOnly =
      Boolean(this.options.readOnly) ||
      (Boolean(current.locked) && (mode === "move" || mode === "resize" || mode === "progress"));
    const clickOpens = mode === "move" || mode === "resize";

    // Touch: unless touch dragging is explicitly enabled (and allowed), a bar only responds to a
    // clean tap; everything else stays native scrolling.
    if (e.pointerType === "touch" && (this.options.disableDragOnTouch !== false || viewOnly)) {
      if (clickOpens) this.watchTap(e, current.id);
      return;
    }

    if (e.button !== 0) return;

    if (viewOnly) {
      // Viewers and locked tasks: a click opens the task, a drag pans the timeline.
      if (clickOpens) this.startPanGesture(e, undefined, current.id);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (mode === "move") {
      const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isModifier || !this.selectedTaskIds.has(current.id)) {
        this.applySelection(current.id, isModifier);
        // Deferred: a synchronous render here would replace the bar before the gesture starts.
        this.scheduleRender();
      }
    }

    const multiTasks = new Map<string, { start: string; end: string }>();
    if (mode === "move" && this.selectedTaskIds.has(current.id) && this.selectedTaskIds.size > 1) {
      this.selectedTaskIds.forEach((id) => {
        const t = this.findTask(id);
        if (t && t.start && t.end && !t.locked) {
          multiTasks.set(id, { start: t.start, end: t.end });
        }
      });
    } else {
      multiTasks.set(current.id, { start: current.start, end: current.end });
    }

    const barWidth = mode === "progress" ? el?.getBoundingClientRect().width : undefined;

    this.beginGesture(e, {
      taskId: current.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origStart: current.start,
      origEnd: current.end,
      origProgress: current.progress ?? 0,
      moved: false,
      element: el,
      pointerId: e.pointerId,
      linkFromTaskId: mode === "link" ? current.id : undefined,
      multiTasks,
      origTasks: this.data.tasks,
      autoScrollX: 0,
      barWidth
    });

    if (DATA_MODES.has(mode)) el?.classList.add("is-dragging");
  }

  public startSplitterDrag(e: PointerEvent, currentWidth: number) {
    if (this.dragState) return;
    // Suppress splitter dragging on touch to avoid conflict with timeline panning
    if (e.pointerType === "touch" && (this.options.disableDragOnTouch !== false || this.options.isMobile)) return;
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    this.beginGesture(e, {
      mode: "split",
      startX: e.clientX,
      startY: e.clientY,
      origLabelWidth: currentWidth,
      moved: false,
      pointerId: e.pointerId
    });
  }

  public startPan(e: PointerEvent, canvasEl: HTMLElement) {
    if (e.pointerType === "touch") return;
    if (e.button !== 0 && e.button !== 1) return;
    this.startPanGesture(e, canvasEl);
  }

  public startCanvasDrag(e: PointerEvent, canvasEl: HTMLElement, taskLayouts: TaskLayout[]) {
    if (this.options.readOnly && e.button !== 0 && e.button !== 1) return;
    if (e.pointerType === "touch") return;

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      this.startMarqueeSelection(e, canvasEl, taskLayouts);
      return;
    }

    if (e.button === 0 || e.button === 1) {
      this.startPan(e, canvasEl);
    }
  }

  public handleKeyDown(e: KeyboardEvent, task: Task) {
    // Keys aimed at an interactive child of the bar (e.g. the lock button) belong to that child.
    const target = e.target as Element | null;
    if (target && target !== e.currentTarget && target.closest?.("button, input, select, textarea, a[href]")) return;

    if (e.key === "Escape") {
      if (this.dragState) {
        this.cancelDrag();
      } else {
        this.clearSelection();
      }
      return;
    }

    const current = this.findTask(task.id) ?? task;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.openTask(current);
      return;
    }

    if (this.options.readOnly || current.locked) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const taskIdToDelete = current.id;
      // Typed links of other tasks are kept (only references to the deleted task are dropped);
      // the cascade honors Strict mode and the plan's working calendars.
      const knownIds = new Set(this.data.tasks.map((t) => t.id));
      this.setTasks(
        this.data.tasks
          .filter((t) => t.id !== taskIdToDelete)
          .map((t) => TaskScheduleCoordinator.withoutDependency(t, taskIdToDelete, knownIds)),
        true
      );
      this.selectedTaskIds.delete(taskIdToDelete);
      this.renderNow(true);
      this.options.onTaskDelete?.(taskIdToDelete);
      this.commit();
      return;
    }

    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();

    const step = (e.key === "ArrowLeft" ? -1 : 1) * (e.altKey ? this.defaultGapDays : 1);
    let next: Task | null = null;
    if (e.shiftKey) {
      // Shrink / grow the end date, never below the duration the resize gesture allows.
      if (step > 0) {
        const end = addDays(current.end, 1);
        next = { ...current, end };
        if (current.milestone && diffDays(current.start, end) > 0) next.milestone = false;
      } else if (diffDays(current.start, current.end) > (current.milestone ? 0 : 1)) {
        next = { ...current, end: addDays(current.end, -1) };
      }
    } else {
      next = { ...current, start: addDays(current.start, step), end: addDays(current.end, step) };
      if (!this.autoCascade) {
        const byId = new Map(this.data.tasks.map((t) => [t.id, t] as [string, Task]));
        const allowed = constrainedStart(next, (id) => byId.get(id), this.ctx.resolve, byId);
        const shortfall = diffDays(next.start, allowed);
        if (shortfall > 0) {
          next = { ...next, start: allowed, end: addDays(next.end, shortfall) };
        }
      }
      if (next.start === current.start) next = null;
    }
    if (!next) return;

    const updated = next;
    this.setTasks(
      this.data.tasks.map((t) => (t === current ? updated : t)),
      true
    );
    this.renderNow(true);
    this.restoreFocus(current.id);
    this.commit();
  }

  // ---------------------------------------------------------------------------
  // Gesture lifecycle
  // ---------------------------------------------------------------------------

  private startPanGesture(e: PointerEvent, canvasEl?: HTMLElement, taskId?: string) {
    if (this.dragState) return;
    e.preventDefault();

    const bodyWrap =
      canvasEl?.closest<HTMLElement>(".jantt-body-wrap") ||
      this.container?.querySelector<HTMLElement>(".jantt-body-wrap");

    if (canvasEl) canvasEl.style.cursor = "grabbing";

    this.beginGesture(e, {
      mode: "pan",
      taskId,
      startX: e.clientX,
      startY: e.clientY,
      origScrollLeft: bodyWrap?.scrollLeft ?? 0,
      origScrollTop: bodyWrap?.scrollTop ?? 0,
      moved: false,
      pointerId: e.pointerId,
      canvasEl
    });
  }

  private beginGesture(e: PointerEvent, state: DragState) {
    this.dragState = state;
    this.lastPointerEvent = null;
    // The drag fast path starts from the first full render inside the gesture.
    this.paintedTasks = null;

    // Capture on the persistent root (bars are re-rendered during the drag), so moves and the
    // release keep arriving even outside the window, and hover effects stay quiet meanwhile.
    // Losing capture only cancels when it was taken on that root: a captured bar loses it
    // whenever a re-render replaces it, which must not abort the drag.
    const captureEl = this.container ?? state.element ?? null;
    if (captureEl && e.pointerId !== undefined) {
      try {
        captureEl.setPointerCapture?.(e.pointerId);
        if (captureEl === this.container) captureEl.addEventListener("lostpointercapture", this.onPointerCancel);
        this.captureEl = captureEl;
      } catch {
        // intentionally ignored: capture is best effort (e.g. a detached element or an inactive
        // pointer id); the window listeners below still receive every move and the release.
      }
    }

    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("keydown", this.onDragKeyDown, true);
    window.addEventListener("blur", this.onPointerCancel);
  }

  /** Detaches every gesture listener and visual and returns the state that was active. */
  private endGesture(): DragState | null {
    const state = this.dragState;
    if (!state) return null;
    this.dragState = null;
    this.lastPointerEvent = null;
    this.paintedTasks = null;

    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("keydown", this.onDragKeyDown, true);
    window.removeEventListener("blur", this.onPointerCancel);

    if (this.autoScrollRafId !== null) {
      window.cancelAnimationFrame(this.autoScrollRafId);
      this.autoScrollRafId = null;
    }

    const captureEl = this.captureEl;
    this.captureEl = null;
    if (captureEl) {
      captureEl.removeEventListener("lostpointercapture", this.onPointerCancel);
      try {
        if (state.pointerId !== undefined && captureEl.hasPointerCapture?.(state.pointerId)) {
          captureEl.releasePointerCapture(state.pointerId);
        }
      } catch {
        // intentionally ignored: the pointer is already gone (released or the element detached),
        // so there is no capture left to release.
      }
    }

    state.selectionBoxEl?.remove();
    if (state.canvasEl) state.canvasEl.style.cursor = "";
    state.element?.classList.remove("is-dragging");
    if (state.taskId) this.findTaskElement(state.taskId)?.classList.remove("is-dragging");
    return state;
  }

  private onPointerMove(e: PointerEvent) {
    const state = this.dragState;
    if (!state || e.pointerId !== state.pointerId) return;

    // The button was released where we could not see it (outside the window or an iframe).
    if (e.pointerType === "mouse" && e.buttons === 0) {
      if (state.moved) {
        this.finishGesture(e);
      } else {
        this.cancelDrag();
      }
      return;
    }

    this.lastPointerEvent = e;
    if (!state.moved) {
      if (Math.abs(e.clientX - state.startX) < DRAG_THRESHOLD_PX && Math.abs(e.clientY - state.startY) < DRAG_THRESHOLD_PX) {
        return;
      }
      state.moved = true;
    }

    this.applyMove(e);
    if (this.autoScrollRafId === null && state.mode !== "split" && state.mode !== "pan") {
      this.autoScrollRafId = window.requestAnimationFrame(this.autoScrollTick);
    }
  }

  private applyMove(e: PointerEvent) {
    const state = this.dragState;
    if (!state) return;
    const changed = this.strategies.get(state.mode)?.onMove(e, state, this.ctx);
    if (changed !== false && DATA_MODES.has(state.mode)) {
      this.scheduleRender(true, true);
    }
  }

  private onPointerUp(e: PointerEvent) {
    const state = this.dragState;
    if (!state || e.pointerId !== state.pointerId) return;
    this.finishGesture(e);
  }

  private onPointerCancel(e: Event) {
    const state = this.dragState;
    if (!state) return;
    // lostpointercapture bubbles: only the root losing its own capture ends the gesture, not a
    // descendant (e.g. a bar whose implicit touch capture moved to the root).
    if (e.type === "lostpointercapture" && e.target !== this.captureEl) return;
    const pointerId = (e as PointerEvent).pointerId;
    if (pointerId !== undefined && state.pointerId !== undefined && pointerId !== state.pointerId) return;
    this.cancelDrag();
  }

  private onDragKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || !this.dragState) return;
    e.preventDefault();
    e.stopPropagation();
    this.cancelDrag();
  }

  private finishGesture(e: PointerEvent) {
    const state = this.endGesture();
    if (!state) return;
    this.strategies.get(state.mode)?.onUp(e, state, this.ctx);
  }

  /**
   * Edge auto-scroll, driven per frame so it keeps going while the pointer rests in the edge
   * zone. The scrolled distance is added to the gesture delta, keeping the bar under the cursor.
   */
  private autoScrollTick() {
    this.autoScrollRafId = null;
    const state = this.dragState;
    const e = this.lastPointerEvent;
    if (!state || !e || !state.moved) return;

    const bodyWrap =
      this.container?.querySelector<HTMLElement>(".jantt-body-wrap") ||
      state.canvasEl?.closest<HTMLElement>(".jantt-body-wrap") ||
      state.element?.closest<HTMLElement>(".jantt-body-wrap");
    if (!bodyWrap) return;
    const rect = bodyWrap.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // Not laid out (hidden or headless).

    // The sticky label column covers the left of the scroll area; scroll from the timeline edge.
    const labelRight = bodyWrap.querySelector<HTMLElement>(".jantt-label-column")?.getBoundingClientRect().right;
    const left = labelRight && labelRight > rect.left && labelRight < rect.right ? labelRight : rect.left;
    const dx = edgeSpeed(e.clientX, left, rect.right);
    // Bars only move along time, so a resting pointer near the bottom must not keep scrolling
    // the dragged row away; links and the marquee do reach other rows.
    const dy = DATA_MODES.has(state.mode) ? 0 : edgeSpeed(e.clientY, rect.top, rect.bottom);
    if (dx === 0 && dy === 0) return;

    const scrollLeft = bodyWrap.scrollLeft;
    const scrollTop = bodyWrap.scrollTop;
    if (dx !== 0) bodyWrap.scrollLeft = scrollLeft + dx;
    if (dy !== 0) bodyWrap.scrollTop = scrollTop + dy;
    const appliedX = bodyWrap.scrollLeft - scrollLeft;
    if (appliedX === 0 && bodyWrap.scrollTop === scrollTop) return; // Reached the scroll bounds.

    state.autoScrollX = (state.autoScrollX ?? 0) + appliedX;
    this.applyMove(e);
    this.autoScrollRafId = window.requestAnimationFrame(this.autoScrollTick);
  }

  /** Touch: opens the task on a clean tap; any other movement is left to native scrolling. */
  private watchTap(down: PointerEvent, taskId: string) {
    const startTime = Date.now();
    const cleanup = () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      this.tapCleanups.delete(cleanup);
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== down.pointerId) return;
      cleanup();
      const isTap =
        Math.abs(up.clientX - down.clientX) < TAP_SLOP_PX &&
        Math.abs(up.clientY - down.clientY) < TAP_SLOP_PX &&
        Date.now() - startTime < TAP_MAX_MS;
      const task = isTap ? this.findTask(taskId) : undefined;
      if (task) {
        this.selectTask(task.id, false);
        this.openTask(task);
      }
    };
    const onCancel = (c: PointerEvent) => {
      if (c.pointerId === down.pointerId) cleanup();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    this.tapCleanups.add(cleanup);
  }

  // ---------------------------------------------------------------------------
  // Data, rendering and host notifications
  // ---------------------------------------------------------------------------

  /** Runs the cascade with the plan's gap and working calendars. */
  private resolve(tasks: Task[]): Task[] {
    return resolveSchedule(tasks, {
      defaultGapDays: this.defaultGapDays,
      calendar: this.data.meta?.calendar,
      useWorkingDays: this.data.meta?.useWorkingDays,
      calendars: this.data.calendars,
      people: this.data.people
    });
  }

  private setTasks(tasks: Task[], triggerCascade?: boolean) {
    this.applyTasks(triggerCascade && this.autoCascade ? this.resolve(tasks) : tasks);
  }

  /** The only writer of the plan's tasks (see the data contract on the class). */
  private applyTasks(tasks: Task[]) {
    if (tasks === this.data.tasks) return;
    const onDataChange = this.hooks.onDataChange;
    if (onDataChange) {
      this.data = { ...this.data, tasks };
      onDataChange(this.data);
    } else {
      this.data.tasks = tasks;
    }
  }

  /** Immutable view of the current plan for host callbacks (the task array is never mutated). */
  private snapshot(): JanttData {
    return { ...this.data, tasks: this.data.tasks };
  }

  private commit() {
    if (this.options.readOnly) return;
    this.options.onCommit?.(this.snapshot());
  }

  private findTask(taskId: string): Task | undefined {
    return this.data.tasks.find((t) => t.id === taskId);
  }

  private findTaskElement(taskId: string): HTMLElement | undefined {
    if (!this.container) return undefined;
    const candidates = this.container.querySelectorAll<HTMLElement>(".jantt-task-bar[data-task-id], .jantt-milestone[data-task-id]");
    for (const el of Array.from(candidates)) {
      if (el.dataset.taskId === taskId) return el;
    }
    return undefined;
  }

  private openTask(task: Task) {
    this.options.onTaskClick?.(task);
    this.openModalHandler(task);
  }

  private applySelection(taskId: string, toggle: boolean) {
    if (toggle) {
      if (this.selectedTaskIds.has(taskId)) {
        this.selectedTaskIds.delete(taskId);
      } else {
        this.selectedTaskIds.add(taskId);
      }
    } else {
      this.selectedTaskIds.clear();
      this.selectedTaskIds.add(taskId);
    }
  }

  /** Re-focuses a task bar after a re-render replaced the focused element (keyboard users). */
  private restoreFocus(taskId: string) {
    if (typeof document === "undefined" || !this.container) return;
    const active = document.activeElement;
    if (active && active !== document.body && this.container.contains(active)) return;
    this.findTaskElement(taskId)?.focus({ preventScroll: true });
  }

  /** Renders immediately (dropping any queued frame); `emitChange` also notifies onChange. */
  private renderNow(emitChange = false) {
    if (emitChange) this.changePending = true;
    if (this.renderRafId !== null) {
      window.cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    this.fullFramePending = false;
    this.renderFully();
    this.afterRender();
  }

  /**
   * Coalesces renders (and onChange notifications) to at most one per animation frame. A frame
   * requested only by drag moves (`gestureFrame`) may be painted through `hooks.onGestureFrame`.
   */
  private scheduleRender(emitChange = false, gestureFrame = false) {
    if (emitChange) this.changePending = true;
    if (!gestureFrame) this.fullFramePending = true;
    if (this.renderRafId !== null) return;
    this.renderRafId = window.requestAnimationFrame(() => {
      this.renderRafId = null;
      const full = this.fullFramePending;
      this.fullFramePending = false;
      if (full || !this.paintGestureFrame()) this.renderFully();
      this.afterRender();
    });
  }

  private renderFully() {
    this.onRenderRequest();
    const state = this.dragState;
    if (!state) return;
    this.paintedTasks = this.data.tasks;
    // The render replaced the dragged bar: restore its drag styling.
    if (state.taskId && DATA_MODES.has(state.mode)) {
      this.findTaskElement(state.taskId)?.classList.add("is-dragging");
    }
  }

  /**
   * Drag fast path: hands the host the ids of the tasks that differ from the last full render of
   * this gesture (edits are copy-on-write and keep the order; the cascade may copy unchanged
   * tasks, so copies are compared by value). Returns false, asking for a full render, when the
   * host has no hook, declines the frame, or the task list itself changed.
   */
  private paintGestureFrame(): boolean {
    const onGestureFrame = this.hooks.onGestureFrame;
    const state = this.dragState;
    const painted = this.paintedTasks;
    const tasks = this.data.tasks;
    if (!onGestureFrame || !state || !DATA_MODES.has(state.mode) || !painted || painted.length !== tasks.length) return false;
    const changed = new Set<string>();
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id !== painted[i].id) return false;
      if (!sameFields(tasks[i], painted[i])) changed.add(tasks[i].id);
    }
    if (!onGestureFrame(changed)) return false;
    this.paintedTasks = tasks;
    return true;
  }

  private afterRender() {
    if (this.changePending) {
      this.changePending = false;
      this.options.onChange?.(this.snapshot());
    }
  }

  private queueSplitResize(width: number, isFinal?: boolean) {
    this.pendingSplitWidth = width;
    if (isFinal) {
      if (this.splitRafId !== null) {
        window.cancelAnimationFrame(this.splitRafId);
        this.splitRafId = null;
      }
      this.onSplitResize?.(width, true);
      return;
    }
    if (this.splitRafId !== null) return;
    this.splitRafId = window.requestAnimationFrame(() => {
      this.splitRafId = null;
      this.onSplitResize?.(this.pendingSplitWidth);
    });
  }
}
