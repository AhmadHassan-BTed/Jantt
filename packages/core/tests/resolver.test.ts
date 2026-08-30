import { describe, it, expect } from "vitest";
import { resolveSchedule, calculateCriticalPath } from "../src/resolver";
import { Task } from "../src/types";
import constructionJson from "../../../examples/construction-enterprise.json";

describe("Schedule Resolver", () => {
  // ─── Explicit dependency spacing ──────────────────────────────────────

  it("enforces explicit dependency spacing with gapDays", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-02", end: "2026-09-08", dependsOn: "A", gapDays: 2 }
    ];

    const resolved = resolveSchedule(tasks, 2);
    const taskB = resolved.find((t) => t.id === "B")!;
    // A ends 2026-09-05, gap is 2 days -> B must start at 2026-09-07
    expect(taskB.start).toBe("2026-09-07");
    expect(taskB.end).toBe("2026-09-13");
  });

  it("uses task-level gapDays over defaultGapDays", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-02", end: "2026-09-06", dependsOn: "A", gapDays: 5 }
    ];
    const resolved = resolveSchedule(tasks, 1);
    const taskB = resolved.find(t => t.id === "B")!;
    // A ends 09-05, gap=5 -> B starts 09-10, duration 4d -> ends 09-14
    expect(taskB.start).toBe("2026-09-10");
  });

  it("uses zero gapDays when explicitly set to 0", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-03", dependsOn: "A", gapDays: 0 }
    ];
    const resolved = resolveSchedule(tasks, 10);
    const taskB = resolved.find(t => t.id === "B")!;
    // A ends 09-05, gap=0 -> B starts 09-05
    expect(taskB.start).toBe("2026-09-05");
  });

  // ─── Multi-level cascade ──────────────────────────────────────────────

  it("cascades multi-level dependency chains (A -> B -> C)", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "B", category: "dev", start: "2026-09-02", end: "2026-09-05", dependsOn: "A", gapDays: 1 },
      { id: "C", category: "dev", start: "2026-09-03", end: "2026-09-07", dependsOn: "B", gapDays: 1 }
    ];

    const resolved = resolveSchedule(tasks, 1);
    const taskB = resolved.find((t) => t.id === "B")!;
    const taskC = resolved.find((t) => t.id === "C")!;

    // A ends 09-10 -> B starts 09-11, duration 3d -> B ends 09-14
    expect(taskB.start).toBe("2026-09-11");
    expect(taskB.end).toBe("2026-09-14");

    // B ends 09-14 -> C starts 09-15, duration 4d -> C ends 09-19
    expect(taskC.start).toBe("2026-09-15");
    expect(taskC.end).toBe("2026-09-19");
  });

  it("cascades a 4-deep chain correctly", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-03" },
      { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-02", dependsOn: "A", gapDays: 1 },
      { id: "C", category: "dev", start: "2026-09-01", end: "2026-09-02", dependsOn: "B", gapDays: 1 },
      { id: "D", category: "dev", start: "2026-09-01", end: "2026-09-02", dependsOn: "C", gapDays: 1 }
    ];
    const resolved = resolveSchedule(tasks, 1);
    const d = resolved.find(t => t.id === "D")!;
    // A: 09-01 to 09-03
    // B: 09-03+1=09-04, dur=1d -> 09-05
    // C: 09-05+1=09-06, dur=1d -> 09-07
    // D: 09-07+1=09-08, dur=1d -> 09-09
    expect(d.start).toBe("2026-09-08");
    expect(d.end).toBe("2026-09-09");
  });

  // ─── Implicit category pacing ─────────────────────────────────────────

  it("preserves independent sibling tasks sharing a category without unexpected movement", () => {
    const tasks: Task[] = [
      { id: "app-1", category: "ready", start: "2026-09-01", end: "2026-09-03" },
      { id: "app-2", category: "ready", start: "2026-09-01", end: "2026-09-04" },
      { id: "app-3", category: "ready", start: "2026-09-02", end: "2026-09-05" }
    ];

    const resolved = resolveSchedule(tasks, 2);
    const app1 = resolved.find((t) => t.id === "app-1")!;
    const app2 = resolved.find((t) => t.id === "app-2")!;
    const app3 = resolved.find((t) => t.id === "app-3")!;

    expect(app1.start).toBe("2026-09-01");
    expect(app1.end).toBe("2026-09-03");
    expect(app2.start).toBe("2026-09-01");
    expect(app2.end).toBe("2026-09-04");
    expect(app3.start).toBe("2026-09-02");
    expect(app3.end).toBe("2026-09-05");
  });

  it("does not apply implicit pacing to tasks in different categories", () => {
    const tasks: Task[] = [
      { id: "dev-1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "qa-1", category: "qa", start: "2026-09-01", end: "2026-09-05" }
    ];
    const resolved = resolveSchedule(tasks, 2);
    const dev1 = resolved.find(t => t.id === "dev-1")!;
    const qa1 = resolved.find(t => t.id === "qa-1")!;
    // Different categories -> no implicit pacing, both stay at original dates
    expect(dev1.start).toBe("2026-09-01");
    expect(qa1.start).toBe("2026-09-01");
  });

  // ─── Locked tasks ─────────────────────────────────────────────────────

  it("preserves locked tasks without moving them", () => {
    const tasks: Task[] = [
      { id: "prereq", category: "prep", start: "2026-09-01", end: "2026-09-10" },
      { id: "locked-app", category: "prep", start: "2026-09-02", end: "2026-09-06", dependsOn: "prereq", locked: true }
    ];

    const resolved = resolveSchedule(tasks, 2);
    const lockedTask = resolved.find((t) => t.id === "locked-app")!;
    expect(lockedTask.start).toBe("2026-09-02");
    expect(lockedTask.end).toBe("2026-09-06");
  });

  it("locked tasks are excluded from implicit category pacing", () => {
    const tasks: Task[] = [
      { id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05", locked: true },
      { id: "t2", category: "dev", start: "2026-09-01", end: "2026-09-05" }
    ];
    const resolved = resolveSchedule(tasks, 2);
    const t1 = resolved.find(t => t.id === "t1")!;
    const t2 = resolved.find(t => t.id === "t2")!;
    expect(t1.start).toBe("2026-09-01");
    // t2 is unlocked but t1 is locked, so t1 won't be used as implicit predecessor for t2
    expect(t2.start).toBe("2026-09-01");
  });

  // ─── Duration preservation ────────────────────────────────────────────

  it("preserves task duration when shifting due to dependency", () => {
    const tasks: Task[] = [
      { id: "P", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "Q", category: "qa", start: "2026-09-01", end: "2026-09-08", dependsOn: "P", gapDays: 3 }
    ];
    const resolved = resolveSchedule(tasks, 3);
    const q = resolved.find(t => t.id === "Q")!;
    // Original Q duration: 7 days (09-01 to 09-08)
    // P ends 09-10, gap=3 -> Q starts 09-13, duration=7 -> Q ends 09-20
    expect(q.start).toBe("2026-09-13");
    expect(q.end).toBe("2026-09-20");
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it("returns empty array for empty input", () => {
    expect(resolveSchedule([], 2)).toEqual([]);
  });

  it("returns empty array for null-ish input", () => {
    expect(resolveSchedule(null as any, 2)).toEqual([]);
    expect(resolveSchedule(undefined as any, 2)).toEqual([]);
  });

  it("handles single task without dependencies", () => {
    const tasks: Task[] = [
      { id: "solo", category: "dev", start: "2026-09-01", end: "2026-09-05" }
    ];
    const resolved = resolveSchedule(tasks, 2);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].start).toBe("2026-09-01");
    expect(resolved[0].end).toBe("2026-09-05");
  });

  it("does not mutate the original tasks array", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-03", dependsOn: "A", gapDays: 1 }
    ];
    const origBStart = tasks[1].start;
    resolveSchedule(tasks, 1);
    // Original array objects should not be mutated
    expect(tasks[1].start).toBe(origBStart);
  });

  it("handles task depending on non-existent ID gracefully (no crash)", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05", dependsOn: "ghost" }
    ];
    const resolved = resolveSchedule(tasks, 2);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].start).toBe("2026-09-01");
  });

  // ─── Real-world fixture ───────────────────────────────────────────────

  it("resolves the full construction-enterprise fixture without crashing", () => {
    const resolved = resolveSchedule(constructionJson.tasks as Task[], constructionJson.meta.defaultGapDays);
    expect(resolved.length).toBe(constructionJson.tasks.length);
    // Ensure all tasks have valid dates
    for (const t of resolved) {
      expect(t.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("Critical Path Calculator", () => {
  it("identifies tasks on the longest dependency chain", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "B", category: "dev", start: "2026-09-10", end: "2026-09-20", dependsOn: "A" },
      { id: "C", category: "qa", start: "2026-09-01", end: "2026-09-05" }
    ];

    const { criticalTaskIds } = calculateCriticalPath(tasks);
    expect(criticalTaskIds.has("A")).toBe(true);
    expect(criticalTaskIds.has("B")).toBe(true);
  });

  it("marks terminal tasks as critical when they end at project finish", () => {
    const tasks: Task[] = [
      { id: "X", category: "dev", start: "2026-09-01", end: "2026-09-30" }
    ];
    const { criticalTaskIds } = calculateCriticalPath(tasks);
    expect(criticalTaskIds.has("X")).toBe(true);
  });

  it("returns critical dependency link keys", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "B", category: "dev", start: "2026-09-10", end: "2026-09-20", dependsOn: "A" }
    ];
    const { criticalDepKeys } = calculateCriticalPath(tasks);
    expect(criticalDepKeys.has("A->B")).toBe(true);
  });

  it("returns empty sets for empty input", () => {
    const { criticalTaskIds, criticalDepKeys } = calculateCriticalPath([]);
    expect(criticalTaskIds.size).toBe(0);
    expect(criticalDepKeys.size).toBe(0);
  });

  it("returns empty sets for null input", () => {
    const { criticalTaskIds, criticalDepKeys } = calculateCriticalPath(null as any);
    expect(criticalTaskIds.size).toBe(0);
    expect(criticalDepKeys.size).toBe(0);
  });

  it("handles parallel branches and identifies the terminal critical task", () => {
    const tasks: Task[] = [
      { id: "start", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      // Short branch
      { id: "short", category: "dev", start: "2026-09-06", end: "2026-09-08", dependsOn: "start" },
      // Long branch (should be critical)
      { id: "long-1", category: "dev", start: "2026-09-06", end: "2026-09-15", dependsOn: "start" },
      { id: "long-2", category: "dev", start: "2026-09-16", end: "2026-09-25", dependsOn: "long-1" }
    ];
    const { criticalTaskIds } = calculateCriticalPath(tasks);
    // The terminal task on the longest path must be critical
    expect(criticalTaskIds.has("long-2")).toBe(true);
    // The short branch should not be on the critical path
    expect(criticalTaskIds.has("short")).toBe(false);
  });

  it("handles construction-enterprise fixture without crashing", () => {
    const { criticalTaskIds, criticalDepKeys } = calculateCriticalPath(constructionJson.tasks as Task[]);
    expect(criticalTaskIds.size).toBeGreaterThan(0);
    expect(criticalDepKeys.size).toBeGreaterThan(0);
  });
});
