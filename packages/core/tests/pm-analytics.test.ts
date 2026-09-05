import { describe, it, expect } from "vitest";
import {
  calculateEVM,
  auditScheduleIntegrity,
  calculatePertRisk,
  estimateTaskPert,
  calculateCriticalPath,
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
