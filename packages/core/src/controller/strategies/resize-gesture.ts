import { IGestureStrategy, DragState, GestureContext } from "../contracts";
import { addDays, diffDays } from "../../date-math";

export class ResizeGestureStrategy implements IGestureStrategy {
  public readonly mode = "resize" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): boolean {
    const deltaDays = Math.round((e.clientX - state.startX + (state.autoScrollX ?? 0)) / ctx.dayWidth);
    if (deltaDays === state.lastValue) return false;

    const base = state.origTasks ?? ctx.data.tasks;
    const task = base.find((t) => t.id === state.taskId);
    if (!task) return false;
    state.lastValue = deltaDays;

    if (deltaDays === 0 && state.origTasks) {
      ctx.setTasks(state.origTasks);
      return true;
    }

    const origStart = state.origStart ?? task.start;
    const minDays = task.milestone ? 0 : 1;
    let newEnd = addDays(state.origEnd ?? task.end, deltaDays);
    if (diffDays(origStart, newEnd) < minDays) {
      newEnd = addDays(origStart, minDays);
    }
    ctx.setTasks(
      base.map((t) => (t === task ? { ...t, end: newEnd } : t)),
      true
    );
    return true;
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const task = ctx.data.tasks.find((t) => t.id === state.taskId);
    if (!task) return;

    if (!state.moved) {
      ctx.options.onTaskClick?.(task);
      ctx.openModalHandler(task);
      return;
    }
    ctx.onRenderRequest();
    if (!state.origTasks || ctx.data.tasks !== state.origTasks) {
      ctx.commitData();
    }
  }
}
