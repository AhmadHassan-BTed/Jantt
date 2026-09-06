import {
  signInWithPopup,
  signOut,
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
import { auth, googleProvider, rtdb } from "./firebaseConfig";
import type { UserProfile } from "./types";

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
 * Initiates Google OAuth popup sign-in.
 */
export async function signInWithGoogle(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Signs out current user.
 */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
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
