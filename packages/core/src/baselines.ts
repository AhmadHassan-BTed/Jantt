/**
 * Project Baseline Snapshot & Variance Analysis Engine
 *
 * Provides capabilities to freeze project schedule baselines into meta.baselines,
 * calculate start/finish slippage variances, cost variances, and identify
 * delay trends against frozen milestones.
 * Strictly zero external dependencies.
 */

import { Task, JanttData, JanttMeta } from "./types";
import { diffDays, isValidISODate } from "./date-math";

export interface TaskBaselineEntry {
  taskId: string;
  start: string;
  end: string;
  /** Budget (estimatedCost) at freeze time. */
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
  costVariance?: number; // actualCost - baseline estimatedCost (positive = overrun)
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
  /** Live tasks with no entry in the baseline (e.g. scope added after the freeze). */
  unbaselinedTaskIds: string[];
}

let baselineIdCounter = 0;

/** Accepts arrays and the object form RTDB returns for arrays. */
function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function toBaselineEntry(raw: unknown): TaskBaselineEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const { taskId, start, end, estimatedCost } = entry;
  if (typeof taskId !== "string" || typeof start !== "string" || typeof end !== "string") return null;
  if (!isValidISODate(start) || !isValidISODate(end)) return null;
  const result: TaskBaselineEntry = { ...entry, taskId, start, end };
  if (typeof estimatedCost !== "number" || !Number.isFinite(estimatedCost)) delete result.estimatedCost;
  return result;
}

/**
 * Returns the well-formed baseline snapshots stored in `meta.baselines`.
 * Tolerates RTDB object-form arrays and drops snapshots without a string id and
 * entries without a task id or valid ISO dates, so callers never crash on remote data.
 */
export function getBaselineSnapshots(meta: JanttMeta | undefined | null): ProjectBaselineSnapshot[] {
  const snapshots: ProjectBaselineSnapshot[] = [];
  for (const raw of toList(meta?.baselines)) {
    if (!raw || typeof raw !== "object") continue;
    const snap = raw as Record<string, unknown>;
    if (typeof snap.id !== "string" || !snap.id) continue;
    const tasks = toList(snap.tasks)
      .map(toBaselineEntry)
      .filter((e): e is TaskBaselineEntry => e !== null);
    snapshots.push({
      ...snap,
      id: snap.id,
      name: typeof snap.name === "string" && snap.name ? snap.name : snap.id,
      createdAt: typeof snap.createdAt === "string" ? snap.createdAt : "",
      tasks
    });
  }
  return snapshots;
}

/**
 * Freezes current task schedules into a new ProjectBaselineSnapshot,
 * adds it to `data.meta.baselines`, and synchronizes each task's `baseline` field.
 */
export function freezeProjectBaseline(
  data: JanttData,
  name = "Baseline Snapshot"
): { updatedData: JanttData; snapshot: ProjectBaselineSnapshot } {
  const liveTasks = (data.tasks || []).filter((t) => t && !t._deleted);
  const now = new Date().toISOString();
  baselineIdCounter++;
  const snapshotId = `base_${Date.now()}_${baselineIdCounter}`;

  const taskEntries: TaskBaselineEntry[] = liveTasks.map((t) => {
    const entry: TaskBaselineEntry = { taskId: t.id, start: t.start, end: t.end };
    if (typeof t.estimatedCost === "number" && Number.isFinite(t.estimatedCost)) {
      entry.estimatedCost = t.estimatedCost;
    }
    return entry;
  });

  const snapshot: ProjectBaselineSnapshot = {
    id: snapshotId,
    name,
    createdAt: now,
    tasks: taskEntries
  };

  const existingMeta: JanttMeta = data.meta ? { ...data.meta } : {};
  const baselines = [...getBaselineSnapshots(existingMeta), snapshot];

  const updatedTasks: Task[] = (data.tasks || []).map((t) => {
    if (!t) return t; // tolerate holes in remote task lists
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
      baselines,
      activeBaselineId: snapshotId,
      showBaselines: true
    },
    tasks: updatedTasks
  };

  return { updatedData, snapshot };
}

/**
 * Activates a specific baseline snapshot by copying its dates into each task's `baseline` field.
 * Live tasks absent from the snapshot lose their `baseline`, so no dates leak in from another
 * snapshot. Returns `data` unchanged when the snapshot does not exist.
 */
export function activateBaselineSnapshot(
  data: JanttData,
  snapshotId: string
): JanttData {
  const match = getBaselineSnapshots(data.meta).find((b) => b.id === snapshotId);
  if (!match) return data;

  const baselineMap = new Map<string, TaskBaselineEntry>();
  match.tasks.forEach((entry) => baselineMap.set(entry.taskId, entry));

  const updatedTasks: Task[] = (data.tasks || []).map((t) => {
    if (!t) return t; // tolerate holes in remote task lists
    if (t._deleted) return { ...t };
    const entry = baselineMap.get(t.id);
    if (!entry) {
      const unbaselined = { ...t };
      delete unbaselined.baseline;
      return unbaselined;
    }
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
    },
    tasks: updatedTasks
  };
}

/**
 * Computes schedule and cost variance metrics against a baseline.
 *
 * Baseline source: the snapshot `snapshotId` when given (null if it does not exist), else the
 * active snapshot (`meta.activeBaselineId`), else each task's inline `baseline` dates. With a
 * snapshot, only its entries are compared; other live tasks are listed in `unbaselinedTaskIds`.
 */
export function computeBaselineVariance(
  data: JanttData,
  snapshotId?: string
): BaselineVarianceSummary | null {
  const liveTasks = (data.tasks || []).filter((t) => t && !t._deleted);
  if (liveTasks.length === 0) return null;

  const snapshots = getBaselineSnapshots(data.meta);
  let activeSnapshot: ProjectBaselineSnapshot | undefined;

  if (snapshotId) {
    activeSnapshot = snapshots.find((b) => b.id === snapshotId);
    if (!activeSnapshot) return null;
  } else if (data.meta?.activeBaselineId) {
    activeSnapshot = snapshots.find((b) => b.id === data.meta?.activeBaselineId);
  }

  const baselineEntries = new Map<string, TaskBaselineEntry>();
  if (activeSnapshot) {
    activeSnapshot.tasks.forEach((e) => baselineEntries.set(e.taskId, e));
  } else {
    // No snapshot: synthesize from tasks' inline `baseline` dates (cost = current budget)
    liveTasks.forEach((t) => {
      if (t.baseline && isValidISODate(t.baseline.start) && isValidISODate(t.baseline.end)) {
        const entry: TaskBaselineEntry = { taskId: t.id, start: t.baseline.start, end: t.baseline.end };
        if (typeof t.estimatedCost === "number" && Number.isFinite(t.estimatedCost)) {
          entry.estimatedCost = t.estimatedCost;
        }
        baselineEntries.set(t.id, entry);
      }
    });
    if (baselineEntries.size === 0) return null;
  }

  let projectCurStart = liveTasks[0].start;
  let projectCurEnd = liveTasks[0].end;
  let projectBaseStart = "";
  let projectBaseEnd = "";

  const taskVariances: TaskVarianceMetric[] = [];
  const unbaselinedTaskIds: string[] = [];
  let totalDelayed = 0;
  let totalAhead = 0;
  let totalOnSchedule = 0;
  let totalCostVariance = 0;

  liveTasks.forEach((t) => {
    if (diffDays(t.start, projectCurStart) > 0) projectCurStart = t.start;
    if (diffDays(projectCurEnd, t.end) > 0) projectCurEnd = t.end;

    const baseEntry = baselineEntries.get(t.id);
    if (!baseEntry) {
      unbaselinedTaskIds.push(t.id);
      return;
    }

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
    if (typeof t.actualCost === "number" && Number.isFinite(t.actualCost) && typeof baseEntry.estimatedCost === "number") {
      costVariance = t.actualCost - baseEntry.estimatedCost;
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
    baselineId: activeSnapshot ? activeSnapshot.id : "default",
    baselineName: activeSnapshot ? activeSnapshot.name : "Active Baseline",
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
    worstSlippedTasks,
    unbaselinedTaskIds
  };
}
