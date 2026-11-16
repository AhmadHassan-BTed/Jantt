import {
  ref,
  get,
  update,
  onValue,
  runTransaction,
  increment,
  type Unsubscribe
} from "firebase/database";
import type { JanttData } from "@jantt/core";
import {
  calculatePlanHash,
  validate,
  reconcilePlans,
  sanitizePlanForJson,
  generateRoomId
} from "@jantt/core";
import { getTrustedAvatarUrl, isValidRoomId } from "../room-storage";
import { auth, rtdb, isPermissionDeniedError } from "./firebaseConfig";
import {
  validateRoomMetadata,
  validateRoomMember,
  validateRoomTeam,
  validateUserProfile,
  normalizeUsername,
  encodePlanForRtdb,
  decodePlanFromRtdb,
  type UserProfile,
  type RoomMember,
  type RoomMemberRole,
  type RoomMetadata,
  type UserRoomPointer,
  type FullRoomPayload,
  type RoomTeam
} from "./dtos";

/** Field limits mirror database.rules.json (titles and team names 200, display names 256). */
const MAX_TITLE_LENGTH = 200;
const MAX_NAME_LENGTH = 256;
/** A save that has not settled by then is reported to the caller (usually: the client is offline). */
const SAVE_TIMEOUT_MS = 20000;
/** RTDB rejects keys containing `. # $ [ ] /` or ASCII control characters. */
const FORBIDDEN_KEY_CHARS = /[.#$[\]\/\u0000-\u001f\u007f]/;

function isSafeKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= 128 && !FORBIDDEN_KEY_CHARS.test(key);
}

/**
 * Rejects anything but a well-formed room id (the format `generateRoomId` produces) before any
 * request is made, so ids taken from links can never address another RTDB path ("x/members/y").
 */
function assertRoomId(roomId: string): void {
  if (!isValidRoomId(roomId)) {
    throw new Error("Invalid room ID.");
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

async function readValue<T>(path: string): Promise<T | null> {
  const snap = await get(ref(rtdb, path));
  return snap.exists() ? (snap.val() as T) : null;
}

/**
 * Builds a member record without `undefined` fields (RTDB rejects them). Avatars other than
 * GitHub-hosted images are left out, as the rules reject them.
 */
function buildMember(
  user: Pick<UserProfile, "uid" | "username" | "displayName" | "photoURL">,
  role: RoomMemberRole,
  joinedAt: string,
  team?: { id: string; name: string }
): RoomMember {
  const member: RoomMember = {
    uid: user.uid,
    username: user.username,
    displayName: clip(user.displayName || user.username, MAX_NAME_LENGTH),
    role,
    joinedAt
  };
  const photoURL = getTrustedAvatarUrl(user.photoURL);
  if (photoURL) member.photoURL = photoURL;
  if (team) {
    member.teamId = team.id;
    member.teamName = clip(team.name, MAX_TITLE_LENGTH);
  }
  return member;
}

function buildSharedPointer(
  roomId: string,
  meta: RoomMetadata,
  role: RoomMemberRole,
  updatedAt: string
): UserRoomPointer {
  return {
    roomId,
    title: clip(meta.title || "Untitled room", MAX_TITLE_LENGTH),
    ownerUid: meta.ownerUid,
    ownerUsername: meta.ownerUsername || "",
    role,
    createdAt: meta.createdAt || updatedAt,
    updatedAt
  };
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value as object).length === 0;
}

/**
 * Deep equality over JSON plan data that treats the values RTDB drops on write
 * (null, empty arrays, empty objects) as absent, so a round-tripped plan equals its source.
 */
function isSamePlanData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => isSamePlanData(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  for (const key of Object.keys(left)) {
    if (!isSamePlanData(left[key], right[key])) return false;
  }
  for (const key of Object.keys(right)) {
    if (!(key in left) && !isEmptyValue(right[key])) return false;
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  // The underlying work keeps running after a timeout; keep its late rejection from going unhandled.
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function warnListenerError(error: Error): void {
  console.warn("[roomService] Realtime listener cancelled:", error.message);
}

/** Rooms whose legacy edit key this session already asked the database to delete. */
const scrubbedLegacySecrets = new Set<string>();

/**
 * Rooms created by older builds keep an edit key in their world-readable meta. It grants nothing,
 * so it never leaves this module, and the owner's client deletes it (an owner-only write) the
 * first time it opens the room in a session.
 */
function withoutLegacySecret(roomId: string, meta: RoomMetadata): RoomMetadata {
  if (meta.secretKey === undefined) return meta;
  if (meta.ownerUid && meta.ownerUid === auth.currentUser?.uid && !scrubbedLegacySecrets.has(roomId)) {
    scrubbedLegacySecrets.add(roomId);
    update(ref(rtdb, `rooms/${roomId}/meta`), { secretKey: null }).catch((err) => {
      console.warn(`[roomService] Could not remove the legacy edit key of room "${roomId}":`, err);
    });
  }
  const { secretKey: _legacyKey, ...rest } = meta;
  return rest;
}

/**
 * Reads a room as separate meta/members/data reads (never the room root, which also holds
 * presence). A node without `meta` is not a room (e.g. a stray presence write) and yields null.
 */
async function fetchRoom(roomId: string): Promise<FullRoomPayload | null> {
  assertRoomId(roomId);
  const [meta, members, data] = await Promise.all([
    readValue<RoomMetadata>(`rooms/${roomId}/meta`),
    readValue<Record<string, RoomMember>>(`rooms/${roomId}/members`),
    readValue<JanttData>(`rooms/${roomId}/data`)
  ]);
  if (!meta) return null;
  return {
    meta: withoutLegacySecret(roomId, meta),
    members: members || {},
    data: (data ? decodePlanFromRtdb(data) : undefined) as JanttData
  };
}

/**
 * Creates a brand new Cloud Room and registers it atomically under user's owned rooms.
 * Rooms carry no shared secret: editor access is granted by the owner per member.
 */
export async function createRoom(
  user: UserProfile,
  title: string,
  initialData: JanttData
): Promise<FullRoomPayload> {
  const userValidation = validateUserProfile(user);
  if (!userValidation.valid) {
    throw new Error(userValidation.error || "Invalid user profile.");
  }

  const validation = validate(initialData);
  if (!validation.valid) {
    throw new Error(`Invalid plan data: ${validation.errors[0]?.message || "Validation failed"}`);
  }

  const roomId = generateRoomId();
  const now = new Date().toISOString();
  const sanitizedData = sanitizePlanForJson(initialData);
  const taskCount = sanitizedData.tasks?.length || 0;
  const noteCount = sanitizedData.notes?.length || 0;

  const meta: RoomMetadata = {
    roomId,
    title: clip(title.trim() || initialData.meta?.title?.trim() || "New Project Room", MAX_TITLE_LENGTH),
    ownerUid: user.uid,
    ownerUsername: user.username,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    contentHash: calculatePlanHash(sanitizedData),
    taskCount,
    noteCount,
    theme: "noir"
  };

  const metaValidation = validateRoomMetadata(meta);
  if (!metaValidation.valid) {
    throw new Error(metaValidation.error || "Invalid room metadata.");
  }

  const ownerMember = buildMember(user, "owner", now);
  const ownerMemberValidation = validateRoomMember(ownerMember);
  if (!ownerMemberValidation.valid) {
    throw new Error(ownerMemberValidation.error || "Invalid owner member.");
  }

  const ownerPointer: UserRoomPointer = {
    ...buildSharedPointer(roomId, meta, "owner", now),
    taskCount,
    noteCount
  };

  await update(ref(rtdb), {
    [`rooms/${roomId}/meta`]: meta,
    [`rooms/${roomId}/members/${user.uid}`]: ownerMember,
    [`rooms/${roomId}/data`]: encodePlanForRtdb(sanitizedData),
    [`user_rooms/${user.uid}/owned/${roomId}`]: ownerPointer
  });

  return {
    meta,
    members: { [user.uid]: ownerMember },
    data: sanitizedData
  };
}

/**
 * Shares an existing room with a teammate by their UserProfile (owner action).
 * Re-sharing with an existing member replaces their record and detaches it from any team.
 */
export async function shareRoomWithUser(
  roomId: string,
  targetUser: UserProfile,
  role: "editor" | "viewer" = "editor"
): Promise<RoomMember> {
  assertRoomId(roomId);
  if (!isSafeKey(targetUser?.uid)) {
    throw new Error("Invalid user.");
  }
  const meta = await readValue<RoomMetadata>(`rooms/${roomId}/meta`);
  if (!meta) {
    throw new Error("Room does not exist.");
  }
  if (targetUser.uid === meta.ownerUid) {
    throw new Error("The room owner already has full access.");
  }

  const now = new Date().toISOString();
  const newMember = buildMember(targetUser, role, now);
  const newMemberValidation = validateRoomMember(newMember);
  if (!newMemberValidation.valid) {
    throw new Error(newMemberValidation.error || "Invalid member data.");
  }

  await update(ref(rtdb), {
    [`rooms/${roomId}/members/${targetUser.uid}`]: newMember,
    [`rooms/${roomId}/banned/${targetUser.uid}`]: null,
    [`user_rooms/${targetUser.uid}/shared/${roomId}`]: buildSharedPointer(roomId, meta, role, now)
  });
  return newMember;
}

/**
 * Shares a room with a team in bulk (owner action).
 *
 * Only real accounts are enrolled: an entry is added when its uid owns its claimed username
 * (`usernames/<name>`). The owner and existing members keep their current records, so removing
 * the team later never removes individually invited people.
 */
export async function shareRoomWithTeam(
  roomId: string,
  team: { id: string; name: string; color?: string },
  membersToAdd: UserProfile[],
  role: "editor" | "viewer" = "editor"
): Promise<{ added: string[]; skipped: string[] }> {
  assertRoomId(roomId);
  // The rules key teams by their id (`teams/{id}.id === id`).
  if (!isSafeKey(team?.id) || !team.name?.trim()) {
    throw new Error("Invalid team.");
  }

  const [meta, existingMembers] = await Promise.all([
    readValue<RoomMetadata>(`rooms/${roomId}/meta`),
    readValue<Record<string, RoomMember>>(`rooms/${roomId}/members`)
  ]);
  if (!meta) {
    throw new Error("Room does not exist.");
  }
  const members = existingMembers || {};

  const people = membersToAdd.filter((u): u is UserProfile => Boolean(u && isSafeKey(u.uid)));
  const alreadyIn = people.filter((u) => u.uid === meta.ownerUid || Boolean(members[u.uid]));
  const candidates = people
    .filter((u) => !alreadyIn.includes(u))
    .map((u) => ({ source: u, handle: normalizeUsername(u.username || "") }));
  const claimedBy = await Promise.all(
    candidates.map(({ handle }) =>
      // An unreadable claim counts as unverified: that person is reported in `skipped`.
      handle ? readValue<string>(`usernames/${handle}`).catch(() => null) : Promise.resolve(null)
    )
  );
  const verified = candidates.filter((_, i) => claimedBy[i] === candidates[i].source.uid);
  // Member records must carry the handle the account actually claimed.
  const resolved = verified.map(({ source, handle }) => ({ ...source, username: handle }));
  const verifiedSources = verified.map(({ source }) => source);
  const skipped = membersToAdd
    .filter((u) => !verifiedSources.includes(u) && !alreadyIn.includes(u))
    .map((u) => u?.username || u?.displayName || "unknown");

  if (resolved.length === 0 && alreadyIn.length === 0) {
    throw new Error(`Nobody in "${team.name}" has a Jantt account yet. Share the room link with them instead.`);
  }

  const now = new Date().toISOString();
  const listed = [...alreadyIn, ...resolved];
  const roomTeam: RoomTeam = {
    id: team.id,
    name: clip(team.name.trim(), MAX_TITLE_LENGTH),
    memberUids: listed.map((m) => m.uid),
    // Existing members are listed under the handle on their record; RTDB rejects undefined.
    memberUsernames: listed.map((m) => members[m.uid]?.username || m.username || ""),
    role,
    addedAt: now
  };
  if (team.color) roomTeam.color = team.color;

  const teamValidation = validateRoomTeam(roomTeam);
  if (!teamValidation.valid) {
    throw new Error(teamValidation.error || "Invalid room team.");
  }

  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/teams/${team.id}`]: roomTeam
  };
  for (const user of resolved) {
    updates[`rooms/${roomId}/members/${user.uid}`] = buildMember(user, role, now, team);
    updates[`rooms/${roomId}/banned/${user.uid}`] = null;
    updates[`user_rooms/${user.uid}/shared/${roomId}`] = buildSharedPointer(roomId, meta, role, now);
  }

  await update(ref(rtdb), updates);
  return { added: resolved.map((u) => u.username), skipped };
}

/**
 * Removes an entire team from a room while protecting independent members and the room owner.
 * People who are also listed by another team keep their access through that team.
 */
export async function removeTeamFromRoom(
  roomId: string,
  teamId: string
): Promise<void> {
  assertRoomId(roomId);
  if (!isSafeKey(teamId)) {
    throw new Error("Invalid team.");
  }
  const [teams, members, meta] = await Promise.all([
    readValue<Record<string, RoomTeam>>(`rooms/${roomId}/teams`),
    readValue<Record<string, RoomMember>>(`rooms/${roomId}/members`),
    readValue<RoomMetadata>(`rooms/${roomId}/meta`)
  ]);
  const team = teams?.[teamId];
  const otherTeams = Object.entries(teams || {})
    .filter(([id, t]) => id !== teamId && Array.isArray(t?.memberUids))
    .map(([id, t]) => ({ ...t, id }));
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/teams/${teamId}`]: null
  };

  if (team && Array.isArray(team.memberUids)) {
    for (const uid of team.memberUids) {
      // Never remove the owner, and only remove members whose access came from this team.
      if (!isSafeKey(uid) || uid === meta?.ownerUid || members?.[uid]?.teamId !== teamId) continue;
      const stillCovered = meta ? otherTeams.find((t) => t.memberUids.includes(uid)) : undefined;
      if (meta && stillCovered) {
        // Access now comes from the other team, so its role applies.
        const role = stillCovered.role === "editor" ? "editor" : "viewer";
        updates[`rooms/${roomId}/members/${uid}/teamId`] = stillCovered.id;
        updates[`rooms/${roomId}/members/${uid}/teamName`] = clip(stillCovered.name || stillCovered.id, MAX_TITLE_LENGTH);
        updates[`rooms/${roomId}/members/${uid}/role`] = role;
        updates[`user_rooms/${uid}/shared/${roomId}`] = buildSharedPointer(roomId, meta, role, now);
      } else {
        updates[`rooms/${roomId}/members/${uid}`] = null;
        updates[`user_rooms/${uid}/shared/${roomId}`] = null;
      }
    }
  }

  await update(ref(rtdb), updates);
}

/**
 * Removes a member from a room (owner action, or a member removing themselves).
 * When the owner removes someone, the person is also banned from re-adding themselves
 * through the room link; sharing with them again lifts the ban.
 */
export async function removeMemberFromRoom(
  roomId: string,
  targetUid: string
): Promise<void> {
  assertRoomId(roomId);
  if (!isSafeKey(targetUid)) {
    throw new Error("Invalid member.");
  }
  const ownerUid = await readValue<string>(`rooms/${roomId}/meta/ownerUid`);
  if (ownerUid && ownerUid === targetUid) {
    throw new Error("The room owner cannot be removed. Delete the room instead.");
  }
  const updates: Record<string, true | null> = {
    [`rooms/${roomId}/members/${targetUid}`]: null,
    [`user_rooms/${targetUid}/shared/${roomId}`]: null
  };
  if (ownerUid && ownerUid === auth.currentUser?.uid) {
    updates[`rooms/${roomId}/banned/${targetUid}`] = true;
  }
  await update(ref(rtdb), updates);
}

/**
 * Updates a member's role (editor vs viewer). Fails instead of creating a partial member
 * record when the person already left, and rewrites their full room pointer.
 */
export async function updateMemberRole(
  roomId: string,
  targetUid: string,
  newRole: "editor" | "viewer"
): Promise<void> {
  assertRoomId(roomId);
  if (!isSafeKey(targetUid)) {
    throw new Error("Invalid member.");
  }
  const [meta, member] = await Promise.all([
    readValue<RoomMetadata>(`rooms/${roomId}/meta`),
    readValue<RoomMember>(`rooms/${roomId}/members/${targetUid}`)
  ]);
  if (!meta) {
    throw new Error("Room does not exist.");
  }
  if (meta.ownerUid === targetUid) {
    throw new Error("The room owner's role cannot be changed.");
  }
  if (!member) {
    throw new Error("This person is no longer a member of the room.");
  }

  await update(ref(rtdb), {
    [`rooms/${roomId}/members/${targetUid}/role`]: newRole,
    [`user_rooms/${targetUid}/shared/${roomId}`]: buildSharedPointer(
      roomId,
      meta,
      newRole,
      new Date().toISOString()
    )
  });
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
 * If the room is already gone, only the caller's stale pointers are pruned.
 */
export async function deleteRoom(
  roomId: string,
  ownerUid: string
): Promise<void> {
  assertRoomId(roomId);
  const [ownerOfRecord, members, teams] = await Promise.all([
    readValue<string>(`rooms/${roomId}/meta/ownerUid`),
    readValue<Record<string, RoomMember>>(`rooms/${roomId}/members`),
    readValue<Record<string, RoomTeam>>(`rooms/${roomId}/teams`)
  ]);

  const updates: Record<string, null> = {
    [`user_rooms/${ownerUid}/owned/${roomId}`]: null,
    [`user_rooms/${ownerUid}/shared/${roomId}`]: null
  };

  if (ownerOfRecord) {
    if (ownerOfRecord !== ownerUid) {
      throw new Error("Only the room owner can delete this room.");
    }
    updates[`rooms/${roomId}`] = null;

    const memberUids = new Set(Object.keys(members || {}));
    for (const team of Object.values(teams || {})) {
      for (const uid of Array.isArray(team?.memberUids) ? team.memberUids : []) {
        memberUids.add(uid);
      }
    }
    for (const uid of memberUids) {
      if (uid !== ownerUid && isSafeKey(uid)) {
        updates[`user_rooms/${uid}/shared/${roomId}`] = null;
      }
    }
  }

  await update(ref(rtdb), updates);
}

/**
 * Opens a room for a signed-in user, enrolling them as a viewer if they are not a member yet.
 *
 * Editor access is granted only by the owner (`shareRoomWithUser` / `updateMemberRole`); the
 * database rules reject self-assigned editor roles, so invite keys no longer elevate access
 * (`_secretKey` is accepted for backward compatibility and ignored). When the rules refuse
 * self-enrollment the readable room is still returned, read-only.
 */
export async function joinRoomViaInvite(
  roomId: string,
  user: UserProfile,
  _secretKey?: string
): Promise<FullRoomPayload> {
  const room = await fetchRoom(roomId);
  if (!room) {
    throw new Error(`Room "${roomId}" was not found or has been deleted by its owner.`);
  }

  const isOwner = room.meta.ownerUid === user.uid;
  if (!isOwner && !room.members[user.uid]) {
    const now = new Date().toISOString();
    const member = buildMember(user, "viewer", now);
    try {
      await update(ref(rtdb), {
        [`rooms/${roomId}/members/${user.uid}`]: member,
        [`user_rooms/${user.uid}/shared/${roomId}`]: buildSharedPointer(roomId, room.meta, "viewer", now)
      });
      room.members = { ...room.members, [user.uid]: member };
    } catch (err) {
      if (!isPermissionDeniedError(err)) throw err;
      console.warn(`[roomService] Room "${roomId}" does not accept self-enrollment; opening it read-only.`);
    }
  }

  return room;
}

/**
 * Fetches a full room payload by Room ID (accessible by any visitor with room link).
 * Read-only for everyone except the owner of a legacy room (see `withoutLegacySecret`).
 */
export async function getRoom(roomId: string): Promise<FullRoomPayload | null> {
  return fetchRoom(roomId);
}

/**
 * Renames a room (owner action) and returns the stored title. Room lists read titles from the
 * live room meta (`listenToUserRooms`), so only the meta title and the owner's own pointer are
 * written; members' pointers keep their old title only as an offline fallback.
 */
export async function renameRoom(
  roomId: string,
  title: string,
  user: Pick<UserProfile, "uid">
): Promise<string> {
  assertRoomId(roomId);
  const nextTitle = clip(typeof title === "string" ? title.trim() : "", MAX_TITLE_LENGTH);
  if (!nextTitle) {
    throw new Error("Room name cannot be empty.");
  }
  const [ownerUid, pointer] = await Promise.all([
    readValue<string>(`rooms/${roomId}/meta/ownerUid`),
    readValue<UserRoomPointer>(`user_rooms/${user.uid}/owned/${roomId}`)
  ]);
  if (!ownerUid) {
    throw new Error(ROOM_GONE_MESSAGE);
  }
  if (ownerUid !== user.uid) {
    throw new Error("Only the room owner can rename this room.");
  }

  const updates: Record<string, string> = { [`rooms/${roomId}/meta/title`]: nextTitle };
  // Writing a title alone into a missing pointer would create a partial record the rules reject.
  if (pointer) updates[`user_rooms/${user.uid}/owned/${roomId}/title`] = nextTitle;
  await update(ref(rtdb), updates);
  return nextTitle;
}

/** Bumps the revision and refreshes the derived meta leaves after a data commit. */
async function stampRoomMeta(roomId: string, data: JanttData): Promise<number> {
  await update(ref(rtdb, `rooms/${roomId}/meta`), {
    revision: increment(1),
    contentHash: calculatePlanHash(data),
    updatedAt: new Date().toISOString(),
    taskCount: data.tasks?.length || 0,
    noteCount: data.notes?.length || 0
  });
  return (await readValue<number>(`rooms/${roomId}/meta/revision`)) || 1;
}

const EDIT_DENIED_MESSAGE = "Permission denied: You do not have edit access to this room.";
const ROOM_GONE_MESSAGE = "This room no longer exists. It may have been deleted by its owner.";

/**
 * Fails fast, before any write, unless `uid` may edit the room: the owner is `meta.ownerUid`
 * and editors hold a member record with role "editor" (the same test the rules apply).
 * Reads are served from the live listener cache when the room is open.
 */
async function assertCanEdit(roomId: string, uid: string): Promise<void> {
  const [ownerUid, role] = await Promise.all([
    readValue<string>(`rooms/${roomId}/meta/ownerUid`),
    readValue<string>(`rooms/${roomId}/members/${uid}/role`)
  ]);
  if (!ownerUid) throw new Error(ROOM_GONE_MESSAGE);
  if (ownerUid !== uid && role !== "editor") throw new Error(EDIT_DENIED_MESSAGE);
}

async function readRevisionSafely(roomId: string): Promise<number> {
  try {
    return (await readValue<number>(`rooms/${roomId}/meta/revision`)) || 1;
  } catch {
    // The save itself succeeded; the revision only orders later saves, and 1 is its floor.
    return 1;
  }
}

/**
 * Saves room data with a compare-and-set transaction on `rooms/{id}/data` only, merging
 * concurrent remote edits 3-way against `baseData`, then stamps the meta leaves
 * (revision, contentHash, updatedAt, counts). Edit access is checked up front and enforced
 * by the database rules; either refusal surfaces as "Permission denied".
 *
 * Equality uses the full plan, not the lossy display hash, so edits to any field are kept.
 */
export async function saveRoomDataAtomic(
  roomId: string,
  updatedData: JanttData,
  user: UserProfile,
  baseData?: JanttData
): Promise<{ success: boolean; revision: number; data: JanttData }> {
  assertRoomId(roomId);
  const incoming = sanitizePlanForJson(updatedData);
  const base = baseData ? sanitizePlanForJson(baseData) : undefined;
  const clientId = user.username
    ? `@${user.username}`
    : user.displayUsername
    ? `@${user.displayUsername}`
    : "collaborator";

  let nextData: JanttData = incoming;
  let unchanged = false;

  /** Transaction update: returns the encoded plan to write, or undefined when nothing changes. */
  const mergeIntoRemote = (raw: unknown) => {
    unchanged = false;
    if (raw === null || raw === undefined) {
      // Nothing cached yet: propose the local copy. The server reruns this function with
      // its real value on a mismatch, and the rules reject writes to deleted rooms.
      nextData = incoming;
      return encodePlanForRtdb(incoming);
    }

    const remote = sanitizePlanForJson(decodePlanFromRtdb(raw as JanttData));
    if (isSamePlanData(remote, incoming) || (base && isSamePlanData(incoming, base))) {
      // Already saved, or no local edits since the base: keep the server copy as is.
      unchanged = true;
      nextData = remote;
      return undefined;
    }

    nextData =
      !base || isSamePlanData(remote, base)
        ? incoming
        : sanitizePlanForJson(reconcilePlans(base, incoming, remote, { clientId }).mergedData);
    return encodePlanForRtdb(nextData);
  };

  const commit = assertCanEdit(roomId, user.uid)
    .then(() =>
      runTransaction(ref(rtdb, `rooms/${roomId}/data`), mergeIntoRemote, { applyLocally: false })
    )
    .then(async (result) => {
      if (unchanged) {
        return { success: true, revision: await readRevisionSafely(roomId), data: nextData };
      }
      if (!result.committed) {
        throw new Error("Failed to save room data atomically. The room may have been deleted or modified.");
      }

      const committed = result.snapshot.val();
      const data = committed ? decodePlanFromRtdb(committed as JanttData) : nextData;
      let revision = 1;
      try {
        revision = await stampRoomMeta(roomId, data);
      } catch (err) {
        // The plan itself is saved; stale meta only affects list previews.
        console.warn("[roomService] Saved room data but could not update room metadata:", err);
        revision = await readRevisionSafely(roomId);
      }
      return { success: true, revision, data };
    })
    .catch(async (err: unknown) => {
      if (isPermissionDeniedError(err)) {
        // When the follow-up read fails too, report the denial rather than guess a deletion.
        const stillExists = await readValue<string>(`rooms/${roomId}/meta/ownerUid`)
          .then(Boolean)
          .catch(() => true);
        throw new Error(stillExists ? EDIT_DENIED_MESSAGE : ROOM_GONE_MESSAGE);
      }
      if (err instanceof Error && err.message === "maxretry") {
        throw new Error("The room is busy with other edits right now. Please retry in a moment.");
      }
      throw err;
    });

  return withTimeout(
    commit,
    SAVE_TIMEOUT_MS,
    "Saving to the cloud room is taking too long. Check your connection; your edits are kept on this device."
  );
}

function toPointerList(map: unknown, kind: "owned" | "shared"): UserRoomPointer[] {
  if (!map || typeof map !== "object") return [];
  const list: UserRoomPointer[] = [];
  for (const [roomId, raw] of Object.entries(map as Record<string, unknown>)) {
    // The key is the identity; pointer bodies are only display hints. Ids that could not be
    // opened (every room service call validates them) are not listed.
    if (!isValidRoomId(roomId) || !raw || typeof raw !== "object") continue;
    const pointer = raw as Partial<UserRoomPointer>;
    list.push({
      ...pointer,
      roomId,
      title: typeof pointer.title === "string" && pointer.title.trim() ? pointer.title : "Untitled room",
      ownerUid: typeof pointer.ownerUid === "string" ? pointer.ownerUid : "",
      ownerUsername: typeof pointer.ownerUsername === "string" ? pointer.ownerUsername : "",
      role: kind === "owned" ? "owner" : pointer.role === "editor" ? "editor" : "viewer",
      createdAt: typeof pointer.createdAt === "string" ? pointer.createdAt : "",
      updatedAt: typeof pointer.updatedAt === "string" ? pointer.updatedAt : ""
    });
  }
  return list;
}

/**
 * Listens to a user's owned and shared room lists in real time.
 *
 * Pointers are enriched with each room's live meta (title, updatedAt, counts), so lists stay
 * current after saves and renames; pointers whose room no longer exists are hidden.
 */
export function listenToUserRooms(
  uid: string,
  callback: (owned: UserRoomPointer[], shared: UserRoomPointer[]) => void,
  onError: (error: Error) => void = warnListenerError
): Unsubscribe {
  const metaListeners = new Map<string, Unsubscribe>();
  const metas = new Map<string, RoomMetadata | null>();
  let owned: UserRoomPointer[] = [];
  let shared: UserRoomPointer[] = [];
  let active = true;
  let scheduled = false;

  const enrich = (list: UserRoomPointer[]): UserRoomPointer[] => {
    const result: UserRoomPointer[] = [];
    for (const pointer of list) {
      const meta = metas.get(pointer.roomId);
      if (meta === null) continue; // room deleted
      result.push(
        meta
          ? {
              ...pointer,
              title: meta.title || pointer.title,
              ownerUsername: meta.ownerUsername || pointer.ownerUsername,
              updatedAt: meta.updatedAt || pointer.updatedAt,
              taskCount: meta.taskCount ?? pointer.taskCount,
              noteCount: meta.noteCount ?? pointer.noteCount
            }
          : pointer
      );
    }
    return result.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  };

  const flush = () => {
    scheduled = false;
    if (active) callback(enrich(owned), enrich(shared));
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  };

  const unsubscribePointers = onValue(
    ref(rtdb, `user_rooms/${uid}`),
    (snapshot) => {
      const val = (snapshot.val() || {}) as { owned?: unknown; shared?: unknown };
      owned = toPointerList(val.owned, "owned");
      shared = toPointerList(val.shared, "shared");

      const wanted = new Set([...owned, ...shared].map((p) => p.roomId));
      for (const [roomId, stop] of metaListeners) {
        if (!wanted.has(roomId)) {
          stop();
          metaListeners.delete(roomId);
          metas.delete(roomId);
        }
      }
      for (const roomId of wanted) {
        if (metaListeners.has(roomId)) continue;
        metaListeners.set(
          roomId,
          onValue(
            ref(rtdb, `rooms/${roomId}/meta`),
            (metaSnap) => {
              metas.set(roomId, metaSnap.exists() ? (metaSnap.val() as RoomMetadata) : null);
              schedule();
            },
            // Unreadable meta (e.g. access revoked): keep showing the stored pointer.
            () => {}
          )
        );
      }
      schedule();
    },
    onError
  );

  return () => {
    active = false;
    unsubscribePointers();
    for (const stop of metaListeners.values()) stop();
    metaListeners.clear();
  };
}

/**
 * Listens to active room changes (metadata, members, and data) via real-time WebSockets.
 *
 * Subscribes to `meta`, `members` and `data` separately, so presence churn never re-sends or
 * re-decodes the plan. Emits once all three are loaded; `null` means the room was deleted.
 * The emitted `meta.contentHash` always describes the emitted `data`.
 */
export function listenToRoom(
  roomId: string,
  callback: (room: FullRoomPayload | null) => void,
  onError: (error: Error) => void = warnListenerError
): Unsubscribe {
  assertRoomId(roomId);
  let meta: RoomMetadata | null | undefined;
  let members: Record<string, RoomMember> | undefined;
  let data: JanttData | null | undefined;
  let dataHash = "";
  let active = true;
  let scheduled = false;
  let reportedMissing = false;

  const flush = () => {
    scheduled = false;
    if (!active || meta === undefined || members === undefined || data === undefined) return;
    if (meta === null) {
      if (!reportedMissing) {
        reportedMissing = true;
        callback(null);
      }
      return;
    }
    // A live room always has data and at least its owner as member; anything else is the
    // transient state of a deletion in progress, which resolves to `meta === null`.
    if (!data || Object.keys(members).length === 0) return;
    reportedMissing = false;
    callback({ meta: { ...meta, contentHash: dataHash }, members, data });
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  };

  const unsubscribers = [
    onValue(
      ref(rtdb, `rooms/${roomId}/meta`),
      (snap) => {
        meta = snap.exists() ? withoutLegacySecret(roomId, snap.val() as RoomMetadata) : null;
        schedule();
      },
      onError
    ),
    onValue(
      ref(rtdb, `rooms/${roomId}/members`),
      (snap) => {
        members = (snap.val() as Record<string, RoomMember> | null) || {};
        schedule();
      },
      onError
    ),
    onValue(
      ref(rtdb, `rooms/${roomId}/data`),
      (snap) => {
        data = snap.exists() ? decodePlanFromRtdb(snap.val() as JanttData) : null;
        dataHash = data ? calculatePlanHash(data) : "";
        schedule();
      },
      onError
    )
  ];

  return () => {
    active = false;
    for (const stop of unsubscribers) stop();
  };
}
