import { Task, ViewportOptions, TimeScale, TimeFormat, LinkRoutingStyle, RowHeightMode } from "./types";
import { DAY_WIDTH_MIN, DAY_WIDTH_MAX, DEFAULT_GAP_DAYS, SCALE_DAY_WIDTHS } from "./constants";
import { MINUTES_PER_DAY } from "./date-math";

/**
 * Escapes HTML characters to prevent XSS. Safe for element text and quoted attribute values.
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
 * Plain CSS colors only: hex (3/4/6/8 digits), a color function whose arguments hold no nested
 * parentheses, quotes, `;`, `<` or `\` (rgb/hsl/hwb/lab/lch/oklab/oklch), a `var(--token)`, or a
 * named color. `url(...)`, `image-set(...)` and attribute or declaration break-outs cannot match.
 */
const SAFE_CSS_COLOR =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([-+0-9a-z.,%\s/]{1,80}\)|var\(--[a-z0-9-]{1,64}\)|[a-z]{3,32})$/i;

/**
 * Returns the trimmed `value` when it is a plain CSS color (see grammar above), otherwise
 * `fallback` (or `undefined` when no fallback is given). Plan colors (categories, people, teams,
 * tasks, notes) are user-controlled and may arrive from shared rooms or links, so every sink that
 * puts one into `style` or markup must pass it through this single allow-list first.
 */
export function sanitizeCssColor(value: unknown): string | undefined;
export function sanitizeCssColor(value: unknown, fallback: string): string;
export function sanitizeCssColor(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return color.length <= 100 && SAFE_CSS_COLOR.test(color) ? color : fallback;
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
 * Non-numeric or non-finite values (e.g. a hand-edited `"gapDays": "2"`) are ignored, so they
 * can never leak into day arithmetic as string concatenation or NaN.
 */
export function getEffectiveGap(
  task: { gapDays?: number | null; minGapDays?: number | null },
  defaultGapDays: number = DEFAULT_GAP_DAYS
): number {
  if (typeof task.gapDays === "number" && Number.isFinite(task.gapDays)) return task.gapDays;
  if (typeof task.minGapDays === "number" && Number.isFinite(task.minGapDays)) return task.minGapDays;
  return defaultGapDays;
}

/**
 * Clamps day width to the supported continuous zoom range with 1-decimal precision.
 * Non-finite input (NaN, undefined from a bad persisted zoom) yields `fallback` (day-scale width).
 */
export function clampDayWidth(width: number, fallback: number = SCALE_DAY_WIDTHS.day): number {
  const safe = Number.isFinite(width) ? width : Number.isFinite(fallback) ? fallback : SCALE_DAY_WIDTHS.day;
  return Math.max(DAY_WIDTH_MIN, Math.min(DAY_WIDTH_MAX, Math.round(safe * 10) / 10));
}

/**
 * Returns the interactive drag/resize/keyboard snap increment in minutes for a given `dayWidth`.
 * Day..year scales stay on 1440-minute (whole day) steps so existing date-only ergonomics remain unchanged.
 */
export function getDragStepMinutes(dayWidth: number): number {
  if (dayWidth >= 11520) return 1;
  if (dayWidth >= 2880) return 5;
  if (dayWidth >= 1440) return 15;
  if (dayWidth >= 540) return 30;
  if (dayWidth >= 180) return 60;
  return MINUTES_PER_DAY;
}

const SLIDER_LOG_RATIO = Math.log(DAY_WIDTH_MAX / DAY_WIDTH_MIN);

/** Converts `dayWidth` into a normalized [0..1000] logarithmic zoom slider position. */
export function dayWidthToSlider(dayWidth: number): number {
  const clamped = clampDayWidth(dayWidth);
  return Math.round((Math.log(clamped / DAY_WIDTH_MIN) / SLIDER_LOG_RATIO) * 1000);
}

/** Converts a [0..1000] logarithmic zoom slider position back to a clamped `dayWidth`. */
export function sliderToDayWidth(sliderVal: number): number {
  const t = Math.max(0, Math.min(1, (Number.isFinite(sliderVal) ? sliderVal : 0) / 1000));
  return clampDayWidth(DAY_WIDTH_MIN * Math.exp(t * SLIDER_LOG_RATIO));
}

/** Formats a compact human readout for the current zoom density (`2px/d`, `20px/h`, `2px/m`). */
export function formatZoomReadout(dayWidth: number): string {
  if (dayWidth >= 1440) {
    const pxMin = dayWidth / MINUTES_PER_DAY;
    return `${pxMin >= 10 ? Math.round(pxMin) : Math.round(pxMin * 10) / 10}px/m`;
  }
  if (dayWidth >= 180) {
    return `${Math.round(dayWidth / 24)}px/h`;
  }
  return `${dayWidth < 10 ? Math.round(dayWidth * 10) / 10 : Math.round(dayWidth)}px/d`;
}

export interface ViewportSnapshotState {
  scale: TimeScale;
  dayWidth: number;
  timeFormat?: TimeFormat;
  linkRouting: LinkRoutingStyle;
  rowHeight: number;
  rowHeightMode: RowHeightMode;
  showCriticalPath: boolean;
  showBaselines: boolean;
  autoCascade?: boolean;
  selectedDate: string | null;
  showDateFilterBadge?: boolean;
  filterTasksByDate?: boolean;
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
    ...(state.timeFormat ? { timeFormat: state.timeFormat } : {}),
    linkRouting: state.linkRouting,
    rowHeight: state.rowHeight,
    rowHeightMode: state.rowHeightMode,
    showCriticalPath: state.showCriticalPath,
    showBaselines: state.showBaselines,
    autoCascade: state.autoCascade,
    selectedDate: state.selectedDate,
    ...(state.showDateFilterBadge !== undefined ? { showDateFilterBadge: state.showDateFilterBadge } : {}),
    ...(state.filterTasksByDate !== undefined ? { filterTasksByDate: state.filterTasksByDate } : {}),
    ...(state.labelWidth !== undefined ? { labelWidth: state.labelWidth } : {}),
    ...(state.headerHeight !== undefined ? { headerHeight: state.headerHeight } : {})
  };
}

/** Clamps a progress value to [0, 1] with 2-decimal precision; non-finite input yields undefined. */
function normalizeProgress(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

/**
 * Smartly synchronizes status and progress for a task patch in a bidirectional,
 * idempotent, and robust manner.
 *
 * The result never contradicts itself: "in-progress" and "submitted" stay below 100%
 * (so isTaskDone() agrees with the status), "submitted" is at least 75%, and a non-finite
 * progress in the patch is dropped instead of being written to the task.
 */
export function syncTaskProgressAndStatus(
  patch: Partial<Task>,
  currentTask?: Partial<Task>
): Partial<Task> {
  const result: Partial<Task> = { ...patch };
  const patchProg = normalizeProgress(patch.progress);
  if (patch.progress !== undefined && patch.progress !== null && patchProg === undefined) {
    delete result.progress;
  }

  const currentProg = patchProg ?? normalizeProgress(currentTask?.progress) ?? 0;

  const currentStatus =
    patch.status !== undefined
      ? patch.status
      : currentTask?.status ?? "not-started";

  // Case 1: Status explicitly provided in patch
  if (patch.status !== undefined) {
    if (patch.status === "completed") {
      result.progress = 1.0;
    } else if (patch.status === "not-started") {
      result.progress = 0.0;
    } else if (patch.status === "submitted") {
      result.progress = Math.min(0.99, Math.max(0.75, currentProg || 0.75));
    } else if (patch.status === "in-progress") {
      if (patchProg === undefined) {
        result.progress = currentProg <= 0 || currentProg >= 1.0 ? 0.25 : currentProg;
      } else {
        result.progress = Math.min(0.99, patchProg);
      }
    } else if (patchProg !== undefined) {
      result.progress = patchProg;
    }
  }
  // Case 2: Progress explicitly provided in patch (and status was not explicitly updated)
  else if (patchProg !== undefined) {
    const p = patchProg;
    result.progress = p;

    if (p >= 1.0) {
      result.status = "completed";
    } else if (p <= 0) {
      result.status = "not-started";
    } else {
      // 0 < p < 1.0
      if (currentStatus === "completed" || currentStatus === "not-started") {
        result.status = "in-progress";
      } else if (currentStatus === "submitted" && p < 0.75) {
        result.status = "in-progress";
      } else {
        result.status = currentStatus;
      }
    }
  }

  return result;
}

/**
 * Checks if a task is completed or done, either via status ("completed" or "done")
 * or via progress reaching 100% (1.0 or >= 1).
 */
export function isTaskDone(task?: { status?: string; progress?: number | null } | null): boolean {
  if (!task) return false;
  if (task.status === "completed" || task.status === "done") return true;
  if (typeof task.progress === "number" && task.progress >= 1) return true;
  return false;
}
