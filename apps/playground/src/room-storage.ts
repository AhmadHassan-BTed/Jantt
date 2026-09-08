import { STORAGE_KEYS } from "./constants";
import { storageService } from "./services/storage";

/**
 * Retrieves the stored cryptographic edit key for a room from storage.
 */
export function getStoredRoomSecret(roomId: string): string | null {
  if (!roomId) return null;
  const map = storageService.getItem<Record<string, string>>(STORAGE_KEYS.ROOM_SECRET_KEYS);
  if (!map || typeof map !== "object") return null;
  return map[roomId.toLowerCase().trim()] || null;
}

/**
 * Persists a room's cryptographic edit key into storage.
 */
export function storeRoomSecret(roomId: string, secretKey: string): void {
  if (!roomId || !secretKey) return;
  const map = storageService.getItem<Record<string, string>>(STORAGE_KEYS.ROOM_SECRET_KEYS) || {};
  map[roomId.toLowerCase().trim()] = secretKey.trim();
  storageService.setItem(STORAGE_KEYS.ROOM_SECRET_KEYS, map);
}

/**
 * Builds the canonical shareable Pure Viewer Link (Read-Only) for a room.
 * Recipients can view the live roadmap in high fidelity but cannot modify tasks or push edits.
 * Role cannot be elevated by modifying the URL query parameters.
 */
export function buildRoomViewerUrl(roomId: string, view = "gantt", theme = "noir"): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?room=${encodeURIComponent(roomId.trim())}&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}`;
}

/**
 * Builds the canonical shareable Collaborator Link (Edit Mode + Live Sync) for a room.
 * Write access requires the cryptographic secret key in the URL hash (#key=...) or
 * verified membership in the room's access list.
 */
export function buildRoomCollaboratorUrl(
  roomId: string,
  secretKey?: string | null,
  view = "gantt",
  theme = "noir"
): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin + window.location.pathname;
  const hashKey = secretKey ? `#key=${encodeURIComponent(secretKey.trim())}` : "";
  return `${origin}?room=${encodeURIComponent(roomId.trim())}&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}${hashKey}`;
}

