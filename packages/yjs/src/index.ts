/**
 * Jantt Yjs Real-Time CRDT Multiplayer Binding
 *
 * Bidirectional synchronization between Jantt JSON plans and a shared Y.Doc:
 * - Every task is a Y.Map of fields, so concurrent edits to different fields of a task merge
 *   and concurrent edits to the same field resolve last-writer-wins.
 * - `updatePlan` diffs the incoming plan three-way (against the last plan exchanged with the
 *   app and against the doc), so a commit writes only what the local user actually changed and
 *   never tombstones tasks the app has not seen yet.
 * - Deleted tasks are tombstoned; re-adding the same id restores them.
 * - Remote data is sanitized before it reaches the app.
 * - Presence/awareness and undo/redo helpers.
 */

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { JanttData, Task } from "@jantt/core";

export interface JanttYjsBindingOptions {
  /**
   * Plan seeded at bind time when the doc holds no Jantt data. Only safe for a doc that is
   * already synced (local/offline docs, or after the provider reported "synced"): seeding an
   * unsynced doc races with remote state. With network providers call
   * `binding.seedIfEmpty(plan)` once the provider has synced instead.
   */
  initialPlan?: JanttData;
  /** Called with the full plan after every remote (non-local) change to Jantt data. */
  onPlanChange?: (plan: JanttData) => void;
}

export interface JanttYjsBinding {
  doc: Y.Doc;
  getPlan: () => JanttData;
  updatePlan: (plan: JanttData) => void;
  updateTask: (taskId: string, patch: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  /** Clears a task's tombstone. Returns false when the id is unknown or not deleted. */
  restoreTask: (taskId: string) => boolean;
  /** Seeds `plan` when the doc holds no Jantt data yet. Returns true when it seeded. */
  seedIfEmpty: (plan: JanttData) => boolean;
  /** Permanently removes tombstones older than `maxAgeMs`. Returns how many were removed. */
  pruneTombstones: (maxAgeMs: number) => number;
  destroy: () => void;
}

export const ORIGIN_LOCAL = "jantt-local-binding";

type JsonRecord = Record<string, unknown>;

/** Last-writer-wins state of the plan's task order, kept in the internal state map. */
const TASK_ORDER_KEY = "taskOrder";
/** Top-level plan keys stored in their own shared types rather than in the extra map. */
const STRUCTURED_KEYS = new Set(["meta", "categories", "tasks"]);
/** List keys that getPlan always returns, as before, even when empty. */
const DEFAULT_LIST_KEYS = ["people", "teams"] as const;
/** Keys that would rewrite an object's prototype or shadow its constructor. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_JSON_DEPTH = 64;
/** Characters that can break out of a CSS value or an HTML attribute. */
const UNSAFE_CSS_VALUE = /[<>"'`;{}\\]/;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Deep-copies a JSON-like value. Drops prototype-rewriting keys, functions and over-deep
 * nesting, and converts nested Yjs types to JSON, so neither remote peers nor later mutations
 * by the app can reach the binding's own snapshots.
 */
function cloneJson(value: unknown, depth = 0): unknown {
  if (value instanceof Y.AbstractType) value = value.toJSON();
  if (value === null || typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol" || typeof value === "bigint"
      ? undefined
      : value;
  }
  if (depth >= MAX_JSON_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const copy = cloneJson(item, depth + 1);
      return copy === undefined ? null : copy;
    });
  }
  const out: JsonRecord = {};
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const copy = cloneJson((value as JsonRecord)[key], depth + 1);
    if (copy !== undefined) out[key] = copy;
  }
  return out;
}

/** Structural equality for JSON values. Object keys holding `undefined` count as absent. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => jsonEqual(item, b[i]));
  }
  const left = a as JsonRecord;
  const right = b as JsonRecord;
  let leftCount = 0;
  for (const key of Object.keys(left)) {
    if (left[key] === undefined) continue;
    leftCount++;
    if (!Object.prototype.hasOwnProperty.call(right, key) || !jsonEqual(left[key], right[key])) return false;
  }
  let rightCount = 0;
  for (const key of Object.keys(right)) if (right[key] !== undefined) rightCount++;
  return leftCount === rightCount;
}

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Keeps the first entry per id, which also repairs lists duplicated by older seeding races. */
function dedupeById(list: unknown[]): unknown[] {
  const seen = new Set<unknown>();
  return list.filter((item) => {
    if (!isRecord(item) || item.id === undefined) return true;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Drops category entries that are not objects and colors that could inject markup. */
function sanitizeCategory(value: unknown): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["color", "soft"]) {
    const color = value[key];
    if (color !== undefined && (typeof color !== "string" || UNSAFE_CSS_VALUE.test(color))) delete value[key];
  }
  return value;
}

/** Normalized, binding-owned copy of a plan, used as the base of three-way diffs. */
interface PlanSnapshot {
  meta: JsonRecord;
  categories: JsonRecord;
  /** Every other top-level key: people, teams, calendars, notes, documents, $schema, custom keys. */
  extra: JsonRecord;
  tasks: Map<string, JsonRecord>;
  order: string[];
}

function withDefaultLists(extra: JsonRecord): JsonRecord {
  for (const key of DEFAULT_LIST_KEYS) if (!Array.isArray(extra[key])) extra[key] = [];
  return extra;
}

function snapshotPlan(plan: JanttData): PlanSnapshot {
  const tasks = new Map<string, JsonRecord>();
  const order: string[] = [];
  for (const task of Array.isArray(plan?.tasks) ? plan.tasks : []) {
    if (!isRecord(task) || typeof task.id !== "string" || !task.id || task._deleted || tasks.has(task.id)) continue;
    tasks.set(task.id, cloneJson(task) as JsonRecord);
    order.push(task.id);
  }
  const extra: JsonRecord = {};
  for (const key of Object.keys(plan ?? {})) {
    if (STRUCTURED_KEYS.has(key) || UNSAFE_KEYS.has(key)) continue;
    const value = cloneJson(plan[key]);
    if (value !== undefined) extra[key] = value;
  }
  const meta = cloneJson(plan?.meta);
  const categories = cloneJson(plan?.categories);
  return {
    meta: isRecord(meta) ? meta : {},
    categories: isRecord(categories) ? categories : {},
    extra: withDefaultLists(extra),
    tasks,
    order
  };
}

const EMPTY_SNAPSHOT: PlanSnapshot = snapshotPlan({ tasks: [] });

function toPlan(snapshot: PlanSnapshot): JanttData {
  const plan = cloneJson({ ...snapshot.extra, meta: snapshot.meta, categories: snapshot.categories }) as JanttData;
  plan.tasks = snapshot.order.map((id) => cloneJson(snapshot.tasks.get(id)) as Task);
  return plan;
}

function getSharedTypes(doc: Y.Doc) {
  return {
    tasks: doc.getMap<Y.Map<unknown>>("jantt_tasks"),
    meta: doc.getMap<unknown>("jantt_meta"),
    categories: doc.getMap<unknown>("jantt_categories"),
    extra: doc.getMap<unknown>("jantt_extra"),
    state: doc.getMap<unknown>("jantt_state"),
    // Written by earlier binding versions; still read while "jantt_extra" has no newer value.
    legacyPeople: doc.getArray<unknown>("jantt_people"),
    legacyTeams: doc.getArray<unknown>("jantt_teams")
  };
}

export function bindJanttToYDoc(
  doc: Y.Doc,
  options: JanttYjsBindingOptions = {}
): JanttYjsBinding {
  const shared = getSharedTypes(doc);
  const { tasks: yTasks, meta: yMeta, categories: yCategories, extra: yExtra, state: yState } = shared;
  const roots: Y.AbstractType<any>[] = Object.values(shared);

  /** Last plan exchanged with the app (getPlan, onPlanChange or updatePlan). */
  let base: PlanSnapshot | null = null;

  const readMap = (map: Y.Map<unknown>): JsonRecord => {
    const out: JsonRecord = {};
    map.forEach((value, key) => {
      if (UNSAFE_KEYS.has(key)) return;
      const copy = cloneJson(value);
      if (copy !== undefined) out[key] = copy;
    });
    return out;
  };

  const sortedTaskIds = (ids: string[]): string[] => {
    const stored = yState.get(TASK_ORDER_KEY);
    if (!Array.isArray(stored)) return ids; // docs from older versions: keep their map order
    const rank = new Map<string, number>();
    stored.forEach((id, index) => {
      if (typeof id === "string" && !rank.has(id)) rank.set(id, index);
    });
    // Ids missing from the stored order (concurrent adds) go last in a deterministic order.
    return ids.sort(
      (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || compareIds(a, b)
    );
  };

  const readSnapshot = (): PlanSnapshot => {
    const tasks = new Map<string, JsonRecord>();
    yTasks.forEach((yTask, id) => {
      if (!(yTask instanceof Y.Map) || yTask.get("_deleted")) return;
      const task = readMap(yTask);
      task.id = id;
      tasks.set(id, task);
    });

    const extra = readMap(yExtra);
    if (!yExtra.has("people")) extra.people = dedupeById(cloneJson(shared.legacyPeople.toArray()) as unknown[]);
    if (!yExtra.has("teams")) extra.teams = dedupeById(cloneJson(shared.legacyTeams.toArray()) as unknown[]);

    const categories: JsonRecord = {};
    for (const [key, value] of Object.entries(readMap(yCategories))) {
      const category = sanitizeCategory(value);
      if (category) categories[key] = category;
    }

    return {
      meta: readMap(yMeta),
      categories,
      extra: withDefaultLists(extra),
      tasks,
      order: sortedTaskIds([...tasks.keys()])
    };
  };

  /** Three-way merge of keyed values: writes only keys the app changed relative to `prev`. */
  const writeChangedKeys = (target: Y.Map<unknown>, next: JsonRecord, prev: JsonRecord): void => {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    keys.forEach((key) => {
      const value = next[key];
      if (jsonEqual(value, prev[key])) return; // untouched locally: keep the doc's (maybe remote) value
      if (value === undefined) {
        if (target.has(key)) target.delete(key);
      } else if (!jsonEqual(target.get(key), value)) {
        target.set(key, value);
      }
    });
  };

  /** Makes `target` hold exactly `next`, writing only the differences. */
  const replaceKeys = (target: Y.Map<unknown>, next: JsonRecord): void => {
    Array.from(target.keys()).forEach((key) => {
      if (next[key] === undefined) target.delete(key);
    });
    Object.entries(next).forEach(([key, value]) => {
      if (!jsonEqual(target.get(key), value)) target.set(key, value);
    });
  };

  const createTaskMap = (fields: JsonRecord): Y.Map<unknown> => {
    const yTask = new Y.Map<unknown>();
    Object.entries(fields).forEach(([key, value]) => yTask.set(key, value));
    return yTask;
  };

  const tombstone = (yTask: Y.Map<unknown>): void => {
    yTask.set("_deleted", true);
    yTask.set("deletedAt", new Date().toISOString());
  };

  const writeTask = (id: string, next: JsonRecord, prev: JsonRecord | undefined): void => {
    const existing = yTasks.get(id);
    if (!(existing instanceof Y.Map)) {
      // Missing although the app's base had it: a peer pruned its tombstone, so the deletion
      // still wins. Ids new to the app, and corrupt non-map entries, are (re)written.
      if (!prev || existing !== undefined) yTasks.set(id, createTaskMap(next));
    } else if (existing.get("_deleted")) {
      // A task the app already had was deleted by a peer: the deletion wins. A task the app
      // re-adds (undo, import, recreate with the same id) is restored with the incoming fields.
      if (!prev) replaceKeys(existing, next);
    } else if (prev) {
      writeChangedKeys(existing, next, prev);
    } else {
      // Present in the doc but unknown to the app's base: the incoming fields win.
      Object.entries(next).forEach(([key, value]) => {
        if (!jsonEqual(existing.get(key), value)) existing.set(key, value);
      });
    }
  };

  const applySnapshot = (next: PlanSnapshot, prev: PlanSnapshot): void => {
    writeChangedKeys(yMeta, next.meta, prev.meta);
    writeChangedKeys(yCategories, next.categories, prev.categories);
    writeChangedKeys(yExtra, next.extra, prev.extra);

    next.tasks.forEach((task, id) => writeTask(id, task, prev.tasks.get(id)));

    // Only tasks the app knew about and removed are tombstoned; tasks created by peers after
    // the base snapshot are left alone.
    prev.tasks.forEach((_task, id) => {
      if (next.tasks.has(id)) return;
      const yTask = yTasks.get(id);
      if (yTask instanceof Y.Map && !yTask.get("_deleted")) tombstone(yTask);
    });

    if (!jsonEqual(next.order, prev.order) && !jsonEqual(yState.get(TASK_ORDER_KEY), next.order)) {
      yState.set(TASK_ORDER_KEY, next.order);
    }
  };

  const getPlan = (): JanttData => {
    base = readSnapshot();
    return toPlan(base);
  };

  const isDocEmpty = (): boolean =>
    roots.every((type) => (type instanceof Y.Array ? type.length === 0 : (type as Y.Map<unknown>).size === 0));

  const seedIfEmpty = (plan: JanttData): boolean => {
    if (!isRecord(plan) || !isDocEmpty()) return false;
    const next = snapshotPlan(plan);
    doc.transact(() => applySnapshot(next, EMPTY_SNAPSHOT), ORIGIN_LOCAL);
    base = next;
    return true;
  };

  const updatePlan = (plan: JanttData): void => {
    if (!isRecord(plan)) return; // a missing plan must never read as "every task was deleted"
    const next = snapshotPlan(plan);
    const prev = base ?? readSnapshot();
    doc.transact(() => applySnapshot(next, prev), ORIGIN_LOCAL);
    base = next;
  };

  const updateTask = (taskId: string, patch: Partial<Task>): void => {
    const fields = cloneJson(patch);
    if (!taskId || !isRecord(fields)) return;
    doc.transact(() => {
      let yTask = yTasks.get(taskId);
      if (!(yTask instanceof Y.Map)) {
        yTask = createTaskMap({ id: taskId });
        yTasks.set(taskId, yTask);
        const order = yState.get(TASK_ORDER_KEY);
        if (Array.isArray(order) && !order.includes(taskId)) yState.set(TASK_ORDER_KEY, [...order, taskId]);
      }
      const target = yTask;
      Object.keys(patch).forEach((key) => {
        if (key === "id" || UNSAFE_KEYS.has(key)) return; // the map key is the task's identity
        if (fields[key] === undefined) target.delete(key);
        else target.set(key, fields[key]);
      });
    }, ORIGIN_LOCAL);
  };

  // Soft delete: the tombstone keeps concurrent edits from resurrecting the task.
  const deleteTask = (taskId: string): void => {
    doc.transact(() => {
      const yTask = yTasks.get(taskId);
      if (yTask instanceof Y.Map && !yTask.get("_deleted")) tombstone(yTask);
    }, ORIGIN_LOCAL);
  };

  const restoreTask = (taskId: string): boolean => {
    const yTask = yTasks.get(taskId);
    if (!(yTask instanceof Y.Map) || !yTask.get("_deleted")) return false;
    doc.transact(() => {
      yTask.delete("_deleted");
      yTask.delete("deletedAt");
    }, ORIGIN_LOCAL);
    return true;
  };

  const pruneTombstones = (maxAgeMs: number): number => {
    const cutoff = Date.now() - Math.max(0, maxAgeMs);
    const expired: string[] = [];
    yTasks.forEach((yTask, id) => {
      if (!(yTask instanceof Y.Map) || !yTask.get("_deleted")) return;
      const deletedAt = Date.parse(String(yTask.get("deletedAt")));
      if (!Number.isNaN(deletedAt) && deletedAt <= cutoff) expired.push(id);
    });
    if (expired.length > 0) {
      doc.transact(() => expired.forEach((id) => yTasks.delete(id)), ORIGIN_LOCAL);
    }
    return expired.length;
  };

  // One notification per remote transaction that touched Jantt data; unrelated shared types
  // in the same doc and the binding's own writes are ignored.
  const handleAfterTransaction = (transaction: Y.Transaction): void => {
    if (transaction.origin === ORIGIN_LOCAL || !options.onPlanChange) return;
    if (!roots.some((type) => transaction.changedParentTypes.has(type))) return;
    options.onPlanChange(getPlan());
  };

  doc.on("afterTransaction", handleAfterTransaction);

  if (options.initialPlan) seedIfEmpty(options.initialPlan);

  const destroy = (): void => {
    doc.off("afterTransaction", handleAfterTransaction);
  };

  return {
    doc,
    getPlan,
    updatePlan,
    updateTask,
    deleteTask,
    restoreTask,
    seedIfEmpty,
    pruneTombstones,
    destroy
  };
}

// ---------------------------------------------------------------------------
// Multiplayer Presence & Awareness Protocol Binding
// ---------------------------------------------------------------------------

export interface JanttCollaboratorUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  email?: string;
}

export interface JanttCollaboratorPresence {
  user: JanttCollaboratorUser;
  selectedTaskId?: string | null;
  cursor?: {
    date?: string;
    taskIndex?: number;
    mouseX?: number;
    mouseY?: number;
  } | null;
  isDragging?: boolean;
  draggingTaskId?: string | null;
  lastActive?: number;
}

export interface JanttAwarenessBindingOptions {
  user: JanttCollaboratorUser;
  /** Called with the remote peers (the local client excluded) whenever one of them changes. */
  onPeersChange?: (peers: Map<number, JanttCollaboratorPresence>) => void;
  /** Minimum interval between cursor broadcasts in milliseconds. Defaults to 50; 0 disables. */
  cursorThrottleMs?: number;
}

export interface JanttAwarenessBinding {
  awareness: Awareness;
  getLocalPresence: () => JanttCollaboratorPresence | null;
  setLocalUser: (user: Partial<JanttCollaboratorUser>) => void;
  selectTask: (taskId: string | null) => void;
  setCursor: (cursor: JanttCollaboratorPresence["cursor"]) => void;
  setDragging: (isDragging: boolean, taskId?: string | null) => void;
  /** Remote peers keyed by client id; the local client is not included. */
  getPeers: () => Map<number, JanttCollaboratorPresence>;
  destroy: () => void;
}

interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

export function bindJanttAwareness(
  awareness: Awareness,
  options: JanttAwarenessBindingOptions
): JanttAwarenessBinding {
  const cursorThrottleMs = Math.max(0, options.cursorThrottleMs ?? 50);
  const localPresence: JanttCollaboratorPresence = {
    user: options.user,
    selectedTaskId: null,
    cursor: null,
    isDragging: false,
    draggingTaskId: null,
    lastActive: Date.now()
  };

  awareness.setLocalStateField("jantt", localPresence);

  const getLocalPresence = (): JanttCollaboratorPresence | null =>
    (awareness.getLocalState()?.jantt as JanttCollaboratorPresence) || null;

  const getPeers = (): Map<number, JanttCollaboratorPresence> => {
    const peers = new Map<number, JanttCollaboratorPresence>();
    awareness.getStates().forEach((state, clientID) => {
      const presence = state?.jantt;
      if (clientID !== awareness.clientID && isRecord(presence) && isRecord(presence.user)) {
        peers.set(clientID, presence as unknown as JanttCollaboratorPresence);
      }
    });
    return peers;
  };

  const handleChange = ({ added, updated, removed }: AwarenessChanges) => {
    if (!options.onPeersChange) return;
    const self = awareness.clientID;
    // The local client's own cursor/selection updates do not change the peer list.
    if ([added, updated, removed].some((ids) => ids.some((id) => id !== self))) {
      options.onPeersChange(getPeers());
    }
  };

  awareness.on("change", handleChange);

  let pendingCursor: { value: JanttCollaboratorPresence["cursor"] } | null = null;
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;
  let lastCursorSentAt = 0;

  const cancelCursorTimer = () => {
    if (cursorTimer !== null) clearTimeout(cursorTimer);
    cursorTimer = null;
  };

  const updateLocal = (patch: Partial<JanttCollaboratorPresence>) => {
    if (pendingCursor) {
      // Send a throttled cursor together with this update so the two cannot arrive reordered.
      patch = { cursor: pendingCursor.value, ...patch };
      pendingCursor = null;
      cancelCursorTimer();
      lastCursorSentAt = Date.now();
    }
    const current = getLocalPresence() || localPresence;
    const changed = (Object.keys(patch) as (keyof JanttCollaboratorPresence)[]).some(
      (key) => !jsonEqual(patch[key], current[key])
    );
    if (!changed) return; // no-op updates must not broadcast to every peer
    awareness.setLocalStateField("jantt", { ...current, ...patch, lastActive: Date.now() });
  };

  const flushCursor = () => {
    cursorTimer = null;
    if (!pendingCursor) return;
    const { value } = pendingCursor;
    pendingCursor = null;
    lastCursorSentAt = Date.now();
    updateLocal({ cursor: value });
  };

  const setLocalUser = (userPatch: Partial<JanttCollaboratorUser>) => {
    const current = getLocalPresence() || localPresence;
    updateLocal({ user: { ...current.user, ...userPatch } });
  };

  const selectTask = (taskId: string | null) => {
    updateLocal({ selectedTaskId: taskId });
  };

  // Leading + trailing throttle: the first move is sent at once, later moves within the
  // window collapse into one broadcast carrying the latest position.
  const setCursor = (cursor: JanttCollaboratorPresence["cursor"]) => {
    pendingCursor = { value: cursor };
    if (cursorTimer !== null) return;
    const wait = cursorThrottleMs - (Date.now() - lastCursorSentAt);
    if (wait <= 0) flushCursor();
    else cursorTimer = setTimeout(flushCursor, wait);
  };

  const setDragging = (isDragging: boolean, taskId: string | null = null) => {
    updateLocal({ isDragging, draggingTaskId: taskId });
  };

  const destroy = () => {
    cancelCursorTimer();
    pendingCursor = null;
    awareness.off("change", handleChange);
    awareness.setLocalStateField("jantt", null);
  };

  return {
    awareness,
    getLocalPresence,
    setLocalUser,
    selectTask,
    setCursor,
    setDragging,
    getPeers,
    destroy
  };
}

// ---------------------------------------------------------------------------
// Infinite Undo/Redo & Time Travel Engine
// ---------------------------------------------------------------------------

export interface JanttUndoManagerOptions {
  trackedOrigins?: Set<any>;
}

export interface JanttUndoManager {
  undoManager: Y.UndoManager;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  destroy: () => void;
}

export function createJanttUndoManager(
  doc: Y.Doc,
  options: JanttUndoManagerOptions = {}
): JanttUndoManager {
  const trackedOrigins = options.trackedOrigins || new Set([ORIGIN_LOCAL]);

  const undoManager = new Y.UndoManager(Object.values(getSharedTypes(doc)), { trackedOrigins });

  return {
    undoManager,
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    canUndo: () => undoManager.canUndo(),
    canRedo: () => undoManager.canRedo(),
    clear: () => undoManager.clear(),
    destroy: () => undoManager.destroy()
  };
}

export default bindJanttToYDoc;
