/**
 * Schedule Health & Integrity Diagnostic Engine (selected DCMA 14-Point checks)
 *
 * Evaluates schedule quality, logic integrity, float distribution and progress sequencing.
 * Implemented DCMA checks: #1 logic (open ends), #2 leads, #3 lags, #4 relationship types,
 * #5 hard constraints (locked tasks), #6 high float, #7 negative float, #8 high duration.
 * Status-date, resource and baseline checks (#9 - #14) are not assessed here.
 * Additional checks: out-of-sequence progress and broken (dangling) dependency links.
 *
 * Each check is measured as a ratio over its eligible population (incomplete tasks or their
 * relationships) against the DCMA threshold, so the score reflects plan quality, not plan size.
 */

import { Task, CriticalPathResult, ScheduleHealthResult, ScheduleHealthIssue } from "./types";
import { diffDays } from "./date-math";
import { getTaskDependencyRelations, DependencyRelation } from "./dependencies";
import { WorkingCalendar, CalendarPreset, diffWorkingDays } from "./calendar";
import { isTaskDone } from "./utils";

export interface ScheduleHealthOptions {
  /**
   * Working calendar used to express float and duration in working days (DCMA thresholds are
   * working days). Without one, calendar days are converted at 5/7.
   */
  calendar?: WorkingCalendar | CalendarPreset;
}

export type ScheduleHealthCheckId =
  | "logic"
  | "leads"
  | "lags"
  | "relationship-types"
  | "hard-constraints"
  | "high-float"
  | "negative-float"
  | "high-duration"
  | "out-of-sequence"
  | "broken-links";

export interface ScheduleHealthCheck {
  id: ScheduleHealthCheckId;
  /** DCMA 14-Point check number, when the check maps to one. */
  dcmaCheck?: number;
  label: string;
  /** Size of the population the check applies to (tasks or relationships). */
  eligible: number;
  failed: number;
  /** failed / eligible (0 when nothing is eligible). */
  ratio: number;
  /** Highest ratio that still passes. */
  threshold: number;
  passed: boolean;
  /** Points deducted from the 100-point health score. */
  penalty: number;
}

/** Health audit result with per-check detail. */
export interface ScheduleHealthReport extends ScheduleHealthResult {
  outOfSequenceCount: number;
  brokenChainCount: number;
  checks: ScheduleHealthCheck[];
}

const DCMA_WORKING_DAY_LIMIT = 44;
/** A failing check costs at least a quarter of its weight, reaching the full weight 50 points past its threshold. */
const PENALTY_FLOOR_SHARE = 0.25;
const PENALTY_RAMP = 0.5;

/**
 * True when predecessor `pred` has progressed far enough for its successor to start
 * (`phase: "start"`) or finish (`phase: "finish"`) under link `rel`.
 * FS needs the predecessor finished (started is enough with a lead), SS needs it started,
 * FF constrains the successor's finish only, SF needs it started before the successor finishes.
 */
export function isDependencySatisfied(
  rel: DependencyRelation,
  pred: Task,
  phase: "start" | "finish"
): boolean {
  const predDone = isTaskDone(pred);
  const predStarted =
    predDone || (typeof pred.progress === "number" && pred.progress > 0) || pred.status === "in-progress";
  switch (rel.type) {
    case "SS":
      return phase === "finish" || predStarted;
    case "FF":
      return phase === "start" || predDone;
    case "SF":
      return phase === "start" || predStarted;
    default:
      return rel.lagDays < 0 ? predStarted : predDone;
  }
}

function buildCheck(
  id: ScheduleHealthCheckId,
  dcmaCheck: number | undefined,
  label: string,
  eligible: number,
  failed: number,
  threshold: number,
  weight: number
): ScheduleHealthCheck {
  const ratio = eligible > 0 ? failed / eligible : 0;
  const passed = failed === 0 || ratio <= threshold;
  const severity = passed ? 0 : Math.min(1, (ratio - threshold) / PENALTY_RAMP);
  const penalty = passed ? 0 : weight * (PENALTY_FLOOR_SHARE + (1 - PENALTY_FLOOR_SHARE) * severity);
  return {
    id,
    ...(dcmaCheck !== undefined ? { dcmaCheck } : {}),
    label,
    eligible,
    failed,
    ratio: Math.round(ratio * 1000) / 1000,
    threshold,
    passed,
    penalty: Math.round(penalty * 10) / 10
  };
}

/**
 * Audits a project schedule against PM and DCMA industry best practices.
 *
 * @param tasks - The array of tasks.
 * @param criticalResult - Pre-computed CPM result.
 * @param options - Optional working calendar for working-day thresholds.
 * @returns Diagnostic score (0-100), letter grade (A-F), per-check detail and actionable issues.
 */
export function auditScheduleIntegrity(
  tasks: Task[],
  criticalResult: CriticalPathResult,
  options?: ScheduleHealthOptions
): ScheduleHealthReport {
  const issues: ScheduleHealthIssue[] = [];

  const liveTasks = (Array.isArray(tasks) ? tasks : []).filter((t) => t && !t._deleted);

  if (liveTasks.length === 0) {
    return {
      healthScore: 100,
      grade: "A",
      summary: "No tasks to audit",
      issues: [],
      missingLogicCount: 0,
      negativeFloatCount: 0,
      highFloatCount: 0,
      totalTasksChecked: 0,
      outOfSequenceCount: 0,
      brokenChainCount: 0,
      checks: []
    };
  }

  const calendar = options?.calendar;
  const cpmMetrics = criticalResult?.metrics instanceof Map ? criticalResult.metrics : undefined;
  const toWorkingDays = (from: string, to: string, calendarDays: number): number =>
    calendar ? diffWorkingDays(from, to, calendar) : (calendarDays * 5) / 7;
  const nameOf = (t: Task) => t.label || t.name || t.id;

  const byId = new Map<string, Task>();
  liveTasks.forEach((t) => byId.set(t.id, t));

  // Resolve links once: valid relations per task, successor counts, and dangling references
  const relationsById = new Map<string, DependencyRelation[]>();
  const successorCount = new Map<string, number>();
  let referenceCount = 0;
  let brokenChainCount = 0;
  let projectStart = liveTasks[0].start;
  let projectFinish = liveTasks[0].end;

  for (const t of liveTasks) {
    if (diffDays(t.start, projectStart) > 0) projectStart = t.start;
    if (diffDays(projectFinish, t.end) > 0) projectFinish = t.end;

    const valid: DependencyRelation[] = [];
    for (const rel of getTaskDependencyRelations(t, byId)) {
      referenceCount++;
      if (rel.id === t.id || !byId.has(rel.id)) {
        brokenChainCount++;
        issues.push({
          type: "broken-chain",
          severity: "medium",
          taskId: t.id,
          taskName: nameOf(t),
          message: rel.id === t.id
            ? `Task "${nameOf(t)}" depends on itself.`
            : `Task "${nameOf(t)}" depends on "${rel.id}", which does not exist or was deleted.`,
          recommendation: "Remove the dangling link or point it at the intended predecessor."
        });
        continue;
      }
      valid.push(rel);
      successorCount.set(rel.id, (successorCount.get(rel.id) ?? 0) + 1);
    }
    relationsById.set(t.id, valid);
  }

  let incompleteCount = 0;
  let relationshipCount = 0;
  let leadCount = 0;
  let lagCount = 0;
  let nonFsCount = 0;
  let lockedCount = 0;
  let floatEligible = 0;
  let durationEligible = 0;
  let startedCount = 0;
  let missingLogicCount = 0;
  let negativeFloatCount = 0;
  let highFloatCount = 0;
  let highDurationCount = 0;
  let outOfSequenceCount = 0;

  for (const t of liveTasks) {
    const relations = relationsById.get(t.id) ?? [];
    const isDone = isTaskDone(t);
    const isStarted = isDone || (typeof t.progress === "number" && t.progress > 0) || t.status === "in-progress";

    if (!isDone) {
      incompleteCount++;

      // DCMA #2 - #4: relationship quality of incomplete work
      for (const rel of relations) {
        relationshipCount++;
        if (rel.lagDays < 0) leadCount++;
        else if (rel.lagDays > 0) lagCount++;
        if (rel.type !== "FS") nonFsCount++;
      }

      // DCMA #1: open ends (the project's start and finish activities are exempt)
      const missingPredecessor = relations.length === 0 && diffDays(projectStart, t.start) !== 0;
      const missingSuccessor = !successorCount.has(t.id) && diffDays(t.end, projectFinish) !== 0;
      if (missingPredecessor || missingSuccessor) {
        missingLogicCount++;
        const missing = missingPredecessor && missingSuccessor
          ? "has no predecessor and no successor"
          : missingPredecessor ? "has no predecessor" : "has no successor";
        issues.push({
          type: "missing-logic",
          severity: "medium",
          taskId: t.id,
          taskName: nameOf(t),
          message: `Task "${nameOf(t)}" ${missing} (open end in the schedule network).`,
          recommendation: "Link this task to its prerequisites and to the work it enables to establish schedule logic."
        });
      }

      // DCMA #5: hard constraints
      if (t.locked) lockedCount++;

      // DCMA #6 / #7: float
      const metrics = cpmMetrics?.get(t.id);
      if (metrics) {
        floatEligible++;
        const tf = metrics.totalFloat;
        if (tf < 0) {
          negativeFloatCount++;
          issues.push({
            type: "negative-float",
            severity: "high",
            taskId: t.id,
            taskName: nameOf(t),
            message: `Task "${nameOf(t)}" has negative float (${tf} days) and breaches the target completion date.`,
            recommendation: "Fast-track or compress durations along this driving chain to recover the contractual schedule."
          });
        } else if (tf > DCMA_WORKING_DAY_LIMIT) {
          // Task-level calendars already produce working-day totalFloat from CPM; avoid
          // shrinking them a second time by 5/7 when no project calendar option is passed.
          const hasTaskCalendar = Boolean(t.calendar || t.calendarId);
          const workingFloat = hasTaskCalendar
            ? tf
            : toWorkingDays(metrics.earlyStart, metrics.lateStart, diffDays(metrics.earlyStart, metrics.lateStart));
          if (workingFloat > DCMA_WORKING_DAY_LIMIT) {
            highFloatCount++;
            issues.push({
              type: "high-float",
              severity: "low",
              taskId: t.id,
              taskName: nameOf(t),
              message: `Task "${nameOf(t)}" has excessive float (${Math.round(workingFloat)} working days).`,
              recommendation: "Verify whether downstream successor dependencies are missing."
            });
          }
        }
      }

      // DCMA #8: high duration
      const calendarDuration = diffDays(t.start, t.end);
      if (!t.milestone && calendarDuration > 0) {
        durationEligible++;
        if (calendarDuration > DCMA_WORKING_DAY_LIMIT && toWorkingDays(t.start, t.end, calendarDuration) > DCMA_WORKING_DAY_LIMIT) {
          highDurationCount++;
        }
      }
    }

    // Out-of-sequence progress (link-type aware)
    if (isStarted) {
      startedCount++;
      for (const rel of relations) {
        const prereq = byId.get(rel.id)!;
        const violated =
          !isDependencySatisfied(rel, prereq, "start") || (isDone && !isDependencySatisfied(rel, prereq, "finish"));
        if (!violated) continue;
        outOfSequenceCount++;
        const requirement = rel.type === "SS" || rel.type === "SF" || rel.lagDays < 0 ? "has not started" : "is not finished";
        issues.push({
          type: "out-of-sequence",
          severity: "medium",
          taskId: t.id,
          taskName: nameOf(t),
          message: `Task "${nameOf(t)}" is ${isDone ? "finished" : "in progress"} while predecessor "${nameOf(prereq)}" ${requirement} (${rel.type} link).`,
          recommendation: "Review dependency relationships to ensure actual execution matches schedule logic."
        });
        break;
      }
    }
  }

  const checks: ScheduleHealthCheck[] = [
    buildCheck("logic", 1, "Missing logic", incompleteCount, missingLogicCount, 0.05, 40),
    buildCheck("leads", 2, "Leads (negative lag)", relationshipCount, leadCount, 0, 10),
    buildCheck("lags", 3, "Lags", relationshipCount, lagCount, 0.05, 5),
    buildCheck("relationship-types", 4, "Non-FS relationships", relationshipCount, nonFsCount, 0.1, 5),
    buildCheck("hard-constraints", 5, "Hard constraints (locked)", incompleteCount, lockedCount, 0.05, 5),
    buildCheck("high-float", 6, "High float (> 44 working days)", floatEligible, highFloatCount, 0.05, 10),
    buildCheck("negative-float", 7, "Negative float", floatEligible, negativeFloatCount, 0, 40),
    buildCheck("high-duration", 8, "High duration (> 44 working days)", durationEligible, highDurationCount, 0.05, 10),
    buildCheck("out-of-sequence", undefined, "Out-of-sequence progress", startedCount, outOfSequenceCount, 0, 10),
    buildCheck("broken-links", undefined, "Broken dependency links", referenceCount, brokenChainCount, 0, 20)
  ];

  const totalPenalty = checks.reduce((sum, c) => sum + c.penalty, 0);
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));

  let grade: "A" | "B" | "C" | "D" | "F" = "A";
  if (healthScore < 60) grade = "F";
  else if (healthScore < 70) grade = "D";
  else if (healthScore < 80) grade = "C";
  else if (healthScore < 90) grade = "B";

  const failing = checks.filter((c) => !c.passed).sort((a, b) => b.penalty - a.penalty);
  const findings = failing
    .slice(0, 3)
    .map((c) => `${c.label} (${c.failed} of ${c.eligible})`)
    .join(", ");
  let summary: string;
  if (failing.length === 0) {
    summary = `Schedule health is strong: all ${checks.length} checks pass.`;
  } else if (grade === "A" || grade === "B") {
    summary = `Schedule is in good shape with minor findings: ${findings}.`;
  } else if (grade === "C") {
    summary = `Schedule needs attention: ${findings}.`;
  } else {
    summary = `Schedule has significant integrity issues: ${findings}.`;
  }

  return {
    healthScore,
    grade,
    summary,
    issues,
    missingLogicCount,
    negativeFloatCount,
    highFloatCount,
    totalTasksChecked: liveTasks.length,
    outOfSequenceCount,
    brokenChainCount,
    checks
  };
}
