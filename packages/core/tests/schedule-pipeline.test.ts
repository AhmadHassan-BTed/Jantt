import { describe, it, expect } from "vitest";
import {
  SchedulePipeline,
  SanitizeStage,
  CycleGuardStage,
  CascadeResolveStage,
  CriticalPathStage
} from "../src/pipeline";
import { resolveSchedule } from "../src/resolver";
import { calculateCriticalPath } from "../src/cpm";
import { Task } from "../src/types";

describe("SchedulePipeline Assembly Line", () => {
  it("SanitizeStage corrects inverted dates and removes self/dangling dependencies", () => {
    const stage = new SanitizeStage();
    const tasks: Task[] = [
      {
        id: "t1",
        label: "Task 1",
        start: "2026-03-10",
        end: "2026-03-05", // Inverted date!
        dependsOn: "t1",   // Self dependency!
        progress: 0,
        status: "not-started"
      },
      {
        id: "t2",
        label: "Task 2",
        start: "2026-03-05",
        end: "2026-03-08",
        dependsOn: "non-existent-task", // Dangling dependency!
        progress: 0,
        status: "not-started"
      }
    ];

    const ctx = { defaultGapDays: 2, diagnostics: [] };
    const sanitized = stage.process(tasks, ctx);

    // Inverted date corrected
    expect(sanitized[0].start).toBe("2026-03-10");
    expect(sanitized[0].end).toBe("2026-03-10");
    // Self-dependency removed
    expect(sanitized[0].dependsOn).toBeNull();
    // Dangling dependency removed
    expect(sanitized[1].dependsOn).toBeNull();
    // Diagnostic recorded
    expect(ctx.diagnostics.length).toBeGreaterThan(0);
  });

  it("CycleGuardStage detects dependency loops", () => {
    const stage = new CycleGuardStage();
    const cyclicTasks: Task[] = [
      { id: "a", label: "A", start: "2026-01-01", end: "2026-01-05", dependsOn: "b", progress: 0, status: "not-started" },
      { id: "b", label: "B", start: "2026-01-06", end: "2026-01-10", dependsOn: "a", progress: 0, status: "not-started" }
    ];

    const ctx = { defaultGapDays: 2, diagnostics: [] };
    stage.process(cyclicTasks, ctx);

    expect(ctx.diagnostics.some((d) => d.includes("Circular dependency"))).toBe(true);
  });

  it("CascadeResolveStage shifts downstream tasks while respecting gap days and locked flags", () => {
    const stage = new CascadeResolveStage();
    const tasks: Task[] = [
      { id: "t1", label: "T1", start: "2026-01-01", end: "2026-01-05", dependsOn: null, progress: 0, status: "not-started" },
      { id: "t2", label: "T2", start: "2026-01-01", end: "2026-01-03", dependsOn: "t1", progress: 0, status: "not-started" },
      { id: "t3", label: "T3", start: "2026-01-01", end: "2026-01-04", dependsOn: "t1", locked: true, progress: 0, status: "not-started" }
    ];

    const ctx = { defaultGapDays: 2 };
    const resolved = stage.process(tasks, ctx);

    // t1 is unchanged
    expect(resolved[0].start).toBe("2026-01-01");
    expect(resolved[0].end).toBe("2026-01-05");

    // t2 starts after t1.end (2026-01-05) + 2 days = 2026-01-07
    expect(resolved[1].start).toBe("2026-01-07");
    expect(resolved[1].end).toBe("2026-01-09");

    // t3 is locked, must remain 2026-01-01 to 2026-01-04
    expect(resolved[2].start).toBe("2026-01-01");
    expect(resolved[2].end).toBe("2026-01-04");
  });

  it("CriticalPathStage tags critical tasks and computes metrics", () => {
    const stage = new CriticalPathStage();
    const tasks: Task[] = [
      { id: "A", label: "Task A", start: "2026-09-01", end: "2026-09-10", dependsOn: null, progress: 0, status: "not-started" },
      { id: "B", label: "Task B", start: "2026-09-10", end: "2026-09-20", dependsOn: "A", progress: 0, status: "not-started" },
      { id: "C", label: "Task C", start: "2026-09-01", end: "2026-09-05", dependsOn: null, progress: 0, status: "not-started" }
    ];

    const ctx = { defaultGapDays: 0, options: {} };
    const tagged = stage.process(tasks, ctx);

    expect(tagged.find((t) => t.id === "A")?.critical).toBe(true);
    expect(tagged.find((t) => t.id === "B")?.critical).toBe(true);
    expect(tagged.find((t) => t.id === "C")?.critical).toBe(false);
    expect(ctx.options.cpmResult).toBeDefined();
    expect(ctx.options.cpmResult.criticalTaskIds.has("A")).toBe(true);
    expect(ctx.options.cpmResult.criticalTaskIds.has("B")).toBe(true);
  });

  it("SchedulePipeline executes full assembly line cleanly", () => {
    const pipeline = SchedulePipeline.createDefault({ includeCriticalPath: true });
    expect(pipeline.getStages().length).toBe(4);

    const rawTasks: Task[] = [
      { id: "a", label: "Task A", start: "2026-02-01", end: "2026-02-05", dependsOn: null, progress: 0, status: "not-started" },
      { id: "b", label: "Task B", start: "2026-02-01", end: "2026-01-20", dependsOn: "a", progress: 0, status: "not-started" } // inverted end
    ];

    const result = pipeline.execute(rawTasks, { defaultGapDays: 1 });
    expect(result.tasks.length).toBe(2);
    // Task B inverted date sanitized and cascaded after Task A
    expect(result.tasks[1].start).toBe("2026-02-06");
  });

  it("SanitizeStage keeps typed links and lags while removing dangling ones", () => {
    const stage = new SanitizeStage();
    const ctx = { defaultGapDays: 2, diagnostics: [] as string[] };
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-03-01", end: "2026-03-05" },
      { id: "B", category: "c", start: "2026-03-03", end: "2026-03-06", dependsOn: ["A:SS+1d", "ghost"] },
      { id: "C", category: "c", start: "2026-03-03", end: "2026-03-06", dependsOn: [{ id: "A", type: "FF", lag: 3 }, "C"] },
      { id: "D", category: "c", start: "2026-03-03", end: "2026-03-06", dependsOn: ["A:SS", { id: "B", type: "SF" }] }
    ];
    const out = stage.process(tasks, ctx);
    expect(out[1].dependsOn).toBe("A:SS+1d");
    expect(out[2].dependsOn).toEqual({ id: "A", type: "FF", lag: 3 });
    expect(out[3].dependsOn).toBe(tasks[3].dependsOn); // untouched value is kept as-is
  });

  it("SanitizeStage collapses milestones that carry a duration", () => {
    const ctx = { defaultGapDays: 2, diagnostics: [] as string[] };
    const out = new SanitizeStage().process(
      [{ id: "M", category: "c", start: "2026-03-01", end: "2026-03-04", milestone: true }],
      ctx
    );
    expect(out[0].end).toBe("2026-03-01");
    expect(ctx.diagnostics.some((d) => d.includes("Milestone"))).toBe(true);
  });

  it("CycleGuardStage breakCycles removes only links inside the cycle", () => {
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: ["B", "X:SS"] },
      { id: "B", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "A" },
      { id: "C", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "B" },
      { id: "D", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "C" },
      { id: "E", category: "c", start: "2026-01-01", end: "2026-01-05" },
      { id: "F", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: ["E", "C:FF+1d"] },
      { id: "X", category: "c", start: "2026-01-01", end: "2026-01-05" }
    ];
    const ctx = { defaultGapDays: 2, diagnostics: [] as string[], options: { breakCycles: true } };
    const out = new CycleGuardStage().process(tasks, ctx);
    expect(out[0].dependsOn).toBe("X:SS");
    expect(out[1].dependsOn).toBeNull();
    expect(out[2]).toBe(tasks[2]);
    expect(out[3]).toBe(tasks[3]);
    expect(out[5]).toBe(tasks[5]);
    expect(ctx.diagnostics.filter((d) => d.startsWith("Removed")).length).toBe(2);
  });

  it("CycleGuardStage does not report duplicate ids as a cycle", () => {
    const ctx = { defaultGapDays: 2, diagnostics: [] as string[] };
    new CycleGuardStage().process(
      [
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-02" },
        { id: "A", category: "c", start: "2026-01-01", end: "2026-01-02" },
        { id: "B", category: "c", start: "2026-01-01", end: "2026-01-02", dependsOn: "A" }
      ],
      ctx
    );
    expect(ctx.diagnostics).toEqual([]);
  });

  it("SchedulePipeline honors autoCascade: false (Strict mode)", () => {
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-03-01", end: "2026-03-10" },
      { id: "B", category: "c", start: "2026-03-02", end: "2026-03-04", dependsOn: "A" }
    ];
    const result = SchedulePipeline.createDefault().execute(tasks, { autoCascade: false });
    expect(result.tasks[1].start).toBe("2026-03-02");
  });

  it("SchedulePipeline passes working calendars to the cascade", () => {
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-11-04", end: "2026-11-06" },
      { id: "B", category: "c", start: "2026-11-05", end: "2026-11-06", dependsOn: "A" }
    ];
    const result = SchedulePipeline.createDefault().execute(tasks, {
      defaultGapDays: 1,
      calendar: { workingDays: [1, 2, 3, 4, 5], region: "US" }
    });
    expect(result.tasks[1].start).toBe("2026-11-09");
  });

  it("SchedulePipeline is stable on cyclic plans across repeated executions", () => {
    const pipeline = SchedulePipeline.createDefault();
    const tasks: Task[] = [
      { id: "A", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "B" },
      { id: "B", category: "c", start: "2026-01-01", end: "2026-01-05", dependsOn: "A" }
    ];
    const first = pipeline.execute(tasks, { defaultGapDays: 2 });
    const second = pipeline.execute(first.tasks, { defaultGapDays: 2 });
    expect(second.tasks).toEqual(first.tasks);
    expect(first.tasks[0].start).toBe("2026-01-01");
    expect(first.diagnostics.some((d) => d.includes("Circular dependency"))).toBe(true);
  });

  describe("resolveSchedule and the default pipeline agree (ARCH-23)", () => {
    // Inverted dates, a dangling link, a self link, a 3-cycle with a successor, a duplicate id,
    // a milestone and typed/lagged links, in non-topological order.
    const messyPlan = (): Task[] => [
      { id: "S", category: "c", start: "2026-02-01", end: "2026-02-03", dependsOn: ["INV", "C1:SS+1d", "ghost"] },
      { id: "INV", category: "c", start: "2026-01-10", end: "2026-01-05" },
      { id: "C1", category: "c", start: "2026-01-01", end: "2026-01-03", dependsOn: "C3" },
      { id: "C2", category: "c", start: "2026-01-01", end: "2026-01-03", dependsOn: "C1" },
      { id: "C3", category: "c", start: "2026-01-01", end: "2026-01-03", dependsOn: ["C2", "C3"] },
      { id: "M", category: "c", start: "2026-01-20", end: "2026-01-20", milestone: true, dependsOn: { id: "INV", type: "FF", lag: 2 } },
      { id: "T", category: "c", start: "2026-01-01", end: "2026-01-04", dependsOn: ["M", "S:SF-1d"] },
      { id: "S", category: "c", start: "2026-03-01", end: "2026-03-02" }
    ];
    const datesOf = (tasks: Task[]) => tasks.map((t) => `${t.id} ${t.start} ${t.end}`);

    for (const [label, options] of [
      ["calendar days", { defaultGapDays: 2 }],
      ["working days", { defaultGapDays: 1, calendar: { workingDays: [1, 2, 3, 4, 5], region: "UK" } }]
    ] as const) {
      it(`produces the same dates through both entry points (${label})`, () => {
        const viaResolve = resolveSchedule(messyPlan(), options);
        const viaPipeline = SchedulePipeline.createDefault().execute(messyPlan(), options).tasks;
        // The only difference: the pipeline also repairs the inverted range it was given
        const exceptInverted = (rows: string[]) => rows.filter((row) => !row.startsWith("INV "));
        expect(exceptInverted(datesOf(viaResolve))).toEqual(exceptInverted(datesOf(viaPipeline)));
        expect(viaPipeline.find((t) => t.id === "INV")!.end).toBe("2026-01-10");
        expect(viaResolve.find((t) => t.id === "INV")!.end).toBe("2026-01-05"); // untouched by the cascade
        // Raw dependsOn survives resolveSchedule (it runs on every drag frame and must not rewrite links)
        expect(viaResolve[0].dependsOn).toEqual(["INV", "C1:SS+1d", "ghost"]);
        expect(viaPipeline[0].dependsOn).toEqual(["INV", "C1:SS+1d"]);
      });
    }

    it("treats an inverted predecessor as zero duration, like the CPM", () => {
      const tasks: Task[] = [
        { id: "INV", category: "c", start: "2026-01-10", end: "2026-01-05" },
        { id: "B", category: "c", start: "2026-01-01", end: "2026-01-02", dependsOn: "INV" }
      ];
      const b = resolveSchedule(tasks, 0).find((t) => t.id === "B")!;
      expect(b.start).toBe("2026-01-10");
      expect(b.start).toBe(calculateCriticalPath(tasks, { defaultGapDays: 0 }).metrics.get("B")!.earlyStart);
    });
  });
});
