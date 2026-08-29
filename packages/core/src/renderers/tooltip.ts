import { Task, Category } from "../types";
import { formatHumanDate, diffDays } from "../date-math";

export interface TooltipOptions {
  theme?: Record<string, string>;
  themeClassName?: string;
}

export interface TooltipController {
  show: (task: Task, category: Category, e: MouseEvent) => void;
  hide: () => void;
  updateTheme: (theme?: Record<string, string>, themeClassName?: string) => void;
}

/**
 * Creates and manages floating glassmorphic hover cards for tasks and milestones.
 */
export function createTooltipController(initialOptions: TooltipOptions = {}): TooltipController {
  let activeCard: HTMLElement | null = null;
  let currentTheme = initialOptions.theme;
  let currentThemeClassName = initialOptions.themeClassName;

  const updateTheme = (theme?: Record<string, string>, themeClassName?: string) => {
    currentTheme = theme;
    currentThemeClassName = themeClassName;
  };

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
    card.className = `jantt-hover-card ${currentThemeClassName || ""}`.trim();

    // Apply custom theme CSS variables if supplied
    if (currentTheme) {
      Object.entries(currentTheme).forEach(([k, v]) => {
        const varName = k.startsWith("--") ? k : `--jantt-${k}`;
        card.style.setProperty(varName, v);
      });
    }

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
          task.assignee
            ? `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Assignee / Owner</span>
          <span class="jantt-hover-stat-value" style="font-weight: 600; color: var(--jantt-text);">
            ${escapeHtml(task.assignee)}
          </span>
        </div>
        `
            : ""
        }

        ${
          task.priority
            ? `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Priority Level</span>
          <span class="jantt-hover-stat-value" style="font-weight: 700; text-transform: uppercase; font-size: 11px; color: ${task.priority === "urgent" ? "#E11D48" : task.priority === "high" ? "#D97706" : "var(--jantt-accent)"};">
            ${escapeHtml(task.priority)}
          </span>
        </div>
        `
            : ""
        }

        ${
          task.estimatedCost !== undefined && task.estimatedCost !== null
            ? `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Planned Budget</span>
          <span class="jantt-hover-stat-value" style="font-family: var(--jantt-font-mono); font-weight: 600;">
            $${task.estimatedCost.toLocaleString()}
          </span>
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
            ${escapeHtml(Array.isArray(task.dependsOn) ? task.dependsOn.join(", ") : (task.dependsOn || ""))}
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

  return { show, hide, updateTheme };
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
