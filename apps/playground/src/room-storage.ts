import { STORAGE_KEYS } from "./constants";

/**
 * Retrieves the stored cryptographic edit key for a room from browser localStorage.
 */
export function getStoredRoomSecret(roomId: string): string | null {
  if (typeof window === "undefined" || !roomId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOM_SECRET_KEYS);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[roomId.toLowerCase().trim()] || null;
  } catch {
    return null;
  }
}

/**
 * Persists a room's cryptographic edit key into browser localStorage.
 */
export function storeRoomSecret(roomId: string, secretKey: string): void {
  if (typeof window === "undefined" || !roomId || !secretKey) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOM_SECRET_KEYS);
    const map = raw ? JSON.parse(raw) : {};
    map[roomId.toLowerCase().trim()] = secretKey.trim();
    localStorage.setItem(STORAGE_KEYS.ROOM_SECRET_KEYS, JSON.stringify(map));
  } catch {}
}

/**
 * Builds the canonical shareable Pure Viewer Link (Read-Only) for a room.
 * Recipients can view the live roadmap but cannot modify tasks or sync edits.
 */
export function buildRoomViewerUrl(roomId: string, view = "gantt", theme = "modern-indigo"): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?room=${encodeURIComponent(roomId.trim())}&role=viewer&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}`;
}

/**
 * Builds the canonical shareable Collaborator Link (Edit Mode + Live Sync) for a room.
 * For authenticated users, your account handle is verified on join.
 * For legacy rooms, the key is placed in the URL hash `#key=...` for browser storage.
 */
export function buildRoomCollaboratorUrl(
  roomId: string,
  secretKey?: string | null,
  view = "gantt",
  theme = "modern-indigo"
): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin + window.location.pathname;
  const hashKey = secretKey ? `#key=${encodeURIComponent(secretKey.trim())}` : "";
  return `${origin}?room=${encodeURIComponent(roomId.trim())}&role=editor&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}${hashKey}`;
}

