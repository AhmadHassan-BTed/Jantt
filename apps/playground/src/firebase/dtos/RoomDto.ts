import type { JanttData } from "@jantt/core";
import type { RoomPresence } from "./PresenceDto";

/**
 * Single source of truth for Cloud Room Models, DTOs, and Schema Validators.
 */

export type RoomMemberRole = "owner" | "editor" | "viewer";

export interface RoomMember {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  role: RoomMemberRole;
  joinedAt: string;
  teamId?: string;
  teamName?: string;
}

export type RoomMemberDto = RoomMember;

export interface RoomTeam {
  id: string;
  name: string;
  color?: string;
  memberUids: string[];
  memberUsernames: string[];
  role: "editor" | "viewer";
  addedAt: string;
}

export type RoomTeamDto = RoomTeam;

export interface RoomMetadata {
  roomId: string;
  title: string;
  ownerUid: string;
  ownerUsername: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  contentHash: string;
  isPublic?: boolean;
  taskCount?: number;
}

export type RoomMetadataDto = RoomMetadata;

export interface UserRoomPointer {
  roomId: string;
  title: string;
  ownerUid: string;
  ownerUsername: string;
  role: RoomMemberRole;
  updatedAt: string;
  createdAt: string;
}

export type UserRoomPointerDto = UserRoomPointer;

export interface FullRoomPayload {
  meta: RoomMetadata;
  members: Record<string, RoomMember>;
  teams?: Record<string, RoomTeam>;
  presence?: Record<string, RoomPresence>;
  data: JanttData;
}

export type FullRoomPayloadDto = FullRoomPayload;

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
  if (!meta.ownerUid || typeof meta.ownerUid !== "string") {
    return { valid: false, error: "Missing room owner UID." };
  }
  if (typeof meta.revision !== "number" || meta.revision < 1) {
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
  if (!Array.isArray(team.memberUids)) {
    return { valid: false, error: "team.memberUids must be an array." };
  }
  return { valid: true };
}
