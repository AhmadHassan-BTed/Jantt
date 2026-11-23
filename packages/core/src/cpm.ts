/**
 * Critical Path Method (CPM) Engine
 *
 * Implements rigorous 2-pass Activity-On-Node (AON) graph analysis:
 * 1. Topological order from the shared dependency graph (cycles are isolated, never followed)
 * 2. Forward Pass: Computes Earliest Start (ES) and Earliest Finish (EF)
 * 3. Backward Pass: Computes Latest Finish (LF) and Latest Start (LS)
 * 4. Float Metrics: Total Float (TF) and Free Float (FF)
 * 5. Critical & Near-Critical identification
 * 6. Driving critical dependency link detection and contiguous path assembly
 *
 * Honors FS/SS/FF/SF links with lead/lag exactly like the cascade (same lag/gap rule, same
 * default gap), so the critical path matches the dates the cascade produced. Dates are handled
 * as integer day numbers internally; durations are `end - start` days and milestones are 0.
 */

import { Task, CriticalPathResult, CriticalPathOptions, TaskScheduleMetrics } from "./types";
import { toEpochDay, fromEpochDay, parseISODate, isValidISODate } from "./date-math";
import { addWorkingDays, diffWorkingDays, getPreviousWorkingDay, resolveTaskCalendar, type WorkingCalendar } from "./calendar";
import { getEffectiveGap } from "./utils";
import { DEFAULT_GAP_DAYS } from "./constants";
import {
  DependencyType,
  buildDependencyGraph,
  getTaskDependencyRelations,
  resolveRelationLag,
  relationEarliestStartDay,
  isStartAnchoredRelation,
  isFinishConstrainedRelation
} from "./dependencies";

/** Upper bound on materialized critical paths (path counts can grow exponentially). */
export const MAX_CRITICAL_PATHS = 25;

const DAY_MS = 86400000;

/**
 * Normalizes task dependencies into a clean string array of predecessor ids.
 * Supports string, string[], comma-separated, or structured object formats.
 *
 * Read-only: the ids carry no link type or lag, so never rebuild `dependsOn` from this list.
 * Use `filterDependsOn` / `appendDependency` (dependencies.ts) to remove or add links; they keep
 * every other item exactly as written.
 */
export function getTaskDependencies(task: Task | { dependsOn?: unknown }): string[] {
  return getTaskDependencyRelations(task).map((rel) => rel.id);
}

interface CpmEdge {
  from: number;
  to: number;
  type: DependencyType;
  lag: number;
}

/** Epoch day of an ISO date; invalid dates use the lenient parser so every task gets metrics. */
function dayOf(iso: string, invalid: Set<string>, taskId: string): number {
  const day = toEpochDay(iso);
  if (!Number.isNaN(day)) return day;
  invalid.add(taskId);
  return Math.round(parseISODate(iso).getTime() / DAY_MS);
}

/**
 * Calculates the Critical Path of a task network using rigorous 2-Pass Activity-On-Node (AON)
 * operations research methodology.
 *
 * @param tasks - The array of tasks to analyze.
 * @param options - Optional target completion date, near-critical float threshold, and gap days
 *   (defaults to DEFAULT_GAP_DAYS, the same default the cascade uses).
 * @returns Complete CriticalPathResult with sets, metrics maps, and ordered paths.
 */
export function calculateCriticalPath(tasks: Task[], options?: CriticalPathOptions): CriticalPathResult {
  const criticalTaskIds = new Set<string>();
  const criticalDepKeys = new Set<string>();
  const nearCriticalTaskIds = new Set<string>();
  const metrics = new Map<string, TaskScheduleMetrics>();
  const criticalPaths: string[][] = [];
  const warnings: string[] = [];

  const graph = buildDependencyGraph(tasks);
  const ids = graph.order; // topological order: every edge goes from a lower to a higher index
  const n = ids.length;

  if (n === 0) {
    return {
      criticalTaskIds,
      criticalDepKeys,
      nearCriticalTaskIds,
      projectEarlyFinish: "",
      projectLateFinish: "",
      projectTotalFloat: 0,
      criticalPaths,
      metrics,
      warnings
    };
  }

  const rawGap = options?.defaultGapDays;
  const defaultGap = typeof rawGap === "number" && Number.isFinite(rawGap) ? rawGap : DEFAULT_GAP_DAYS;
  const position = new Map<string, number>();
  ids.forEach((id, i) => position.set(id, i));

  const calendars: (WorkingCalendar | undefined)[] = [];
  const projectCalendar = options?.calendar;
  const calendarContext = {
    people: options?.people,
    calendars: options?.calendars,
    defaultCalendar: typeof projectCalendar === "string" ? options?.calendars?.[projectCalendar] ?? projectCalendar : projectCalendar
  };
  const shift = (i: number, day: number, days: number) => {
    const calendar = calendars[i];
    if (!calendar) return day + days;
    const shifted = toEpochDay(addWorkingDays(fromEpochDay(day), days, calendar));
    return Number.isNaN(shifted) ? day + days : shifted;
  };
  const difference = (i: number, from: number, to: number) => {
    const calendar = calendars[i];
    if (!calendar) return to - from;
    const startDate = fromEpochDay(from);
    const endDate = fromEpochDay(to);
    return isValidISODate(startDate) && isValidISODate(endDate)
      ? diffWorkingDays(startDate, endDate, calendar)
      : to - from;
  };
  const previous = (i: number, day: number) => {
    const calendar = calendars[i];
    if (!calendar) return day;
    const snapped = toEpochDay(getPreviousWorkingDay(fromEpochDay(day), calendar));
    return Number.isNaN(snapped) ? day : snapped;
  };

  const start = new Float64Array(n);
  const dur = new Float64Array(n);
  const invalidDates = new Set<string>();
  const incoming: CpmEdge[][] = [];
  const outgoing: CpmEdge[][] = ids.map(() => []);

  for (let i = 0; i < n; i++) {
    const id = ids[i];
    const task = graph.nodes.get(id)!;
    const s = dayOf(task.start, invalidDates, id);
    const person = options?.people?.find((p) => p.id === task.assignee || p.name === task.assignee);
    const calendar = task.calendar || task.calendarId || person?.calendar || person?.calendarId || (options?.useWorkingDays ?? Boolean(options?.calendar))
      ? resolveTaskCalendar(task, calendarContext)
      : undefined;
    calendars.push(calendar);
    start[i] = shift(i, s, 0);
    dur[i] = task.milestone ? 0 : Math.max(0, difference(i, s, dayOf(task.end, invalidDates, id)));

    const gap = getEffectiveGap(task, defaultGap);
    const edges: CpmEdge[] = [];
    for (const rel of graph.predecessors.get(id)!) {
      if (graph.isCyclicEdge(rel.id, id)) continue;
      const edge: CpmEdge = { from: position.get(rel.id)!, to: i, type: rel.type, lag: resolveRelationLag(rel, gap) };
      edges.push(edge);
      outgoing[edge.from].push(edge);
    }
    incoming.push(edges);
  }

  if (invalidDates.size > 0) {
    warnings.push(`Tasks with invalid dates were analyzed using best-effort dates: ${Array.from(invalidDates).join(", ")}.`);
  }
  if (graph.cycles.length > 0) {
    warnings.push(`Dependency links inside cycles were ignored: ${graph.cycles.map((c) => c.join(" <-> ")).join("; ")}.`);
  }

  // 1. Forward Pass: ES = max(own start, every link's earliest allowed start); EF = ES + duration
  const es = new Float64Array(n);
  const ef = new Float64Array(n);
  const forwardCandidate = (e: CpmEdge) => {
    if (!calendars[e.to]) return relationEarliestStartDay(e.type, es[e.from], ef[e.from], dur[e.to], e.lag);
    const anchor = isStartAnchoredRelation(e.type) ? es[e.from] : ef[e.from];
    const shifted = shift(e.to, anchor, e.lag);
    return isFinishConstrainedRelation(e.type) ? shift(e.to, shifted, -dur[e.to]) : shifted;
  };
  let projectEF = -Infinity;
  for (let i = 0; i < n; i++) {
    let value = start[i];
    for (const e of incoming[i]) {
      const candidate = forwardCandidate(e);
      if (candidate > value) value = candidate;
    }
    es[i] = value;
    ef[i] = shift(i, value, dur[i]);
    if (ef[i] > projectEF) projectEF = ef[i];
  }

  // 2. Backward Pass (target date support enables negative float when a deadline is breached)
  let projectLF = projectEF;
  const target = options?.targetDate;
  if (target !== undefined && target !== null && target !== "") {
    if (typeof target === "string" && isValidISODate(target)) {
      projectLF = toEpochDay(target);
    } else {
      warnings.push(`Ignored invalid targetDate '${String(target)}' (expected YYYY-MM-DD).`);
    }
  }

  const latestPredecessorStart = (edge: CpmEdge, successorStart: number, successorFinish: number) => {
    const limit = isFinishConstrainedRelation(edge.type) ? successorFinish : successorStart;
    const lag = calendars[edge.to] ? Math.round(edge.lag) : edge.lag;
    let anchor = limit - lag;
    if (calendars[edge.to] && lag !== 0) {
      // A working-day lag counts from the day after (or before) the anchor.
      anchor = shift(edge.to, limit, 1 - lag) - 1;
    }
    const latestAnchor = previous(edge.from, anchor);
    return isStartAnchoredRelation(edge.type) ? latestAnchor : shift(edge.from, latestAnchor, -dur[edge.from]);
  };

  const lf = new Float64Array(n);
  const ls = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let value = shift(i, previous(i, projectLF), -dur[i]);
    for (const edge of outgoing[i]) {
      const candidate = latestPredecessorStart(edge, ls[edge.to], lf[edge.to]);
      if (candidate < value) value = candidate;
    }
    ls[i] = value;
    lf[i] = shift(i, value, dur[i]);
  }

  // 3. Total Float & Free Float
  const totalFloat = new Float64Array(n);
  let minTotalFloat = Infinity;
  for (let i = 0; i < n; i++) {
    totalFloat[i] = difference(i, es[i], ls[i]);
    if (totalFloat[i] < minTotalFloat) minTotalFloat = totalFloat[i];
  }
  const projectTotalFloat = minTotalFloat === Infinity ? 0 : minTotalFloat;

  // 4. Critical & Near-Critical Classification (near-critical is measured from the critical float)
  const nearCriticalThreshold = options?.nearCriticalThresholdDays ?? 3;
  const criticalFloatRef = Math.max(minTotalFloat, 0);
  const isCritical = new Uint8Array(n);
  const isDriving = (e: CpmEdge) => forwardCandidate(e) === es[e.to];

  graph.nodes.forEach((_task, id) => {
    const i = position.get(id)!;
    const tf = totalFloat[i];
    const critical = tf <= 0 || tf === minTotalFloat;
    const nearCritical = !critical && tf - criticalFloatRef <= nearCriticalThreshold;
    isCritical[i] = critical ? 1 : 0;
    if (critical) criticalTaskIds.add(id);
    else if (nearCritical) nearCriticalTaskIds.add(id);

    let freeFloat = tf;
    if (outgoing[i].length > 0) {
      let minSlack = Infinity;
      for (const e of outgoing[i]) {
        const slack = difference(i, es[i], latestPredecessorStart(e, es[e.to], ef[e.to]));
        if (slack < minSlack) minSlack = slack;
      }
      freeFloat = Math.max(0, Math.min(tf, minSlack));
    }

    let slackLabel = `${tf}d buffer`;
    if (tf < 0) {
      slackLabel = `Overdue by ${Math.abs(tf)}d`;
    } else if (tf === 0) {
      slackLabel = "0d (Critical)";
    } else if (critical) {
      slackLabel = `Critical · ${tf}d to deadline`;
    }

    metrics.set(id, {
      taskId: id,
      earlyStart: fromEpochDay(es[i]),
      earlyFinish: fromEpochDay(ef[i]),
      lateStart: fromEpochDay(ls[i]),
      lateFinish: fromEpochDay(lf[i]),
      totalFloat: tf,
      freeFloat,
      isCritical: critical,
      isNearCritical: nearCritical,
      drivingPredecessors: incoming[i].filter(isDriving).map((e) => ids[e.from]),
      slackLabel
    });
  });

  // 5. Driving Critical Dependency Links (A -> B): both ends critical and the link drives B's ES
  const criticalNext: number[][] = ids.map(() => []);
  const hasCriticalIncoming = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!isCritical[i]) continue;
    for (const e of incoming[i]) {
      if (!isCritical[e.from] || !isDriving(e)) continue;
      const key = `${ids[e.from]}->${ids[i]}`;
      if (criticalDepKeys.has(key)) continue;
      criticalDepKeys.add(key);
      criticalNext[e.from].push(i);
      hasCriticalIncoming[i] = 1;
    }
  }

  // 6. Contiguous Critical Path Sequences (iterative DFS over a DAG, capped)
  let truncated = false;
  for (const id of criticalTaskIds) {
    const root = position.get(id)!;
    if (hasCriticalIncoming[root]) continue;
    const path: number[] = [root];
    const cursors: number[] = [0];
    while (path.length > 0) {
      const top = path.length - 1;
      const nexts = criticalNext[path[top]];
      if (nexts.length === 0) {
        if (criticalPaths.length >= MAX_CRITICAL_PATHS) {
          truncated = true;
          break;
        }
        criticalPaths.push(path.map((p) => ids[p]));
      }
      if (cursors[top] < nexts.length) {
        path.push(nexts[cursors[top]++]);
        cursors.push(0);
      } else {
        path.pop();
        cursors.pop();
      }
    }
    if (truncated) break;
  }
  if (truncated) {
    warnings.push(`Critical path listing truncated to ${MAX_CRITICAL_PATHS} paths.`);
  }

  return {
    criticalTaskIds,
    criticalDepKeys,
    nearCriticalTaskIds,
    projectEarlyFinish: fromEpochDay(projectEF),
    projectLateFinish: fromEpochDay(projectLF),
    projectTotalFloat,
    criticalPaths,
    metrics,
    warnings
  };
}
