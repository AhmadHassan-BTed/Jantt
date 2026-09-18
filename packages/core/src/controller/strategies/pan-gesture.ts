import { IGestureStrategy, DragState, GestureContext } from "../contracts";

export class PanGestureStrategy implements IGestureStrategy {
  public readonly mode = "pan" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const bodyWrap =
      state.canvasEl?.closest<HTMLElement>(".jantt-body-wrap") ||
      ctx.container?.querySelector<HTMLElement>(".jantt-body-wrap") ||
      document.querySelector<HTMLElement>(".jantt-body-wrap");
    if (!bodyWrap) return;

    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;

    if (state.origScrollLeft !== undefined) {
      bodyWrap.scrollLeft = state.origScrollLeft - deltaX;
    }
    if (state.origScrollTop !== undefined) {
      bodyWrap.scrollTop = state.origScrollTop - deltaY;
    }
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (state.canvasEl) {
      state.canvasEl.style.cursor = "";
    }
    if (!state.moved) {
      ctx.clearSelection();
    }
  }
}
