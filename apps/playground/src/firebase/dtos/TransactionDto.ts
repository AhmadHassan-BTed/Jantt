import type { JanttData } from "@jantt/core";

/**
 * Data Transfer Objects for Realtime Database Atomic Transactions.
 */

export interface SaveRoomAtomicInputDto {
  roomId: string;
  data: JanttData;
  callerUid: string;
  callerUsername: string;
  contentHash: string;
  title?: string;
  force?: boolean;
}

export interface SaveRoomAtomicResultDto {
  success: boolean;
  revision: number;
  updatedAt: string;
  contentHash: string;
  error?: string;
  isPermissionDenied?: boolean;
  isConflict?: boolean;
}

export interface MemberMutationInputDto {
  roomId: string;
  callerUid: string;
  targetUid: string;
  targetUsername: string;
  targetDisplayName: string;
  photoURL?: string;
  role: "owner" | "editor" | "viewer";
  teamId?: string;
  teamName?: string;
}

export interface TeamMutationInputDto {
  roomId: string;
  callerUid: string;
  teamId: string;
  teamName: string;
  color?: string;
  role: "editor" | "viewer";
  members: Array<{
    uid: string;
    username: string;
    displayName: string;
    photoURL?: string;
  }>;
}
