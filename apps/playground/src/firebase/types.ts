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
  githubUsername?: string;
  githubVerified?: boolean;
  isFollowingCreator?: boolean;
  missingReposCount?: number;
  lastVerifiedAt?: string;
  isDevBypass?: boolean;
}

export interface RepoItem {
  fullName: string;
  name: string;
  url: string;
  isStarred?: boolean;
}

export interface VerificationStatus {
  isVerified: boolean;
  isFollowingCreator: boolean;
  starredRepos: string[];
  missingRepos: RepoItem[];
  totalRepos: number;
  isDevBypass: boolean;
  error?: string;
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
