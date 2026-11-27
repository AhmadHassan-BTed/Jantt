import { describe, it, expect } from "vitest";
import { resolveSchedule, calculateCriticalPath, hasDependencyCycle } from "../src/resolver";
import { MAX_CRITICAL_PATHS } from "../src/cpm";
import { calculatePertRisk } from "../src/pert";
import { getTaskDependencyRelations, resolveRelationLag, relationEarliestStartDay } from "../src/dependencies";
import { toEpochDay, addDays } from "../src/date-math";
import { getEffectiveGap } from "../src/utils";
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

  // ─── No implicit category pacing (only explicit dependencies move tasks) ─

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

  it("does not move independent tasks in different categories", () => {
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

  it("does not move unlocked siblings of a locked task without a dependency", () => {
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

  it("calculates Total Float and Free Float accurately on parallel paths", () => {
    const tasks: Task[] = [
      { id: "start", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "driving", category: "dev", start: "2026-09-05", end: "2026-09-15", dependsOn: "start" },
      { id: "float-branch", category: "dev", start: "2026-09-05", end: "2026-09-08", dependsOn: "start" },
      { id: "finish", category: "dev", start: "2026-09-15", end: "2026-09-20", dependsOn: ["driving", "float-branch"] }
    ];

    const res = calculateCriticalPath(tasks);
    expect(res.criticalTaskIds.has("start")).toBe(true);
    expect(res.criticalTaskIds.has("driving")).toBe(true);
    expect(res.criticalTaskIds.has("finish")).toBe(true);
    expect(res.criticalTaskIds.has("float-branch")).toBe(false);

    const floatBranchMetrics = res.metrics.get("float-branch")!;
    expect(floatBranchMetrics.totalFloat).toBe(7); // 10 days duration vs 3 days duration
    expect(floatBranchMetrics.freeFloat).toBe(7);
    expect(floatBranchMetrics.isCritical).toBe(false);
  });

  it("supports contractual target deadlines producing negative float when breached", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "B", category: "dev", start: "2026-09-10", end: "2026-09-20", dependsOn: "A" }
    ];

    // Project finishes early on 09-20 (zero gap). Contract deadline is 09-16 (-4 days late!)
    const res = calculateCriticalPath(tasks, { targetDate: "2026-09-16", defaultGapDays: 0 });
    expect(res.projectTotalFloat).toBe(-4);
    expect(res.metrics.get("B")!.totalFloat).toBe(-4);
    expect(res.metrics.get("B")!.slackLabel).toBe("Overdue by 4d");
    expect(res.criticalTaskIds.has("B")).toBe(true);
  });

  it("identifies near-critical tasks within customizable threshold", () => {
    const tasks: Task[] = [
      { id: "start", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "crit-chain", category: "dev", start: "2026-09-05", end: "2026-09-20", dependsOn: "start" },
      // Near-critical branch has 2 days of float
      { id: "near-chain", category: "dev", start: "2026-09-05", end: "2026-09-18", dependsOn: "start" },
      { id: "end", category: "dev", start: "2026-09-20", end: "2026-09-22", dependsOn: ["crit-chain", "near-chain"] }
    ];

    const res = calculateCriticalPath(tasks, { nearCriticalThresholdDays: 3 });
    expect(res.criticalTaskIds.has("crit-chain")).toBe(true);
    expect(res.nearCriticalTaskIds.has("near-chain")).toBe(true);
    expect(res.metrics.get("near-chain")!.isNearCritical).toBe(true);
  });

  describe("hasDependencyCycle (Kahn's algorithm)", () => {
    it("returns false for empty task list or independent tasks", () => {
      expect(hasDependencyCycle([])).toBe(false);
      expect(
        hasDependencyCycle([
          { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05" },
          { id: "B", category: "c", start: "2026-01-01", end: "2026-01-05" }
        ])
      ).toBe(false);
    });

    it("returns false for valid linear and branching DAGs", () => {
      const tasks: Task[] = [
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05" },
        { id: "B", category: "c", start: "2026-01-06", end: "2026-01-10", dependsOn: "A" },
        { id: "C", category: "c", start: "2026-01-06", end: "2026-01-10", dependsOn: "A" },
        { id: "D", category: "c", start: "2026-01-11", end: "2026-01-15", dependsOn: ["B", "C"] }
      ];
      expect(hasDependencyCycle(tasks)).toBe(false);
    });

    it("detects direct self-dependency as a cycle", () => {
      const tasks: Task[] = [
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "A" }
      ];
      expect(hasDependencyCycle(tasks)).toBe(true);
    });

    it("detects 2-task circular dependency (A -> B -> A)", () => {
      const tasks: Task[] = [
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "B" },
        { id: "B", category: "c", start: "2026-01-06", end: "2026-01-10", dependsOn: "A" }
      ];
      expect(hasDependencyCycle(tasks)).toBe(true);
    });

    it("detects multi-task indirect circular loop (A -> B -> C -> A)", () => {
      const tasks: Task[] = [
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "C" },
        { id: "B", category: "c", start: "2026-01-06", end: "2026-01-10", dependsOn: "A" },
        { id: "C", category: "c", start: "2026-01-11", end: "2026-01-15", dependsOn: "B" }
      ];
      expect(hasDependencyCycle(tasks)).toBe(true);
    });
  });
});

// ─── Helpers for constraint-level assertions ─────────────────────────────

/** Asserts that every dependency link of every unlocked task is satisfied. */
function expectAllConstraintsHold(tasks: Task[], gapDays: number) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    if (t.locked) continue;
    const s = toEpochDay(t.start);
    const dur = t.milestone ? 0 : toEpochDay(t.end) - s;
    for (const rel of getTaskDependencyRelations(t, byId)) {
      const p = byId.get(rel.id);
      if (!p || p.id === t.id) continue;
      const ps = toEpochDay(p.start);
      const pf = p.milestone ? ps : toEpochDay(p.end);
      const min = relationEarliestStartDay(rel.type, ps, pf, dur, resolveRelationLag(rel, getEffectiveGap(t, gapDays)));
      expect(s, `${t.id} must satisfy ${rel.type} link to ${p.id}`).toBeGreaterThanOrEqual(min);
    }
  }
}

/** Small deterministic PRNG (mulberry32) for reproducible property tests. */
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Cascade robustness", () => {
  it("is idempotent on cyclic plans: links inside a cycle no longer push dates every run", () => {
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "B" },
      { id: "B", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "A" },
      { id: "C", category: "c", start: "2026-01-01", end: "2026-01-03", dependsOn: "B" }
    ];
    const diagnostics: string[] = [];
    const once = resolveSchedule(tasks, { defaultGapDays: 2, diagnostics });
    const twice = resolveSchedule(once, 2);
    expect(twice).toEqual(once);
    expect(once.find((t) => t.id === "A")!.start).toBe("2026-01-01");
    expect(once.find((t) => t.id === "B")!.start).toBe("2026-01-01");
    // Links out of the cycle are still honored
    expect(once.find((t) => t.id === "C")!.start).toBe("2026-01-07");
    expect(diagnostics.some((d) => d.includes("Circular dependency") && d.includes('"A"'))).toBe(true);
  });

  it("fully resolves long chains listed in reverse order in one pass", () => {
    const tasks: Task[] = Array.from({ length: 100 }, (_, i) => ({
      id: `t${i}`,
      category: "c",
      start: "2026-01-01",
      end: "2026-01-03",
      dependsOn: i > 0 ? `t${i - 1}` : null
    })).reverse();
    const resolved = resolveSchedule(tasks, 0);
    expectAllConstraintsHold(resolved, 0);
    expect(resolved.find((t) => t.id === "t99")!.start).toBe(addDays("2026-01-01", 99 * 2));
  });

  it("keeps every task when ids are duplicated (later copies are returned unchanged)", () => {
    const tasks: Task[] = [
      { id: "A", label: "first", category: "c", start: "2026-01-01", end: "2026-01-05" },
      { id: "A", label: "second", category: "c", start: "2026-02-01", end: "2026-02-05" },
      { id: "B", category: "c", start: "2026-01-01", end: "2026-01-02", dependsOn: "A" }
    ];
    const diagnostics: string[] = [];
    const resolved = resolveSchedule(tasks, { defaultGapDays: 0, diagnostics });
    expect(resolved.map((t) => t.label)).toEqual(["first", "second", undefined]);
    expect(resolved[1].start).toBe("2026-02-01");
    expect(resolved[2].start).toBe("2026-01-05");
    expect(diagnostics.some((d) => d.includes("Duplicate"))).toBe(true);
    expect(hasDependencyCycle(tasks)).toBe(false);
  });

  it("ignores dependencies named after Object.prototype keys", () => {
    for (const ghost of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const resolved = resolveSchedule([{ id: "A", category: "c", start: "2025-05-01", end: "2025-05-03", dependsOn: ghost }], 2);
      expect(resolved[0].start).toBe("2025-05-01");
      expect(resolved[0].end).toBe("2025-05-03");
    }
  });

  it("returns unchanged copies in Strict mode (autoCascade: false)", () => {
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-03-01", end: "2026-03-10" },
      { id: "B", category: "c", start: "2026-03-02", end: "2026-03-04", dependsOn: "A" }
    ];
    const resolved = resolveSchedule(tasks, { defaultGapDays: 2, autoCascade: false });
    expect(resolved).toEqual(tasks);
    expect(resolved[1]).not.toBe(tasks[1]);
  });

  it("uses working calendars passed through the options object", () => {
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-11-04", end: "2026-11-06" }, // Wed-Fri
      { id: "B", category: "c", start: "2026-11-05", end: "2026-11-06", dependsOn: "A" }
    ];
    const resolved = resolveSchedule(tasks, { defaultGapDays: 1, calendar: "standard" });
    expect(resolved[1].start).toBe("2026-11-09"); // Monday, skipping the weekend
    const plain = resolveSchedule(tasks, { defaultGapDays: 1, calendar: "standard", useWorkingDays: false });
    expect(plain[1].start).toBe("2026-11-07");
  });

  it("resolves a project calendar given by the id of a named calendar", () => {
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-11-04", end: "2026-11-06" }, // Wed-Fri
      { id: "B", category: "c", start: "2026-11-05", end: "2026-11-06", dependsOn: "A" }
    ];
    const resolved = resolveSchedule(tasks, {
      defaultGapDays: 1,
      calendar: "site" as never,
      calendars: { site: { workingDays: [1, 2, 3, 4, 5, 6] } }
    });
    expect(resolved[1].start).toBe("2026-11-07"); // Saturday is a working day on "site"
  });

  it("ignores non-numeric task gaps instead of concatenating them into dates", () => {
    const tasks = [
      { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05" },
      { id: "B", category: "c", start: "2026-01-01", end: "2026-01-03", dependsOn: "A", gapDays: "3" },
      { id: "C", category: "c", start: "2026-01-01", end: "2026-01-03", dependsOn: "A", gapDays: Number.NaN }
    ] as unknown as Task[];
    const resolved = resolveSchedule(tasks, 2);
    expect(resolved[1].start).toBe("2026-01-07");
    expect(resolved[2].start).toBe("2026-01-07");
    const cpm = calculateCriticalPath(tasks, { defaultGapDays: 2 });
    expect(cpm.metrics.get("B")!.earlyStart).toBe("2026-01-07");
    expect(cpm.projectEarlyFinish).toBe("2026-01-09");
  });

  it("reports locked tasks that violate their dependencies without moving them", () => {
    const diagnostics: string[] = [];
    const resolved = resolveSchedule(
      [
        { id: "A", category: "c", start: "2026-03-01", end: "2026-03-10" },
        { id: "L", category: "c", start: "2026-03-02", end: "2026-03-04", dependsOn: "A", locked: true }
      ],
      { defaultGapDays: 2, diagnostics }
    );
    expect(resolved[1].start).toBe("2026-03-02");
    expect(diagnostics.some((d) => d.includes("DEP_TIMING_CONFLICT") && d.includes('"L"'))).toBe(true);
  });

  it("does not schedule against garbage dates", () => {
    const diagnostics: string[] = [];
    const resolved = resolveSchedule(
      [
        { id: "A", category: "c", start: "garbage", end: "2026-03-10" },
        { id: "B", category: "c", start: "2025-05-01", end: "2025-05-03", dependsOn: "A" },
        { id: "C", category: "c", start: "nope", end: "nope", dependsOn: "B" }
      ],
      { defaultGapDays: 2, diagnostics }
    );
    expect(resolved[1].start).toBe("2025-05-01");
    expect(resolved[2].start).toBe("nope");
    // Both the task that could not be moved and the predecessor that could not constrain are named
    const report = diagnostics.find((d) => d.includes("invalid start/end"));
    expect(report).toContain('"A"');
    expect(report).toContain('"C"');
  });

  it("treats milestones as zero-duration predecessors and keeps them single-day when moved", () => {
    const resolved = resolveSchedule(
      [
        { id: "A", category: "c", start: "2026-03-01", end: "2026-03-05" },
        { id: "M", category: "c", start: "2026-03-01", end: "2026-03-03", milestone: true, dependsOn: "A" },
        { id: "B", category: "c", start: "2026-03-01", end: "2026-03-02", dependsOn: "M" }
      ],
      0
    );
    expect(resolved[1]).toMatchObject({ start: "2026-03-05", end: "2026-03-05" });
    expect(resolved[2].start).toBe("2026-03-05");
  });

  it("keeps tombstones when every task is deleted", () => {
    const tasks: Task[] = [{ id: "gone", category: "c", start: "2026-01-01", end: "2026-01-02", _deleted: true }];
    expect(resolveSchedule(tasks, 2)).toEqual(tasks);
  });

  it("property: random DAGs resolve to a constraint-satisfying, idempotent schedule", () => {
    const types = ["", ":SS", ":FF", ":SF", ":FS+1d", ":SS-1d", ":FF+2"];
    for (let seed = 1; seed <= 25; seed++) {
      const rand = prng(seed);
      const n = 5 + Math.floor(rand() * 25);
      const tasks: Task[] = [];
      for (let i = 0; i < n; i++) {
        const deps: string[] = [];
        for (let j = 0; j < i; j++) {
          if (rand() < 0.15) deps.push(`t${j}${types[Math.floor(rand() * types.length)]}`);
        }
        const start = addDays("2026-01-01", Math.floor(rand() * 30));
        tasks.push({
          id: `t${i}`,
          category: "c",
          start,
          end: addDays(start, Math.floor(rand() * 6)),
          dependsOn: deps.length ? deps : undefined,
          locked: rand() < 0.05
        });
      }
      // Shuffle to make sure input order does not matter
      const shuffled = [...tasks].sort(() => rand() - 0.5);
      const once = resolveSchedule(shuffled, 2);
      expectAllConstraintsHold(once, 2);
      expect(resolveSchedule(once, 2)).toEqual(once);
      // Tasks are never moved earlier and durations are preserved
      for (const t of once) {
        const orig = shuffled.find((o) => o.id === t.id)!;
        expect(toEpochDay(t.start)).toBeGreaterThanOrEqual(toEpochDay(orig.start));
        expect(toEpochDay(t.end) - toEpochDay(t.start)).toBe(toEpochDay(orig.end) - toEpochDay(orig.start));
      }
    }
  });
});

describe("Critical Path consistency with the cascade", () => {
  it("marks the whole driving chain and its links critical on cascaded data with the default gap", () => {
    const resolved = resolveSchedule(
      [
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05" },
        { id: "B", category: "c", start: "2026-01-01", end: "2026-01-04", dependsOn: "A" },
        { id: "C", category: "c", start: "2026-01-01", end: "2026-01-02", dependsOn: "B" }
      ]
    );
    const cpm = calculateCriticalPath(resolved);
    expect([...cpm.criticalTaskIds].sort()).toEqual(["A", "B", "C"]);
    expect([...cpm.criticalDepKeys].sort()).toEqual(["A->B", "B->C"]);
    expect(cpm.metrics.get("A")!.totalFloat).toBe(0);
    expect(cpm.criticalPaths).toEqual([["A", "B", "C"]]);
  });

  it("honors SS, FF and SF links with lags in both passes", () => {
    const ss = calculateCriticalPath([
      { id: "A", category: "c", start: "2026-03-02", end: "2026-03-10" },
      { id: "B", category: "c", start: "2026-03-02", end: "2026-03-20", dependsOn: "A:SS" }
    ]);
    expect(ss.metrics.get("B")!.earlyStart).toBe("2026-03-02");
    expect(ss.criticalDepKeys.has("A->B")).toBe(true);
    // A can slip until its start would delay B's start
    expect(ss.metrics.get("A")!.lateStart).toBe("2026-03-02");

    const ff = calculateCriticalPath([
      { id: "A", category: "c", start: "2026-03-01", end: "2026-03-10" },
      { id: "B", category: "c", start: "2026-03-01", end: "2026-03-04", dependsOn: "A:FF+2d" }
    ]);
    expect(ff.metrics.get("B")!.earlyFinish).toBe("2026-03-12");
    expect(ff.metrics.get("A")!.lateFinish).toBe("2026-03-10");
    expect(ff.criticalTaskIds.has("A")).toBe(true);

    const sf = calculateCriticalPath([
      { id: "A", category: "c", start: "2026-03-10", end: "2026-03-20" },
      { id: "B", category: "c", start: "2026-03-01", end: "2026-03-05", dependsOn: "A:SF+2d" }
    ], { defaultGapDays: 0 });
    expect(sf.metrics.get("B")!.earlyStart).toBe("2026-03-08");
    expect(sf.metrics.get("B")!.drivingPredecessors).toEqual(["A"]);
  });

  it("does not enumerate an exponential number of critical paths", () => {
    const tasks: Task[] = [];
    let prev: string[] = [];
    for (let stage = 0; stage < 30; stage++) {
      const ids = [`s${stage}a`, `s${stage}b`];
      for (const id of ids) {
        tasks.push({ id, category: "c", start: "2026-01-01", end: "2026-01-03", dependsOn: prev.length ? prev : undefined });
      }
      prev = ids;
    }
    const startedAt = Date.now();
    const cpm = calculateCriticalPath(resolveSchedule(tasks, 0), { defaultGapDays: 0 });
    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(cpm.criticalTaskIds.size).toBe(60);
    expect(cpm.criticalPaths.length).toBe(MAX_CRITICAL_PATHS);
    expect(cpm.warnings?.some((w) => w.includes("truncated"))).toBe(true);
  });

  it("handles cyclic input without crashing and with finite metrics", () => {
    const cpm = calculateCriticalPath([
      { id: "C", category: "c", start: "2026-01-01", end: "2026-01-01" },
      { id: "A", category: "c", start: "2026-01-01", end: "2026-01-01", dependsOn: ["B", "C"] },
      { id: "B", category: "c", start: "2026-01-01", end: "2026-01-01", dependsOn: "A" }
    ]);
    for (const id of ["A", "B", "C"]) {
      const m = cpm.metrics.get(id)!;
      expect(Number.isFinite(m.totalFloat)).toBe(true);
      expect(m.lateStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(cpm.warnings?.some((w) => w.includes("cycles"))).toBe(true);
  });

  it("ignores an invalid or non-string targetDate instead of throwing", () => {
    const tasks: Task[] = [{ id: "A", category: "c", start: "2026-01-01", end: "2026-01-10" }];
    for (const targetDate of ["Q4", "2026-02-30", 20261231 as unknown as string]) {
      const cpm = calculateCriticalPath(tasks, { targetDate });
      expect(cpm.projectLateFinish).toBe("2026-01-10");
      expect(cpm.metrics.get("A")!.totalFloat).toBe(0);
      expect(cpm.warnings?.some((w) => w.includes("targetDate"))).toBe(true);
    }
  });

  it("flags near-critical tasks relative to the critical float when the deadline is later", () => {
    const res = calculateCriticalPath(
      [
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05" },
        { id: "B", category: "c", start: "2026-01-01", end: "2026-01-03" }
      ],
      { targetDate: "2026-01-20", nearCriticalThresholdDays: 3 }
    );
    expect(res.metrics.get("A")!.totalFloat).toBe(15);
    expect(res.criticalTaskIds.has("A")).toBe(true);
    expect(res.metrics.get("A")!.slackLabel).toBe("Critical · 15d to deadline");
    expect(res.nearCriticalTaskIds.has("B")).toBe(true);
  });
});

describe("PERT risk on the critical path", () => {
  it("compares the PERT expected finish (not the deterministic one) with the target", () => {
    const tasks: Task[] = [
      {
        id: "A",
        category: "c",
        start: "2026-01-01",
        end: "2026-01-11",
        fields: { optimisticDuration: 10, mostLikelyDuration: 20, pessimisticDuration: 30 }
      }
    ];
    const cpm = calculateCriticalPath(tasks);
    const risk = calculatePertRisk(tasks, cpm, "2026-01-11");
    expect(risk.expectedProjectDurationDays).toBe(20);
    expect(risk.confidencePercentages.onTimeProbability).toBeLessThan(0.01);
  });

  it("keeps the gaps along the path in the expected duration", () => {
    const tasks = resolveSchedule([
      { id: "A", category: "c", start: "2026-01-01", end: "2026-01-11" },
      { id: "B", category: "c", start: "2026-01-01", end: "2026-01-11", dependsOn: "A" },
      { id: "C", category: "c", start: "2026-01-01", end: "2026-01-11", dependsOn: "B" }
    ], 2);
    const cpm = calculateCriticalPath(tasks);
    const risk = calculatePertRisk(tasks, cpm);
    // 3 x 10 days + 2 gaps of 2 days = 34 planned days; PERT adds the skew of the default estimates
    expect(risk.expectedProjectDurationDays).toBeGreaterThan(34);
    expect(risk.expectedProjectDurationDays).toBeLessThan(36);
    // Without a target the probability is measured against the planned finish, not a fixed 95%
    expect(risk.confidencePercentages.targetDate).toBeUndefined();
    expect(risk.confidencePercentages.onTimeProbability).toBeGreaterThan(0.2);
    expect(risk.confidencePercentages.onTimeProbability).toBeLessThan(0.5);
  });

  it("reads the same three-point estimate shapes as Monte Carlo, and milestones add no uncertainty", () => {
    const base = { category: "c", start: "2026-01-01", end: "2026-01-11" };
    const viaObject: Task[] = [{ id: "A", ...base, pert: { optimistic: 10, mostLikely: 20, pessimistic: 30 } }];
    const viaFlat: Task[] = [{ id: "A", ...base, optimistic: 10, mostLikely: 20, pessimistic: 30 }];
    for (const tasks of [viaObject, viaFlat]) {
      const risk = calculatePertRisk(tasks, calculateCriticalPath(tasks), "2026-01-11");
      expect(risk.expectedProjectDurationDays).toBe(20);
      expect(risk.standardDeviationDays).toBeCloseTo(3.33, 2);
    }
    const withMilestone = resolveSchedule([
      { id: "A", ...base, pert: { optimistic: 10, mostLikely: 10, pessimistic: 10 } },
      { id: "M", category: "c", start: "2026-01-01", end: "2026-01-01", milestone: true, dependsOn: "A" }
    ], 0);
    const risk = calculatePertRisk(withMilestone, calculateCriticalPath(withMilestone, { defaultGapDays: 0 }));
    expect(risk.standardDeviationDays).toBe(0);
    expect(risk.expectedProjectDurationDays).toBe(10);
  });
});

describe("Minute-precision schedule cascade and CPM", () => {
  it("cascades timed tasks with minute and hour lag shorthand accurately", () => {
    const resolved = resolveSchedule([
      { id: "A", category: "c", start: "2026-09-01T09:00", end: "2026-09-01T10:00" },
      { id: "B", category: "c", start: "2026-09-01T09:30", end: "2026-09-01T11:30", dependsOn: "A:FS+30m" },
      { id: "C", category: "c", start: "2026-09-01T10:00", end: "2026-09-01T10:45", dependsOn: "B+1h" }
    ]);
    const b = resolved.find((t) => t.id === "B")!;
    const c = resolved.find((t) => t.id === "C")!;
    expect(b.start).toBe("2026-09-01T10:30");
    expect(b.end).toBe("2026-09-01T12:30");
    expect(c.start).toBe("2026-09-01T13:30");
    expect(c.end).toBe("2026-09-01T14:15");

    const cpm = calculateCriticalPath(resolved);
    expect(cpm.projectEarlyFinish).toBe("2026-09-01T14:15");
    expect([...cpm.criticalTaskIds].sort()).toEqual(["A", "B", "C"]);
  });
});
