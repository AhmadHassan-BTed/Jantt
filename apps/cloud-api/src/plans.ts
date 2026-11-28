import {
  DEFAULT_GAP_DAYS,
  auditScheduleIntegrity,
  calculateCriticalPath,
  calculatePlanHash,
  decodePlanFromRtdb,
  diffDays,
  encodePlanForRtdb,
  exportToCsv,
  generateRoomId,
  hasDependencyCycle,
  isValidISODate,
  resolveSchedule,
  sanitizePlanForJson,
  validate,
  type CalendarPreset,
  type JanttData,
  type Task,
  type ValidationError,
  type WorkingCalendar
} from "@jantt/core";
import { isSafeRtdbKey } from "./auth";
import type { RtdbClient } from "./rtdb";
import {
  HttpError,
  type PublicProfile,
  type RoomMember,
  type RoomMemberRole,
  type RoomMetadata,
  type RoomTeam,
  type StoredUserProfile,
  type UserRoomPointer
} from "./types";

const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const TRUSTED_AVATAR_PREFIX = "https://avatars.githubusercontent.com/";
const MAX_TITLE_LENGTH = 200;
const MAX_NAME_LENGTH = 256;
const MAX_CAS_RETRIES = 4;

export function isValidRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

export function assertRoomId(roomId: string): string {
  const normalized = typeof roomId === "string" ? roomId.trim().toLowerCase() : "";
  if (!isValidRoomId(normalized)) {
    throw new HttpError(400, "INVALID_ROOM_ID", "Invalid cloud room ID.");
  }
  return normalized;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function trustedAvatar(url: unknown): string | undefined {
  return typeof url === "string" && url.startsWith(TRUSTED_AVATAR_PREFIX) && url.length <= 1024 ? url : undefined;
}

function stripLegacySecret(meta: RoomMetadata): Omit<RoomMetadata, "secretKey"> {
  const { secretKey: _ignored, ...clean } = meta;
  return clean;
}

function liveTasksOf(plan: JanttData): Task[] {
  return Array.isArray(plan.tasks)
    ? plan.tasks.filter((t): t is Task => Boolean(t) && typeof t === "object" && !t._deleted)
    : [];
}

function tombstonesOf(plan: JanttData): Task[] {
  return Array.isArray(plan.tasks)
    ? plan.tasks.filter((t): t is Task => Boolean(t) && typeof t === "object" && Boolean(t._deleted))
    : [];
}

function stripDeletedItems(plan: JanttData): JanttData {
  const next: JanttData = {
    ...plan,
    tasks: liveTasksOf(plan)
  };
  if (Array.isArray(plan.notes)) {
    next.notes = plan.notes.filter((n) => Boolean(n) && typeof n === "object" && !n._deleted);
  }
  return next;
}

function gapDaysOf(plan: JanttData): number {
  const gap = plan.meta?.defaultGapDays;
  return typeof gap === "number" && Number.isFinite(gap) ? gap : DEFAULT_GAP_DAYS;
}

function workingCalendarOf(plan: JanttData): WorkingCalendar | CalendarPreset | undefined {
  const meta = plan.meta && typeof plan.meta === "object" ? plan.meta : undefined;
  const ref: unknown = meta?.calendar;
  const useWorkingDays = typeof meta?.useWorkingDays === "boolean" ? meta.useWorkingDays : Boolean(ref);
  if (!useWorkingDays) return undefined;
  if (typeof ref === "string") {
    const calendars: unknown = plan.calendars;
    const named =
      calendars && typeof calendars === "object" && Object.hasOwn(calendars, ref)
        ? (calendars as Record<string, unknown>)[ref]
        : undefined;
    return named && typeof named === "object" ? (named as WorkingCalendar) : (ref as CalendarPreset);
  }
  return ref && typeof ref === "object" && !Array.isArray(ref) ? (ref as WorkingCalendar) : "standard";
}

function targetDateOf(rawArg: unknown, plan: JanttData): string | undefined {
  const fromArgs = rawArg !== undefined && rawArg !== null && rawArg !== "";
  const raw = fromArgs ? rawArg : plan.meta?.targetDate;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || !isValidISODate(raw.trim())) {
    throw new HttpError(400, "INVALID_DATE", `targetDate must be a valid YYYY-MM-DD date (got ${JSON.stringify(raw)}).`);
  }
  return raw.trim();
}

function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((e) => `[${e.code}] ${e.path}: ${e.message}${e.suggestion ? ` Fix: ${e.suggestion}` : ""}`)
    .join("; ");
}

function movedTaskIds(before: Task[], after: Task[], excludeId: string): string[] {
  const previous = new Map(before.map((t) => [t.id, t]));
  return after
    .filter((t) => {
      const old = previous.get(t.id);
      return t.id !== excludeId && old !== undefined && (old.start !== t.start || old.end !== t.end);
    })
    .map((t) => t.id);
}

function latestEnd(tasks: Task[]): string | null {
  let latest: string | null = null;
  for (const t of tasks) {
    if (isValidISODate(t.end) && (latest === null || t.end > latest)) latest = t.end;
  }
  return latest;
}

function safeDiffDays(from: unknown, to: unknown): number {
  return typeof from === "string" && typeof to === "string" && isValidISODate(from) && isValidISODate(to)
    ? diffDays(from, to)
    : 0;
}

function removeDepReference(dependsOn: Task["dependsOn"], removedTaskId: string): Task["dependsOn"] {
  if (!dependsOn) return dependsOn;
  const matchesId = (item: unknown): boolean => {
    if (typeof item === "string") {
      const id = item.split(":")[0]?.trim();
      return id === removedTaskId;
    }
    if (item && typeof item === "object" && "id" in item) {
      return (item as { id?: unknown }).id === removedTaskId;
    }
    return false;
  };
  if (Array.isArray(dependsOn)) {
    const filtered = dependsOn.filter((item) => !matchesId(item));
    return filtered.length > 0 ? filtered : undefined;
  }
  return matchesId(dependsOn) ? undefined : dependsOn;
}

async function resolveUserHandle(uid: string, rtdb: RtdbClient): Promise<{
  username: string;
  displayName: string;
  photoURL?: string;
}> {
  const [user, pub] = await Promise.all([
    rtdb.get<StoredUserProfile>(`users/${uid}`),
    rtdb.get<PublicProfile>(`public_profiles/${uid}`)
  ]);
  const username = user?.username || pub?.username || uid;
  const displayName = clip(user?.displayName || pub?.displayName || user?.displayUsername || username, MAX_NAME_LENGTH);
  const photoURL = trustedAvatar(user?.photoURL || pub?.photoURL);
  return { username, displayName, photoURL };
}

function resolveMemberRole(
  uid: string,
  meta: RoomMetadata,
  members: Record<string, RoomMember> | null
): RoomMemberRole | null {
  if (meta.ownerUid === uid) return "owner";
  const role = members?.[uid]?.role;
  if (role === "editor" || role === "viewer") return role;
  return null;
}

async function loadAuthorizedRoomMeta(
  uid: string,
  roomId: string,
  rtdb: RtdbClient,
  requireEdit: boolean
): Promise<{ meta: Omit<RoomMetadata, "secretKey">; role: RoomMemberRole; members: Record<string, RoomMember> }> {
  const [meta, members] = await Promise.all([
    rtdb.get<RoomMetadata>(`rooms/${roomId}/meta`),
    rtdb.get<Record<string, RoomMember>>(`rooms/${roomId}/members`)
  ]);
  if (!meta) {
    throw new HttpError(404, "ROOM_NOT_FOUND", `Cloud plan '${roomId}' was not found.`);
  }
  const role = resolveMemberRole(uid, meta, members);
  if (!role) {
    throw new HttpError(403, "FORBIDDEN", `You do not have access to cloud plan '${roomId}'.`);
  }
  if (requireEdit && role !== "owner" && role !== "editor") {
    throw new HttpError(403, "READ_ONLY", `Your role on cloud plan '${roomId}' is 'viewer' (read-only).`);
  }
  return { meta: stripLegacySecret(meta), role, members: members || {} };
}

export interface CloudPlanSummary {
  roomId: string;
  title: string;
  role: RoomMemberRole;
  canEdit: boolean;
  canDelete: boolean;
  ownerUid: string;
  ownerUsername: string;
  revision: number;
  taskCount: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listAccountPlans(uid: string, rtdb: RtdbClient): Promise<CloudPlanSummary[]> {
  const index = await rtdb.get<{
    owned?: Record<string, UserRoomPointer>;
    shared?: Record<string, UserRoomPointer>;
  }>(`user_rooms/${uid}`);

  const candidates = new Map<string, { pointer: UserRoomPointer; fallbackRole: RoomMemberRole }>();
  for (const [roomId, pointer] of Object.entries(index?.owned || {})) {
    if (isValidRoomId(roomId) && pointer && typeof pointer === "object") {
      candidates.set(roomId, { pointer, fallbackRole: "owner" });
    }
  }
  for (const [roomId, pointer] of Object.entries(index?.shared || {})) {
    if (isValidRoomId(roomId) && pointer && typeof pointer === "object" && !candidates.has(roomId)) {
      candidates.set(roomId, {
        pointer,
        fallbackRole: pointer.role === "editor" ? "editor" : "viewer"
      });
    }
  }

  const results = await Promise.all(
    Array.from(candidates.entries()).map(async ([roomId, { pointer, fallbackRole }]) => {
      const [meta, member] = await Promise.all([
        rtdb.get<RoomMetadata>(`rooms/${roomId}/meta`),
        fallbackRole === "owner" ? Promise.resolve(null) : rtdb.get<RoomMember>(`rooms/${roomId}/members/${uid}`)
      ]);
      if (!meta) return null;
      const role: RoomMemberRole =
        meta.ownerUid === uid
          ? "owner"
          : member?.role === "editor"
            ? "editor"
            : member?.role === "viewer"
              ? "viewer"
              : fallbackRole;
      if (meta.ownerUid !== uid && !member) return null;

      return {
        roomId,
        title: meta.title || pointer.title || "Untitled room",
        role,
        canEdit: role === "owner" || role === "editor",
        canDelete: role === "owner",
        ownerUid: meta.ownerUid,
        ownerUsername: meta.ownerUsername || pointer.ownerUsername || "",
        revision: typeof meta.revision === "number" ? meta.revision : 1,
        taskCount: typeof meta.taskCount === "number" ? meta.taskCount : pointer.taskCount ?? 0,
        noteCount: typeof meta.noteCount === "number" ? meta.noteCount : pointer.noteCount ?? 0,
        createdAt: meta.createdAt || pointer.createdAt || "",
        updatedAt: meta.updatedAt || pointer.updatedAt || ""
      } satisfies CloudPlanSummary;
    })
  );

  return results
    .filter((item): item is CloudPlanSummary => item !== null)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getAccountPlan(
  uid: string,
  rawRoomId: string,
  rtdb: RtdbClient,
  options: { includeDeleted?: boolean } = {}
) {
  const roomId = assertRoomId(rawRoomId);
  const { meta, role } = await loadAuthorizedRoomMeta(uid, roomId, rtdb, false);
  const rawData = await rtdb.get<JanttData>(`rooms/${roomId}/data`);
  const decoded: JanttData = rawData ? sanitizePlanForJson(decodePlanFromRtdb(rawData)) : { tasks: [] };
  const plan = options.includeDeleted ? decoded : stripDeletedItems(decoded);

  return {
    roomId,
    role,
    canEdit: role === "owner" || role === "editor",
    canDelete: role === "owner",
    meta,
    plan
  };
}

export async function createAccountPlan(
  uid: string,
  input: { title?: unknown; plan?: unknown },
  rtdb: RtdbClient,
  nowMs: number = Date.now()
) {
  const user = await resolveUserHandle(uid, rtdb);
  const rawPlan = input.plan;
  let initialPlan: JanttData;

  if (rawPlan === undefined || rawPlan === null) {
    const titleStr = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "New Cloud Plan";
    initialPlan = {
      meta: { title: clip(titleStr, MAX_TITLE_LENGTH) },
      categories: { general: { label: "General", color: "#38BDF8" } },
      tasks: []
    };
  } else {
    if (typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
      throw new HttpError(400, "INVALID_PLAN", "Field 'plan' must be a Jantt plan JSON object.");
    }
    initialPlan = rawPlan as JanttData;
  }

  const sanitized = sanitizePlanForJson(initialPlan);
  const validation = validate(sanitized);
  if (!validation.valid) {
    throw new HttpError(
      400,
      "PLAN_VALIDATION_FAILED",
      `Plan validation failed: ${formatValidationErrors(validation.errors)}`,
      validation.errors
    );
  }

  const roomId = generateRoomId();
  const now = new Date(nowMs).toISOString();
  const title = clip(
    (typeof input.title === "string" && input.title.trim()) || sanitized.meta?.title?.trim() || "New Cloud Plan",
    MAX_TITLE_LENGTH
  );
  const liveTasks = liveTasksOf(sanitized);
  const liveNotes = Array.isArray(sanitized.notes) ? sanitized.notes.filter((n) => n && !n._deleted) : [];

  const meta: RoomMetadata = {
    roomId,
    title,
    ownerUid: uid,
    ownerUsername: user.username,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    contentHash: calculatePlanHash(sanitized),
    taskCount: liveTasks.length,
    noteCount: liveNotes.length,
    theme: "noir"
  };

  const ownerMember: RoomMember = {
    uid,
    username: user.username,
    displayName: user.displayName,
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    role: "owner",
    joinedAt: now
  };

  const ownerPointer: UserRoomPointer = {
    roomId,
    title,
    ownerUid: uid,
    ownerUsername: user.username,
    role: "owner",
    createdAt: now,
    updatedAt: now,
    taskCount: liveTasks.length,
    noteCount: liveNotes.length
  };

  await rtdb.patch("", {
    [`rooms/${roomId}/meta`]: meta,
    [`rooms/${roomId}/members/${uid}`]: ownerMember,
    [`rooms/${roomId}/data`]: encodePlanForRtdb(sanitized),
    [`user_rooms/${uid}/owned/${roomId}`]: ownerPointer
  });

  return {
    roomId,
    role: "owner" as const,
    meta,
    plan: stripDeletedItems(sanitized)
  };
}

interface CasMutationOutcome<TResult> {
  nextPlan: JanttData;
  nextTitle?: string;
  result: TResult;
}

async function mutatePlanWithCas<TResult>(
  uid: string,
  rawRoomId: string,
  rtdb: RtdbClient,
  mutator: (ctx: {
    remote: JanttData;
    meta: Omit<RoomMetadata, "secretKey">;
    role: RoomMemberRole;
    mention: string;
    now: string;
  }) => CasMutationOutcome<TResult>,
  nowMs: number = Date.now()
): Promise<{ revision: number; meta: Omit<RoomMetadata, "secretKey">; plan: JanttData; result: TResult }> {
  const roomId = assertRoomId(rawRoomId);
  const [{ meta, role }, user] = await Promise.all([
    loadAuthorizedRoomMeta(uid, roomId, rtdb, true),
    resolveUserHandle(uid, rtdb)
  ]);
  const mention = `@${user.username}`;
  const now = new Date(nowMs).toISOString();

  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    const { value: rawRemote, etag } = await rtdb.getWithEtag<JanttData>(`rooms/${roomId}/data`);
    const remote: JanttData = rawRemote ? sanitizePlanForJson(decodePlanFromRtdb(rawRemote)) : { tasks: [] };

    const outcome = mutator({ remote, meta, role, mention, now });
    const sanitizedNext = sanitizePlanForJson(outcome.nextPlan);
    const validation = validate(sanitizedNext);
    if (!validation.valid) {
      throw new HttpError(
        400,
        "PLAN_VALIDATION_FAILED",
        `Plan update is invalid: ${formatValidationErrors(validation.errors)}`,
        validation.errors
      );
    }

    const encoded = encodePlanForRtdb(sanitizedNext);
    const putResult = await rtdb.put(`rooms/${roomId}/data`, encoded, etag);
    if (!putResult.ok && putResult.status === 412) {
      continue;
    }

    const freshMeta = (await rtdb.get<RoomMetadata>(`rooms/${roomId}/meta`)) || meta;
    const nextRevision = (typeof freshMeta.revision === "number" ? freshMeta.revision : 1) + 1;
    const nextTitle = outcome.nextTitle ? clip(outcome.nextTitle.trim(), MAX_TITLE_LENGTH) : freshMeta.title;
    const liveTaskCount = liveTasksOf(sanitizedNext).length;
    const liveNoteCount = Array.isArray(sanitizedNext.notes)
      ? sanitizedNext.notes.filter((n) => n && !n._deleted).length
      : 0;
    const contentHash = calculatePlanHash(sanitizedNext);

    const metaPatch: Record<string, unknown> = {
      revision: nextRevision,
      contentHash,
      updatedAt: now,
      taskCount: liveTaskCount,
      noteCount: liveNoteCount
    };
    if (nextTitle && nextTitle !== freshMeta.title) {
      metaPatch.title = nextTitle;
    }
    await rtdb.patch(`rooms/${roomId}/meta`, metaPatch);

    const ownerPointer = await rtdb.get<UserRoomPointer>(`user_rooms/${freshMeta.ownerUid}/owned/${roomId}`);
    if (ownerPointer) {
      await rtdb.patch(`user_rooms/${freshMeta.ownerUid}/owned/${roomId}`, {
        title: nextTitle,
        updatedAt: now,
        taskCount: liveTaskCount,
        noteCount: liveNoteCount
      });
    }

    const updatedMeta: Omit<RoomMetadata, "secretKey"> = {
      ...stripLegacySecret(freshMeta),
      title: nextTitle,
      revision: nextRevision,
      contentHash,
      updatedAt: now,
      taskCount: liveTaskCount,
      noteCount: liveNoteCount
    };

    return {
      revision: nextRevision,
      meta: updatedMeta,
      plan: stripDeletedItems(sanitizedNext),
      result: outcome.result
    };
  }

  throw new HttpError(409, "CONCURRENT_EDIT_CONFLICT", "Cloud plan was modified concurrently. Please retry.");
}

export async function replaceAccountPlan(
  uid: string,
  rawRoomId: string,
  input: { plan?: unknown; title?: unknown; expectedRevision?: unknown },
  rtdb: RtdbClient,
  nowMs: number = Date.now()
) {
  if (!input.plan || typeof input.plan !== "object" || Array.isArray(input.plan)) {
    throw new HttpError(400, "INVALID_PLAN", "Body must include a 'plan' Jantt JSON object.");
  }
  const incoming = input.plan as JanttData;

  const committed = await mutatePlanWithCas(
    uid,
    rawRoomId,
    rtdb,
    ({ remote, meta }) => {
      if (typeof input.expectedRevision === "number" && meta.revision !== input.expectedRevision) {
        throw new HttpError(
          409,
          "REVISION_MISMATCH",
          `Expected revision ${input.expectedRevision}, but current cloud revision is ${meta.revision}.`
        );
      }
      const incomingIds = new Set(Array.isArray(incoming.tasks) ? incoming.tasks.map((t) => t?.id).filter(Boolean) : []);
      const preservedTombstones = tombstonesOf(remote).filter((t) => !incomingIds.has(t.id));
      const nextPlan: JanttData = {
        ...incoming,
        tasks: [...(Array.isArray(incoming.tasks) ? incoming.tasks : []), ...preservedTombstones]
      };
      const nextTitle =
        typeof input.title === "string" && input.title.trim()
          ? input.title.trim()
          : incoming.meta?.title?.trim() || undefined;
      return { nextPlan, nextTitle, result: null };
    },
    nowMs
  );

  return {
    roomId: assertRoomId(rawRoomId),
    revision: committed.revision,
    meta: committed.meta,
    plan: committed.plan
  };
}

export async function patchAccountPlan(
  uid: string,
  rawRoomId: string,
  patch: Record<string, unknown>,
  rtdb: RtdbClient,
  nowMs: number = Date.now()
) {
  const committed = await mutatePlanWithCas(
    uid,
    rawRoomId,
    rtdb,
    ({ remote }) => {
      const nextPlan: JanttData = { ...remote };
      let nextTitle: string | undefined;

      if (typeof patch.title === "string" && patch.title.trim()) {
        nextTitle = patch.title.trim();
        nextPlan.meta = { ...(nextPlan.meta || {}), title: clip(nextTitle, MAX_TITLE_LENGTH) };
      }
      if (patch.meta && typeof patch.meta === "object" && !Array.isArray(patch.meta)) {
        nextPlan.meta = { ...(nextPlan.meta || {}), ...(patch.meta as Record<string, unknown>) };
        if (typeof nextPlan.meta.title === "string" && nextPlan.meta.title.trim() && !nextTitle) {
          nextTitle = nextPlan.meta.title.trim();
        }
      }
      if (patch.categories && typeof patch.categories === "object" && !Array.isArray(patch.categories)) {
        nextPlan.categories = patch.categories as JanttData["categories"];
      }
      if (Array.isArray(patch.people)) {
        nextPlan.people = patch.people as JanttData["people"];
      }
      if (Array.isArray(patch.teams)) {
        nextPlan.teams = patch.teams as JanttData["teams"];
      }
      if (Array.isArray(patch.notes)) {
        nextPlan.notes = patch.notes as JanttData["notes"];
      }
      if (patch.calendars && typeof patch.calendars === "object" && !Array.isArray(patch.calendars)) {
        nextPlan.calendars = patch.calendars as JanttData["calendars"];
      }
      return { nextPlan, nextTitle, result: null };
    },
    nowMs
  );

  return {
    roomId: assertRoomId(rawRoomId),
    revision: committed.revision,
    meta: committed.meta,
    plan: committed.plan
  };
}

export async function deleteAccountPlan(uid: string, rawRoomId: string, rtdb: RtdbClient) {
  const roomId = assertRoomId(rawRoomId);
  const [meta, members, teams] = await Promise.all([
    rtdb.get<RoomMetadata>(`rooms/${roomId}/meta`),
    rtdb.get<Record<string, RoomMember>>(`rooms/${roomId}/members`),
    rtdb.get<Record<string, RoomTeam>>(`rooms/${roomId}/teams`)
  ]);

  if (!meta) {
    throw new HttpError(404, "ROOM_NOT_FOUND", `Cloud plan '${roomId}' was not found.`);
  }
  if (meta.ownerUid !== uid) {
    throw new HttpError(403, "OWNER_REQUIRED", "Only the room owner can delete this cloud plan.");
  }

  const updates: Record<string, null> = {
    [`rooms/${roomId}`]: null,
    [`user_rooms/${uid}/owned/${roomId}`]: null,
    [`user_rooms/${uid}/shared/${roomId}`]: null
  };

  const memberUids = new Set(Object.keys(members || {}));
  for (const team of Object.values(teams || {})) {
    for (const memberUid of Array.isArray(team?.memberUids) ? team.memberUids : []) {
      memberUids.add(memberUid);
    }
  }
  for (const memberUid of memberUids) {
    if (memberUid !== uid && isSafeRtdbKey(memberUid)) {
      updates[`user_rooms/${memberUid}/shared/${roomId}`] = null;
    }
  }

  await rtdb.patch("", updates);
  return { deleted: true, roomId };
}

export async function listPlanTasks(
  uid: string,
  rawRoomId: string,
  filters: { category?: string; assignee?: string; status?: string },
  rtdb: RtdbClient
) {
  const { roomId, role, meta, plan } = await getAccountPlan(uid, rawRoomId, rtdb);
  let tasks = liveTasksOf(plan);

  if (filters.category) {
    const target = filters.category.trim().toLowerCase();
    tasks = tasks.filter((t) => String(t.category || "").toLowerCase() === target);
  }
  if (filters.assignee) {
    const target = filters.assignee.trim().toLowerCase().replace(/^@/, "");
    tasks = tasks.filter((t) => String(t.assignee || "").toLowerCase().replace(/^@/, "") === target);
  }
  if (filters.status) {
    const target = filters.status.trim().toLowerCase();
    tasks = tasks.filter((t) => String(t.status || "").toLowerCase() === target);
  }

  return {
    roomId,
    role,
    revision: meta.revision,
    total: tasks.length,
    tasks
  };
}

export async function addPlanTask(
  uid: string,
  rawRoomId: string,
  taskInput: unknown,
  rtdb: RtdbClient,
  options: { resolveCascade?: boolean } = {},
  nowMs: number = Date.now()
) {
  if (!taskInput || typeof taskInput !== "object" || Array.isArray(taskInput)) {
    throw new HttpError(400, "INVALID_TASK", "Task payload must be a JSON object with id, category, start, and end.");
  }
  const rawTask = taskInput as Task;
  if (typeof rawTask.id !== "string" || !rawTask.id.trim()) {
    throw new HttpError(400, "INVALID_TASK", "task.id must be a non-empty string.");
  }

  const committed = await mutatePlanWithCas(
    uid,
    rawRoomId,
    rtdb,
    ({ remote, mention, now }) => {
      const allTasks = Array.isArray(remote.tasks) ? remote.tasks : [];
      const existing = allTasks.find((t) => t && t.id === rawTask.id);
      if (existing) {
        throw new HttpError(
          409,
          "TASK_ALREADY_EXISTS",
          existing._deleted
            ? `Task id '${rawTask.id}' belongs to a deleted task tombstone kept for sync. Choose a new unique id.`
            : `Task id '${rawTask.id}' already exists in this plan. Use PATCH to update it.`
        );
      }

      const newTask: Task = {
        ...rawTask,
        id: rawTask.id.trim(),
        updatedAt: now,
        updatedBy: mention
      };

      const activeBefore = liveTasksOf(remote);
      const tombstones = tombstonesOf(remote);
      const candidateActive = [...activeBefore, newTask];
      const errors = validate({ ...remote, tasks: candidateActive }).errors.filter((e) => e.taskId === newTask.id);
      if (
        !errors.some((e) => e.code === "CIRCULAR_DEPENDENCY") &&
        hasDependencyCycle(candidateActive) &&
        !hasDependencyCycle(activeBefore)
      ) {
        errors.push({
          path: "task.dependsOn",
          taskId: newTask.id,
          code: "CIRCULAR_DEPENDENCY",
          message: `Adding task '${newTask.id}' would create a circular dependency.`,
          suggestion: "Remove the dependsOn link that cycles back to this task."
        });
      }
      if (errors.length > 0) {
        throw new HttpError(
          400,
          "INVALID_TASK",
          `Task '${newTask.id}' is invalid: ${formatValidationErrors(errors)}`,
          errors
        );
      }

      const resolvedActive =
        options.resolveCascade === false ? candidateActive : resolveSchedule(candidateActive, gapDaysOf(remote));
      const placed = resolvedActive.find((t) => t.id === newTask.id) ?? newTask;

      return {
        nextPlan: { ...remote, tasks: [...resolvedActive, ...tombstones] },
        result: {
          task: placed,
          adjustedByDependencies: placed.start !== newTask.start || placed.end !== newTask.end,
          movedTaskIds: movedTaskIds(activeBefore, resolvedActive, newTask.id)
        }
      };
    },
    nowMs
  );

  return {
    roomId: assertRoomId(rawRoomId),
    revision: committed.revision,
    ...committed.result
  };
}

const PATCHABLE_TASK_FIELDS = [
  "label",
  "name",
  "category",
  "start",
  "end",
  "progress",
  "dependsOn",
  "assignee",
  "status",
  "priority",
  "milestone",
  "locked",
  "estimatedCost",
  "actualCost",
  "color",
  "notes",
  "description",
  "baseline",
  "fields"
] as const;

export async function updatePlanTask(
  uid: string,
  rawRoomId: string,
  taskId: string,
  patch: Record<string, unknown>,
  rtdb: RtdbClient,
  options: { resolveCascade?: boolean } = {},
  nowMs: number = Date.now()
) {
  const cleanId = taskId.trim();
  if (!cleanId) {
    throw new HttpError(400, "INVALID_TASK_ID", "Missing taskId.");
  }

  const committed = await mutatePlanWithCas(
    uid,
    rawRoomId,
    rtdb,
    ({ remote, mention, now }) => {
      const activeBefore = liveTasksOf(remote);
      const tombstones = tombstonesOf(remote);
      const target = activeBefore.find((t) => t.id === cleanId);
      if (!target) {
        throw new HttpError(404, "TASK_NOT_FOUND", `No live task with id '${cleanId}' exists in this plan.`);
      }

      const updatedTask: Record<string, unknown> = { ...target };
      let scheduleChanged = false;
      for (const field of PATCHABLE_TASK_FIELDS) {
        if (field in patch) {
          if (patch[field] === null) {
            delete updatedTask[field];
          } else {
            updatedTask[field] = patch[field];
          }
          if (field === "start" || field === "end" || field === "dependsOn") {
            scheduleChanged = true;
          }
        }
      }
      updatedTask.updatedAt = now;
      updatedTask.updatedBy = mention;

      const candidateActive = activeBefore.map((t) => (t.id === cleanId ? (updatedTask as unknown as Task) : t));
      const errors = validate({ ...remote, tasks: candidateActive }).errors.filter((e) => e.taskId === cleanId);
      if (
        !errors.some((e) => e.code === "CIRCULAR_DEPENDENCY") &&
        hasDependencyCycle(candidateActive) &&
        !hasDependencyCycle(activeBefore)
      ) {
        errors.push({
          path: "task.dependsOn",
          taskId: cleanId,
          code: "CIRCULAR_DEPENDENCY",
          message: `Updating task '${cleanId}' creates a circular dependency.`,
          suggestion: "Remove the cyclic dependsOn reference."
        });
      }
      if (errors.length > 0) {
        throw new HttpError(
          400,
          "INVALID_TASK",
          `Task update for '${cleanId}' is invalid: ${formatValidationErrors(errors)}`,
          errors
        );
      }

      const shouldResolve = options.resolveCascade !== false && scheduleChanged;
      const resolvedActive = shouldResolve ? resolveSchedule(candidateActive, gapDaysOf(remote)) : candidateActive;
      const applied = resolvedActive.find((t) => t.id === cleanId) ?? (updatedTask as unknown as Task);

      return {
        nextPlan: { ...remote, tasks: [...resolvedActive, ...tombstones] },
        result: {
          task: applied,
          adjustedByDependencies: applied.start !== updatedTask.start || applied.end !== updatedTask.end,
          movedTaskIds: movedTaskIds(activeBefore, resolvedActive, cleanId)
        }
      };
    },
    nowMs
  );

  return {
    roomId: assertRoomId(rawRoomId),
    revision: committed.revision,
    ...committed.result
  };
}

export async function deletePlanTask(
  uid: string,
  rawRoomId: string,
  taskId: string,
  rtdb: RtdbClient,
  options: { cleanupDependencies?: boolean } = {},
  nowMs: number = Date.now()
) {
  const cleanId = taskId.trim();
  if (!cleanId) {
    throw new HttpError(400, "INVALID_TASK_ID", "Missing taskId.");
  }

  const committed = await mutatePlanWithCas(
    uid,
    rawRoomId,
    rtdb,
    ({ remote, mention, now }) => {
      const activeBefore = liveTasksOf(remote);
      const tombstones = tombstonesOf(remote);
      const target = activeBefore.find((t) => t.id === cleanId);
      if (!target) {
        throw new HttpError(404, "TASK_NOT_FOUND", `No live task with id '${cleanId}' exists in this plan.`);
      }

      const cleanupDeps = options.cleanupDependencies !== false;
      const remainingActive = activeBefore
        .filter((t) => t.id !== cleanId)
        .map((t) => {
          if (!cleanupDeps || !t.dependsOn) return t;
          const nextDep = removeDepReference(t.dependsOn, cleanId);
          if (nextDep === t.dependsOn) return t;
          const copy: Task = { ...t, updatedAt: now, updatedBy: mention };
          if (nextDep === undefined) delete copy.dependsOn;
          else copy.dependsOn = nextDep;
          return copy;
        });

      const deletedTombstone: Task = {
        ...target,
        _deleted: true,
        updatedAt: now,
        updatedBy: mention
      };

      return {
        nextPlan: { ...remote, tasks: [...remainingActive, ...tombstones, deletedTombstone] },
        result: { deletedTaskId: cleanId }
      };
    },
    nowMs
  );

  return {
    roomId: assertRoomId(rawRoomId),
    revision: committed.revision,
    deleted: true,
    ...committed.result
  };
}

export async function inspectAccountPlan(
  uid: string,
  rawRoomId: string,
  targetDateArg: unknown,
  rtdb: RtdbClient
) {
  const { roomId, role, meta, plan } = await getAccountPlan(uid, rawRoomId, rtdb);
  const validation = validate(plan);
  const tasks = liveTasksOf(plan);
  const targetDate = targetDateOf(targetDateArg, plan);
  const critical = calculateCriticalPath(tasks, {
    defaultGapDays: gapDaysOf(plan),
    targetDate,
    calendar: plan.meta?.calendar,
    useWorkingDays: plan.meta?.useWorkingDays,
    calendars: plan.calendars,
    people: plan.people
  });

  let startDate: string | null = null;
  const workload = new Map<string, { assignee: string; taskCount: number; totalDays: number }>();
  for (const t of tasks) {
    if (isValidISODate(t.start) && (startDate === null || t.start < startDate)) startDate = t.start;
    const assignee = typeof t.assignee === "string" && t.assignee.trim() ? t.assignee : "Unassigned";
    const entry = workload.get(assignee) ?? { assignee, taskCount: 0, totalDays: 0 };
    entry.taskCount += 1;
    entry.totalDays += Math.max(safeDiffDays(t.start, t.end), 0);
    workload.set(assignee, entry);
  }
  const finishDate = latestEnd(tasks);

  return {
    roomId,
    role,
    revision: meta.revision,
    valid: validation.valid,
    validationErrors: validation.errors,
    summary: {
      title: meta.title || plan.meta?.title || "Untitled Project",
      totalTasks: tasks.length,
      startDate,
      finishDate,
      durationDays: startDate && finishDate ? diffDays(startDate, finishDate) : null,
      criticalPathLength: critical.criticalTaskIds.size,
      criticalTaskIds: Array.from(critical.criticalTaskIds),
      projectEarlyFinish: critical.projectEarlyFinish,
      targetDate: targetDate ?? null,
      projectTotalFloatDays: critical.projectTotalFloat,
      categories: Object.keys(plan.categories || {}),
      workload: Array.from(workload.values()).sort((a, b) => b.taskCount - a.taskCount || b.totalDays - a.totalDays)
    }
  };
}

export async function auditAccountPlan(
  uid: string,
  rawRoomId: string,
  targetDateArg: unknown,
  rtdb: RtdbClient
) {
  const { roomId, role, meta, plan } = await getAccountPlan(uid, rawRoomId, rtdb);
  const validation = validate(plan);
  const tasks = liveTasksOf(plan);
  const targetDate = targetDateOf(targetDateArg, plan);
  const critical = calculateCriticalPath(tasks, {
    defaultGapDays: gapDaysOf(plan),
    targetDate,
    calendar: plan.meta?.calendar,
    useWorkingDays: plan.meta?.useWorkingDays,
    calendars: plan.calendars,
    people: plan.people
  });
  const calendar = workingCalendarOf(plan);
  const health = auditScheduleIntegrity(tasks, critical, { calendar });

  return {
    roomId,
    role,
    revision: meta.revision,
    valid: validation.valid,
    validationErrors: validation.errors,
    integrityScore: health.healthScore,
    grade: health.grade,
    summary: health.summary,
    targetDate: targetDate ?? null,
    workingDays: calendar !== undefined,
    checks: health.checks,
    issues: health.issues,
    metrics: {
      missingLogic: health.missingLogicCount,
      negativeFloat: health.negativeFloatCount,
      negativeFloatChecked: Boolean(targetDate),
      highFloat: health.highFloatCount,
      totalTasks: health.totalTasksChecked
    }
  };
}

export async function exportAccountPlanCsv(uid: string, rawRoomId: string, rtdb: RtdbClient): Promise<string> {
  const { plan } = await getAccountPlan(uid, rawRoomId, rtdb);
  return exportToCsv({ ...plan, tasks: liveTasksOf(plan) });
}

