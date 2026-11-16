/**
 * Monte Carlo Schedule Risk Analysis Engine
 *
 * Simulates thousands of probabilistic schedule outcomes using Beta-PERT
 * and Triangular stochastic distributions to calculate P-value confidence percentiles,
 * Task Criticality Indexes, Pearson Sensitivity Tornado metrics, and frequency histograms.
 *
 * Scheduling semantics mirror the deterministic engine (CascadeResolveStage):
 * - A task without predecessors starts on its scheduled date. A linked task follows its
 *   predecessors as soon as possible, unless it was deliberately scheduled later than its links
 *   require: that date is then kept as a start-no-earlier-than floor. A zero-variance run
 *   therefore reproduces the resolved plan exactly.
 * - FS / SS / FF / SF links with lead & lag (shared `resolveRelationLag` /
 *   `relationEarliestStartDay` rules): an FS link without explicit lag uses the task's gap
 *   (`gapDays`/`minGapDays`) or `options.defaultGapDays`.
 * - Locked, started and completed tasks keep their start date. Completed work is fixed and
 *   in-progress work only samples its remaining share.
 * Strictly zero external dependencies.
 */

import { Task } from "./types";
import { addDays, diffDays } from "./date-math";
import {
  getTaskDependencyRelations,
  relationEarliestStartDay,
  resolveRelationLag,
  DependencyType
} from "./dependencies";
import { getEffectiveGap, isTaskDone } from "./utils";
import { DEFAULT_GAP_DAYS } from "./constants";

export interface TaskPertDistribution {
  optimistic: number; // O (days)
  mostLikely: number; // M (days)
  pessimistic: number; // P (days)
}

export interface MonteCarloOptions {
  /** Number of simulation iterations (default: 2000, clamped to 50 - 100,000). */
  iterations?: number;
  /** Probability distribution algorithm (default: 'beta-pert'). */
  distribution?: "beta-pert" | "triangular";
  /** Optimistic variance fraction used when a task sets no optimistic estimate (default: 0.20 = -20%, clamped to 0 - 1). */
  defaultOptimisticVariance?: number;
  /** Pessimistic variance fraction used when a task sets no pessimistic estimate (default: 0.35 = +35%, clamped to 0 - 10). */
  defaultPessimisticVariance?: number;
  /** Number of bins in the output distribution histogram (default: 15, clamped to 5 - 50). */
  histogramBins?: number;
  /** Optional deterministic random seed for reproducible runs (any finite number). */
  seed?: number;
  /**
   * Gap (days) applied to FS links without an explicit lag, exactly like the schedule resolver.
   * Pass `meta.defaultGapDays` so simulated overruns propagate like the real cascade
   * (default: DEFAULT_GAP_DAYS, the resolver's own default).
   */
  defaultGapDays?: number;
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
  /** Sorted by criticality index descending (ties: sensitivity descending, then plan order). */
  taskCriticality: TaskCriticalityMetric[];
  tornadoRanking: TaskCriticalityMetric[]; // Ranked by sensitivity index descending
  histogram: HistogramBin[];
}

const DEFAULT_ITERATIONS = 2000;
const MIN_ITERATIONS = 50;
const MAX_ITERATIONS = 100000;
const DEFAULT_HISTOGRAM_BINS = 15;
const MIN_HISTOGRAM_BINS = 5;
const MAX_HISTOGRAM_BINS = 50;
/** Rejection-sampling attempts before sampleGamma gives up (only reachable with a broken RNG). */
const MAX_GAMMA_ATTEMPTS = 1000;
const CRITICAL_FLOAT_EPSILON = 0.001;

/** Clamps a numeric option to an integer range, falling back when it is missing or not finite. */
function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Mulberry32 generator: fast, deterministic and well distributed in [0, 1).
 * Any finite seed (negative or fractional included) is normalized to a uint32 state.
 */
class PseudoRng {
  private state: number;

  constructor(seed?: number) {
    this.state =
      typeof seed === "number" && Number.isFinite(seed)
        ? Math.trunc(seed) >>> 0
        : Math.floor(Math.random() * 4294967296) >>> 0;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/**
 * Samples a random variate from a Triangular distribution on [a, b] with mode m.
 */
export function sampleTriangular(a: number, m: number, b: number, rng: () => number): number {
  if (!(b > a)) return a;
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
 * Samples a random variate from a standard Gamma(alpha, 1) distribution using the
 * Marsaglia and Tsang method. Bounded: a degenerate RNG returns the mean instead of hanging.
 */
function sampleGamma(alpha: number, rng: () => number): number {
  if (alpha < 1) {
    // Boost property: Gamma(alpha) = Gamma(alpha + 1) * U^(1/alpha)
    const u = rng();
    return sampleGamma(alpha + 1, rng) * Math.pow(u > 0 ? u : Number.MIN_VALUE, 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < MAX_GAMMA_ATTEMPTS; attempt++) {
    // Box-Muller standard normal
    const u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1 > 0 ? u1 : 1e-12)) * Math.cos(2 * Math.PI * u2);
    let v = 1 + c * z;
    if (!(v > 0)) continue; // also rejects NaN from a broken RNG

    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * z * z * z * z) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
  return alpha;
}

/**
 * Samples a random variate from a Beta-PERT distribution on [a, b] with mode m
 * (standard PERT shape, lambda = 4: mean = (a + 4m + b) / 6).
 */
export function sampleBetaPert(a: number, m: number, b: number, rng: () => number): number {
  const range = b - a;
  if (!(range > 0.0001)) return a;
  const mode = Math.max(a, Math.min(m, b));
  const alpha = 1 + (4 * (mode - a)) / range;
  const beta = 1 + (4 * (b - mode)) / range;

  const ga = sampleGamma(alpha, rng);
  const gb = sampleGamma(beta, rng);
  const sum = ga + gb;
  const fraction = sum > 0 ? ga / sum : alpha / (alpha + beta);

  return a + Math.min(1, Math.max(0, fraction)) * range;
}

/** Reads a numeric estimate; blanks, null and non-numeric values are rejected (NaN). */
function readEstimate(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

/** Returns the first finite estimate among the candidates (NaN when none). */
function firstEstimate(...values: unknown[]): number {
  for (const value of values) {
    const n = readEstimate(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/** Orders three-point bounds so that 0 <= O <= M <= P, each clamp using the previous clamped value. */
function orderedBounds(o: number, m: number, p: number): TaskPertDistribution {
  const optimistic = Math.max(0, o);
  const mostLikely = Math.max(optimistic, m);
  return { optimistic, mostLikely, pessimistic: Math.max(mostLikely, p) };
}

/**
 * Extracts 3-point PERT bounds (days) for a task.
 *
 * Single source of truth for three-point estimates: the PERT risk engine (`calculatePertRisk`)
 * reads them through this function too, so both engines agree. Most specific first:
 * 1. `task.pert` / `fields.pert` = { optimistic, mostLikely?, pessimistic }
 * 2. `fields.optimisticDuration` / `mostLikelyDuration` / `pessimisticDuration`
 * 3. `optimistic` / `mostLikely` / `pessimistic` on the task or in `fields`
 * Each missing or invalid value falls back on its own: O and P to the variance spread around the
 * scheduled duration (unrounded, so short tasks keep uncertainty) and M to the duration.
 * The result is ordered so that 0 <= O <= M <= P.
 */
export function getTaskPertBounds(
  task: Task,
  defaultOptVariance = 0.2,
  defaultPessVariance = 0.35
): TaskPertDistribution {
  const dur = Math.max(0, diffDays(task.start, task.end));
  const fields = (task.fields && typeof task.fields === "object" ? task.fields : {}) as Record<string, unknown>;
  const pertObj = [task.pert, fields.pert].find((v) => v && typeof v === "object") as
    | Record<string, unknown>
    | undefined;

  const o = firstEstimate(pertObj?.optimistic, fields.optimisticDuration, task.optimistic, fields.optimistic);
  const m = firstEstimate(pertObj?.mostLikely, fields.mostLikelyDuration, task.mostLikely, fields.mostLikely);
  const p = firstEstimate(pertObj?.pessimistic, fields.pessimisticDuration, task.pessimistic, fields.pessimistic);

  const optVar = Number.isFinite(defaultOptVariance) ? Math.min(1, Math.max(0, defaultOptVariance)) : 0.2;
  const pessVar = Number.isFinite(defaultPessVariance) ? Math.min(10, Math.max(0, defaultPessVariance)) : 0.35;
  return orderedBounds(
    Number.isFinite(o) ? o : dur * (1 - optVar),
    Number.isFinite(m) ? m : dur,
    Number.isFinite(p) ? p : dur * (1 + pessVar)
  );
}

interface SimEdge {
  node: number; // predecessor index (in `predecessors`) or successor index (in `successors`)
  type: DependencyType;
  lag: number;
}

/**
 * Runs Monte Carlo Schedule Risk Simulation.
 *
 * @throws Error when the dependency network contains a cycle (the schedule is undefined).
 */
export function runMonteCarloSimulation(
  tasks: Task[],
  options?: MonteCarloOptions
): MonteCarloResult {
  const liveTasks = (Array.isArray(tasks) ? tasks : []).filter((t) => t && !t._deleted);
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

  const iterations = clampInteger(options?.iterations, MIN_ITERATIONS, MAX_ITERATIONS, DEFAULT_ITERATIONS);
  const numBins = clampInteger(options?.histogramBins, MIN_HISTOGRAM_BINS, MAX_HISTOGRAM_BINS, DEFAULT_HISTOGRAM_BINS);
  const defaultGapDays =
    typeof options?.defaultGapDays === "number" && Number.isFinite(options.defaultGapDays)
      ? options.defaultGapDays
      : DEFAULT_GAP_DAYS;
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

  const startOffset = new Float64Array(n); // scheduled start, days after project start
  const plannedDays = new Float64Array(n); // scheduled duration
  const startFloor = new Float64Array(n); // earliest allowed start (-Infinity: links alone decide)
  const fixedDays = new Float64Array(n); // completed share of the planned duration (no uncertainty)
  const remainingShare = new Float64Array(n); // share of the estimate still to be sampled
  const anchored = new Uint8Array(n); // 1 = start is fixed (locked, started or completed)

  const predecessors: SimEdge[][] = liveTasks.map(() => []);
  const successors: SimEdge[][] = liveTasks.map(() => []);
  const inDegree = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const t = liveTasks[i];
    const plannedDur = Math.max(0, diffDays(t.start, t.end));
    const rawProgress = typeof t.progress === "number" && Number.isFinite(t.progress) ? t.progress : 0;
    const progress = isTaskDone(t) ? 1 : Math.min(1, Math.max(0, rawProgress));

    startOffset[i] = diffDays(projectStartDate, t.start);
    plannedDays[i] = plannedDur;
    fixedDays[i] = plannedDur * progress;
    remainingShare[i] = 1 - progress;
    anchored[i] = t.locked || progress > 0 || t.status === "in-progress" ? 1 : 0;

    for (const rel of getTaskDependencyRelations(t, idToIndex)) {
      const pIdx = idToIndex.get(rel.id);
      if (pIdx === undefined || pIdx === i) continue;
      const lag = resolveRelationLag(rel, getEffectiveGap(t, defaultGapDays));
      predecessors[i].push({ node: pIdx, type: rel.type, lag });
      successors[pIdx].push({ node: i, type: rel.type, lag });
      inDegree[i]++;
    }
  }

  // Kahn's algorithm for topological order
  const topoOrder = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) topoOrder[tail++] = i;
  }
  while (head < tail) {
    const curr = topoOrder[head++];
    for (const edge of successors[curr]) {
      if (--inDegree[edge.node] === 0) topoOrder[tail++] = edge.node;
    }
  }
  if (tail < n) {
    const blocked = liveTasks.filter((_, i) => inDegree[i] > 0).map((t) => t.id);
    const listed = blocked.slice(0, 10).join(", ") + (blocked.length > 10 ? `, +${blocked.length - 10} more` : "");
    throw new Error(
      `Monte Carlo simulation aborted: dependency cycle detected. Tasks in or downstream of the cycle: ${listed}`
    );
  }

  // Start floors: scheduled dates bind unlinked, anchored and deliberately delayed tasks
  for (let i = 0; i < n; i++) {
    const preds = predecessors[i];
    if (anchored[i] || preds.length === 0) {
      startFloor[i] = startOffset[i];
      continue;
    }
    let networkStart = -Infinity;
    for (const edge of preds) {
      const p = edge.node;
      const candidate = relationEarliestStartDay(
        edge.type, startOffset[p], startOffset[p] + plannedDays[p], plannedDays[i], edge.lag
      );
      if (candidate > networkStart) networkStart = candidate;
    }
    startFloor[i] = startOffset[i] > networkStart + 0.5 ? startOffset[i] : -Infinity;
  }

  // Storage for simulation outputs
  const iterationDurations = new Float64Array(iterations);
  const criticalCounts = new Uint32Array(n);
  const taskSampleSums = new Float64Array(n);
  const taskSampleSqSums = new Float64Array(n);
  const taskCovarianceSums = new Float64Array(n); // Sum(x_i * Y) for Pearson correlation

  const sampledDurations = new Float64Array(n);
  const es = new Float64Array(n);
  const ef = new Float64Array(n);
  const lf = new Float64Array(n);
  const ls = new Float64Array(n);

  // Execute Monte Carlo simulation loops
  for (let iter = 0; iter < iterations; iter++) {
    // 1. Sample durations (completed work is fixed, in-progress work samples its remainder)
    for (let i = 0; i < n; i++) {
      let s = fixedDays[i];
      const share = remainingShare[i];
      if (share > 0) {
        const b = bounds[i];
        s += share * (useBeta
          ? sampleBetaPert(b.optimistic, b.mostLikely, b.pessimistic, rng)
          : sampleTriangular(b.optimistic, b.mostLikely, b.pessimistic, rng));
      }
      sampledDurations[i] = s;
      taskSampleSums[i] += s;
      taskSampleSqSums[i] += s * s;
    }

    // 2. Forward pass (ES, EF)
    let projectFinish = 0;
    for (let k = 0; k < n; k++) {
      const u = topoOrder[k];
      const dur = sampledDurations[u];
      let start = startFloor[u];
      if (!anchored[u]) {
        const preds = predecessors[u];
        for (let j = 0; j < preds.length; j++) {
          const edge = preds[j];
          const candidate = relationEarliestStartDay(edge.type, es[edge.node], ef[edge.node], dur, edge.lag);
          if (candidate > start) start = candidate;
        }
      }
      es[u] = start;
      ef[u] = start + dur;
      if (ef[u] > projectFinish) projectFinish = ef[u];
    }

    iterationDurations[iter] = projectFinish;

    // 3. Backward pass (LF, LS, TF)
    for (let k = n - 1; k >= 0; k--) {
      const u = topoOrder[k];
      const dur = sampledDurations[u];
      let latestFinish = projectFinish;
      const succs = successors[u];
      for (let j = 0; j < succs.length; j++) {
        const edge = succs[j];
        const s = edge.node;
        let candidate: number;
        switch (edge.type) {
          case "SS":
            candidate = ls[s] - edge.lag + dur;
            break;
          case "FF":
            candidate = lf[s] - edge.lag;
            break;
          case "SF":
            candidate = lf[s] - edge.lag + dur;
            break;
          default:
            candidate = ls[s] - edge.lag;
        }
        if (candidate < latestFinish) latestFinish = candidate;
      }
      lf[u] = latestFinish;
      ls[u] = latestFinish - dur;

      // Criticality check (float <= epsilon)
      if (ls[u] - es[u] <= CRITICAL_FLOAT_EPSILON) {
        criticalCounts[u]++;
      }

      taskCovarianceSums[u] += dur * projectFinish;
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
    const delta = iterationDurations[i] - meanDuration;
    sumSqDiff += delta * delta;
  }
  const varianceDuration = sumSqDiff / (iterations - 1 || 1);
  const stdDevDuration = Math.sqrt(varianceDuration);

  // Percentiles calculation (numeric sort of a typed copy)
  const sortedDurations = Float64Array.from(iterationDurations).sort();
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
  // Criticality ranking: the strongest critical-path drivers first
  taskCriticality.sort(
    (a, b) => b.criticalityIndex - a.criticalityIndex || b.sensitivityIndex - a.sensitivityIndex
  );

  // Distribution Histogram (single pass; one bin when every iteration has the same duration)
  const minDur = sortedDurations[0];
  const maxDur = sortedDurations[sortedDurations.length - 1];
  const spread = maxDur - minDur;
  const binCount = spread > 1e-9 ? numBins : 1;
  const binWidth = spread > 1e-9 ? spread / binCount : 0;
  const counts = new Uint32Array(binCount);
  for (let i = 0; i < sortedDurations.length; i++) {
    const idx = binWidth > 0 ? Math.min(binCount - 1, Math.floor((sortedDurations[i] - minDur) / binWidth)) : 0;
    counts[idx]++;
  }

  const histogram: HistogramBin[] = [];
  let runningCount = 0;
  for (let b = 0; b < binCount; b++) {
    const bMin = minDur + b * binWidth;
    const bMax = b === binCount - 1 ? maxDur : minDur + (b + 1) * binWidth;
    runningCount += counts[b];
    histogram.push({
      binIndex: b,
      minDurationDays: Math.round(bMin * 10) / 10,
      maxDurationDays: Math.round(bMax * 10) / 10,
      startDate: addDays(projectStartDate, Math.round(bMin)),
      endDate: addDays(projectStartDate, Math.round(bMax)),
      count: counts[b],
      frequency: Math.round((counts[b] / iterations) * 1000) / 1000,
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
