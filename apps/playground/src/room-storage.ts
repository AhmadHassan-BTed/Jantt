import type { JanttData } from "@jantt/core";
import { STORAGE_KEYS } from "./constants";
import { storageService } from "./services/storage";

/*
 * Cloud room helpers shared by the room-sync hooks and the cloud UI.
 *
 * Access model (enforced by database.rules.json, not by this file): anyone with a room link can
 * view the room; editing requires a signed-in account that the room owner made an Editor
 * (`meta.ownerUid` / `members/{uid}.role`). Links never carry credentials.
 */

// ─── Room identifiers & links ────────────────────────────────────────────────

const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

/** True when `value` is a well-formed room id that is safe to use as an RTDB path segment. */
export function isValidRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

/** Trims and lower-cases a room id, returning null when it is not a valid id. */
export function normalizeRoomId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return isValidRoomId(id) ? id : null;
}

/**
 * Extracts a room id from user input: a bare room id, a full share link, or a query string
 * (`?room=` or the legacy `?cloud=`). Returns null when no valid room id can be found.
 */
export function parseRoomLink(input: string): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;

  const bare = normalizeRoomId(raw);
  if (bare) return bare;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://jantt.invalid";
    const url = new URL(raw, base);
    return normalizeRoomId(url.searchParams.get("room") || url.searchParams.get("cloud"));
  } catch {
    return null;
  }
}

export interface RoomDeepLink {
  /** The raw `room` / `cloud` query value as found in the URL. */
  raw: string;
  /** The normalized room id, or null when the raw value is not a valid room id. */
  roomId: string | null;
}

/** Reads a `?room=` / `?cloud=` deep link from a location search string, if present. */
export function readRoomDeepLink(search: string): RoomDeepLink | null {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("room") || params.get("cloud");
    if (!raw || !raw.trim()) return null;
    return { raw, roomId: normalizeRoomId(raw) };
  } catch {
    return null;
  }
}

/** True when a URL hash carries a legacy room credential (`#key=` / `#edit=`). */
export function hashHasRoomSecret(hash: string): boolean {
  return /(?:^#?|&)(?:key|edit)=/.test(hash);
}

/**
 * Builds the shareable link of a room. The link only identifies the room: anyone with it can
 * view the plan; editing needs the Editor role, granted by the owner to a signed-in account.
 * `view` and `theme` are added only when provided.
 */
export function buildRoomViewerUrl(roomId: string, view?: string | null, theme?: string | null): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams();
  params.set("room", roomId.trim());
  if (view) params.set("view", view);
  if (theme) params.set("theme", theme);
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/**
 * Member and presence records are self-reported, so only GitHub-hosted avatars are rendered:
 * an arbitrary image URL would leak the IP address of everyone who opens the roster.
 */
export function getTrustedAvatarUrl(url: unknown): string | null {
  return typeof url === "string" && url.startsWith("https://avatars.githubusercontent.com/") ? url : null;
}

// ─── Legacy room secrets ─────────────────────────────────────────────────────
// Rooms created before membership-based access kept a local "edit key". Keys grant nothing
// server-side; they are only read for backward compatibility and forgotten when a room goes away.

function readSecretMap(): Record<string, unknown> {
  const map = storageService.getItem<Record<string, unknown>>(STORAGE_KEYS.ROOM_SECRET_KEYS);
  return map && typeof map === "object" && !Array.isArray(map) ? map : {};
}

function hasOwn(map: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/** Returns the legacy key stored for a room, if any. */
export function getStoredRoomSecret(roomId: string): string | null {
  const id = normalizeRoomId(roomId);
  if (!id) return null;
  const map = readSecretMap();
  const value = hasOwn(map, id) ? map[id] : null;
  return typeof value === "string" && value ? value : null;
}

/** Forgets the legacy key stored for a room. */
export function removeRoomSecret(roomId: string): void {
  const id = normalizeRoomId(roomId);
  if (!id) return;
  const map = readSecretMap();
  if (!hasOwn(map, id)) return;
  delete map[id];
  storageService.setItem(STORAGE_KEYS.ROOM_SECRET_KEYS, map);
}

// ─── Last acknowledged room state (merge base) ───────────────────────────────
// Edits that have not reached a room yet are merged 3-way against the plan the room last
// acknowledged. That base is kept in memory while the room is open and written here only when
// such edits may outlive the page (tab hidden or closed, save failed after leaving the room), so
// a reload still merges them 3-way. The key ends with the project id, so it can be purged with
// the plan's other per-project keys.

const ROOM_BASE_KEY_PREFIX = "jantt_room_base_";

export interface StoredRoomBase {
  /** `calculatePlanHash` of `data`; equals the room project's `etag` while it is current. */
  hash: string;
  revision: number;
  data: JanttData;
}

function roomBaseKey(projectId: string): string | null {
  return typeof projectId === "string" && projectId && projectId !== "default" ? `${ROOM_BASE_KEY_PREFIX}${projectId}` : null;
}

/** Reads the stored merge base of a room project, or null when there is none (or it is unreadable). */
export function loadRoomBase(projectId: string): StoredRoomBase | null {
  const key = roomBaseKey(projectId);
  if (!key) return null;
  const stored = storageService.getItem<Partial<StoredRoomBase>>(key);
  if (!stored || typeof stored !== "object" || typeof stored.hash !== "string" || !stored.hash) return null;
  const data = stored.data;
  if (!data || typeof data !== "object" || !Array.isArray(data.tasks)) return null;
  return { hash: stored.hash, revision: Number(stored.revision) || 0, data };
}

/** Stores the merge base of a room project. Returns false when it could not be written durably. */
export function saveRoomBase(projectId: string, base: StoredRoomBase): boolean {
  const key = roomBaseKey(projectId);
  return key ? storageService.setItem(key, base) : false;
}

/** Forgets the stored merge base of a room project. */
export function removeRoomBase(projectId: string): void {
  const key = roomBaseKey(projectId);
  if (key) storageService.removeItem(key);
}

// ─── Per-tab identity ────────────────────────────────────────────────────────

let tabInstanceId: string | null = null;

/** A random id unique to this page load, so every browser tab is told apart from its siblings. */
export function getTabInstanceId(): string {
  if (!tabInstanceId) {
    const random =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    tabInstanceId = `tab-${random}`;
  }
  return tabInstanceId;
}
