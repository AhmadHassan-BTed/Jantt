import { JanttData, Task, JanttOptions, TaskLayout } from "./types";
import { addDays, diffDays } from "./date-math";
import { resolveSchedule, getTaskDependencies } from "./resolver";
import { DEFAULT_GAP_DAYS } from "./constants";
import {
  DragMode,
  DragState,
  GestureContext,
  IGestureStrategy,
  MoveGestureStrategy,
  ResizeGestureStrategy,
  ProgressGestureStrategy,
  LinkGestureStrategy,
  SplitterGestureStrategy,
  MarqueeGestureStrategy
} from "./controller/index";

export type { DragMode, DragState, GestureContext, IGestureStrategy };

/**
 * Enterprise gesture and interaction controller for Jantt.
 * Employs the Strategy Pattern to decouple gesture mechanics into isolated, testable strategies.
 */
export class InteractionController {
  private data: JanttData;
  private options: JanttOptions;
  private dragState: DragState | null = null;
  private dayWidth: number;
  private defaultGapDays: number;
  private selectedTaskIds = new Set<string>();
  private autoCascade: boolean = true;
  private onRenderRequest: () => void;
  private openModalHandler: (task: Task) => void;
  private onLiveLinkUpdate?: (wireData: { fromX: number; fromY: number; toX: number; toY: number } | null) => void;
  private onSplitResize?: (newWidth: number) => void;
  private container?: HTMLElement;
  private renderRafId: number | null = null;

  private readonly strategies = new Map<DragMode, IGestureStrategy>([
    ["move", new MoveGestureStrategy()],
    ["resize", new ResizeGestureStrategy()],
    ["progress", new ProgressGestureStrategy()],
    ["link", new LinkGestureStrategy()],
    ["split", new SplitterGestureStrategy()],
    ["marquee", new MarqueeGestureStrategy()]
  ] as Array<[DragMode, IGestureStrategy]>);

  private scheduleRender() {
    if (this.renderRafId !== null) return;
    this.renderRafId = window.requestAnimationFrame(() => {
      this.renderRafId = null;
      this.onRenderRequest();
    });
  }

  constructor(
    data: JanttData,
    options: JanttOptions,
    dayWidth: number,
    onRenderRequest: () => void,
    openModalHandler: (task: Task) => void,
    onLiveLinkUpdate?: (wireData: { fromX: number; fromY: number; toX: number; toY: number } | null) => void,
    onSplitResize?: (newWidth: number) => void,
    container?: HTMLElement
  ) {
    this.data = data;
    this.options = options;
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
  }

  private createGestureContext(): GestureContext {
    return {
      data: this.data,
      options: this.options,
      dayWidth: this.dayWidth,
      defaultGapDays: this.defaultGapDays,
      autoCascade: this.autoCascade,
      selectedTaskIds: this.selectedTaskIds,
      container: this.container,
      openModalHandler: this.openModalHandler,
      onLiveLinkUpdate: this.onLiveLinkUpdate,
      onSplitResize: this.onSplitResize,
      onRenderRequest: this.onRenderRequest,
      scheduleRender: () => this.scheduleRender(),
      selectTask: (taskId, toggle) => this.selectTask(taskId, toggle),
      clearSelection: () => this.clearSelection(),
      setTasks: (tasks, triggerCascade) => {
        if (triggerCascade && this.autoCascade) {
          this.data.tasks = resolveSchedule(tasks, this.defaultGapDays);
        } else {
          this.data.tasks = tasks;
        }
      },
      commitData: () => {
        this.options.onCommit?.(this.data);
      }
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

  public destroy() {
    if (this.renderRafId !== null) {
      window.cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    if (this.dragState?.selectionBoxEl?.parentNode) {
      this.dragState.selectionBoxEl.parentNode.removeChild(this.dragState.selectionBoxEl);
    }
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.dragState = null;
    this.selectedTaskIds.clear();
  }

  public getSelectedTaskIds(): Set<string> {
    return this.selectedTaskIds;
  }

  public isSelected(taskId: string): boolean {
    return this.selectedTaskIds.has(taskId);
  }

  public clearSelection() {
    this.selectedTaskIds.clear();
    this.onRenderRequest();
  }

  public isAutoCascade(): boolean {
    return this.autoCascade;
  }

  public setAutoCascade(val: boolean) {
    this.autoCascade = val;
    this.onRenderRequest();
  }

  public toggleAutoCascade(): boolean {
    this.autoCascade = !this.autoCascade;
    if (this.autoCascade) {
      this.data.tasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
      this.options.onCommit?.(this.data);
    }
    return this.autoCascade;
  }

  public toggleTaskLock(taskId: string) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.locked = !task.locked;
    if (this.autoCascade) {
      this.data.tasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
    }
    this.onRenderRequest();
    this.options.onChange?.(this.data);
    this.options.onCommit?.(this.data);
  }

  public selectTask(taskId: string, toggle = false) {
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
    this.onRenderRequest();
  }

  public startMarqueeSelection(e: PointerEvent, canvasEl: HTMLElement, taskLayouts: TaskLayout[]) {
    if (this.options.readOnly) return;
    if (e.button !== 0 && e.button !== 2) return;

    e.preventDefault();

    const canvasRect = canvasEl.getBoundingClientRect();
    const startCanvasX = e.clientX - canvasRect.left + canvasEl.scrollLeft;
    const startCanvasY = e.clientY - canvasRect.top + canvasEl.scrollTop;

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      this.selectedTaskIds.clear();
    }

    const selectionBox = document.createElement("div");
    selectionBox.className = "jantt-selection-box";
    selectionBox.style.left = `${startCanvasX}px`;
    selectionBox.style.top = `${startCanvasY}px`;
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    canvasEl.appendChild(selectionBox);

    this.dragState = {
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
    };

    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  public startDrag(e: PointerEvent, task: Task, mode: DragMode, el?: HTMLElement) {
    if (this.options.readOnly || (task.locked && (mode === "move" || mode === "resize" || mode === "progress"))) {
      if (e.button === 0 && (mode === "move" || mode === "resize")) {
        this.openModalHandler(task);
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (mode === "move") {
      const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isModifier) {
        this.selectTask(task.id, true);
      } else if (!this.selectedTaskIds.has(task.id)) {
        this.selectTask(task.id, false);
      }
    }

    if (el && e.pointerId !== undefined) {
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore pointer capture errors
      }
    }

    const multiTasks = new Map<string, { start: string; end: string }>();
    if (this.selectedTaskIds.has(task.id) && this.selectedTaskIds.size > 1) {
      this.selectedTaskIds.forEach((id) => {
        const t = this.data.tasks.find((item) => item.id === id);
        if (t && t.start && t.end && !t.locked) {
          multiTasks.set(id, { start: t.start, end: t.end });
        }
      });
    } else {
      multiTasks.set(task.id, { start: task.start, end: task.end });
    }

    this.dragState = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origStart: task.start,
      origEnd: task.end,
      origProgress: task.progress ?? 0,
      moved: false,
      element: el,
      pointerId: e.pointerId,
      linkFromTaskId: mode === "link" ? task.id : undefined,
      multiTasks
    };

    el?.classList.add("is-dragging");

    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  public startSplitterDrag(e: PointerEvent, currentWidth: number) {
    e.preventDefault();
    e.stopPropagation();

    this.dragState = {
      mode: "split",
      startX: e.clientX,
      startY: e.clientY,
      origLabelWidth: currentWidth,
      moved: false,
      pointerId: e.pointerId
    };

    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.dragState) return;

    const deltaX = e.clientX - this.dragState.startX;
    const deltaY = e.clientY - this.dragState.startY;

    if (Math.abs(deltaX) >= 3 || Math.abs(deltaY) >= 3) {
      this.dragState.moved = true;
    }

    const ctx = this.createGestureContext();
    const strategy = this.strategies.get(this.dragState.mode);
    if (strategy) {
      strategy.onMove(e, this.dragState, ctx);
    }

    // Auto-scroll when dragging near or past viewport boundaries (for timeline interactions)
    if (this.dragState.mode !== "split") {
      const bodyWrap =
        this.container?.querySelector<HTMLElement>(".jantt-body-wrap") ||
        this.dragState.element?.closest<HTMLElement>(".jantt-body-wrap") ||
        this.dragState.canvasEl?.closest<HTMLElement>(".jantt-body-wrap") ||
        document.querySelector<HTMLElement>(".jantt-body-wrap");
      if (bodyWrap) {
        const rect = bodyWrap.getBoundingClientRect();
        if (e.clientX > rect.right - 50) {
          bodyWrap.scrollLeft += 15;
        } else if (e.clientX < rect.left + 50) {
          bodyWrap.scrollLeft -= 15;
        }
        if (e.clientY > rect.bottom - 50) {
          bodyWrap.scrollTop += 15;
        } else if (e.clientY < rect.top + 50) {
          bodyWrap.scrollTop -= 15;
        }
      }
    }

    if (this.dragState.mode !== "split" && this.dragState.mode !== "marquee" && this.dragState.mode !== "link") {
      this.scheduleRender();
      this.options.onChange?.(this.data);
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.dragState) return;

    const { element, pointerId, selectionBoxEl } = this.dragState;

    if (selectionBoxEl && selectionBoxEl.parentNode) {
      selectionBoxEl.parentNode.removeChild(selectionBoxEl);
    }

    if (element && pointerId !== undefined) {
      try {
        element.releasePointerCapture?.(pointerId);
      } catch {
        // Ignore
      }
      element.classList.remove("is-dragging");
    }

    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);

    const activeState = this.dragState;
    this.dragState = null;

    if (this.renderRafId !== null) {
      window.cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }

    const ctx = this.createGestureContext();
    const strategy = this.strategies.get(activeState.mode);
    if (strategy) {
      strategy.onUp(e, activeState, ctx);
    }
  }

  public handleKeyDown(e: KeyboardEvent, task: Task) {
    if (e.key === "Escape") {
      this.clearSelection();
      return;
    }

    if (this.options.readOnly || task.locked) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.openModalHandler(task);
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const taskIdToDelete = task.id;
      const nextTasks = this.data.tasks.filter((t) => t.id !== taskIdToDelete);
      nextTasks.forEach((t) => {
        const remaining = getTaskDependencies(t).filter((id) => id !== taskIdToDelete);
        t.dependsOn = remaining.length === 0 ? null : remaining.length === 1 ? remaining[0] : remaining;
      });
      this.selectedTaskIds.delete(taskIdToDelete);
      const resolved = this.autoCascade ? resolveSchedule(nextTasks, this.defaultGapDays) : nextTasks;
      this.data = { ...this.data, tasks: resolved };
      this.onRenderRequest();
      this.options.onTaskDelete?.(taskIdToDelete);
      this.options.onChange?.(this.data);
      this.options.onCommit?.(this.data);
      return;
    }

    const origDuration = Math.max(diffDays(task.start, task.end), 0);
    let modified = false;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.altKey ? this.defaultGapDays : 1;
      if (e.shiftKey) {
        if (origDuration > 0) {
          task.end = addDays(task.end, -1);
          modified = true;
        }
      } else {
        task.start = addDays(task.start, -step);
        task.end = addDays(task.end, -step);
        modified = true;
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.altKey ? this.defaultGapDays : 1;
      if (e.shiftKey) {
        task.end = addDays(task.end, 1);
        if (task.milestone && diffDays(task.start, task.end) > 0) {
          task.milestone = false;
        }
        modified = true;
      } else {
        task.start = addDays(task.start, step);
        task.end = addDays(task.end, step);
        modified = true;
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.openModalHandler(task);
      return;
    }

    if (modified) {
      if (this.autoCascade) {
        const resolved = resolveSchedule(this.data.tasks, this.defaultGapDays);
        this.data = { ...this.data, tasks: resolved };
      }
      this.onRenderRequest();
      this.options.onChange?.(this.data);
      this.options.onCommit?.(this.data);
    }
  }
}
