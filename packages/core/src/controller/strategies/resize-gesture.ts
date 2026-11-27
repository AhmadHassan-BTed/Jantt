import { IGestureStrategy, DragState, GestureContext, constrainedStart } from "../contracts";
import {
  addDays,
  diffDays,
  fromEpochDay,
  fromEpochMinutes,
  hasTimeComponent,
  MINUTES_PER_DAY,
  toEpochMinutes,
  toTaskEndEpochMinutes
} from "../../date-math";
import { getDragStepMinutes } from "../../utils";

export class ResizeGestureStrategy implements IGestureStrategy {
  public readonly mode = "resize" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): boolean {
    const stepMinutes = getDragStepMinutes(ctx.dayWidth);
    const stepPx = (stepMinutes / MINUTES_PER_DAY) * ctx.dayWidth;
    const deltaSteps = Math.round((e.clientX - state.startX + (state.autoScrollX ?? 0)) / stepPx);
    if (deltaSteps === state.lastValue) return false;

    const base = state.origTasks ?? ctx.data.tasks;
    const task = base.find((t) => t.id === state.taskId);
    if (!task) return false;
    state.lastValue = deltaSteps;

    if (deltaSteps === 0 && state.origTasks) {
      ctx.setTasks(state.origTasks);
      return true;
    }

    const origStart = state.origStart ?? task.start;
    const origEnd = state.origEnd ?? task.end;
    if (stepMinutes === MINUTES_PER_DAY) {
      const minDays = task.milestone ? 0 : 1;
      let start = origStart, end = origEnd;
      if (state.resizeStart) {
        start = addDays(origStart, deltaSteps);
        if (diffDays(start, end) < minDays) start = addDays(end, -minDays);
        if (!ctx.autoCascade) {
          state.origById ??= new Map(base.map((item) => [item.id, item]));
          const lookup = state.origById;
          const limit = constrainedStart({ ...task, start, end }, (id) => lookup.get(id), ctx.resolve, lookup);
          if (toEpochMinutes(start) < toEpochMinutes(limit)) start = limit;
          if (diffDays(start, end) < minDays) return false;
        }
      } else {
        end = addDays(origEnd, deltaSteps);
        if (diffDays(start, end) < minDays) end = addDays(start, minDays);
      }
      ctx.setTasks(base.map((t) => (t === task ? { ...t, start, end } : t)), true);
      return true;
    }

    const shiftMins = deltaSteps * stepMinutes;
    const minDurationMin = task.milestone ? 0 : stepMinutes;
    const startBaseMin = toEpochMinutes(origStart);
    const endBaseMin = task.milestone ? toEpochMinutes(origEnd) : toTaskEndEpochMinutes(origEnd);
    let nextStart = origStart;
    let nextEnd = origEnd;

    if (state.resizeStart) {
      let candMin = startBaseMin + shiftMins;
      if (endBaseMin - candMin < minDurationMin) candMin = endBaseMin - minDurationMin;
      nextStart = fromEpochMinutes(candMin, true);
      if (!ctx.autoCascade) {
        state.origById ??= new Map(base.map((item) => [item.id, item]));
        const lookup = state.origById;
        const limit = constrainedStart({ ...task, start: nextStart, end: nextEnd }, (id) => lookup.get(id), ctx.resolve, lookup);
        const limitMin = toEpochMinutes(limit);
        if (Number.isFinite(limitMin) && candMin < limitMin) {
          candMin = limitMin;
          nextStart = limit;
        }
        if (endBaseMin - candMin < minDurationMin) return false;
      }
    } else {
      let candEndMin = endBaseMin + shiftMins;
      if (candEndMin - startBaseMin < minDurationMin) candEndMin = startBaseMin + minDurationMin;
      const keepPlain = !hasTimeComponent(origStart) && !hasTimeComponent(origEnd) && candEndMin % MINUTES_PER_DAY === 0;
      nextEnd = keepPlain ? fromEpochDay(candEndMin / MINUTES_PER_DAY - 1) : fromEpochMinutes(candEndMin, true);
    }

    ctx.setTasks(base.map((t) => (t === task ? { ...t, start: nextStart, end: nextEnd } : t)), true);
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
