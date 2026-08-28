import { TaskLayout, DependencyLine } from "../types";
import { InteractionController } from "../controller";
import { TooltipController } from "./tooltip";
import { formatHumanDate } from "../date-math";

export interface TaskBarsProps {
  taskLayouts: TaskLayout[];
  dependencies: DependencyLine[];
  depPathElements: Map<string, SVGPathElement>;
  showCritical: boolean;
  showBaselines: boolean;
  readOnly?: boolean;
  controller: InteractionController;
  tooltip: TooltipController;
}

/**
 * Renders task bars, milestone diamonds, baseline ghost bars, progress indicators, and link ports.
 */
export function renderTaskBars(props: TaskBarsProps, container: HTMLElement): void {
  props.taskLayouts.forEach((item) => {
    // 1. Baseline Ghost Bar
    if (item.baselineLayout && props.showBaselines) {
      const baseBar = document.createElement("div");
      baseBar.className = "jantt-baseline-bar";
      baseBar.style.left = `${item.baselineLayout.x}px`;
      baseBar.style.top = `${item.baselineLayout.y}px`;
      baseBar.style.width = `${item.baselineLayout.width}px`;
      baseBar.style.height = `${item.baselineLayout.height}px`;
      baseBar.title = `Baseline: ${item.task.baseline?.start} to ${item.task.baseline?.end}`;
      container.appendChild(baseBar);
    }

    // 2. Milestone Diamond Pin
    if (item.isMilestone) {
      const mStone = document.createElement("div");
      mStone.className = `jantt-milestone ${props.showCritical && item.isCritical ? "is-critical" : ""}`;
      mStone.style.left = `${item.x}px`;
      mStone.style.top = `${item.y + (item.height - 20) / 2}px`;
      mStone.style.background = item.category.color;
      mStone.setAttribute("data-task-id", item.task.id);
      mStone.setAttribute("tabindex", "0");
      mStone.setAttribute("role", "button");
      mStone.setAttribute("aria-label", `Milestone: ${item.displayLabel}, Date: ${item.task.start}`);

      mStone.addEventListener("pointerdown", (e) => {
        props.controller.startDrag(e, item.task, "move", mStone);
      });
      mStone.addEventListener("mouseenter", (e) => props.tooltip.show(item.task, item.category, e));
      mStone.addEventListener("mouseleave", props.tooltip.hide);

      // Milestone Link Port
      if (!item.task.locked && !props.readOnly) {
        const portR = document.createElement("div");
        portR.className = "jantt-link-port jantt-link-port-right";
        portR.title = "Drag to link prerequisite";
        portR.addEventListener("pointerdown", (e) => {
          props.controller.startDrag(e, item.task, "link", portR);
        });
        mStone.appendChild(portR);
      }

      container.appendChild(mStone);
      return;
    }

    // 3. Standard Task Bar
    const bar = document.createElement("div");
    bar.className = `jantt-task-bar ${item.task.locked ? "is-locked" : ""} ${props.showCritical && item.isCritical ? "is-critical" : ""}`;
    bar.style.left = `${item.x}px`;
    bar.style.top = `${item.y}px`;
    bar.style.width = `${item.width}px`;
    bar.style.height = `${item.height}px`;
    bar.style.background = item.category.color;
    bar.setAttribute("data-task-id", item.task.id);
    bar.setAttribute("tabindex", "0");
    bar.setAttribute("role", "button");
    bar.setAttribute(
      "aria-label",
      `${item.displayLabel}, Category: ${item.category.label}, Start: ${formatHumanDate(item.task.start)}, End: ${formatHumanDate(item.task.end)}, Duration: ${item.durationDays} days`
    );

    // Progress Fill
    const progressRatio = item.task.progress ?? 0;
    const progressFill = document.createElement("div");
    progressFill.className = "jantt-task-progress";
    progressFill.style.width = `${Math.min(progressRatio * 100, 100)}%`;

    // Inline Progress Drag Handle
    if (!item.task.locked && !props.readOnly) {
      const pHandle = document.createElement("div");
      pHandle.className = "jantt-progress-handle";
      pHandle.title = `Drag progress (${Math.round(progressRatio * 100)}%)`;
      pHandle.addEventListener("pointerdown", (e) => {
        props.controller.startDrag(e, item.task, "progress", bar);
      });
      progressFill.appendChild(pHandle);
    }
    bar.appendChild(progressFill);

    // Content Text
    const content = document.createElement("div");
    content.className = "jantt-bar-content";
    content.innerHTML = `
      <span>${escapeHtml(item.displayLabel)}</span>
      ${item.task.locked ? '<span style="font-size: 11px;">🔒</span>' : ""}
      ${item.task.urgent ? '<span style="font-size: 11px; color: #FECDD3;">⚡</span>' : ""}
    `;
    bar.appendChild(content);

    // Resize Handle & Dependency Ports
    if (!item.task.locked && !props.readOnly) {
      const handle = document.createElement("div");
      handle.className = "jantt-resize-handle";
      handle.title = "Drag to resize duration";
      handle.addEventListener("pointerdown", (e) => {
        props.controller.startDrag(e, item.task, "resize", bar);
      });
      bar.appendChild(handle);

      const portL = document.createElement("div");
      portL.className = "jantt-link-port jantt-link-port-left";
      portL.title = "Dependency target port";
      bar.appendChild(portL);

      const portR = document.createElement("div");
      portR.className = "jantt-link-port jantt-link-port-right";
      portR.title = "Drag wire to link prerequisite";
      portR.addEventListener("pointerdown", (e) => {
        props.controller.startDrag(e, item.task, "link", portR);
      });
      bar.appendChild(portR);
    }

    // Pointer events
    bar.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.classList.contains("jantt-resize-handle") ||
        target.classList.contains("jantt-progress-handle") ||
        target.classList.contains("jantt-link-port")
      ) {
        return;
      }
      props.controller.startDrag(e, item.task, "move", bar);
    });

    bar.addEventListener("keydown", (e) => {
      props.controller.handleKeyDown(e, item.task);
    });

    // Hover Tooltip & Dependency Highlight Wire Sync
    bar.addEventListener("mouseenter", (e) => {
      props.tooltip.show(item.task, item.category, e);
      props.dependencies.forEach((dep) => {
        if (dep.fromTaskId === item.task.id || dep.toTaskId === item.task.id) {
          const el = props.depPathElements.get(`${dep.fromTaskId}->${dep.toTaskId}`);
          if (el) {
            el.classList.add("is-active");
            el.setAttribute("marker-end", "url(#jantt-arrow-active)");
          }
        }
      });
    });

    bar.addEventListener("mouseleave", () => {
      props.tooltip.hide();
      props.dependencies.forEach((dep) => {
        if (dep.fromTaskId === item.task.id || dep.toTaskId === item.task.id) {
          const el = props.depPathElements.get(`${dep.fromTaskId}->${dep.toTaskId}`);
          if (el) {
            el.classList.remove("is-active");
            const isCrit = props.showCritical && dep.isCritical;
            el.setAttribute("marker-end", isCrit ? "url(#jantt-arrow-critical)" : "url(#jantt-arrow)");
          }
        }
      });
    });

    container.appendChild(bar);
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
