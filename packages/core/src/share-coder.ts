import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";
import type { JanttData, Task } from "./types";
import { validate } from "./validator";

/**
 * Strips internal synchronization metadata and non-essential ephemeral data
 * from a plan before URL serialization to drastically reduce payload size.
 */
export function cleanPlanForSharing(data: JanttData): JanttData {
  if (!data) return data;
  const clone: JanttData = JSON.parse(JSON.stringify(data));

  // Prune top-level schema and internal sync structures
  delete (clone as any).$schema;

  if (clone.meta) {
    delete clone.meta.sync;
    delete clone.meta.tombstones;
  }

  // Filter out soft-deleted tasks and strip per-field CRDT timestamps
  if (Array.isArray(clone.tasks)) {
    clone.tasks = clone.tasks
      .filter((t: Task) => !t._deleted)
      .map((t: Task) => {
        const copy: any = { ...t };
        delete copy._deleted;
        delete copy.deletedAt;
        delete copy.fieldTimestamps;
        delete copy.updatedBy;

        // Prune empty or default properties to save bytes
        if (copy.progress === 0) delete copy.progress;
        if (copy.status === "todo") delete copy.status;
        if (Array.isArray(copy.dependencies) && copy.dependencies.length === 0) {
          delete copy.dependencies;
        }
        if (copy.notes === "") delete copy.notes;
        if (copy.color === "") delete copy.color;
        if (copy.priority === "") delete copy.priority;
        if (copy.gapDays === 0) delete copy.gapDays;
        if (copy.milestone === false) delete copy.milestone;
        if (copy.urgent === false) delete copy.urgent;
        if (copy.locked === false) delete copy.locked;

        return copy as Task;
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
 * Compresses and encodes JanttData into a compact URL-safe string.
 * Result is prefixed with 'z~' to denote fflate deflate-raw compression.
 */
export function compressPlanToUrlPayload(data: JanttData): string {
  try {
    const cleaned = cleanPlanForSharing(data);
    const jsonStr = JSON.stringify(cleaned);
    const u8 = strToU8(jsonStr);
    const compressed = deflateSync(u8, { level: 9 });
    return `z~${uint8ToBase64Url(compressed)}`;
  } catch (err) {
    console.error("Failed to compress plan data:", err);
    // Fallback to basic JSON base64url without compression
    try {
      const u8 = strToU8(JSON.stringify(data));
      return uint8ToBase64Url(u8);
    } catch {
      return "";
    }
  }
}

/**
 * Decodes a URL payload string back into validated JanttData.
 * Supports:
 * 1. Modern compressed payloads ('z~' prefix)
 * 2. Legacy uncompressed base64 / base64url payloads (100% backward compatibility)
 */
export function decompressPlanFromUrlPayload(payload: string): JanttData | null {
  if (!payload || typeof payload !== "string") return null;

  try {
    let jsonStr = "";

    if (payload.startsWith("z~") || payload.startsWith("z:")) {
      const rawData = payload.slice(2);
      const compressedBytes = base64UrlToUint8(rawData);
      const decompressed = inflateSync(compressedBytes);
      jsonStr = strFromU8(decompressed);
    } else {
      // Legacy uncompressed base64 / base64url format
      const bytes = base64UrlToUint8(payload);
      jsonStr = strFromU8(bytes);
    }

    const parsed = JSON.parse(jsonStr);
    const validation = validate(parsed);
    if (validation.valid) {
      return parsed as JanttData;
    }
    return null;
  } catch (err) {
    console.error("Failed to decompress plan from URL payload:", err);
    return null;
  }
}

/**
 * Recursively sanitizes a plan to guarantee NO internal database IDs (like Firebase UIDs,
 * room secrets, auth tokens) are ever exposed in the JSON payload.
 * Mentions (starting with @, e.g. @username) and standard plan IDs (task id, note id, team id)
 * are the single canonical exception.
 */
export function sanitizePlanForJson(data: JanttData): JanttData {
  if (!data || typeof data !== "object") return data;
  const clone: JanttData = JSON.parse(JSON.stringify(data));

  const DISALLOWED_INTERNAL_KEYS = new Set([
    "uid",
    "ownerUid",
    "firebaseUid",
    "secretKey",
    "authId",
    "authToken",
    "accessToken",
    "clientUid",
    "peerId"
  ]);

  function sanitizeRecursive(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => sanitizeRecursive(item));
    }

    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (DISALLOWED_INTERNAL_KEYS.has(key)) {
        continue;
      }

      if (key === "clientId" || key === "updatedBy") {
        if (typeof val === "string") {
          cleanObj[key] = val.startsWith("@") ? val : `@${val.replace(/^@+/, "")}`;
        }
        continue;
      }

      cleanObj[key] = sanitizeRecursive(val);
    }
    return cleanObj;
  }

  const result = sanitizeRecursive(clone);

  // Ensure people entries only have @username or clean ID
  if (Array.isArray(result.people)) {
    result.people = result.people.map((p: any) => {
      const copy = { ...p };
      delete copy.uid;
      delete copy.ownerUid;
      if (copy.username && !copy.username.startsWith("@")) {
        copy.username = `@${copy.username}`;
      }
      return copy;
    });
  }

  return result as JanttData;
}

