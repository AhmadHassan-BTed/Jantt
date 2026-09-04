import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  getTaskDisplayName,
  getEffectiveGap,
  clampDayWidth,
  buildViewportSnapshot,
  syncTaskProgressAndStatus
} from "../src/utils";
import { resolveSchedule } from "../src/resolver";
import { Task } from "../src/types";

describe("Core Utilities & Robustness", () => {
  describe("escapeHtml", () => {
    it("escapes all dangerous HTML characters", () => {
      expect(escapeHtml("<script>alert('xss & \"attack\"')</script>")).toBe(
        "&lt;script&gt;alert(&#039;xss &amp; &quot;attack&quot;&#039;)&lt;/script&gt;"
      );
    });

    it("handles null and undefined gracefully", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });
  });

  describe("getTaskDisplayName", () => {
    it("prioritizes label over name and id", () => {
      expect(getTaskDisplayName({ id: "t1", label: "My Label", name: "My Name" })).toBe("My Label");
    });

    it("falls back to name if label is omitted", () => {
      expect(getTaskDisplayName({ id: "t1", name: "My Name" })).toBe("My Name");
    });

    it("falls back to id if both label and name are omitted", () => {
      expect(getTaskDisplayName({ id: "task-42" })).toBe("task-42");
    });
  });

  describe("getEffectiveGap", () => {
    it("uses task gapDays if specified", () => {
      expect(getEffectiveGap({ gapDays: 5 }, 2)).toBe(5);
      expect(getEffectiveGap({ gapDays: 0 }, 2)).toBe(0);
    });

    it("uses minGapDays as fallback if gapDays is omitted", () => {
      expect(getEffectiveGap({ minGapDays: 3 }, 2)).toBe(3);
    });

    it("uses defaultGapDays if neither is specified", () => {
      expect(getEffectiveGap({}, 2)).toBe(2);
      expect(getEffectiveGap({}, 0)).toBe(0);
    });
  });

  describe("clampDayWidth", () => {
    it("clamps values below minimum to 1.2", () => {
      expect(clampDayWidth(0.5)).toBe(1.2);
      expect(clampDayWidth(-10)).toBe(1.2);
    });

    it("clamps values above maximum to 80", () => {
      expect(clampDayWidth(150)).toBe(80);
    });

    it("rounds to 1 decimal place", () => {
      expect(clampDayWidth(36.4444)).toBe(36.4);
      expect(clampDayWidth(36.4555)).toBe(36.5);
    });
  });

  describe("buildViewportSnapshot", () => {
    it("constructs a complete, well-formed viewport options object", () => {
      const snapshot = buildViewportSnapshot({
        scale: "month",
        dayWidth: 7,
        linkRouting: "curved",
        rowHeight: 46,
        rowHeightMode: "fit",
        showCriticalPath: true,
        showBaselines: false,
        selectedDate: "2026-09-04",
        labelWidth: 320
      });

      expect(snapshot).toEqual({
        scale: "month",
        dayWidth: 7,
        linkRouting: "curved",
        rowHeight: 46,
        rowHeightMode: "fit",
        showCriticalPath: true,
        showBaselines: false,
        selectedDate: "2026-09-04",
        labelWidth: 320
      });
    });
  });

  describe("resolveSchedule Purity & Deep Isolation", () => {
    it("guarantees deep cloning of baseline and fields so mutating output never corrupts input", () => {
      const originalTasks: Task[] = [
        {
          id: "t1",
          category: "dev",
          start: "2026-09-01",
          end: "2026-09-05",
          baseline: { start: "2026-09-01", end: "2026-09-05" },
          fields: { team: "Frontend", budget: 1000 }
        }
      ];

      const resolved = resolveSchedule(originalTasks, 2);
      expect(resolved).toHaveLength(1);

      // Mutate the returned task's nested objects
      resolved[0].baseline!.start = "2099-01-01";
      (resolved[0].fields as any).budget = 999999;

      // Verify original input remained pristine
      expect(originalTasks[0].baseline!.start).toBe("2026-09-01");
      expect(originalTasks[0].fields!.budget).toBe(1000);
    });
  });

  describe("syncTaskProgressAndStatus", () => {
    it("sets progress to 1.0 when status is completed", () => {
      expect(syncTaskProgressAndStatus({ status: "completed" })).toEqual({
        status: "completed",
        progress: 1.0
      });
    });

    it("sets progress to 0 when status is not-started", () => {
      expect(syncTaskProgressAndStatus({ status: "not-started" }, { progress: 0.8 })).toEqual({
        status: "not-started",
        progress: 0.0
      });
    });

    it("ensures submitted status has at least 0.75 progress", () => {
      expect(syncTaskProgressAndStatus({ status: "submitted" }, { progress: 0.2 })).toEqual({
        status: "submitted",
        progress: 0.75
      });
      expect(syncTaskProgressAndStatus({ status: "submitted" }, { progress: 0.9 })).toEqual({
        status: "submitted",
        progress: 0.9
      });
    });

    it("adjusts in-progress status from 0 or 1.0 to 0.25 default", () => {
      expect(syncTaskProgressAndStatus({ status: "in-progress" }, { progress: 0 })).toEqual({
        status: "in-progress",
        progress: 0.25
      });
      expect(syncTaskProgressAndStatus({ status: "in-progress" }, { progress: 1.0 })).toEqual({
        status: "in-progress",
        progress: 0.25
      });
      expect(syncTaskProgressAndStatus({ status: "in-progress" }, { progress: 0.6 })).toEqual({
        status: "in-progress",
        progress: 0.6
      });
    });

    it("sets status to completed when progress is 1.0", () => {
      expect(syncTaskProgressAndStatus({ progress: 1.0 }, { status: "in-progress" })).toEqual({
        status: "completed",
        progress: 1.0
      });
    });

    it("sets status to not-started when progress is 0.0", () => {
      expect(syncTaskProgressAndStatus({ progress: 0.0 }, { status: "in-progress" })).toEqual({
        status: "not-started",
        progress: 0.0
      });
    });

    it("transitions not-started or completed to in-progress when progress is between 0 and 1", () => {
      expect(syncTaskProgressAndStatus({ progress: 0.5 }, { status: "completed" })).toEqual({
        status: "in-progress",
        progress: 0.5
      });
      expect(syncTaskProgressAndStatus({ progress: 0.3 }, { status: "not-started" })).toEqual({
        status: "in-progress",
        progress: 0.3
      });
    });

    it("preserves submitted status if progress >= 0.75", () => {
      expect(syncTaskProgressAndStatus({ progress: 0.8 }, { status: "submitted" })).toEqual({
        status: "submitted",
        progress: 0.8
      });
    });

    it("transitions submitted to in-progress if progress drops below 0.75", () => {
      expect(syncTaskProgressAndStatus({ progress: 0.5 }, { status: "submitted" })).toEqual({
        status: "in-progress",
        progress: 0.5
      });
    });
  });
});
