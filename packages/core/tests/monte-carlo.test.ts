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

      // -20% -> 8 days, +35% -> 13.5 days (not rounded, so short tasks keep their spread)
      const bounds = getTaskPertBounds(task, 0.2, 0.35);
      expect(bounds.optimistic).toBeCloseTo(8, 9);
      expect(bounds.mostLikely).toBe(10);
      expect(bounds.pessimistic).toBeCloseTo(13.5, 9);
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

    it("ranks taskCriticality by criticality index descending", () => {
      const result = runMonteCarloSimulation([tasks[2], tasks[0], tasks[1]], { iterations: 500, seed: 7 });
      const indexes = result.taskCriticality.map((t) => t.criticalityIndex);
      expect(indexes).toEqual([...indexes].sort((a, b) => b - a));
      expect(result.taskCriticality[result.taskCriticality.length - 1].taskId).toBe("t3");
    });
  });

  describe("distribution correctness", () => {
    const mulberry = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    it("sampleBetaPert matches the PERT mean and Beta(1+4(m-a)/r, 1+4(b-m)/r) spread", () => {
      const rng = mulberry(12345);
      const n = 20000;
      let sum = 0;
      let sumSq = 0;
      for (let i = 0; i < n; i++) {
        const x = sampleBetaPert(4, 8, 16, rng);
        sum += x;
        sumSq += x * x;
      }
      const mean = sum / n;
      const sd = Math.sqrt(sumSq / n - mean * mean);
      const alpha = 1 + (4 * 4) / 12;
      const beta = 1 + (4 * 8) / 12;
      const expectedSd = 12 * Math.sqrt((alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1)));

      expect(Math.abs(mean - 52 / 6) / (52 / 6)).toBeLessThan(0.02); // PERT mean (a + 4m + b) / 6
      expect(Math.abs(sd - expectedSd) / expectedSd).toBeLessThan(0.05); // ~2.2d, not the U-shaped ~4.9d
    });

    it("sampleBetaPert terminates with a degenerate RNG", () => {
      expect(Number.isFinite(sampleBetaPert(4, 8, 16, () => NaN))).toBe(true);
      expect(Number.isFinite(sampleBetaPert(4, 8, 16, () => -0.5))).toBe(true);
    });
  });

  describe("getTaskPertBounds input hardening", () => {
    const base = { id: "x", category: "dev", start: "2026-11-01", end: "2026-11-02" };

    it("keeps uncertainty on 1-day tasks", () => {
      const bounds = getTaskPertBounds(base as Task);
      expect(bounds.optimistic).toBeLessThan(1);
      expect(bounds.mostLikely).toBe(1);
      expect(bounds.pessimistic).toBeGreaterThan(1);
    });

    it("orders inconsistent estimates and rejects blank or null values", () => {
      expect(getTaskPertBounds({ ...base, pert: { optimistic: 5, mostLikely: 3, pessimistic: 4 } } as Task)).toEqual({
        optimistic: 5,
        mostLikely: 5,
        pessimistic: 5
      });
      const blank = getTaskPertBounds({ ...base, pert: { optimistic: "", mostLikely: 1, pessimistic: null } } as Task);
      expect(blank.optimistic).toBeLessThan(1); // fell back to default variance, not a 0-day estimate
    });

    it("reads the PERT engine's *Duration field names", () => {
      const bounds = getTaskPertBounds({
        ...base,
        fields: { optimisticDuration: 1, mostLikelyDuration: 2, pessimisticDuration: 6 }
      } as Task);
      expect(bounds).toEqual({ optimistic: 1, mostLikely: 2, pessimistic: 6 });
    });

    it("keeps each valid estimate and defaults only the missing ones", () => {
      const tenDays = { ...base, end: "2026-11-11" };
      const bounds = getTaskPertBounds({ ...tenDays, pert: { optimistic: 2, mostLikely: 4, pessimistic: "" } } as unknown as Task);
      expect(bounds.optimistic).toBe(2);
      expect(bounds.mostLikely).toBe(4);
      expect(bounds.pessimistic).toBeCloseTo(13.5, 9);
      // The variance options only replace values the task does not set
      expect(getTaskPertBounds({ ...tenDays, fields: { optimisticDuration: 3 } } as Task, 0.5, 1).optimistic).toBe(3);
      expect(getTaskPertBounds({ ...tenDays, fields: { optimisticDuration: 3 } } as Task, 0.5, 1).pessimistic).toBe(20);
    });

    it("reads every field spelling, most specific first (shared with the PERT risk engine)", () => {
      const tenDays = { ...base, end: "2026-11-11" };
      const cases: Array<[Record<string, unknown>, [number, number, number]]> = [
        [{}, [8, 10, 13.5]],
        [{ pert: { optimistic: 2, mostLikely: 4, pessimistic: 10 } }, [2, 4, 10]],
        [{ fields: { pert: { optimistic: 3, pessimistic: 12 } } }, [3, 10, 12]],
        [{ pert: { optimistic: 2 } }, [2, 10, 13.5]],
        [{ fields: { optimisticDuration: 6, mostLikelyDuration: 9, pessimisticDuration: 20 } }, [6, 9, 20]],
        [{ optimistic: 1, fields: { optimisticDuration: 5 } }, [5, 10, 13.5]],
        [{ optimistic: "4", mostLikely: " 7 ", pessimistic: 15 }, [4, 7, 15]],
        [{ fields: { optimistic: 2, pessimistic: 30 } }, [2, 10, 30]],
        [{ pert: { optimistic: 5, mostLikely: 3, pessimistic: 4 } }, [5, 5, 5]],
        [{ pert: "invalid", fields: { pert: { optimistic: 1, pessimistic: 3 } } }, [1, 10, 10]],
        [{ pert: { optimistic: null, mostLikely: "", pessimistic: "x" } }, [8, 10, 13.5]]
      ];
      for (const [extra, [o, m, p]] of cases) {
        const bounds = getTaskPertBounds({ ...tenDays, ...extra } as unknown as Task);
        expect(bounds.optimistic).toBeCloseTo(o, 9);
        expect(bounds.mostLikely).toBeCloseTo(m, 9);
        expect(bounds.pessimistic).toBeCloseTo(p, 9);
      }
    });

    it("clamps the variance options", () => {
      const tenDays = { ...base, end: "2026-11-11" } as Task;
      expect(getTaskPertBounds(tenDays, 5, 1e308)).toEqual({ optimistic: 0, mostLikely: 10, pessimistic: 110 });
      expect(getTaskPertBounds(tenDays, NaN, -1)).toEqual({ optimistic: 8, mostLikely: 10, pessimistic: 10 });
    });
  });

  describe("schedule semantics", () => {
    const fixed = (days: number) => ({ optimistic: days, mostLikely: days, pessimistic: days });

    it("anchors unlinked tasks at their scheduled dates", () => {
      const phases: Task[] = [
        { id: "p1", category: "dev", start: "2026-01-01", end: "2026-01-21" },
        { id: "p2", category: "dev", start: "2026-02-01", end: "2026-02-21" },
        { id: "p3", category: "dev", start: "2026-03-01", end: "2026-03-21" }
      ];
      const result = runMonteCarloSimulation(phases, { iterations: 2000, seed: 3 });
      expect(result.baselineDurationDays).toBe(79);
      expect(result.percentiles.P50.durationDays).toBeGreaterThanOrEqual(78);
      expect(result.percentiles.P95.durationDays).toBeGreaterThan(79);
    });

    it("reproduces the resolved plan exactly when estimates carry no variance", () => {
      const plan: Task[] = [
        { id: "a", category: "dev", start: "2026-01-01", end: "2026-01-21", pert: fixed(20) } as Task,
        // FS with the plan's default 2-day gap
        { id: "b", category: "dev", start: "2026-01-23", end: "2026-02-12", dependsOn: "a", pert: fixed(20) } as Task,
        // SS link: starts with b, does not add b's duration
        { id: "c", category: "dev", start: "2026-01-23", end: "2026-02-02", dependsOn: "b:SS", pert: fixed(10) } as Task,
        // Deliberately scheduled later than its link requires: the date is a floor
        { id: "d", category: "dev", start: "2026-03-01", end: "2026-03-05", dependsOn: "b", pert: fixed(4) } as Task
      ];
      const result = runMonteCarloSimulation(plan, { iterations: 100, seed: 1, defaultGapDays: 2 });
      expect(result.baselineDurationDays).toBe(63);
      expect(result.percentiles.P10.durationDays).toBe(63);
      expect(result.percentiles.P99.durationDays).toBe(63);
      expect(result.standardDeviationDays).toBe(0);
    });

    it("does not add durations across SS links", () => {
      const plan: Task[] = [
        { id: "a", category: "dev", start: "2026-01-01", end: "2026-01-21" },
        { id: "b", category: "dev", start: "2026-01-01", end: "2026-01-21", dependsOn: "a:SS" }
      ];
      const result = runMonteCarloSimulation(plan, { iterations: 2000, seed: 9 });
      expect(result.baselineDurationDays).toBe(20);
      expect(result.percentiles.P50.durationDays).toBeLessThan(25);
    });

    it("propagates the default gap on links without explicit lag", () => {
      const plan: Task[] = [
        { id: "a", category: "dev", start: "2026-01-01", end: "2026-01-11", pert: fixed(10) } as Task,
        { id: "b", category: "dev", start: "2026-01-13", end: "2026-01-23", dependsOn: "a", pert: { optimistic: 10, mostLikely: 10, pessimistic: 10 } } as Task
      ];
      const slipped = { ...plan[0], pert: { optimistic: 15, mostLikely: 15, pessimistic: 15 } } as Task;
      const result = runMonteCarloSimulation([slipped, plan[1]], { iterations: 100, seed: 1, defaultGapDays: 2 });
      expect(result.percentiles.P50.durationDays).toBe(27); // 15 + 2 gap + 10
      // Without the option, the resolver's own default gap applies (not 0, which would absorb overruns)
      expect(runMonteCarloSimulation([slipped, plan[1]], { iterations: 100, seed: 1 }).percentiles.P50.durationDays).toBe(27);
    });

    it("keeps the start of tasks marked in progress", () => {
      const plan: Task[] = [
        { id: "a", category: "dev", start: "2026-01-01", end: "2026-01-11", pert: fixed(15) } as Task,
        { id: "b", category: "dev", start: "2026-01-13", end: "2026-01-23", dependsOn: "a", status: "in-progress", pert: fixed(10) } as Task
      ];
      const result = runMonteCarloSimulation(plan, { iterations: 100, seed: 1, defaultGapDays: 2 });
      expect(result.percentiles.P50.durationDays).toBe(22); // b already started on its date
    });

    it("fixes completed work and samples only the remainder of in-progress work", () => {
      const plan: Task[] = [
        { id: "done", category: "dev", start: "2026-01-01", end: "2026-01-11", status: "completed" },
        { id: "half", category: "dev", start: "2026-01-11", end: "2026-01-31", progress: 0.5, dependsOn: "done" },
        { id: "todo", category: "dev", start: "2026-01-11", end: "2026-01-31", dependsOn: "done" }
      ];
      const result = runMonteCarloSimulation(plan, { iterations: 3000, seed: 5 });
      const byId = new Map(result.taskCriticality.map((m) => [m.taskId, m]));
      expect(byId.get("done")!.varianceDays).toBe(0);
      expect(byId.get("done")!.sensitivityIndex).toBe(0);
      expect(byId.get("half")!.varianceDays).toBeLessThan(byId.get("todo")!.varianceDays);
    });
  });

  describe("input hardening", () => {
    const plan: Task[] = [
      { id: "a", category: "dev", start: "2026-01-01", end: "2026-01-06" },
      { id: "b", category: "dev", start: "2026-01-06", end: "2026-01-16", dependsOn: "a" }
    ];

    it("normalizes negative and non-finite seeds (deterministic, no hang)", () => {
      const r1 = runMonteCarloSimulation(plan, { iterations: 200, seed: -1000 });
      const r2 = runMonteCarloSimulation(plan, { iterations: 200, seed: -1000 });
      expect(r1.meanDurationDays).toBe(r2.meanDurationDays);
      expect(Number.isFinite(r1.meanDurationDays)).toBe(true);
      expect(Number.isFinite(runMonteCarloSimulation(plan, { iterations: 200, seed: NaN }).meanDurationDays)).toBe(true);
    });

    it("clamps iterations and histogram bins", () => {
      expect(runMonteCarloSimulation(plan, { iterations: NaN, seed: 1 }).iterations).toBe(2000);
      expect(runMonteCarloSimulation(plan, { iterations: 1e9, seed: 1 }).iterations).toBe(100000);
      expect(runMonteCarloSimulation(plan, { iterations: 10, seed: 1 }).iterations).toBe(50);
      expect(runMonteCarloSimulation(plan, { iterations: 100, histogramBins: NaN, seed: 1 }).histogram).toHaveLength(15);
    });

    it("emits a single consistent bin when every iteration has the same duration", () => {
      const result = runMonteCarloSimulation([{ ...plan[0], pert: { optimistic: 5, mostLikely: 5, pessimistic: 5 } } as Task], {
        iterations: 100,
        seed: 1
      });
      expect(result.histogram).toHaveLength(1);
      expect(result.histogram[0].count).toBe(100);
      expect(result.histogram[0].minDurationDays).toBeLessThanOrEqual(result.histogram[0].maxDurationDays);
    });

    it("throws a descriptive error on dependency cycles", () => {
      const cyclic: Task[] = [
        { id: "a", category: "dev", start: "2026-01-01", end: "2026-01-06", dependsOn: "b" },
        { id: "b", category: "dev", start: "2026-01-06", end: "2026-01-16", dependsOn: "a" },
        { id: "c", category: "dev", start: "2026-01-01", end: "2026-01-04" }
      ];
      expect(() => runMonteCarloSimulation(cyclic, { iterations: 100, seed: 1 })).toThrow(/cycle.*a, b/);
    });
  });
});
