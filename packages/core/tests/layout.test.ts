import { describe, it, expect } from "vitest";
import { layout } from "../src/layout";
import { JanttData } from "../src/types";

describe("Layout Engine", () => {
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

  it("computes SVG dependency connector paths", () => {
    const res = layout(sampleData, { dayWidth: 30, rowHeight: 40 });
    expect(res.dependencies).toHaveLength(1);
    const dep = res.dependencies[0];
    expect(dep.fromTaskId).toBe("task-1");
    expect(dep.toTaskId).toBe("task-2");
    expect(dep.path).toContain("M 120"); // Prereq right edge (0 + 120)
    expect(dep.path).toContain("C"); // Forward bezier curve
  });

  it("generates grid header ticks for months and days", () => {
    const res = layout(sampleData, { dayWidth: 30 });
    expect(res.header.months.length).toBeGreaterThan(0);
    expect(res.header.days).toHaveLength(res.header.totalDays);
    expect(res.header.days[0].dateStr).toBe("2026-09-01");
  });
});
