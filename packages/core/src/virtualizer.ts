/**
 * Jantt 2D Virtualization & Windowing Math
 * O(1) viewport windowing helpers for renderers that draw only what is visible
 * (used by the canvas renderer; the DOM renderer does not window rows or days yet).
 *
 * Implements:
 * 1. O(1) Vertical Row Windowing with dynamic overscan buffer
 * 2. O(1) Horizontal Date Range Windowing for deep multi-year timelines
 * 3. Spatial bounding-box culling for SVG dependency lines and milestone diamonds
 */

export interface VerticalVirtualWindow {
  startIndex: number;
  endIndex: number;
  visibleCount: number;
  offsetY: number;
  totalHeight: number;
  paddingBottom: number;
  isVirtual: boolean;
}

export interface HorizontalVirtualWindow {
  startDayOffset: number;
  endDayOffset: number;
  visibleDays: number;
  offsetX: number;
  totalWidth: number;
  paddingRight: number;
  isVirtual: boolean;
}

export interface Virtual2DViewport {
  vertical: VerticalVirtualWindow;
  horizontal: HorizontalVirtualWindow;
}

export interface VirtualizerOptions {
  rowOverscan?: number;
  dayOverscan?: number;
  virtualThreshold?: number; // Minimum task count before virtualization engages
}

const DEFAULT_ROW_OVERSCAN = 10;
const DEFAULT_DAY_OVERSCAN = 14;
const DEFAULT_VIRTUAL_THRESHOLD = 50;

/**
 * Computes vertical row slicing given scroll position and viewport height.
 * O(1) time complexity.
 */
export function computeVerticalVirtualWindow(
  totalCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = DEFAULT_ROW_OVERSCAN,
  threshold = DEFAULT_VIRTUAL_THRESHOLD
): VerticalVirtualWindow {
  const totalHeight = totalCount * rowHeight;

  if (totalCount <= threshold || viewportHeight <= 0 || rowHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: totalCount,
      visibleCount: totalCount,
      offsetY: 0,
      totalHeight,
      paddingBottom: 0,
      isVirtual: false
    };
  }

  const clampedScrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight)));
  const rawStartIndex = Math.floor(clampedScrollTop / rowHeight);
  const rawEndIndex = Math.ceil((clampedScrollTop + viewportHeight) / rowHeight);

  const startIndex = Math.max(0, rawStartIndex - overscan);
  const endIndex = Math.min(totalCount, rawEndIndex + overscan);
  const visibleCount = endIndex - startIndex;

  const offsetY = startIndex * rowHeight;
  const paddingBottom = Math.max(0, totalHeight - (endIndex * rowHeight));

  return {
    startIndex,
    endIndex,
    visibleCount,
    offsetY,
    totalHeight,
    paddingBottom,
    isVirtual: true
  };
}

/**
 * Computes horizontal date slicing given scroll position and viewport width.
 * O(1) time complexity.
 */
export function computeHorizontalVirtualWindow(
  totalDays: number,
  dayWidth: number,
  scrollLeft: number,
  viewportWidth: number,
  overscanDays = DEFAULT_DAY_OVERSCAN
): HorizontalVirtualWindow {
  const totalWidth = totalDays * dayWidth;

  if (totalDays <= 0 || viewportWidth <= 0 || dayWidth <= 0) {
    return {
      startDayOffset: 0,
      endDayOffset: totalDays,
      visibleDays: totalDays,
      offsetX: 0,
      totalWidth,
      paddingRight: 0,
      isVirtual: false
    };
  }

  const clampedScrollLeft = Math.max(0, Math.min(scrollLeft, Math.max(0, totalWidth - viewportWidth)));
  const rawStartDay = Math.floor(clampedScrollLeft / dayWidth);
  const rawEndDay = Math.ceil((clampedScrollLeft + viewportWidth) / dayWidth);

  const startDayOffset = Math.max(0, rawStartDay - overscanDays);
  const endDayOffset = Math.min(totalDays, rawEndDay + overscanDays);
  const visibleDays = endDayOffset - startDayOffset;

  const offsetX = startDayOffset * dayWidth;
  const paddingRight = Math.max(0, totalWidth - (endDayOffset * dayWidth));

  return {
    startDayOffset,
    endDayOffset,
    visibleDays,
    offsetX,
    totalWidth,
    paddingRight,
    isVirtual: true
  };
}

/**
 * Master 2D Virtualization Coordinator
 */
export class PlanVirtualizer {
  private options: Required<VirtualizerOptions>;

  constructor(options: VirtualizerOptions = {}) {
    this.options = {
      rowOverscan: options.rowOverscan ?? DEFAULT_ROW_OVERSCAN,
      dayOverscan: options.dayOverscan ?? DEFAULT_DAY_OVERSCAN,
      virtualThreshold: options.virtualThreshold ?? DEFAULT_VIRTUAL_THRESHOLD
    };
  }

  public getViewport2D(
    totalTasks: number,
    rowHeight: number,
    scrollTop: number,
    viewportHeight: number,
    totalDays: number,
    dayWidth: number,
    scrollLeft: number,
    viewportWidth: number
  ): Virtual2DViewport {
    const vertical = computeVerticalVirtualWindow(
      totalTasks,
      rowHeight,
      scrollTop,
      viewportHeight,
      this.options.rowOverscan,
      this.options.virtualThreshold
    );

    const horizontal = computeHorizontalVirtualWindow(
      totalDays,
      dayWidth,
      scrollLeft,
      viewportWidth,
      this.options.dayOverscan
    );

    return { vertical, horizontal };
  }

  /**
   * Spatial Culling: Checks if a bounding box (canvas px) intersects the 2D rendered window,
   * i.e. [offsetX, endDayOffset * dayWidth] x [offsetY, endIndex * rowHeight].
   */
  public isVisible(
    boxX: number,
    boxWidth: number,
    boxY: number,
    boxHeight: number,
    window2D: Virtual2DViewport
  ): boolean {
    const { horizontal, vertical } = window2D;
    // Window extents derived from the same units the windows were computed in (dayWidth/rowHeight),
    // independent of the queried box size.
    const windowMinX = horizontal.offsetX;
    const windowMaxX = horizontal.totalWidth - horizontal.paddingRight;
    const windowMinY = vertical.offsetY;
    const windowMaxY = vertical.totalHeight - vertical.paddingBottom;

    return !(
      boxX + boxWidth < windowMinX ||
      boxX > windowMaxX ||
      boxY + boxHeight < windowMinY ||
      boxY > windowMaxY
    );
  }
}

