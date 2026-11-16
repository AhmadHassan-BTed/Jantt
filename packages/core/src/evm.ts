/**
 * Earned Value Management (EVM - ANSI/EIA-748) Engine
 *
 * Implements standard project cost/schedule performance measurement
 * along with intuitive plain-English executive summaries and health metrics.
 *
 * Measurement rules:
 * - Planned Value is time-phased against each task's baseline (the Performance Measurement
 *   Baseline) and falls back to current dates only for tasks without one.
 * - Missing `actualCost` is unknown, not "on budget": AC, CV and CPI use only tasks that
 *   report an actual cost (see `costCoverage`).
 * - Plans without any `estimatedCost` measure schedule performance on duration-weighted
 *   value; cost indices are then neutral placeholders (`costDataAvailable: false`).
 */

import { Task, EVMResult, TaskEVMMetrics } from "./types";
import { diffDays, getTodayISODate, isValidISODate } from "./date-math";
import { getTaskDependencyRelations } from "./dependencies";
import { isTaskDone } from "./utils";
import { isDependencySatisfied } from "./schedule-health";

export interface EVMOptions {
  /**
   * Status (data) date, YYYY-MM-DD. Defaults to today's local date (the chart's "today" line);
   * an invalid value also falls back to today. The date actually used is returned as `statusDate`.
   */
  statusDate?: string;
  /** @deprecated Ignored: earned value does not depend on dependency gap spacing. */
  defaultGapDays?: number;
}

/** EVM metrics plus the context needed to interpret them honestly. */
export interface EVMAnalysis extends EVMResult {
  /** Status date the metrics were measured at (YYYY-MM-DD). */
  statusDate: string;
  /** Dates planned value was time-phased against: task baselines, current dates, or both. */
  pvBasis: "baseline" | "current" | "mixed";
  /**
   * False when no task has an estimatedCost. SPI, SV% and progress are then duration-weighted,
   * monetary PV/EV/SV are 0, and CPI/EAC/TCPI are neutral placeholders rather than measurements.
   */
  costDataAvailable: boolean;
  /**
   * Share of BAC (0-1) held by tasks that report an actualCost. AC, CV and CPI are measured over
   * those tasks only; when no task reports one, cost performance is unknown and CPI/TCPI stay at
   * the neutral 1.0.
   */
  costCoverage: number;
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Fraction (0-1) of a task's planned window [start, end] elapsed at the status date. */
function plannedFraction(start: string, end: string, statusDate: string): number {
  if (diffDays(statusDate, start) > 0) return 0; // status date before start
  if (diffDays(end, statusDate) >= 0) return 1; // status date at or after end
  const totalDuration = Math.max(1, diffDays(start, end));
  return Math.min(1, Math.max(0, diffDays(start, statusDate) / totalDuration));
}

/**
 * Calculates Earned Value Management (EVM) metrics according to ANSI/EIA-748 standards.
 * Also provides intuitive summaries for non-technical stakeholders and everyday managers.
 *
 * @param tasks - The array of tasks with estimatedCost, actualCost, progress, start, end dates.
 * @param options - Optional status date.
 * @returns Comprehensive EVM metrics with executive status and data-quality context.
 */
export function calculateEVM(tasks: Task[], options?: EVMOptions): EVMAnalysis {
  const taskMetrics = new Map<string, TaskEVMMetrics>();

  const liveTasks = (Array.isArray(tasks) ? tasks : []).filter((t) => t && !t._deleted);

  // 1. Determine Status Date (T_status)
  const requestedDate = typeof options?.statusDate === "string" ? options.statusDate.trim() : "";
  const statusDate = requestedDate && isValidISODate(requestedDate) ? requestedDate.split("T")[0] : getTodayISODate();

  if (liveTasks.length === 0) {
    return {
      bac: 0,
      pv: 0,
      ev: 0,
      ac: 0,
      sv: 0,
      cv: 0,
      svPercent: 0,
      cvPercent: 0,
      spi: 1.0,
      cpi: 1.0,
      criticalRatio: 1.0,
      eac: 0,
      etc: 0,
      vac: 0,
      tcpi: 1.0,
      scheduleStatus: "on-track",
      costStatus: "on-budget",
      overallHealth: "healthy",
      healthScore: 100,
      taskCountTotal: 0,
      taskCountCompleted: 0,
      taskCountInProgress: 0,
      taskCountNotStarted: 0,
      taskCountBlocked: 0,
      daysRemaining: 0,
      projectProgressPercent: 0,
      projectPaceLabel: "No active tasks",
      taskMetrics,
      statusDate,
      pvBasis: "current",
      costDataAvailable: false,
      costCoverage: 0
    };
  }

  const byId = new Map<string, Task>();
  liveTasks.forEach((t) => byId.set(t.id, t));

  // Determine Project Bounds
  let maxProjectEnd = liveTasks[0].end;
  liveTasks.forEach((t) => {
    if (diffDays(maxProjectEnd, t.end) > 0) {
      maxProjectEnd = t.end;
    }
  });

  // Monetary values
  let bac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;
  let evReported = 0; // EV of tasks that report an actual cost
  let bacReported = 0; // BAC of tasks that report an actual cost
  let reportedCount = 0; // tasks that report an actual cost
  // Duration-weighted values (schedule measurement for plans without budgets)
  let bacWeighted = 0;
  let pvWeighted = 0;
  let evWeighted = 0;

  let baselinedCount = 0;
  let completedCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;
  let blockedCount = 0;

  for (const t of liveTasks) {
    const isDone = isTaskDone(t);
    const rawProgress = typeof t.progress === "number" && Number.isFinite(t.progress) ? t.progress : 0;
    const actualProgress = isDone ? 1.0 : Math.min(1.0, Math.max(0, rawProgress));

    // Update status counts
    if (actualProgress >= 1.0) {
      completedCount++;
    } else if (actualProgress > 0) {
      inProgressCount++;
    } else {
      notStartedCount++;
    }

    // Blocked: a predecessor has not progressed far enough for this task to start (FS/SS links)
    let isBlocked = false;
    if (!isDone) {
      for (const rel of getTaskDependencyRelations(t, byId)) {
        const prereq = rel.id !== t.id ? byId.get(rel.id) : undefined;
        if (prereq && !isDependencySatisfied(rel, prereq, "start")) {
          isBlocked = true;
          break;
        }
      }
    }
    if (isBlocked) {
      blockedCount++;
    }

    // Planned Progress against the Performance Measurement Baseline
    const baseline = t.baseline;
    const hasBaseline = Boolean(baseline && isValidISODate(baseline.start) && isValidISODate(baseline.end));
    const plannedStart = hasBaseline ? baseline!.start : t.start;
    const plannedEnd = hasBaseline ? baseline!.end : t.end;
    if (hasBaseline) baselinedCount++;
    const plannedProgress = plannedFraction(plannedStart, plannedEnd, statusDate);

    // Budget & Cost allocations
    const taskBudget = typeof t.estimatedCost === "number" && Number.isFinite(t.estimatedCost) ? Math.max(0, t.estimatedCost) : 0;
    const reportsActual = typeof t.actualCost === "number" && Number.isFinite(t.actualCost);
    const taskPv = taskBudget * plannedProgress;
    const taskEv = taskBudget * actualProgress;
    const taskAc = reportsActual ? Math.max(0, t.actualCost as number) : 0;

    const taskSv = taskEv - taskPv;
    const taskCv = reportsActual ? taskEv - taskAc : 0;

    bac += taskBudget;
    pv += taskPv;
    ev += taskEv;
    if (reportsActual) {
      reportedCount++;
      ac += taskAc;
      evReported += taskEv;
      bacReported += taskBudget;
    }

    const weight = Math.max(1, diffDays(plannedStart, plannedEnd));
    bacWeighted += weight;
    pvWeighted += weight * plannedProgress;
    evWeighted += weight * actualProgress;

    taskMetrics.set(t.id, {
      taskId: t.id,
      plannedValue: round(taskPv, 2),
      earnedValue: round(taskEv, 2),
      actualCost: round(taskAc, 2),
      scheduleVariance: round(taskSv, 2),
      costVariance: round(taskCv, 2),
      plannedProgress: round(plannedProgress, 3),
      actualProgress: round(actualProgress, 3),
      isBlocked
    });
  }

  const costDataAvailable = bac > 0;
  const costCoverage = costDataAvailable ? bacReported / bac : 0;

  // 2. Classical EVM Variances and Indices (unrounded for derived forecasts)
  const schedulePv = costDataAvailable ? pv : pvWeighted;
  const scheduleEv = costDataAvailable ? ev : evWeighted;
  const rawSpi = schedulePv > 0 ? scheduleEv / schedulePv : 1.0;
  const svPercent = schedulePv > 0 ? ((scheduleEv - schedulePv) / schedulePv) * 100 : 0;
  const sv = ev - pv;

  const cv = evReported - ac;
  const cvPercent = evReported > 0 ? (cv / evReported) * 100 : 0;
  // Without budgets there is no earned value in money, so cost indices stay neutral
  const rawCpi = costDataAvailable && ac > 0 ? evReported / ac : 1.0;

  // 3. Forecasting (EAC, ETC, VAC, TCPI)
  let eac: number;
  if (!costDataAvailable || ac <= 0) {
    eac = bac; // no budget, or nothing spent yet (or not reported): no evidence of a variance
  } else if (rawCpi > 0) {
    eac = bac / rawCpi;
  } else {
    eac = ac + (bac - ev); // money spent without earned value: ANSI "atypical" forecast
  }
  const etc = Math.max(0, eac - ac);
  const vac = bac - eac;

  const remainingWork = bac - ev;
  const remainingFunds = bac - ac;
  let tcpi: number;
  if (!costDataAvailable) {
    tcpi = 1.0;
  } else if (remainingWork <= 0) {
    tcpi = 0; // no work left to perform
  } else if (reportedCount === 0) {
    tcpi = 1.0; // spend unknown: neutral, like CPI (not "remaining work / full budget")
  } else if (remainingFunds > 0) {
    tcpi = remainingWork / remainingFunds;
  } else {
    tcpi = Infinity; // budget exhausted with work remaining: unachievable within BAC
  }

  const spi = round(rawSpi, 3);
  const cpi = round(rawCpi, 3);

  // 4. Intuitive Executive Summaries
  let scheduleStatus: "ahead" | "on-track" | "behind" = "on-track";
  if (spi >= 1.02) scheduleStatus = "ahead";
  else if (spi < 0.98) scheduleStatus = "behind";

  let costStatus: "under-budget" | "on-budget" | "over-budget" = "on-budget";
  if (cpi >= 1.02) costStatus = "under-budget";
  else if (cpi < 0.98) costStatus = "over-budget";

  let overallHealth: "healthy" | "at-risk" | "critical" = "healthy";
  if (spi < 0.88 || cpi < 0.88) {
    overallHealth = "critical";
  } else if (spi < 0.96 || cpi < 0.96 || blockedCount > liveTasks.length * 0.25) {
    overallHealth = "at-risk";
  }

  // Calculate Health Score (0 - 100)
  let healthScore = 100;
  if (spi < 1.0) {
    healthScore -= Math.min(30, Math.round((1.0 - spi) * 100));
  }
  if (cpi < 1.0) {
    healthScore -= Math.min(30, Math.round((1.0 - cpi) * 100));
  }
  if (blockedCount > 0) {
    healthScore -= Math.min(20, Math.round((blockedCount / liveTasks.length) * 40));
  }
  healthScore = Math.max(10, Math.min(100, healthScore));

  const daysRemaining = Math.max(0, diffDays(statusDate, maxProjectEnd));
  const projectProgressPercent = costDataAvailable
    ? Math.round((ev / bac) * 100)
    : Math.round((evWeighted / Math.max(bacWeighted, 1)) * 100);

  let projectPaceLabel = "Schedule on track";
  const pacePercent = Math.abs(Math.round(svPercent));
  if (scheduleStatus === "ahead") {
    projectPaceLabel = costDataAvailable
      ? `Tracking ${pacePercent}% ahead of schedule (+${Math.round(sv).toLocaleString()} EV)`
      : `Tracking ${pacePercent}% ahead of schedule (duration-weighted)`;
  } else if (scheduleStatus === "behind") {
    projectPaceLabel = costDataAvailable
      ? `Running ${pacePercent}% behind schedule (-${Math.abs(Math.round(sv)).toLocaleString()} EV)`
      : `Running ${pacePercent}% behind schedule (duration-weighted)`;
  }

  return {
    bac: Math.round(bac),
    pv: Math.round(pv),
    ev: Math.round(ev),
    ac: Math.round(ac),
    sv: Math.round(sv),
    cv: Math.round(cv),
    svPercent: round(svPercent, 1),
    cvPercent: round(cvPercent, 1),
    spi,
    cpi,
    criticalRatio: round(rawSpi * rawCpi, 3),
    eac: Math.round(eac),
    etc: Math.round(etc),
    vac: Math.round(vac),
    tcpi: Number.isFinite(tcpi) ? round(tcpi, 3) : tcpi,
    scheduleStatus,
    costStatus,
    overallHealth,
    healthScore,
    taskCountTotal: liveTasks.length,
    taskCountCompleted: completedCount,
    taskCountInProgress: inProgressCount,
    taskCountNotStarted: notStartedCount,
    taskCountBlocked: blockedCount,
    daysRemaining,
    projectProgressPercent,
    projectPaceLabel,
    taskMetrics,
    statusDate,
    pvBasis: baselinedCount === 0 ? "current" : baselinedCount === liveTasks.length ? "baseline" : "mixed",
    costDataAvailable,
    costCoverage: round(costCoverage, 3)
  };
}
