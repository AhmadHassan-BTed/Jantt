import type { JanttData } from "@jantt/core";

/**
 * Single source of truth for Cloud Room Models, DTOs, and Schema Validators.
 * Every shape here is enforced server-side by database.rules.json; the validators
 * below mirror those rules so the client fails fast with a readable error.
 */

export type RoomMemberRole = "owner" | "editor" | "viewer";

export interface RoomMember {
  uid: string; // must equal the member key
  username: string; // must be the handle claimed by `uid` in /usernames
  displayName: string;
  photoURL?: string; // new values: GitHub avatar host only (`getTrustedAvatarUrl`)
  role: RoomMemberRole; // "owner" is accepted only for meta.ownerUid
  joinedAt: string;
  teamId?: string;
  teamName?: string;
}

export interface RoomTeam {
  id: string; // must equal the team key
  name: string;
  color?: string;
  memberUids: string[];
  memberUsernames: string[];
  role: "editor" | "viewer";
  addedAt: string;
}

export interface RoomMetadata {
  roomId: string; // must equal the room key
  title: string;
  ownerUid: string; // immutable after creation
  ownerUsername: string;
  createdAt: string;
  updatedAt: string;
  revision: number; // advances by exactly one per stamp (`increment(1)`)
  contentHash: string;
  taskCount?: number;
  noteCount?: number;
  /**
   * Removed. Older builds stored a world-readable "edit key" here; it never granted access.
   * The rules accept only its deletion (by the owner), so it is typed `never`: nothing may
   * write it, and readers of legacy rooms must ignore it.
   */
  secretKey?: never;
  theme?: string;
}

export interface UserRoomPointer {
  roomId: string; // must equal the pointer key
  title: string;
  ownerUid: string; // must equal the room's meta.ownerUid
  ownerUsername: string; // must equal the room's meta.ownerUsername
  role: RoomMemberRole; // must equal the member's role in the room
  updatedAt: string;
  createdAt: string;
  taskCount?: number;
  noteCount?: number;
}

/** A room as the client loads it. Presence is read separately (presenceService), never with the room. */
export interface FullRoomPayload {
  meta: RoomMetadata;
  members: Record<string, RoomMember>;
  teams?: Record<string, RoomTeam>;
  /** Owner-written ban list: banned uids cannot self-join the room again. */
  banned?: Record<string, true>;
  data: JanttData;
}

/**
 * Validates room member role permissions.
 */
export function isValidRole(role: string): role is RoomMemberRole {
  return role === "owner" || role === "editor" || role === "viewer";
}

/**
 * Validates room metadata schema.
 */
export function validateRoomMetadata(meta: Partial<RoomMetadata>): { valid: boolean; error?: string } {
  if (!meta.roomId || typeof meta.roomId !== "string" || meta.roomId.trim().length === 0) {
    return { valid: false, error: "Missing or invalid roomId." };
  }
  if (!meta.title || typeof meta.title !== "string" || meta.title.trim().length === 0) {
    return { valid: false, error: "Missing or invalid room title." };
  }
  if (meta.title.length > 200) {
    return { valid: false, error: "Room title cannot exceed 200 characters." };
  }
  if (!meta.ownerUid || typeof meta.ownerUid !== "string") {
    return { valid: false, error: "Missing room owner UID." };
  }
  if (typeof meta.revision !== "number" || !Number.isInteger(meta.revision) || meta.revision < 1) {
    return { valid: false, error: "Room revision must be a positive integer." };
  }
  return { valid: true };
}

/**
 * Validates a room member schema.
 */
export function validateRoomMember(member: Partial<RoomMember>): { valid: boolean; error?: string } {
  if (!member.uid || typeof member.uid !== "string") {
    return { valid: false, error: "Invalid member UID." };
  }
  if (!member.username || typeof member.username !== "string") {
    return { valid: false, error: "Member must have a claimed username." };
  }
  if (!member.role || !isValidRole(member.role)) {
    return { valid: false, error: "Invalid member role. Must be 'owner', 'editor', or 'viewer'." };
  }
  return { valid: true };
}

/**
 * Validates a room team schema.
 */
export function validateRoomTeam(team: Partial<RoomTeam>): { valid: boolean; error?: string } {
  if (!team.id || typeof team.id !== "string") {
    return { valid: false, error: "Invalid team ID." };
  }
  if (!team.name || typeof team.name !== "string" || team.name.trim().length === 0) {
    return { valid: false, error: "Missing team name." };
  }
  if (team.name.length > 200) {
    return { valid: false, error: "Team name cannot exceed 200 characters." };
  }
  if (team.role !== "editor" && team.role !== "viewer") {
    return { valid: false, error: "Team role must be 'editor' or 'viewer'." };
  }
  if (!Array.isArray(team.memberUids)) {
    return { valid: false, error: "team.memberUids must be an array." };
  }
  return { valid: true };
}
