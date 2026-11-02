/**
 * Monte Carlo Schedule Risk Analysis Engine
 *
 * Simulates thousands of probabilistic schedule outcomes using Beta-PERT
 * and Triangular stochastic distributions to calculate P-value confidence percentiles,
 * Task Criticality Indexes, Pearson Sensitivity Tornado metrics, and frequency histograms.
 * Strictly zero external dependencies.
 */

import { Task } from "./types";
import { addDays, diffDays } from "./date-math";
import { getTaskDependencyRelations } from "./dependencies";

export interface TaskPertDistribution {
  optimistic: number; // O (days)
  mostLikely: number; // M (days)
  pessimistic: number; // P (days)
}

export interface MonteCarloOptions {
  /** Number of simulation iterations to execute (default: 2000, recommended: 1000 - 5000). */
  iterations?: number;
  /** Probability distribution algorithm (default: 'beta-pert'). */
  distribution?: "beta-pert" | "triangular";
  /** Fallback optimistic variance fraction if task has no explicit PERT (default: 0.20 = -20%). */
  defaultOptimisticVariance?: number;
  /** Fallback pessimistic variance fraction if task has no explicit PERT (default: 0.35 = +35%). */
  defaultPessimisticVariance?: number;
  /** Number of bins in the output distribution histogram (default: 15). */
  histogramBins?: number;
  /** Optional deterministic random seed generator for reproducible tests. */
  seed?: number;
}

export interface PercentileResult {
  percentile: number; // e.g. 50, 80, 90
  durationDays: number;
  completionDate: string; // YYYY-MM-DD
}

export interface TaskCriticalityMetric {
  taskId: string;
  label: string;
  criticalityIndex: number; // 0.0 to 100.0 (% of iterations where this task was critical)
  sensitivityIndex: number; // Pearson correlation (-1.0 to 1.0) with total project duration
  meanDurationDays: number;
  varianceDays: number;
}

export interface HistogramBin {
  binIndex: number;
  minDurationDays: number;
  maxDurationDays: number;
  startDate: string;
  endDate: string;
  count: number;
  frequency: number; // 0.0 to 1.0
  cumulativeFrequency: number; // 0.0 to 1.0
}

export interface MonteCarloResult {
  iterations: number;
  baselineDurationDays: number;
  baselineCompletionDate: string;
  meanDurationDays: number;
  meanCompletionDate: string;
  standardDeviationDays: number;
  percentiles: Record<string, PercentileResult>; // P10, P25, P50, P75, P80, P90, P95, P99
  taskCriticality: TaskCriticalityMetric[];
  tornadoRanking: TaskCriticalityMetric[]; // Ranked by sensitivity index descending
  histogram: HistogramBin[];
}

/**
 * Linear Congruential Generator (LCG) for deterministic, fast pseudo-random numbers when seed is given.
 */
class PseudoRng {
  private state: number;

  constructor(seed?: number) {
    this.state = seed !== undefined ? seed : Math.floor(Math.random() * 2147483647);
  }

  public next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
}

/**
 * Samples a random variate from a Triangular distribution on [a, b] with mode m.
 */
export function sampleTriangular(a: number, m: number, b: number, rng: () => number): number {
  if (a >= b) return a;
  const safeM = Math.max(a, Math.min(m, b));
  const u = rng();
  const f = (safeM - a) / (b - a);

  if (u < f) {
    return a + Math.sqrt(u * (b - a) * (safeM - a));
  } else {
    return b - Math.sqrt((1 - u) * (b - a) * (b - safeM));
  }
}

/**
 * Samples a random variate from a standard Gamma(alpha, 1) distribution using Marsaglia and Tsang method.
 */
function sampleGamma(alpha: number, rng: () => number): number {
  if (alpha < 1) {
    // Johnk's generator or boost property: Gamma(alpha) = Gamma(alpha + 1) * U^(1/alpha)
    return sampleGamma(alpha + 1, rng) * Math.pow(rng(), 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let z = 0;
    let v = 0;
    do {
      // Box-Muller standard normal
      const u1 = rng();
      const u2 = rng();
      z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * z;
    } while (v <= 0);

    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * z * z * z * z) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Samples a random variate from a Beta-PERT distribution on [a, b] with mode m.
 */
export function sampleBetaPert(a: number, m: number, b: number, rng: () => number): number {
  if (a >= b) return a;
  const safeM = Math.max(a, Math.min(m, b));
  const mu = (a + 4 * safeM + b) / 6;
  const range = b - a;
  if (range <= 0.0001) return a;

  let alpha = ((mu - a) / range) * (6 * (mu - a) * (b - mu) / (range * range) - 1);
  let beta = alpha * (b - mu) / (mu - a);

  if (alpha <= 0 || beta <= 0 || !Number.isFinite(alpha) || !Number.isFinite(beta)) {
    // Fallback to Triangular if parameters degenerate
    return sampleTriangular(a, safeM, b, rng);
  }

  const ga = sampleGamma(alpha, rng);
  const gb = sampleGamma(beta, rng);
  const sum = ga + gb;
  const betaSample = sum > 0 ? ga / sum : 0.5;

  return a + betaSample * range;
}

/**
 * Extracts 3-point PERT bounds for a task.
 */
export function getTaskPertBounds(
  task: Task,
  defaultOptVariance = 0.2,
  defaultPessVariance = 0.35
): TaskPertDistribution {
  const dur = Math.max(0, diffDays(task.start, task.end));

  // 1. Direct task.pert object or fields.pert
  const pertObj = (task as any).pert || (task.fields && (task.fields as any).pert);
  if (pertObj && typeof pertObj === "object") {
    const o = Number(pertObj.optimistic);
    const m = Number(pertObj.mostLikely ?? dur);
    const p = Number(pertObj.pessimistic);
    if (!isNaN(o) && !isNaN(m) && !isNaN(p)) {
      return {
        optimistic: Math.max(0, o),
        mostLikely: Math.max(o, m),
        pessimistic: Math.max(m, p)
      };
    }
  }

  // 2. Direct properties task.optimistic / task.pessimistic
  const rawO = Number((task as any).optimistic ?? (task.fields as any)?.optimistic);
  const rawP = Number((task as any).pessimistic ?? (task.fields as any)?.pessimistic);
  if (!isNaN(rawO) && !isNaN(rawP) && rawP >= rawO) {
    return {
      optimistic: Math.max(0, rawO),
      mostLikely: dur,
      pessimistic: Math.max(dur, rawP)
    };
  }

  // 3. Fallback percentage variance
  const o = Math.max(0, Math.round(dur * (1 - defaultOptVariance)));
  const p = Math.max(dur, Math.round(dur * (1 + defaultPessVariance)));
  return {
    optimistic: o,
    mostLikely: dur,
    pessimistic: p
  };
}

/**
 * Runs Monte Carlo Schedule Risk Simulation.
 */
export function runMonteCarloSimulation(
  tasks: Task[],
  options?: MonteCarloOptions
): MonteCarloResult {
  const liveTasks = (tasks || []).filter((t) => !t._deleted);
  if (liveTasks.length === 0) {
    return {
      iterations: 0,
      baselineDurationDays: 0,
      baselineCompletionDate: "",
      meanDurationDays: 0,
      meanCompletionDate: "",
      standardDeviationDays: 0,
      percentiles: {},
      taskCriticality: [],
      tornadoRanking: [],
      histogram: []
    };
  }

  const iterations = Math.max(50, options?.iterations ?? 2000);
  const useBeta = (options?.distribution || "beta-pert") === "beta-pert";
  const prng = new PseudoRng(options?.seed);
  const rng = () => prng.next();

  // Find baseline project start and finish
  let projectStartDate = liveTasks[0].start;
  let baselineFinishDate = liveTasks[0].end;
  for (const t of liveTasks) {
    if (diffDays(t.start, projectStartDate) > 0) projectStartDate = t.start;
    if (diffDays(baselineFinishDate, t.end) > 0) baselineFinishDate = t.end;
  }
  const baselineDurationDays = Math.max(0, diffDays(projectStartDate, baselineFinishDate));

  // Build indexed graph structures for maximum simulation speed
  const n = liveTasks.length;
  const idToIndex = new Map<string, number>();
  liveTasks.forEach((t, i) => idToIndex.set(t.id, i));

  const bounds: TaskPertDistribution[] = liveTasks.map((t) =>
    getTaskPertBounds(t, options?.defaultOptimisticVariance, options?.defaultPessimisticVariance)
  );

  // Predecessor edges with lags: predecessors[i] = Array<{ predIndex, lag }>
  const predecessors: Array<Array<{ predIndex: number; lag: number }>> = liveTasks.map(() => []);
  const successors: Array<Array<{ succIndex: number; lag: number }>> = liveTasks.map(() => []);
  const inDegree: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const t = liveTasks[i];
    const rels = getTaskDependencyRelations(t);
    for (const rel of rels) {
      const pIdx = idToIndex.get(rel.id);
      if (pIdx !== undefined && pIdx !== i) {
        predecessors[i].push({ predIndex: pIdx, lag: rel.lagDays });
        successors[pIdx].push({ succIndex: i, lag: rel.lagDays });
        inDegree[i]++;
      }
    }
  }

  // Kahn's algorithm for topological order
  const queue: number[] = [];
  const inDegreeCopy = [...inDegree];
  for (let i = 0; i < n; i++) {
    if (inDegreeCopy[i] === 0) queue.push(i);
  }

  const topoOrder: number[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const edge of successors[curr]) {
      inDegreeCopy[edge.succIndex]--;
      if (inDegreeCopy[edge.succIndex] === 0) {
        queue.push(edge.succIndex);
      }
    }
  }

  // Reverse topological order for backward pass
  const reverseTopoOrder = [...topoOrder].reverse();

  // Storage for simulation outputs
  const iterationDurations: number[] = new Float64Array(iterations) as any;
  const criticalCounts: number[] = new Uint32Array(n) as any;
  const taskSampleSums: number[] = new Float64Array(n) as any;
  const taskSampleSqSums: number[] = new Float64Array(n) as any;
  const taskCovarianceSums: number[] = new Float64Array(n) as any; // Sum(x_i * Y) for Pearson correlation

  const sampledDurations = new Float64Array(n);
  const es = new Float64Array(n);
  const ef = new Float64Array(n);
  const lf = new Float64Array(n);
  const ls = new Float64Array(n);

  // Execute Monte Carlo simulation loops
  for (let iter = 0; iter < iterations; iter++) {
    // 1. Sample durations
    for (let i = 0; i < n; i++) {
      const b = bounds[i];
      const s = useBeta
        ? sampleBetaPert(b.optimistic, b.mostLikely, b.pessimistic, rng)
        : sampleTriangular(b.optimistic, b.mostLikely, b.pessimistic, rng);
      sampledDurations[i] = s;
      taskSampleSums[i] += s;
      taskSampleSqSums[i] += s * s;
    }

    // 2. Forward pass (ES, EF)
    let projectFinish = 0;
    for (const u of topoOrder) {
      let maxPredEf = 0;
      const preds = predecessors[u];
      for (let j = 0; j < preds.length; j++) {
        const edge = preds[j];
        const val = ef[edge.predIndex] + edge.lag;
        if (val > maxPredEf) maxPredEf = val;
      }
      es[u] = maxPredEf;
      ef[u] = maxPredEf + sampledDurations[u];
      if (ef[u] > projectFinish) projectFinish = ef[u];
    }

    iterationDurations[iter] = projectFinish;

    // 3. Backward pass (LF, LS, TF)
    for (const u of reverseTopoOrder) {
      const succs = successors[u];
      if (succs.length === 0) {
        lf[u] = projectFinish;
      } else {
        let minSuccLs = Infinity;
        for (let j = 0; j < succs.length; j++) {
          const edge = succs[j];
          const val = ls[edge.succIndex] - edge.lag;
          if (val < minSuccLs) minSuccLs = val;
        }
        lf[u] = minSuccLs;
      }
      ls[u] = lf[u] - sampledDurations[u];
      const tf = ls[u] - es[u];

      // Criticality check (float <= epsilon)
      if (tf <= 0.001) {
        criticalCounts[u]++;
      }

      taskCovarianceSums[u] += sampledDurations[u] * projectFinish;
    }
  }

  // Statistical calculations
  let sumDur = 0;
  for (let i = 0; i < iterations; i++) {
    sumDur += iterationDurations[i];
  }
  const meanDuration = sumDur / iterations;

  let sumSqDiff = 0;
  for (let i = 0; i < iterations; i++) {
    sumSqDiff += Math.pow(iterationDurations[i] - meanDuration, 2);
  }
  const varianceDuration = sumSqDiff / (iterations - 1 || 1);
  const stdDevDuration = Math.sqrt(varianceDuration);

  // Percentiles calculation (sort durations array)
  const sortedDurations = Array.from(iterationDurations).sort((a, b) => a - b);
  const getPercentile = (p: number): PercentileResult => {
    const idx = Math.min(sortedDurations.length - 1, Math.max(0, Math.round((p / 100) * (sortedDurations.length - 1))));
    const durationDays = Math.round(sortedDurations[idx] * 10) / 10;
    const completionDate = addDays(projectStartDate, Math.round(durationDays));
    return { percentile: p, durationDays, completionDate };
  };

  const percentiles: Record<string, PercentileResult> = {
    P10: getPercentile(10),
    P25: getPercentile(25),
    P50: getPercentile(50),
    P75: getPercentile(75),
    P80: getPercentile(80),
    P90: getPercentile(90),
    P95: getPercentile(95),
    P99: getPercentile(99)
  };

  // Criticality & Sensitivity (Pearson Correlation)
  const taskCriticality: TaskCriticalityMetric[] = [];
  for (let i = 0; i < n; i++) {
    const task = liveTasks[i];
    const critIndex = Math.round((criticalCounts[i] / iterations) * 1000) / 10; // e.g. 74.5%

    const tMean = taskSampleSums[i] / iterations;
    const tVar = Math.max(0, taskSampleSqSums[i] / iterations - tMean * tMean);
    const tStd = Math.sqrt(tVar);

    // Pearson r = (E[XY] - E[X]E[Y]) / (sigma_X * sigma_Y)
    const cov = taskCovarianceSums[i] / iterations - tMean * meanDuration;
    const denominator = tStd * stdDevDuration;
    const sensitivity = denominator > 0.00001 ? Math.min(1.0, Math.max(-1.0, cov / denominator)) : 0;

    taskCriticality.push({
      taskId: task.id,
      label: task.label || task.name || task.id,
      criticalityIndex: critIndex,
      sensitivityIndex: Math.round(sensitivity * 100) / 100,
      meanDurationDays: Math.round(tMean * 10) / 10,
      varianceDays: Math.round(tVar * 10) / 10
    });
  }

  // Tornado ranking: sort by sensitivity index descending
  const tornadoRanking = [...taskCriticality].sort(
    (a, b) => b.sensitivityIndex - a.sensitivityIndex || b.criticalityIndex - a.criticalityIndex
  );

  // Distribution Histogram
  const numBins = Math.max(5, Math.min(50, options?.histogramBins ?? 15));
  const minDur = sortedDurations[0];
  const maxDur = sortedDurations[sortedDurations.length - 1];
  const binWidth = (maxDur - minDur) / numBins || 1;

  const histogram: HistogramBin[] = [];
  let runningCount = 0;

  for (let b = 0; b < numBins; b++) {
    const bMin = minDur + b * binWidth;
    const bMax = b === numBins - 1 ? maxDur : bMin + binWidth;
    let bCount = 0;

    for (let i = 0; i < sortedDurations.length; i++) {
      const val = sortedDurations[i];
      if (b === numBins - 1) {
        if (val >= bMin && val <= bMax) bCount++;
      } else {
        if (val >= bMin && val < bMax) bCount++;
      }
    }

    runningCount += bCount;
    histogram.push({
      binIndex: b,
      minDurationDays: Math.round(bMin * 10) / 10,
      maxDurationDays: Math.round(bMax * 10) / 10,
      startDate: addDays(projectStartDate, Math.round(bMin)),
      endDate: addDays(projectStartDate, Math.round(bMax)),
      count: bCount,
      frequency: Math.round((bCount / iterations) * 1000) / 1000,
      cumulativeFrequency: Math.round((runningCount / iterations) * 1000) / 1000
    });
  }

  return {
    iterations,
    baselineDurationDays,
    baselineCompletionDate: baselineFinishDate,
    meanDurationDays: Math.round(meanDuration * 10) / 10,
    meanCompletionDate: addDays(projectStartDate, Math.round(meanDuration)),
    standardDeviationDays: Math.round(stdDevDuration * 10) / 10,
    percentiles,
    taskCriticality,
    tornadoRanking,
    histogram
  };
}
