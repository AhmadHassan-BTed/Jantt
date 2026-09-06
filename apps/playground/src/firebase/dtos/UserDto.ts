/**
 * Data Transfer Objects and Validation Schemas for Users and GitHub Profiles.
 * Single source of truth for user models across the cloud architecture.
 */

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  username: string; // normalized lowercase alphanumeric/underscore e.g. "ahmad_hassan"
  displayUsername: string; // original casing e.g. "AhmadHassan"
  createdAt: string;
  updatedAt: string;
  githubUsername?: string;
  githubVerified?: boolean;
  isFollowingCreator?: boolean;
  missingReposCount?: number;
  lastVerifiedAt?: string;
  isDevBypass?: boolean;
}

export type UserProfileDto = UserProfile;

export interface RepoItem {
  fullName: string;
  name: string;
  url: string;
  isStarred?: boolean;
}

export type RepoItemDto = RepoItem;

export interface VerificationStatus {
  isVerified: boolean;
  isFollowingCreator: boolean;
  starredRepos: string[];
  missingRepos: RepoItem[];
  totalRepos: number;
  isDevBypass: boolean;
  error?: string;
}

export type VerificationStatusDto = VerificationStatus;

/**
 * Validates and normalizes raw username strings.
 */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Validates whether a username satisfies length, syntax, and formatting rules.
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  const normalized = normalizeUsername(username);
  if (!normalized || normalized.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters long." };
  }
  if (normalized.length > 24) {
    return { valid: false, error: "Username cannot exceed 24 characters." };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return { valid: false, error: "Username may only contain letters, numbers, and underscores." };
  }
  return { valid: true };
}

/**
 * Validates a complete UserProfile object for persistence.
 */
export function validateUserProfile(profile: Partial<UserProfile>): { valid: boolean; error?: string } {
  if (!profile.uid || typeof profile.uid !== "string") {
    return { valid: false, error: "Invalid or missing user UID." };
  }
  if (!profile.username || typeof profile.username !== "string") {
    return { valid: false, error: "Invalid or missing username." };
  }
  const usernameValidation = validateUsername(profile.username);
  if (!usernameValidation.valid) {
    return usernameValidation;
  }
  return { valid: true };
}
