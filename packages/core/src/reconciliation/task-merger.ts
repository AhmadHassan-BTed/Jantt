import { Task } from "../types";
import { compareCompositeTimestamps } from "./timestamps";

export const PM_TASK_FIELDS: Array<keyof Task> = [
  "label",
  "name",
  "start",
  "end",
  "progress",
  "status",
  "category",
  "assignee",
  "person",
  "assignees",
  "dependsOn",
  "gapDays",
  "notes",
  "color",
  "priority",
  "urgent",
  "locked",
  "milestone",
  "wbs",
  "phase",
  "estimatedCost",
  "actualCost"
];

/**
 * Checks whether two tasks have identical values across all PM planning fields.
 */
export function areTasksIdentical(t1: Task, t2: Task): boolean {
  if (t1.id !== t2.id) return false;
  if ((t1.label || t1.name || "") !== (t2.label || t2.name || "")) return false;
  if (t1.start !== t2.start) return false;
  if (t1.end !== t2.end) return false;
  if (Number(t1.progress || 0) !== Number(t2.progress || 0)) return false;
  if ((t1.status || "not-started") !== (t2.status || "not-started")) return false;
  if ((t1.category || "") !== (t2.category || "")) return false;
  if ((t1.assignee || t1.person || "") !== (t2.assignee || t2.person || "")) return false;
  if (String(t1.dependsOn || "") !== String(t2.dependsOn || "")) return false;
  if ((t1.notes || "") !== (t2.notes || "")) return false;
  if ((t1.gapDays ?? 0) !== (t2.gapDays ?? 0)) return false;
  if ((t1.color || "") !== (t2.color || "")) return false;
  if (Boolean(t1.locked) !== Boolean(t2.locked)) return false;
  if (Boolean(t1.milestone) !== Boolean(t2.milestone)) return false;
  if (Boolean(t1._deleted) !== Boolean(t2._deleted)) return false;
  if ((t1.baseline?.start || "") !== (t2.baseline?.start || "")) return false;
  if ((t1.baseline?.end || "") !== (t2.baseline?.end || "")) return false;
  if ((t1.team || "") !== (t2.team || "")) return false;
  if (Number(t1.estimatedCost || 0) !== Number(t2.estimatedCost || 0)) return false;
  if (Number(t1.actualCost || 0) !== Number(t2.actualCost || 0)) return false;
  return true;
}

/**
 * Retrieves the latest field timestamp present across all fields of a task.
 */
export function getLatestTaskTimestamp(t: Task): string {
  let latest = t.updatedAt
    ? `${t.updatedAt}#${t.updatedBy || ""}`
    : "1970-01-01T00:00:00.000Z";

  if (t.fieldTimestamps) {
    for (const ts of Object.values(t.fieldTimestamps)) {
      if (ts && compareCompositeTimestamps(ts, latest) > 0) {
        latest = ts;
      }
    }
  }
  return latest;
}
