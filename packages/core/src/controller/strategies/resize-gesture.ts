import { IGestureStrategy, DragState, GestureContext, constrainedStart } from "../contracts";
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
    const origEnd = state.origEnd ?? task.end;
    const minDays = task.milestone ? 0 : 1;
    let start = origStart, end = origEnd;
    if (state.resizeStart) {
      start = addDays(origStart, deltaDays);
      if (diffDays(start, end) < minDays) start = addDays(end, -minDays);
      if (!ctx.autoCascade) {
        state.origById ??= new Map(base.map(item => [item.id, item]));
        const lookup = state.origById;
        const limit = constrainedStart({ ...task, start, end }, id => lookup.get(id), ctx.resolve, lookup);
        if (start < limit) start = limit;
        if (diffDays(start, end) < minDays) return false;
      }
    } else {
      end = addDays(origEnd, deltaDays);
      if (diffDays(start, end) < minDays) end = addDays(start, minDays);
    }
    ctx.setTasks(base.map(t => t === task ? { ...t, start, end } : t), true);
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
