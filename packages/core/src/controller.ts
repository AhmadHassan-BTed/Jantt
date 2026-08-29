import { JanttData, Task, JanttOptions } from "./types";
import { addDays, diffDays } from "./date-math";
import { resolveSchedule, getTaskDependencies } from "./resolver";

export type DragMode = "move" | "resize" | "progress" | "link" | "split";

export interface DragState {
  taskId?: string;
  mode: DragMode;
  startX: number;
  startY: number;
  origStart?: string;
  origEnd?: string;
  origProgress?: number;
  origLabelWidth?: number;
  moved: boolean;
  element?: HTMLElement;
  pointerId?: number;
  linkFromTaskId?: string;
}

export class InteractionController {
  private data: JanttData;
  private options: JanttOptions;
  private dragState: DragState | null = null;
  private dayWidth: number;
  private defaultGapDays: number;
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
    this.defaultGapDays = data.meta?.defaultGapDays ?? 2;
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
    this.defaultGapDays = newData.meta?.defaultGapDays ?? 2;
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

    if (el && e.pointerId !== undefined) {
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore
      }
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
      linkFromTaskId: mode === "link" ? task.id : undefined
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
    if (Math.abs(deltaX) >= 3) {
      this.dragState.moved = true;
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

    if (this.dragState.mode === "move") {
      const origDuration = Math.max(diffDays(this.dragState.origStart!, this.dragState.origEnd!), 0);
      const newStart = addDays(this.dragState.origStart!, deltaDays);
      task.start = newStart;
      task.end = addDays(newStart, origDuration);
    } else if (this.dragState.mode === "resize") {
      const newEnd = addDays(this.dragState.origEnd!, deltaDays);
      if (diffDays(this.dragState.origStart!, newEnd) >= (task.milestone ? 0 : 1)) {
        task.end = newEnd;
      }
    } else if (this.dragState.mode === "progress") {
      const barWidth = Math.max(diffDays(task.start, task.end) * this.dayWidth, 30);
      const deltaRatio = deltaX / barWidth;
      const newProgress = Math.max(0, Math.min(1, (this.dragState.origProgress || 0) + deltaRatio));
      task.progress = Math.round(newProgress * 100) / 100;
    }

    this.onRenderRequest();
    this.options.onChange?.(this.data);
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.dragState) return;

    const { element, taskId, mode, moved, pointerId, linkFromTaskId } = this.dragState;

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

    if (mode === "split") {
      return;
    }

    if (mode === "link") {
      this.onLiveLinkUpdate?.(null);
      // Determine target task under pointer
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
      const resolvedTasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
      this.data = {
        ...this.data,
        tasks: resolvedTasks
      };
      this.onRenderRequest();
      this.options.onCommit?.(this.data);
    }
  }

  public handleKeyDown(e: KeyboardEvent, task: Task) {
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
      const resolved = resolveSchedule(this.data.tasks, this.defaultGapDays);
      this.data = { ...this.data, tasks: resolved };
      this.onRenderRequest();
      this.options.onChange?.(this.data);
      this.options.onCommit?.(this.data);
    }
  }
}
