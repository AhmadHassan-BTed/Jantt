/**
 * Project Baseline Snapshot & Variance Analysis Engine
 *
 * Provides capabilities to freeze project schedule baselines into meta.baselines,
 * calculate start/finish slippage variances, cost variances, and identify
 * delay trends against frozen milestones.
 * Strictly zero external dependencies.
 */

import { Task, JanttData } from "./types";
import { diffDays } from "./date-math";

export interface TaskBaselineEntry {
  taskId: string;
  start: string;
  end: string;
  estimatedCost?: number;
}

export interface ProjectBaselineSnapshot {
  id: string;
  name: string;
  createdAt: string;
  tasks: TaskBaselineEntry[];
}

export interface TaskVarianceMetric {
  taskId: string;
  label: string;
  currentStart: string;
  currentEnd: string;
  baselineStart: string;
  baselineEnd: string;
  startSlippageDays: number; // positive = started later than baseline
  endSlippageDays: number; // positive = completed later than baseline
  durationVarianceDays: number; // positive = took more calendar days
  costVariance?: number; // actualCost - estimatedCost
  status: "delayed" | "ahead" | "on-schedule";
}

export interface BaselineVarianceSummary {
  baselineId: string;
  baselineName: string;
  projectBaselineStart: string;
  projectBaselineEnd: string;
  projectCurrentStart: string;
  projectCurrentEnd: string;
  projectEndSlippageDays: number;
  totalDelayedTasks: number;
  totalAheadTasks: number;
  totalOnScheduleTasks: number;
  totalCostVariance: number;
  taskVariances: TaskVarianceMetric[];
  worstSlippedTasks: TaskVarianceMetric[];
}

let baselineIdCounter = 0;

/**
 * Freezes current task schedules into a new ProjectBaselineSnapshot,
 * adds it to `data.meta.baselines`, and synchronizes each task's `baseline` field.
 */
export function freezeProjectBaseline(
  data: JanttData,
  name = "Baseline Snapshot"
): { updatedData: JanttData; snapshot: ProjectBaselineSnapshot } {
  const liveTasks = (data.tasks || []).filter((t) => !t._deleted);
  const now = new Date().toISOString();
  baselineIdCounter++;
  const snapshotId = `base_${Date.now()}_${baselineIdCounter}`;

  const taskEntries: TaskBaselineEntry[] = liveTasks.map((t) => ({
    taskId: t.id,
    start: t.start,
    end: t.end,
    estimatedCost: t.actualCost ?? t.estimatedCost
  }));

  const snapshot: ProjectBaselineSnapshot = {
    id: snapshotId,
    name,
    createdAt: now,
    tasks: taskEntries
  };

  const existingMeta = data.meta ? { ...data.meta } : {};
  const existingBaselines: ProjectBaselineSnapshot[] = Array.isArray((existingMeta as any).baselines)
    ? [...(existingMeta as any).baselines]
    : [];

  existingBaselines.push(snapshot);

  const updatedTasks: Task[] = (data.tasks || []).map((t) => {
    if (t._deleted) return { ...t };
    return {
      ...t,
      baseline: {
        start: t.start,
        end: t.end
      }
    };
  });

  const updatedData: JanttData = {
    ...data,
    meta: {
      ...existingMeta,
      baselines: existingBaselines,
      activeBaselineId: snapshotId,
      showBaselines: true
    } as any,
    tasks: updatedTasks
  };

  return { updatedData, snapshot };
}

/**
 * Activates a specific baseline snapshot by copying its dates into each task's `baseline` field.
 */
export function activateBaselineSnapshot(
  data: JanttData,
  snapshotId: string
): JanttData {
  const baselines = ((data.meta as any)?.baselines || []) as ProjectBaselineSnapshot[];
  const match = baselines.find((b) => b.id === snapshotId);
  if (!match) return data;

  const baselineMap = new Map<string, TaskBaselineEntry>();
  match.tasks.forEach((entry) => baselineMap.set(entry.taskId, entry));

  const updatedTasks: Task[] = (data.tasks || []).map((t) => {
    const entry = baselineMap.get(t.id);
    if (!entry) return { ...t };
    return {
      ...t,
      baseline: {
        start: entry.start,
        end: entry.end
      }
    };
  });

  return {
    ...data,
    meta: {
      ...(data.meta || {}),
      activeBaselineId: snapshotId,
      showBaselines: true
    } as any,
    tasks: updatedTasks
  };
}

/**
 * Computes schedule and cost variance metrics against the active or specified baseline.
 */
export function computeBaselineVariance(
  data: JanttData,
  snapshotId?: string
): BaselineVarianceSummary | null {
  const liveTasks = (data.tasks || []).filter((t) => !t._deleted);
  if (liveTasks.length === 0) return null;

  const baselines = ((data.meta as any)?.baselines || []) as ProjectBaselineSnapshot[];
  let activeSnapshot: ProjectBaselineSnapshot | undefined;

  if (snapshotId) {
    activeSnapshot = baselines.find((b) => b.id === snapshotId);
  } else if ((data.meta as any)?.activeBaselineId) {
    activeSnapshot = baselines.find((b) => b.id === (data.meta as any).activeBaselineId);
  }

  // Fallback: If no meta.baselines snapshot found, synthesize from tasks' inline `baseline` properties
  const baselineEntries = new Map<string, TaskBaselineEntry>();
  let baselineName = activeSnapshot ? activeSnapshot.name : "Active Baseline";
  let effectiveBaselineId = activeSnapshot ? activeSnapshot.id : "default";

  if (activeSnapshot) {
    activeSnapshot.tasks.forEach((e) => baselineEntries.set(e.taskId, e));
  } else {
    let hasAnyBaseline = false;
    liveTasks.forEach((t) => {
      if (t.baseline && t.baseline.start && t.baseline.end) {
        hasAnyBaseline = true;
        baselineEntries.set(t.id, {
          taskId: t.id,
          start: t.baseline.start,
          end: t.baseline.end,
          estimatedCost: t.estimatedCost
        });
      }
    });
    if (!hasAnyBaseline) return null;
  }

  let projectCurStart = liveTasks[0].start;
  let projectCurEnd = liveTasks[0].end;
  let projectBaseStart = "";
  let projectBaseEnd = "";

  const taskVariances: TaskVarianceMetric[] = [];
  let totalDelayed = 0;
  let totalAhead = 0;
  let totalOnSchedule = 0;
  let totalCostVariance = 0;

  liveTasks.forEach((t) => {
    if (diffDays(t.start, projectCurStart) > 0) projectCurStart = t.start;
    if (diffDays(projectCurEnd, t.end) > 0) projectCurEnd = t.end;

    const baseEntry = baselineEntries.get(t.id) || (t.baseline ? {
      taskId: t.id,
      start: t.baseline.start,
      end: t.baseline.end,
      estimatedCost: t.estimatedCost
    } : null);

    if (!baseEntry) return;

    if (!projectBaseStart || diffDays(baseEntry.start, projectBaseStart) > 0) {
      projectBaseStart = baseEntry.start;
    }
    if (!projectBaseEnd || diffDays(projectBaseEnd, baseEntry.end) > 0) {
      projectBaseEnd = baseEntry.end;
    }

    const startSlippage = diffDays(baseEntry.start, t.start);
    const endSlippage = diffDays(baseEntry.end, t.end);
    const curDur = Math.max(0, diffDays(t.start, t.end));
    const baseDur = Math.max(0, diffDays(baseEntry.start, baseEntry.end));
    const durationVariance = curDur - baseDur;

    let costVariance: number | undefined;
    if (typeof t.actualCost === "number" && typeof (baseEntry.estimatedCost ?? t.estimatedCost) === "number") {
      const est = (baseEntry.estimatedCost ?? t.estimatedCost)!;
      costVariance = t.actualCost - est;
      totalCostVariance += costVariance;
    }

    let status: TaskVarianceMetric["status"] = "on-schedule";
    if (endSlippage > 0) {
      status = "delayed";
      totalDelayed++;
    } else if (endSlippage < 0) {
      status = "ahead";
      totalAhead++;
    } else {
      totalOnSchedule++;
    }

    taskVariances.push({
      taskId: t.id,
      label: t.label || t.name || t.id,
      currentStart: t.start,
      currentEnd: t.end,
      baselineStart: baseEntry.start,
      baselineEnd: baseEntry.end,
      startSlippageDays: startSlippage,
      endSlippageDays: endSlippage,
      durationVarianceDays: durationVariance,
      costVariance,
      status
    });
  });

  const projectEndSlippageDays = projectBaseEnd ? diffDays(projectBaseEnd, projectCurEnd) : 0;

  // Worst slipped tasks: sort descending by endSlippageDays
  const worstSlippedTasks = [...taskVariances]
    .filter((v) => v.endSlippageDays > 0)
    .sort((a, b) => b.endSlippageDays - a.endSlippageDays);

  return {
    baselineId: effectiveBaselineId,
    baselineName,
    projectBaselineStart: projectBaseStart || projectCurStart,
    projectBaselineEnd: projectBaseEnd || projectCurEnd,
    projectCurrentStart: projectCurStart,
    projectCurrentEnd: projectCurEnd,
    projectEndSlippageDays,
    totalDelayedTasks: totalDelayed,
    totalAheadTasks: totalAhead,
    totalOnScheduleTasks: totalOnSchedule,
    totalCostVariance: Math.round(totalCostVariance * 100) / 100,
    taskVariances,
    worstSlippedTasks
  };
}
