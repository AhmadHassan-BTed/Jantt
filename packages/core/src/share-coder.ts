import { deflateSync, Inflate, strToU8, strFromU8 } from "fflate";
import type { JanttData, Task } from "./types";
import { validate } from "./validator";
import { INTERNAL_IDENTITY_KEYS, META_SYNC_KEYS, PLAN_RECORD_COLLECTIONS } from "./reconciliation/crdt-hash";

/** Longest share payload accepted for decoding, in characters (about 384 KB of compressed plan). */
export const MAX_SHARE_PAYLOAD_LENGTH = 512 * 1024;
/** Largest decoded plan JSON accepted from a share payload, in bytes. */
export const MAX_SHARE_INFLATED_BYTES = 5 * 1024 * 1024;
/** Most tasks a shared plan may contain. */
export const MAX_SHARE_TASKS = 5000;

// Small input chunks bound how much a single inflate step can expand (deflate tops out near 1032:1).
const INFLATE_CHUNK_BYTES = 4 * 1024;

const SYNC_RECORD_KEYS = ["_deleted", "deletedAt", "fieldTimestamps", "updatedBy"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function withoutInternalKeys(record: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    // "__proto__" would replace the copy's prototype instead of becoming a property.
    if (key !== "__proto__" && !INTERNAL_IDENTITY_KEYS.has(key)) clean[key] = value;
  }
  return clean;
}

/**
 * Strips internal synchronization metadata (`meta` sync bookkeeping such as revision, content hash
 * and tombstones, soft-deleted records and per-field timestamps), internal account/session
 * identifiers and default values from a plan before URL serialization. Also used on decoded links,
 * so a crafted link cannot carry merge metadata into a plan.
 */
export function cleanPlanForSharing(data: JanttData): JanttData {
  if (!data) return data;
  const clone = withoutInternalKeys(JSON.parse(JSON.stringify(data))) as JanttData;

  // Prune top-level schema and internal sync structures
  delete (clone as any).$schema;

  if (isPlainObject(clone.meta)) {
    const meta = withoutInternalKeys(clone.meta);
    for (const key of META_SYNC_KEYS) delete meta[key];
    clone.meta = meta;
  }

  for (const collection of ["people", "teams", "documents"] as const) {
    const list = clone[collection];
    if (Array.isArray(list)) {
      (clone as Record<string, unknown>)[collection] = list.map((item: unknown) =>
        isPlainObject(item) ? withoutInternalKeys(item) : item
      );
    }
  }

  // Filter out soft-deleted tasks and strip per-field CRDT timestamps
  if (Array.isArray(clone.tasks)) {
    clone.tasks = clone.tasks
      .filter((t: Task) => t && !t._deleted)
      .map((t: Task) => {
        const copy: any = withoutInternalKeys(t);
        for (const key of SYNC_RECORD_KEYS) delete copy[key];
        delete copy.updatedAt;

        // Prune empty or default properties to save bytes. `gapDays: 0` is kept: a missing gap
        // means "use the project default", which would change the schedule.
        if (copy.progress === 0) delete copy.progress;
        if (copy.status === "not-started") delete copy.status;
        if (Array.isArray(copy.dependsOn) && copy.dependsOn.length === 0) {
          delete copy.dependsOn;
        }
        if (Array.isArray(copy.dependencies) && copy.dependencies.length === 0) {
          delete copy.dependencies;
        }
        if (copy.notes === "") delete copy.notes;
        if (copy.color === "") delete copy.color;
        if (copy.priority === "") delete copy.priority;
        if (copy.milestone === false) delete copy.milestone;
        if (copy.urgent === false) delete copy.urgent;
        if (copy.locked === false) delete copy.locked;

        return copy as Task;
      });
  }

  // Notes keep updatedAt (it is shown to readers) but lose deletion and CRDT bookkeeping
  if (Array.isArray(clone.notes)) {
    clone.notes = clone.notes
      .filter((n) => n && !n._deleted)
      .map((n) => {
        const copy: any = withoutInternalKeys(n as unknown as Record<string, unknown>);
        for (const key of SYNC_RECORD_KEYS) delete copy[key];
        return copy;
      });
  }

  // Prune empty optional collections
  if (Array.isArray(clone.notes) && clone.notes.length === 0) delete clone.notes;
  if (Array.isArray(clone.milestones) && clone.milestones.length === 0) delete clone.milestones;
  if (Array.isArray(clone.documents) && clone.documents.length === 0) delete clone.documents;
  if (Array.isArray(clone.people) && clone.people.length === 0) delete clone.people;
  if (Array.isArray(clone.teams) && clone.teams.length === 0) delete clone.teams;
  if (clone.categories && Object.keys(clone.categories).length === 0) delete clone.categories;

  return clone;
}

/**
 * Converts a Uint8Array into a safe Base64URL string (URL-safe alphabet, unpadded).
 * Uses chunking to prevent call-stack overflow on large arrays.
 */
export function uint8ToBase64Url(u8: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < u8.length; i += chunkSize) {
    const chunk = u8.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  const base64 =
    typeof btoa !== "undefined"
      ? btoa(binary)
      : typeof Buffer !== "undefined"
      ? Buffer.from(binary, "binary").toString("base64")
      : "";

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Converts a Base64URL string back into a Uint8Array.
 */
export function base64UrlToUint8(b64url: string): Uint8Array {
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary =
    typeof atob !== "undefined"
      ? atob(base64)
      : typeof Buffer !== "undefined"
      ? Buffer.from(base64, "base64").toString("binary")
      : "";

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Inflates raw-deflate bytes, throwing once the output would exceed `maxBytes`, so a
 * decompression bomb is rejected after a bounded amount of work and memory.
 */
function inflateCapped(compressed: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxBytes) throw new Error(`Shared plan expands beyond ${maxBytes} bytes.`);
    chunks.push(chunk);
  });
  for (let offset = 0; offset < compressed.length; offset += INFLATE_CHUNK_BYTES) {
    const end = Math.min(offset + INFLATE_CHUNK_BYTES, compressed.length);
    inflater.push(compressed.subarray(offset, end), end === compressed.length);
  }
  if (compressed.length === 0) inflater.push(compressed, true);

  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

/**
 * Compresses and encodes JanttData into a compact URL-safe string.
 * Result is prefixed with 'z~' to denote fflate deflate-raw compression.
 */
export function compressPlanToUrlPayload(data: JanttData): string {
  let bytes: Uint8Array;
  try {
    bytes = strToU8(JSON.stringify(cleanPlanForSharing(data)));
  } catch (err) {
    console.error("Failed to serialize plan data for sharing:", err);
    return "";
  }
  try {
    return `z~${uint8ToBase64Url(deflateSync(bytes, { level: 9 }))}`;
  } catch (err) {
    console.error("Failed to compress plan data:", err);
    // Uncompressed fallback of the same cleaned plan (decoded as a legacy link)
    return uint8ToBase64Url(bytes);
  }
}

// "__proto__" would become an object's prototype when a decoded record is later copied by
// assignment (Object.assign, deep merges), so untrusted share JSON never keeps such a key.
function dropPrototypeKeys(key: string, value: unknown): unknown {
  return key === "__proto__" ? undefined : value;
}

/**
 * Decodes a URL payload string back into validated JanttData, stripped of sync metadata.
 * Supports:
 * 1. Modern compressed payloads ('z~' prefix)
 * 2. Legacy uncompressed base64 / base64url payloads (backward compatibility)
 * Payloads longer than {@link MAX_SHARE_PAYLOAD_LENGTH}, expanding beyond
 * {@link MAX_SHARE_INFLATED_BYTES} or holding more than {@link MAX_SHARE_TASKS} tasks are rejected
 * (returns null). `__proto__` keys are dropped at every depth.
 */
export function decompressPlanFromUrlPayload(payload: string): JanttData | null {
  if (!payload || typeof payload !== "string") return null;
  if (payload.length > MAX_SHARE_PAYLOAD_LENGTH) {
    console.error("Shared plan link is too large to open.");
    return null;
  }

  try {
    let jsonStr = "";

    if (payload.startsWith("z~") || payload.startsWith("z:")) {
      const compressedBytes = base64UrlToUint8(payload.slice(2));
      jsonStr = strFromU8(inflateCapped(compressedBytes, MAX_SHARE_INFLATED_BYTES));
    } else {
      // Legacy uncompressed base64 / base64url format (bounded by the payload length check)
      jsonStr = strFromU8(base64UrlToUint8(payload));
    }

    const parsed = JSON.parse(jsonStr, dropPrototypeKeys);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (Array.isArray(parsed.tasks) && parsed.tasks.length > MAX_SHARE_TASKS) {
      console.error(`Shared plan has more than ${MAX_SHARE_TASKS} tasks and was not opened.`);
      return null;
    }
    const cleaned = cleanPlanForSharing(parsed as JanttData);
    return validate(cleaned).valid ? cleaned : null;
  } catch (err) {
    console.error("Failed to decompress plan from URL payload:", err);
    return null;
  }
}

function asMention(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  return value.startsWith("@") ? value : `@${value.replace(/^@+/, "")}`;
}

function normalizeMentions(record: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["clientId", "updatedBy"]) {
    if (!(key in record)) continue;
    const mention = asMention(record[key]);
    if (mention === undefined) delete record[key];
    else record[key] = mention;
  }
  return record;
}

/**
 * Returns a JSON-safe copy of a plan without internal account/session identifiers.
 *
 * Removes the exact keys in `INTERNAL_IDENTITY_KEYS` (uid, ownerUid, firebaseUid, secret,
 * secretKey, authId, authToken, accessToken, clientUid, peerId) from the plan root, `meta`,
 * `meta.sync` and every task, note, person, team and document record. Values nested deeper, such
 * as a task's custom `fields`, belong to the user and are left untouched. `updatedBy`/`clientId`
 * on tasks, notes and sync metadata, and people's `username`, are normalized to "@mention" form.
 */
export function sanitizePlanForJson(data: JanttData): JanttData {
  if (!data || typeof data !== "object") return data;
  const result = withoutInternalKeys(JSON.parse(JSON.stringify(data))) as JanttData;

  if (isPlainObject(result.meta)) {
    const meta = normalizeMentions(withoutInternalKeys(result.meta));
    if (isPlainObject(meta.sync)) meta.sync = normalizeMentions(withoutInternalKeys(meta.sync));
    result.meta = meta;
  }

  for (const collection of PLAN_RECORD_COLLECTIONS) {
    const list = result[collection];
    if (!Array.isArray(list)) continue;
    const normalizeRecord = collection === "tasks" || collection === "notes";
    (result as Record<string, unknown>)[collection] = list.map((item: unknown) => {
      if (!isPlainObject(item)) return item;
      const clean = withoutInternalKeys(item);
      if (normalizeRecord) normalizeMentions(clean);
      if (collection === "people" && typeof clean.username === "string" && !clean.username.startsWith("@")) {
        clean.username = `@${clean.username}`;
      }
      return clean;
    });
  }

  return result;
}
