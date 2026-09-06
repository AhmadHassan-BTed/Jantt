/**
 * Data Transfer Objects and Validators for Realtime Presence in Collaborative Rooms.
 */

export interface RoomPresence {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  status: "online";
  lastSeen: string;
  joinedAt: string;
  isOwner?: boolean;
}

export type RoomPresenceDto = RoomPresence;

/**
 * Validates a RoomPresence object.
 */
export function validateRoomPresence(presence: Partial<RoomPresence>): { valid: boolean; error?: string } {
  if (!presence.uid || typeof presence.uid !== "string") {
    return { valid: false, error: "Missing or invalid presence UID." };
  }
  if (!presence.username || typeof presence.username !== "string") {
    return { valid: false, error: "Missing or invalid presence username." };
  }
  if (presence.status !== "online") {
    return { valid: false, error: "Presence status must be 'online'." };
  }
  return { valid: true };
}
