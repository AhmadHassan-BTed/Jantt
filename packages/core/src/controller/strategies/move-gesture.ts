import { IGestureStrategy, DragState, GestureContext } from "../contracts";
import { addDays, diffDays } from "../../date-math";
import { getTaskDependencies, resolveSchedule } from "../../resolver";
import { getEffectiveGap } from "../../utils";

export class MoveGestureStrategy implements IGestureStrategy {
  public readonly mode = "move" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const deltaX = e.clientX - state.startX;
    const deltaDays = Math.round(deltaX / ctx.dayWidth);
    const task = ctx.data.tasks.find((t) => t.id === state.taskId);
    if (!task) return;

    if (state.multiTasks && state.multiTasks.size > 1) {
      state.multiTasks.forEach((orig, id) => {
        const target = ctx.data.tasks.find((t) => t.id === id);
        if (target) {
          const origDur = Math.max(diffDays(orig.start, orig.end), 0);
          const newStart = addDays(orig.start, deltaDays);
          target.start = newStart;
          target.end = addDays(newStart, origDur);
        }
      });
    } else {
      const origDuration = Math.max(diffDays(state.origStart!, state.origEnd!), 0);
      let newStart = addDays(state.origStart!, deltaDays);

      if (!ctx.autoCascade) {
        const deps = getTaskDependencies(task);
        for (const depId of deps) {
          const prereq = ctx.data.tasks.find((t) => t.id === depId);
          if (prereq) {
            const minAllowed = addDays(prereq.end, getEffectiveGap(task, ctx.defaultGapDays));
            if (diffDays(minAllowed, newStart) < 0) {
              newStart = minAllowed;
            }
          }
        }
      }

      task.start = newStart;
      task.end = addDays(newStart, origDuration);
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
