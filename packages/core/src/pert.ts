/**
 * Program Evaluation and Review Technique (PERT) Engine
 *
 * Implements 3-Point probabilistic duration estimation (Beta distribution)
 * and Central Limit Theorem Critical Path risk analysis.
 */

import { Task, CriticalPathResult, PertRiskResult } from "./types";
import { toEpochDay, diffDays, isValidISODate } from "./date-math";
import { getTaskPertBounds } from "./monte-carlo";

/**
 * Normal CDF approximation (Abramowitz and Stegun formula 7.1.26)
 */
function normalCdf(z: number): number {
  if (z < -6) return 0;
  if (z > 6) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * erf);
}

export interface TaskPertEstimate {
  optimistic: number; // O
  mostLikely: number; // M
  pessimistic: number; // P
  expected: number; // mu = (O + 4M + P) / 6
  variance: number; // sigma^2 = ((P - O) / 6)^2
  standardDeviation: number; // sigma = (P - O) / 6
}

/** Planned duration of a non-milestone task (end - start days; inverted ranges are 0). */
function plannedDurationDays(task: Task): number {
  const days = toEpochDay(task.end) - toEpochDay(task.start);
  return Math.max(0, Number.isFinite(days) ? days : diffDays(task.start, task.end));
}

/** Unrounded PERT statistics; rounding is applied only to reported values. */
function pertStatistics(optimistic: number, mostLikely: number, pessimistic: number): TaskPertEstimate {
  const o = Math.max(0, optimistic);
  const m = Math.max(o, mostLikely);
  const p = Math.max(m, pessimistic);
  const standardDeviation = (p - o) / 6;
  return {
    optimistic: o,
    mostLikely: m,
    pessimistic: p,
    expected: (o + 4 * m + p) / 6,
    standardDeviation,
    variance: standardDeviation * standardDeviation
  };
}

function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

/**
 * Computes 3-point PERT estimate for a single task (statistics rounded to 2 decimals for display).
 */
export function estimateTaskPert(optimistic: number, mostLikely: number, pessimistic: number): TaskPertEstimate {
  const est = pertStatistics(optimistic, mostLikely, pessimistic);
  return {
    optimistic: est.optimistic,
    mostLikely: est.mostLikely,
    pessimistic: est.pessimistic,
    expected: round(est.expected, 2),
    standardDeviation: round(est.standardDeviation, 2),
    variance: round(est.variance, 2)
  };
}

/**
 * Analyzes probabilistic completion risk across the critical path.
 *
 * Uses the critical path with the highest variance. Its expected finish is the path's planned
 * finish shifted by (sum of PERT expected durations - sum of planned durations), so the gaps and
 * lags along the path are kept. The on-time probability compares that expected finish with
 * `targetDate`, or with the planned project finish when no valid target is given.
 *
 * @param tasks - The array of tasks.
 * @param criticalResult - Pre-computed CPM result.
 * @param targetDate - Optional contractual target deadline date (YYYY-MM-DD).
 * @returns Probabilistic expected duration, variance, and deadline confidence.
 */
export function calculatePertRisk(
  tasks: Task[],
  criticalResult: CriticalPathResult,
  targetDate?: string
): PertRiskResult {
  const validTarget = typeof targetDate === "string" && isValidISODate(targetDate) ? targetDate : undefined;
  if (!tasks || tasks.length === 0) {
    return {
      expectedProjectDurationDays: 0,
      standardDeviationDays: 0,
      varianceDays: 0,
      confidencePercentages: {
        targetDate: validTarget,
        onTimeProbability: 1.0
      }
    };
  }

  const byId = new Map<string, Task>();
  tasks.forEach((t) => {
    if (t && !t._deleted && !byId.has(t.id)) byId.set(t.id, t);
  });

  // Candidate paths: the enumerated critical paths, or the critical set in chronological order
  const candidatePaths = criticalResult.criticalPaths.length > 0
    ? criticalResult.criticalPaths
    : [
        Array.from(criticalResult.criticalTaskIds).sort((a, b) =>
          (byId.get(a)?.start || "").localeCompare(byId.get(b)?.start || "")
        )
      ];

  let best = { expected: 0, planned: 0, variance: -1, path: [] as string[] };
  for (const path of candidatePaths) {
    let expected = 0;
    let planned = 0;
    let variance = 0;
    for (const taskId of path) {
      const t = byId.get(taskId);
      // Milestones take no time in the CPM, so they add neither duration nor uncertainty
      if (!t || t.milestone) continue;
      // Same estimate shapes and default spread (-20% / +35%) as the Monte Carlo engine
      const estimate = getTaskPertBounds(t);
      const stats = pertStatistics(estimate.optimistic, estimate.mostLikely, estimate.pessimistic);
      expected += stats.expected;
      variance += stats.variance;
      planned += plannedDurationDays(t);
    }
    if (variance > best.variance) best = { expected, planned, variance, path };
  }

  // Planned span of the chosen path (includes gaps/lags), from CPM metrics when available
  const first = best.path.length > 0 ? criticalResult.metrics.get(best.path[0]) : undefined;
  const last = best.path.length > 0 ? criticalResult.metrics.get(best.path[best.path.length - 1]) : undefined;
  const plannedSpan = first && last ? toEpochDay(last.earlyFinish) - toEpochDay(first.earlyStart) : NaN;
  const pertDelta = best.expected - best.planned;
  const expectedDuration = Number.isFinite(plannedSpan) ? plannedSpan + pertDelta : best.expected;

  const totalVariance = Math.max(0, best.variance);
  const sigma = Math.sqrt(totalVariance);
  const plannedFinish = last?.earlyFinish || criticalResult.projectEarlyFinish;
  const reference = validTarget || criticalResult.projectEarlyFinish;

  let onTimeProbability = 1.0;
  if (plannedFinish && reference) {
    // Days between the reference date and the PERT-expected finish of the path
    const slack = toEpochDay(reference) - (toEpochDay(plannedFinish) + pertDelta);
    if (Number.isFinite(slack)) {
      onTimeProbability = sigma > 0 ? round(normalCdf(slack / sigma), 3) : slack >= 0 ? 1.0 : 0.0;
    }
  }

  return {
    expectedProjectDurationDays: round(expectedDuration, 1),
    standardDeviationDays: round(sigma, 2),
    varianceDays: round(totalVariance, 1),
    confidencePercentages: {
      targetDate: validTarget,
      onTimeProbability
    }
  };
}
