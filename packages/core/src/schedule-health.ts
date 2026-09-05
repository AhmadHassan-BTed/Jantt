/**
 * Schedule Health & Integrity Diagnostic Engine (DCMA 14-Point Inspired)
 *
 * Evaluates schedule quality, logic integrity, float distribution,
 * and critical path continuity to prevent surprises in project delivery.
 */

import { Task, CriticalPathResult, ScheduleHealthResult, ScheduleHealthIssue } from "./types";
import { getTaskDependencies } from "./cpm";
import { isTaskDone } from "./utils";

/**
 * Audits a project schedule against PM and DCMA industry best practices.
 *
 * @param tasks - The array of tasks.
 * @param criticalResult - Pre-computed CPM result.
 * @returns Diagnostic score (0-100), letter grade (A-F), and actionable recommendations.
 */
export function auditScheduleIntegrity(tasks: Task[], criticalResult: CriticalPathResult): ScheduleHealthResult {
  const issues: ScheduleHealthIssue[] = [];

  if (!tasks || tasks.length === 0) {
    return {
      healthScore: 100,
      grade: "A",
      summary: "No tasks to audit",
      issues: [],
      missingLogicCount: 0,
      negativeFloatCount: 0,
      highFloatCount: 0,
      totalTasksChecked: 0
    };
  }

  const byId = new Map<string, Task>();
  tasks.forEach((t) => byId.set(t.id, t));

  const succMap = new Map<string, string[]>();
  tasks.forEach((t) => succMap.set(t.id, []));

  tasks.forEach((t) => {
    const deps = getTaskDependencies(t);
    deps.forEach((dId) => {
      if (succMap.has(dId)) {
        succMap.get(dId)!.push(t.id);
      }
    });
  });

  let missingLogicCount = 0;
  let negativeFloatCount = 0;
  let highFloatCount = 0;
  let outOfSequenceCount = 0;

  tasks.forEach((t) => {
    const preds = getTaskDependencies(t);
    const succs = succMap.get(t.id) || [];
    const metrics = criticalResult.metrics?.get(t.id);
    const tf = metrics?.totalFloat ?? 0;
    const isDone = isTaskDone(t);
    const progress = t.progress ?? 0;

    // 1. Missing Logic (DCMA Check #1)
    // Non-milestone tasks with neither predecessor nor successor
    if (!t.milestone && preds.length === 0 && succs.length === 0 && tasks.length > 1) {
      missingLogicCount++;
      issues.push({
        type: "missing-logic",
        severity: "medium",
        taskId: t.id,
        taskName: t.label || t.name || t.id,
        message: `Task "${t.label || t.name || t.id}" is isolated with zero predecessors or successors.`,
        recommendation: "Link this task to its prerequisites or driving milestones to establish schedule logic."
      });
    }

    // 2. Negative Float (DCMA Check #7)
    if (tf < 0) {
      negativeFloatCount++;
      issues.push({
        type: "negative-float",
        severity: "high",
        taskId: t.id,
        taskName: t.label || t.name || t.id,
        message: `Task "${t.label || t.name || t.id}" has negative float (${tf} days) and breaches the target completion date.`,
        recommendation: "Fast-track or compress durations along this driving chain to recover the contractual schedule."
      });
    }

    // 3. High Float (DCMA Check #6: float > 44 working days)
    if (tf > 44) {
      highFloatCount++;
      issues.push({
        type: "high-float",
        severity: "low",
        taskId: t.id,
        taskName: t.label || t.name || t.id,
        message: `Task "${t.label || t.name || t.id}" has excessive float (${tf} days).`,
        recommendation: "Verify whether downstream successor dependencies are missing."
      });
    }

    // 4. Out-of-Sequence Work
    if ((isDone || progress > 0) && preds.length > 0) {
      for (const pId of preds) {
        const prereq = byId.get(pId);
        if (prereq && !isTaskDone(prereq) && (prereq.progress ?? 0) === 0) {
          outOfSequenceCount++;
          issues.push({
            type: "out-of-sequence",
            severity: "medium",
            taskId: t.id,
            taskName: t.label || t.name || t.id,
            message: `Task "${t.label || t.name || t.id}" is active or finished while predecessor "${prereq.label || prereq.name || prereq.id}" has not started.`,
            recommendation: "Review dependency relationships to ensure actual execution matches schedule logic."
          });
          break;
        }
      }
    }
  });

  // Calculate Health Score (0 - 100)
  let penalty = 0;
  penalty += missingLogicCount * 6;
  penalty += negativeFloatCount * 12;
  penalty += highFloatCount * 2;
  penalty += outOfSequenceCount * 5;

  const healthScore = Math.max(10, Math.min(100, 100 - penalty));

  let grade: "A" | "B" | "C" | "D" | "F" = "A";
  if (healthScore < 60) grade = "F";
  else if (healthScore < 70) grade = "D";
  else if (healthScore < 80) grade = "C";
  else if (healthScore < 90) grade = "B";

  let summary = "Schedule health is strong with sound network logic.";
  if (negativeFloatCount > 0) {
    summary = `Schedule has ${negativeFloatCount} task(s) with negative float violating target deadlines.`;
  } else if (missingLogicCount > 0) {
    summary = `Schedule has ${missingLogicCount} task(s) missing network dependency links.`;
  } else if (healthScore < 85) {
    summary = "Schedule logic has minor warnings that could be refined.";
  }

  return {
    healthScore,
    grade,
    summary,
    issues,
    missingLogicCount,
    negativeFloatCount,
    highFloatCount,
    totalTasksChecked: tasks.length
  };
}
