import { Task, ViewportOptions, TimeScale, LinkRoutingStyle, RowHeightMode } from "./types";
import { DAY_WIDTH_MIN, DAY_WIDTH_MAX, DEFAULT_GAP_DAYS } from "./constants";

/**
 * Escapes HTML characters to prevent XSS.
 */
export function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Gets human-readable display label for a task with fallback to name and id.
 */
export function getTaskDisplayName(task: Task | { id: string; label?: string; name?: string }): string {
  if (!task) return "";
  return task.label || task.name || task.id;
}

/**
 * Derives the effective gap days for a task, respecting explicit task-level gap,
 * backwards-compatible minGapDays, or project-level default gap.
 */
export function getEffectiveGap(
  task: { gapDays?: number | null; minGapDays?: number | null },
  defaultGapDays: number = DEFAULT_GAP_DAYS
): number {
  if (task.gapDays !== undefined && task.gapDays !== null) return task.gapDays;
  if (task.minGapDays !== undefined && task.minGapDays !== null) return task.minGapDays;
  return defaultGapDays;
}

/**
 * Clamps day width to the supported continuous zoom range with 1-decimal precision.
 */
export function clampDayWidth(width: number): number {
  return Math.max(DAY_WIDTH_MIN, Math.min(DAY_WIDTH_MAX, Math.round(width * 10) / 10));
}

export interface ViewportSnapshotState {
  scale: TimeScale;
  dayWidth: number;
  linkRouting: LinkRoutingStyle;
  rowHeight: number;
  rowHeightMode: RowHeightMode;
  showCriticalPath: boolean;
  showBaselines: boolean;
  selectedDate: string | null;
  labelWidth?: number;
  headerHeight?: number;
}

/**
 * Constructs a normalized ViewportOptions snapshot payload for onViewportChange callbacks.
 */
export function buildViewportSnapshot(state: ViewportSnapshotState): ViewportOptions {
  return {
    scale: state.scale,
    dayWidth: state.dayWidth,
    linkRouting: state.linkRouting,
    rowHeight: state.rowHeight,
    rowHeightMode: state.rowHeightMode,
    showCriticalPath: state.showCriticalPath,
    showBaselines: state.showBaselines,
    selectedDate: state.selectedDate,
    ...(state.labelWidth !== undefined ? { labelWidth: state.labelWidth } : {}),
    ...(state.headerHeight !== undefined ? { headerHeight: state.headerHeight } : {})
  };
}
