import { Task, Category } from "../types";
import { formatHumanDate, diffDays } from "../date-math";

export interface TooltipController {
  show: (task: Task, category: Category, e: MouseEvent) => void;
  hide: () => void;
}

/**
 * Creates and manages floating glassmorphic hover cards for tasks and milestones.
 */
export function createTooltipController(): TooltipController {
  let activeCard: HTMLElement | null = null;

  const hide = () => {
    if (activeCard && activeCard.parentNode) {
      activeCard.parentNode.removeChild(activeCard);
      activeCard = null;
    }
  };

  const show = (task: Task, category: Category, e: MouseEvent) => {
    hide();
    const duration = Math.max(diffDays(task.start, task.end), task.milestone ? 0 : 1);
    const progressPercent = Math.round((task.progress || 0) * 100);

    const card = document.createElement("div");
    card.className = "jantt-hover-card";

    const title = escapeHtml(task.label || task.name || task.id);
    const catLabel = escapeHtml(category.label || task.category || "General");
    const catColor = category.color || "#38BDF8";
    const isMilestone = Boolean(task.milestone || task.start === task.end);

    card.innerHTML = `
      <div class="jantt-hover-card-header">
        <div class="jantt-hover-card-tags">
          <span class="jantt-hover-category-pill" style="background: ${catColor}20; color: ${catColor}; border: 1px solid ${catColor}50;">
            <span class="jantt-hover-dot" style="background: ${catColor};"></span>
            ${catLabel}
          </span>
          ${isMilestone ? '<span class="jantt-hover-type-pill is-milestone">Milestone</span>' : ""}
          ${task.locked ? '<span class="jantt-hover-type-pill is-locked">Locked</span>' : ""}
          ${task.urgent ? '<span class="jantt-hover-type-pill is-urgent">Urgent</span>' : ""}
        </div>
        <span class="jantt-hover-id-badge">#${escapeHtml(task.id)}</span>
      </div>

      <div class="jantt-hover-card-title">${title}</div>

      <div class="jantt-hover-card-body">
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Timeline</span>
          <span class="jantt-hover-stat-value">
            ${formatHumanDate(task.start)} → ${formatHumanDate(task.end)}
            <span class="jantt-hover-duration-tag">(${duration}d)</span>
          </span>
        </div>

        ${
          !isMilestone
            ? `
        <div class="jantt-hover-progress-section">
          <div class="jantt-hover-progress-labels">
            <span class="jantt-hover-stat-label">Progress</span>
            <span class="jantt-hover-progress-val">${progressPercent}%</span>
          </div>
          <div class="jantt-hover-progress-track">
            <div class="jantt-hover-progress-bar" style="width: ${progressPercent}%; background: ${catColor};"></div>
          </div>
        </div>
        `
            : ""
        }

        ${
          task.dependsOn
            ? `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Depends On</span>
          <span class="jantt-hover-stat-value" style="font-family: var(--jantt-font-mono); color: var(--jantt-accent); font-weight: 600;">
            ${escapeHtml(task.dependsOn)}
          </span>
        </div>
        `
            : ""
        }

        ${
          task.notes
            ? `
        <div class="jantt-hover-notes-block">
          ${escapeHtml(task.notes)}
        </div>
        `
            : ""
        }
      </div>

      <div class="jantt-hover-card-footer">
        <span>Click to open details sidebar</span>
      </div>
    `;

    document.body.appendChild(card);
    activeCard = card;

    // Smart positioning: flip horizontally or vertically if close to screen edge
    const cardRect = card.getBoundingClientRect();
    const padding = 16;
    let left = e.clientX + 16;
    let top = e.clientY + 16;

    if (left + cardRect.width > window.innerWidth - padding) {
      left = Math.max(padding, e.clientX - cardRect.width - 12);
    }
    if (top + cardRect.height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - cardRect.height - padding);
    }

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  };

  return { show, hide };
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
