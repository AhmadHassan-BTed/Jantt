import type { JanttData, Task, ReconcileResult, ConflictRecord } from "../types";
import { filterDependsOn } from "../dependencies";
import { compareCompositeTimestamps, compositeTimestampToMillis, readTimestamp } from "./timestamps";
import {
  calculatePlanHash,
  canonicalFieldJson,
  canonicalJson,
  recordContentHash,
  META_SYNC_KEYS,
  RECORD_SYNC_KEYS,
  type CanonicalMemo
} from "./crdt-hash";
import { getLatestTaskTimestamp } from "./task-merger";

export interface ReconcileOptions {
  /** Client id recorded in `meta.sync` and on tombstones the merge has to create itself. */
  clientId?: string;
  /**
   * @deprecated Ignored. Concurrent edits of one field are resolved by field timestamps, then by
   * record timestamps, then by a deterministic value comparison, so every peer converges on the
   * same plan whichever side it calls "local". Use `conflicts` to show what was overwritten.
   */
  preferRemoteOnConflict?: boolean;
  /** Drop tombstones older than `tombstoneMaxAgeDays` and keep at most `maxTombstones` (default true). */
  purgeTombstones?: boolean;
  /** Tombstone retention in days (default 30). */
  tombstoneMaxAgeDays?: number;
  /** Most tombstones kept after purging, newest first (default 1000). */
  maxTombstones?: number;
}

type PlainRecord = Record<string, unknown>;
type Side = "local" | "remote";
type EntityKind = "task" | "note";
type Summary = ReconcileResult["summary"] & { tombstonesPreserved: number };

interface Tombstone {
  deletedAt: string;
  entityType: string;
}

interface Clocks {
  localStamp?: string;
  remoteStamp?: string;
  localClock?: string;
  remoteClock?: string;
}

interface Decision {
  value: unknown;
  from: "same" | Side | "merged";
  /** Both sides changed the value and one of them was overwritten. */
  conflict: boolean;
}

interface FieldConflict {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  resolvedValue: unknown;
  resolution: Side;
}

interface FieldMerge {
  merged: PlainRecord;
  stamps: Record<string, string>;
  /** Fields whose local and remote values differed. */
  changed: number;
  /** At least one field now holds the remote (or a combined) value. */
  tookRemote: boolean;
  conflicts: FieldConflict[];
}

interface MergeState {
  conflicts: ConflictRecord[];
  summary: Summary;
  /** Tombstones of the merged plan (every input's, plus the deletions this merge settles). */
  tombstones: Map<string, Tombstone>;
  /** Each input's own `meta.tombstones`, to tell which side recorded a deletion. No `base` without a base plan. */
  sides: { base?: Map<string, Tombstone>; local: Map<string, Tombstone>; remote: Map<string, Tombstone> };
  /** Plan-level clocks, used to order concurrent edits of records without their own timestamps. */
  baseClock?: string;
  localClock?: string;
  remoteClock?: string;
  /** Deletion time used when a deletion carries no timestamp at all. */
  fallbackDeletedAt: string;
  /** Record encodings shared by every hash and comparison of this merge. */
  memo: CanonicalMemo;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TOMBSTONE_MAX_AGE_DAYS = 30;
const DEFAULT_MAX_TOMBSTONES = 1000;

// Fields merged as sets, so concurrent additions and removals both survive.
const SET_FIELDS: ReadonlySet<string> = new Set(["assignees", "tags", "task_ids"]);
const ENTITY_SKIP_KEYS: ReadonlySet<string> = new Set(["id", ...RECORD_SYNC_KEYS]);
const DELETION_KEYS: ReadonlySet<string> = new Set(["_deleted", "deletedAt"]);
const STAMP_KEYS: ReadonlySet<string> = new Set(["fieldTimestamps"]);
const NO_KEYS: ReadonlySet<string> = new Set();
const KEYED_LIST_KEYS: ReadonlySet<string> = new Set(["people", "teams", "documents"]);
const KEYED_MAP_KEYS: ReadonlySet<string> = new Set(["categories", "calendars"]);

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function emptySummary(): Summary {
  return { tasksAdded: 0, tasksUpdated: 0, tasksDeleted: 0, notesUpdated: 0, fieldsMerged: 0, tombstonesPreserved: 0 };
}

function laterStamp(a: string | undefined, b: string | undefined): string | undefined {
  return compareCompositeTimestamps(a, b) >= 0 ? readTimestamp(a) : readTimestamp(b);
}

function readStamps(value: unknown): Record<string, string> {
  const stamps: Record<string, string> = {};
  if (!isRecord(value)) return stamps;
  for (const [field, ts] of Object.entries(value)) {
    if (typeof ts === "string" && ts) stamps[field] = ts;
  }
  return stamps;
}

/** "<updatedAt>#<updatedBy>" of a record, or undefined when it carries no usable updatedAt. */
function recordClock(record: PlainRecord): string | undefined {
  const at = readTimestamp(record.updatedAt);
  return at ? `${at}#${typeof record.updatedBy === "string" ? record.updatedBy : ""}` : undefined;
}

/** Last save time of a whole plan ("<meta.sync.updatedAt|meta.updatedAt>#<clientId>"). */
function planClock(plan: JanttData | undefined): string | undefined {
  const meta = isRecord(plan?.meta) ? plan.meta : undefined;
  const sync = isRecord(meta?.sync) ? meta.sync : undefined;
  const at = readTimestamp(sync?.updatedAt) ?? readTimestamp(meta?.updatedAt);
  return at ? `${at}#${typeof sync?.clientId === "string" ? sync.clientId : ""}` : undefined;
}

function planRevision(plan: JanttData | undefined): number {
  const meta = isRecord(plan?.meta) ? plan.meta : undefined;
  const sync = isRecord(meta?.sync) ? meta.sync : undefined;
  const revision = Number(meta?.revision || sync?.revision || 0);
  return Number.isFinite(revision) ? revision : 0;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasSyncDeletions(plan: JanttData | undefined): boolean {
  if (!plan) return false;
  const meta = isRecord(plan.meta) ? plan.meta : undefined;
  if (isRecord(meta?.tombstones) && Object.keys(meta.tombstones).length > 0) return true;
  const isDeleted = (item: unknown) => isRecord(item) && Boolean(item._deleted);
  return asList(plan.tasks).some(isDeleted) || asList(plan.notes).some(isDeleted);
}

function withoutKeys(record: PlainRecord, keys: ReadonlySet<string>): PlainRecord {
  let copy: PlainRecord | undefined;
  for (const key of keys) {
    if (key in record) {
      copy ??= { ...record };
      delete copy[key];
    }
  }
  return copy ?? record;
}

function displayName(kind: EntityKind, id: string, record: PlainRecord): string {
  const name = kind === "task" ? record.label ?? record.name : record.title;
  return typeof name === "string" && name ? name : id;
}

// ─── Value and field merging ─────────────────────────────────────────────────

function toStringList(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : null;
}

/** 3-way set merge: additions from either side are kept, removals from either side win. */
function mergeStringSets(base: unknown, local: unknown, remote: unknown): string[] | null {
  const baseList = toStringList(base);
  const localList = toStringList(local);
  const remoteList = toStringList(remote);
  if (!baseList || !localList || !remoteList) return null;
  const inBase = new Set(baseList);
  const inLocal = new Set(localList);
  const inRemote = new Set(remoteList);
  const result = new Set<string>();
  for (const item of [...localList, ...remoteList]) {
    if (inBase.has(item) && !(inLocal.has(item) && inRemote.has(item))) continue;
    result.add(item);
  }
  return Array.from(result).sort(codePointCompare);
}

/**
 * Concurrent edit of one value: field timestamps first (an explicit stamp beats a missing one),
 * then record/plan clocks, then the larger canonical value. Symmetric, so peers converge.
 */
function pickWinner(clocks: Clocks, localJson: string, remoteJson: string): Side {
  const order =
    compareCompositeTimestamps(clocks.localStamp, clocks.remoteStamp) ||
    compareCompositeTimestamps(clocks.localClock, clocks.remoteClock) ||
    codePointCompare(localJson, remoteJson);
  return order >= 0 ? "local" : "remote";
}

/**
 * Merges one value. With a base, a side that left the value as it was in the base yields to the
 * side that changed it; timestamps only decide when both sides changed it. Without a base, a value
 * present on one side only is kept.
 */
function decideValue(
  field: string,
  hasBase: boolean,
  base: unknown,
  local: unknown,
  remote: unknown,
  clocks: Clocks
): Decision {
  const localJson = canonicalFieldJson(field, local);
  const remoteJson = canonicalFieldJson(field, remote);
  if (localJson === remoteJson) {
    return { value: local !== undefined ? local : remote, from: "same", conflict: false };
  }
  if (hasBase) {
    const baseJson = canonicalFieldJson(field, base);
    if (localJson === baseJson) return { value: remote, from: "remote", conflict: false };
    if (remoteJson === baseJson) return { value: local, from: "local", conflict: false };
  } else if (localJson === "") {
    return { value: remote, from: "remote", conflict: false };
  } else if (remoteJson === "") {
    return { value: local, from: "local", conflict: false };
  }
  if (SET_FIELDS.has(field)) {
    const merged = mergeStringSets(hasBase ? base : undefined, local, remote);
    if (merged) return { value: merged, from: "merged", conflict: false };
  }
  const winner = pickWinner(clocks, localJson, remoteJson);
  return { value: winner === "local" ? local : remote, from: winner, conflict: true };
}

/** Merges every key of two records (except `skip`) against their common base, if any. */
function mergeFields(
  base: PlainRecord | undefined,
  local: PlainRecord,
  remote: PlainRecord,
  skip: ReadonlySet<string>,
  localClock: string | undefined,
  remoteClock: string | undefined,
  useFieldStamps = false
): FieldMerge {
  const localStamps = useFieldStamps ? readStamps(local.fieldTimestamps) : {};
  const remoteStamps = useFieldStamps ? readStamps(remote.fieldTimestamps) : {};
  const result: FieldMerge = { merged: {}, stamps: {}, changed: 0, tookRemote: false, conflicts: [] };

  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  if (base) Object.keys(base).forEach((key) => keys.add(key));

  for (const key of keys) {
    if (skip.has(key)) continue;
    const localStamp = localStamps[key];
    const remoteStamp = remoteStamps[key];
    const decision = decideValue(key, base !== undefined, base?.[key], local[key], remote[key], {
      localStamp,
      remoteStamp,
      localClock,
      remoteClock
    });
    if (decision.value !== undefined) result.merged[key] = decision.value;

    const stamp =
      decision.from === "local"
        ? localStamp
        : decision.from === "remote"
          ? remoteStamp
          : laterStamp(localStamp, remoteStamp);
    if (stamp) result.stamps[key] = stamp;

    if (decision.from !== "same") {
      result.changed++;
      if (decision.from !== "local") result.tookRemote = true;
    }
    if (decision.conflict) {
      result.conflicts.push({
        field: key,
        localValue: local[key],
        remoteValue: remote[key],
        resolvedValue: decision.value,
        resolution: decision.from as Side
      });
    }
  }
  return result;
}

function recordFieldConflicts(
  state: MergeState,
  type: ConflictRecord["type"],
  entityId: string,
  subject: string,
  conflicts: FieldConflict[]
): void {
  for (const conflict of conflicts) {
    state.conflicts.push({
      type,
      entityId,
      field: conflict.field,
      localValue: conflict.localValue,
      remoteValue: conflict.remoteValue,
      resolvedValue: conflict.resolvedValue,
      resolution: conflict.resolution,
      description: `'${conflict.field}' on ${subject} was changed on both sides. Kept ${
        conflict.resolution === "local" ? "your" : "the collaborator's"
      } value.`
    });
  }
}

// ─── Tombstones ──────────────────────────────────────────────────────────────

function addTombstone(tombstones: Map<string, Tombstone>, id: string, deletedAt: unknown, entityType: string): void {
  const ts = readTimestamp(deletedAt);
  if (!id || !ts) return;
  const existing = tombstones.get(id);
  if (!existing || compareCompositeTimestamps(ts, existing.deletedAt) > 0) {
    tombstones.set(id, { deletedAt: ts, entityType });
  }
}

function addMetaTombstones(tombstones: Map<string, Tombstone>, plan: JanttData | undefined): void {
  const meta = isRecord(plan?.meta) ? plan.meta : undefined;
  if (!isRecord(meta?.tombstones)) return;
  for (const [id, record] of Object.entries(meta.tombstones)) {
    if (!isRecord(record)) continue;
    addTombstone(tombstones, id, record.deletedAt, typeof record.entityType === "string" ? record.entityType : "task");
  }
}

function tombstoneFor(state: MergeState, id: string, kind: EntityKind): Tombstone | undefined {
  const tombstone = state.tombstones.get(id);
  return tombstone && tombstone.entityType === kind ? tombstone : undefined;
}

/** True when a tombstone is older than the cutoff. Unparseable dates count as fresh. */
function isTombstoneExpired(deletedAt: unknown, cutoffMs: number): boolean {
  const ms = compositeTimestampToMillis(deletedAt);
  return Number.isFinite(ms) && ms < cutoffMs;
}

function pruneTombstones(tombstones: Map<string, Tombstone>, cutoffMs: number, maxCount: number): void {
  for (const [id, record] of tombstones) {
    if (isTombstoneExpired(record.deletedAt, cutoffMs)) tombstones.delete(id);
  }
  if (tombstones.size <= maxCount) return;
  const newestFirst = Array.from(tombstones).sort((a, b) => compareCompositeTimestamps(b[1].deletedAt, a[1].deletedAt));
  tombstones.clear();
  for (const [id, record] of newestFirst.slice(0, Math.max(0, maxCount))) tombstones.set(id, record);
}

function deletionTimeOf(item: PlainRecord): string | undefined {
  return readTimestamp(item.deletedAt) ?? readTimestamp(item.updatedAt);
}

/**
 * When one input deleted a record: the later of its soft-deleted copy's time (else that plan's
 * save time, which the deletion cannot postdate) and its own tombstone. Undefined when it holds
 * no deletion of the record.
 */
function sideDeletion(
  item: PlainRecord | undefined,
  tombstones: Map<string, Tombstone> | undefined,
  id: string,
  kind: EntityKind,
  planClock: string | undefined,
  fallback: string
): string | undefined {
  const tombstone = tombstones?.get(id);
  const soft = item?._deleted ? deletionTimeOf(item) ?? planClock ?? fallback : undefined;
  return laterStamp(soft, tombstone && tombstone.entityType === kind ? tombstone.deletedAt : undefined);
}

// ─── Tasks and notes (records with soft deletes and tombstones) ──────────────

function indexById(list: unknown): Map<string, PlainRecord> {
  const map = new Map<string, PlainRecord>();
  for (const item of asList(list)) {
    if (isRecord(item) && typeof item.id === "string" && item.id) map.set(item.id, item);
  }
  return map;
}

function liveRecord(item: PlainRecord | undefined): PlainRecord | undefined {
  return item && !item._deleted ? item : undefined;
}

function latestEdit(record: PlainRecord): string {
  return getLatestTaskTimestamp(record as Task);
}

function withBookkeeping(record: PlainRecord, stamps: Record<string, string>, clockSource: PlainRecord): PlainRecord {
  const out: PlainRecord = { ...record };
  if (Object.keys(stamps).length > 0) out.fieldTimestamps = stamps;
  else delete out.fieldTimestamps;
  const updatedAt = readTimestamp(clockSource.updatedAt);
  delete out.updatedAt;
  delete out.updatedBy;
  if (updatedAt) {
    out.updatedAt = updatedAt;
    if (typeof clockSource.updatedBy === "string") out.updatedBy = clockSource.updatedBy;
  }
  return out;
}

function mergeLiveRecord(
  kind: EntityKind,
  id: string,
  base: PlainRecord | undefined,
  local: PlainRecord,
  remote: PlainRecord,
  state: MergeState
): PlainRecord {
  const localClock = recordClock(local);
  const remoteClock = recordClock(remote);
  const newer = compareCompositeTimestamps(localClock, remoteClock) >= 0 ? local : remote;

  const sameContent =
    local === remote ||
    recordContentHash(local, RECORD_SYNC_KEYS, state.memo) === recordContentHash(remote, RECORD_SYNC_KEYS, state.memo);
  if (sameContent) {
    const sameBookkeeping =
      local.updatedAt === remote.updatedAt &&
      local.updatedBy === remote.updatedBy &&
      canonicalJson(local.fieldTimestamps) === canonicalJson(remote.fieldTimestamps);
    if (sameBookkeeping) return withoutKeys(local, DELETION_KEYS);
    const stamps = readStamps(local.fieldTimestamps);
    for (const [field, ts] of Object.entries(readStamps(remote.fieldTimestamps))) {
      stamps[field] = laterStamp(stamps[field], ts) ?? ts;
    }
    return withBookkeeping(withoutKeys(local, DELETION_KEYS), stamps, newer);
  }

  const result = mergeFields(base, local, remote, ENTITY_SKIP_KEYS, localClock, remoteClock, true);
  state.summary.fieldsMerged += result.changed;
  if (result.tookRemote) {
    if (kind === "task") state.summary.tasksUpdated++;
    else state.summary.notesUpdated++;
  }
  recordFieldConflicts(
    state,
    kind === "task" ? "task_field" : "note",
    id,
    `${kind} "${displayName(kind, id, local)}"`,
    result.conflicts
  );
  return withBookkeeping({ id, ...result.merged }, result.stamps, newer);
}

/**
 * Merges a task or note collection. Records edited on one side and deleted on the other are kept
 * when the edit is concurrent with (3-way) or later than (no base) the deletion; otherwise the
 * deletion wins and is recorded as a tombstone. With a base, a record the base already had deleted
 * that one side brought back (for example a merge that kept a concurrent edit) stays, unless the
 * other side deleted it again since.
 */
function mergeRecordList(
  kind: EntityKind,
  baseList: unknown,
  localList: unknown,
  remoteList: unknown,
  state: MergeState
): PlainRecord[] {
  const baseMap = indexById(baseList);
  const localMap = indexById(localList);
  const remoteMap = indexById(remoteList);
  const sources = [
    [baseMap, state.baseClock],
    [localMap, state.localClock],
    [remoteMap, state.remoteClock]
  ] as const;
  for (const [map, clock] of sources) {
    for (const [id, item] of map) {
      if (item._deleted) addTombstone(state.tombstones, id, deletionTimeOf(item) ?? clock ?? state.fallbackDeletedAt, kind);
    }
  }

  const { sides } = state;
  const hasBase = sides.base !== undefined;
  const merged: PlainRecord[] = [];
  const ids = new Set([...localMap.keys(), ...remoteMap.keys(), ...baseMap.keys()]);
  for (const id of ids) {
    const baseItem = baseMap.get(id);
    const base = liveRecord(baseItem);
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);
    const local = liveRecord(localItem);
    const remote = liveRecord(remoteItem);

    if (local && remote) {
      // With a base, both sides descend from it: a record live on both was kept or brought back
      // (an undo, say) on both, whatever tombstones they still carry.
      const tombstone = hasBase ? undefined : tombstoneFor(state, id, kind);
      if (tombstone) {
        // Live on both sides but deleted elsewhere: only edits made after the deletion revive it.
        const latest = laterStamp(latestEdit(local), latestEdit(remote));
        if (compareCompositeTimestamps(latest, tombstone.deletedAt) <= 0) {
          state.summary.tombstonesPreserved++;
          continue;
        }
        state.tombstones.delete(id);
      }
      merged.push(mergeLiveRecord(kind, id, base, local, remote, state));
      continue;
    }

    const survivor = local ?? remote;
    if (!survivor) {
      // Deleted (or dropped) on both sides.
      if (base && !tombstoneFor(state, id, kind)) {
        addTombstone(state.tombstones, id, laterStamp(state.localClock, state.remoteClock) ?? state.fallbackDeletedAt, kind);
      }
      if (tombstoneFor(state, id, kind)) state.summary.tombstonesPreserved++;
      continue;
    }

    const survivorSide: Side = local ? "local" : "remote";
    const deletedCopy = survivorSide === "local" ? remoteItem : localItem;
    const deletingTombstones = survivorSide === "local" ? sides.remote : sides.local;
    const deletingClock = survivorSide === "local" ? state.remoteClock : state.localClock;
    // The deletion the other side itself holds (a soft-deleted copy or its own tombstone).
    const sideDeletedAt = sideDeletion(deletedCopy, deletingTombstones, id, kind, deletingClock, state.fallbackDeletedAt);

    let deletedAt: string | undefined;
    if (!base) {
      // Without a base, a tombstone carried in from any plan still counts as a deletion.
      deletedAt = hasBase ? sideDeletedAt : sideDeletedAt ?? tombstoneFor(state, id, kind)?.deletedAt;
      // Undated soft deletes are dated by the base's clock on both sides, so an unchanged copy compares equal.
      const baseDeletedAt = hasBase
        ? sideDeletion(baseItem, sides.base, id, kind, state.baseClock, state.fallbackDeletedAt)
        : undefined;
      const revived =
        baseDeletedAt !== undefined &&
        compareCompositeTimestamps(
          sideDeletion(deletedCopy, deletingTombstones, id, kind, state.baseClock, state.fallbackDeletedAt),
          baseDeletedAt
        ) <= 0;
      if (revived || deletedAt === undefined) {
        // Added on one side, or brought back on one side while the other still has the base's deletion.
        state.tombstones.delete(id);
        merged.push(withoutKeys(survivor, DELETION_KEYS));
        if (kind === "task") state.summary.tasksAdded++;
        else if (survivorSide === "remote") state.summary.notesUpdated++;
        continue;
      }
    }

    // Edited on one side, deleted on the other.
    deletedAt ??= sideDeletedAt ?? tombstoneFor(state, id, kind)?.deletedAt ?? deletingClock ?? state.fallbackDeletedAt;
    const keep = base
      ? recordContentHash(base, RECORD_SYNC_KEYS, state.memo) !== recordContentHash(survivor, RECORD_SYNC_KEYS, state.memo)
      : compareCompositeTimestamps(latestEdit(survivor), deletedAt) > 0;

    if (!keep) {
      addTombstone(state.tombstones, id, deletedAt, kind);
      if (kind === "task") state.summary.tasksDeleted++;
      state.summary.tombstonesPreserved++;
      continue;
    }

    state.tombstones.delete(id);
    const kept = withoutKeys(survivor, DELETION_KEYS);
    merged.push(kept);
    if (kind === "task") state.summary.tasksUpdated++;
    else state.summary.notesUpdated++;
    const label = `${kind === "task" ? "Task" : "Note"} "${displayName(kind, id, survivor)}"`;
    state.conflicts.push({
      type: kind === "task" ? "task_deletion" : "note",
      entityId: id,
      localValue: survivorSide === "local" ? survivor : deletedCopy ?? null,
      remoteValue: survivorSide === "remote" ? survivor : deletedCopy ?? null,
      resolvedValue: kept,
      resolution: survivorSide,
      description:
        survivorSide === "local"
          ? `${label} was deleted by a collaborator but has your edits. Kept it to protect your work.`
          : `${label} was deleted locally but a collaborator edited it. Kept their version.`
    });
  }

  // Records without an id are invalid, but never silently dropped from the local copy.
  for (const item of asList(localList)) {
    if (isRecord(item) && (typeof item.id !== "string" || !item.id)) merged.push(item);
  }
  return merged;
}

// ─── People, teams, documents, categories, calendars ─────────────────────────

/** Map of an id-keyed list, or null when it is not a list of records with string ids. */
function indexKeyedList(value: unknown): Map<string, unknown> | null {
  if (value === undefined || value === null) return new Map();
  if (!Array.isArray(value)) return null;
  const map = new Map<string, unknown>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) return null;
    map.set(item.id, item);
  }
  return map;
}

function indexKeyedMap(value: unknown): Map<string, unknown> | null {
  if (value === undefined || value === null) return new Map();
  return isRecord(value) ? new Map(Object.entries(value)) : null;
}

function mergeKeyedEntries(
  label: string,
  base: Map<string, unknown> | undefined,
  local: Map<string, unknown>,
  remote: Map<string, unknown>,
  state: MergeState
): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  const ids = new Set([...local.keys(), ...remote.keys()]);
  if (base) base.forEach((_value, id) => ids.add(id));

  for (const id of ids) {
    const baseValue = base?.get(id);
    const localValue = local.get(id);
    const remoteValue = remote.get(id);

    if (localValue !== undefined && remoteValue !== undefined) {
      if (isRecord(localValue) && isRecord(remoteValue)) {
        const result = mergeFields(
          isRecord(baseValue) ? baseValue : undefined,
          localValue,
          remoteValue,
          NO_KEYS,
          state.localClock,
          state.remoteClock
        );
        state.summary.fieldsMerged += result.changed;
        recordFieldConflicts(state, "meta", `${label}/${id}`, `${label} "${id}"`, result.conflicts);
        out.push([id, result.changed > 0 ? result.merged : localValue]);
      } else {
        const decision = decideValue(id, baseValue !== undefined, baseValue, localValue, remoteValue, {
          localClock: state.localClock,
          remoteClock: state.remoteClock
        });
        if (decision.conflict) {
          recordFieldConflicts(state, "meta", `${label}/${id}`, label, [
            { field: id, localValue, remoteValue, resolvedValue: decision.value, resolution: decision.from as Side }
          ]);
        }
        if (decision.value !== undefined) out.push([id, decision.value]);
      }
      continue;
    }

    const survivor = localValue ?? remoteValue;
    if (survivor === undefined) continue; // removed on both sides
    if (baseValue === undefined) {
      out.push([id, survivor]); // added on one side
      continue;
    }
    if (canonicalJson(baseValue) === canonicalJson(survivor)) continue; // removed on one side, untouched on the other
    out.push([id, survivor]);
    state.conflicts.push({
      type: "meta",
      entityId: `${label}/${id}`,
      localValue: localValue ?? null,
      remoteValue: remoteValue ?? null,
      resolvedValue: survivor,
      resolution: localValue !== undefined ? "local" : "remote",
      description: `"${id}" in ${label} was removed on one side and edited on the other. Kept the edited entry.`
    });
  }
  return out;
}

/** Merges every top-level key except meta, tasks and notes. */
function mergeRootFields(
  base: JanttData | undefined,
  local: JanttData,
  remote: JanttData,
  state: MergeState
): PlainRecord {
  const out: PlainRecord = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  if (base) Object.keys(base).forEach((key) => keys.add(key));

  for (const key of keys) {
    if (key === "meta" || key === "tasks" || key === "notes") continue;
    const baseValue = base?.[key];
    const localValue = local[key];
    const remoteValue = remote[key];
    if (localValue === undefined && remoteValue === undefined) continue;

    const isList = KEYED_LIST_KEYS.has(key);
    if (isList || KEYED_MAP_KEYS.has(key)) {
      const index = isList ? indexKeyedList : indexKeyedMap;
      const baseMap = base ? index(baseValue) : undefined;
      const localMap = index(localValue);
      const remoteMap = index(remoteValue);
      if (localMap && remoteMap && baseMap !== null) {
        const entries = mergeKeyedEntries(key, baseMap, localMap, remoteMap, state);
        out[key] = isList ? entries.map(([, value]) => value) : Object.fromEntries(entries);
        continue;
      }
    }

    const decision = decideValue(key, base !== undefined, baseValue, localValue, remoteValue, {
      localClock: state.localClock,
      remoteClock: state.remoteClock
    });
    if (decision.value !== undefined) out[key] = decision.value;
    if (decision.conflict) {
      recordFieldConflicts(state, "meta", key, "the plan", [
        { field: key, localValue, remoteValue, resolvedValue: decision.value, resolution: decision.from as Side }
      ]);
    }
  }
  return out;
}

/** Removes links to deleted tasks, keeping every other link exactly as written. */
function pruneDeletedDependencies(tasks: PlainRecord[], tombstones: Map<string, Tombstone>): PlainRecord[] {
  const liveIds = new Set<string>();
  for (const task of tasks) if (typeof task.id === "string") liveIds.add(task.id);
  const deletedIds = new Set<string>();
  for (const [id, record] of tombstones) {
    if (record.entityType === "task" && !liveIds.has(id)) deletedIds.add(id);
  }
  if (deletedIds.size === 0) return tasks;

  const knownIds = new Set([...liveIds, ...deletedIds]);
  return tasks.map((task) => {
    if (task.dependsOn === undefined || task.dependsOn === null) return task;
    const pruned = filterDependsOn(task.dependsOn, (rel) => !deletedIds.has(rel.id), knownIds);
    return pruned === task.dependsOn ? task : { ...task, dependsOn: pruned };
  });
}

function emptyResult(mergedData: JanttData, remoteChanged: boolean, localChanged: boolean): ReconcileResult {
  return { mergedData, hasConflicts: false, conflicts: [], summary: emptySummary(), remoteChanged, localChanged };
}

/**
 * Three-way (or, without a base, two-way) state-based merge of Jantt plans.
 *
 * Every key of every task, note, person, team, document, category, calendar and of `meta` is
 * merged against the common base: a side that left a value untouched yields to the side that
 * changed it, and only values changed on both sides are decided by field timestamps, then record
 * timestamps, then a deterministic value comparison (recorded in `conflicts`). Deletions travel as
 * tombstones in `meta.tombstones`. The result does not depend on which plan is passed as local or
 * remote: `calculatePlanHash(merge(A, B)) === calculatePlanHash(merge(B, A))`.
 */
export function reconcilePlans(
  base: JanttData | null | undefined,
  local: JanttData,
  remote: JanttData,
  options?: ReconcileOptions
): ReconcileResult {
  const basePlan = isRecord(base) ? (base as JanttData) : undefined;
  const localPlan: JanttData = isRecord(local) ? local : { tasks: [] };
  const remotePlan: JanttData = isRecord(remote) ? remote : { tasks: [] };

  // One memo for every hash and record comparison of this merge (the inputs are never mutated).
  const memo: CanonicalMemo = new Map();

  // Content-identical shortcuts are safe only when no deletion bookkeeping has to be merged.
  const hasDeletions = hasSyncDeletions(localPlan) || hasSyncDeletions(remotePlan) || hasSyncDeletions(basePlan);
  if (!hasDeletions) {
    const localHash = calculatePlanHash(localPlan, memo);
    const remoteHash = calculatePlanHash(remotePlan, memo);
    if (localHash === remoteHash) return emptyResult(remotePlan, false, false);
    if (basePlan) {
      const baseHash = calculatePlanHash(basePlan, memo);
      if (localHash === baseHash) return emptyResult(remotePlan, true, false);
      if (remoteHash === baseHash) return emptyResult(localPlan, false, true);
    }
  }

  const nowIso = new Date().toISOString();
  const sideTombstones = (plan: JanttData | undefined) => {
    const tombstones = new Map<string, Tombstone>();
    addMetaTombstones(tombstones, plan);
    return tombstones;
  };
  const sides: MergeState["sides"] = {
    base: basePlan ? sideTombstones(basePlan) : undefined,
    local: sideTombstones(localPlan),
    remote: sideTombstones(remotePlan)
  };
  const state: MergeState = {
    conflicts: [],
    summary: emptySummary(),
    tombstones: new Map(),
    sides,
    baseClock: planClock(basePlan),
    localClock: planClock(localPlan),
    remoteClock: planClock(remotePlan),
    fallbackDeletedAt: `${nowIso}#${options?.clientId || "client"}`,
    memo
  };
  for (const tombstones of [sides.base, sides.local, sides.remote]) {
    tombstones?.forEach((record, id) => addTombstone(state.tombstones, id, record.deletedAt, record.entityType));
  }

  let tasks = mergeRecordList("task", basePlan?.tasks, localPlan.tasks, remotePlan.tasks, state);
  const notes = mergeRecordList("note", basePlan?.notes, localPlan.notes, remotePlan.notes, state);
  tasks = pruneDeletedDependencies(tasks, state.tombstones);

  // A live record never keeps a tombstone.
  for (const [list, kind] of [[tasks, "task"], [notes, "note"]] as const) {
    for (const record of list) {
      if (typeof record.id === "string" && state.tombstones.get(record.id)?.entityType === kind) {
        state.tombstones.delete(record.id);
      }
    }
  }
  if (options?.purgeTombstones !== false) {
    const maxAgeDays = options?.tombstoneMaxAgeDays ?? DEFAULT_TOMBSTONE_MAX_AGE_DAYS;
    pruneTombstones(state.tombstones, Date.now() - maxAgeDays * DAY_MS, options?.maxTombstones ?? DEFAULT_MAX_TOMBSTONES);
  }

  const rootFields = mergeRootFields(basePlan, localPlan, remotePlan, state);
  const metaMerge = mergeFields(
    basePlan ? (isRecord(basePlan.meta) ? basePlan.meta : {}) : undefined,
    isRecord(localPlan.meta) ? localPlan.meta : {},
    isRecord(remotePlan.meta) ? remotePlan.meta : {},
    META_SYNC_KEYS,
    state.localClock,
    state.remoteClock
  );
  state.summary.fieldsMerged += metaMerge.changed;
  recordFieldConflicts(state, "meta", "meta", "the plan settings", metaMerge.conflicts);

  const localRevision = planRevision(localPlan);
  const remoteRevision = planRevision(remotePlan);
  const nextRevision = Math.max(localRevision, remoteRevision, planRevision(basePlan)) + 1;

  const mergedData: JanttData = {
    ...rootFields,
    meta: {
      ...metaMerge.merged,
      revision: nextRevision,
      updatedAt: nowIso,
      ...(state.tombstones.size > 0 ? { tombstones: Object.fromEntries(state.tombstones) } : {}),
      sync: {
        revision: nextRevision,
        contentHash: "",
        updatedAt: nowIso,
        // Never an undefined value: the Realtime Database SDK rejects writes containing one.
        ...(options?.clientId ? { clientId: options.clientId } : {}),
        baseRevision: Math.max(localRevision, remoteRevision)
      }
    },
    tasks: tasks as Task[]
  };
  if (notes.length > 0 || Array.isArray(localPlan.notes) || Array.isArray(remotePlan.notes)) {
    mergedData.notes = notes as JanttData["notes"];
  }

  const contentHash = calculatePlanHash(mergedData, memo);
  mergedData.meta!.contentHash = contentHash;
  mergedData.meta!.sync!.contentHash = contentHash;

  return {
    mergedData,
    hasConflicts: state.conflicts.length > 0,
    conflicts: state.conflicts,
    summary: state.summary,
    remoteChanged: true,
    localChanged: true
  };
}

/**
 * Two-way merge of plans without a common base (union of both, concurrent edits resolved by
 * timestamps and then deterministically). `mergePlansCommutative(A, B)` and
 * `mergePlansCommutative(B, A)` produce the same content hash.
 */
export function mergePlansCommutative(
  planA: JanttData,
  planB: JanttData,
  options?: { clientId?: string }
): ReconcileResult {
  return reconcilePlans(null, planA, planB, options);
}

/**
 * Removes soft-deleted tasks/notes and `meta.tombstones` entries older than `maxAgeDays`
 * (default 30). Entries whose deletion date is missing or unparseable are kept.
 */
export function purgeTombstones(data: JanttData, maxAgeDays = DEFAULT_TOMBSTONE_MAX_AGE_DAYS): JanttData {
  if (!data) return data;
  const cutoffMs = Date.now() - maxAgeDays * DAY_MS;
  const keep = (item: unknown) =>
    !isRecord(item) || !item._deleted || !isTombstoneExpired(deletionTimeOf(item), cutoffMs);

  let meta = data.meta;
  if (isRecord(meta?.tombstones)) {
    const next: Record<string, { deletedAt: string; entityType?: string }> = {};
    for (const [id, record] of Object.entries(meta.tombstones)) {
      if (!isRecord(record) || !readTimestamp(record.deletedAt)) continue;
      if (!isTombstoneExpired(record.deletedAt, cutoffMs)) next[id] = record as { deletedAt: string; entityType?: string };
    }
    meta = { ...meta, tombstones: Object.keys(next).length > 0 ? next : undefined };
  }

  const purged: JanttData = { ...data, meta, tasks: asList(data.tasks).filter(keep) as Task[] };
  if (Array.isArray(data.notes)) purged.notes = data.notes.filter(keep);
  return purged;
}

/**
 * Routine maintenance of a plan:
 * 1. Turns soft-deleted tasks and notes into `meta.tombstones`, drops tombstones older than
 *    `maxAgeDays` (default 30) and keeps at most `maxTombstones` (default 1000), newest first.
 * 2. Removes dependency links to tasks that no longer exist (and self links), keeping the other
 *    links exactly as written.
 * 3. Removes empty `fieldTimestamps` objects.
 * 4. Recomputes `meta.contentHash`.
 */
export function maintainPlanData(
  data: JanttData,
  options?: { maxAgeDays?: number; maxTombstones?: number }
): JanttData {
  if (!data) return data;
  const cutoffMs = Date.now() - (options?.maxAgeDays ?? DEFAULT_TOMBSTONE_MAX_AGE_DAYS) * DAY_MS;
  // An undated soft delete happened no later than the plan's last save.
  const undatedDeletion = planClock(data) ?? new Date().toISOString();

  const tombstones = new Map<string, Tombstone>();
  addMetaTombstones(tombstones, data);
  for (const [list, kind] of [[data.tasks, "task"], [data.notes, "note"]] as const) {
    for (const item of asList(list)) {
      if (isRecord(item) && item._deleted && typeof item.id === "string") {
        addTombstone(tombstones, item.id, deletionTimeOf(item) ?? undatedDeletion, kind);
      }
    }
  }
  pruneTombstones(tombstones, cutoffMs, options?.maxTombstones ?? DEFAULT_MAX_TOMBSTONES);

  // Live records survive unless a tombstone is newer than their latest edit.
  const isLive = (item: unknown, kind: EntityKind): item is PlainRecord => {
    if (!isRecord(item) || item._deleted) return false;
    const tombstone = typeof item.id === "string" ? tombstones.get(item.id) : undefined;
    if (!tombstone || tombstone.entityType !== kind) return true;
    if (compareCompositeTimestamps(latestEdit(item), tombstone.deletedAt) <= 0) return false;
    tombstones.delete(item.id as string);
    return true;
  };
  const withoutEmptyStamps = (record: PlainRecord): PlainRecord =>
    isRecord(record.fieldTimestamps) && Object.keys(record.fieldTimestamps).length === 0
      ? withoutKeys(record, STAMP_KEYS)
      : record;

  const liveTasks = asList(data.tasks).filter((task) => isLive(task, "task")) as PlainRecord[];
  const liveIds = new Set(liveTasks.map((task) => task.id as string));
  const tasks = liveTasks.map((task) => {
    const cleaned = withoutEmptyStamps(task);
    if (cleaned.dependsOn === undefined || cleaned.dependsOn === null) return cleaned;
    const pruned = filterDependsOn(cleaned.dependsOn, (rel) => rel.id !== task.id && liveIds.has(rel.id), liveIds);
    return pruned === cleaned.dependsOn ? cleaned : { ...cleaned, dependsOn: pruned };
  });

  const maintained: JanttData = { ...data, tasks: tasks as Task[] };
  if (Array.isArray(data.notes)) {
    maintained.notes = data.notes.filter((note) => isLive(note, "note")).map(withoutEmptyStamps) as JanttData["notes"];
  }

  const nextTombstones = tombstones.size > 0 ? Object.fromEntries(tombstones) : undefined;
  if (isRecord(data.meta) || nextTombstones) {
    const meta = { ...(isRecord(data.meta) ? data.meta : {}) } as NonNullable<JanttData["meta"]>;
    if (nextTombstones) meta.tombstones = nextTombstones;
    else delete meta.tombstones;
    maintained.meta = meta;
  }

  const contentHash = calculatePlanHash(maintained);
  if (maintained.meta) {
    maintained.meta.contentHash = contentHash;
    if (isRecord(maintained.meta.sync)) maintained.meta.sync = { ...maintained.meta.sync, contentHash };
  }
  return maintained;
}
