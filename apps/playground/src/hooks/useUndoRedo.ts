import { useState, useCallback, useRef, useEffect } from "react";
import { getTaskDependencyRelations, type JanttData, type Task } from "@jantt/core";
import { commandBus } from "../services/bus";
import { deleteTasks, getPeerId } from "../utils";

const MAX_HISTORY = 50;
/** Consecutive commits touching exactly the same fields within this window form one undo step. */
const COALESCE_WINDOW_MS = 800;

/** Bookkeeping fields that never count as a user change. */
const TASK_BOOKKEEPING_FIELDS = new Set(["fieldTimestamps", "updatedAt", "updatedBy"]);
/** Commit metadata rewritten on every commit; tombstones are handled with their tasks. */
const VOLATILE_META_FIELDS = new Set(["revision", "updatedAt", "contentHash", "sync", "tombstones"]);

interface TaskChange {
  id: string;
  /** Position of the task in the plan where it exists (used to re-insert it). */
  index: number;
  before: Task | null;
  after: Task | null;
}

interface ValueChange {
  key: string;
  before: unknown;
  after: unknown;
}

/**
 * One undo step: the inverse-able difference of a single local commit, not a full plan copy.
 * Applying it touches only what that commit changed, so later edits (including collaborators'
 * edits in a cloud room) to other tasks or fields survive undo and redo.
 */
export interface HistoryEntry {
  tasks: TaskChange[];
  root: ValueChange[];
  meta: ValueChange[];
  at: number;
}

function clone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>, ignored: Set<string>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  keys.forEach((k) => {
    if (!ignored.has(k) && !sameValue(a[k], b[k])) out.push(k);
  });
  return out;
}

function diffValues(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ignored: Set<string>
): ValueChange[] {
  return changedKeys(before, after, ignored).map((key) => ({
    key,
    before: clone(before[key]),
    after: clone(after[key])
  }));
}

/** Computes the history entry of a commit, or null when the commit changed nothing. */
export function diffPlans(before: JanttData, after: JanttData, at = Date.now()): HistoryEntry | null {
  const beforeTasks = before.tasks || [];
  const afterTasks = after.tasks || [];
  const afterMap = new Map(afterTasks.map((t) => [t.id, t]));
  const beforeIds = new Set<string>();
  const tasks: TaskChange[] = [];

  beforeTasks.forEach((b, index) => {
    beforeIds.add(b.id);
    const a = afterMap.get(b.id);
    if (a === b) return;
    if (!a) {
      if (!b._deleted) tasks.push({ id: b.id, index, before: clone(b), after: null });
      return;
    }
    if (changedKeys(b, a, TASK_BOOKKEEPING_FIELDS).length > 0) {
      tasks.push({ id: b.id, index, before: clone(b), after: clone(a) });
    }
  });
  afterTasks.forEach((a, index) => {
    if (!beforeIds.has(a.id)) tasks.push({ id: a.id, index, before: null, after: clone(a) });
  });

  const root = diffValues(before, after, new Set(["tasks", "meta"]));
  const meta = diffValues(
    (before.meta || {}) as Record<string, unknown>,
    (after.meta || {}) as Record<string, unknown>,
    VOLATILE_META_FIELDS
  );

  if (tasks.length === 0 && root.length === 0 && meta.length === 0) return null;
  return { tasks, root, meta, at };
}

function entrySignature(entry: HistoryEntry): string | null {
  const parts: string[] = [];
  for (const change of entry.tasks) {
    // Additions and removals are always their own undo step
    if (!change.before || !change.after) return null;
    parts.push(`t:${change.id}:${changedKeys(change.before, change.after, TASK_BOOKKEEPING_FIELDS).sort().join(",")}`);
  }
  entry.root.forEach((c) => parts.push(`r:${c.key}`));
  entry.meta.forEach((c) => parts.push(`m:${c.key}`));
  return parts.sort().join("|");
}

function coalesce(previous: HistoryEntry, next: HistoryEntry): HistoryEntry | null {
  if (next.at - previous.at > COALESCE_WINDOW_MS) return null;
  const signature = entrySignature(previous);
  if (signature === null || signature !== entrySignature(next)) return null;
  const pick = <T extends { before: unknown; after: unknown }>(prev: T[], curr: T[], keyOf: (c: T) => string): T[] =>
    curr.map((c) => {
      const older = prev.find((p) => keyOf(p) === keyOf(c));
      return older ? { ...c, before: older.before } : c;
    });
  return {
    tasks: pick(previous.tasks, next.tasks, (c) => c.id),
    root: pick(previous.root, next.root, (c) => c.key),
    meta: pick(previous.meta, next.meta, (c) => c.key),
    at: next.at
  };
}

function assignValue(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) delete target[key];
  else target[key] = clone(value);
}

/**
 * Applies a history entry to the current plan (undo: after -> before, redo: before -> after).
 * A field is only reverted while it still holds the value this entry produced; anything
 * changed since (by the user or a collaborator) is kept and counted as skipped.
 */
export function applyHistoryEntry(
  current: JanttData,
  entry: HistoryEntry,
  direction: "undo" | "redo",
  deletedAt: string
): { data: JanttData; applied: number; skipped: number } {
  const from = (c: { before: unknown; after: unknown }) => (direction === "undo" ? c.after : c.before);
  const to = (c: { before: unknown; after: unknown }) => (direction === "undo" ? c.before : c.after);
  let applied = 0;
  let skipped = 0;

  const tasks = [...(current.tasks || [])];
  const toRemove = new Set<string>();
  const restored: string[] = [];
  const ordered = [...entry.tasks].sort((a, b) => a.index - b.index);

  for (const change of ordered) {
    const source = from(change) as Task | null;
    const target = to(change) as Task | null;
    const idx = tasks.findIndex((t) => t.id === change.id);

    if (!target) {
      if (idx >= 0 && source && !changedKeys(tasks[idx], source, TASK_BOOKKEEPING_FIELDS).length) {
        toRemove.add(change.id);
      } else {
        skipped++;
      }
      continue;
    }
    if (!source) {
      if (idx >= 0) {
        skipped++;
      } else {
        tasks.splice(Math.min(change.index, tasks.length), 0, clone(target));
        restored.push(change.id);
        applied++;
      }
      continue;
    }
    if (idx < 0) {
      skipped++;
      continue;
    }
    const currentTask = tasks[idx];
    let nextTask: Task | null = null;
    for (const key of changedKeys(source, target, TASK_BOOKKEEPING_FIELDS)) {
      if (sameValue(currentTask[key], source[key])) {
        nextTask = nextTask || { ...currentTask };
        assignValue(nextTask, key, target[key]);
        applied++;
      } else {
        skipped++;
      }
    }
    if (nextTask) {
      tasks[idx] = nextTask;
      // Reverting a soft delete (`_deleted`) revives the task: drop its tombstone as well
      if (currentTask._deleted && !nextTask._deleted) restored.push(change.id);
    }
  }

  let data: JanttData = { ...current, tasks };

  for (const change of entry.root) {
    if (sameValue(data[change.key], from(change))) {
      assignValue(data, change.key, to(change));
      applied++;
    } else {
      skipped++;
    }
  }

  if (entry.meta.length > 0 || restored.length > 0) {
    const meta: Record<string, unknown> = { ...(data.meta || {}) };
    for (const change of entry.meta) {
      if (sameValue(meta[change.key], from(change))) {
        assignValue(meta, change.key, to(change));
        applied++;
      } else {
        skipped++;
      }
    }
    if (restored.length > 0 && data.meta?.tombstones) {
      const tombstones = { ...data.meta.tombstones };
      restored.forEach((id) => delete tombstones[id]);
      meta.tombstones = tombstones;
    }
    data = { ...data, meta: meta as JanttData["meta"] };
  }

  if (toRemove.size > 0) {
    // A collaborator may have attached a new note or dependency to an added task.
    // Keep that task and its prerequisites when reversing the original addition.
    const byId = new Map(tasks.map(task => [task.id, task]));
    const retained = tasks.filter(task => !toRemove.has(task.id));
    const keepReferenced = (id: string) => {
      if (!toRemove.delete(id)) return;
      skipped++;
      const task = byId.get(id);
      if (task) retained.push(task);
    };
    for (const note of data.notes || []) {
      for (const id of note.task_ids || []) keepReferenced(id);
    }
    for (const task of retained) {
      for (const dependency of getTaskDependencyRelations(task, byId)) keepReferenced(dependency.id);
    }
    applied += toRemove.size;
    data = deleteTasks(data, toRemove, deletedAt);
  }
  return { data, applied, skipped };
}

/**
 * Undo / redo for every local edit of the active plan.
 * History is captured automatically from the editor's commit pipeline (LOCAL_COMMIT) and is
 * scoped to one plan: it is cleared whenever the active plan changes.
 */
export function useUndoRedo(
  parsedData: JanttData | null,
  onApplyData: (data: JanttData) => void,
  showToast?: (msg: string, isErr?: boolean) => void
) {
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const [, setVersion] = useState(0);
  const isApplyingRef = useRef(false);

  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;
  const onApplyDataRef = useRef(onApplyData);
  onApplyDataRef.current = onApplyData;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const clearHistory = useCallback(() => {
    if (pastRef.current.length === 0 && futureRef.current.length === 0) return;
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, [bump]);

  useEffect(() => {
    const offCommit = commandBus.on("LOCAL_COMMIT", ({ before, after }) => {
      if (isApplyingRef.current) return;
      const entry = diffPlans(before, after);
      if (!entry) return;
      const past = pastRef.current;
      const merged = past.length > 0 ? coalesce(past[past.length - 1], entry) : null;
      if (merged) {
        past[past.length - 1] = merged;
      } else {
        past.push(entry);
        if (past.length > MAX_HISTORY) past.shift();
      }
      futureRef.current = [];
      bump();
    });
    // Never replay one plan's history into another plan
    const offSwitch = commandBus.on("ACTIVE_PROJECT_CHANGED", clearHistory);
    return () => {
      offCommit();
      offSwitch();
    };
  }, [bump, clearHistory]);

  /**
   * Kept for API compatibility. History is now recorded automatically for every local
   * commit, so an explicit checkpoint before a commit is no longer needed.
   */
  const pushSnapshot = useCallback((_data: JanttData) => {}, []);

  const step = useCallback(
    (direction: "undo" | "redo") => {
      const current = parsedDataRef.current;
      const source = direction === "undo" ? pastRef.current : futureRef.current;
      const entry = source[source.length - 1];
      if (!current || !entry) return;
      source.pop();

      const result = applyHistoryEntry(current, entry, direction, `${new Date().toISOString()}#${getPeerId()}`);
      if (result.applied === 0) {
        bump();
        showToastRef.current?.(
          direction === "undo"
            ? "Nothing to undo: that change was already modified since."
            : "Nothing to redo: that change was already modified since.",
          true
        );
        return;
      }

      (direction === "undo" ? futureRef.current : pastRef.current).push(entry);
      isApplyingRef.current = true;
      try {
        onApplyDataRef.current(result.data);
      } finally {
        isApplyingRef.current = false;
      }
      bump();

      const verb = direction === "undo" ? "Undid last change" : "Redid change";
      showToastRef.current?.(result.skipped > 0 ? `${verb}. Fields edited since were kept.` : verb);
    },
    [bump]
  );

  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    pastCount: pastRef.current.length,
    futureCount: futureRef.current.length,
    pushSnapshot,
    undo,
    redo,
    clearHistory
  };
}
