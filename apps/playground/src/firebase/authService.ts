import {
  signInWithPopup,
  signOut,
  GithubAuthProvider,
  getAdditionalUserInfo,
  type User as FirebaseUser
} from "firebase/auth";
import {
  ref,
  get,
  update,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToFirst
} from "firebase/database";
import { auth, googleProvider, githubProvider, rtdb } from "./firebaseConfig";
import type { UserProfile } from "./types";
import { isCreatorAccount } from "./githubVerificationService";

const GH_TOKEN_KEY = "jantt_gh_access_token";

export function getStoredGitHubToken(): string | null {
  try {
    return sessionStorage.getItem(GH_TOKEN_KEY) || localStorage.getItem(GH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function storeGitHubToken(token: string): void {
  try {
    sessionStorage.setItem(GH_TOKEN_KEY, token);
    localStorage.setItem(GH_TOKEN_KEY, token);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredGitHubToken(): void {
  try {
    sessionStorage.removeItem(GH_TOKEN_KEY);
    localStorage.removeItem(GH_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Normalizes username to lowercase alphanumeric and underscores only.
 */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Initiates GitHub OAuth popup sign-in and automatically provisions/claims user profile.
 */
export async function signInWithGitHub(): Promise<{
  user: FirebaseUser;
  profile: UserProfile;
  githubToken: string | null;
}> {
  const result = await signInWithPopup(auth, githubProvider);
  const user = result.user;

  // Extract GitHub OAuth access token for 5,000 req/hr rate limit and 1-click star/follow
  const credential = GithubAuthProvider.credentialFromResult(result);
  const githubToken = credential?.accessToken || null;
  if (githubToken) {
    storeGitHubToken(githubToken);
  }

  // Extract verified GitHub login handle
  const additionalInfo = getAdditionalUserInfo(result);
  const rawGhUsername = (
    additionalInfo?.username ||
    (user as any)?.reloadUserInfo?.screenName ||
    user.displayName ||
    `user_${user.uid.slice(0, 6)}`
  ).trim();

  const normalized = normalizeUsername(rawGhUsername) || `user_${user.uid.slice(0, 6)}`;

  // Fetch or auto-create profile
  let profile = await getUserProfile(user.uid);
  const now = new Date().toISOString();
  const isCreator = isCreatorAccount(rawGhUsername) || isCreatorAccount(normalized);

  if (!profile) {
    profile = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || rawGhUsername,
      photoURL: user.photoURL || undefined,
      username: normalized,
      displayUsername: rawGhUsername,
      githubUsername: rawGhUsername,
      githubVerified: isCreator,
      isFollowingCreator: isCreator,
      createdAt: now,
      updatedAt: now
    };

    const updates: Record<string, any> = {};
    updates[`usernames/${normalized}`] = user.uid;
    updates[`users/${user.uid}`] = profile;
    await update(ref(rtdb), updates);
  } else {
    const shouldUpdate = !profile.githubUsername || (isCreator && !profile.githubVerified);
    if (shouldUpdate) {
      profile.githubUsername = rawGhUsername;
      if (isCreator) {
        profile.githubVerified = true;
        profile.isFollowingCreator = true;
      }
      profile.updatedAt = now;
      await update(ref(rtdb, `users/${user.uid}`), {
        githubUsername: rawGhUsername,
        ...(isCreator ? { githubVerified: true, isFollowingCreator: true } : {}),
        updatedAt: now
      });
    }
  }

  return { user, profile, githubToken };
}

/**
 * Initiates Google OAuth popup sign-in.
 */
export async function signInWithGoogle(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Signs out current user and clears cached tokens.
 */
export async function signOutUser(): Promise<void> {
  clearStoredGitHubToken();
  await signOut(auth);
}

/**
 * Updates user GitHub verification status in Realtime Database.
 */
export async function updateUserGitHubVerification(
  uid: string,
  verified: boolean,
  isFollowingCreator?: boolean,
  missingReposCount?: number,
  isDevBypass?: boolean
): Promise<void> {
  const now = new Date().toISOString();
  await update(ref(rtdb, `users/${uid}`), {
    githubVerified: verified,
    isFollowingCreator: Boolean(isFollowingCreator),
    missingReposCount: typeof missingReposCount === "number" ? missingReposCount : 0,
    isDevBypass: Boolean(isDevBypass),
    lastVerifiedAt: now,
    updatedAt: now
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
 * Checks whether a proposed username is valid and available.
 */
export async function checkUsernameAvailable(rawUsername: string): Promise<{
  available: boolean;
  normalized: string;
  error?: string;
}> {
  const normalized = normalizeUsername(rawUsername);

  if (!normalized || normalized.length < 3) {
    return {
      available: false,
      normalized,
      error: "Username must be at least 3 characters long."
    };
  }

  if (normalized.length > 24) {
    return {
      available: false,
      normalized,
      error: "Username cannot exceed 24 characters."
    };
  }

  const snap = await get(ref(rtdb, `usernames/${normalized}`));
  if (snap.exists()) {
    const existingUid = snap.val();
    const isCurrent = auth.currentUser && auth.currentUser.uid === existingUid;
    return {
      available: Boolean(isCurrent),
      normalized,
      error: isCurrent ? undefined : "This username is already taken. Try another."
    };
  }

  return { available: true, normalized };
}

/**
 * Atomically claims a unique username and establishes the user profile.
 */
export async function claimUsername(
  user: FirebaseUser,
  rawUsername: string
): Promise<UserProfile> {
  const { available, normalized, error } = await checkUsernameAvailable(rawUsername);
  if (!available) {
    throw new Error(error || "Username is not available.");
  }

  const now = new Date().toISOString();
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || normalized,
    photoURL: user.photoURL || undefined,
    username: normalized,
    displayUsername: rawUsername.trim().replace(/^@+/, ""),
    createdAt: now,
    updatedAt: now
  };

  const updates: Record<string, any> = {};
  updates[`usernames/${normalized}`] = user.uid;
  updates[`users/${user.uid}`] = profile;

  await update(ref(rtdb), updates);
  return profile;
}

/**
 * Searches users by username prefix for real-time teammate autocomplete.
 */
export async function searchUsersByUsername(
  searchQuery: string,
  excludeUid?: string
): Promise<UserProfile[]> {
  const prefix = normalizeUsername(searchQuery);
  if (!prefix || prefix.length < 1) return [];

  try {
    const usersQuery = query(
      ref(rtdb, "users"),
      orderByChild("username"),
      startAt(prefix),
      endAt(prefix + "\uf8ff"),
      limitToFirst(8)
    );

    const snapshot = await get(usersQuery);
    if (!snapshot.exists()) return [];

    const results: UserProfile[] = [];
    snapshot.forEach((child) => {
      const user = child.val() as UserProfile;
      if (user && (!excludeUid || user.uid !== excludeUid)) {
        results.push(user);
      }
    });

    return results;
  } catch {
    return [];
  }
}
