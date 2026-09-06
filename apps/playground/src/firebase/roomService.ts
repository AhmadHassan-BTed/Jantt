import {
  ref,
  get,
  update,
  onValue,
  runTransaction,
  type Unsubscribe
} from "firebase/database";
import type { JanttData } from "@jantt/core";
import { calculatePlanHash, validate, reconcilePlans, sanitizePlanForJson } from "@jantt/core";
import { rtdb } from "./firebaseConfig";
import type {
  UserProfile,
  RoomMember,
  RoomMetadata,
  UserRoomPointer,
  FullRoomPayload
} from "./types";

/**
 * Generates clean, readable unique room identifier slug.
 */
export function generateRoomSlug(prefix = "room"): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${hex}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a brand new Cloud Room and registers it atomically under user's owned rooms.
 */
export async function createRoom(
  user: UserProfile,
  title: string,
  initialData: JanttData
): Promise<FullRoomPayload> {
  const validation = validate(initialData);
  if (!validation.valid) {
    throw new Error(`Invalid plan data: ${validation.errors[0]?.message || "Validation failed"}`);
  }

  const roomId = generateRoomSlug();
  const now = new Date().toISOString();
  const contentHash = calculatePlanHash(initialData);
  const taskCount = initialData.tasks?.length || 0;

  const meta: RoomMetadata = {
    roomId,
    title: title.trim() || initialData.meta?.title || "New Project Room",
    ownerUid: user.uid,
    ownerUsername: user.username,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    contentHash,
    taskCount
  };

  const ownerMember: RoomMember = {
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role: "owner",
    joinedAt: now
  };

  const userPointer: UserRoomPointer = {
    roomId,
    title: meta.title,
    ownerUid: user.uid,
    ownerUsername: user.username,
    role: "owner",
    createdAt: now,
    updatedAt: now
  };

  const sanitizedData = sanitizePlanForJson(initialData);

  const updates: Record<string, any> = {};
  updates[`rooms/${roomId}/meta`] = meta;
  updates[`rooms/${roomId}/members/${user.uid}`] = ownerMember;
  updates[`rooms/${roomId}/data`] = sanitizedData;
  updates[`user_rooms/${user.uid}/owned/${roomId}`] = userPointer;

  await update(ref(rtdb), updates);

  return {
    meta,
    members: { [user.uid]: ownerMember },
    data: sanitizedData
  };
}

/**
 * Shares an existing room with a teammate by their UserProfile.
 */
export async function shareRoomWithUser(
  roomId: string,
  targetUser: UserProfile,
  role: "editor" | "viewer" = "editor"
): Promise<RoomMember> {
  // Fetch room metadata
  const metaSnap = await get(ref(rtdb, `rooms/${roomId}/meta`));
  if (!metaSnap.exists()) {
    throw new Error("Room does not exist.");
  }
  const meta = metaSnap.val() as RoomMetadata;
  const now = new Date().toISOString();

  const newMember: RoomMember = {
    uid: targetUser.uid,
    username: targetUser.username,
    displayName: targetUser.displayName,
    photoURL: targetUser.photoURL,
    role,
    joinedAt: now
  };

  const sharedPointer: UserRoomPointer = {
    roomId,
    title: meta.title,
    ownerUid: meta.ownerUid,
    ownerUsername: meta.ownerUsername,
    role,
    createdAt: meta.createdAt,
    updatedAt: now
  };

  const updates: Record<string, any> = {};
  updates[`rooms/${roomId}/members/${targetUser.uid}`] = newMember;
  updates[`user_rooms/${targetUser.uid}/shared/${roomId}`] = sharedPointer;

  await update(ref(rtdb), updates);
  return newMember;
}

/**
 * Removes a member from a room.
 */
export async function removeMemberFromRoom(
  roomId: string,
  targetUid: string
): Promise<void> {
  const updates: Record<string, any> = {};
  updates[`rooms/${roomId}/members/${targetUid}`] = null;
  updates[`user_rooms/${targetUid}/shared/${roomId}`] = null;
  await update(ref(rtdb), updates);
}

/**
 * Updates a member's role (editor vs viewer).
 */
export async function updateMemberRole(
  roomId: string,
  targetUid: string,
  newRole: "editor" | "viewer"
): Promise<void> {
  const updates: Record<string, any> = {};
  updates[`rooms/${roomId}/members/${targetUid}/role`] = newRole;
  updates[`user_rooms/${targetUid}/shared/${roomId}/role`] = newRole;
  await update(ref(rtdb), updates);
}

/**
 * Allows a shared member to voluntarily leave a room.
 */
export async function leaveRoom(
  roomId: string,
  userUid: string
): Promise<void> {
  await removeMemberFromRoom(roomId, userUid);
}

/**
 * Completely deletes a room (Owner action), cascading removal across all members' indexes.
 */
export async function deleteRoom(
  roomId: string,
  ownerUid: string
): Promise<void> {
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return;

  const room = snap.val();
  const members = room.members || {};

  const updates: Record<string, any> = {};
  updates[`rooms/${roomId}`] = null;
  updates[`user_rooms/${ownerUid}/owned/${roomId}`] = null;

  // Clean up pointer from every member's shared directory
  for (const memberUid of Object.keys(members)) {
    if (memberUid !== ownerUid) {
      updates[`user_rooms/${memberUid}/shared/${roomId}`] = null;
    }
  }

  await update(ref(rtdb), updates);
}

/**
 * Joins a room via invite link or direct Room ID.
 */
export async function joinRoomViaInvite(
  roomId: string,
  user: UserProfile
): Promise<FullRoomPayload> {
  const roomSnap = await get(ref(rtdb, `rooms/${roomId}`));
  if (!roomSnap.exists()) {
    throw new Error(`Room "${roomId}" was not found or has been deleted by its owner.`);
  }

  const room = roomSnap.val() as FullRoomPayload;
  const existingMember = room.members?.[user.uid];

  if (!existingMember) {
    // Register user as collaborator in the room
    const now = new Date().toISOString();
    const newMember: RoomMember = {
      uid: user.uid,
      username: user.username,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: "editor",
      joinedAt: now
    };

    const sharedPointer: UserRoomPointer = {
      roomId,
      title: room.meta.title,
      ownerUid: room.meta.ownerUid,
      ownerUsername: room.meta.ownerUsername,
      role: "editor",
      createdAt: room.meta.createdAt,
      updatedAt: now
    };

    const updates: Record<string, any> = {};
    updates[`rooms/${roomId}/members/${user.uid}`] = newMember;
    updates[`user_rooms/${user.uid}/shared/${roomId}`] = sharedPointer;
    await update(ref(rtdb), updates);

    room.members[user.uid] = newMember;
  }

  return room;
}

/**
 * Fetches a full room payload by Room ID.
 */
export async function getRoom(roomId: string): Promise<FullRoomPayload | null> {
  const snap = await get(ref(rtdb, `rooms/${roomId}`));
  if (!snap.exists()) return null;
  return snap.val() as FullRoomPayload;
}

/**
 * Atomically updates room data using ACID transactions with CRDT merge conflict protection.
 */
export async function saveRoomDataAtomic(
  roomId: string,
  updatedData: JanttData,
  user: UserProfile,
  baseData?: JanttData
): Promise<{ success: boolean; revision: number; data: JanttData }> {
  const dataRef = ref(rtdb, `rooms/${roomId}/data`);
  const metaRef = ref(rtdb, `rooms/${roomId}/meta`);

  const sanitizedIncoming = sanitizePlanForJson(updatedData);
  let finalMergedData = sanitizedIncoming;
  let finalRevision = 1;

  const mentionClient = user.username
    ? `@${user.username}`
    : user.displayUsername
    ? `@${user.displayUsername}`
    : "collaborator";

  await runTransaction(dataRef, (currentRemoteData: JanttData | null) => {
    if (!currentRemoteData) {
      return sanitizedIncoming;
    }

    const currentHash = calculatePlanHash(currentRemoteData);
    const incomingHash = calculatePlanHash(sanitizedIncoming);

    if (currentHash === incomingHash) {
      return sanitizedIncoming;
    }

    // 3-Way CRDT Reconcile if remote has diverged from what caller based their edits on
    if (baseData) {
      const reconcile = reconcilePlans(baseData, sanitizedIncoming, currentRemoteData, {
        clientId: mentionClient
      });
      finalMergedData = sanitizePlanForJson(reconcile.mergedData);
      return finalMergedData;
    }

    return sanitizedIncoming;
  });

  // Update room metadata (revision, contentHash, updatedAt)
  const now = new Date().toISOString();
  const contentHash = calculatePlanHash(finalMergedData);
  const taskCount = finalMergedData.tasks?.length || 0;

  await runTransaction(metaRef, (currentMeta: RoomMetadata | null) => {
    if (!currentMeta) return currentMeta;
    finalRevision = (currentMeta.revision || 1) + 1;
    return {
      ...currentMeta,
      revision: finalRevision,
      contentHash,
      updatedAt: now,
      taskCount
    };
  });

  return {
    success: true,
    revision: finalRevision,
    data: finalMergedData
  };
}

/**
 * Listens to a user's owned and shared room lists in real time.
 */
export function listenToUserRooms(
  uid: string,
  callback: (owned: UserRoomPointer[], shared: UserRoomPointer[]) => void
): Unsubscribe {
  const userRoomsRef = ref(rtdb, `user_rooms/${uid}`);

  return onValue(userRoomsRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([], []);
      return;
    }

    const val = snapshot.val();
    const ownedMap = val.owned || {};
    const sharedMap = val.shared || {};

    const ownedList: UserRoomPointer[] = Object.values(ownedMap);
    const sharedList: UserRoomPointer[] = Object.values(sharedMap);

    // Sort by recent updatedAt descending
    ownedList.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    sharedList.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    callback(ownedList, sharedList);
  });
}

/**
 * Listens to active room changes (metadata, members, and data) via real-time WebSockets.
 */
export function listenToRoom(
  roomId: string,
  callback: (room: FullRoomPayload | null) => void
): Unsubscribe {
  const roomRef = ref(rtdb, `rooms/${roomId}`);

  return onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const val = snapshot.val() as FullRoomPayload;
    callback(val);
  });
}
