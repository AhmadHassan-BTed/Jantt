import { IGestureStrategy, DragState, GestureContext } from "../contracts";

export class MarqueeGestureStrategy implements IGestureStrategy {
  public readonly mode = "marquee" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (!state.selectionBoxEl || !state.canvasEl) return;

    const canvasRect = state.canvasEl.getBoundingClientRect();
    const curCanvasX = e.clientX - canvasRect.left + state.canvasEl.scrollLeft;
    const curCanvasY = e.clientY - canvasRect.top + state.canvasEl.scrollTop;

    const left = Math.min(state.canvasStartX!, curCanvasX);
    const top = Math.min(state.canvasStartY!, curCanvasY);
    const width = Math.abs(curCanvasX - state.canvasStartX!);
    const height = Math.abs(curCanvasY - state.canvasStartY!);

    state.selectionBoxEl.style.left = `${left}px`;
    state.selectionBoxEl.style.top = `${top}px`;
    state.selectionBoxEl.style.width = `${width}px`;
    state.selectionBoxEl.style.height = `${height}px`;

    // Calculate intersection with all task layouts
    if (state.taskLayouts) {
      state.taskLayouts.forEach((tl) => {
        const taskRight = tl.x + tl.width;
        const taskBottom = tl.y + tl.height;
        const intersects =
          tl.x < left + width && taskRight > left && tl.y < top + height && taskBottom > top;

        if (intersects) {
          ctx.selectedTaskIds.add(tl.task.id);
        } else if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          ctx.selectedTaskIds.delete(tl.task.id);
        }
      });

      // Visually update selected state on DOM task bars in real-time
      state.canvasEl.querySelectorAll<HTMLElement>("[data-task-id]").forEach((bar) => {
        const tId = bar.dataset.taskId!;
        if (ctx.selectedTaskIds.has(tId)) {
          bar.classList.add("is-selected");
        } else {
          bar.classList.remove("is-selected");
        }
      });
    }
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (!state.moved) {
      ctx.clearSelection();
    }
  }
}
