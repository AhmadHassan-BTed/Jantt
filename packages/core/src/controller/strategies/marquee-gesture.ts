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

    if (!state.taskLayouts) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let changed = false;
    state.taskLayouts.forEach((tl) => {
      const intersects = tl.x < left + width && tl.x + tl.width > left && tl.y < top + height && tl.y + tl.height > top;
      const id = tl.task.id;
      if (intersects && !ctx.selectedTaskIds.has(id)) {
        ctx.selectedTaskIds.add(id);
        changed = true;
      } else if (!intersects && !additive && ctx.selectedTaskIds.has(id)) {
        ctx.selectedTaskIds.delete(id);
        changed = true;
      }
    });

    // Reflect the selection on the live bars without a full re-render.
    if (changed) {
      state.canvasEl.querySelectorAll<HTMLElement>("[data-task-id]").forEach((bar) => {
        bar.classList.toggle("is-selected", ctx.selectedTaskIds.has(bar.dataset.taskId!));
      });
    }
  }

  public onUp(_e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (!state.moved) {
      ctx.clearSelection();
    }
  }
}
