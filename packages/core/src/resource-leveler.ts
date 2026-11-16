/**
 * Autonomous Resource Leveling Heuristic Engine
 *
 * Resolves resource over-allocations across concurrent tasks using
 * Operations Research heuristics, Critical Path Method (CPM) total float,
 * task priorities, and dependency-preserving cascading.
 *
 * Conventions (shared with the resolver, CPM and Monte Carlo engines):
 * - A task loads its resource on [start, end): the end date is exclusive, so a same-day
 *   finish-to-start handoff is not a conflict.
 * - Completed work is history: it carries no load and is never moved. Started, locked and
 *   milestone tasks are never deferred; milestones carry no load unless an allocation is set.
 * - A deferred task moves to the earliest slot where its resource has capacity, `defaultGapDays`
 *   after the work it yields to; successors are cascaded with the plan's gap and calendars, and
 *   every task moved by that cascade is reported as an adjustment.
 * Strictly zero external dependencies.
 */

import { Task, CriticalPathResult, Person } from "./types";
import { addDays, diffDays, formatISODate, parseISODate } from "./date-math";
import { calculateCriticalPath } from "./cpm";
import { DEFAULT_GAP_DAYS } from "./constants";
import { WorkingCalendar, addWorkingDays, diffWorkingDays, resolveTaskCalendar } from "./calendar";
import { CascadeResolveStage } from "./pipeline/stages/cascade-resolve-stage";
import { PipelineContext } from "./pipeline/contracts";
import { isTaskDone } from "./utils";
import { resolvePersonById } from "./team-resolver";

export interface ResourceAllocation {
  resourceId: string;
  date: string; // YYYY-MM-DD
  tasks: string[]; // Task IDs active on this date
  totalUnits: number; // Sum of allocation units (e.g. 2.0 = 200%)
  capacity: number; // Max allowed units (default 1.0)
  isOverallocated: boolean;
  /** Set when a single task alone exceeds the capacity: shifting cannot fix it. */
  reason?: "single-task-exceeds-capacity";
}

export interface LevelingAdjustment {
  taskId: string;
  resourceId: string;
  previousStart: string;
  previousEnd: string;
  newStart: string;
  newEnd: string;
  delayDays: number;
  reason: string;
  withinFloat: boolean;
}

export interface ResourceLevelingOptions {
  /** Maximum units a resource can be assigned per day before being overallocated (default: 1.0). */
  defaultCapacity?: number;
  /**
   * Custom per-resource capacity limits, e.g. { "alice": 0.5 } for part-time (default: 1.0).
   * Keys may be a person id, username or name; they are matched like task assignees.
   */
  resourceCapacities?: Record<string, number>;
  /**
   * Gap (days) between a deferred task and the work it yields to; also used to cascade
   * successors. Pass `meta.defaultGapDays` so the cascade matches the plan (default: 2).
   */
  defaultGapDays?: number;
  /** Whether working days should be respected during shifts (default: true when `calendar` is set). */
  useWorkingDays?: boolean;
  /** Working calendar to respect during shifts. */
  calendar?: WorkingCalendar;
  /** Named working calendars referenced by tasks or people (`JanttData.calendars`). */
  calendars?: Record<string, WorkingCalendar>;
  /**
   * Team members: lets one person be recognised under different assignee spellings
   * (id, username, name) and supplies per-person calendars.
   */
  people?: Person[];
  /** Maximum leveling iteration passes to prevent infinite loops (default: 50). */
  maxIterations?: number;
}

export interface LevelingResult {
  tasks: Task[];
  adjustments: LevelingAdjustment[];
  initialOverallocations: ResourceAllocation[];
  remainingOverallocations: ResourceAllocation[];
  projectDurationChanged: boolean;
  daysAdded: number;
}

const PRIORITY_SCORES: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

const DAY_MS = 86400000;
const LOAD_EPSILON = 0.0001;
/** Longest run of consecutive over-allocated days reported per overload, so a typo'd far-future date cannot flood the output. */
const MAX_REPORTED_DAYS_PER_OVERLOAD = 3660;

const toDayNumber = (iso: string): number => Math.round(parseISODate(iso).getTime() / DAY_MS);
const fromDayNumber = (day: number): string => formatISODate(new Date(day * DAY_MS));

/** Explicit allocation units of a task, or undefined when none is set. */
function readAllocation(task: Task): number | undefined {
  if (typeof task.allocation === "number" && Number.isFinite(task.allocation)) {
    return Math.max(0, task.allocation);
  }
  const fieldValue = task.fields?.allocation;
  if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
    return Math.max(0, fieldValue);
  }
  return undefined;
}

/**
 * Extracts the allocation units requested by a task (default: 1.0).
 */
export function getTaskAllocationUnits(task: Task): number {
  return readAllocation(task) ?? 1.0;
}

const isMilestone = (task: Task): boolean => Boolean(task.milestone) || diffDays(task.start, task.end) <= 0;

/** Started or completed work: its dates are actuals and must not be rewritten. */
const isInFlight = (task: Task): boolean =>
  isTaskDone(task) || (typeof task.progress === "number" && task.progress > 0) || task.status === "in-progress";

/** Tasks the leveler never defers. */
const isImmovable = (task: Task): boolean => Boolean(task.locked) || isMilestone(task) || isInFlight(task);

interface ResourceRef {
  /** Grouping key: one per real-world resource. */
  key: string;
  /** Reported resource id: the person id when known, else the assignee as written. */
  resourceId: string;
}

function describeResource(assignee: unknown, people?: Person[]): ResourceRef | null {
  if (typeof assignee !== "string" || !assignee.trim()) return null;
  const trimmed = assignee.trim();
  const person = resolvePersonById(people, trimmed);
  return person
    ? { key: `id:${person.id}`, resourceId: person.id }
    : { key: `name:${trimmed.toLowerCase()}`, resourceId: trimmed };
}

interface LoadInterval {
  task: Task;
  order: number;
  start: number; // day number, inclusive
  end: number; // day number, exclusive
  units: number;
}

/** The days a task loads its resource, or null when it carries no load. */
function toLoadInterval(task: Task, order: number): LoadInterval | null {
  if (isTaskDone(task)) return null;
  const explicit = readAllocation(task);
  const units = explicit ?? 1.0;
  if (units <= 0) return null;
  const start = toDayNumber(task.start);
  if (isMilestone(task)) {
    // Milestones carry no load unless an allocation is set explicitly (then: their single day)
    return explicit === undefined ? null : { task, order, start, end: start + 1, units };
  }
  return { task, order, start, end: toDayNumber(task.end), units };
}

interface ResourceGroup extends ResourceRef {
  tasks: Task[];
}

function groupByResource(tasks: Task[], people?: Person[]): Map<string, ResourceGroup> {
  const groups = new Map<string, ResourceGroup>();
  const refs = new Map<string, ResourceRef | null>(); // one resolution per distinct assignee
  for (const t of tasks) {
    if (!t || t._deleted || typeof t.assignee !== "string") continue;
    let ref = refs.get(t.assignee);
    if (ref === undefined) {
      ref = describeResource(t.assignee, people);
      refs.set(t.assignee, ref);
    }
    if (!ref) continue;
    const group = groups.get(ref.key);
    if (group) group.tasks.push(t);
    else groups.set(ref.key, { ...ref, tasks: [t] });
  }
  return groups;
}

function createCapacityLookup(options?: ResourceLevelingOptions): (key: string) => number {
  const rawDefault = options?.defaultCapacity;
  const defaultCapacity = typeof rawDefault === "number" && Number.isFinite(rawDefault) && rawDefault >= 0 ? rawDefault : 1.0;
  const byKey = new Map<string, number>();
  for (const [name, value] of Object.entries(options?.resourceCapacities ?? {})) {
    const ref = describeResource(name, options?.people);
    if (ref && typeof value === "number" && Number.isFinite(value) && value >= 0) byKey.set(ref.key, value);
  }
  return (key) => byKey.get(key) ?? defaultCapacity;
}

/** Sweep line over one resource's load, appending one entry per over-allocated day. */
function appendOverloadedDays(
  out: ResourceAllocation[],
  resourceId: string,
  intervals: LoadInterval[],
  capacity: number
): void {
  const events: Array<{ day: number; interval: LoadInterval; opens: boolean }> = [];
  for (const interval of intervals) {
    events.push({ day: interval.start, interval, opens: true }, { day: interval.end, interval, opens: false });
  }
  events.sort((a, b) => a.day - b.day);

  const active = new Set<LoadInterval>();
  let i = 0;
  while (i < events.length) {
    const day = events[i].day;
    for (; i < events.length && events[i].day === day; i++) {
      if (events[i].opens) active.add(events[i].interval);
      else active.delete(events[i].interval);
    }
    if (active.size === 0 || i >= events.length) continue;

    let units = 0;
    for (const interval of active) units += interval.units;
    if (units <= capacity + LOAD_EPSILON) continue;

    const taskIds = [...active].sort((a, b) => a.order - b.order).map((interval) => interval.task.id);
    const lastDay = Math.min(events[i].day, day + MAX_REPORTED_DAYS_PER_OVERLOAD);
    for (let d = day; d < lastDay; d++) {
      out.push({
        resourceId,
        date: fromDayNumber(d),
        tasks: [...taskIds],
        totalUnits: Math.round(units * 100) / 100,
        capacity,
        isOverallocated: true,
        ...(taskIds.length === 1 ? { reason: "single-task-exceeds-capacity" as const } : {})
      });
    }
  }
}

/**
 * Detects all dates where a resource's total workload exceeds their capacity, including days
 * where a single task alone exceeds it (flagged with `reason`).
 */
export function detectOverAllocations(
  tasks: Task[],
  options?: ResourceLevelingOptions
): ResourceAllocation[] {
  const groups = groupByResource(Array.isArray(tasks) ? tasks : [], options?.people);
  if (groups.size === 0) return [];
  const capacityOf = createCapacityLookup(options);

  const overallocations: ResourceAllocation[] = [];
  for (const group of groups.values()) {
    const intervals: LoadInterval[] = [];
    group.tasks.forEach((t, order) => {
      const interval = toLoadInterval(t, order);
      if (interval) intervals.push(interval);
    });
    appendOverloadedDays(overallocations, group.resourceId, intervals, capacityOf(group.key));
  }

  // Sort overallocations chronologically
  overallocations.sort((a, b) => a.date.localeCompare(b.date));
  return overallocations;
}

const priorityScore = (task: Task): number =>
  (typeof task.priority === "string" ? PRIORITY_SCORES[task.priority.toLowerCase()] : undefined) ?? (task.urgent ? 4 : 2);

/**
 * Determines precedence between two conflicting tasks.
 * Returns negative if task A should proceed before task B.
 */
function compareLevelingPrecedence(
  a: Task,
  b: Task,
  cpm: CriticalPathResult
): number {
  // 1. Locked / milestone / started tasks cannot be deferred
  const aFixed = isImmovable(a);
  const bFixed = isImmovable(b);
  if (aFixed !== bFixed) return aFixed ? -1 : 1;

  // 2. Priority ranking (urgent > high > medium > low)
  const aPrio = priorityScore(a);
  const bPrio = priorityScore(b);
  if (aPrio !== bPrio) {
    return bPrio - aPrio; // Higher score first
  }

  // 3. Critical path tasks have 0 total float and must not be deferred
  const aMetrics = cpm.metrics.get(a.id);
  const bMetrics = cpm.metrics.get(b.id);
  const aCritical = aMetrics?.isCritical ?? false;
  const bCritical = bMetrics?.isCritical ?? false;
  if (aCritical && !bCritical) return -1;
  if (!aCritical && bCritical) return 1;

  // 4. CPM Total Float: Smaller float has less flexibility
  const aFloat = aMetrics?.totalFloat ?? 0;
  const bFloat = bMetrics?.totalFloat ?? 0;
  if (aFloat !== bFloat) {
    return aFloat - bFloat; // Smaller float first
  }

  // 5. Scheduled start date (earlier start first)
  const startDiff = a.start.localeCompare(b.start);
  if (startDiff !== 0) return startDiff;

  // 6. Tie breaker
  return a.id.localeCompare(b.id);
}

/** Highest concurrent load of `intervals` within the day window [start, end). */
function peakLoad(intervals: LoadInterval[], start: number, end: number): number {
  const deltas: Array<[number, number]> = [];
  for (const interval of intervals) {
    if (interval.start < end && interval.end > start) {
      deltas.push([Math.max(interval.start, start), interval.units], [interval.end, -interval.units]);
    }
  }
  deltas.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // releases before claims on the same day
  let load = 0;
  let peak = 0;
  for (const [, delta] of deltas) {
    load += delta;
    if (load > peak) peak = load;
  }
  return peak;
}

/**
 * Computes project finish date (max end date across all live tasks).
 */
function getProjectFinish(tasks: Task[]): string {
  let finish = "";
  for (const t of tasks) {
    if (!t._deleted && (!finish || diffDays(finish, t.end) > 0)) {
      finish = t.end;
    }
  }
  return finish;
}

const cascadeStage = new CascadeResolveStage();

/**
 * Autonomous Resource Leveling Heuristic.
 *
 * Iteratively defers the lowest-precedence movable task of each over-allocation to the
 * earliest slot with capacity, attempting to preserve milestone gates and project completion
 * within available CPM float. Conflicts that cannot be fixed by shifting (all tasks fixed, or a
 * single task above capacity) are skipped and reported in `remainingOverallocations`.
 * Deleted tasks (tombstones) are returned untouched so CRDT reconciliation keeps them.
 */
export function levelResources(
  tasks: Task[],
  options?: ResourceLevelingOptions
): LevelingResult {
  const allTasks = (Array.isArray(tasks) ? tasks : []).filter(Boolean);
  const liveTasks = allTasks.filter((t) => !t._deleted);
  const withTombstones = (leveled: Task[]): Task[] => {
    const byId = new Map(leveled.map((t) => [t.id, t] as const));
    return allTasks.map((t) => (t._deleted ? { ...t } : byId.get(t.id) ?? { ...t }));
  };

  const initialOverallocations = liveTasks.length > 0 ? detectOverAllocations(liveTasks, options) : [];
  if (initialOverallocations.length === 0) {
    return {
      tasks: withTombstones(liveTasks.map((t) => ({ ...t }))),
      adjustments: [],
      initialOverallocations: [],
      remainingOverallocations: [],
      projectDurationChanged: false,
      daysAdded: 0
    };
  }

  const initialFinish = getProjectFinish(liveTasks);
  const defaultGap =
    typeof options?.defaultGapDays === "number" && Number.isFinite(options.defaultGapDays)
      ? options.defaultGapDays
      : DEFAULT_GAP_DAYS;
  const placementGap = Math.max(0, defaultGap);
  const maxIterations =
    typeof options?.maxIterations === "number" && Number.isFinite(options.maxIterations)
      ? Math.max(1, Math.floor(options.maxIterations))
      : 50;
  const people = options?.people;
  // Same rule as the cascade: an explicit `useWorkingDays: false` wins over a calendar
  const globalWorkingDays = options?.useWorkingDays ?? Boolean(options?.calendar);
  const calendarContext = { people, calendars: options?.calendars, defaultCalendar: options?.calendar };
  const cascadeContext: PipelineContext = {
    defaultGapDays: defaultGap,
    useWorkingDays: options?.useWorkingDays,
    calendar: options?.calendar,
    calendars: options?.calendars,
    people
  };
  const capacityOf = createCapacityLookup(options);

  /** Earliest later slot where `candidate` fits next to the other work of its resource. */
  const findSlot = (candidate: Task, others: LoadInterval[], capacity: number): { start: string; end: string } | null => {
    const units = getTaskAllocationUnits(candidate);
    const currentStart = toDayNumber(candidate.start);
    const taskCal = globalWorkingDays || candidate.calendar || candidate.calendarId
      ? resolveTaskCalendar(candidate, calendarContext)
      : null;
    const duration = taskCal
      ? Math.max(0, diffWorkingDays(candidate.start, candidate.end, taskCal))
      : Math.max(0, diffDays(candidate.start, candidate.end));

    // Capacity only frees up when other work ends, so those are the only candidate anchors
    const anchors = [...new Set(others.map((o) => o.end).filter((end) => end > currentStart))].sort((a, b) => a - b);
    for (const anchor of anchors) {
      const anchorDate = fromDayNumber(anchor);
      const start = taskCal ? addWorkingDays(anchorDate, placementGap, taskCal) : addDays(anchorDate, placementGap);
      const startDay = toDayNumber(start);
      if (startDay <= currentStart) continue;
      const end = taskCal ? addWorkingDays(start, duration, taskCal) : addDays(start, duration);
      const peak = peakLoad(others, startDay, Math.max(startDay + 1, toDayNumber(end)));
      // A task above capacity on its own can at best run alone
      if (peak <= LOAD_EPSILON || peak + units <= capacity + LOAD_EPSILON) return { start, end };
    }
    return null;
  };

  /** Cascades successors with the plan's gap and calendars; started/completed work stays put. */
  const cascade = (current: Task[]): Task[] => {
    const pinned = new Set(current.filter((t) => !t.locked && isInFlight(t)).map((t) => t.id));
    const input = pinned.size > 0 ? current.map((t) => (pinned.has(t.id) ? { ...t, locked: true } : t)) : current;
    const resolved = cascadeStage.process(input, cascadeContext);
    if (pinned.size === 0) return resolved;
    const originals = new Map(current.map((t) => [t.id, t] as const));
    return resolved.map((t) => (pinned.has(t.id) ? { ...originals.get(t.id)! } : t));
  };

  // Working copy of tasks
  let workingTasks: Task[] = liveTasks.map((t) => ({ ...t }));
  const adjustments: LevelingAdjustment[] = [];
  const unresolvable = new Set<string>();

  for (let pass = 0; pass < maxIterations; pass++) {
    const conflicts = detectOverAllocations(workingTasks, options);
    if (conflicts.length === 0) break;

    const cpm = calculateCriticalPath(workingTasks, { defaultGapDays: defaultGap });
    const byId = new Map(workingTasks.map((t) => [t.id, t] as const));
    const groups = groupByResource(workingTasks, people);

    // Earliest conflict that shifting can still resolve
    let deferral: { task: Task; slot: { start: string; end: string }; conflictDate: string; resourceId: string; yieldsTo: Task[] } | null = null;
    for (const conflict of conflicts) {
      const conflictKey = `${conflict.resourceId}|${[...conflict.tasks].sort().join(",")}`;
      if (unresolvable.has(conflictKey)) continue;

      const conflictingTasks = conflict.tasks
        .map((id) => byId.get(id))
        .filter((t): t is Task => Boolean(t))
        .sort((a, b) => compareLevelingPrecedence(a, b, cpm));

      if (conflictingTasks.length > 1) {
        // Defer the lowest-precedence movable task that has a slot
        for (let k = conflictingTasks.length - 1; k >= 0 && !deferral; k--) {
          const candidate = conflictingTasks[k];
          if (isImmovable(candidate)) continue;
          const ref = describeResource(candidate.assignee, people);
          const group = ref ? groups.get(ref.key) : undefined;
          if (!ref || !group) continue;
          const others: LoadInterval[] = [];
          group.tasks.forEach((t, order) => {
            const interval = t === candidate ? null : toLoadInterval(t, order);
            if (interval) others.push(interval);
          });
          const slot = findSlot(candidate, others, capacityOf(ref.key));
          if (slot) {
            deferral = {
              task: candidate,
              slot,
              conflictDate: conflict.date,
              resourceId: conflict.resourceId,
              yieldsTo: conflictingTasks.filter((t) => t !== candidate)
            };
          }
        }
      }
      if (deferral) break;
      unresolvable.add(conflictKey);
    }
    if (!deferral) break;

    const { task: deferred, slot, yieldsTo } = deferral;
    const prevStart = deferred.start;
    const prevEnd = deferred.end;
    const shiftAmount = diffDays(prevStart, slot.start);
    deferred.start = slot.start;
    deferred.end = slot.end;

    adjustments.push({
      taskId: deferred.id,
      resourceId: deferral.resourceId,
      previousStart: prevStart,
      previousEnd: prevEnd,
      newStart: slot.start,
      newEnd: slot.end,
      delayDays: shiftAmount,
      reason: `Deferred to resolve over-allocation of '${deferral.resourceId}' on ${deferral.conflictDate}; yields to higher-precedence ${yieldsTo.map((t) => `'${t.id}' (${t.label || t.name || t.id})`).join(", ")}`,
      withinFloat: shiftAmount <= (cpm.metrics.get(deferred.id)?.totalFloat ?? 0)
    });

    // Cascade downstream dependencies and report every task the cascade moved
    const beforeCascade = new Map(workingTasks.map((t) => [t.id, { start: t.start, end: t.end }] as const));
    workingTasks = cascade(workingTasks);
    for (const t of workingTasks) {
      const before = beforeCascade.get(t.id);
      if (!before || (before.start === t.start && before.end === t.end)) continue;
      const delay = diffDays(before.start, t.start);
      adjustments.push({
        taskId: t.id,
        resourceId: describeResource(t.assignee, people)?.resourceId ?? "",
        previousStart: before.start,
        previousEnd: before.end,
        newStart: t.start,
        newEnd: t.end,
        delayDays: delay,
        reason: `Dependency cascade after deferring '${deferred.id}'`,
        withinFloat: delay <= (cpm.metrics.get(t.id)?.totalFloat ?? 0)
      });
    }
  }

  const finalFinish = getProjectFinish(workingTasks);
  const remainingOverallocations = detectOverAllocations(workingTasks, options);
  const daysAdded = Math.max(0, diffDays(initialFinish, finalFinish));
  const projectDurationChanged = daysAdded > 0;

  return {
    tasks: withTombstones(workingTasks),
    adjustments,
    initialOverallocations,
    remainingOverallocations,
    projectDurationChanged,
    daysAdded
  };
}
