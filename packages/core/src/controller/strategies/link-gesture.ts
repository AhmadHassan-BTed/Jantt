import { IGestureStrategy, DragState, GestureContext, dependencyItemFor } from "../contracts";
import { hasDependencyCycle } from "../../resolver";
import { appendDependency, getTaskDependencyRelations } from "../../dependencies";

export class LinkGestureStrategy implements IGestureStrategy {
  public readonly mode = "link" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (!ctx.onLiveLinkUpdate || !state.element) return;
    // The preview wire lives in the canvas overlay SVG (top/left 0 of the bars' container), so
    // convert viewport coordinates into that container's coordinate space.
    const bar = state.element.closest<HTMLElement>("[data-task-id]") ?? state.element;
    const origin = bar.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const rect = bar.getBoundingClientRect();
    ctx.onLiveLinkUpdate({
      fromX: rect.right - origin.left,
      fromY: rect.top + rect.height / 2 - origin.top,
      toX: e.clientX - origin.left,
      toY: e.clientY - origin.top
    });
  }

  public onUp(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    ctx.onLiveLinkUpdate?.(null);

    const linkFromTaskId = state.linkFromTaskId;
    if (!state.moved || !linkFromTaskId || typeof document.elementFromPoint !== "function") return;

    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
    // Another chart on the page may render a task with the same id: only this chart counts.
    if (!targetElement || (ctx.container && !ctx.container.contains(targetElement))) return;
    const targetTaskId = targetElement.closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    if (!targetTaskId || targetTaskId === linkFromTaskId) return;

    const targetTask = ctx.data.tasks.find((t) => t.id === targetTaskId);
    if (!targetTask) return;
    // Dropping onto an existing link is a no-op: no event, no commit. Known ids keep an id such
    // as "model-3d" from being read as "model" with a lead.
    const knownIds = new Set(ctx.data.tasks.map((t) => t.id));
    if (getTaskDependencyRelations(targetTask, knownIds).some((rel) => rel.id === linkFromTaskId)) return;
    if (targetTask.locked) {
      ctx.options.onError?.(new Error(`Task "${targetTaskId}" is locked; unlock it before adding a dependency.`));
      return;
    }

    const updated = { ...targetTask, dependsOn: appendDependency(targetTask.dependsOn, dependencyItemFor(linkFromTaskId)) };
    const nextTasks = ctx.data.tasks.map((t) => (t === targetTask ? updated : t));
    if (hasDependencyCycle(nextTasks)) {
      ctx.options.onError?.(
        new Error(`Adding dependency from ${linkFromTaskId} to ${targetTaskId} would create a circular dependency cycle.`)
      );
      return;
    }

    ctx.setTasks(nextTasks, true);
    ctx.onRenderRequest();
    ctx.options.onLinkCreate?.(linkFromTaskId, targetTaskId);
    ctx.commitData();
  }
}
