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
 * Builds the canonical shareable Viewer Link (Read-Only) for a room.
 */
export function buildRoomViewerUrl(roomId: string, view = "gantt", theme = "modern-indigo"): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?room=${encodeURIComponent(roomId.trim())}&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}`;
}

/**
 * Builds the canonical shareable Collaborator Link (Edit + Live Sync) for a room.
 * Key is placed in the URL hash `#key=...` so it remains private to the collaborator's browser.
 */
export function buildRoomCollaboratorUrl(
  roomId: string,
  secretKey: string,
  view = "gantt",
  theme = "modern-indigo"
): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?room=${encodeURIComponent(roomId.trim())}&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}#key=${encodeURIComponent(secretKey.trim())}`;
}
