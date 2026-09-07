import { IGestureStrategy, DragState, GestureContext } from "../contracts";
import { addDays, diffDays } from "../../date-math";
import { resolveSchedule } from "../../resolver";

export class ResizeGestureStrategy implements IGestureStrategy {
  public readonly mode = "resize" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const deltaX = e.clientX - state.startX;
    const deltaDays = Math.round(deltaX / ctx.dayWidth);
    const task = ctx.data.tasks.find((t) => t.id === state.taskId);
    if (!task) return;

    const newEnd = addDays(state.origEnd!, deltaDays);
    if (diffDays(state.origStart!, newEnd) >= (task.milestone ? 0 : 1)) {
      task.end = newEnd;
    }
    if (ctx.autoCascade) {
      ctx.data.tasks = resolveSchedule(ctx.data.tasks, ctx.defaultGapDays);
    }
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const task = ctx.data.tasks.find((t) => t.id === state.taskId);
    if (!task) return;

    if (!state.moved) {
      ctx.options.onTaskClick?.(task);
      ctx.openModalHandler(task);
    } else {
      if (ctx.autoCascade) {
        ctx.data.tasks = resolveSchedule(ctx.data.tasks, ctx.defaultGapDays);
      }
      ctx.onRenderRequest();
      ctx.commitData();
    }
  }
}
