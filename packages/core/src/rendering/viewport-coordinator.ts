import { Task, TimeScale, LinkRoutingStyle, RowHeightMode, JanttData, JanttOptions, ViewportOptions } from "../types";
import { diffDays, isTaskOnDate } from "../date-math";
import { buildViewportSnapshot, getTaskDisplayName } from "../utils";
import { computeChartBounds, resolveHeaderHeight } from "../layout";
import {
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
  /**
   * Zoom anchor (header drag or wheel zoom): the anchored date as days from `dragAnchorStartDate`,
   * kept at `dragAnchorOffsetPx` from the visible timeline's left edge (0 = leftmost date).
   */
  dragAnchorLeftmostDays: number | null;
  dragAnchorStartDate: string;
  dragAnchorOffsetPx: number;
}

export class ViewportCoordinator {
  /**
   * Filters active tasks for display based on search text and selected date filter.
   * Soft-deleted tasks (sync tombstones) are never displayed, counted or used for fit sizing.
   */
  public static filterDisplayTasks(
    allTasks: Task[],
    filterQuery: string,
    selectedDateFilter: string | null,
    options: JanttOptions
  ): Task[] {
    let displayTasks = allTasks.some((t) => t._deleted) ? allTasks.filter((t) => !t._deleted) : allTasks;

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      // Plan fields may hold non-strings at runtime (e.g. a numeric label from JSON): coerce first.
      const matches = (value: unknown) => String(value ?? "").toLowerCase().includes(q);
      displayTasks = displayTasks.filter(
        (t) => matches(getTaskDisplayName(t)) || matches(t.category) || matches(t.notes)
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
   * Calculates the row height for rowHeightMode 'fit' so header + rows + add-row exactly fill the
   * chart body. `layoutData`/`layoutOptions` must be what `layout()` receives, so the header height
   * (multi-year tier) matches the rendered chart.
   *
   * The budget is exact (measured toolbar, horizontal scrollbar, add row that shrinks with the
   * rows), which makes the result a fixed point for content-sized hosts: re-measuring after our own
   * render yields the same height instead of shrinking rows on every resize notification. When the
   * chart has no definite space yet (hidden host, first render in an auto-height container) the
   * custom row height is used. When rows cannot fit, they clamp to MIN_ROW_HEIGHT and the body scrolls.
   */
  public static calculateRowHeight(
    container: HTMLElement,
    root: HTMLElement,
    layoutData: JanttData,
    layoutOptions: ViewportOptions,
    rowHeightMode: RowHeightMode,
    customRowHeight: number,
    readOnly?: boolean
  ): number {
    if (rowHeightMode !== "fit") {
      return customRowHeight;
    }

    const toolbar = root.querySelector<HTMLElement>(".jantt-toolbar");
    const toolbarH = toolbar ? toolbar.offsetHeight : TOOLBAR_HEIGHT;
    const body = root.querySelector<HTMLElement>(".jantt-body-wrap");
    const horizontalScrollbarH = body ? Math.max(0, body.offsetHeight - body.clientHeight) : 0;
    const innerH = root.clientHeight || container.clientHeight;

    const bounds = computeChartBounds(layoutData, layoutOptions);
    const headerH = resolveHeaderHeight(bounds.spansMultipleYears, layoutOptions.headerHeight);
    const availH = innerH - toolbarH - horizontalScrollbarH - headerH;
    const count = Math.max(layoutData.tasks.length, 1);

    if (availH < MIN_ROW_HEIGHT) {
      return customRowHeight;
    }

    let rowH: number;
    if (readOnly) {
      rowH = Math.floor(availH / count);
    } else {
      rowH = Math.floor((availH - ADD_ROW_HEIGHT) / count);
      // Below ADD_ROW_HEIGHT the add row is as tall as a task row (min(rowHeight, ADD_ROW_HEIGHT))
      if (rowH < ADD_ROW_HEIGHT) rowH = Math.floor(availH / (count + 1));
    }

    return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, rowH));
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
        // Anchored zoom (header drag session / wheel): the anchored date keeps its screen offset
        const startDeltaDays = diffDays(newStartDate, state.dragAnchorStartDate);
        const anchorDays = Math.max(0, state.dragAnchorLeftmostDays + startDeltaDays);
        targetScrollLeft = Math.max(0, Math.round(anchorDays * currentDayWidth - (state.dragAnchorOffsetPx || 0)));
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
