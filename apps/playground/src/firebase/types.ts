import type { JanttData } from "@jantt/core";

export type RoomMemberRole = "owner" | "editor" | "viewer";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  username: string; // normalized lowercase, e.g. "ahmad"
  displayUsername: string; // e.g. "Ahmad"
  createdAt: string;
  updatedAt: string;
}

export interface RoomMember {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  role: RoomMemberRole;
  joinedAt: string;
}

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

export interface UserRoomPointer {
  roomId: string;
  title: string;
  ownerUid: string;
  ownerUsername: string;
  role: RoomMemberRole;
  updatedAt: string;
  createdAt: string;
}

export interface FullRoomPayload {
  meta: RoomMetadata;
  members: Record<string, RoomMember>;
  data: JanttData;
}
