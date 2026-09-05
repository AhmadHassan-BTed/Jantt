/**
 * Earned Value Management (EVM - ANSI/EIA-748) Engine
 *
 * Implements standard project cost/schedule performance measurement
 * along with intuitive plain-English executive summaries and health metrics.
 */

import { Task, EVMResult, TaskEVMMetrics } from "./types";
import { diffDays } from "./date-math";
import { getTaskDependencies } from "./cpm";
import { isTaskDone } from "./utils";

export interface EVMOptions {
  statusDate?: string; // YYYY-MM-DD (defaults to today or latest task start)
  defaultGapDays?: number;
}

/**
 * Calculates Earned Value Management (EVM) metrics according to ANSI/EIA-748 standards.
 * Also provides intuitive summaries for non-technical stakeholders and everyday managers.
 *
 * @param tasks - The array of tasks with estimatedCost, actualCost, progress, start, end dates.
 * @param options - Optional status date.
 * @returns Comprehensive EVMResult with mathematical metrics and executive status.
 */
export function calculateEVM(tasks: Task[], options?: EVMOptions): EVMResult {
  const taskMetrics = new Map<string, TaskEVMMetrics>();

  const liveTasks = (tasks || []).filter((t) => !t._deleted);

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
      taskMetrics
    };
  }

  // 1. Determine Status Date (T_status)
  let statusDate = options?.statusDate;
  if (!statusDate || statusDate.trim() === "") {
    // Default to today's date formatted as YYYY-MM-DD in UTC
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    statusDate = `${y}-${m}-${d}`;
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

  let bac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;

  let completedCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;
  let blockedCount = 0;

  for (const t of liveTasks) {
    const isDone = isTaskDone(t);
    const rawProgress = t.progress ?? 0;
    const actualProgress = isDone ? 1.0 : Math.min(1.0, Math.max(0, rawProgress));

    // Update status counts
    if (isDone || actualProgress >= 1.0) {
      completedCount++;
    } else if (actualProgress > 0) {
      inProgressCount++;
    } else {
      notStartedCount++;
    }

    // Check if task is blocked (any prerequisite is not completed)
    const depIds = getTaskDependencies(t);
    let isBlocked = false;
    for (const depId of depIds) {
      const prereq = byId.get(depId);
      if (prereq && !isTaskDone(prereq)) {
        isBlocked = true;
        break;
      }
    }
    if (isBlocked && !isDone) {
      blockedCount++;
    }

    // Planned Progress (Schedule completion up to status date)
    let plannedProgress = 0;
    const totalDuration = Math.max(1, diffDays(t.start, t.end));
    if (diffDays(statusDate, t.start) > 0) {
      // statusDate is before start
      plannedProgress = 0;
    } else if (diffDays(t.end, statusDate) >= 0) {
      // statusDate is at or after end
      plannedProgress = 1.0;
    } else {
      // statusDate is mid-task
      const elapsed = Math.max(0, diffDays(t.start, statusDate));
      plannedProgress = Math.min(1.0, Math.max(0, elapsed / totalDuration));
    }

    // Budget & Cost allocations
    const taskBudget = t.estimatedCost !== undefined && t.estimatedCost !== null ? Math.max(0, t.estimatedCost) : 0;
    const taskPv = taskBudget * plannedProgress;
    const taskEv = taskBudget * actualProgress;
    const taskAc = t.actualCost !== undefined && t.actualCost !== null
      ? Math.max(0, t.actualCost)
      : (taskBudget > 0 ? taskBudget * actualProgress : 0);

    const taskSv = taskEv - taskPv;
    const taskCv = taskEv - taskAc;

    bac += taskBudget;
    pv += taskPv;
    ev += taskEv;
    ac += taskAc;

    taskMetrics.set(t.id, {
      taskId: t.id,
      plannedValue: Math.round(taskPv * 100) / 100,
      earnedValue: Math.round(taskEv * 100) / 100,
      actualCost: Math.round(taskAc * 100) / 100,
      scheduleVariance: Math.round(taskSv * 100) / 100,
      costVariance: Math.round(taskCv * 100) / 100,
      plannedProgress: Math.round(plannedProgress * 1000) / 1000,
      actualProgress: Math.round(actualProgress * 1000) / 1000,
      isBlocked
    });
  }

  // 2. Classical EVM Variances and Indices
  const sv = ev - pv;
  const cv = ev - ac;
  const svPercent = pv > 0 ? (sv / pv) * 100 : 0;
  const cvPercent = ev > 0 ? (cv / ev) * 100 : 0;

  const spi = pv > 0 ? Math.round((ev / pv) * 1000) / 1000 : 1.0;
  const cpi = ac > 0 ? Math.round((ev / ac) * 1000) / 1000 : 1.0;
  const criticalRatio = Math.round(spi * cpi * 1000) / 1000;

  // 3. Forecasting (EAC, ETC, VAC, TCPI)
  const eac = cpi > 0 ? Math.round(bac / cpi) : bac;
  const etc = Math.max(0, eac - Math.round(ac));
  const vac = Math.round(bac - eac);
  const tcpi = (bac - ac) > 0
    ? Math.round(((bac - ev) / (bac - ac)) * 1000) / 1000
    : 1.0;

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
  const projectProgressPercent = bac > 0
    ? Math.round((ev / bac) * 100)
    : Math.round((completedCount / Math.max(liveTasks.length, 1)) * 100);

  let projectPaceLabel = "Schedule on track";
  if (scheduleStatus === "ahead") {
    projectPaceLabel = `Tracking ${Math.abs(Math.round(svPercent))}% ahead of schedule (+${Math.round(sv).toLocaleString()} EV)`;
  } else if (scheduleStatus === "behind") {
    projectPaceLabel = `Running ${Math.abs(Math.round(svPercent))}% behind schedule (-${Math.abs(Math.round(sv)).toLocaleString()} EV)`;
  }

  return {
    bac: Math.round(bac),
    pv: Math.round(pv),
    ev: Math.round(ev),
    ac: Math.round(ac),
    sv: Math.round(sv),
    cv: Math.round(cv),
    svPercent: Math.round(svPercent * 10) / 10,
    cvPercent: Math.round(cvPercent * 10) / 10,
    spi,
    cpi,
    criticalRatio,
    eac,
    etc,
    vac,
    tcpi,
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
    taskMetrics
  };
}
