import { describe, it, expect } from "vitest";
import {
  layout,
  getScaleFromDayWidth,
  computeDependencyPath,
  computeChartBounds,
  resolveHeaderHeight,
  sanitizeCssColor,
  SCALE_DAY_WIDTHS
} from "../src/layout";
import { TaskScheduleCoordinator } from "../src/rendering/task-schedule-coordinator";
import { ViewportCoordinator } from "../src/rendering/viewport-coordinator";
import { diffDays } from "../src/date-math";
import { JanttData, JanttLayoutResult } from "../src/types";
import constructionJson from "../../../examples/construction-enterprise.json";
import basicJson from "../../../examples/basic.json";

const sampleData: JanttData = {
  meta: {
    title: "Test Schedule",
    start: "2026-09-01",
    end: "2026-09-20",
    defaultGapDays: 2
  },
  categories: {
    dev: { label: "Development", color: "#3B82F6" }
  },
  tasks: [
    { id: "task-1", label: "Task 1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
    { id: "task-2", label: "Task 2", category: "dev", start: "2026-09-07", end: "2026-09-12", dependsOn: "task-1" }
  ]
};

describe("Layout Engine", () => {
  // ─── Pixel coordinate accuracy ────────────────────────────────────────

  it("calculates exact pixel coordinates for task bars", () => {
    const dayWidth = 30;
    const rowHeight = 40;
    const res = layout(sampleData, { dayWidth, rowHeight, startDate: "2026-09-01", endDate: "2026-09-20" });

    expect(res.tasks).toHaveLength(2);

    const t1 = res.tasks[0];
    expect(t1.x).toBe(0); // diffDays(09-01, 09-01) * 30
    expect(t1.width).toBe(5 * 30); // 5 days inclusive (09-01 to 09-05) * 30 = 150
    expect(t1.rowIndex).toBe(0);

    const t2 = res.tasks[1];
    expect(t2.x).toBe(6 * 30); // diffDays(09-01, 09-07) * 30 = 180
    expect(t2.width).toBe(6 * 30); // 6 days inclusive (09-07 to 09-12) * 30 = 180
    expect(t2.rowIndex).toBe(1);
  });

  it("calculates positive width for all tasks (never zero-width for non-milestones)", () => {
    const res = layout(sampleData, { dayWidth: 30, rowHeight: 40, startDate: "2026-09-01", endDate: "2026-09-20" });
    for (const t of res.tasks) {
      if (!t.isMilestone) {
        expect(t.width).toBeGreaterThan(0);
      }
    }
  });

  it("assigns sequential rowIndex values", () => {
    const res = layout(sampleData, { dayWidth: 30, rowHeight: 40 });
    const indices = res.tasks.map(t => t.rowIndex);
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBe(i);
    }
  });

  // ─── Dependency connectors ────────────────────────────────────────────

  it("computes SVG dependency connector paths with 90-degree orthogonal turns", () => {
    const res = layout(sampleData, { dayWidth: 30, rowHeight: 40 });
    expect(res.dependencies).toHaveLength(1);
    const dep = res.dependencies[0];
    expect(dep.fromTaskId).toBe("task-1");
    expect(dep.toTaskId).toBe("task-2");
    expect(dep.path).toContain("M 150"); // Prereq right edge (0 + 150)
    expect(dep.path).toContain("L"); // 90-degree orthogonal path
    // Ensures straight horizontal approach into the arrowhead
    expect(dep.path.endsWith(`L ${dep.toX} ${dep.toY}`)).toBe(true);
  });

  it("supports curved link routing style with straight horizontal entry into arrowhead", () => {
    const res = layout(sampleData, { dayWidth: 30, rowHeight: 40, linkRouting: "curved" });
    expect(res.dependencies).toHaveLength(1);
    const dep = res.dependencies[0];
    expect(dep.path).toContain("C");
    // The final segment before the arrow tip is a straight horizontal line L toX toY
    expect(dep.path.endsWith(`L ${dep.toX} ${dep.toY}`)).toBe(true);
  });

  it("supports direct link routing style with straight horizontal entry into arrowhead", () => {
    const res = layout(sampleData, { dayWidth: 30, rowHeight: 40, linkRouting: "direct" });
    expect(res.dependencies).toHaveLength(1);
    const dep = res.dependencies[0];
    // Straight diagonal has horizontal lead-out and straight horizontal lead-in
    expect(dep.path.endsWith(`L ${dep.toX} ${dep.toY}`)).toBe(true);
  });

  it("generates no dependency lines when no tasks have dependsOn", () => {
    const noDepsData: JanttData = {
      tasks: [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-06", end: "2026-09-10" }
      ]
    };
    const res = layout(noDepsData, { dayWidth: 30, rowHeight: 40 });
    expect(res.dependencies).toHaveLength(0);
  });

  // ─── Grid header generation ───────────────────────────────────────────

  it("generates grid header ticks for months and days", () => {
    const res = layout(sampleData, { dayWidth: 30 });
    expect(res.header.months.length).toBeGreaterThan(0);
    expect(res.header.days).toHaveLength(res.header.totalDays);
    expect(res.header.days[0].dateStr).toBe("2026-09-01");
  });

  it("dynamically shows top year bar only when timeline spans multiple years", () => {
    // 1. Single-year schedule (2026 only)
    const singleYearData: JanttData = {
      meta: { start: "2026-09-01", end: "2026-11-15" },
      tasks: [
        { id: "t1", category: "dev", start: "2026-09-01", end: "2026-11-15" }
      ]
    };
    const singleRes = layout(singleYearData, { dayWidth: 30 });
    expect(singleRes.header.spansMultipleYears).toBe(false);
    expect(singleRes.header.totalHeight).toBe(58);
    expect(singleRes.header.months[0].label).toContain("September");

    // 2. Multi-year schedule spanning across year boundary (2026 to 2027)
    const multiYearData: JanttData = {
      meta: { start: "2026-11-01", end: "2027-02-28" },
      tasks: [
        { id: "t1", category: "dev", start: "2026-11-01", end: "2027-02-28" }
      ]
    };
    const multiRes = layout(multiYearData, { dayWidth: 30 });
    expect(multiRes.header.spansMultipleYears).toBe(true);
    expect(multiRes.header.totalHeight).toBe(78);
    expect(multiRes.header.years.length).toBe(2);
    expect(multiRes.header.years[0].label).toBe("2026");
    expect(multiRes.header.years[1].label).toBe("2027");
    expect(multiRes.header.months.length).toBe(4); // Nov, Dec, Jan, Feb
    expect(multiRes.header.days.length).toBe(multiRes.header.totalDays);
  });

  it("header days have consistent width matching dayWidth", () => {
    const dayWidth = 25;
    const res = layout(sampleData, { dayWidth });
    for (const day of res.header.days) {
      expect(day.width).toBe(dayWidth);
    }
  });

  it("header totalWidth is at least totalDays * dayWidth", () => {
    const dayWidth = 30;
    const res = layout(sampleData, { dayWidth });
    expect(res.header.totalWidth).toBeGreaterThanOrEqual(res.header.totalDays * dayWidth);
  });

  it("marks weekend days correctly in header", () => {
    const res = layout(sampleData, { dayWidth: 30, showWeekends: true });
    const weekendDays = res.header.days.filter(d => d.isWeekend);
    const weekdays = res.header.days.filter(d => !d.isWeekend);
    expect(weekendDays.length).toBeGreaterThan(0);
    expect(weekdays.length).toBeGreaterThan(0);
  });

  // ─── Return shape contract ────────────────────────────────────────────

  it("returns complete JanttLayoutResult shape", () => {
    const res: JanttLayoutResult = layout(sampleData, { dayWidth: 30, rowHeight: 40 });
    expect(res).toHaveProperty("tasks");
    expect(res).toHaveProperty("dependencies");
    expect(res).toHaveProperty("header");
    expect(res).toHaveProperty("viewport");
    expect(res).toHaveProperty("canvasWidth");
    expect(res).toHaveProperty("canvasHeight");
    expect(res).toHaveProperty("criticalTaskIds");
    expect(Array.isArray(res.tasks)).toBe(true);
    expect(Array.isArray(res.dependencies)).toBe(true);
    expect(typeof res.canvasWidth).toBe("number");
    expect(typeof res.canvasHeight).toBe("number");
  });

  it("every TaskLayout has required fields", () => {
    const res = layout(sampleData, { dayWidth: 30, rowHeight: 40 });
    for (const tl of res.tasks) {
      expect(tl).toHaveProperty("task");
      expect(tl).toHaveProperty("x");
      expect(tl).toHaveProperty("y");
      expect(tl).toHaveProperty("width");
      expect(tl).toHaveProperty("height");
      expect(tl).toHaveProperty("rowIndex");
      expect(tl).toHaveProperty("category");
      expect(tl).toHaveProperty("displayLabel");
      expect(tl).toHaveProperty("durationDays");
      expect(typeof tl.x).toBe("number");
      expect(typeof tl.y).toBe("number");
    }
  });

  // ─── Scale configurations ─────────────────────────────────────────────

  it("supports week scale without crashing", () => {
    const res = layout(sampleData, { scale: "week" });
    expect(res.tasks).toHaveLength(2);
    expect(res.header.scale).toBe("week");
  });

  it("supports month scale without crashing", () => {
    const res = layout(sampleData, { scale: "month" });
    expect(res.tasks).toHaveLength(2);
    expect(res.header.scale).toBe("month");
  });

  // ─── Large datasets ──────────────────────────────────────────────────

  it("lays out the full construction-enterprise fixture correctly", () => {
    const res = layout(constructionJson as JanttData, { dayWidth: 30, rowHeight: 46 });
    expect(res.tasks.length).toBe(constructionJson.tasks.length);
    expect(res.canvasWidth).toBeGreaterThan(0);
    expect(res.canvasHeight).toBeGreaterThan(0);
    // Should have dependency lines for the chain
    expect(res.dependencies.length).toBeGreaterThan(0);
  });

  it("lays out the basic fixture correctly", () => {
    const res = layout(basicJson as JanttData, { dayWidth: 30, rowHeight: 46 });
    expect(res.tasks.length).toBe(basicJson.tasks.length);
    expect(res.canvasWidth).toBeGreaterThan(0);
  });

  // ─── Milestone handling ───────────────────────────────────────────────

  it("marks milestone tasks correctly in layout", () => {
    const milestoneData: JanttData = {
      tasks: [
        { id: "m1", label: "Launch", category: "ms", start: "2026-09-15", end: "2026-09-15", milestone: true }
      ]
    };
    const res = layout(milestoneData, { dayWidth: 30, rowHeight: 40 });
    expect(res.tasks[0].isMilestone).toBe(true);
  });

  // ─── Edge case: single task ───────────────────────────────────────────

  it("handles layout with a single task", () => {
    const singleData: JanttData = {
      tasks: [
        { id: "solo", category: "dev", start: "2026-09-01", end: "2026-09-10" }
      ]
    };
    const res = layout(singleData, { dayWidth: 30, rowHeight: 40 });
    expect(res.tasks).toHaveLength(1);
    expect(res.dependencies).toHaveLength(0);
    expect(typeof res.tasks[0].x).toBe("number");
    expect(res.tasks[0].x).toBeGreaterThanOrEqual(0);
    expect(res.tasks[0].rowIndex).toBe(0);
  });

  // ─── Baseline layout ─────────────────────────────────────────────────

  it("generates baseline layout data when showBaselines is true and task has baseline", () => {
    const baselineData: JanttData = {
      meta: { showBaselines: true },
      tasks: [
        {
          id: "t1",
          category: "dev",
          start: "2026-09-05",
          end: "2026-09-15",
          baseline: { start: "2026-09-01", end: "2026-09-10" }
        }
      ]
    };
    const res = layout(baselineData, { dayWidth: 30, rowHeight: 46, showBaselines: true });
    const tl = res.tasks[0];
    expect(tl.baselineLayout).toBeDefined();
    if (tl.baselineLayout) {
      expect(typeof tl.baselineLayout.x).toBe("number");
      expect(typeof tl.baselineLayout.width).toBe("number");
    }
  });

  // ─── Row Height & Modes ──────────────────────────────────────────────

  it("applies default 46px rowHeight when unspecified", () => {
    const res = layout(sampleData);
    expect(res.viewport.rowHeight).toBe(46);
    expect(res.viewport.rowHeightMode).toBe("fit");
    expect(res.canvasHeight).toBe(2 * 46);
  });

  it("supports custom rowHeight with exact pixel metric propagation", () => {
    const res = layout(sampleData, { rowHeight: 64, rowHeightMode: "custom" });
    expect(res.viewport.rowHeight).toBe(64);
    expect(res.viewport.rowHeightMode).toBe("custom");
    expect(res.canvasHeight).toBe(2 * 64);
    expect(res.tasks[0].y).toBe(0 * 64 + (64 - res.tasks[0].height) / 2);
    expect(res.tasks[1].y).toBe(1 * 64 + (64 - res.tasks[1].height) / 2);
  });

  it("supports fit rowHeightMode in viewport configuration", () => {
    const res = layout(sampleData, { rowHeight: 32, rowHeightMode: "fit" });
    expect(res.viewport.rowHeight).toBe(32);
    expect(res.viewport.rowHeightMode).toBe("fit");
    expect(res.canvasHeight).toBe(2 * 32);
  });

  // ─── Continuous dayWidth & Auto-Scale Transition ─────────────────────

  it("derives scale tier from continuous dayWidth via getScaleFromDayWidth", () => {
    expect(getScaleFromDayWidth(45)).toBe("day");
    expect(getScaleFromDayWidth(28)).toBe("day");
    expect(getScaleFromDayWidth(27.9)).toBe("week");
    expect(getScaleFromDayWidth(18)).toBe("week");
    expect(getScaleFromDayWidth(12)).toBe("week");
    expect(getScaleFromDayWidth(11.9)).toBe("month");
    expect(getScaleFromDayWidth(7)).toBe("month");
    expect(getScaleFromDayWidth(5)).toBe("month");
    expect(getScaleFromDayWidth(4.9)).toBe("quarter");
    expect(getScaleFromDayWidth(3)).toBe("quarter");
    expect(getScaleFromDayWidth(2.3)).toBe("quarter");
    // The "year" preset width maps back to "year" so presets round-trip
    expect(getScaleFromDayWidth(SCALE_DAY_WIDTHS.year)).toBe("year");
    expect(getScaleFromDayWidth(2.1)).toBe("year");
    expect(getScaleFromDayWidth(1.2)).toBe("year");
  });

  it("round-trips every scale preset width back to its own scale", () => {
    (Object.keys(SCALE_DAY_WIDTHS) as Array<keyof typeof SCALE_DAY_WIDTHS>).forEach((scale) => {
      expect(getScaleFromDayWidth(SCALE_DAY_WIDTHS[scale])).toBe(scale);
    });
  });

  it("auto-adjusts scale tier in layout() when continuous dayWidth is provided", () => {
    const resDay = layout(sampleData, { dayWidth: 40 });
    expect(resDay.header.scale).toBe("day");
    expect(resDay.viewport.dayWidth).toBe(40);

    const resWeek = layout(sampleData, { dayWidth: 20 });
    expect(resWeek.header.scale).toBe("week");
    expect(resWeek.viewport.dayWidth).toBe(20);

    const resMonth = layout(sampleData, { dayWidth: 8 });
    expect(resMonth.header.scale).toBe("month");
    expect(resMonth.viewport.dayWidth).toBe(8);

    const resQuarter = layout(sampleData, { dayWidth: 3.5 });
    expect(resQuarter.header.scale).toBe("quarter");
    expect(resQuarter.viewport.dayWidth).toBe(3.5);

    const resYear = layout(sampleData, { dayWidth: 1.5 });
    expect(resYear.header.scale).toBe("year");
    expect(resYear.viewport.dayWidth).toBe(1.5);
  });
});

describe("Dependency routing by anchor side (FS / SS / FF / SF)", () => {
  const points = (path: string): Array<[number, number]> => {
    const nums = path.replace(/[MLC,]/g, " ").trim().split(/\s+/).map(Number);
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    return out;
  };

  it("keeps the default finish-to-start routing unchanged", () => {
    expect(computeDependencyPath(150, 20, 180, 60)).toBe("M 150 20 L 165 20 L 165 60 L 180 60");
    expect(computeDependencyPath(150, 20, 180, 60, 46, "orthogonal", "end", "start")).toBe(
      "M 150 20 L 165 20 L 165 60 L 180 60"
    );
  });

  it("start-to-start exits leftwards around both bars and enters the successor start from the left", () => {
    const pts = points(computeDependencyPath(100, 20, 200, 60, 40, "orthogonal", "start", "start"));
    expect(pts[0]).toEqual([100, 20]);
    expect(pts[1][0]).toBeLessThan(100); // leaves away from the predecessor body
    const [beforeLast, last] = pts.slice(-2);
    expect(last).toEqual([200, 60]);
    expect(beforeLast[0]).toBeLessThan(200); // arrives travelling right
  });

  it("finish-to-finish wraps on the right and enters the successor end from the right", () => {
    const pts = points(computeDependencyPath(300, 20, 250, 60, 40, "orthogonal", "end", "end"));
    expect(pts[1][0]).toBeGreaterThan(300);
    const [beforeLast, last] = pts.slice(-2);
    expect(last).toEqual([250, 60]);
    expect(beforeLast[0]).toBeGreaterThan(250); // arrives travelling left, arrow points into the end
  });

  it("start-to-finish mirrors finish-to-start", () => {
    expect(computeDependencyPath(300, 20, 200, 60, 40, "orthogonal", "start", "end")).toBe(
      "M 300 20 L 250 20 L 250 60 L 200 60"
    );
  });

  it("every routing style keeps a straight horizontal lead-in for typed links", () => {
    (["orthogonal", "curved", "direct"] as const).forEach((style) => {
      expect(computeDependencyPath(300, 20, 250, 60, 40, style, "end", "end").endsWith("L 250 60")).toBe(true);
      expect(computeDependencyPath(100, 20, 200, 60, 40, style, "start", "start").endsWith("L 200 60")).toBe(true);
    });
  });

  it("layout routes SS links from the predecessor start edge", () => {
    const data: JanttData = {
      tasks: [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-03", end: "2026-09-08", dependsOn: "a:SS" }
      ]
    };
    const res = layout(data, { dayWidth: 30, rowHeight: 40 });
    const [dep] = res.dependencies;
    const a = res.tasks[0];
    expect(dep.type).toBe("SS");
    expect(dep.fromX).toBe(a.x);
    expect(points(dep.path)[1][0]).toBeLessThan(a.x);
  });
});

describe("Timeline bounds hardening", () => {
  it("computeChartBounds agrees with the rendered layout window", () => {
    const options = { dayWidth: 30, rowHeight: 40 };
    const bounds = computeChartBounds(sampleData, options);
    const res = layout(sampleData, options);
    expect(bounds.startDate).toBe(res.viewport.startDate);
    expect(bounds.endDate).toBe(res.viewport.endDate);
    expect(bounds.totalDays).toBe(res.header.totalDays);
    expect(resolveHeaderHeight(bounds.spansMultipleYears)).toBe(res.header.totalHeight);
  });

  it("reports the multi-year header when the runway (not the tasks) crosses a year boundary", () => {
    const data: JanttData = {
      tasks: [{ id: "dec", category: "dev", start: "2026-12-10", end: "2026-12-24" }]
    };
    const opts = { dayWidth: 30, showToday: false };
    expect(computeChartBounds(data, opts).spansMultipleYears).toBe(true); // 14-day buffer runs into January
    expect(layout(data, opts).header.totalHeight).toBe(78);
  });

  it("caps an absurd explicit start date so a hostile plan cannot render centuries of days", () => {
    const data: JanttData = {
      meta: { start: "1000-01-01" },
      tasks: [{ id: "t", category: "dev", start: "2026-09-01", end: "2026-09-10" }]
    };
    const res = layout(data, { dayWidth: 30, showToday: false });
    expect(res.header.totalDays).toBeLessThanOrEqual(3660);
    expect(res.header.days.length).toBe(res.header.totalDays);
    // The task window stays visible
    expect(diffDays(res.viewport.startDate, "2026-09-01")).toBeGreaterThanOrEqual(0);
    expect(res.tasks[0].x).toBeGreaterThanOrEqual(0);
  });

  it("hard-caps task ranges longer than the maximum span", () => {
    const data: JanttData = {
      tasks: [{ id: "forever", category: "dev", start: "2000-01-01", end: "2090-01-01" }]
    };
    const res = layout(data, { dayWidth: 1.2, showToday: false });
    expect(res.header.totalDays).toBe(3660);
    expect(Number.isFinite(res.canvasWidth)).toBe(true);
  });

  it("ignores invalid dates instead of producing NaN bounds", () => {
    const data: JanttData = {
      meta: { start: "not-a-date" },
      tasks: [
        { id: "bad", category: "dev", start: "garbage", end: "2026-13-45" },
        { id: "ok", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ]
    };
    const res = layout(data, { dayWidth: 30, showToday: false });
    expect(Number.isFinite(res.header.totalDays)).toBe(true);
    expect(Number.isFinite(res.canvasWidth)).toBe(true);
    expect(res.header.days.length).toBe(res.header.totalDays);
  });

  it("honours viewport.headerHeight as a minimum header height", () => {
    expect(resolveHeaderHeight(false)).toBe(58);
    expect(resolveHeaderHeight(true)).toBe(78);
    expect(resolveHeaderHeight(false, 90)).toBe(90);
    expect(layout(sampleData, { dayWidth: 30, headerHeight: 90 }).header.totalHeight).toBe(90);
  });
});

describe("Plan-provided values are sanitized by layout", () => {
  it("allow-lists plain CSS colors and rejects injection payloads", () => {
    const safe = ["#3B82F6", "#abc", "#11223344", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)", "hsl(200 50% 40% / 0.5)", "teal", "var(--jantt-accent)"];
    safe.forEach((c) => expect(sanitizeCssColor(c, "FALLBACK")).toBe(c));
    const unsafe: unknown[] = [
      "red\"><img src=x onerror=alert(1)>",
      "url(https://attacker.example/x)",
      "red; background: url(x)",
      "#12345",
      "expression(alert(1))",
      "rgb(1,2,3) url(x)",
      42,
      null
    ];
    unsafe.forEach((c) => expect(sanitizeCssColor(c, "FALLBACK")).toBe("FALLBACK"));
  });

  it("resolves categories by own keys only and sanitizes their colors", () => {
    const data: JanttData = {
      categories: {
        evil: { label: "Evil", color: "red\"><img src=x onerror=alert(1)>" },
        ok: { label: "Ok", color: "#10B981" }
      },
      tasks: [
        { id: "a", category: "constructor", start: "2026-09-01", end: "2026-09-03" },
        { id: "b", category: "evil", start: "2026-09-01", end: "2026-09-03" },
        { id: "c", category: "ok", start: "2026-09-01", end: "2026-09-03" }
      ]
    };
    const res = layout(data, { dayWidth: 30 });
    expect(res.tasks[0].category.label).toBe("General");
    expect(res.tasks[1].category.label).toBe("Evil");
    expect(res.tasks[1].category.color).toBe("#3B82F6");
    expect(res.tasks[2].category.color).toBe("#10B981");
  });

  it("keeps baseline ghost bars inside their own row at compact row heights", () => {
    const data: JanttData = {
      tasks: [
        { id: "t1", category: "dev", start: "2026-09-05", end: "2026-09-15", baseline: { start: "2026-09-01", end: "2026-09-10" } },
        { id: "m1", category: "dev", start: "2026-09-20", end: "2026-09-20", milestone: true, baseline: { start: "2026-09-18", end: "2026-09-18" } }
      ]
    };
    [26, 32, 46].forEach((rowHeight) => {
      const res = layout(data, { dayWidth: 30, rowHeight, showBaselines: true });
      res.tasks.forEach((tl) => {
        const b = tl.baselineLayout!;
        expect(b).toBeDefined();
        expect(b.y + b.height).toBeLessThanOrEqual((tl.rowIndex + 1) * rowHeight - 1);
        expect(b.y).toBeGreaterThanOrEqual(tl.rowIndex * rowHeight);
      });
      // Link anchors follow the bar center
      const bar = res.tasks[0];
      expect(bar.anchorInY).toBe(bar.y + bar.height / 2);
    });
  });
});

describe("TaskScheduleCoordinator (typed dependencies & immutability)", () => {
  const typedData = (): JanttData => ({
    tasks: [
      { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "x", category: "dev", start: "2026-09-01", end: "2026-09-03" },
      { id: "b", category: "dev", start: "2026-09-03", end: "2026-09-08", dependsOn: [{ id: "a", type: "SS", lagDays: 2 }, "x"] },
      { id: "c", category: "dev", start: "2026-09-04", end: "2026-09-09", dependsOn: "a:FF-1d" },
      { id: "d", category: "dev", start: "2026-09-06", end: "2026-09-10", dependsOn: "x" },
      { id: "e", category: "dev", start: "2026-09-06", end: "2026-09-10" }
    ]
  });

  it("deleting a task keeps every other typed dependency verbatim and never mutates input tasks", () => {
    const data = typedData();
    const before = JSON.stringify(data);
    const next = TaskScheduleCoordinator.deleteTask(data, "x");
    expect(JSON.stringify(data)).toBe(before);

    const byId = new Map(next.tasks.map((t) => [t.id, t]));
    expect(byId.has("x")).toBe(false);
    expect(byId.get("b")!.dependsOn).toEqual({ id: "a", type: "SS", lagDays: 2 });
    expect(byId.get("c")!.dependsOn).toBe("a:FF-1d");
    expect(byId.get("d")!.dependsOn).toBeNull();
    expect(byId.get("e")!.dependsOn).toBeUndefined();
  });

  it("removing one link keeps the remaining typed links", () => {
    const data = typedData();
    const next = TaskScheduleCoordinator.removeDependency(data, "x", "b");
    expect(next.tasks.find((t) => t.id === "b")!.dependsOn).toEqual({ id: "a", type: "SS", lagDays: 2 });
    expect(data.tasks.find((t) => t.id === "b")!.dependsOn).toHaveLength(2);
    // Removing a link that does not exist is a no-op
    expect(TaskScheduleCoordinator.removeDependency(data, "e", "b")).toBe(data);
  });

  it("creates unique task ids and continues the top-level WBS sequence", () => {
    let data: JanttData = {
      tasks: [
        { id: "t1", wbs: "4.0", category: "dev", start: "2026-09-01", end: "2026-09-03" },
        { id: "t2", wbs: "7.2", category: "dev", start: "2026-09-04", end: "2026-09-06" }
      ]
    };
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const { nextData, newTask } = TaskScheduleCoordinator.createTask(data);
      expect(ids.has(newTask.id)).toBe(false);
      ids.add(newTask.id);
      data = nextData;
    }
    expect(data.tasks[2].wbs).toBe("8.0");
  });

  it("continues nested WBS plans after the highest top-level number, and row numbers otherwise", () => {
    const nested: JanttData = {
      tasks: [
        { id: "p1", wbs: "1", category: "dev", start: "2026-09-01", end: "2026-09-03" },
        { id: "c1", wbs: "1.1", category: "dev", start: "2026-09-01", end: "2026-09-02" },
        { id: "c2", wbs: "1.2", category: "dev", start: "2026-09-02", end: "2026-09-03" },
        { id: "p2", wbs: "2", category: "dev", start: "2026-09-04", end: "2026-09-06" },
        { id: "c3", wbs: "2.1", category: "dev", start: "2026-09-04", end: "2026-09-05" }
      ]
    };
    expect(TaskScheduleCoordinator.createTask(nested).newTask.wbs).toBe("3.0");

    const plain: JanttData = {
      tasks: [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-03" },
        { id: "b", category: "dev", start: "2026-09-04", end: "2026-09-06" }
      ]
    };
    expect(TaskScheduleCoordinator.createTask(plain).newTask.wbs).toBe("3.0");
  });
});

describe("Scale resolution and zoom anchoring", () => {
  it("falls back to the day tier for unknown or empty scale names", () => {
    const bogus = { ...sampleData, meta: { ...sampleData.meta, scale: "decade" as never } };
    const res = layout(bogus, {});
    expect(res.header.scale).toBe("day");
    expect(res.viewport.dayWidth).toBe(SCALE_DAY_WIDTHS.day);
    const empty = { ...sampleData, meta: { ...sampleData.meta, scale: "" as never } };
    expect(layout(empty, {}).header.scale).toBe("day");
  });

  const baseState = () => ({
    currentScale: "day" as const,
    currentDayWidth: 40,
    currentRouting: "orthogonal" as const,
    rowHeightMode: "custom" as const,
    customRowHeight: 46,
    showCritical: false,
    showBaselines: true,
    labelWidth: 300,
    filterQuery: "",
    selectedDateFilter: null,
    renderedDayWidth: 20,
    renderedStartDate: "2026-09-01",
    dragAnchorLeftmostDays: null as number | null,
    dragAnchorStartDate: "",
    dragAnchorOffsetPx: 0
  });

  it("keeps the anchored date at the same screen offset while zooming", () => {
    // Pointer 200px into the visible timeline, scrolled 400px at 20px/day => anchored at day 30
    const state = { ...baseState(), dragAnchorLeftmostDays: 30, dragAnchorStartDate: "2026-09-01", dragAnchorOffsetPx: 200 };
    // Zoomed to 40px/day: day 30 sits at 1200px, so scroll to 1000px to keep it 200px from the edge
    expect(ViewportCoordinator.calculateScrollTarget(400, true, "2026-09-01", 40, state)).toBe(1000);
    // A runway that grows 5 days to the left shifts the anchor by 5 days
    expect(ViewportCoordinator.calculateScrollTarget(400, true, "2026-08-27", 40, state)).toBe(1200);
  });

  it("pivots on the leftmost visible date when no anchor is set", () => {
    expect(ViewportCoordinator.calculateScrollTarget(400, true, "2026-09-01", 40, baseState())).toBe(800);
  });
});

describe("Fit row height sizing", () => {
  const fakeRoot = (innerH: number, toolbarH: number, body?: { offsetHeight: number; clientHeight: number }) => {
    const toolbar = { offsetHeight: toolbarH };
    return {
      clientHeight: innerH,
      querySelector: (sel: string) => (sel === ".jantt-toolbar" ? toolbar : sel === ".jantt-body-wrap" ? body ?? null : null)
    } as unknown as HTMLElement;
  };
  const container = { clientHeight: 0 } as unknown as HTMLElement;
  const tasks = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `t${i}`, category: "dev", start: "2026-09-01", end: "2026-09-05" }));
  const opts = { dayWidth: 30, showToday: false };

  it("fills the body exactly with rows plus the add row", () => {
    const data: JanttData = { tasks: tasks(10) };
    // 700 inner - 50 toolbar - 58 header = 592 => (592 - 38 add row) / 10 rows
    expect(ViewportCoordinator.calculateRowHeight(container, fakeRoot(700, 50), data, opts, "fit", 46, false)).toBe(55);
  });

  it("is a fixed point for content-sized hosts (no shrinking feedback loop)", () => {
    const data: JanttData = { tasks: tasks(6) };
    let rowH = 46;
    for (let i = 0; i < 5; i++) {
      const contentH = 58 + 6 * rowH + Math.min(rowH, 38);
      const body = { offsetHeight: contentH, clientHeight: contentH };
      rowH = ViewportCoordinator.calculateRowHeight(container, fakeRoot(50 + contentH, 50, body), data, opts, "fit", 46, false);
    }
    expect(rowH).toBe(46);
  });

  it("falls back to the custom row height when the chart has no definite space yet", () => {
    const data: JanttData = { tasks: tasks(5) };
    expect(ViewportCoordinator.calculateRowHeight(container, fakeRoot(50, 50), data, opts, "fit", 46, false)).toBe(46);
  });

  it("clamps to the minimum (the body then scrolls) when rows cannot fit", () => {
    const data: JanttData = { tasks: tasks(40) };
    expect(ViewportCoordinator.calculateRowHeight(container, fakeRoot(550, 50), data, opts, "fit", 46, false)).toBe(26);
  });

  it("budgets the multi-year header when the runway crosses into the next year", () => {
    const data: JanttData = {
      tasks: Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, category: "dev", start: "2026-12-18", end: "2026-12-31" }))
    };
    const h = ViewportCoordinator.calculateRowHeight(container, fakeRoot(600, 50), data, opts, "fit", 46, true);
    expect(h).toBe(Math.floor((600 - 50 - 78) / 4));
  });
});
