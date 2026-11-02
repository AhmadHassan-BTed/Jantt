import { describe, it, expect, vi } from "vitest";
import { CanvasTimelineRenderer } from "../src/canvas-renderer.js";
import { SpatialGanttGrid } from "../src/spatial-grid.js";
import type { JanttData, Task } from "@jantt/core";

// Mock Canvas 2D context for headless node testing
function createMockContext(): any {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "middle"
  };
}

describe("SpatialGanttGrid", () => {
  const sampleTasks: Task[] = [
    { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-05", progress: 0.5 },
    { id: "t2", label: "Build", category: "dev", start: "2026-11-06", end: "2026-11-12", progress: 0 }
  ];

  it("performs O(1) hit testing on task body and handles", () => {
    // dayWidth = 40, rowHeight = 36, timelineStart = "2026-11-01"
    const grid = new SpatialGanttGrid(sampleTasks, "2026-11-01", 36, 40);

    // Task 1: start offset = 0, duration = 5 days -> bar spans [0, 200]
    // 1. Center of bar (between start and progress handle at x=100)
    const hitBar = grid.hitTest(50, 18);
    expect(hitBar).not.toBeNull();
    expect(hitBar?.task.id).toBe("t1");
    expect(hitBar?.hitType).toBe("bar");

    // 2. Start handle (near x = 0)
    const hitStart = grid.hitTest(2, 18);
    expect(hitStart?.hitType).toBe("handle-start");

    // 3. End handle (near x = 200)
    const hitEnd = grid.hitTest(198, 18);
    expect(hitEnd?.hitType).toBe("handle-end");

    // 4. Progress handle (progress = 0.5 -> x = 100)
    const hitProg = grid.hitTest(100, 18);
    expect(hitProg?.hitType).toBe("progress");

    // 5. Outside task bounds
    const hitEmpty = grid.hitTest(500, 18);
    expect(hitEmpty).toBeNull();
  });
});

describe("CanvasTimelineRenderer", () => {
  const plan: JanttData = {
    meta: { title: "Performance Test Plan", start: "2026-11-01", end: "2026-11-30" },
    tasks: [
      { id: "t1", label: "Task 1", category: "dev", start: "2026-11-01", end: "2026-11-05", progress: 1.0 },
      { id: "t2", label: "Task 2", category: "dev", start: "2026-11-06", end: "2026-11-10", progress: 0.3, dependsOn: "t1" },
      { id: "m1", label: "Milestone", category: "dev", start: "2026-11-10", end: "2026-11-10", milestone: true }
    ]
  };

  it("renders visible viewport elements without error", () => {
    const renderer = new CanvasTimelineRenderer(plan, { rowHeight: 36, dayWidth: 40 });
    const ctx = createMockContext();

    renderer.render(ctx, {
      scrollX: 0,
      scrollY: 0,
      width: 800,
      height: 600
    });

    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("culls non-visible tasks when rendering large datasets", () => {
    // Generate 5,000 tasks
    const largeTasks: Task[] = [];
    for (let i = 0; i < 5000; i++) {
      largeTasks.push({
        id: `task_${i}`,
        label: `Task ${i}`,
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05"
      });
    }

    const largePlan: JanttData = { tasks: largeTasks };
    const renderer = new CanvasTimelineRenderer(largePlan, { rowHeight: 40, dayWidth: 40 });
    const ctx = createMockContext();

    // Viewport height = 400px with rowHeight = 40px -> only ~10 visible rows (+ overscan ~5 = 20 rows max)
    renderer.render(ctx, {
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 400
    });

    // Instead of drawing 5,000 labels, fillText should only be called for visible rows (< 50 times)
    const textCalls = ctx.fillText.mock.calls.length;
    expect(textCalls).toBeLessThan(100);
    expect(textCalls).toBeGreaterThan(0);
  });
});
