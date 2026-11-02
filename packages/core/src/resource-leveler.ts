/**
 * Autonomous Resource Leveling Heuristic Engine
 *
 * Resolves resource over-allocations across concurrent tasks using
 * Operations Research heuristics, Critical Path Method (CPM) total float,
 * task priorities, and dependency-preserving cascading.
 * Strictly zero external dependencies.
 */

import { Task, CriticalPathResult } from "./types";
import { addDays, diffDays } from "./date-math";
import { calculateCriticalPath } from "./cpm";
import { resolveSchedule } from "./resolver";
import { DEFAULT_GAP_DAYS } from "./constants";
import { WorkingCalendar, addWorkingDays, diffWorkingDays } from "./calendar";

export interface ResourceAllocation {
  resourceId: string;
  date: string; // YYYY-MM-DD
  tasks: string[]; // Task IDs active on this date
  totalUnits: number; // Sum of allocation units (e.g. 2.0 = 200%)
  capacity: number; // Max allowed units (default 1.0)
  isOverallocated: boolean;
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
  /** Custom per-resource capacity limits, e.g. { "alice": 0.5 } for part-time (default: 1.0). */
  resourceCapacities?: Record<string, number>;
  /** Default gap days between tasks when shifting (default: 1). */
  defaultGapDays?: number;
  /** Whether working days should be respected during shifts. */
  useWorkingDays?: boolean;
  /** Working calendar to respect during shifts. */
  calendar?: WorkingCalendar;
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

/**
 * Extracts the allocation units requested by a task (default: 1.0).
 */
export function getTaskAllocationUnits(task: Task): number {
  if (typeof task.allocation === "number" && !isNaN(task.allocation)) {
    return Math.max(0, task.allocation);
  }
  if (
    task.fields &&
    typeof task.fields.allocation === "number" &&
    !isNaN(task.fields.allocation)
  ) {
    return Math.max(0, task.fields.allocation);
  }
  return 1.0;
}

/**
 * Detects all dates where a resource's total workload exceeds their capacity.
 */
export function detectOverAllocations(
  tasks: Task[],
  options?: ResourceLevelingOptions
): ResourceAllocation[] {
  const liveTasks = (tasks || []).filter((t) => !t._deleted && t.assignee);
  if (liveTasks.length === 0) return [];

  const defaultCapacity = options?.defaultCapacity ?? 1.0;
  const capacities = options?.resourceCapacities ?? {};

  // Group tasks by assignee
  const tasksByResource = new Map<string, Task[]>();
  for (const t of liveTasks) {
    const res = t.assignee!;
    if (!tasksByResource.has(res)) {
      tasksByResource.set(res, []);
    }
    tasksByResource.get(res)!.push(t);
  }

  const overallocations: ResourceAllocation[] = [];

  for (const [resourceId, resTasks] of tasksByResource.entries()) {
    const capacity = capacities[resourceId] ?? defaultCapacity;

    // Find date boundary for this resource
    let minDate = resTasks[0].start;
    let maxDate = resTasks[0].end;
    for (const t of resTasks) {
      if (diffDays(t.start, minDate) > 0) minDate = t.start;
      if (diffDays(maxDate, t.end) > 0) maxDate = t.end;
    }

    let curr = minDate;
    while (diffDays(curr, maxDate) >= 0) {
      const activeTasks: string[] = [];
      let totalUnits = 0;

      for (const t of resTasks) {
        // Task is active if start <= curr <= end
        if (diffDays(t.start, curr) >= 0 && diffDays(curr, t.end) >= 0) {
          activeTasks.push(t.id);
          totalUnits += getTaskAllocationUnits(t);
        }
      }

      if (totalUnits > capacity + 0.0001 && activeTasks.length > 1) {
        overallocations.push({
          resourceId,
          date: curr,
          tasks: activeTasks,
          totalUnits: Math.round(totalUnits * 100) / 100,
          capacity,
          isOverallocated: true
        });
      }

      curr = addDays(curr, 1);
    }
  }

  // Sort overallocations chronologically
  overallocations.sort((a, b) => a.date.localeCompare(b.date));
  return overallocations;
}

/**
 * Determines precedence between two conflicting tasks.
 * Returns negative if task A should proceed before task B.
 */
function compareLevelingPrecedence(
  a: Task,
  b: Task,
  cpm: CriticalPathResult
): number {
  // 1. Locked / milestone tasks cannot be deferred
  if (a.locked && !b.locked) return -1;
  if (!a.locked && b.locked) return 1;
  if (a.milestone && !b.milestone) return -1;
  if (!a.milestone && b.milestone) return 1;

  // 2. Priority ranking (urgent > high > medium > low)
  const aPrio = PRIORITY_SCORES[a.priority || "medium"] ?? 2;
  const bPrio = PRIORITY_SCORES[b.priority || "medium"] ?? 2;
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

/**
 * Autonomous Resource Leveling Heuristic.
 *
 * Iteratively shifts non-critical, lower-priority tasks when resource over-allocations occur,
 * attempting to preserve milestone gates and project completion within available CPM float.
 */
export function levelResources(
  tasks: Task[],
  options?: ResourceLevelingOptions
): LevelingResult {
  const liveTasks = (tasks || []).filter((t) => !t._deleted);
  if (liveTasks.length === 0) {
    return {
      tasks: [],
      adjustments: [],
      initialOverallocations: [],
      remainingOverallocations: [],
      projectDurationChanged: false,
      daysAdded: 0
    };
  }

  const initialFinish = getProjectFinish(liveTasks);
  const initialOverallocations = detectOverAllocations(liveTasks, options);
  if (initialOverallocations.length === 0) {
    return {
      tasks: liveTasks.map((t) => ({ ...t })),
      adjustments: [],
      initialOverallocations: [],
      remainingOverallocations: [],
      projectDurationChanged: false,
      daysAdded: 0
    };
  }

  const defaultGap = options?.defaultGapDays ?? DEFAULT_GAP_DAYS;
  const maxIterations = options?.maxIterations ?? 50;
  const useWorkingDays = options?.useWorkingDays ?? false;
  const calendar = options?.calendar;

  // Working copy of tasks
  let workingTasks: Task[] = liveTasks.map((t) => ({ ...t }));
  const adjustments: LevelingAdjustment[] = [];

  let pass = 0;
  while (pass < maxIterations) {
    pass++;
    const cpm = calculateCriticalPath(workingTasks);
    const conflicts = detectOverAllocations(workingTasks, options);
    if (conflicts.length === 0) {
      break;
    }

    // Pick earliest conflict
    const earliestConflict = conflicts[0];
    const conflictingTasks = workingTasks.filter((t) =>
      earliestConflict.tasks.includes(t.id)
    );

    // Sort to determine which task should keep its place
    conflictingTasks.sort((a, b) => compareLevelingPrecedence(a, b, cpm));

    // Winner is index 0; defer candidate is the first unlocked task starting from index 1
    const winner = conflictingTasks[0];
    const deferCandidate = conflictingTasks.slice(1).find((t) => !t.locked);

    if (!deferCandidate) {
      // All remaining tasks in this conflict are locked, cannot shift further
      break;
    }

    const prevStart = deferCandidate.start;
    const prevEnd = deferCandidate.end;
    const deferMetrics = cpm.metrics.get(deferCandidate.id);
    const durationDays = useWorkingDays && calendar
      ? Math.max(diffWorkingDays(prevStart, prevEnd, calendar), 0)
      : Math.max(diffDays(prevStart, prevEnd), 0);

    // Shift deferCandidate to start after winner ends + defaultGap
    const newStart = useWorkingDays && calendar
      ? addWorkingDays(winner.end, defaultGap, calendar)
      : addDays(winner.end, defaultGap);

    const newEnd = useWorkingDays && calendar
      ? addWorkingDays(newStart, durationDays, calendar)
      : addDays(newStart, durationDays);

    const shiftAmount = diffDays(prevStart, newStart);
    if (shiftAmount <= 0) {
      // Cannot make forward progress on this pair
      break;
    }

    deferCandidate.start = newStart;
    deferCandidate.end = newEnd;

    const availableFloat = deferMetrics?.totalFloat ?? 0;
    const withinFloat = shiftAmount <= availableFloat;

    adjustments.push({
      taskId: deferCandidate.id,
      resourceId: earliestConflict.resourceId,
      previousStart: prevStart,
      previousEnd: prevEnd,
      newStart,
      newEnd,
      delayDays: shiftAmount,
      reason: `Shifted to resolve resource contention with higher priority task '${winner.id}' (${winner.label || winner.id}) on ${earliestConflict.date}`,
      withinFloat
    });

    // Cascade downstream dependencies using the schedule resolver
    workingTasks = resolveSchedule(workingTasks, defaultGap);
  }

  const finalFinish = getProjectFinish(workingTasks);
  const remainingOverallocations = detectOverAllocations(workingTasks, options);
  const daysAdded = Math.max(0, diffDays(initialFinish, finalFinish));
  const projectDurationChanged = daysAdded > 0;

  return {
    tasks: workingTasks,
    adjustments,
    initialOverallocations,
    remainingOverallocations,
    projectDurationChanged,
    daysAdded
  };
}
