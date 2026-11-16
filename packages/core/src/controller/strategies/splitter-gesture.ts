import { IGestureStrategy, DragState, GestureContext } from "../contracts";
import { MIN_LABEL_WIDTH, MAX_LABEL_WIDTH, DEFAULT_LABEL_WIDTH } from "../../constants";

/** Timeline width kept visible when the label column is widened inside a narrow container. */
const MIN_TIMELINE_WIDTH = 160;

export class SplitterGestureStrategy implements IGestureStrategy {
  public readonly mode = "split" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    const available = ctx.container?.clientWidth ?? 0;
    const max =
      available > 0
        ? Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, available - MIN_TIMELINE_WIDTH))
        : MAX_LABEL_WIDTH;
    const newWidth = Math.max(MIN_LABEL_WIDTH, Math.min(max, (state.origLabelWidth || DEFAULT_LABEL_WIDTH) + e.clientX - state.startX));
    if (newWidth === state.lastValue) return;
    state.lastValue = newWidth;
    ctx.onSplitResize?.(newWidth);
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    // Report the settled width once so hosts can persist it (e.g. via onViewportChange).
    if (state.moved && state.lastValue !== undefined) {
      ctx.onSplitResize?.(state.lastValue, true);
    }
  }
}
