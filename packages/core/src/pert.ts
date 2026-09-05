/**
 * Program Evaluation and Review Technique (PERT) Engine
 *
 * Implements 3-Point probabilistic duration estimation (Beta distribution)
 * and Central Limit Theorem Critical Path risk analysis.
 */

import { Task, CriticalPathResult, PertRiskResult } from "./types";
import { diffDays } from "./date-math";

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

/**
 * Computes 3-point PERT estimate for a single task.
 */
export function estimateTaskPert(optimistic: number, mostLikely: number, pessimistic: number): TaskPertEstimate {
  const o = Math.max(0, optimistic);
  const m = Math.max(o, mostLikely);
  const p = Math.max(m, pessimistic);

  const expected = (o + 4 * m + p) / 6;
  const standardDeviation = (p - o) / 6;
  const variance = Math.pow(standardDeviation, 2);

  return {
    optimistic: o,
    mostLikely: m,
    pessimistic: p,
    expected: Math.round(expected * 100) / 100,
    standardDeviation: Math.round(standardDeviation * 100) / 100,
    variance: Math.round(variance * 100) / 100
  };
}

/**
 * Analyzes probabilistic completion risk across the critical path.
 *
 * @param tasks - The array of tasks.
 * @param criticalResult - Pre-computed CPM result.
 * @param targetDate - Optional contractual target deadline date.
 * @returns Probabilistic expected duration, variance, and deadline confidence.
 */
export function calculatePertRisk(
  tasks: Task[],
  criticalResult: CriticalPathResult,
  targetDate?: string
): PertRiskResult {
  if (!tasks || tasks.length === 0) {
    return {
      expectedProjectDurationDays: 0,
      standardDeviationDays: 0,
      varianceDays: 0,
      confidencePercentages: {
        targetDate,
        onTimeProbability: 1.0
      }
    };
  }

  const byId = new Map<string, Task>();
  tasks.forEach((t) => byId.set(t.id, t));

  // Identify the primary critical path
  const primaryPath = criticalResult.criticalPaths.length > 0
    ? criticalResult.criticalPaths[0]
    : Array.from(criticalResult.criticalTaskIds);

  let totalExpectedDuration = 0;
  let totalVariance = 0;

  primaryPath.forEach((taskId) => {
    const t = byId.get(taskId);
    if (!t) return;
    const dur = Math.max(1, diffDays(t.start, t.end));

    // Look for explicit 3-point estimates in fields or default to standard PM heuristic
    // (O = 0.8 * dur, M = dur, P = 1.4 * dur)
    const o = typeof t.fields?.optimisticDuration === "number"
      ? t.fields.optimisticDuration
      : Math.round(dur * 0.85);
    const m = typeof t.fields?.mostLikelyDuration === "number"
      ? t.fields.mostLikelyDuration
      : dur;
    const p = typeof t.fields?.pessimisticDuration === "number"
      ? t.fields.pessimisticDuration
      : Math.round(dur * 1.35);

    const est = estimateTaskPert(o, m, p);
    totalExpectedDuration += est.expected;
    totalVariance += est.variance;
  });

  const standardDeviationDays = Math.round(Math.sqrt(totalVariance) * 100) / 100;

  // Compute confidence for target deadline if available
  let onTimeProbability = 0.95;
  if (targetDate && criticalResult.projectEarlyFinish) {
    const targetSlack = diffDays(criticalResult.projectEarlyFinish, targetDate);
    if (standardDeviationDays > 0) {
      const z = targetSlack / standardDeviationDays;
      onTimeProbability = Math.round(normalCdf(z) * 1000) / 1000;
    } else {
      onTimeProbability = targetSlack >= 0 ? 1.0 : 0.0;
    }
  }

  return {
    expectedProjectDurationDays: Math.round(totalExpectedDuration * 10) / 10,
    standardDeviationDays,
    varianceDays: Math.round(totalVariance * 10) / 10,
    confidencePercentages: {
      targetDate,
      onTimeProbability
    }
  };
}
