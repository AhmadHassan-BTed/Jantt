/**
 * Data Transfer Objects and Validation Schemas for Users and GitHub Profiles.
 * Single source of truth for user models across the cloud architecture.
 *
 * Storage contract (enforced by database.rules.json):
 * - `users/{uid}`           -> UserProfile without `email`, readable and writable by its owner only.
 * - `public_profiles/{uid}` -> PublicProfile, readable by signed-in users, searchable by `username`.
 * - `usernames/{username}`  -> uid, one active handle per account.
 * Both profile nodes accept only the fields declared here (`$other` is rejected).
 */

import { normalizeUsername } from "@jantt/core";

export { normalizeUsername };

/** GitHub logins are 1-39 characters; the legacy `user_xxxxxx` fallback adds `_`. */
const USERNAME_PATTERN = /^[a-z0-9_-]{1,39}$/;

export interface UserProfile {
  uid: string;
  /**
   * Session-only, filled from Firebase Auth. Never written to the database: the rules reject
   * it on `users/{uid}` (copies stored by older builds can only be deleted).
   */
  email?: string;
  displayName: string;
  photoURL?: string;
  username: string; // normalized lowercase handle e.g. "ahmad_hassan"
  displayUsername: string; // original casing e.g. "AhmadHassan"
  createdAt: string;
  updatedAt: string;
  githubUsername?: string;
  /**
   * Self-reported GitHub gate flags. The client writes them and only their owner can read
   * them, so they are advisory UX state, never an authorization input (no rule reads them).
   */
  githubVerified?: boolean;
  isFollowingCreator?: boolean;
  missingReposCount?: number;
  lastVerifiedAt?: string;
  timeFormat?: "12h" | "24h";
}

/**
 * Public, search-indexed projection of a profile stored at `public_profiles/{uid}`.
 * Contains no email or verification state.
 */
export interface PublicProfile {
  uid: string;
  username: string;
  displayUsername?: string;
  displayName: string;
  /** GitHub avatar host only (`getTrustedAvatarUrl`); the rules reject any other URL. */
  photoURL?: string;
  updatedAt?: string;
}

/**
 * Builds the `public_profiles/{uid}` record for a profile. Write it in the same
 * multi-path update as `users/{uid}` so search never drifts from the private profile.
 * Undefined optional fields are omitted because RTDB rejects `undefined` values.
 */
export function toPublicProfile(profile: UserProfile): PublicProfile {
  const publicProfile: PublicProfile = {
    uid: profile.uid,
    username: profile.username,
    displayName: profile.displayName || profile.displayUsername || profile.username
  };
  if (profile.displayUsername) publicProfile.displayUsername = profile.displayUsername;
  if (profile.photoURL) publicProfile.photoURL = profile.photoURL;
  if (profile.updatedAt) publicProfile.updatedAt = profile.updatedAt;
  return publicProfile;
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
  isFollowingOrg?: boolean;
  starredRepos: string[];
  missingRepos: RepoItem[];
  totalRepos: number;
  isDevBypass: boolean;
  error?: string;
}

/**
 * Validates whether a username satisfies length, syntax, and formatting rules.
 * Mirrors the `usernames/{username}` key rule: 1-39 chars of [a-z0-9_-] after normalization,
 * so every GitHub login can be claimed and used to create rooms.
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  const normalized = normalizeUsername(typeof username === "string" ? username : "");
  if (!normalized) {
    return { valid: false, error: "Username cannot be empty." };
  }
  if (normalized.length > 39) {
    return { valid: false, error: "Username cannot exceed 39 characters." };
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return { valid: false, error: "Username may only contain letters, numbers, hyphens, and underscores." };
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
