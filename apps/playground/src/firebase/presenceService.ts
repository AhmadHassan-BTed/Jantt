import {
  ref,
  onValue,
  set,
  remove,
  onDisconnect,
  type Unsubscribe
} from "firebase/database";
import { getTrustedAvatarUrl } from "../room-storage";
import { rtdb, isPermissionDeniedError } from "./firebaseConfig";
import type { UserProfile, RoomPresence } from "./types";

const MAX_NAME_LENGTH = 80;
/** Upper bound for releasing presence before sign-out proceeds (writes stall while offline). */
const RELEASE_TIMEOUT_MS = 1500;

/** Release functions of every presence currently tracked by this tab. */
const activeReleases = new Set<() => Promise<void>>();

function warnPresence(action: string, error: unknown): void {
  console.warn(`[presenceService] ${action}:`, error instanceof Error ? error.message : error);
}

/** Presence timestamps are ISO strings; older clients and other writers may store epoch millis. */
function toIsoTimestamp(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 40);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return "";
}

/**
 * Presence is self-reported by other clients, so only well-formed online entries are listed and
 * only display fields are kept: the key is the identity, there is no self-asserted owner badge
 * (derive it from `meta.ownerUid`), and avatars are limited to GitHub-hosted images.
 */
function toPresence(uid: string, raw: unknown): RoomPresence | null {
  if (!uid || !raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (entry.status !== "online" || typeof entry.username !== "string" || !entry.username) return null;
  const name = typeof entry.displayName === "string" && entry.displayName ? entry.displayName : entry.username;
  const presence: RoomPresence = {
    uid,
    username: entry.username,
    displayName: name.slice(0, MAX_NAME_LENGTH),
    status: "online",
    lastSeen: toIsoTimestamp(entry.lastSeen),
    joinedAt: toIsoTimestamp(entry.joinedAt)
  };
  if (typeof entry.inspectedTaskId === "string" && entry.inspectedTaskId.length > 0 && entry.inspectedTaskId.length <= 256) {
    presence.inspectedTaskId = entry.inspectedTaskId;
  }
  const photoURL = getTrustedAvatarUrl(entry.photoURL);
  if (photoURL) presence.photoURL = photoURL;
  return presence;
}

/**
 * Tracks the current user's live presence in a Cloud Room.
 * Uses Firebase's `.info/connected` handle and `onDisconnect().remove()`
 * so presence automatically disappears when the user navigates away,
 * closes the tab, or drops network connection.
 *
 * Tabs of the same user share one presence node; when another tab closes and removes it,
 * the remaining tracker writes it back, so the user stays online while any tab is open.
 *
 * Presence is published only while the user holds a member record (the rules require one):
 * joining the room later (e.g. "save to my rooms") starts it, and losing access removes it.
 */
export function trackRoomPresence(
  roomId: string,
  user: UserProfile | null | undefined,
  observeSelection?: (publish: (taskId: string | null) => void) => () => void
): () => void {
  if (typeof window === "undefined" || !roomId || !user?.uid) {
    return () => {};
  }

  const presenceRef = ref(rtdb, `rooms/${roomId}/presence/${user.uid}`);
  const joinedAt = new Date().toISOString();
  let active = true;
  let connected = false;
  let isMember = false;
  let confirmed = false;
  let denied = false;
  let inspectedTaskId: string | null = null;
  let selectionSupported = true;

  const writePresence = () => {
    if (!active || denied || !connected || !isMember) return;
    const presence: RoomPresence = {
      uid: user.uid,
      username: user.username,
      displayName: (user.displayName || user.username).slice(0, MAX_NAME_LENGTH),
      status: "online",
      lastSeen: new Date().toISOString(),
      joinedAt
    };
    // The rules accept GitHub-hosted avatars only; any other URL would reject the whole entry.
    const photoURL = getTrustedAvatarUrl(user.photoURL);
    if (photoURL) presence.photoURL = photoURL;

    if (selectionSupported && inspectedTaskId) presence.inspectedTaskId = inspectedTaskId;
    confirmed = false;
    set(presenceRef, presence).then(
      () => {
        confirmed = true;
      },
      (err) => {
        // Refused by the rules: stop retrying until the membership changes. Other failures
        // (connection lost mid-write) are retried by the next `.info/connected` event.
        if (isPermissionDeniedError(err) && presence.inspectedTaskId && selectionSupported) {
          // Rooms using older database rules still accept basic presence.
          selectionSupported = false;
          writePresence();
        } else if (isPermissionDeniedError(err)) denied = true;
        else warnPresence("Could not publish presence", err);
      }
    );
  };

  const stopConnected = onValue(ref(rtdb, ".info/connected"), (snap) => {
    connected = snap.val() === true;
    if (!active || !connected) return;
    onDisconnect(presenceRef)
      .remove()
      .catch((err) => warnPresence("Could not register presence cleanup on disconnect", err));
    writePresence();
  });

  // Served from the room listener's cache when the room is open, so this costs no extra read.
  const stopMember = onValue(
    ref(rtdb, `rooms/${roomId}/members/${user.uid}`),
    (snap) => {
      const wasMember = isMember;
      isMember = snap.exists();
      if (!active || isMember === wasMember) return;
      denied = false;
      if (isMember) {
        writePresence();
      } else {
        confirmed = false;
        remove(presenceRef).catch((err) => warnPresence("Could not remove presence after losing access", err));
      }
    },
    (err) => warnPresence("Membership listener cancelled", err)
  );

  const stopSelf = onValue(
    presenceRef,
    (snap) => {
      // Only heal after our own write landed, so a rejected write cannot loop.
      if (active && confirmed && !snap.exists()) writePresence();
    },
    (err) => warnPresence("Presence listener cancelled", err)
  );

  const stopSelection = observeSelection?.((taskId) => {
    const next = taskId && taskId.length <= 256 ? taskId : null;
    if (next === inspectedTaskId) return;
    inspectedTaskId = next;
    if (selectionSupported) writePresence();
  });

  const release = async () => {
    if (!active) return;
    active = false;
    activeReleases.delete(release);
    stopConnected();
    stopMember();
    stopSelf();
    stopSelection?.();
    // Best effort: offline, neither call reaches the server, so its onDisconnect handler still
    // removes the entry when the connection closes.
    await Promise.allSettled([onDisconnect(presenceRef).cancel(), remove(presenceRef)]);
  };
  activeReleases.add(release);

  return () => {
    void release();
  };
}

/**
 * Removes every presence this tab tracks. Call before signing out: once auth is gone the
 * rules reject the removal and the user would linger as "online" until the tab closes.
 */
export async function releaseAllRoomPresence(timeoutMs = RELEASE_TIMEOUT_MS): Promise<void> {
  const pending = Promise.allSettled([...activeReleases].map((release) => release()));
  await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * Listens to active online collaborators in a Cloud Room in real time.
 */
export function listenToRoomPresence(
  roomId: string,
  callback: (presenceList: RoomPresence[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (typeof window === "undefined" || !roomId) {
    callback([]);
    return () => {};
  }

  const presenceRef = ref(rtdb, `rooms/${roomId}/presence`);

  return onValue(
    presenceRef,
    (snapshot) => {
      const val = snapshot.val();
      const list: RoomPresence[] = [];
      if (val && typeof val === "object") {
        for (const [uid, entry] of Object.entries(val as Record<string, unknown>)) {
          const presence = toPresence(uid, entry);
          if (presence) list.push(presence);
        }
      }

      // Sort by joinedAt ascending so the host/first user is on the left
      list.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
      callback(list);
    },
    (error) => {
      if (onError) onError(error);
      else console.warn("[presenceService] Presence listener cancelled:", error.message);
      callback([]);
    }
  );
}
