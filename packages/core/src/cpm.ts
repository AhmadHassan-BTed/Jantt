/**
 * Critical Path Method (CPM) Engine
 *
 * Implements rigorous 2-pass Activity-On-Node (AON) graph analysis:
 * 1. Kahn's Algorithm topological sort with cycle detection
 * 2. Forward Pass: Computes Earliest Start (ES) and Earliest Finish (EF)
 * 3. Backward Pass: Computes Latest Finish (LF) and Latest Start (LS)
 * 4. Float Metrics: Total Float (TF) and Free Float (FF)
 * 5. Critical & Near-Critical identification
 * 6. Driving critical dependency link detection and contiguous path assembly
 */

import { Task, CriticalPathResult, CriticalPathOptions, TaskScheduleMetrics } from "./types";
import { addDays, diffDays } from "./date-math";
import { getEffectiveGap } from "./utils";

/**
 * Normalizes task dependencies into a clean string array.
 * Supports string, string[], or comma-separated formats.
 */
export function getTaskDependencies(task: Task | { dependsOn?: string | string[] | null }): string[] {
  if (!task || !task.dependsOn) return [];
  if (Array.isArray(task.dependsOn)) {
    return task.dependsOn
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id.length > 0);
  }
  if (typeof task.dependsOn === "string") {
    if (task.dependsOn.includes(",")) {
      return task.dependsOn
        .split(",")
        .map((s) => s.trim())
        .filter((id) => id.length > 0);
    }
    const trimmed = task.dependsOn.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  return [];
}

/**
 * Calculates the Critical Path of a task network using rigorous 2-Pass Activity-On-Node (AON)
 * operations research methodology:
 *
 * @param tasks - The array of tasks to analyze.
 * @param options - Optional target completion date, near-critical float threshold, and gap days.
 * @returns Complete CriticalPathResult with sets, metrics maps, and ordered paths.
 */
export function calculateCriticalPath(tasks: Task[], options?: CriticalPathOptions): CriticalPathResult {
  const criticalTaskIds = new Set<string>();
  const criticalDepKeys = new Set<string>();
  const nearCriticalTaskIds = new Set<string>();
  const metrics = new Map<string, TaskScheduleMetrics>();
  const criticalPaths: string[][] = [];

  const liveTasks = (tasks || []).filter((t) => !t._deleted);

  if (liveTasks.length === 0) {
    return {
      criticalTaskIds,
      criticalDepKeys,
      nearCriticalTaskIds,
      projectEarlyFinish: "",
      projectLateFinish: "",
      projectTotalFloat: 0,
      criticalPaths,
      metrics
    };
  }

  const byId = new Map<string, Task>();
  const predMap = new Map<string, string[]>();
  const succMap = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const durationMap = new Map<string, number>();

  liveTasks.forEach((t) => {
    byId.set(t.id, t);
    predMap.set(t.id, []);
    succMap.set(t.id, []);
    inDegree.set(t.id, 0);
    const dur = Math.max(0, diffDays(t.start, t.end));
    durationMap.set(t.id, dur);
  });

  // Build clean graph edges
  tasks.forEach((t) => {
    const rawDeps = getTaskDependencies(t);
    const validDeps = rawDeps.filter((depId) => byId.has(depId) && depId !== t.id);
    predMap.set(t.id, validDeps);
    inDegree.set(t.id, validDeps.length);

    validDeps.forEach((depId) => {
      succMap.get(depId)!.push(t.id);
    });
  });

  // 1. Topological Sort via Kahn's Algorithm
  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const topologicalOrder: string[] = [];
  const inDegreeCopy = new Map(inDegree);

  while (queue.length > 0) {
    const currId = queue.shift()!;
    topologicalOrder.push(currId);

    const succs = succMap.get(currId) || [];
    for (const sId of succs) {
      const remaining = inDegreeCopy.get(sId)! - 1;
      inDegreeCopy.set(sId, remaining);
      if (remaining === 0) {
        queue.push(sId);
      }
    }
  }

  // Graceful cycle recovery: if cycles exist, append remaining nodes to prevent crashes
  if (topologicalOrder.length < tasks.length) {
    const visited = new Set(topologicalOrder);
    for (const t of tasks) {
      if (!visited.has(t.id)) {
        topologicalOrder.push(t.id);
      }
    }
  }

  // 2. Forward Pass: Compute ES and EF
  const earlyStartMap = new Map<string, string>();
  const earlyFinishMap = new Map<string, string>();
  const drivingPredsMap = new Map<string, string[]>();

  for (const taskId of topologicalOrder) {
    const task = byId.get(taskId)!;
    const preds = predMap.get(taskId) || [];
    const dur = durationMap.get(taskId)!;
    const defaultGap = options?.defaultGapDays ?? 0;
    const gap = getEffectiveGap(task, defaultGap);

    let calculatedES = task.start;

    if (preds.length > 0) {
      let maxCandidateES: string | null = null;
      for (const pId of preds) {
        const predEF = earlyFinishMap.get(pId) || byId.get(pId)!.end;
        const candidateES = addDays(predEF, gap);
        if (!maxCandidateES || diffDays(maxCandidateES, candidateES) > 0) {
          maxCandidateES = candidateES;
        }
      }
      if (maxCandidateES && diffDays(calculatedES, maxCandidateES) > 0) {
        calculatedES = maxCandidateES;
      }
    }

    // Determine driving predecessors
    const drivingPreds: string[] = [];
    if (preds.length > 0) {
      for (const pId of preds) {
        const predEF = earlyFinishMap.get(pId) || byId.get(pId)!.end;
        const expectedES = addDays(predEF, gap);
        if (diffDays(expectedES, calculatedES) === 0) {
          drivingPreds.push(pId);
        }
      }
    }

    earlyStartMap.set(taskId, calculatedES);
    earlyFinishMap.set(taskId, addDays(calculatedES, dur));
    drivingPredsMap.set(taskId, drivingPreds);
  }

  // Determine Project Early Finish (T_E)
  let projectEarlyFinish = tasks[0].end;
  tasks.forEach((t) => {
    const ef = earlyFinishMap.get(t.id) || t.end;
    if (diffDays(projectEarlyFinish, ef) > 0) {
      projectEarlyFinish = ef;
    }
  });

  // 3. Backward Pass: Compute LF and LS
  // Target date support (enables negative float when contractual deadline is breached)
  const projectLateFinish = options?.targetDate && options.targetDate.trim() !== ""
    ? options.targetDate.trim()
    : projectEarlyFinish;

  const lateFinishMap = new Map<string, string>();
  const lateStartMap = new Map<string, string>();

  // Process in reverse topological order
  const reversedOrder = [...topologicalOrder].reverse();

  for (const taskId of reversedOrder) {
    const succs = succMap.get(taskId) || [];
    const dur = durationMap.get(taskId)!;

    if (succs.length === 0) {
      // Terminal node (no successors)
      lateFinishMap.set(taskId, projectLateFinish);
    } else {
      let minCandidateLF: string | null = null;
      for (const sId of succs) {
        const succTask = byId.get(sId)!;
        const succLS = lateStartMap.get(sId)!;
        const defaultGap = options?.defaultGapDays ?? 0;
        const gap = getEffectiveGap(succTask, defaultGap);
        const candidateLF = addDays(succLS, -gap);

        if (!minCandidateLF || diffDays(candidateLF, minCandidateLF) > 0) {
          minCandidateLF = candidateLF;
        }
      }
      lateFinishMap.set(taskId, minCandidateLF || projectLateFinish);
    }

    const lf = lateFinishMap.get(taskId)!;
    lateStartMap.set(taskId, addDays(lf, -dur));
  }

  // 4. Compute Total Float (TF) & Free Float (FF)
  const totalFloatMap = new Map<string, number>();
  const freeFloatMap = new Map<string, number>();
  let minTotalFloat = Infinity;

  liveTasks.forEach((t) => {
    const es = earlyStartMap.get(t.id)!;
    const ls = lateStartMap.get(t.id)!;
    const ef = earlyFinishMap.get(t.id)!;
    const tf = diffDays(es, ls);
    totalFloatMap.set(t.id, tf);
    if (tf < minTotalFloat) {
      minTotalFloat = tf;
    }

    // Free Float: min_{s in succ}(s.ES - gap) - EF
    const succs = succMap.get(t.id) || [];
    if (succs.length === 0) {
      freeFloatMap.set(t.id, tf);
    } else {
      let minSuccGap = Infinity;
      for (const sId of succs) {
        const succTask = byId.get(sId)!;
        const succES = earlyStartMap.get(sId)!;
        const defaultGap = options?.defaultGapDays ?? 0;
        const gap = getEffectiveGap(succTask, defaultGap);
        const earliestAllowed = addDays(succES, -gap);
        const ffDelta = diffDays(ef, earliestAllowed);
        if (ffDelta < minSuccGap) {
          minSuccGap = ffDelta;
        }
      }
      freeFloatMap.set(t.id, Math.max(0, Math.min(tf, minSuccGap)));
    }
  });

  const projectTotalFloat = minTotalFloat === Infinity ? 0 : minTotalFloat;

  // 5. Critical & Near-Critical Classification
  const nearCriticalThreshold = options?.nearCriticalThresholdDays ?? 3;

  liveTasks.forEach((t) => {
    const tf = totalFloatMap.get(t.id)!;
    const isCritical = tf <= 0 || tf === minTotalFloat;
    const isNearCritical = !isCritical && tf - Math.min(0, minTotalFloat) <= nearCriticalThreshold;

    if (isCritical) {
      criticalTaskIds.add(t.id);
    } else if (isNearCritical) {
      nearCriticalTaskIds.add(t.id);
    }

    let slackLabel = `${tf}d buffer`;
    if (tf < 0) {
      slackLabel = `Overdue by ${Math.abs(tf)}d`;
    } else if (tf === 0) {
      slackLabel = "0d (Critical)";
    }

    metrics.set(t.id, {
      taskId: t.id,
      earlyStart: earlyStartMap.get(t.id)!,
      earlyFinish: earlyFinishMap.get(t.id)!,
      lateStart: lateStartMap.get(t.id)!,
      lateFinish: lateFinishMap.get(t.id)!,
      totalFloat: tf,
      freeFloat: freeFloatMap.get(t.id)!,
      isCritical,
      isNearCritical,
      drivingPredecessors: drivingPredsMap.get(t.id) || [],
      slackLabel
    });
  });

  // 6. Identify Driving Critical Dependency Links (A -> B)
  liveTasks.forEach((t) => {
    if (!criticalTaskIds.has(t.id)) return;
    const preds = predMap.get(t.id) || [];
    const tES = earlyStartMap.get(t.id)!;
    const defaultGap = options?.defaultGapDays ?? 0;
    const gap = getEffectiveGap(t, defaultGap);

    preds.forEach((pId) => {
      if (criticalTaskIds.has(pId)) {
        const pEF = earlyFinishMap.get(pId)!;
        const drivingDate = addDays(pEF, gap);
        if (diffDays(drivingDate, tES) === 0) {
          criticalDepKeys.add(`${pId}->${t.id}`);
        }
      }
    });
  });

  // 7. Assemble Contiguous Critical Path Sequences
  const criticalIncoming = new Map<string, number>();
  criticalTaskIds.forEach((id) => criticalIncoming.set(id, 0));
  criticalDepKeys.forEach((key) => {
    const [, to] = key.split("->");
    if (criticalIncoming.has(to)) {
      criticalIncoming.set(to, criticalIncoming.get(to)! + 1);
    }
  });

  const criticalStartNodes: string[] = [];
  criticalIncoming.forEach((count, id) => {
    if (count === 0) criticalStartNodes.push(id);
  });

  const criticalAdj = new Map<string, string[]>();
  criticalTaskIds.forEach((id) => criticalAdj.set(id, []));
  criticalDepKeys.forEach((key) => {
    const [from, to] = key.split("->");
    if (criticalAdj.has(from)) {
      criticalAdj.get(from)!.push(to);
    }
  });

  function tracePath(curr: string, currentPath: string[]) {
    const nexts = criticalAdj.get(curr) || [];
    if (nexts.length === 0) {
      criticalPaths.push([...currentPath]);
      return;
    }
    for (const next of nexts) {
      currentPath.push(next);
      tracePath(next, currentPath);
      currentPath.pop();
    }
  }

  for (const startId of criticalStartNodes) {
    tracePath(startId, [startId]);
  }

  return {
    criticalTaskIds,
    criticalDepKeys,
    nearCriticalTaskIds,
    projectEarlyFinish,
    projectLateFinish,
    projectTotalFloat,
    criticalPaths,
    metrics
  };
}
