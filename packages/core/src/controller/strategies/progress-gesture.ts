import { IGestureStrategy, DragState, GestureContext } from "../contracts";
import { diffDays } from "../../date-math";
import { syncTaskProgressAndStatus } from "../../utils";
import { resolveSchedule } from "../../resolver";

export class ProgressGestureStrategy implements IGestureStrategy {
  public readonly mode = "progress" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const deltaX = e.clientX - state.startX;
    const task = ctx.data.tasks.find((t) => t.id === state.taskId);
    if (!task) return;

    const barWidth = Math.max(diffDays(task.start, task.end) * ctx.dayWidth, 30);
    const deltaRatio = deltaX / barWidth;
    const newProgress = Math.max(0, Math.min(1, (state.origProgress || 0) + deltaRatio));
    const roundedProg = Math.round(newProgress * 100) / 100;
    const synced = syncTaskProgressAndStatus({ progress: roundedProg }, task);
    Object.assign(task, synced);
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const task = ctx.data.tasks.find((t) => t.id === state.taskId);
    if (!task) return;

    const synced = syncTaskProgressAndStatus({ progress: task.progress }, task);
    Object.assign(task, synced);

    if (ctx.autoCascade) {
      ctx.data.tasks = resolveSchedule(ctx.data.tasks, ctx.defaultGapDays);
    }
    ctx.onRenderRequest();
    ctx.commitData();
  }
}
