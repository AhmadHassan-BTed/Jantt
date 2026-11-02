import { describe, it, expect } from "vitest";
import {
  sampleTriangular,
  sampleBetaPert,
  getTaskPertBounds,
  runMonteCarloSimulation
} from "../src/monte-carlo";
import type { Task } from "../src/types";

describe("Monte Carlo Schedule Risk Analysis Engine", () => {
  describe("Stochastic Variate Generators", () => {
    it("sampleTriangular generates samples strictly within [a, b]", () => {
      let pseudo = 0.1;
      const rng = () => {
        pseudo = (pseudo + 0.17) % 1;
        return pseudo;
      };

      for (let i = 0; i < 100; i++) {
        const val = sampleTriangular(5, 10, 20, rng);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThanOrEqual(20);
      }
    });

    it("sampleBetaPert generates samples strictly within [a, b]", () => {
      let pseudo = 0.25;
      const rng = () => {
        pseudo = (pseudo + 0.13) % 1;
        return pseudo;
      };

      for (let i = 0; i < 100; i++) {
        const val = sampleBetaPert(4, 8, 16, rng);
        expect(val).toBeGreaterThanOrEqual(4);
        expect(val).toBeLessThanOrEqual(16);
      }
    });
  });

  describe("getTaskPertBounds", () => {
    it("extracts explicit task.pert object", () => {
      const task: Task = {
        id: "t1",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05", // 4 days
        pert: { optimistic: 2, mostLikely: 4, pessimistic: 10 }
      } as any;

      const bounds = getTaskPertBounds(task);
      expect(bounds.optimistic).toBe(2);
      expect(bounds.mostLikely).toBe(4);
      expect(bounds.pessimistic).toBe(10);
    });

    it("falls back to default variance percentages when PERT is omitted", () => {
      const task: Task = {
        id: "t2",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-11" // 10 days
      };

      // -20% -> 8 days, +35% -> 13.5 -> 14 days
      const bounds = getTaskPertBounds(task, 0.2, 0.35);
      expect(bounds.optimistic).toBe(8);
      expect(bounds.mostLikely).toBe(10);
      expect(bounds.pessimistic).toBe(14);
    });
  });

  describe("runMonteCarloSimulation", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        label: "Architecture & Design",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-06", // 5 days
        pert: { optimistic: 3, mostLikely: 5, pessimistic: 9 }
      } as any,
      {
        id: "t2",
        label: "Core Implementation",
        category: "dev",
        start: "2026-11-06",
        end: "2026-11-16", // 10 days
        dependsOn: "t1",
        pert: { optimistic: 7, mostLikely: 10, pessimistic: 20 }
      } as any,
      {
        id: "t3",
        label: "Independent Side Task",
        category: "docs",
        start: "2026-11-01",
        end: "2026-11-04", // 3 days (huge slack)
        pert: { optimistic: 2, mostLikely: 3, pessimistic: 4 }
      } as any
    ];

    it("executes simulation and outputs consistent statistical percentiles", () => {
      const result = runMonteCarloSimulation(tasks, {
        iterations: 1000,
        seed: 42
      });

      expect(result.iterations).toBe(1000);
      expect(result.baselineDurationDays).toBe(15); // t1 (5) + t2 (10)
      expect(result.meanDurationDays).toBeGreaterThan(12);
      expect(result.standardDeviationDays).toBeGreaterThan(0);

      // Verify monotonic percentiles: P10 <= P50 <= P80 <= P90 <= P95
      const p10 = result.percentiles.P10.durationDays;
      const p50 = result.percentiles.P50.durationDays;
      const p80 = result.percentiles.P80.durationDays;
      const p90 = result.percentiles.P90.durationDays;
      const p95 = result.percentiles.P95.durationDays;

      expect(p10).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p80);
      expect(p80).toBeLessThanOrEqual(p90);
      expect(p90).toBeLessThanOrEqual(p95);
    });

    it("correctly identifies Criticality Index for bottleneck vs loose tasks", () => {
      const result = runMonteCarloSimulation(tasks, {
        iterations: 1000,
        seed: 42
      });

      const t1Crit = result.taskCriticality.find((t) => t.taskId === "t1")!;
      const t2Crit = result.taskCriticality.find((t) => t.taskId === "t2")!;
      const t3Crit = result.taskCriticality.find((t) => t.taskId === "t3")!;

      // t1 and t2 form the serial critical chain (should be ~100% critical)
      expect(t1Crit.criticalityIndex).toBeGreaterThanOrEqual(95);
      expect(t2Crit.criticalityIndex).toBeGreaterThanOrEqual(95);

      // t3 is an independent 3-day task parallel to a 15-day chain (should be 0% critical)
      expect(t3Crit.criticalityIndex).toBe(0);
    });

    it("generates Tornado ranking based on Pearson correlation sensitivity", () => {
      const result = runMonteCarloSimulation(tasks, {
        iterations: 1000,
        seed: 42
      });

      expect(result.tornadoRanking).toHaveLength(3);
      // t2 has the highest variance (pessimistic 20 vs most likely 10), so it should rank #1 in driving project risk
      expect(result.tornadoRanking[0].taskId).toBe("t2");
      expect(result.tornadoRanking[0].sensitivityIndex).toBeGreaterThan(0.5);
    });

    it("constructs valid histogram bins covering 100% of iterations", () => {
      const result = runMonteCarloSimulation(tasks, {
        iterations: 1000,
        histogramBins: 10,
        seed: 42
      });

      expect(result.histogram).toHaveLength(10);
      const totalCount = result.histogram.reduce((acc, bin) => acc + bin.count, 0);
      expect(totalCount).toBe(1000);

      // Cumulative frequency of last bin should be 1.0 (100%)
      expect(result.histogram[9].cumulativeFrequency).toBe(1.0);
    });
  });
});
