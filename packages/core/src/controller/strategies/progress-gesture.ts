import { IGestureStrategy, DragState, GestureContext } from "../contracts";
import { diffDays } from "../../date-math";
import { syncTaskProgressAndStatus } from "../../utils";

/** Minimum bar width drawn by the layout engine (px). */
const MIN_BAR_WIDTH = 14;

export class ProgressGestureStrategy implements IGestureStrategy {
  public readonly mode = "progress" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): boolean {
    const base = state.origTasks ?? ctx.data.tasks;
    const task = base.find((t) => t.id === state.taskId);
    if (!task) return false;

    // Map the pointer onto the bar as drawn (inclusive end), not onto end - start.
    const barWidth =
      state.barWidth && state.barWidth > 0
        ? state.barWidth
        : Math.max((Math.max(diffDays(task.start, task.end), 0) + 1) * ctx.dayWidth, MIN_BAR_WIDTH);
    const deltaX = e.clientX - state.startX + (state.autoScrollX ?? 0);
    const progress = Math.round(Math.max(0, Math.min(1, (state.origProgress ?? 0) + deltaX / barWidth)) * 100) / 100;
    if (progress === state.lastValue) return false;
    state.lastValue = progress;

    if (state.origTasks && progress === (task.progress ?? 0)) {
      ctx.setTasks(state.origTasks);
      return true;
    }
    // Progress never moves dates, so no cascade is needed.
    const synced = syncTaskProgressAndStatus({ progress }, task);
    ctx.setTasks(base.map((t) => (t === task ? { ...t, ...synced } : t)));
    return true;
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    // A click on the handle without dragging changes nothing and must not create a commit.
    if (!state.moved) return;
    ctx.onRenderRequest();
    if (!state.origTasks || ctx.data.tasks !== state.origTasks) {
      ctx.commitData();
    }
  }
}
