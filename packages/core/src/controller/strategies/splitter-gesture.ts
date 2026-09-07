import { IGestureStrategy, DragState, GestureContext } from "../contracts";

export class SplitterGestureStrategy implements IGestureStrategy {
  public readonly mode = "split" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const deltaX = e.clientX - state.startX;
    const newWidth = Math.max(180, Math.min(600, (state.origLabelWidth || 320) + deltaX));
    ctx.onSplitResize?.(newWidth);
  }

  public onUp(_e: PointerEvent, _state: DragState, _ctx: GestureContext): void {
    // Split drag completed; width state already committed via callback
  }
}
