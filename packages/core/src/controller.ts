import { JanttData, Task, JanttOptions, TaskLayout } from "./types";
import { addDays, diffDays } from "./date-math";
import { resolveSchedule, getTaskDependencies } from "./resolver";
import { getEffectiveGap } from "./utils";
import { DEFAULT_GAP_DAYS } from "./constants";

export type DragMode = "move" | "resize" | "progress" | "link" | "split" | "marquee";

export interface DragState {
  taskId?: string;
  mode: DragMode;
  startX: number;
  startY: number;
  canvasStartX?: number;
  canvasStartY?: number;
  origStart?: string;
  origEnd?: string;
  origProgress?: number;
  origLabelWidth?: number;
  moved: boolean;
  element?: HTMLElement;
  pointerId?: number;
  linkFromTaskId?: string;
  multiTasks?: Map<string, { start: string; end: string }>;
  selectionBoxEl?: HTMLElement;
  canvasEl?: HTMLElement;
  taskLayouts?: TaskLayout[];
}

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

  constructor(
    data: JanttData,
    options: JanttOptions,
    dayWidth: number,
    onRenderRequest: () => void,
    openModalHandler: (task: Task) => void,
    onLiveLinkUpdate?: (wireData: { fromX: number; fromY: number; toX: number; toY: number } | null) => void,
    onSplitResize?: (newWidth: number) => void
  ) {
    this.data = data;
    this.options = options;
    this.dayWidth = dayWidth;
    this.defaultGapDays = data.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
    this.onRenderRequest = onRenderRequest;
    this.openModalHandler = openModalHandler;
    this.onLiveLinkUpdate = onLiveLinkUpdate;
    this.onSplitResize = onSplitResize;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  public updateData(newData: JanttData, dayWidth?: number) {
    this.data = newData;
    if (dayWidth) this.dayWidth = dayWidth;
    this.defaultGapDays = newData.meta?.defaultGapDays ?? DEFAULT_GAP_DAYS;
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
    this.onRenderRequest();
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

  /**
   * Starts Marquee / Rectangle Lasso selection when clicking or dragging on empty canvas area.
   */
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

    // Multi-task selection logic on click/drag
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
        // Ignore
      }
    }

    // Capture state for all currently selected tasks for synchronized multi-drag shift
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

    // Marquee Rectangle Selection Box
    if (this.dragState.mode === "marquee" && this.dragState.selectionBoxEl && this.dragState.canvasEl) {
      const canvasRect = this.dragState.canvasEl.getBoundingClientRect();
      const curCanvasX = e.clientX - canvasRect.left + this.dragState.canvasEl.scrollLeft;
      const curCanvasY = e.clientY - canvasRect.top + this.dragState.canvasEl.scrollTop;

      const left = Math.min(this.dragState.canvasStartX!, curCanvasX);
      const top = Math.min(this.dragState.canvasStartY!, curCanvasY);
      const width = Math.abs(curCanvasX - this.dragState.canvasStartX!);
      const height = Math.abs(curCanvasY - this.dragState.canvasStartY!);

      this.dragState.selectionBoxEl.style.left = `${left}px`;
      this.dragState.selectionBoxEl.style.top = `${top}px`;
      this.dragState.selectionBoxEl.style.width = `${width}px`;
      this.dragState.selectionBoxEl.style.height = `${height}px`;

      // Calculate intersection with all task layouts
      if (this.dragState.taskLayouts) {
        this.dragState.taskLayouts.forEach((tl) => {
          const taskRight = tl.x + tl.width;
          const taskBottom = tl.y + tl.height;
          const intersects =
            tl.x < left + width && taskRight > left && tl.y < top + height && taskBottom > top;

          if (intersects) {
            this.selectedTaskIds.add(tl.task.id);
          } else if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            this.selectedTaskIds.delete(tl.task.id);
          }
        });

        // Visually update selected state on DOM task bars in real-time
        this.dragState.canvasEl.querySelectorAll<HTMLElement>("[data-task-id]").forEach((bar) => {
          const tId = bar.dataset.taskId!;
          if (this.selectedTaskIds.has(tId)) {
            bar.classList.add("is-selected");
          } else {
            bar.classList.remove("is-selected");
          }
        });
      }
      return;
    }

    if (this.dragState.mode === "split") {
      const newWidth = Math.max(180, Math.min(600, (this.dragState.origLabelWidth || 320) + deltaX));
      this.onSplitResize?.(newWidth);
      return;
    }

    if (this.dragState.mode === "link") {
      if (this.onLiveLinkUpdate && this.dragState.element) {
        const rect = this.dragState.element.getBoundingClientRect();
        this.onLiveLinkUpdate({
          fromX: rect.right,
          fromY: rect.top + rect.height / 2,
          toX: e.clientX,
          toY: e.clientY
        });
      }
      return;
    }

    const deltaDays = Math.round(deltaX / this.dayWidth);
    const task = this.data.tasks.find((t) => t.id === this.dragState!.taskId);
    if (!task) return;

    // Multi-task synchronized dragging shift
    if (this.dragState.mode === "move") {
      if (this.dragState.multiTasks && this.dragState.multiTasks.size > 1) {
        this.dragState.multiTasks.forEach((orig, id) => {
          const target = this.data.tasks.find((t) => t.id === id);
          if (target) {
            const origDur = Math.max(diffDays(orig.start, orig.end), 0);
            const newStart = addDays(orig.start, deltaDays);
            target.start = newStart;
            target.end = addDays(newStart, origDur);
          }
        });
      } else {
        const origDuration = Math.max(diffDays(this.dragState.origStart!, this.dragState.origEnd!), 0);
        let newStart = addDays(this.dragState.origStart!, deltaDays);

        // If strict limit mode is active (!autoCascade), clamp start date to not violate prerequisite ends
        if (!this.autoCascade) {
          const deps = getTaskDependencies(task);
          for (const depId of deps) {
            const prereq = this.data.tasks.find((t) => t.id === depId);
            if (prereq) {
              const minAllowed = addDays(prereq.end, getEffectiveGap(task, this.defaultGapDays));
              if (diffDays(minAllowed, newStart) < 0) {
                newStart = minAllowed;
              }
            }
          }
        }

        task.start = newStart;
        task.end = addDays(newStart, origDuration);
      }

      // If auto-adjust cascade is active, automatically adjust downstream dependent tasks in real-time!
      if (this.autoCascade) {
        this.data.tasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
      }
    } else if (this.dragState.mode === "resize") {
      const newEnd = addDays(this.dragState.origEnd!, deltaDays);
      if (diffDays(this.dragState.origStart!, newEnd) >= (task.milestone ? 0 : 1)) {
        task.end = newEnd;
      }
      if (this.autoCascade) {
        this.data.tasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
      }
    } else if (this.dragState.mode === "progress") {
      const barWidth = Math.max(diffDays(task.start, task.end) * this.dayWidth, 30);
      const deltaRatio = deltaX / barWidth;
      const newProgress = Math.max(0, Math.min(1, (this.dragState.origProgress || 0) + deltaRatio));
      task.progress = Math.round(newProgress * 100) / 100;
    }

    // Auto-scroll when dragging near or past viewport boundaries
    const bodyWrap = document.querySelector<HTMLElement>(".jantt-body-wrap");
    if (bodyWrap) {
      const rect = bodyWrap.getBoundingClientRect();
      if (e.clientX > rect.right - 50) {
        bodyWrap.scrollLeft += 15;
      } else if (e.clientX < rect.left + 50) {
        bodyWrap.scrollLeft -= 15;
      }
    }

    this.onRenderRequest();
    this.options.onChange?.(this.data);
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.dragState) return;

    const { element, taskId, mode, moved, pointerId, linkFromTaskId, selectionBoxEl } = this.dragState;

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

    this.dragState = null;

    if (mode === "split" || mode === "marquee") {
      if (mode === "marquee" && !moved) {
        this.clearSelection();
      }
      return;
    }

    if (mode === "link") {
      this.onLiveLinkUpdate?.(null);
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const targetBar = targetElement?.closest<HTMLElement>("[data-task-id]");
      const targetTaskId = targetBar?.dataset.taskId;

      if (linkFromTaskId && targetTaskId && targetTaskId !== linkFromTaskId) {
        const targetTask = this.data.tasks.find((t) => t.id === targetTaskId);
        if (targetTask) {
          const existing = getTaskDependencies(targetTask);
          if (!existing.includes(linkFromTaskId)) {
            if (existing.length === 0) {
              targetTask.dependsOn = linkFromTaskId;
            } else {
              targetTask.dependsOn = [...existing, linkFromTaskId];
            }
          }
          const resolvedTasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
          this.data = { ...this.data, tasks: resolvedTasks };
          this.onRenderRequest();
          this.options.onLinkCreate?.(linkFromTaskId, targetTaskId);
          this.options.onCommit?.(this.data);
        }
      }
      return;
    }

    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!moved && (mode === "move" || mode === "resize")) {
      this.options.onTaskClick?.(task);
      this.openModalHandler(task);
    } else {
      if (this.autoCascade) {
        const resolvedTasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
        this.data = {
          ...this.data,
          tasks: resolvedTasks
        };
      }
      this.onRenderRequest();
      this.options.onCommit?.(this.data);
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
