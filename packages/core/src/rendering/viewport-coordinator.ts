import { Task, TimeScale, LinkRoutingStyle, RowHeightMode, JanttOptions, ViewportOptions } from "../types";
import { parseISODate, diffDays, getTodayISODate, isTaskOnDate } from "../date-math";
import { buildViewportSnapshot } from "../utils";
import {
  DEFAULT_HEADER_HEIGHT,
  MULTI_YEAR_HEADER_HEIGHT,
  TOOLBAR_HEIGHT,
  ADD_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT
} from "../constants";

export interface ViewportCoordinationState {
  currentScale: TimeScale;
  currentDayWidth: number;
  currentRouting: LinkRoutingStyle;
  rowHeightMode: RowHeightMode;
  customRowHeight: number;
  showCritical: boolean;
  showBaselines: boolean;
  labelWidth: number;
  filterQuery: string;
  selectedDateFilter: string | null;
  renderedDayWidth: number;
  renderedStartDate: string;
  dragAnchorLeftmostDays: number | null;
  dragAnchorStartDate: string;
}

export class ViewportCoordinator {
  /**
   * Filters active tasks for display based on search text and selected date filter.
   */
  public static filterDisplayTasks(
    allTasks: Task[],
    filterQuery: string,
    selectedDateFilter: string | null,
    options: JanttOptions
  ): Task[] {
    let displayTasks = allTasks;

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      displayTasks = allTasks.filter(
        (t) =>
          (t.label || t.name || t.id).toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q)
      );
    }

    const shouldFilterTasksByDate =
      options.filterTasksByDate !== false &&
      options.viewport?.filterTasksByDate !== false;

    if (selectedDateFilter && shouldFilterTasksByDate) {
      displayTasks = displayTasks.filter((t) => {
        if (!t.start || !t.end) return false;
        return isTaskOnDate(t.start, t.end, selectedDateFilter);
      });
    }

    return displayTasks;
  }

  /**
   * Calculates the optimal dynamic row height when rowHeightMode is 'fit',
   * taking into account header multi-year spanning, toolbar height, and container dimensions.
   */
  public static calculateRowHeight(
    container: HTMLElement,
    root: HTMLElement,
    allTasks: Task[],
    displayTaskCount: number,
    rowHeightMode: RowHeightMode,
    customRowHeight: number,
    viewportOptions?: ViewportOptions,
    readOnly?: boolean
  ): number {
    if (rowHeightMode !== "fit") {
      return customRowHeight;
    }

    const containerH = container.clientHeight || root.clientHeight || 550;
    let minStart = allTasks[0]?.start || getTodayISODate(viewportOptions?.currentTime);
    let maxEnd = allTasks[allTasks.length - 1]?.end || minStart;

    allTasks.forEach((t) => {
      if (t.start && t.start < minStart) minStart = t.start;
      if (t.end && t.end > maxEnd) maxEnd = t.end;
    });

    const spansMulti = parseISODate(minStart).getUTCFullYear() !== parseISODate(maxEnd).getUTCFullYear();
    const headerH = spansMulti ? MULTI_YEAR_HEADER_HEIGHT : (viewportOptions?.headerHeight || DEFAULT_HEADER_HEIGHT);
    const existingToolbar = root.querySelector<HTMLElement>(".jantt-toolbar");
    const toolbarH = existingToolbar ? existingToolbar.offsetHeight : TOOLBAR_HEIGHT;
    const addRowH = readOnly ? 0 : ADD_ROW_HEIGHT;
    const borderBuffer = 6;
    const availH = Math.max(containerH - headerH - toolbarH - addRowH - borderBuffer, 100);
    const count = Math.max(displayTaskCount, 1);

    return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.floor(availH / count)));
  }

  /**
   * Calculates the target scroll offset across re-renders to prevent viewport jumping during zoom,
   * column resizing, or task editing.
   */
  public static calculateScrollTarget(
    savedScrollLeft: number,
    hadPreviousRender: boolean,
    newStartDate: string,
    currentDayWidth: number,
    state: ViewportCoordinationState
  ): number {
    let targetScrollLeft = savedScrollLeft;

    if (hadPreviousRender) {
      if (state.dragAnchorLeftmostDays !== null && state.dragAnchorStartDate) {
        // Continuous column header drag session: anchor to drag start
        const startDeltaDays = diffDays(newStartDate, state.dragAnchorStartDate);
        const newLeftmostDays = Math.max(0, state.dragAnchorLeftmostDays + startDeltaDays);
        targetScrollLeft = Math.max(0, Math.round(newLeftmostDays * currentDayWidth));
      } else if (currentDayWidth !== state.renderedDayWidth || newStartDate !== state.renderedStartDate) {
        // Discrete zoom / scale changes / wheel / slider
        const prevLeftmostDays = savedScrollLeft / state.renderedDayWidth;
        const startDeltaDays = diffDays(newStartDate, state.renderedStartDate);
        const newLeftmostDays = Math.max(0, prevLeftmostDays + startDeltaDays);
        targetScrollLeft = Math.max(0, Math.round(newLeftmostDays * currentDayWidth));
      }
    }

    return targetScrollLeft;
  }

  /**
   * Dispatches a structured viewport snapshot callback to onViewportChange.
   */
  public static broadcastChange(
    options: JanttOptions,
    state: ViewportCoordinationState,
    effectiveRowHeight: number,
    isAutoCascade: boolean
  ): void {
    options.onViewportChange?.(
      buildViewportSnapshot({
        scale: state.currentScale,
        dayWidth: state.currentDayWidth,
        linkRouting: state.currentRouting,
        rowHeight: effectiveRowHeight,
        rowHeightMode: state.rowHeightMode,
        showCriticalPath: state.showCritical,
        showBaselines: state.showBaselines,
        autoCascade: isAutoCascade,
        selectedDate: state.selectedDateFilter,
        showDateFilterBadge: options.showDateFilterBadge ?? options.viewport?.showDateFilterBadge,
        filterTasksByDate: options.filterTasksByDate ?? options.viewport?.filterTasksByDate,
        labelWidth: state.labelWidth
      })
    );
  }
}
