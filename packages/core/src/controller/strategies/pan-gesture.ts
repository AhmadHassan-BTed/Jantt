import { IGestureStrategy, DragState, GestureContext } from "../contracts";

export class PanGestureStrategy implements IGestureStrategy {
  public readonly mode = "pan" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const bodyWrap =
      state.canvasEl?.closest<HTMLElement>(".jantt-body-wrap") ||
      ctx.container?.querySelector<HTMLElement>(".jantt-body-wrap");
    if (!bodyWrap) return;

    if (state.origScrollLeft !== undefined) {
      bodyWrap.scrollLeft = state.origScrollLeft - (e.clientX - state.startX);
    }
    if (state.origScrollTop !== undefined) {
      bodyWrap.scrollTop = state.origScrollTop - (e.clientY - state.startY);
    }
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (state.canvasEl) {
      state.canvasEl.style.cursor = "";
    }
    if (state.moved) return;
    // A press that started on a view-only bar and did not pan is a click on that task.
    const task = state.taskId ? ctx.data.tasks.find((t) => t.id === state.taskId) : undefined;
    if (task) {
      ctx.options.onTaskClick?.(task);
      ctx.openModalHandler(task);
    } else {
      ctx.clearSelection();
    }
  }
}
