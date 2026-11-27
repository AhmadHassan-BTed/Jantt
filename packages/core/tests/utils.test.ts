import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  sanitizeCssColor,
  getTaskDisplayName,
  getEffectiveGap,
  clampDayWidth,
  buildViewportSnapshot,
  syncTaskProgressAndStatus,
  isTaskDone,
  dayWidthToSlider,
  sliderToDayWidth,
  getDragStepMinutes,
  formatZoomReadout
} from "../src/utils";
import { DAY_WIDTH_MAX, DAY_WIDTH_MIN } from "../src/constants";
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

    it("neutralizes attribute and element break-outs from hostile plan values", () => {
      const XSS = '"><img src=x onerror="window.__xss=1">';
      const escaped = escapeHtml(XSS);
      expect(escaped).not.toMatch(/[<>"']/);
      // Parsed back as markup, the payload is inert text inside a quoted attribute and as content
      const host = document.createElement("div");
      host.innerHTML = `<span title="${escapeHtml(XSS)}" data-x='${escapeHtml("' onclick='x")}'>${escapeHtml(XSS)}</span>`;
      expect(host.querySelector("img")).toBeNull();
      const span = host.querySelector("span")!;
      expect(span.getAttribute("title")).toBe(XSS);
      expect(span.hasAttribute("onclick")).toBe(false);
      expect(span.textContent).toBe(XSS);
      expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined();
    });

    it("stringifies non-string values (numbers, booleans, objects) before escaping", () => {
      expect(escapeHtml(5000)).toBe("5000");
      expect(escapeHtml(0)).toBe("0");
      expect(escapeHtml(false)).toBe("false");
      expect(escapeHtml({ toString: () => "<b>" })).toBe("&lt;b&gt;");
      expect(escapeHtml("&amp;")).toBe("&amp;amp;"); // not idempotent: escape exactly once at the sink
    });
  });

  describe("sanitizeCssColor", () => {
    it("accepts plain CSS colors (trimmed)", () => {
      const safe = ["#fff", "#FFFA", "#3B82F6", "#3b82f680", "rgb(1, 2, 3)", "rgba(1 2 3 / 50%)", "hsl(200deg 50% 40%)",
        "hsla(200, 50%, 40%, 0.5)", "oklch(70% 0.1 200)", "var(--jantt-accent)", "teal", "transparent"];
      for (const color of safe) expect(sanitizeCssColor(color, "FALLBACK")).toBe(color);
      expect(sanitizeCssColor("  #abc  ")).toBe("#abc");
    });

    it("rejects anything that could leave a style value or load a resource", () => {
      const unsafe = [
        'red"><img src=x>', "url(https://x)", "rgb(1,2,3);background:url(x)", "var(--x);x", "expression(alert(1))",
        "image-set(url(x) 1x)", "rgb(calc(1) 2 3)", "#12", "#12345", "red;", "red blue", "a", `#${"a".repeat(200)}`,
        "", "   ", "\\72 ed", "rgb(1,2,3)\"", `rgb(${"1,".repeat(60)}1)`
      ];
      for (const color of unsafe) expect(sanitizeCssColor(color, "FALLBACK")).toBe("FALLBACK");
      for (const value of [null, undefined, 42, {}, ["#fff"]]) expect(sanitizeCssColor(value, "FALLBACK")).toBe("FALLBACK");
    });

    it("returns undefined without a fallback so callers can chain candidates", () => {
      expect(sanitizeCssColor("url(x)")).toBeUndefined();
      expect(sanitizeCssColor("url(x)") ?? sanitizeCssColor("#38BDF8") ?? "default").toBe("#38BDF8");
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

    it("ignores non-numeric or non-finite gaps", () => {
      expect(getEffectiveGap({ gapDays: "3" as unknown as number }, 2)).toBe(2);
      expect(getEffectiveGap({ gapDays: Number.NaN, minGapDays: 1 }, 2)).toBe(1);
      expect(getEffectiveGap({ minGapDays: Number.POSITIVE_INFINITY }, 2)).toBe(2);
    });
  });

  describe("clampDayWidth", () => {
    it("clamps values below minimum to 1.2", () => {
      expect(clampDayWidth(0.5)).toBe(1.2);
      expect(clampDayWidth(-10)).toBe(1.2);
    });

    it("clamps values above maximum to DAY_WIDTH_MAX", () => {
      expect(clampDayWidth(150)).toBe(150);
      expect(clampDayWidth(50000)).toBe(DAY_WIDTH_MAX);
    });

    it("rounds to 1 decimal place", () => {
      expect(clampDayWidth(36.4444)).toBe(36.4);
      expect(clampDayWidth(36.4555)).toBe(36.5);
    });

    it("returns a finite fallback for NaN, undefined or infinite input", () => {
      expect(clampDayWidth(Number.NaN)).toBe(52);
      expect(clampDayWidth(undefined as unknown as number)).toBe(52);
      expect(clampDayWidth(Number.POSITIVE_INFINITY)).toBe(52);
      expect(clampDayWidth(Number.NaN, 24)).toBe(24);
      expect(clampDayWidth(Number.NaN, Number.NaN)).toBe(52);
    });
  });

  describe("logarithmic zoom slider and sub-day drag snap helpers", () => {
    it("round-trips dayWidth through the 0..1000 slider range", () => {
      expect(sliderToDayWidth(dayWidthToSlider(DAY_WIDTH_MIN))).toBeCloseTo(DAY_WIDTH_MIN, 1);
      expect(sliderToDayWidth(dayWidthToSlider(DAY_WIDTH_MAX))).toBe(DAY_WIDTH_MAX);
      for (const dw of [5, 26, 180, 480, 2880, 14400]) {
        const roundTrip = sliderToDayWidth(dayWidthToSlider(dw));
        // Integer slider quantization (0..1000) across 1.2..36000 log scale preserves ~1% relative precision
        expect(Math.abs(roundTrip - dw) / dw).toBeLessThan(0.015);
      }
    });

    it("decreases drag step from 1 day down to 1 minute as zoom increases", () => {
      expect(getDragStepMinutes(40)).toBe(1440);
      expect(getDragStepMinutes(200)).toBe(60);
      expect(getDragStepMinutes(600)).toBe(30);
      expect(getDragStepMinutes(1600)).toBe(15);
      expect(getDragStepMinutes(3200)).toBe(5);
      expect(getDragStepMinutes(15000)).toBe(1);
    });

    it("formats zoom readout for day, hour, and minute zoom tiers", () => {
      expect(formatZoomReadout(26)).toBe("26px/d");
      expect(formatZoomReadout(480)).toBe("20px/h");
      expect(formatZoomReadout(2880)).toBe("2px/m");
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

    it("never produces a status/progress pair that contradicts isTaskDone", () => {
      const inProgress = syncTaskProgressAndStatus({ status: "in-progress", progress: 1 });
      expect(inProgress.progress).toBe(0.99);
      expect(isTaskDone(inProgress)).toBe(false);
      const submitted = syncTaskProgressAndStatus({ status: "submitted", progress: 2 });
      expect(submitted.progress).toBe(0.99);
      expect(isTaskDone(submitted)).toBe(false);
      expect(syncTaskProgressAndStatus({ status: "blocked", progress: 1.7 }).progress).toBe(1);
    });

    it("drops non-finite progress instead of writing NaN", () => {
      expect(syncTaskProgressAndStatus({ progress: Number.NaN }, { status: "in-progress", progress: 0.4 })).toEqual({});
      expect(syncTaskProgressAndStatus({ status: "in-progress", progress: Number.NaN }, { progress: 0.4 })).toEqual({
        status: "in-progress",
        progress: 0.4
      });
    });
  });

  describe("isTaskDone", () => {
    it("returns false for null or undefined tasks", () => {
      expect(isTaskDone(null)).toBe(false);
      expect(isTaskDone(undefined)).toBe(false);
    });

    it("returns true when status is completed", () => {
      expect(isTaskDone({ status: "completed" })).toBe(true);
    });

    it("returns true when status is done", () => {
      expect(isTaskDone({ status: "done" })).toBe(true);
    });

    it("returns true when progress is 1.0 or greater", () => {
      expect(isTaskDone({ progress: 1.0 })).toBe(true);
      expect(isTaskDone({ progress: 1 })).toBe(true);
      expect(isTaskDone({ progress: 1.2 })).toBe(true);
    });

    it("returns false for incomplete tasks", () => {
      expect(isTaskDone({ status: "in-progress", progress: 0.5 })).toBe(false);
      expect(isTaskDone({ status: "not-started", progress: 0 })).toBe(false);
      expect(isTaskDone({ status: "submitted", progress: 0.75 })).toBe(false);
      expect(isTaskDone({})).toBe(false);
    });
  });
});
