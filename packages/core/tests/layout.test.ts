import { describe, it, expect } from "vitest";
import { layout } from "../src/layout";
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
    expect(t1.width).toBe(4 * 30); // 4 days * 30 = 120
    expect(t1.rowIndex).toBe(0);

    const t2 = res.tasks[1];
    expect(t2.x).toBe(6 * 30); // diffDays(09-01, 09-07) * 30 = 180
    expect(t2.width).toBe(5 * 30); // 5 days * 30 = 150
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
    expect(dep.path).toContain("M 120"); // Prereq right edge (0 + 120)
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
});
