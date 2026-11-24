/**
 * Data Transfer Object for Realtime Presence in Collaborative Rooms.
 * Stored at `rooms/{roomId}/presence/{uid}`; only room members may publish their own entry.
 *
 * database.rules.json accepts exactly these fields, optional fields are `photoURL` and `inspectedTaskId`.
 * There is no owner badge field: derive it from the room's `meta.ownerUid`.
 */

export interface RoomPresence {
  uid: string; // must equal the presence key and the writer's auth uid
  username: string; // must be the handle claimed by `uid`
  displayName: string;
  photoURL?: string; // GitHub avatar host only (`getTrustedAvatarUrl`)
  inspectedTaskId?: string;
  status: "online";
  lastSeen: string; // ISO timestamp; the rules reject non-string values
  joinedAt: string; // ISO timestamp; the rules reject non-string values
}
