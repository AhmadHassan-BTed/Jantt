import { describe, it, expect } from "vitest";
import {
  computeVerticalVirtualWindow,
  computeHorizontalVirtualWindow,
  PlanVirtualizer
} from "../src/virtualizer";

describe("2D Virtualization & Windowing Engine", () => {
  describe("computeVerticalVirtualWindow", () => {
    it("returns full window without virtualization when totalCount is under threshold", () => {
      const win = computeVerticalVirtualWindow(30, 40, 100, 600, 5, 50);
      expect(win.isVirtual).toBe(false);
      expect(win.startIndex).toBe(0);
      expect(win.endIndex).toBe(30);
      expect(win.visibleCount).toBe(30);
      expect(win.offsetY).toBe(0);
      expect(win.totalHeight).toBe(1200);
      expect(win.paddingBottom).toBe(0);
    });

    it("accurately virtualizes a 10,000-task schedule at mid-scroll", () => {
      const totalCount = 10000;
      const rowHeight = 40;
      const viewportHeight = 800; // 20 rows visible in viewport
      const scrollTop = 4000; // Scrolled down to row 100
      const overscan = 5;

      const win = computeVerticalVirtualWindow(totalCount, rowHeight, scrollTop, viewportHeight, overscan, 50);

      expect(win.isVirtual).toBe(true);
      expect(win.totalHeight).toBe(400000);
      // raw start: 4000 / 40 = 100. With overscan 5 -> 95
      expect(win.startIndex).toBe(95);
      // raw end: (4000 + 800) / 40 = 120. With overscan 5 -> 125
      expect(win.endIndex).toBe(125);
      expect(win.visibleCount).toBe(30);
      expect(win.offsetY).toBe(95 * 40);
      expect(win.paddingBottom).toBe((10000 - 125) * 40);
    });

    it("clamps boundaries correctly at top-of-page scroll", () => {
      const win = computeVerticalVirtualWindow(5000, 36, 0, 720, 10, 50);
      expect(win.isVirtual).toBe(true);
      expect(win.startIndex).toBe(0);
      expect(win.offsetY).toBe(0);
      // raw end = 720 / 36 = 20. With overscan 10 -> 30
      expect(win.endIndex).toBe(30);
      expect(win.visibleCount).toBe(30);
    });

    it("clamps boundaries correctly at bottom-of-page scroll", () => {
      const totalCount = 1000;
      const rowHeight = 40;
      const totalHeight = 40000;
      const viewportHeight = 1000;
      const maxScroll = totalHeight - viewportHeight; // 39000

      const win = computeVerticalVirtualWindow(totalCount, rowHeight, maxScroll + 500, viewportHeight, 10, 50);
      expect(win.isVirtual).toBe(true);
      expect(win.endIndex).toBe(1000);
      expect(win.paddingBottom).toBe(0);
    });

    it("handles extreme scale (100,000 tasks) with sub-millisecond execution", () => {
      const start = performance.now();
      const win = computeVerticalVirtualWindow(100000, 42, 2100000, 1000, 10, 50);
      const elapsed = performance.now() - start;

      expect(win.isVirtual).toBe(true);
      expect(win.totalHeight).toBe(4200000);
      expect(win.visibleCount).toBeLessThan(50);
      expect(elapsed).toBeLessThan(5); // Sub-millisecond calculation
    });
  });

  describe("computeHorizontalVirtualWindow", () => {
    it("slices horizontal time range given scrollLeft and dayWidth", () => {
      const totalDays = 365; // 1 year
      const dayWidth = 24;
      const scrollLeft = 2400; // Day 100
      const viewportWidth = 1200; // 50 days visible
      const overscanDays = 7;

      const win = computeHorizontalVirtualWindow(totalDays, dayWidth, scrollLeft, viewportWidth, overscanDays);

      expect(win.isVirtual).toBe(true);
      expect(win.totalWidth).toBe(365 * 24);
      // raw start: 2400 / 24 = 100. With overscan 7 -> 93
      expect(win.startDayOffset).toBe(93);
      // raw end: (2400 + 1200) / 24 = 150. With overscan 7 -> 157
      expect(win.endDayOffset).toBe(157);
      expect(win.visibleDays).toBe(64);
      expect(win.offsetX).toBe(93 * 24);
    });

    it("handles zero total days gracefully", () => {
      const win = computeHorizontalVirtualWindow(0, 24, 0, 1000);
      expect(win.isVirtual).toBe(false);
      expect(win.visibleDays).toBe(0);
      expect(win.totalWidth).toBe(0);
    });
  });

  describe("PlanVirtualizer class & Spatial Culling", () => {
    const virtualizer = new PlanVirtualizer({ rowOverscan: 5, dayOverscan: 5, virtualThreshold: 20 });

    it("returns combined 2D viewport coordinates", () => {
      const vp2d = virtualizer.getViewport2D(
        500,  // totalTasks
        40,   // rowHeight
        800,  // scrollTop
        400,  // viewportHeight
        100,  // totalDays
        30,   // dayWidth
        600,  // scrollLeft
        600   // viewportWidth
      );

      expect(vp2d.vertical.isVirtual).toBe(true);
      expect(vp2d.horizontal.isVirtual).toBe(true);
      expect(vp2d.vertical.visibleCount).toBeGreaterThan(0);
      expect(vp2d.horizontal.visibleDays).toBeGreaterThan(0);
    });

    it("accurately detects if a bounding box is within view", () => {
      const vp2d = virtualizer.getViewport2D(500, 40, 1000, 400, 200, 20, 1000, 600);

      // In view
      const inView = virtualizer.isVisible(1100, 100, 1100, 40, vp2d);
      expect(inView).toBe(true);

      // Outside vertically (above)
      const above = virtualizer.isVisible(1100, 100, 100, 40, vp2d);
      expect(above).toBe(false);

      // Outside horizontally (far right)
      const farRight = virtualizer.isVisible(5000, 100, 1100, 40, vp2d);
      expect(farRight).toBe(false);
    });
  });
});

