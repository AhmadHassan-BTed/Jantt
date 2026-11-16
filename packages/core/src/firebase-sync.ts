import type { JanttData } from "./types";
import { validate } from "./validator";
import { calculatePlanHash } from "./reconciliation/crdt-hash";
import { fetchWithTimeout, type FetchTimeoutOptions } from "./remote-sync";

/**
 * @deprecated The hosted Jantt Cloud database denies the REST `/plans` API, so this default only
 * produces permission errors. Pass your own `customDbUrl`; the default is removed in the next major.
 */
export const DEFAULT_FIREBASE_RTDB_URL = "https://jantt-cloud-default-rtdb.firebaseio.com";

/**
 * Room node stored at `/plans/{roomId}` by the REST room API.
 *
 * @deprecated The REST room API (createCloudRoom, fetchCloudRoom, saveCloudRoom,
 * subscribeToCloudRoom) is removed in the next major. It is a library-level, serverless mode for
 * databases whose rules allow it: the hosted Jantt Cloud project denies `/plans` (its rooms live
 * under `/rooms`, written through the Firebase SDK with server-enforced roles), so these calls only
 * work against your own `customDbUrl`. Protect writes with database rules and `authToken`.
 */
export interface RoomPayload {
  roomId: string;
  title: string;
  /**
   * @deprecated No longer written. A key stored in a node that viewers can read protects nothing;
   * enforce edit access with database rules instead.
   */
  secret?: string;
  revision: number;
  contentHash: string;
  updatedAt: string;
  createdAt?: string;
  data: JanttData;
}

/** Options shared by every REST room call. */
export interface RoomRestOptions extends FetchTimeoutOptions {
  customDbUrl?: string;
  /** Firebase ID token or database secret, sent as `?auth=` so database rules can authorize the call. */
  authToken?: string;
  /**
   * @deprecated Honour a page-wide `window.__JANTT_FIREBASE_URL` when no `customDbUrl` is given.
   * Off by default, so no other script on the page can redirect room reads and writes.
   */
  allowGlobalOverrides?: boolean;
}

/** Options of {@link getFirebaseUrl}. */
export interface FirebaseUrlOptions {
  /** @deprecated See {@link RoomRestOptions.allowGlobalOverrides}. */
  allowGlobalOverrides?: boolean;
}

export interface CreateRoomOptions extends RoomRestOptions {
  roomId?: string;
  title?: string;
}

export interface CreateRoomResult {
  roomId: string;
  /** Client-side edit capability for share links. The database does not verify it. */
  secretKey: string;
  title: string;
  revision: number;
  data: JanttData;
  etag: string | null;
  createdAt?: string;
}

export interface FetchRoomResult {
  roomId: string;
  title: string;
  revision: number;
  contentHash: string;
  etag: string | null;
  updatedAt: string;
  /** Creation time, when the room recorded one. */
  createdAt?: string;
  data: JanttData;
  /** @deprecated Never populated; secrets are no longer stored in the room node. */
  secret?: string;
}

export interface SaveRoomOptions extends RoomRestOptions {
  roomId: string;
  secretKey: string;
  data: JanttData;
  baseRevision?: number;
  /**
   * ETag of the room state `data` is based on. Without it the save never writes blindly: it fetches
   * the room and reports a conflict (with the latest data and ETag) unless nothing changed.
   */
  etag?: string | null;
  title?: string;
  /** Original creation time, preserved because a save replaces the whole room node. */
  createdAt?: string;
}

export interface SaveRoomResult {
  success: boolean;
  revision: number;
  etag: string | null;
  conflict?: boolean;
  latestRemoteData?: JanttData;
  error?: string;
}

const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };
// Firebase REST only returns ETags (needed for conditional writes) when asked for them.
const ETAG_HEADERS = { "X-Firebase-ETag": "true" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Database base URL without a trailing slash: `customDbUrl`, else (only with
 * `allowGlobalOverrides`) `window.__JANTT_FIREBASE_URL`, else {@link DEFAULT_FIREBASE_RTDB_URL}.
 */
export function getFirebaseUrl(customDbUrl?: string, options?: FirebaseUrlOptions): string {
  if (customDbUrl && typeof customDbUrl === "string" && customDbUrl.trim()) {
    return customDbUrl.trim().replace(/\/+$/, "");
  }
  const override =
    options?.allowGlobalOverrides === true && typeof window !== "undefined"
      ? (window as unknown as { __JANTT_FIREBASE_URL?: unknown }).__JANTT_FIREBASE_URL
      : undefined;
  if (typeof override === "string" && override.trim()) {
    return override.trim().replace(/\/+$/, "");
  }
  return DEFAULT_FIREBASE_RTDB_URL;
}

function roomUrl(roomId: string, options: RoomRestOptions): string {
  const url = `${getFirebaseUrl(options.customDbUrl, options)}/plans/${encodeURIComponent(roomId)}.json`;
  return options.authToken ? `${url}?auth=${encodeURIComponent(options.authToken)}` : url;
}

function readEtag(response: Response): string | null {
  return response.headers?.get?.("ETag") ?? null;
}

/**
 * Generates a cryptographically strong random token for room edit authorization.
 */
export function generateSecureToken(prefix = "sec"): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${hex}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Generates a room id ("<prefix>-<32 hex chars>", 128 random bits) made only of [a-z0-9-], so it
 * is unchanged by {@link sanitizeRoomId}. Rooms readable by link are protected only by their id,
 * so it must not be guessable.
 */
export function generateRoomId(prefix = "room"): string {
  let suffix: string;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    suffix = Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, "0")).join("");
  }
  return sanitizeRoomId(`${prefix}-${suffix}`);
}

/**
 * Sanitizes room ID to be URL and Firebase RTDB safe.
 */
export function sanitizeRoomId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/[_-]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Normalizes a username to lowercase letters, digits, "_" and "-" (leading "@"s removed), so
 * GitHub logins such as "foo-bar" and "foobar" stay distinct.
 */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Firebase Realtime Database Key Codec.
 * Firebase RTDB prohibits keys containing: '.', '#', '$', '/', '[', or ']'.
 * This codec reversibly transforms prohibited characters so any valid JSON/Jantt schema
 * (including "$schema", category keys with dots/slashes, etc.) can be persisted. Note that the
 * database itself drops null values, empty arrays and empty objects; {@link decodePlanFromRtdb}
 * restores the plan's array collections.
 */

// "$schema" keeps its historical "__schema" encoding, so a literal "__schema" key gets its own.
const LITERAL_SCHEMA_KEY = "__schema";
const ENCODED_LITERAL_SCHEMA_KEY = "~u";
const KEY_ESCAPES: Record<string, string> = { "0": "~", d: "$", p: ".", h: "#", s: "/", b1: "[", b2: "]" };

export function encodeRtdbKey(key: string): string {
  if (key === "$schema") return "__schema";
  if (key === LITERAL_SCHEMA_KEY) return ENCODED_LITERAL_SCHEMA_KEY;
  return key
    .replace(/~/g, "~0")
    .replace(/\$/g, "~d")
    .replace(/\./g, "~p")
    .replace(/#/g, "~h")
    .replace(/\//g, "~s")
    .replace(/\[/g, "~b1")
    .replace(/\]/g, "~b2");
}

export function decodeRtdbKey(key: string): string {
  if (key === "__schema") return "$schema";
  if (key === ENCODED_LITERAL_SCHEMA_KEY) return LITERAL_SCHEMA_KEY;
  return key.replace(/~(b1|b2|0|d|p|h|s)/g, (_match, code: string) => KEY_ESCAPES[code]);
}

function transformKeys(val: unknown, mapKey: (key: string) => string): unknown {
  if (val === null || val === undefined || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map((item) => transformKeys(item, mapKey));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(val)) {
    const mapped = mapKey(key);
    // Assigning "__proto__" would replace the object's prototype instead of adding a property.
    if (mapped === "__proto__") continue;
    out[mapped] = transformKeys(item, mapKey);
  }
  return out;
}

/**
 * Recursively encodes all object keys to be safe for Firebase Realtime Database.
 */
export function encodePlanForRtdb<T>(val: T): T {
  return transformKeys(val, encodeRtdbKey) as T;
}

// Plan collections that are arrays; the database may return a sparse array as an index-keyed object.
const PLAN_ARRAY_KEYS = ["tasks", "notes", "people", "teams", "documents", "milestones"] as const;

function restorePlanShape(plan: Record<string, unknown>): void {
  for (const key of PLAN_ARRAY_KEYS) {
    const value = plan[key];
    if (Array.isArray(value)) {
      // A removed element leaves a hole (or a null) that no plan record can be.
      const dense = value.filter((item) => item !== null && item !== undefined);
      if (dense.length !== value.length) plan[key] = dense;
      continue;
    }
    if (!isRecord(value)) continue;
    const indexes = Object.keys(value);
    if (indexes.length > 0 && indexes.every((index) => /^\d+$/.test(index))) {
      plan[key] = indexes.sort((a, b) => Number(a) - Number(b)).map((index) => value[index]);
    }
  }
  // The database never stores an empty array, so a plan whose tasks were all deleted has none.
  if (plan.tasks === undefined || plan.tasks === null) plan.tasks = [];
}

/**
 * Recursively decodes all object keys from Firebase Realtime Database back to their original form.
 * When the value is a plan (it has `tasks` or `meta`), its array collections are restored and a
 * missing `tasks` becomes `[]`.
 */
export function decodePlanFromRtdb<T>(val: T): T {
  const decoded = transformKeys(val, decodeRtdbKey);
  if (isRecord(decoded) && !("data" in decoded) && ("tasks" in decoded || isRecord(decoded.meta))) {
    restorePlanShape(decoded);
  }
  return decoded as T;
}

/**
 * @deprecated Use {@link generateRoomId}. Kept as an alias; ids now use "-" so that they survive
 * {@link sanitizeRoomId} unchanged.
 */
export function generateRoomSlug(prefix = "room"): string {
  return generateRoomId(prefix);
}

/**
 * Creates a new room at `/plans/{roomId}`. The write only succeeds when no room with that id
 * exists: a taken custom id throws, a taken generated id is regenerated.
 * @deprecated Removed in the next major; see {@link RoomPayload} for when the REST room API works.
 */
export async function createCloudRoom(
  data: JanttData,
  options?: CreateRoomOptions
): Promise<CreateRoomResult> {
  const validation = validate(data);
  if (!validation.valid) {
    throw new Error(`Cannot create room: invalid plan data (${validation.errors[0]?.message || "Validation failed"})`);
  }

  const access: CreateRoomOptions = options ?? {};
  const requestedId = access.roomId?.trim() ? sanitizeRoomId(access.roomId) : "";
  const title = access.title || data.meta?.title || "Collaboration Room";
  const contentHash = calculatePlanHash(data);
  const encodedData = encodePlanForRtdb(data);

  for (let attempt = 0; attempt < (requestedId ? 1 : 3); attempt++) {
    const roomId = requestedId || generateRoomId();
    const now = new Date().toISOString();
    const payload: RoomPayload = {
      roomId,
      title,
      revision: 1,
      contentHash,
      createdAt: now,
      updatedAt: now,
      data: encodedData
    };

    const outcome = await fetchWithTimeout(
      roomUrl(roomId, access),
      {
        method: "PUT",
        // "null_etag" makes the write conditional on the node not existing yet.
        headers: { ...JSON_HEADERS, ...ETAG_HEADERS, "if-match": "null_etag" },
        body: JSON.stringify(payload)
      },
      async (response) => {
        if (response.status === 412) return { taken: true as const, etag: null };
        if (!response.ok) {
          throw new Error(`Failed to create room in Firebase (${response.status}): ${await response.text()}`);
        }
        return { taken: false as const, etag: readEtag(response) };
      },
      access
    );

    if (!outcome.taken) {
      return { roomId, secretKey: generateSecureToken("sec"), title, revision: 1, data, etag: outcome.etag, createdAt: now };
    }
    if (requestedId) {
      throw new Error(`Room id "${requestedId}" is already taken. Choose a different room id.`);
    }
  }
  throw new Error("Could not allocate a unique room id. Please try again.");
}

/**
 * Fetches an existing room from `/plans/{roomId}` (with its ETag for conditional saves).
 * @deprecated Removed in the next major; see {@link RoomPayload}.
 */
export async function fetchCloudRoom(
  roomId: string,
  customDbUrl?: string,
  options?: Omit<RoomRestOptions, "customDbUrl">
): Promise<FetchRoomResult> {
  const cleanId = sanitizeRoomId(roomId);
  if (!cleanId) {
    throw new Error("Invalid room ID provided.");
  }
  const access: RoomRestOptions = { ...options, customDbUrl };

  return fetchWithTimeout(
    roomUrl(cleanId, access),
    { method: "GET", headers: { Accept: "application/json", ...ETAG_HEADERS } },
    async (response) => {
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `Permission denied reading room "${cleanId}". The database rules do not allow this request; sign in or check the rules.`
          );
        }
        throw new Error(`Failed to fetch room from Firebase (${response.status}): ${response.statusText}`);
      }

      const etag = readEtag(response);
      const payload = await response.json();
      if (!isRecord(payload)) {
        throw new Error(`Room "${cleanId}" not found in cloud database.`);
      }
      if (!isRecord(payload.data)) {
        throw new Error(`Room "${cleanId}" does not contain valid Jantt data.`);
      }

      const planData = decodePlanFromRtdb(payload.data as JanttData);
      const validation = validate(planData);
      if (!validation.valid) {
        throw new Error(`Room data is corrupted: ${validation.errors[0]?.message || "Validation failed"}`);
      }

      return {
        roomId: cleanId,
        title: typeof payload.title === "string" && payload.title ? payload.title : planData.meta?.title || cleanId,
        revision: Number(payload.revision) || 1,
        contentHash: calculatePlanHash(planData),
        etag,
        createdAt: typeof payload.createdAt === "string" ? payload.createdAt : undefined,
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
        data: planData
      };
    },
    access
  );
}

function conflictResult(latest: FetchRoomResult): SaveRoomResult {
  return {
    success: false,
    conflict: true,
    revision: latest.revision,
    etag: latest.etag,
    latestRemoteData: latest.data
  };
}

/**
 * Saves a room with optimistic concurrency: the write is conditional on `options.etag`, and a
 * concurrent change by a collaborator is returned as `conflict` with the latest remote data and
 * ETag so the caller can reconcile and retry. Never overwrites a room blindly.
 * @deprecated Removed in the next major; see {@link RoomPayload}.
 */
export async function saveCloudRoom(options: SaveRoomOptions): Promise<SaveRoomResult> {
  const cleanId = sanitizeRoomId(options.roomId);
  if (!cleanId) {
    return { success: false, revision: 0, etag: null, error: "Invalid room ID" };
  }

  if (!options.secretKey || typeof options.secretKey !== "string") {
    return {
      success: false,
      revision: 0,
      etag: null,
      error: "Missing edit key. You only have view access to this room."
    };
  }

  const validation = validate(options.data);
  if (!validation.valid) {
    return {
      success: false,
      revision: 0,
      etag: null,
      error: `Invalid plan data: ${validation.errors[0]?.message}`
    };
  }

  const baseRevision = options.baseRevision || 1;
  const contentHash = calculatePlanHash(options.data);

  try {
    if (!options.etag) {
      // Without the ETag of the state this save is based on, a write could replace newer work.
      const latest = await fetchCloudRoom(cleanId, options.customDbUrl, options);
      if (latest.contentHash === contentHash) {
        return { success: true, revision: latest.revision, etag: latest.etag };
      }
      if (!latest.etag) {
        return {
          success: false,
          revision: latest.revision,
          etag: null,
          error: "The database did not return an ETag, so the room cannot be saved safely."
        };
      }
      return conflictResult(latest);
    }

    const nextRevision = baseRevision + 1;
    const payload: RoomPayload = {
      roomId: cleanId,
      title: options.title || options.data.meta?.title || cleanId,
      revision: nextRevision,
      contentHash,
      updatedAt: new Date().toISOString(),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      data: encodePlanForRtdb(options.data)
    };

    const outcome = await fetchWithTimeout(
      roomUrl(cleanId, options),
      {
        method: "PUT",
        headers: { ...JSON_HEADERS, ...ETAG_HEADERS, "if-match": options.etag },
        body: JSON.stringify(payload)
      },
      async (response) => ({
        status: response.status,
        ok: response.ok,
        etag: readEtag(response),
        text: response.ok || response.status === 412 ? "" : await response.text()
      }),
      options
    );

    // 412 Precondition Failed: a collaborator saved since `options.etag`.
    if (outcome.status === 412) {
      try {
        return conflictResult(await fetchCloudRoom(cleanId, options.customDbUrl, options));
      } catch {
        return {
          success: false,
          conflict: true,
          revision: baseRevision,
          etag: null,
          error: "A collaborator saved concurrently and the latest version could not be loaded. Retrying..."
        };
      }
    }

    if (outcome.status === 401 || outcome.status === 403) {
      return {
        success: false,
        revision: baseRevision,
        etag: null,
        error: "Permission denied by the database rules. Sign in or check that this room accepts your edits."
      };
    }

    if (!outcome.ok) {
      return {
        success: false,
        revision: baseRevision,
        etag: null,
        error: `Cloud save failed (${outcome.status}): ${outcome.text}`
      };
    }

    return { success: true, revision: nextRevision, etag: outcome.etag };
  } catch (err: any) {
    const message = err?.message || "Unknown error";
    return {
      success: false,
      revision: baseRevision,
      etag: null,
      error: err instanceof TypeError ? `Network error saving to cloud: ${message}` : message
    };
  }
}

/** Applies a streamed value at a "/"-separated path inside a snapshot (null removes it). */
function applyAtPath(root: unknown, path: string, value: unknown): unknown {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return value;

  const copy = (node: unknown): Record<string, unknown> | unknown[] =>
    Array.isArray(node) ? node.slice() : isRecord(node) ? { ...node } : {};
  const nextRoot = copy(root);
  let cursor = nextRoot as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    if (segment === "__proto__") return root;
    const child = copy(cursor[segment]);
    cursor[segment] = child;
    cursor = child as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (last === "__proto__") return root;
  if (value === null || value === undefined) delete cursor[last];
  else cursor[last] = value;
  return nextRoot;
}

/**
 * Subscribes to a room through Firebase's REST streaming API (Server-Sent Events), with no SDK.
 * Keeps a local snapshot, applies each `put`/`patch` at its path, and emits the full room (decoded
 * and validated) after every change. `cancel` and `auth_revoked` events call `onError` and close
 * the stream. Returns an unsubscribe function.
 * @deprecated Removed in the next major; see {@link RoomPayload}.
 */
export function subscribeToCloudRoom(
  roomId: string,
  onUpdate: (payload: RoomPayload) => void,
  onError?: (err: any) => void,
  customDbUrl?: string,
  options?: Pick<RoomRestOptions, "authToken" | "allowGlobalOverrides">
): () => void {
  const cleanId = sanitizeRoomId(roomId);
  if (!cleanId || typeof EventSource === "undefined") {
    return () => {};
  }

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let snapshot: unknown = null;

  const close = () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  const emit = () => {
    if (!isRecord(snapshot) || !isRecord(snapshot.data)) return;
    const data = decodePlanFromRtdb(snapshot.data as JanttData);
    if (!validate(data).valid) return;
    // Legacy rooms may still hold a plaintext `secret`; it is never handed to readers.
    const { secret: _legacySecret, ...room } = snapshot as unknown as RoomPayload;
    onUpdate({ ...room, data });
  };

  const handle = (kind: "put" | "patch") => (event: MessageEvent) => {
    if (isClosed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return; // ignored: a malformed event carries no change to apply
    }
    if (!isRecord(parsed) || typeof parsed.path !== "string") return;
    const path = parsed.path;
    if (kind === "put") {
      snapshot = applyAtPath(snapshot, path, parsed.data);
    } else if (isRecord(parsed.data)) {
      for (const [key, value] of Object.entries(parsed.data)) {
        snapshot = applyAtPath(snapshot, `${path}/${key}`, value);
      }
    }
    emit();
  };

  const fail = (reason: string) => () => {
    if (isClosed) return;
    onError?.(new Error(reason));
    close();
  };

  try {
    eventSource = new EventSource(roomUrl(cleanId, { ...options, customDbUrl }));
    eventSource.addEventListener("put", handle("put") as EventListener);
    eventSource.addEventListener("patch", handle("patch") as EventListener);
    eventSource.addEventListener("cancel", fail(`Access to room "${cleanId}" was revoked by the database rules.`));
    eventSource.addEventListener("auth_revoked", fail("The room subscription's credentials expired. Sign in again."));
    eventSource.onerror = (err) => {
      if (isClosed) return;
      onError?.(err);
    };
  } catch (e) {
    onError?.(e);
  }

  return close;
}
