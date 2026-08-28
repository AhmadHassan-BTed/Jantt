import { Task, Category } from "../types";
import { formatHumanDate, diffDays } from "../date-math";

export interface TooltipController {
  show: (task: Task, category: Category, e: MouseEvent) => void;
  hide: () => void;
}

/**
 * Creates and manages floating glassmorphic tooltip elements.
 */
export function createTooltipController(): TooltipController {
  let activeTooltip: HTMLElement | null = null;

  const hide = () => {
    if (activeTooltip && activeTooltip.parentNode) {
      activeTooltip.parentNode.removeChild(activeTooltip);
      activeTooltip = null;
    }
  };

  const show = (task: Task, category: Category, e: MouseEvent) => {
    hide();
    const duration = diffDays(task.start, task.end);

    const tip = document.createElement("div");
    tip.className = "jantt-tooltip";
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 290)}px`;
    tip.style.top = `${Math.min(e.clientY + 14, window.innerHeight - 200)}px`;

    const title = escapeHtml(task.label || task.name || task.id);
    const catLabel = escapeHtml(category.label || task.category);
    const catColor = category.color || "#3B82F6";

    tip.innerHTML = `
      <div class="jantt-tooltip-title">${title}</div>
      <div class="jantt-tooltip-meta">
        <div style="color: ${catColor}; font-weight: 600; margin-bottom: 2px;">● ${catLabel}</div>
        <div><strong>Timeline:</strong> ${formatHumanDate(task.start)} → ${formatHumanDate(task.end)} (${duration}d)</div>
        ${task.progress !== undefined && task.progress !== null ? `<div><strong>Progress:</strong> ${Math.round(task.progress * 100)}%</div>` : ""}
        ${task.dependsOn ? `<div><strong>Prerequisite:</strong> ${escapeHtml(task.dependsOn)}</div>` : ""}
        ${task.notes ? `<div style="margin-top: 4px; font-style: italic; color: var(--jantt-text);">${escapeHtml(task.notes)}</div>` : ""}
      </div>
    `;

    document.body.appendChild(tip);
    activeTooltip = tip;
  };

  return { show, hide };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
