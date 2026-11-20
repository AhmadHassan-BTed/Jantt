import { Task, Category, TaskScheduleMetrics } from "../types";
import { diffDays, formatHumanDate, isValidISODate, taskDurationDays } from "../date-math";
import { escapeHtml, getTaskDisplayName, sanitizeCssColor } from "../utils";
import { DEFAULT_CATEGORY } from "../constants";
import { applyThemeVariables } from "../themes/manager";

export interface TooltipOptions {
  theme?: Record<string, string>;
  themeClassName?: string;
}

export interface TooltipController {
  show: (task: Task, category: Category, e: MouseEvent, metrics?: TaskScheduleMetrics) => void;
  hide: () => void;
  updateTheme: (theme?: Record<string, string>, themeClassName?: string) => void;
}

function formatDependsOn(dependsOn: Task["dependsOn"]): string {
  const items = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
  return items
    .map((d) => (typeof d === "string" ? d : d && typeof d === "object" ? String(d.id ?? "") : ""))
    .filter(Boolean)
    .join(", ");
}

function formatCost(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toLocaleString()}`;
}

/**
 * Creates and manages floating glassmorphic hover cards for tasks and milestones.
 * Every interpolated value is HTML-escaped; colors never enter the markup at all: they are
 * allow-listed and handed to the static template through CSS custom properties (CSSOM).
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
    }
    activeCard = null;
  };

  const show = (task: Task, category: Category, e: MouseEvent, metrics?: TaskScheduleMetrics) => {
    hide();
    // Same rules as the layout/grid: only flagged tasks are milestones, durations are inclusive.
    const isMilestone = task.milestone === true;
    const duration = taskDurationDays(task.start, task.end, isMilestone);
    const rawProgress = typeof task.progress === "number" && Number.isFinite(task.progress) ? task.progress : 0;
    const progressPercent = Math.max(0, Math.min(100, Math.round(rawProgress * 100)));

    const card = document.createElement("div");
    card.className = `jantt-hover-card ${currentThemeClassName || ""}`.trim();
    applyThemeVariables(card, currentTheme);

    const title = escapeHtml(getTaskDisplayName(task));
    const catLabel = escapeHtml(category.label || task.category || "General");
    const catColor = sanitizeCssColor(category.color, DEFAULT_CATEGORY.color);
    const cost = formatCost(task.estimatedCost);
    const dependsOnText = task.dependsOn ? formatDependsOn(task.dependsOn) : "";

    let baselineHtml = "";
    if (task.baseline && isValidISODate(task.baseline.start) && isValidISODate(task.baseline.end)) {
      const variance = diffDays(task.baseline.end, task.end);
      const varianceText =
        variance > 0 ? `+${variance}d slip` : variance < 0 ? `${variance}d ahead` : "on plan";
      const varianceColor = variance > 0 ? "#F59E0B" : variance < 0 ? "#10B981" : "var(--jantt-text-muted)";
      baselineHtml = `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Baseline Plan</span>
          <span class="jantt-hover-stat-value">
            ${escapeHtml(formatHumanDate(task.baseline.start))} → ${escapeHtml(formatHumanDate(task.baseline.end))}
            <span class="jantt-hover-duration-tag" style="color: ${varianceColor};">(${escapeHtml(varianceText)})</span>
          </span>
        </div>`;
    }

    let bufferColor = "#10B981";
    let bufferText = "";
    if (metrics) {
      if (metrics.isCritical) {
        bufferColor = "var(--jantt-critical, #EF4444)";
        bufferText = "Critical Path (0d buffer)";
      } else if (metrics.totalFloat < 0) {
        bufferColor = "#EF4444";
        bufferText = `Behind by ${Math.abs(metrics.totalFloat)}d (negative float)`;
      } else {
        if (metrics.isNearCritical) bufferColor = "#F59E0B";
        bufferText = `${metrics.totalFloat}d buffer (Free: ${metrics.freeFloat}d)`;
      }
    }

    const priorityColor =
      task.priority === "urgent" ? "#E11D48" : task.priority === "high" ? "#D97706" : "var(--jantt-accent)";
    card.style.setProperty("--jantt-hover-cat", catColor);
    card.style.setProperty("--jantt-hover-buffer", bufferColor);
    card.style.setProperty("--jantt-hover-priority", priorityColor);

    card.innerHTML = `
      <div class="jantt-hover-card-header">
        <div class="jantt-hover-card-tags">
          <span class="jantt-hover-category-pill" style="background: color-mix(in srgb, var(--jantt-hover-cat) 14%, transparent); color: var(--jantt-hover-cat); border: 1px solid color-mix(in srgb, var(--jantt-hover-cat) 35%, transparent);">
            <span class="jantt-hover-dot" style="background: var(--jantt-hover-cat);"></span>
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
            ${escapeHtml(formatHumanDate(task.start))} → ${escapeHtml(formatHumanDate(task.end))}
            <span class="jantt-hover-duration-tag">(${escapeHtml(duration)}d)</span>
          </span>
        </div>

        ${baselineHtml}

        ${
          !isMilestone
            ? `
        <div class="jantt-hover-progress-section">
          <div class="jantt-hover-progress-labels">
            <span class="jantt-hover-stat-label">Progress</span>
            <span class="jantt-hover-progress-val">${escapeHtml(progressPercent)}%</span>
          </div>
          <div class="jantt-hover-progress-track">
            <div class="jantt-hover-progress-bar" style="background: var(--jantt-hover-cat);"></div>
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
          <span class="jantt-hover-stat-value" style="font-weight: 700; text-transform: uppercase; font-size: 11px; color: var(--jantt-hover-priority);">
            ${escapeHtml(task.priority)}
          </span>
        </div>
        `
            : ""
        }

        ${
          cost !== null
            ? `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Planned Budget</span>
          <span class="jantt-hover-stat-value" style="font-family: var(--jantt-font-mono); font-weight: 600;">
            ${escapeHtml(cost)}
          </span>
        </div>
        `
            : ""
        }

        ${
          dependsOnText
            ? `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Depends On</span>
          <span class="jantt-hover-stat-value" style="font-family: var(--jantt-font-mono); color: var(--jantt-accent); font-weight: 600;">
            ${escapeHtml(dependsOnText)}
          </span>
        </div>
        `
            : ""
        }

        ${
          metrics
            ? `
        <div class="jantt-hover-stat-row">
          <span class="jantt-hover-stat-label">Schedule Buffer</span>
          <span class="jantt-hover-stat-value" style="font-weight: 600; color: var(--jantt-hover-buffer);">
            ${escapeHtml(bufferText)}
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

    const progressBar = card.querySelector<HTMLElement>(".jantt-hover-progress-bar");
    if (progressBar) progressBar.style.width = `${progressPercent}%`;

    // Mounted on body (top-level stacking); theme tokens are applied inline above.
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
