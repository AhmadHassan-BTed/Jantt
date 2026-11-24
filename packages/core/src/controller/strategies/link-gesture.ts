import { IGestureStrategy, DragState, GestureContext, dependencyItemFor } from "../contracts";
import { hasDependencyCycle } from "../../resolver";
import { appendDependency, getTaskDependencyRelations } from "../../dependencies";

function snapTarget(e: PointerEvent, state: DragState, ctx: GestureContext) {
  if (typeof document.elementFromPoint !== "function") return null;
  // A short magnetic radius around a bar makes small touch targets practical.
  for (const [dx, dy] of [[0, 0], [-8, 0], [8, 0], [0, -7], [0, 7]]) {
    const hit = document.elementFromPoint(e.clientX + dx, e.clientY + dy);
    const bar = hit?.closest<HTMLElement>("[data-task-id]");
    const id = bar?.dataset.taskId;
    if (!bar || !id || id === state.linkFromTaskId || (ctx.container && !ctx.container.contains(bar))) continue;
    const rect = bar.getBoundingClientRect();
    const end = Boolean(hit?.closest(".jantt-link-port-right")) ||
      (rect.width > 0 && Math.abs(e.clientX - rect.right) <= Math.min(rect.width / 2, 14));
    return { id, end, x: end ? rect.right : rect.left, y: rect.top + rect.height / 2 };
  }
  return null;
}

export class LinkGestureStrategy implements IGestureStrategy {
  public readonly mode = "link" as const;

  public onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    if (!ctx.onLiveLinkUpdate || !state.element) return;
    // The preview wire lives in the canvas overlay SVG (top/left 0 of the bars' container), so
    // convert viewport coordinates into that container's coordinate space.
    const bar = state.element.closest<HTMLElement>("[data-task-id]") ?? state.element;
    const origin = bar.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const rect = bar.getBoundingClientRect();
    const target = snapTarget(e, state, ctx);
    if (target?.id && target.id !== state.snappedTaskId) {
      ctx.options.onLinkSnap?.(target.id);
    }
    state.snappedTaskId = target?.id;
    ctx.onLiveLinkUpdate({
      ...(state.element.classList.contains("jantt-link-port-left") ? { fromSide: "start" as const } : {}),
      ...(target?.end ? { toSide: "end" as const } : {}),
      fromX: (state.element.classList.contains("jantt-link-port-left") ? rect.left : rect.right) - origin.left,
      fromY: rect.top + rect.height / 2 - origin.top,
      toX: (target?.x ?? e.clientX) - origin.left,
      toY: (target?.y ?? e.clientY) - origin.top
    });
  }

  public onUp(e: PointerEvent, state: DragState, ctx: GestureContext): void {
    ctx.onLiveLinkUpdate?.(null);

    const linkFromTaskId = state.linkFromTaskId;
    if (!state.moved || !linkFromTaskId || typeof document.elementFromPoint !== "function") return;

    const target = snapTarget(e, state, ctx);
    if (!target) return;
    const targetTaskId = target.id;

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

    const fromStart = state.element?.classList.contains("jantt-link-port-left");
    const type = fromStart ? (target.end ? "SF" : "SS") : (target.end ? "FF" : "FS");
    const link = type === "FS" ? dependencyItemFor(linkFromTaskId) : { id: linkFromTaskId, type } as const;
    const updated = { ...targetTask, dependsOn: appendDependency(targetTask.dependsOn, link) };
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
