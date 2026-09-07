import { IGestureStrategy, DragState, GestureContext } from "../contracts";
import { getTaskDependencies, hasDependencyCycle, resolveSchedule } from "../../resolver";

export class LinkGestureStrategy implements IGestureStrategy {
  public readonly mode = "link" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (ctx.onLiveLinkUpdate && state.element) {
      const rect = state.element.getBoundingClientRect();
      ctx.onLiveLinkUpdate({
        fromX: rect.right,
        fromY: rect.top + rect.height / 2,
        toX: e.clientX,
        toY: e.clientY
      });
    }
  }

  public onUp(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    ctx.onLiveLinkUpdate?.(null);

    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
    const targetBar = targetElement?.closest<HTMLElement>("[data-task-id]");
    const targetTaskId = targetBar?.dataset.taskId;
    const linkFromTaskId = state.linkFromTaskId;

    if (linkFromTaskId && targetTaskId && targetTaskId !== linkFromTaskId) {
      const targetTask = ctx.data.tasks.find((t) => t.id === targetTaskId);
      if (targetTask) {
        const existing = getTaskDependencies(targetTask);
        if (!existing.includes(linkFromTaskId)) {
          const nextDeps = existing.length === 0 ? linkFromTaskId : [...existing, linkFromTaskId];
          // Test if adding this link creates a circular dependency
          const candidateTasks = ctx.data.tasks.map((t) =>
            t.id === targetTaskId ? { ...t, dependsOn: nextDeps } : t
          );
          if (hasDependencyCycle(candidateTasks)) {
            ctx.options.onError?.(
              new Error(`Adding dependency from ${linkFromTaskId} to ${targetTaskId} would create a circular dependency cycle.`)
            );
            return;
          }
          targetTask.dependsOn = nextDeps;
        }
        const resolvedTasks = resolveSchedule(ctx.data.tasks, ctx.defaultGapDays);
        ctx.data.tasks = resolvedTasks;
        ctx.onRenderRequest();
        ctx.options.onLinkCreate?.(linkFromTaskId, targetTaskId);
        ctx.commitData();
      }
    }
  }
}
