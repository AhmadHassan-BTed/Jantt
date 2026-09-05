import { TaskLayout, DependencyLine, Person, Team } from "../types";
import { InteractionController } from "../controller";
import { TooltipController } from "./tooltip";
import { formatHumanDate } from "../date-math";
import { resolveTaskAssignee } from "../team-resolver";
import { isTaskDone } from "../utils";

export interface TaskBarsProps {
  taskLayouts: TaskLayout[];
  dependencies: DependencyLine[];
  depPathElements: Map<string, SVGPathElement>;
  showCritical: boolean;
  showBaselines: boolean;
  readOnly?: boolean;
  people?: Person[];
  teams?: Team[];
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
    const isSelected = props.controller.isSelected(item.task.id);
    const isDone = isTaskDone(item.task);

    if (item.isMilestone) {
      const mStone = document.createElement("div");
      mStone.className = `jantt-milestone ${isDone ? "is-done" : ""} ${props.showCritical && item.isCritical ? "is-critical" : ""} ${isSelected ? "is-selected" : ""}`;
      mStone.style.left = `${item.x}px`;
      mStone.style.top = `${item.y}px`;
      mStone.style.width = `${item.width}px`;
      mStone.style.height = `${item.height}px`;
      mStone.style.transform = "translate(-50%, -50%) rotate(45deg)";
      mStone.style.background = isDone ? "var(--jantt-bar-done, #64748B)" : item.category.color;
      mStone.setAttribute("data-task-id", item.task.id);
      mStone.setAttribute("tabindex", "0");
      mStone.setAttribute("role", "button");
      mStone.setAttribute("aria-label", `Milestone: ${item.displayLabel}, Date: ${item.task.start}`);

      mStone.addEventListener("pointerdown", (e) => {
        props.controller.startDrag(e, item.task, "move", mStone);
      });
      mStone.addEventListener("mouseenter", (e) => props.tooltip.show(item.task, item.category, e, item.scheduleMetrics));
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
    bar.className = `jantt-task-bar ${isDone ? "is-done" : ""} ${item.task.locked ? "is-locked" : ""} ${props.showCritical && item.isCritical ? "is-critical" : ""} ${isSelected ? "is-selected" : ""}`;
    bar.style.left = `${item.x}px`;
    bar.style.top = `${item.y}px`;
    bar.style.width = `${item.width}px`;
    bar.style.height = `${item.height}px`;
    bar.style.background = isDone ? "var(--jantt-bar-done, #64748B)" : item.category.color;
    bar.setAttribute("data-task-id", item.task.id);
    bar.setAttribute("tabindex", "0");
    bar.setAttribute("role", "button");
    bar.setAttribute(
      "aria-label",
      `${item.displayLabel}, Category: ${item.category.label}, Start: ${formatHumanDate(item.task.start)}, End: ${formatHumanDate(item.task.end)}, Duration: ${item.durationDays} days`
    );

    // Progress Fill
    const progressRatio = isDone ? 1.0 : (item.task.progress ?? 0);
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

    // Content Text & Quick Lock Toggle Button
    const content = document.createElement("div");
    content.className = "jantt-bar-content";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = item.displayLabel;
    content.appendChild(titleSpan);

    if (item.task.assignee) {
      const assigneeInfo = resolveTaskAssignee(item.task, props.people, props.teams);
      const aAvatar = document.createElement("span");
      aAvatar.className = "jantt-task-avatar-pill";
      aAvatar.style.display = "inline-flex";
      aAvatar.style.alignItems = "center";
      aAvatar.style.justifyContent = "center";
      aAvatar.style.width = "16px";
      aAvatar.style.height = "16px";
      aAvatar.style.minWidth = "16px";
      aAvatar.style.borderRadius = "50%";
      aAvatar.style.background = assigneeInfo.avatarColor || "rgba(0, 0, 0, 0.35)";
      aAvatar.style.color = "#FFFFFF";
      aAvatar.style.fontSize = "8px";
      aAvatar.style.fontWeight = "700";
      aAvatar.style.flexShrink = "0";
      aAvatar.title = `${assigneeInfo.displayName}${assigneeInfo.team ? ` (${assigneeInfo.team.name})` : ""}`;
      aAvatar.textContent = assigneeInfo.initials;
      content.appendChild(aAvatar);
    }

    if (item.task.urgent) {
      const uPill = document.createElement("span");
      uPill.className = "jantt-hover-type-pill is-urgent";
      uPill.style.fontSize = "8.5px";
      uPill.style.padding = "1px 4px";
      uPill.textContent = "Urgent";
      content.appendChild(uPill);
    }

    if (props.showCritical && item.isCritical) {
      const critPill = document.createElement("span");
      critPill.className = "jantt-critical-pill";
      critPill.title = "Critical Path: task controls project completion date";
      critPill.innerHTML = `
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        <span>Critical</span>
      `;
      content.appendChild(critPill);
    }

    if (!props.readOnly) {
      const lockBtn = document.createElement("button");
      lockBtn.className = `jantt-task-lock-btn ${item.task.locked ? "is-locked" : ""}`;
      lockBtn.title = item.task.locked ? "Locked in place (Click to unlock)" : "Unlocked (Click to lock in place)";
      lockBtn.setAttribute("type", "button");
      lockBtn.innerHTML = item.task.locked
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.6"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;

      lockBtn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });
      lockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        props.controller.toggleTaskLock(item.task.id);
      });
      content.appendChild(lockBtn);
    }
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
      props.tooltip.show(item.task, item.category, e, item.scheduleMetrics);
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

