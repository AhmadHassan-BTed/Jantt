// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderTimelineHeader } from "../src/renderers/timeline-header";
import { GridHeader } from "../src/types";

if (typeof window.PointerEvent === "undefined") {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: any = {}) {
      super(type, params);
      this.pointerId = params.pointerId || 1;
      this.pointerType = params.pointerType || "mouse";
    }
  }
  window.PointerEvent = MockPointerEvent as any;
  (global as any).PointerEvent = MockPointerEvent as any;
}

describe("Timeline Header Interactions (Click to Filter & Border Drag to Resize)", () => {
  const mockHeader: GridHeader = {
    totalHeight: 60,
    spansMultipleYears: false,
    years: [],
    months: [
      { label: "September 2026", month: 8, year: 2026, width: 360 }
    ],
    days: [
      {
        dateStr: "2026-09-01",
        label: "1",
        dayName: "Tu",
        dayOfWeek: 2,
        dayOfMonth: 1,
        isWeekend: false,
        isToday: false,
        isTaskBoundary: false,
        width: 36
      },
      {
        dateStr: "2026-09-02",
        label: "2",
        dayName: "We",
        dayOfWeek: 3,
        dayOfMonth: 2,
        isWeekend: false,
        isToday: false,
        isTaskBoundary: true,
        width: 36
      },
      {
        dateStr: "2026-09-03",
        label: "3",
        dayName: "Th",
        dayOfWeek: 4,
        dayOfMonth: 3,
        isWeekend: false,
        isToday: true,
        isTaskBoundary: false,
        width: 36
      }
    ],
    todayX: 72,
    scale: "day"
  };

  it("renders day cells with both click filter support and col-resize handles", () => {
    const onDateClick = vi.fn();
    const onColumnResize = vi.fn();

    const el = renderTimelineHeader(mockHeader, {
      onDateClick,
      onColumnResize,
      dayWidth: 36
    });

    const dayCells = el.querySelectorAll<HTMLElement>(".jantt-day-cell");
    expect(dayCells.length).toBe(3);

    // Each cell has a resize handle between columns
    const resizeHandles = el.querySelectorAll<HTMLElement>(".jantt-col-resize-handle");
    expect(resizeHandles.length).toBeGreaterThanOrEqual(3);

    // Clicking day cell fires onDateClick
    dayCells[0].click();
    expect(onDateClick).toHaveBeenCalledTimes(1);
    expect(onDateClick).toHaveBeenCalledWith("2026-09-01");

    dayCells[1].click();
    expect(onDateClick).toHaveBeenCalledTimes(2);
    expect(onDateClick).toHaveBeenCalledWith("2026-09-02");
  });

  it("clicking the resize handle does NOT trigger onDateClick", () => {
    const onDateClick = vi.fn();
    const onColumnResize = vi.fn();

    const el = renderTimelineHeader(mockHeader, {
      onDateClick,
      onColumnResize,
      dayWidth: 36
    });

    const firstCell = el.querySelector<HTMLElement>(".jantt-day-cell")!;
    const handle = firstCell.querySelector<HTMLElement>(".jantt-col-resize-handle")!;
    expect(handle).toBeTruthy();

    handle.click();
    expect(onDateClick).not.toHaveBeenCalled();
  });

  it("dragging the resize handle between columns invokes onColumnResize", () => {
    const onDateClick = vi.fn();
    const onColumnResize = vi.fn();
    const onColumnResizeStart = vi.fn();
    const onColumnResizeEnd = vi.fn();

    // Stub requestAnimationFrame
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    const el = renderTimelineHeader(mockHeader, {
      onDateClick,
      onColumnResize,
      onColumnResizeStart,
      onColumnResizeEnd,
      dayWidth: 36
    });

    document.body.appendChild(el);

    const firstCell = el.querySelector<HTMLElement>(".jantt-day-cell")!;
    const handle = firstCell.querySelector<HTMLElement>(".jantt-col-resize-handle")!;

    // 1. Pointerdown on handle
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 50,
        button: 0
      })
    );

    // 2. Pointermove past threshold
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 130,
        clientY: 50
      })
    );

    expect(onColumnResizeStart).toHaveBeenCalled();
    expect(onColumnResize).toHaveBeenCalled();

    // 3. Pointerup ends drag
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 130,
        clientY: 50
      })
    );

    expect(onColumnResizeEnd).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it("highlights the selected date with is-date-selected class", () => {
    const el = renderTimelineHeader(mockHeader, {
      selectedDate: "2026-09-02",
      dayWidth: 36
    });

    const dayCells = el.querySelectorAll<HTMLElement>(".jantt-day-cell");
    expect(dayCells[0].classList.contains("is-date-selected")).toBe(false);
    expect(dayCells[1].classList.contains("is-date-selected")).toBe(true);
    expect(dayCells[2].classList.contains("is-date-selected")).toBe(false);
  });
});
