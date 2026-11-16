import { IGestureStrategy, DragState, GestureContext, constrainedStart } from "../contracts";
import { addDays, diffDays } from "../../date-math";
import { Task } from "../../types";

export class MoveGestureStrategy implements IGestureStrategy {
  public readonly mode = "move" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): boolean {
    const deltaDays = Math.round((e.clientX - state.startX + (state.autoScrollX ?? 0)) / ctx.dayWidth);
    if (deltaDays === state.lastValue) return false;

    // Always recompute from the pre-drag tasks so repeated moves never accumulate rounding. The
    // pre-drag lookup is built once per gesture, not on every frame.
    const base = state.origTasks ?? ctx.data.tasks;
    const byId = state.origTasks
      ? (state.origById ??= new Map(base.map((t) => [t.id, t] as [string, Task])))
      : new Map(base.map((t) => [t.id, t] as [string, Task]));
    if (!state.taskId || !byId.has(state.taskId)) return false;
    state.lastValue = deltaDays;

    if (deltaDays === 0 && state.origTasks) {
      ctx.setTasks(state.origTasks);
      return true;
    }

    const moving =
      state.multiTasks && state.multiTasks.size > 1
        ? state.multiTasks
        : new Map([[state.taskId, { start: state.origStart!, end: state.origEnd! }]]);

    const placed = (orig: { start: string; end: string }, shift: number) => {
      const start = addDays(orig.start, shift);
      return { start, end: addDays(start, Math.max(diffDays(orig.start, orig.end), 0)) };
    };

    let shift = deltaDays;
    if (!ctx.autoCascade) {
      // Strict mode: never drop a moved task before what its (non-moving) predecessors allow.
      const external = (id: string) => (moving.has(id) ? undefined : byId.get(id));
      let extra = 0;
      moving.forEach((orig, id) => {
        const task = byId.get(id);
        if (!task) return;
        const proposed = { ...task, ...placed(orig, deltaDays) };
        extra = Math.max(extra, diffDays(proposed.start, constrainedStart(proposed, external, ctx.resolve, byId)));
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
