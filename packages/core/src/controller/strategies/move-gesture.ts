import { IGestureStrategy, DragState, GestureContext, constrainedStart } from "../contracts";
import {
  addDays,
  addMinutes,
  diffMinutes,
  MINUTES_PER_DAY,
  taskDurationMinutes
} from "../../date-math";
import { getDragStepMinutes } from "../../utils";
import { Task } from "../../types";

export class MoveGestureStrategy implements IGestureStrategy {
  public readonly mode = "move" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): boolean {
    const stepMinutes = getDragStepMinutes(ctx.dayWidth);
    const stepPx = (stepMinutes / MINUTES_PER_DAY) * ctx.dayWidth;
    const deltaSteps = Math.round((e.clientX - state.startX + (state.autoScrollX ?? 0)) / stepPx);
    if (deltaSteps === state.lastValue) return false;

    // Always recompute from the pre-drag tasks so repeated moves never accumulate rounding. The
    // pre-drag lookup is built once per gesture, not on every frame.
    const base = state.origTasks ?? ctx.data.tasks;
    const byId = state.origTasks
      ? (state.origById ??= new Map(base.map((t) => [t.id, t] as [string, Task])))
      : new Map(base.map((t) => [t.id, t] as [string, Task]));
    if (!state.taskId || !byId.has(state.taskId)) return false;
    state.lastValue = deltaSteps;

    if (deltaSteps === 0 && state.origTasks) {
      ctx.setTasks(state.origTasks);
      return true;
    }

    const moving =
      state.multiTasks && state.multiTasks.size > 1
        ? state.multiTasks
        : new Map([[state.taskId, { start: state.origStart!, end: state.origEnd! }]]);

    if (stepMinutes === MINUTES_PER_DAY) {
      const placed = (orig: { start: string; end: string }, shift: number) => {
        const start = addDays(orig.start, shift);
        // Shift both endpoints: rebuilding the end from whole-day duration drops its time.
        const end = taskDurationMinutes(orig.start, orig.end) > 0 ? addDays(orig.end, shift) : start;
        return { start, end };
      };

      let shift = deltaSteps;
      if (!ctx.autoCascade) {
        // Strict mode: never drop a moved task before what its (non-moving) predecessors allow.
        const external = (id: string) => (moving.has(id) ? undefined : byId.get(id));
        let extra = 0;
        moving.forEach((orig, id) => {
          const task = byId.get(id);
          if (!task) return;
          const proposed = { ...task, ...placed(orig, deltaSteps) };
          const limit = constrainedStart(proposed, external, ctx.resolve, byId);
          extra = Math.max(extra, Math.ceil(diffMinutes(proposed.start, limit) / MINUTES_PER_DAY));
        });
        shift += extra;
      }

      ctx.setTasks(
        base.map((t) => {
          const orig = moving.get(t.id);
          return orig ? { ...t, ...placed(orig, shift) } : t;
        }),
        true
      );
      return true;
    }

    const shiftMins = deltaSteps * stepMinutes;
    const placedMins = (task: Task | undefined, orig: { start: string; end: string }, minsShift: number) => {
      const start = addMinutes(orig.start, minsShift);
      if (task?.milestone) return { start, end: start };
      const durMin = taskDurationMinutes(orig.start, orig.end, false);
      // A plain end date is inclusive. Preserve it for whole-day shifts instead of
      // converting its exclusive duration boundary back to another inclusive date.
      const end = minsShift % MINUTES_PER_DAY === 0 && durMin > 0
        ? addMinutes(orig.end, minsShift)
        : addMinutes(start, durMin);
      return { start, end };
    };

    let totalMinShift = shiftMins;
    if (!ctx.autoCascade) {
      const external = (id: string) => (moving.has(id) ? undefined : byId.get(id));
      let extraMin = 0;
      moving.forEach((orig, id) => {
        const task = byId.get(id);
        if (!task) return;
        const proposed = { ...task, ...placedMins(task, orig, shiftMins) };
        extraMin = Math.max(extraMin, diffMinutes(proposed.start, constrainedStart(proposed, external, ctx.resolve, byId)));
      });
      totalMinShift += extraMin;
    }

    ctx.setTasks(
      base.map((t) => {
        const orig = moving.get(t.id);
        return orig ? { ...t, ...placedMins(t, orig, totalMinShift) } : t;
      }),
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
