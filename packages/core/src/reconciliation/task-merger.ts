import { Task } from "../types";
import { compareCompositeTimestamps, readTimestamp } from "./timestamps";
import { canonicalFieldJson, recordContentHash, RECORD_SYNC_KEYS } from "./crdt-hash";

/**
 * Core planning fields of a task. The reconciler merges every key of a task (not only these);
 * the list is kept for consumers that display or audit PM fields.
 */
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

const EPOCH_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * True when two tasks have the same id, deletion state and content. Every key counts except CRDT
 * bookkeeping (fieldTimestamps, updatedAt, updatedBy, deletedAt); `dependsOn` compares by its
 * parsed links, and null/empty values equal missing ones.
 */
export function areTasksIdentical(t1: Task, t2: Task): boolean {
  if (t1 === t2) return true;
  if (!t1 || !t2) return false;
  if (t1.id !== t2.id) return false;
  if (Boolean(t1._deleted) !== Boolean(t2._deleted)) return false;
  return recordContentHash(t1) === recordContentHash(t2);
}

/**
 * Latest composite timestamp of a task: its `updatedAt` (with `updatedBy`) or any per-field stamp,
 * whichever is later. Malformed values are ignored; the epoch is returned when nothing is stamped.
 */
export function getLatestTaskTimestamp(t: Task): string {
  const updatedAt = readTimestamp(t?.updatedAt);
  let latest = updatedAt
    ? `${updatedAt}#${typeof t.updatedBy === "string" ? t.updatedBy : ""}`
    : EPOCH_TIMESTAMP;

  const stamps = t?.fieldTimestamps;
  if (stamps && typeof stamps === "object") {
    for (const ts of Object.values(stamps)) {
      if (compareCompositeTimestamps(ts, latest) > 0) latest = ts;
    }
  }
  return latest;
}

/**
 * Stamps every field of `next` that differs from `prev` (all keys, not a fixed list) with
 * `compositeTs` ("<ISO>#<clientId>") and sets updatedAt/updatedBy. For a new task (`prev`
 * undefined) every field with a value is stamped. Unchanged fields keep the later of their `prev`
 * and `next` stamps, so a stale copy never moves a stamp backwards. Returns `next` unchanged when
 * nothing differs.
 */
export function stampTaskFieldTimestamps(prev: Task | undefined, next: Task, compositeTs: string): Task {
  const keys = new Set(Object.keys(next));
  if (prev) Object.keys(prev).forEach((key) => keys.add(key));

  const current = next.fieldTimestamps;
  const stamps: Record<string, string> = current && typeof current === "object" ? { ...current } : {};
  let restamped = false;
  const previous = prev?.fieldTimestamps;
  if (previous && typeof previous === "object") {
    for (const [field, ts] of Object.entries(previous)) {
      if (compareCompositeTimestamps(ts, stamps[field]) > 0) {
        stamps[field] = ts;
        restamped = true;
      }
    }
  }

  let changed = false;
  for (const key of keys) {
    if (key === "id" || RECORD_SYNC_KEYS.has(key)) continue;
    const nextJson = canonicalFieldJson(key, next[key]);
    const differs = prev ? canonicalFieldJson(key, prev[key]) !== nextJson : nextJson !== "";
    if (differs) {
      stamps[key] = compositeTs;
      changed = true;
    }
  }
  if (!changed) return restamped ? { ...next, fieldTimestamps: stamps } : next;

  const hashIndex = compositeTs.indexOf("#");
  const updatedAt = hashIndex === -1 ? compositeTs : compositeTs.slice(0, hashIndex);
  const updatedBy = hashIndex === -1 ? next.updatedBy : compositeTs.slice(hashIndex + 1);
  return { ...next, fieldTimestamps: stamps, updatedAt, updatedBy };
}
