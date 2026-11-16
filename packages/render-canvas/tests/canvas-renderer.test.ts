import { describe, it, expect, vi } from "vitest";
import { CanvasTimelineRenderer } from "../src/canvas-renderer.js";
import { SpatialGanttGrid } from "../src/spatial-grid.js";
import { calculateCriticalPath } from "@jantt/core";
import type { JanttData, Task } from "@jantt/core";

// Mock Canvas 2D context for headless node testing. Draw calls record the style active at call time.
function createMockContext(backingWidth?: number): any {
  const ctx: any = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "middle",
    canvas: backingWidth ? { width: backingWidth, height: backingWidth / 2 } : undefined,
    filled: [] as string[],
    stroked: [] as string[],
    texts: [] as { text: string; x: number; y: number; maxWidth?: number; fillStyle: string }[]
  };
  Object.assign(ctx, {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
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
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(() => ctx.filled.push(ctx.fillStyle)),
    strokeRect: vi.fn(() => ctx.stroked.push(ctx.strokeStyle)),
    stroke: vi.fn(),
    fill: vi.fn(() => ctx.filled.push(ctx.fillStyle)),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    fillText: vi.fn((text: string, x: number, y: number, maxWidth?: number) =>
      ctx.texts.push({ text, x, y, maxWidth, fillStyle: ctx.fillStyle })
    )
  });
  return ctx;
}

const viewport = { scrollX: 0, scrollY: 0, width: 800, height: 600 };

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

  it("ignores rows with malformed dates", () => {
    const grid = new SpatialGanttGrid([{ id: "x", category: "dev", start: "TBD", end: "2026-11-05" }], "2026-11-01", 36, 40);
    expect(grid.hitTest(10, 18)).toBeNull();
    expect(grid.getTaskBounds(0)).toBeNull();
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

    renderer.render(ctx, viewport);

    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("scales drawing to the device pixel ratio", () => {
    const renderer = new CanvasTimelineRenderer(plan);
    const ctx = createMockContext();

    renderer.render(ctx, { ...viewport, devicePixelRatio: 2 });
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);

    const plain = createMockContext();
    renderer.render(plain, viewport);
    expect(plain.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
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

  it("never hit-tests rows hidden under the sticky header", () => {
    const tasks: Task[] = Array.from({ length: 50 }, (_, i) => ({
      id: `r${i}`,
      category: "dev",
      start: "2026-11-01",
      end: "2026-12-31"
    }));
    const renderer = new CanvasTimelineRenderer({ tasks }, { rowHeight: 34, headerHeight: 44, dayWidth: 40 });
    const scrolled = { ...viewport, scrollX: 400, scrollY: 340 };

    expect(renderer.hitTest(100, 10, scrolled)).toBeNull();
    expect(renderer.hitTest(100, 43, scrolled)).toBeNull();
    expect(renderer.hitTest(-5, 200, scrolled)).toBeNull();
    expect(renderer.hitTest(100, 700, scrolled)).toBeNull();
    // Just below the header: world y = 50 + 340 - 44 = 346 -> row 10
    expect(renderer.hitTest(100, 50, scrolled)?.task.id).toBe("r10");
  });

  it("skips soft-deleted tombstones everywhere", () => {
    const withTombstone: JanttData = {
      tasks: [
        { id: "gone", label: "Deleted", category: "dev", start: "2026-11-01", end: "2026-11-05", _deleted: true },
        { id: "live", label: "Live", category: "dev", start: "2026-11-01", end: "2026-11-05" }
      ]
    };
    const renderer = new CanvasTimelineRenderer(withTombstone, { rowHeight: 36, headerHeight: 48 });
    expect(renderer.getWorldBounds().totalWorldHeight).toBe(36);

    const bounds = renderer.getWorldBounds();
    const barX = 7 * 40; // 7 days of leading padding
    expect(bounds.timelineStart).toBe("2026-10-25");
    expect(renderer.hitTest(barX + 50, 48 + 18, viewport)?.task.id).toBe("live");

    const ctx = createMockContext();
    renderer.render(ctx, viewport);
    expect(ctx.texts.some((t: any) => t.text.includes("Deleted"))).toBe(false);
  });

  it("highlights the computed critical path instead of urgent priority", () => {
    const cpmPlan: JanttData = {
      tasks: [
        { id: "a", label: "A", category: "dev", start: "2026-11-02", end: "2026-11-06" },
        { id: "b", label: "B", category: "dev", start: "2026-11-09", end: "2026-11-13", dependsOn: "a" },
        { id: "side", label: "Side", category: "dev", start: "2026-11-02", end: "2026-11-03", priority: "urgent" }
      ]
    };
    const critical = "#FF0000";
    const expected = calculateCriticalPath(cpmPlan.tasks).criticalTaskIds;
    expect(expected.size).toBeGreaterThan(0);
    expect(expected.has("side")).toBe(false);

    const renderer = new CanvasTimelineRenderer(cpmPlan, { colors: { critical } });
    const ctx = createMockContext();
    renderer.render(ctx, viewport);

    // One highlight per CPM-critical bar; the urgent but non-critical task gets none.
    expect(ctx.stroked.filter((s: string) => s === critical)).toHaveLength(expected.size);

    renderer.updateOptions({ showCriticalPath: false });
    const off = createMockContext();
    renderer.render(off, viewport);
    expect(off.stroked.filter((s: string) => s === critical)).toHaveLength(0);
  });

  it("computes the critical path with the plan's target date and gap, like the other views", () => {
    const tasks: Task[] = [
      { id: "a", label: "A", category: "dev", start: "2026-11-02", end: "2026-11-06" },
      { id: "b", label: "B", category: "dev", start: "2026-11-09", end: "2026-11-13", dependsOn: "a" },
      { id: "side", label: "Side", category: "dev", start: "2026-11-02", end: "2026-11-10" }
    ];
    const meta = { targetDate: "2026-11-05", defaultGapDays: 2 };
    const expected = calculateCriticalPath(tasks, meta).criticalTaskIds;
    expect(expected.size).toBeGreaterThan(calculateCriticalPath(tasks).criticalTaskIds.size);

    const critical = "#FF0000";
    const renderer = new CanvasTimelineRenderer({ meta, tasks }, { colors: { critical } });
    const ctx = createMockContext();
    renderer.render(ctx, viewport);
    expect(ctx.stroked.filter((s: string) => s === critical)).toHaveLength(expected.size);
  });

  it("reuses critical flags the caller already computed instead of running the CPM again", () => {
    const tasks: Task[] = [
      { id: "a", label: "A", category: "dev", start: "2026-11-02", end: "2026-11-06" },
      { id: "b", label: "B", category: "dev", start: "2026-11-09", end: "2026-11-13", dependsOn: "a", critical: true },
      { id: "side", label: "Side", category: "dev", start: "2026-11-02", end: "2026-11-10", critical: true }
    ];
    const critical = "#FF0000";
    const renderer = new CanvasTimelineRenderer({ tasks }, { colors: { critical } });
    const ctx = createMockContext();
    renderer.render(ctx, viewport);
    // Exactly the two flagged bars; "a" is not flagged, so the a -> b link stays a normal link.
    expect(ctx.stroked.filter((s: string) => s === critical)).toHaveLength(2);
    expect(ctx.filled).not.toContain(critical); // no critical arrow head
  });

  it("draws links by type, including links whose successor is off-screen", () => {
    const tasks: Task[] = Array.from({ length: 300 }, (_, i) => ({
      id: `n${i}`,
      category: "dev",
      start: "2026-11-02",
      end: "2026-11-06"
    }));
    tasks[200] = { ...tasks[200], dependsOn: "n0" }; // FS from a visible row to a row far below
    tasks[1] = { ...tasks[1], dependsOn: [{ id: "n0", type: "SS", lagDays: 1 }] };
    tasks[2] = { ...tasks[2], dependsOn: "n0, n1" }; // comma list is two links

    const renderer = new CanvasTimelineRenderer({ tasks }, { rowHeight: 40, dayWidth: 40, headerHeight: 48 });
    const ctx = createMockContext();
    renderer.render(ctx, { scrollX: 0, scrollY: 0, width: 1000, height: 400 });

    const starts = ctx.moveTo.mock.calls.map(([x, y]: number[]) => `${x},${y}`);
    const barStart = 7 * 40;
    const barEnd = barStart + 5 * 40;
    // FS n0 -> n200 leaves n0's end edge even though n200 is far outside the viewport
    expect(starts.filter((s: string) => s === `${barEnd},20`).length).toBeGreaterThanOrEqual(2);
    // SS n0 -> n1 leaves n0's start edge
    expect(starts).toContain(`${barStart},20`);
    // n1 -> n2 from the comma-separated list
    expect(starts).toContain(`${barEnd},60`);
    // Arrow head of the FS link enters n200's start edge
    expect(starts).toContain(`${barStart},${200 * 40 + 20}`);
  });

  it("draws a diamond only for flagged milestones; a single-day task is a bar", () => {
    const dayOnly = new CanvasTimelineRenderer({ tasks: [{ id: "d", label: "D", category: "dev", start: "2026-11-02", end: "2026-11-02" }] });
    const bar = createMockContext();
    dayOnly.render(bar, viewport);
    expect(bar.rotate).not.toHaveBeenCalled();
    expect(bar.arcTo).toHaveBeenCalled();

    const flagged = new CanvasTimelineRenderer({ tasks: [{ id: "g", label: "G", category: "dev", start: "2026-11-02", end: "2026-11-02", milestone: true }] });
    const diamond = createMockContext();
    flagged.render(diamond, viewport);
    expect(diamond.rotate).toHaveBeenCalledWith(Math.PI / 4);
  });

  it("links to ids that look like lag shorthand", () => {
    const tasks: Task[] = [
      { id: "render-3d", category: "dev", start: "2026-11-02", end: "2026-11-06" },
      { id: "qa", category: "dev", start: "2026-11-09", end: "2026-11-10", dependsOn: "render-3d" }
    ];
    const renderer = new CanvasTimelineRenderer({ tasks }, { rowHeight: 40, dayWidth: 40, headerHeight: 48, showCriticalPath: false });
    const ctx = createMockContext();
    renderer.render(ctx, viewport);
    const starts = ctx.moveTo.mock.calls.map(([x, y]: number[]) => `${x},${y}`);
    // FS link leaves the end edge of "render-3d" (7 days padding + 5 days) on row 0
    expect(starts).toContain(`${(7 + 5) * 40},20`);
  });

  it("truncates long labels with an ellipsis instead of squashing them", () => {
    const labelPlan: JanttData = {
      tasks: [{ id: "x", label: "An extremely long activity label that cannot fit", category: "dev", start: "2026-11-02", end: "2026-11-03" }]
    };
    const renderer = new CanvasTimelineRenderer(labelPlan, { dayWidth: 40 });
    const ctx = createMockContext();
    renderer.render(ctx, viewport);

    const label = ctx.texts.find((t: any) => t.text.startsWith("An "));
    expect(label.text.endsWith("…")).toBe(true);
    expect(label.maxWidth).toBeUndefined();
    expect(label.text.length * 7).toBeLessThanOrEqual(80 - 16);
  });

  it("uses task color, the name alias and a contrasting label color", () => {
    const colored: JanttData = {
      tasks: [{ id: "c1", name: "Named Task", color: "#FDE047", category: "dev", start: "2026-11-02", end: "2026-11-06" }]
    };
    const renderer = new CanvasTimelineRenderer(colored);
    const ctx = createMockContext();
    renderer.render(ctx, viewport);

    expect(ctx.filled).toContain("#FDE047");
    const label = ctx.texts.find((t: any) => t.text === "Named Task");
    expect(label?.fillStyle).toBe("#0F172A");
  });

  it("ignores malformed dates when computing timeline bounds", () => {
    const broken: JanttData = {
      tasks: [
        { id: "ok", category: "dev", start: "2026-11-01", end: "2026-11-30" },
        { id: "bad", category: "dev", start: "2026-11-01", end: "TBD" }
      ]
    };
    const bounds = new CanvasTimelineRenderer(broken).getWorldBounds();
    expect(bounds.timelineStart).toBe("2026-10-25");
    expect(bounds.timelineEnd).toBe("2026-12-14");
  });

  it("applies the swiss-light preset and lets colors override it", () => {
    const renderer = new CanvasTimelineRenderer(plan, { theme: "swiss-light" });
    const ctx = createMockContext();
    renderer.render(ctx, viewport);
    expect(ctx.filled[0]).toBe("#FFFFFF");

    renderer.updateOptions({ colors: { background: "#123456" } });
    const next = createMockContext();
    renderer.render(next, viewport);
    expect(next.filled[0]).toBe("#123456");
  });

  it("draws month labels in the header", () => {
    const renderer = new CanvasTimelineRenderer(plan, { dayWidth: 40 });
    const ctx = createMockContext();
    renderer.render(ctx, viewport);
    expect(ctx.texts.some((t: any) => t.text === "Nov 2026" || t.text === "Oct 2026")).toBe(true);
  });

  it("does not re-index when given the same immutable plan", () => {
    const renderer = new CanvasTimelineRenderer(plan);
    const before = renderer.getWorldBounds();
    renderer.setPlan(plan);
    expect(renderer.getWorldBounds()).toEqual(before);

    renderer.setPlan({ ...plan, tasks: [...plan.tasks, { id: "late", category: "dev", start: "2027-02-01", end: "2027-02-05" }] });
    expect(renderer.getWorldBounds().timelineEnd).toBe("2027-02-19");
  });

  it("calculates accurate world bounds and renders radar minimap", () => {
    const renderer = new CanvasTimelineRenderer(plan, { rowHeight: 36, dayWidth: 40 });
    const bounds = renderer.getWorldBounds();

    expect(bounds.totalDays).toBeGreaterThan(0);
    expect(bounds.totalWorldWidth).toBeGreaterThan(0);
    expect(bounds.totalWorldHeight).toBe(3 * 36);

    const ctx = createMockContext();
    const mmResult = renderer.renderMinimap(ctx, 220, 110, {
      scrollX: 0,
      scrollY: 0,
      width: 800,
      height: 600
    });

    expect(mmResult).toBeDefined();
    expect(mmResult?.scaleX).toBeGreaterThan(0);
    expect(mmResult?.scaleY).toBeGreaterThan(0);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it("scales the minimap to its own backing store and clears it for empty plans", () => {
    const renderer = new CanvasTimelineRenderer(plan);
    const hiDpi = createMockContext(440);
    renderer.renderMinimap(hiDpi, 220, 110, viewport);
    expect(hiDpi.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);

    const empty = new CanvasTimelineRenderer({ tasks: [] });
    const ctx = createMockContext();
    const result = empty.renderMinimap(ctx, 220, 110, viewport);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 220, 110);
    expect(result.scaleX).toBe(1);
  });
});
