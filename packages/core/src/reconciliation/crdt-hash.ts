import type { JanttData } from "../types";
import { getDependsOnItems, parseDependencyRelation } from "../dependencies";

/**
 * Keys that carry account, session or secret identifiers rather than plan content. They are
 * stripped from the plan root, `meta` and every record of {@link PLAN_RECORD_COLLECTIONS} before a
 * plan is persisted (see `sanitizePlanForJson`) and are ignored by content comparison.
 */
export const INTERNAL_IDENTITY_KEYS: ReadonlySet<string> = new Set([
  "uid",
  "ownerUid",
  "firebaseUid",
  "secret",
  "secretKey",
  "authId",
  "authToken",
  "accessToken",
  "clientUid",
  "peerId"
]);

/** Top-level id-keyed record collections of a plan. */
export const PLAN_RECORD_COLLECTIONS = ["tasks", "notes", "people", "teams", "documents"] as const;

/** Per-record CRDT bookkeeping on tasks and notes; not part of their content. */
export const RECORD_SYNC_KEYS: ReadonlySet<string> = new Set([
  "fieldTimestamps",
  "updatedAt",
  "updatedBy",
  "_deleted",
  "deletedAt"
]);

/** Plan-level sync bookkeeping kept in `meta`; not part of the plan content. */
export const META_SYNC_KEYS: ReadonlySet<string> = new Set([
  "sync",
  "contentHash",
  "revision",
  "updatedAt",
  "updatedBy",
  "clientId",
  "tombstones"
]);

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * Optional memo of task/note content hashes keyed by object identity, for callers that hash the
 * same records several times (one merge hashes and compares each record repeatedly). Only valid
 * while the memoized records are not mutated; create a fresh one per operation.
 */
export interface CanonicalMemo {
  get(record: object): string | undefined;
  set(record: object, hash: string): unknown;
}

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Record field values that mean the same as "not set" (and that `cleanPlanForSharing` drops), so
 * a plan and its shared copy compare equal.
 */
function isDefaultFieldValue(field: string, value: unknown): boolean {
  switch (field) {
    case "progress":
      return value === 0;
    case "status":
      return value === "not-started";
    case "notes":
    case "color":
    case "priority":
      return value === "";
    case "milestone":
    case "urgent":
    case "locked":
      return value === false;
    default:
      return false;
  }
}

/**
 * Order-independent form of a `dependsOn` value: one "id:type:lag" entry per link, sorted. A bare
 * string that only parses as "<id><lag>" shorthand ("render-3d") may just as well be a task id, so
 * it keeps its text and never compares equal to a typed link such as "render:FS-3d". (Merges and
 * stamps compare single fields without the plan's task ids, so the ambiguity is not resolved here.)
 */
function canonicalDependencies(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  const entries: string[] = [];
  for (const item of getDependsOnItems(value)) {
    const rel = parseDependencyRelation(item);
    if (!rel) continue;
    const text = typeof item === "string" ? item.trim() : "";
    if (text && rel.id !== text && !text.includes(":")) entries.push(text);
    else entries.push(`${rel.id}:${rel.type}:${rel.explicitLag || rel.lagDays !== 0 ? rel.lagDays : "gap"}`);
  }
  return entries.sort();
}

/**
 * Canonical content rules, shared by the string form and the hash below. They mirror what survives
 * a JSON + Realtime Database round trip: null, undefined, non-finite numbers, empty arrays and
 * empty objects carry no content, and object keys are ordered by UTF-16 code unit.
 */
function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  switch (typeof value) {
    case "string":
    case "boolean":
    case "bigint":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      break;
    default:
      return false;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (hasContent(value[i])) return true;
    return false;
  }
  for (const key of Object.keys(value)) if (hasContent((value as PlainRecord)[key])) return true;
  return false;
}

// Content of one field of a plan record (task, note, person, ...); undefined when it has none.
// Nested user data (custom fields, baselines) keeps every value as is.
function recordFieldContent(key: string, value: unknown): unknown {
  if (INTERNAL_IDENTITY_KEYS.has(key) || isDefaultFieldValue(key, value)) return undefined;
  const content = key === "dependsOn" ? canonicalDependencies(value) : value;
  return hasContent(content) ? content : undefined;
}

function sortedKeys(record: object): string[] {
  const keys = Object.keys(record);
  // Records read back from the Realtime Database already arrive in key order.
  for (let i = 1; i < keys.length; i++) {
    if (keys[i - 1] > keys[i]) return keys.sort();
  }
  return keys;
}

// ─── Canonical JSON (for small values) ───────────────────────────────────────

function encodeCanonical(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? String(value) : undefined;
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return value.toString();
    case "object":
      break;
    default:
      return undefined;
  }
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const encoded = encodeCanonical(item);
      if (encoded !== undefined) parts.push(encoded);
    }
    return parts.length > 0 ? `[${parts.join(",")}]` : undefined;
  }
  for (const key of sortedKeys(value)) {
    const encoded = encodeCanonical((value as PlainRecord)[key]);
    if (encoded !== undefined) parts.push(`${JSON.stringify(key)}:${encoded}`);
  }
  return parts.length > 0 ? `{${parts.join(",")}}` : undefined;
}

/**
 * Canonical JSON of any value: sorted keys, and null/undefined/empty values dropped, so values
 * that persist identically produce identical strings. Returns "" for "no value".
 */
export function canonicalJson(value: unknown): string {
  return encodeCanonical(value) ?? "";
}

/**
 * Canonical JSON of one record field. `dependsOn` compares by its parsed links rather than its
 * spelling, and default values (progress 0, status "not-started", false flags, empty notes/color/
 * priority) equal a missing field.
 */
export function canonicalFieldJson(field: string, value: unknown): string {
  if (isDefaultFieldValue(field, value)) return "";
  return encodeCanonical(field === "dependsOn" ? canonicalDependencies(value) : value) ?? "";
}

// ─── Streaming content hash (no intermediate strings) ────────────────────────

const K1 = 2654435761;
const K2 = 1597334677;
// Structure tokens lie above the UTF-16 range, so they never collide with string content.
const TOKEN_OBJECT = 0x10001;
const TOKEN_ARRAY = 0x10002;
const TOKEN_END = 0x10003;
const TOKEN_STRING = 0x10004;
const TOKEN_NUMBER = 0x10005;
const TOKEN_TRUE = 0x10006;
const TOKEN_FALSE = 0x10007;
const TOKEN_KEY = 0x10008;
const TOKEN_RECORD = 0x10009;

const numberView = new DataView(new ArrayBuffer(8));

/** 64-bit non-cryptographic hash: cyrb53 mixing with both 32-bit lanes kept and finalized. */
class ContentHasher {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  token(code: number): void {
    this.h1 = Math.imul(this.h1 ^ code, K1);
    this.h2 = Math.imul(this.h2 ^ code, K2);
  }

  /** Length-prefixed, so no escaping is needed to keep adjacent strings apart. */
  text(token: number, text: string): void {
    let h1 = Math.imul(Math.imul(this.h1 ^ token, K1) ^ text.length, K1);
    let h2 = Math.imul(Math.imul(this.h2 ^ token, K2) ^ text.length, K2);
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, K1);
      h2 = Math.imul(h2 ^ ch, K2);
    }
    this.h1 = h1;
    this.h2 = h2;
  }

  number(value: number): void {
    numberView.setFloat64(0, value === 0 ? 0 : value, true); // -0 hashes like 0
    this.token(TOKEN_NUMBER);
    this.token(numberView.getUint32(0, true));
    this.token(numberView.getUint32(4, true));
  }

  value(value: unknown): void {
    switch (typeof value) {
      case "string":
        this.text(TOKEN_STRING, value);
        return;
      case "number":
        this.number(value);
        return;
      case "boolean":
        this.token(value ? TOKEN_TRUE : TOKEN_FALSE);
        return;
      case "bigint":
        this.text(TOKEN_NUMBER, value.toString());
        return;
    }
    if (Array.isArray(value)) {
      this.token(TOKEN_ARRAY);
      for (const item of value) if (hasContent(item)) this.value(item);
      this.token(TOKEN_END);
      return;
    }
    this.token(TOKEN_OBJECT);
    for (const key of sortedKeys(value as object)) {
      const item = (value as PlainRecord)[key];
      if (!hasContent(item)) continue;
      this.text(TOKEN_KEY, key);
      this.value(item);
    }
    this.token(TOKEN_END);
  }

  /** A plan record: bookkeeping (`omit`), identity keys and default values are skipped. */
  record(record: PlainRecord, omit: ReadonlySet<string>): void {
    this.token(TOKEN_OBJECT);
    for (const key of sortedKeys(record)) {
      if (omit.has(key)) continue;
      const content = recordFieldContent(key, record[key]);
      if (content === undefined) continue;
      this.text(TOKEN_KEY, key);
      this.value(content);
    }
    this.token(TOKEN_END);
  }

  digest(): string {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
}

function recordHasContent(record: PlainRecord, omit: ReadonlySet<string>): boolean {
  for (const key of Object.keys(record)) {
    if (!omit.has(key) && recordFieldContent(key, record[key]) !== undefined) return true;
  }
  return false;
}

/**
 * 64-bit content hash (16 hex chars) of one plan record, ignoring the given bookkeeping keys
 * (task/note CRDT metadata by default), internal identity keys and default field values. Two
 * records are logically identical exactly when their content hashes are equal.
 */
export function recordContentHash(
  record: PlainRecord | null | undefined,
  omit: ReadonlySet<string> = RECORD_SYNC_KEYS,
  memo?: CanonicalMemo
): string {
  const hasher = new ContentHasher();
  if (!isPlainRecord(record)) {
    if (hasContent(record)) hasher.value(record);
    return hasher.digest();
  }
  const cache = omit === RECORD_SYNC_KEYS ? memo : undefined;
  const cached = cache?.get(record);
  if (cached !== undefined) return cached;
  hasher.record(record, omit);
  const digest = hasher.digest();
  cache?.set(record, digest);
  return digest;
}

function normalizePerson(person: PlainRecord): PlainRecord {
  // sanitizePlanForJson stores usernames as "@name"; hash both spellings alike.
  const username = person.username;
  if (typeof username !== "string" || username.startsWith("@")) return person;
  return { ...person, username: `@${username}` };
}

/** Hashes an id-keyed collection as the content hashes of its records, ordered by id. */
function hashCollection(
  hasher: ContentHasher,
  key: string,
  list: unknown,
  omit: ReadonlySet<string>,
  skipDeleted: boolean,
  memo?: CanonicalMemo,
  mapRecord?: (record: PlainRecord) => PlainRecord
): void {
  if (!Array.isArray(list)) {
    if (hasContent(list)) {
      hasher.text(TOKEN_KEY, key);
      hasher.value(list);
    }
    return;
  }
  const items: unknown[] = [];
  let sortable = true;
  for (const item of list) {
    if (isPlainRecord(item)) {
      if (skipDeleted && item._deleted) continue;
      if (typeof item.id !== "string") sortable = false;
      items.push(mapRecord ? mapRecord(item) : item);
    } else if (hasContent(item)) {
      sortable = false;
      items.push(item);
    }
  }
  if (items.length === 0) return;
  if (sortable) items.sort((a, b) => codePointCompare((a as { id: string }).id, (b as { id: string }).id));

  hasher.text(TOKEN_KEY, key);
  hasher.token(TOKEN_ARRAY);
  for (const item of items) {
    if (isPlainRecord(item)) hasher.text(TOKEN_RECORD, recordContentHash(item, omit, memo));
    else hasher.value(item);
  }
  hasher.token(TOKEN_END);
}

/**
 * Deterministic 64-bit content hash (16 hex chars) of a plan. Every persisted content field counts
 * (priority, milestone, baselines, meta flags, notes, people, categories, ...). Key order,
 * collection order, CRDT/sync bookkeeping (`meta.sync`, `meta.revision`, `meta.updatedAt`,
 * `meta.contentHash`, `meta.tombstones`, per-record timestamps), soft-deleted records, `$schema`,
 * internal identity keys, default field values and values the Realtime Database drops (null,
 * empty arrays/objects) do not.
 */
export function calculatePlanHash(data: JanttData | null | undefined, memo?: CanonicalMemo): string {
  if (!data || typeof data !== "object") return "0000000000000000";
  const hasher = new ContentHasher();
  hasher.token(TOKEN_OBJECT);
  for (const key of sortedKeys(data)) {
    if (key === "$schema" || INTERNAL_IDENTITY_KEYS.has(key)) continue;
    const value = data[key];
    if (key === "tasks" || key === "notes") {
      hashCollection(hasher, key, value, RECORD_SYNC_KEYS, true, memo);
    } else if (key === "people") {
      hashCollection(hasher, key, value, NO_KEYS, false, undefined, normalizePerson);
    } else if (key === "teams" || key === "documents") {
      hashCollection(hasher, key, value, NO_KEYS, false);
    } else if (key === "meta" && isPlainRecord(value)) {
      if (recordHasContent(value, META_SYNC_KEYS)) {
        hasher.text(TOKEN_KEY, key);
        hasher.record(value, META_SYNC_KEYS);
      }
    } else if (hasContent(value)) {
      hasher.text(TOKEN_KEY, key);
      hasher.value(value);
    }
  }
  hasher.token(TOKEN_END);
  return hasher.digest();
}
