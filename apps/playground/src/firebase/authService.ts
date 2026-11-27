import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  GithubAuthProvider,
  getAdditionalUserInfo,
  type User as FirebaseUser,
  type UserCredential
} from "firebase/auth";
import {
  ref,
  get,
  set,
  update,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToFirst,
  type DataSnapshot
} from "firebase/database";
import { auth, githubProvider, rtdb, isPermissionDeniedError } from "./firebaseConfig";
import type { UserProfile } from "./types";
import { normalizeUsername, validateUsername, toPublicProfile, type PublicProfile } from "./dtos/UserDto";
import { ENABLE_GITHUB_VERIFICATION_GATE } from "./githubVerificationService";
import { releaseAllRoomPresence } from "./presenceService";
import { getTrustedAvatarUrl } from "../room-storage";
import { storageService } from "../services/storage";

const GH_TOKEN_KEY = "jantt_gh_access_token";
const REDIRECT_PENDING_KEY = "jantt_auth_redirect_pending";
/** Mirrors the display-name limit of database.rules.json. */
const MAX_NAME_LENGTH = 256;
const SEARCH_LIMIT = 8;

/** Handles that would read as system accounts are never handed out. */
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "anonymous",
  "jantt",
  "moderator",
  "null",
  "owner",
  "root",
  "support",
  "system",
  "undefined"
]);

/** Popup failures that a full-page redirect can still complete. */
const REDIRECT_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment"
]);

/** Popup outcomes the user chose; nothing to report. */
const SILENT_AUTH_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled"
]);

/** Persisted profile shape: email stays in Firebase Auth and is never written to the database. */
type StoredProfile = Omit<UserProfile, "email">;

export interface GitHubSignInResult {
  user: FirebaseUser;
  /** Null when the GitHub handle cannot become a Jantt username; the user picks one in onboarding. */
  profile: UserProfile | null;
  githubToken: string | null;
}

/**
 * GitHub OAuth token of the signed-in account. It is only needed by the optional verification
 * gate, so it lives in memory for this page only: browser storage would keep it past the page,
 * readable by any script on this origin. After a reload the gate falls back to public GitHub data.
 */
let gitHubToken: { uid: string; token: string } | null = null;

// Older builds persisted the token in both storages; delete the copies they left behind.
storageService.removeItem(GH_TOKEN_KEY);
try {
  sessionStorage.removeItem(GH_TOKEN_KEY);
} catch {
  // intentionally ignored: sessionStorage is unavailable, so it holds no token either
}

/** Returns the GitHub OAuth token obtained by the given Firebase user on this page, if any. */
export function getStoredGitHubToken(uid?: string | null): string | null {
  return uid && gitHubToken?.uid === uid ? gitHubToken.token : null;
}

/** Keeps a GitHub OAuth token in memory, bound to the uid that obtained it. */
export function storeGitHubToken(token: string, uid: string): void {
  gitHubToken = token && uid ? { uid, token } : null;
}

export function clearStoredGitHubToken(): void {
  gitHubToken = null;
}

function getErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

/**
 * Maps a sign-in failure to a message for the user, or null when the user simply closed or
 * replaced the popup.
 */
export function describeAuthError(error: unknown): string | null {
  const code = getErrorCode(error);
  if (SILENT_AUTH_CODES.has(code)) return null;
  switch (code) {
    case "auth/network-request-failed":
      return "Network error during sign-in. Check your connection and try again.";
    case "auth/unauthorized-domain":
      return "GitHub sign-in is not enabled for this site.";
    case "auth/account-exists-with-different-credential":
      return "An account with this email already exists with another sign-in method.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    default:
      return "GitHub sign-in failed. Please try again.";
  }
}

function markRedirectPending(): void {
  try {
    sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
  } catch {
    // Storage unavailable: the redirect result is simply not collected.
  }
}

/** True when this tab started a redirect sign-in that `completeRedirectSignIn` has not finished. */
export function isRedirectSignInPending(): boolean {
  try {
    return sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function consumeRedirectPending(): boolean {
  try {
    const pending = sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1";
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}

/** The GitHub login of the OAuth result (never a display name). */
function resolveGitHubLogin(result: UserCredential): string | null {
  const login =
    getAdditionalUserInfo(result)?.username || (result.user as any)?.reloadUserInfo?.screenName;
  return typeof login === "string" && login.trim() ? login.trim() : null;
}

function withSessionEmail(profile: StoredProfile, user: FirebaseUser): UserProfile {
  const { email: _legacyEmail, ...stored } = profile as StoredProfile & { email?: string };
  return { ...stored, uid: user.uid, email: user.email || "" };
}

/** The searchable public record of a profile; the rules accept GitHub-hosted avatars only. */
function publicProfileOf(profile: StoredProfile): PublicProfile {
  const record = toPublicProfile(profile);
  if (record.photoURL && !getTrustedAvatarUrl(record.photoURL)) delete record.photoURL;
  return record;
}

async function readUsernameOwner(username: string): Promise<string | null> {
  const snap = await get(ref(rtdb, `usernames/${username}`));
  return snap.exists() ? (snap.val() as string) : null;
}

/**
 * Applies a username claim. On a rules rejection it tells a lost race ("taken") apart from a
 * deployed rule set that does not accept the optional paths (public profile, release of the
 * previous handle), and retries with the required records only in the latter case.
 */
async function commitUsernameClaim(
  uid: string,
  username: string,
  required: Record<string, unknown>,
  optional: Record<string, unknown>
): Promise<"claimed" | "taken"> {
  try {
    await update(ref(rtdb), { ...required, ...optional });
    return "claimed";
  } catch (err) {
    if (!isPermissionDeniedError(err)) throw err;
    // Unreadable owner: not provably a lost race, so the retry below decides.
    const owner = await readUsernameOwner(username).catch(() => null);
    if (owner && owner !== uid) return "taken";
    if (Object.keys(optional).length === 0) throw err;
    await update(ref(rtdb), required);
    return "claimed";
  }
}

/**
 * Builds the multi-path update for claiming `merged.username`. Only `changes` are written to
 * the profile (field by field), so unrelated profile fields are neither dropped nor rewritten.
 */
function usernameClaimUpdates(
  uid: string,
  changes: Partial<StoredProfile>,
  merged: StoredProfile,
  previousUsername?: string
): { required: Record<string, unknown>; optional: Record<string, unknown> } {
  const required: Record<string, unknown> = { [`usernames/${merged.username}`]: uid };
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) required[`users/${uid}/${key}`] = value;
  }

  const optional: Record<string, unknown> = {
    [`public_profiles/${uid}`]: publicProfileOf(merged)
  };
  if (previousUsername && previousUsername !== merged.username) {
    optional[`usernames/${previousUsername}`] = null;
  }
  return { required, optional };
}

/**
 * Loads the profile for a freshly signed-in GitHub account, creating it on first sign-in when
 * the GitHub login is a valid and free Jantt username. Returns null to route to onboarding.
 */
async function provisionProfile(user: FirebaseUser, githubLogin: string | null): Promise<UserProfile | null> {
  const existing = await getUserProfile(user.uid);
  const now = new Date().toISOString();

  if (existing?.username) {
    if (githubLogin && existing.githubUsername !== githubLogin) {
      try {
        await update(ref(rtdb, `users/${user.uid}`), { githubUsername: githubLogin, updatedAt: now });
        existing.githubUsername = githubLogin;
        existing.updatedAt = now;
      } catch (err) {
        console.warn("[authService] Could not store the GitHub login on the profile:", err);
      }
    }
    return withSessionEmail(existing, user);
  }

  const candidate = githubLogin ? normalizeUsername(githubLogin) : "";
  if (!candidate || !validateUsername(candidate).valid || RESERVED_USERNAMES.has(candidate)) {
    return null;
  }
  const owner = await readUsernameOwner(candidate);
  if (owner && owner !== user.uid) {
    return null;
  }

  const changes: StoredProfile = {
    uid: user.uid,
    displayName: (user.displayName || githubLogin || candidate).slice(0, MAX_NAME_LENGTH),
    username: candidate,
    displayUsername: githubLogin || candidate,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (githubLogin) changes.githubUsername = githubLogin;
  if (user.photoURL) changes.photoURL = user.photoURL;

  const merged: StoredProfile = { ...(existing || {}), ...changes };
  const { required, optional } = usernameClaimUpdates(user.uid, changes, merged);
  const outcome = await commitUsernameClaim(user.uid, candidate, required, optional);
  return outcome === "claimed" ? withSessionEmail(merged, user) : null;
}

async function completeSignIn(result: UserCredential): Promise<GitHubSignInResult> {
  const user = result.user;
  const githubLogin = resolveGitHubLogin(result);

  // The token is only needed for the (optional) star/follow verification gate.
  let githubToken: string | null = null;
  if (ENABLE_GITHUB_VERIFICATION_GATE) {
    githubToken = GithubAuthProvider.credentialFromResult(result)?.accessToken || null;
    if (githubToken) storeGitHubToken(githubToken, user.uid);
  }

  // The Firebase sign-in already succeeded: a provisioning failure (offline, rules) must not be
  // reported as a failed sign-in. The live profile listener decides between profile and onboarding.
  const profile = await provisionProfile(user, githubLogin).catch((err) => {
    console.warn("[authService] Could not load or create the profile during sign-in:", err);
    return null;
  });
  return { user, profile, githubToken };
}

/**
 * Signs in with GitHub (popup) and loads or provisions the user profile. Where popups are
 * blocked or unsupported (e.g. in-app browsers) it falls back to a full-page redirect, which
 * `completeRedirectSignIn` finishes on the next page load.
 */
export async function signInWithGitHub(): Promise<GitHubSignInResult> {
  let result: UserCredential;
  try {
    result = await signInWithPopup(auth, githubProvider);
  } catch (err) {
    if (!REDIRECT_FALLBACK_CODES.has(getErrorCode(err))) throw err;
    markRedirectPending();
    return signInWithRedirect(auth, githubProvider);
  }
  return completeSignIn(result);
}

/**
 * Completes a redirect sign-in started by `signInWithGitHub`. Resolves null (without loading
 * the redirect machinery) when no redirect was started from this tab.
 */
export async function completeRedirectSignIn(): Promise<GitHubSignInResult | null> {
  if (!consumeRedirectPending()) return null;
  const result = await getRedirectResult(auth);
  return result ? completeSignIn(result) : null;
}

/**
 * Signs out current user and clears cached tokens. Room presence is removed first, while the
 * database still accepts the user's writes.
 */
export async function signOutUser(): Promise<void> {
  clearStoredGitHubToken();
  await releaseAllRoomPresence();
  await signOut(auth);
}

/**
 * Updates user GitHub verification status in Realtime Database.
 * `_isDevBypass` is accepted for backward compatibility; bypasses are never persisted.
 */
export async function updateUserGitHubVerification(
  uid: string,
  verified: boolean,
  isFollowingCreator?: boolean,
  missingReposCount?: number,
  _isDevBypass?: boolean
): Promise<void> {
  const now = new Date().toISOString();
  await update(ref(rtdb, `users/${uid}`), {
    githubVerified: verified,
    isFollowingCreator: Boolean(isFollowingCreator),
    missingReposCount: typeof missingReposCount === "number" ? missingReposCount : 0,
    lastVerifiedAt: now,
    updatedAt: now
  });
}

/**
 * Persists the user's preferred timeline clock display (`12h` AM/PM or `24h`) on their account.
 */
export async function updateUserTimeFormat(uid: string, timeFormat: "12h" | "24h"): Promise<void> {
  if (!uid) return;
  await update(ref(rtdb, `users/${uid}`), {
    timeFormat,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Fetches user profile by UID from `/users/{uid}`.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  const snap = await get(ref(rtdb, `users/${uid}`));
  if (snap.exists()) {
    return snap.val() as UserProfile;
  }
  return null;
}

/**
 * Keeps the account's public records current for a loaded profile: publishes the public
 * profile used by teammate search and removes the email that older builds stored on the
 * profile. Best effort: failures (e.g. older rule sets) are logged and retried on the next load.
 */
export async function syncPublicProfile(profile: UserProfile, hasStoredEmail: boolean): Promise<void> {
  const uid = profile.uid;
  const next = publicProfileOf(profile);
  const tasks: Promise<unknown>[] = [];

  if (hasStoredEmail) {
    tasks.push(update(ref(rtdb, `users/${uid}`), { email: null }));
  }
  tasks.push(
    get(ref(rtdb, `public_profiles/${uid}`)).then((snap) => {
      const current = snap.val() as PublicProfile | null;
      const upToDate =
        current &&
        current.username === next.username &&
        current.displayName === next.displayName &&
        (current.displayUsername || null) === (next.displayUsername || null) &&
        (current.photoURL || null) === (next.photoURL || null);
      return upToDate ? undefined : set(ref(rtdb, `public_profiles/${uid}`), next);
    })
  );

  for (const outcome of await Promise.allSettled(tasks)) {
    if (outcome.status === "rejected") {
      console.warn("[authService] Could not update the account's public records:", outcome.reason);
    }
  }
}

/**
 * Checks whether a proposed username is valid and available.
 */
export async function checkUsernameAvailable(rawUsername: string): Promise<{
  available: boolean;
  normalized: string;
  error?: string;
}> {
  const normalized = normalizeUsername(rawUsername);
  const validation = validateUsername(normalized);
  if (!validation.valid) {
    return { available: false, normalized, error: validation.error };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return { available: false, normalized, error: "This username is reserved. Try another." };
  }

  try {
    const owner = await readUsernameOwner(normalized);
    if (owner) {
      const isCurrent = auth.currentUser?.uid === owner;
      return {
        available: isCurrent,
        normalized,
        error: isCurrent ? undefined : "This username is already taken. Try another."
      };
    }
    return { available: true, normalized };
  } catch (err) {
    console.warn("[authService] Username availability check failed:", err);
    return {
      available: false,
      normalized,
      error: isPermissionDeniedError(err)
        ? "Usernames can't be checked right now. Please try again later."
        : "Couldn't check availability. Check your connection and try again."
    };
  }
}

/**
 * Atomically claims a unique username for the signed-in user. Updates profile fields
 * individually (keeping the GitHub link) and releases the previous handle when the rules allow.
 */
export async function claimUsername(
  user: FirebaseUser,
  rawUsername: string
): Promise<UserProfile> {
  const { available, normalized, error } = await checkUsernameAvailable(rawUsername);
  if (!available) {
    throw new Error(error || "Username is not available.");
  }

  const previous = await getUserProfile(user.uid);
  const now = new Date().toISOString();
  const typed = rawUsername.trim().replace(/^@+/, "");

  const changes: Partial<StoredProfile> = {
    uid: user.uid,
    username: normalized,
    // Keep the typed casing only when it spells the same handle.
    displayUsername: typed.toLowerCase() === normalized ? typed : normalized,
    updatedAt: now
  };
  if (!previous?.displayName) {
    changes.displayName = (user.displayName || normalized).slice(0, MAX_NAME_LENGTH);
  }
  if (!previous?.createdAt) changes.createdAt = now;
  if (!previous?.photoURL && user.photoURL) changes.photoURL = user.photoURL;

  const merged = { ...(previous || {}), ...changes } as StoredProfile;
  const { required, optional } = usernameClaimUpdates(user.uid, changes, merged, previous?.username);
  let outcome: "claimed" | "taken";
  try {
    outcome = await commitUsernameClaim(user.uid, normalized, required, optional);
  } catch (err) {
    if (!isPermissionDeniedError(err)) throw err;
    console.warn("[authService] Username claim rejected by the database rules:", err);
    throw new Error("This username can't be claimed right now. Try another one, or try again later.");
  }
  if (outcome === "taken") {
    throw new Error("This username was just taken. Please choose another.");
  }
  return withSessionEmail(merged, user);
}

function toPublicProfiles(snapshot: DataSnapshot, excludeUid?: string): UserProfile[] {
  const results: UserProfile[] = [];
  snapshot.forEach((child) => {
    const value = child.val() as Partial<UserProfile> | null;
    const uid = child.key;
    if (!uid || uid === excludeUid || !value || typeof value.username !== "string") return;
    // Only public fields leave this function, whatever the source node holds.
    const profile: UserProfile = {
      uid,
      username: value.username,
      displayUsername: typeof value.displayUsername === "string" ? value.displayUsername : value.username,
      displayName: typeof value.displayName === "string" && value.displayName ? value.displayName : value.username,
      createdAt: "",
      updatedAt: ""
    };
    if (typeof value.photoURL === "string") profile.photoURL = value.photoURL;
    results.push(profile);
  });
  return results;
}

async function queryByUsernamePrefix(path: string, prefix: string, excludeUid?: string): Promise<UserProfile[]> {
  const snapshot = await get(
    query(
      ref(rtdb, path),
      orderByChild("username"),
      startAt(prefix),
      endAt(prefix + "\uf8ff"),
      limitToFirst(SEARCH_LIMIT)
    )
  );
  return snapshot.exists() ? toPublicProfiles(snapshot, excludeUid) : [];
}

/**
 * Searches users by username prefix for real-time teammate autocomplete. Reads the public
 * profiles, falling back to `/users` only on rule sets that predate them (the read is refused),
 * so a search without matches costs one request. Results carry public fields only.
 *
 * Rejects when no source can be searched (offline, or refused by the rules), so callers can
 * tell "search unavailable" apart from "no account found".
 */
export async function searchUsersByUsername(
  searchQuery: string,
  excludeUid?: string
): Promise<UserProfile[]> {
  const prefix = normalizeUsername(searchQuery);
  if (!prefix) return [];

  try {
    return await queryByUsernamePrefix("public_profiles", prefix, excludeUid);
  } catch (err) {
    // Only a refusal can be answered by the legacy source; a network failure affects both.
    if (!isPermissionDeniedError(err)) throw err;
    try {
      return await queryByUsernamePrefix("users", prefix, excludeUid);
    } catch {
      // The legacy source is refused too: report the primary source's failure.
      throw err;
    }
  }
}
