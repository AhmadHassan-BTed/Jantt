import { JanttData, Task, JanttOptions } from "./types";
import { addDays, diffDays } from "./date-math";
import { resolveSchedule } from "./resolver";

export type DragMode = "move" | "resize";

export interface DragState {
  taskId: string;
  mode: DragMode;
  startX: number;
  origStart: string;
  origEnd: string;
  moved: boolean;
  element: HTMLElement;
  pointerId: number;
}

export class InteractionController {
  private data: JanttData;
  private options: JanttOptions;
  private dragState: DragState | null = null;
  private dayWidth: number;
  private defaultGapDays: number;
  private onRenderRequest: () => void;
  private openModalHandler: (task: Task) => void;

  constructor(
    data: JanttData,
    options: JanttOptions,
    dayWidth: number,
    onRenderRequest: () => void,
    openModalHandler: (task: Task) => void
  ) {
    this.data = data;
    this.options = options;
    this.dayWidth = dayWidth;
    this.defaultGapDays = data.meta?.defaultGapDays ?? 2;
    this.onRenderRequest = onRenderRequest;
    this.openModalHandler = openModalHandler;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  public updateData(newData: JanttData, dayWidth?: number) {
    this.data = newData;
    if (dayWidth) this.dayWidth = dayWidth;
    this.defaultGapDays = newData.meta?.defaultGapDays ?? 2;
  }

  public startDrag(e: PointerEvent, task: Task, mode: DragMode, el: HTMLElement) {
    if (this.options.readOnly || task.locked) {
      if (e.button === 0) {
        // Locked task click
        this.openModalHandler(task);
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    el.setPointerCapture?.(e.pointerId);

    this.dragState = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      origStart: task.start,
      origEnd: task.end,
      moved: false,
      element: el,
      pointerId: e.pointerId
    };

    el.classList.add("is-dragging");

    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.dragState) return;

    const deltaPx = e.clientX - this.dragState.startX;
    if (Math.abs(deltaPx) >= 4) {
      this.dragState.moved = true;
    }

    const deltaDays = Math.round(deltaPx / this.dayWidth);
    const task = this.data.tasks.find((t) => t.id === this.dragState!.taskId);
    if (!task) return;

    if (this.dragState.mode === "move") {
      const origDuration = Math.max(diffDays(this.dragState.origStart, this.dragState.origEnd), 1);
      const newStart = addDays(this.dragState.origStart, deltaDays);
      task.start = newStart;
      task.end = addDays(newStart, origDuration);
    } else if (this.dragState.mode === "resize") {
      const newEnd = addDays(this.dragState.origEnd, deltaDays);
      if (diffDays(this.dragState.origStart, newEnd) >= 1) {
        task.end = newEnd;
      }
    }

    this.onRenderRequest();
    this.options.onChange?.(this.data);
  }

  private onPointerUp() {
    if (!this.dragState) return;

    const { element, taskId, moved, pointerId } = this.dragState;

    try {
      element.releasePointerCapture?.(pointerId);
    } catch {
      // Ignore pointer release errors
    }

    element.classList.remove("is-dragging");
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);

    const task = this.data.tasks.find((t) => t.id === taskId);
    this.dragState = null;

    if (!task) return;

    if (!moved) {
      // Click event
      this.options.onTaskClick?.(task);
      this.openModalHandler(task);
    } else {
      // Drag/resize commit with dependency cascade
      const resolvedTasks = resolveSchedule(this.data.tasks, this.defaultGapDays);
      this.data = {
        ...this.data,
        tasks: resolvedTasks
      };
      this.onRenderRequest();
      this.options.onCommit?.(this.data);
    }
  }

  /**
   * Keyboard accessible bar manipulation
   */
  public handleKeyDown(e: KeyboardEvent, task: Task) {
    if (this.options.readOnly || task.locked) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.openModalHandler(task);
      }
      return;
    }

    const origDuration = Math.max(diffDays(task.start, task.end), 1);
    let modified = false;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.altKey ? this.defaultGapDays : 1;
      if (e.shiftKey) {
        // Resize shrink
        if (origDuration > 1) {
          task.end = addDays(task.end, -1);
          modified = true;
        }
      } else {
        // Move left
        task.start = addDays(task.start, -step);
        task.end = addDays(task.end, -step);
        modified = true;
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.altKey ? this.defaultGapDays : 1;
      if (e.shiftKey) {
        // Resize grow
        task.end = addDays(task.end, 1);
        modified = true;
      } else {
        // Move right
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
