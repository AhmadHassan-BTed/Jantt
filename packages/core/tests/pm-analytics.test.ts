import { describe, it, expect } from "vitest";
import {
  calculateEVM,
  auditScheduleIntegrity,
  calculatePertRisk,
  estimateTaskPert,
  calculateCriticalPath,
  getTodayISODate,
  addDays,
  Task
} from "../src";

describe("EVM (Earned Value Management) Engine - ANSI/EIA-748", () => {
  it("calculates classical EVM metrics accurately", () => {
    // Project status date is 2026-09-15
    const tasks: Task[] = [
      {
        id: "T1",
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-10",
        estimatedCost: 10000,
        actualCost: 9000,
        status: "completed",
        progress: 1.0
      },
      {
        id: "T2",
        category: "dev",
        start: "2026-09-05",
        end: "2026-09-15",
        estimatedCost: 20000,
        actualCost: 12000,
        status: "in-progress",
        progress: 0.5
      },
      {
        id: "T3",
        category: "qa",
        start: "2026-09-16",
        end: "2026-09-25",
        estimatedCost: 15000,
        actualCost: 0,
        status: "not-started",
        progress: 0.0,
        dependsOn: "T2"
      }
    ];

    const evm = calculateEVM(tasks, { statusDate: "2026-09-15" });

    // BAC = 10000 + 20000 + 15000 = 45000
    expect(evm.bac).toBe(45000);

    // On 2026-09-15:
    // T1 is ended (planned = 100%) -> PV = 10000, EV = 10000, AC = 9000
    // T2 is ended on 09-15 (planned = 100%) -> PV = 20000, EV = 10000, AC = 12000
    // T3 has not started (planned = 0%) -> PV = 0, EV = 0, AC = 0
    // PV = 30000, EV = 20000, AC = 21000
    expect(evm.pv).toBe(30000);
    expect(evm.ev).toBe(20000);
    expect(evm.ac).toBe(21000);

    // SV = EV - PV = 20000 - 30000 = -10000
    expect(evm.sv).toBe(-10000);

    // CV = EV - AC = 20000 - 21000 = -1000
    expect(evm.cv).toBe(-1000);

    // SPI = EV / PV = 20000 / 30000 = 0.667
    expect(evm.spi).toBeCloseTo(0.667, 2);

    // CPI = EV / AC = 20000 / 21000 = 0.952
    expect(evm.cpi).toBeCloseTo(0.952, 2);

    // Forecasting: EAC = BAC / CPI = 45000 / 0.952 = ~47250
    expect(evm.eac).toBeGreaterThan(45000);
    expect(evm.vac).toBeLessThan(0); // Cost overrun expected

    // Status: behind schedule & at-risk
    expect(evm.scheduleStatus).toBe("behind");
    expect(evm.taskCountCompleted).toBe(1);
    expect(evm.taskCountInProgress).toBe(1);
    expect(evm.taskCountNotStarted).toBe(1);
    expect(evm.taskCountBlocked).toBe(1); // T3 is blocked because T2 is not done
  });

  it("handles empty and zero-cost projects gracefully", () => {
    const evm = calculateEVM([]);
    expect(evm.bac).toBe(0);
    expect(evm.spi).toBe(1.0);
    expect(evm.cpi).toBe(1.0);
    expect(evm.overallHealth).toBe("healthy");
  });

  const task = (overrides: Partial<Task>): Task => ({
    id: "T",
    category: "dev",
    start: "2026-01-01",
    end: "2026-01-31",
    ...overrides
  });

  it("time-phases PV against the baseline, so re-planning does not reset SPI", () => {
    const evm = calculateEVM(
      [task({ start: "2026-03-01", end: "2026-03-31", baseline: { start: "2026-01-01", end: "2026-01-31" }, estimatedCost: 1000, progress: 0 })],
      { statusDate: "2026-02-15" }
    );
    expect(evm.pvBasis).toBe("baseline");
    expect(evm.pv).toBe(1000);
    expect(evm.spi).toBe(0);
    expect(evm.scheduleStatus).toBe("behind");
  });

  it("measures schedule on duration-weighted value when the plan has no costs", () => {
    const evm = calculateEVM(
      [task({ id: "A", progress: 0 }), task({ id: "B", start: "2026-02-01", end: "2026-02-11", progress: 0 })],
      { statusDate: "2026-03-01" }
    );
    expect(evm.costDataAvailable).toBe(false);
    expect(evm.spi).toBe(0);
    expect(evm.scheduleStatus).toBe("behind");
    expect(evm.overallHealth).toBe("critical");
    expect(evm.cpi).toBe(1.0); // neutral placeholder, flagged by costDataAvailable
    expect(evm.pv).toBe(0); // monetary values stay monetary
  });

  it("treats a missing actualCost as unknown instead of inventing AC = EV", () => {
    const unknown = calculateEVM([task({ estimatedCost: 1000, progress: 0.5 })], { statusDate: "2026-01-16" });
    expect(unknown.ac).toBe(0);
    expect(unknown.costCoverage).toBe(0);
    expect(unknown.cpi).toBe(1.0);

    const mixed = calculateEVM(
      [
        task({ id: "A", estimatedCost: 1000, progress: 0.5, actualCost: 600 }),
        task({ id: "B", estimatedCost: 1000, progress: 0.5 })
      ],
      { statusDate: "2026-01-16" }
    );
    expect(mixed.cpi).toBeCloseTo(500 / 600, 3); // not diluted by B's missing actuals
    expect(mixed.costCoverage).toBe(0.5);
    expect(mixed.costStatus).toBe("over-budget");
  });

  it("forecasts EAC = AC + (BAC - EV) when money was spent without earned value", () => {
    const evm = calculateEVM([task({ estimatedCost: 1000, actualCost: 500, progress: 0 })], { statusDate: "2026-01-16" });
    expect(evm.cpi).toBe(0);
    expect(evm.eac).toBe(1500);
    expect(evm.vac).toBe(-500);
    expect(evm.etc).toBe(1000);
  });

  it("flags TCPI as unachievable once the budget is exhausted with work remaining", () => {
    const blown = calculateEVM([task({ estimatedCost: 1000, actualCost: 1200, progress: 0.5 })], { statusDate: "2026-01-16" });
    expect(blown.tcpi).toBe(Infinity);

    const onTrack = calculateEVM([task({ estimatedCost: 1000, actualCost: 400, progress: 0.5 })], { statusDate: "2026-01-16" });
    expect(onTrack.tcpi).toBeCloseTo(500 / 600, 3);
  });

  it("derives EAC from the unrounded CPI", () => {
    const evm = calculateEVM([task({ estimatedCost: 10000000, actualCost: 10500001, status: "completed" })], {
      statusDate: "2026-02-01"
    });
    expect(evm.eac).toBe(10500001);
  });

  it("falls back to today for an invalid status date and reports the date used", () => {
    const evm = calculateEVM([task({})], { statusDate: "not-a-date" });
    expect(evm.statusDate).toBe(getTodayISODate());
    expect(calculateEVM([task({})], { statusDate: 20260101 as unknown as string }).statusDate).toBe(getTodayISODate());
  });

  it("keeps cost indices neutral for plans that record spend but no budgets", () => {
    const evm = calculateEVM([task({ actualCost: 500, progress: 0.5 })], { statusDate: "2026-01-16" });
    expect(evm.costDataAvailable).toBe(false);
    expect(evm.cpi).toBe(1.0);
    expect(evm.costStatus).toBe("on-budget");
    expect(evm.overallHealth).toBe("healthy");
    expect(evm.eac).toBe(0);
    expect(evm.tcpi).toBe(1.0);
  });

  it("keeps TCPI neutral while no task reports an actual cost", () => {
    const evm = calculateEVM([task({ estimatedCost: 1000, progress: 0.5 })], { statusDate: "2026-01-16" });
    expect(evm.tcpi).toBe(1.0); // not (BAC - EV) / BAC, which assumes nothing was spent
    expect(evm.eac).toBe(1000);
  });

  it("only lets FS and SS links block a task from starting", () => {
    const evm = calculateEVM(
      [
        task({ id: "P", progress: 0.3 }),
        task({ id: "FS", dependsOn: "P" }),
        task({ id: "SS", dependsOn: "P:SS" }),
        task({ id: "FF", dependsOn: "P:FF" })
      ],
      { statusDate: "2026-01-10" }
    );
    expect(evm.taskMetrics.get("FS")!.isBlocked).toBe(true);
    expect(evm.taskMetrics.get("SS")!.isBlocked).toBe(false);
    expect(evm.taskMetrics.get("FF")!.isBlocked).toBe(false);
    expect(evm.taskCountBlocked).toBe(1);
  });
});

describe("Schedule Health Audit (DCMA 14-Point Inspired)", () => {
  it("detects missing logic and negative float", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "A2", category: "dev", start: "2026-09-10", end: "2026-09-15", dependsOn: "A" },
      // Isolated task missing logic (0 preds and 0 succs)
      { id: "B", category: "qa", start: "2026-09-05", end: "2026-09-08" }
    ];

    // Project early finish is 09-15, target date is 09-12 (causes negative float of -3 days)
    const cpm = calculateCriticalPath(tasks, { targetDate: "2026-09-12" });
    const audit = auditScheduleIntegrity(tasks, cpm);

    expect(audit.negativeFloatCount).toBeGreaterThan(0);
    expect(audit.missingLogicCount).toBe(1); // B has 0 preds and 0 succs
    expect(audit.healthScore).toBeLessThan(100);
    expect(audit.issues.some((i) => i.type === "negative-float")).toBe(true);
    expect(audit.issues.some((i) => i.type === "missing-logic")).toBe(true);
  });

  const audit = (tasks: Task[]) => auditScheduleIntegrity(tasks, calculateCriticalPath(tasks));

  it("flags open ends (missing predecessor or successor), exempting project start and finish", () => {
    const result = audit([
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-05", end: "2026-09-20", dependsOn: "A" },
      { id: "C", category: "dev", start: "2026-09-05", end: "2026-09-08", dependsOn: "A" }
    ]);
    expect(result.missingLogicCount).toBe(1);
    expect(result.issues.find((i) => i.type === "missing-logic")!.taskId).toBe("C");
  });

  it("scores by defect ratio, not plan size", () => {
    // A resolved FS chain of 40 one-day tasks
    const chain: Task[] = Array.from({ length: 40 }, (_, i) => ({
      id: `T${i}`,
      category: "dev",
      start: addDays("2026-01-01", i),
      end: addDays("2026-01-01", i + 1),
      ...(i > 0 ? { dependsOn: `T${i - 1}` } : {})
    }));
    const large = audit([...chain, { id: "X", category: "dev", start: "2026-01-10", end: "2026-01-12" }]);
    expect(large.missingLogicCount).toBe(1);
    expect(large.checks.find((c) => c.id === "logic")!.passed).toBe(true); // 1 of 41 is within 5%
    expect(large.grade).toBe("A");

    const small = audit([chain[0], { ...chain[1] }, { id: "X", category: "dev", start: "2026-01-10", end: "2026-01-12" }]);
    expect(small.checks.find((c) => c.id === "logic")!.passed).toBe(false);
    expect(["D", "F"]).toContain(small.grade);
    expect(small.summary).toMatch(/significant integrity issues/);
  });

  it("reports dangling dependency ids as broken-chain issues", () => {
    const result = audit([
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-05", end: "2026-09-10", dependsOn: ["A", "ghost"] }
    ]);
    expect(result.brokenChainCount).toBe(1);
    expect(result.issues.some((i) => i.type === "broken-chain" && i.taskId === "B")).toBe(true);
  });

  it("excludes completed tasks from logic and float checks and ignores tombstones", () => {
    const result = audit([
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-05", end: "2026-09-10", dependsOn: "A" },
      { id: "Done", category: "dev", start: "2026-09-02", end: "2026-09-03", status: "completed" },
      { id: "Gone", category: "dev", start: "2026-09-02", end: "2026-09-03", _deleted: true }
    ]);
    expect(result.missingLogicCount).toBe(0);
    expect(result.totalTasksChecked).toBe(3);

    const single = audit([
      { id: "Only", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "Gone", category: "dev", start: "2026-09-02", end: "2026-09-03", _deleted: true }
    ]);
    expect(single.missingLogicCount).toBe(0);
  });

  it("applies out-of-sequence rules per dependency type", () => {
    const result = audit([
      { id: "P", category: "dev", start: "2026-09-01", end: "2026-09-10", progress: 0.5 },
      { id: "Q", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "SSok", category: "dev", start: "2026-09-01", end: "2026-09-10", dependsOn: "P:SS", progress: 0.2 },
      { id: "SSbad", category: "dev", start: "2026-09-01", end: "2026-09-10", dependsOn: "Q:SS", progress: 0.2 },
      { id: "FSbad", category: "dev", start: "2026-09-10", end: "2026-09-20", dependsOn: "P", progress: 0.2 },
      { id: "FFok", category: "dev", start: "2026-09-01", end: "2026-09-10", dependsOn: "Q:FF", progress: 0.2 }
    ]);
    const flagged = result.issues.filter((i) => i.type === "out-of-sequence").map((i) => i.taskId);
    expect(flagged.sort()).toEqual(["FSbad", "SSbad"]);
    expect(result.outOfSequenceCount).toBe(2);
  });

  it("compares float with the 44 working-day threshold", () => {
    // 50 calendar days of float is ~36 working days: not high float
    const result = audit([
      { id: "A", category: "dev", start: "2026-01-01", end: "2026-01-02" },
      { id: "B", category: "dev", start: "2026-01-02", end: "2026-03-01", dependsOn: "A" },
      { id: "C", category: "dev", start: "2026-01-02", end: "2026-01-10", dependsOn: "A" },
      { id: "D", category: "dev", start: "2026-03-01", end: "2026-03-02", dependsOn: ["B", "C"] }
    ]);
    expect(result.highFloatCount).toBe(0);
  });

  it("does not double-convert task-calendar working-day float in the high-float check", () => {
    // C uses a standard Mon-Fri calendar and has > 44 working days of float (~70 calendar days).
    // Even without a project calendar passed to auditScheduleIntegrity, C must still be flagged.
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-01-05", end: "2026-01-06" },
      { id: "B", category: "dev", start: "2026-01-06", end: "2026-04-01", dependsOn: "A" },
      { id: "C", category: "dev", start: "2026-01-06", end: "2026-01-09", dependsOn: "A", calendar: "standard" },
      { id: "D", category: "dev", start: "2026-04-01", end: "2026-04-02", dependsOn: ["B", "C"] }
    ];
    const cpm = calculateCriticalPath(tasks);
    expect(cpm.metrics.get("C")!.totalFloat).toBeGreaterThan(44);
    const result = auditScheduleIntegrity(tasks, cpm);
    expect(result.highFloatCount).toBe(1);
    expect(result.issues.some((i) => i.type === "high-float" && i.taskId === "C")).toBe(true);
  });
});

describe("PERT 3-Point Estimation Engine", () => {
  it("estimates single task beta distribution expected duration and variance", () => {
    // O = 4, M = 7, P = 16
    // mu = (4 + 28 + 16) / 6 = 48 / 6 = 8
    // sigma = (16 - 4) / 6 = 2
    // variance = 4
    const est = estimateTaskPert(4, 7, 16);
    expect(est.expected).toBe(8);
    expect(est.standardDeviation).toBe(2);
    expect(est.variance).toBe(4);
  });

  it("computes cumulative critical path risk and confidence", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "B", category: "dev", start: "2026-09-10", end: "2026-09-20", dependsOn: "A" }
    ];

    const cpm = calculateCriticalPath(tasks);
    const risk = calculatePertRisk(tasks, cpm, "2026-09-25");

    expect(risk.expectedProjectDurationDays).toBeGreaterThan(0);
    expect(risk.standardDeviationDays).toBeGreaterThan(0);
    expect(risk.confidencePercentages.onTimeProbability).toBeGreaterThan(0.5);
  });
});
