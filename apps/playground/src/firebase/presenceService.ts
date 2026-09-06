import {
  ref,
  onValue,
  set,
  onDisconnect,
  type Unsubscribe
} from "firebase/database";
import { rtdb } from "./firebaseConfig";
import type { UserProfile, RoomPresence } from "./types";

/**
 * Tracks the current user's live presence in a Cloud Room.
 * Uses Firebase's `.info/connected` handle and `onDisconnect().remove()`
 * so presence automatically disappears when the user navigates away,
 * closes the tab, or drops network connection.
 */
export function trackRoomPresence(
  roomId: string,
  user: UserProfile | null | undefined
): () => void {
  if (typeof window === "undefined" || !roomId || !user?.uid) {
    return () => {};
  }

  const connectedRef = ref(rtdb, ".info/connected");
  const presenceRef = ref(rtdb, `rooms/${roomId}/presence/${user.uid}`);

  let isCleanedUp = false;

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (isCleanedUp) return;
    if (snap.val() === true) {
      // Setup automatic teardown on disconnect
      onDisconnect(presenceRef)
        .remove()
        .catch(() => {});

      const presenceData: RoomPresence = {
        uid: user.uid,
        username: user.username,
        displayName: user.displayName,
        photoURL: user.photoURL,
        status: "online",
        lastSeen: new Date().toISOString(),
        joinedAt: new Date().toISOString()
      };

      set(presenceRef, presenceData).catch(() => {});
    }
  });

  return () => {
    isCleanedUp = true;
    unsubscribe();
    // Proactively remove presence immediately when unmounting or switching rooms
    set(presenceRef, null).catch(() => {});
  };
}

/**
 * Listens to active online collaborators in a Cloud Room in real time.
 */
export function listenToRoomPresence(
  roomId: string,
  callback: (presenceList: RoomPresence[]) => void
): Unsubscribe {
  if (typeof window === "undefined" || !roomId) {
    callback([]);
    return () => {};
  }

  const presenceRef = ref(rtdb, `rooms/${roomId}/presence`);

  return onValue(presenceRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }

    const val = snapshot.val() as Record<string, RoomPresence>;
    const list: RoomPresence[] = Object.values(val).filter(
      (p) => p && p.status === "online"
    );

    // Sort by joinedAt ascending so the host/first user is on the left
    list.sort((a, b) => (a.joinedAt || "").localeCompare(b.joinedAt || ""));
    callback(list);
  });
}
