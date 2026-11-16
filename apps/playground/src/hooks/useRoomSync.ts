import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  type ConflictRecord,
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  calculatePlanHash,
  canonicalFieldJson,
  reconcilePlans,
  validate
} from "@jantt/core";
import { ref, get, onValue } from "firebase/database";
import type { SavedProject, ActiveView } from "../types";
import { updateStoredProjects, getPeerId } from "../utils";
import { commandBus } from "../services/bus";
import { stampLocalChanges } from "./useEditorState";
import {
  getStoredRoomSecret,
  removeRoomSecret,
  isValidRoomId,
  normalizeRoomId,
  readRoomDeepLink,
  hashHasRoomSecret,
  loadRoomBase,
  saveRoomBase,
  removeRoomBase,
  type RoomDeepLink
} from "../room-storage";
import { rtdb, isPermissionDeniedError } from "../firebase/firebaseConfig";
import type { UserProfile, RoomPresence, FullRoomPayload } from "../firebase/types";
import { createRoom, joinRoomViaInvite, getRoom, saveRoomDataAtomic, listenToRoom } from "../firebase/roomService";
import { trackRoomPresence, listenToRoomPresence } from "../firebase/presenceService";
import { ENABLE_GITHUB_VERIFICATION_GATE } from "../firebase/githubVerificationService";

export type RoomSyncStatus = "idle" | "in-sync" | "syncing" | "merged" | "conflict" | "error" | "offline";

type RoomRole = "collaborator" | "viewer";

interface UseRoomSyncOptions {
  customProjects: SavedProject[];
  setCustomProjects: React.Dispatch<React.SetStateAction<SavedProject[]>>;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  parsedData: JanttData | null;
  setParsedData: (data: JanttData | null) => void;
  setJsonText: (text: string) => void;
  setPeople: (people: Person[]) => void;
  setTeams: (teams: Team[]) => void;
  setValidationResult: (res: ValidationResult) => void;
  showToast: (msg: string, isErr?: boolean) => void;
  captureSnapshot: (projectId: string, data: JanttData, reason: string) => void;
  userProfile?: UserProfile | null;
  /** While true, room links in the URL wait so signed-in users open them with their account. */
  isLoadingAuth?: boolean;
  /** Opened only from explicit user actions (creating a room), never from background saves. */
  onRequireVerification?: () => void;
  /**
   * Whether the signed-in user counts as GitHub-verified: the profile flag or a live verification
   * check (`githubVerified || verificationStatus.isVerified`). Read only while the verification
   * gate is on; defaults to `userProfile.githubVerified`.
   */
  isCloudVerified?: boolean;
  /** @deprecated The URL's view/theme are owned by useSharing; accepted for call-site compatibility. */
  activeView?: ActiveView;
  /** @deprecated See `activeView`. */
  selectedThemeId?: string;
  /** @deprecated Rooms no longer override the viewer's theme. */
  setSelectedThemeId?: (themeId: string) => void;
}

/**
 * Sync bookkeeping of the active room. `base` is the last plan the room acknowledged (saved by us
 * or received from it); local edits are the difference between the editor and `base`.
 */
interface RoomSyncContext {
  roomId: string;
  /** The room's entry in the plan list (`room-<roomId>`). */
  projectId: string;
  /** Null while unknown: local edits from an earlier session whose base content was not kept. */
  base: JanttData | null;
  /**
   * `calculatePlanHash` of the acknowledged plan; known even when `base` is not. Null for a
   * cached copy saved without sync bookkeeping, until the room acknowledges a state.
   */
  baseHash: string | null;
  revision: number;
}

const SAVE_DEBOUNCE_MS = 1200;
const RETRY_MIN_MS = 3000;
const RETRY_MAX_MS = 60000;

function cloneData<T>(data: T): T {
  return typeof structuredClone === "function" ? structuredClone(data) : (JSON.parse(JSON.stringify(data)) as T);
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err || "Unknown error");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function isVerifiedUser(user: UserProfile, isCloudVerified: boolean | undefined): boolean {
  return isCloudVerified ?? Boolean(user.githubVerified);
}

/** Conflicts of a merge in which this user's value was replaced by a teammate's. */
function lostLocalEdits(conflicts: ConflictRecord[] | undefined): ConflictRecord[] {
  return conflicts ? conflicts.filter((c) => c.resolution === "remote") : [];
}

/** Keeps the newest conflict per field, so repeated merges list each replaced edit once. */
function mergeConflictLists(older: ConflictRecord[], newer: ConflictRecord[]): ConflictRecord[] {
  const byField = new Map<string, ConflictRecord>();
  for (const c of [...older, ...newer]) {
    const key = `${c.type}|${c.entityId}|${c.field ?? ""}`;
    byField.delete(key);
    byField.set(key, c);
  }
  return Array.from(byField.values());
}

// Never written by a restore: identity, and keys that would reach the object prototype.
const UNRESTORABLE_FIELDS: ReadonlySet<string> = new Set(["id", "__proto__", "constructor", "prototype"]);

function withFieldValue<T extends object>(record: T, field: string, value: unknown): T {
  const next: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next as T;
}

/**
 * Puts this user's replaced values back into `plan`: task, note and plan-settings fields whose
 * value is still the one the merge chose (a field edited again since is left alone). Deletions
 * and list entries are not restorable this way; their earlier version is in Version History.
 */
function restoreLocalValues(plan: JanttData, conflicts: ConflictRecord[]): { data: JanttData; restored: number } {
  // "task:<id>", "note:<id>" or "meta:" -> the replaced fields of that record.
  const fixes = new Map<string, ConflictRecord[]>();
  for (const c of conflicts) {
    if (c.resolution !== "remote" || typeof c.field !== "string" || UNRESTORABLE_FIELDS.has(c.field)) continue;
    const key =
      c.type === "task_field" ? `task:${c.entityId}` : c.type === "note" ? `note:${c.entityId}` : c.type === "meta" && c.entityId === "meta" ? "meta:" : null;
    if (key) fixes.set(key, [...(fixes.get(key) ?? []), c]);
  }

  let restored = 0;
  const apply = <T extends object>(record: T, list: ConflictRecord[] | undefined): T => {
    let next = record;
    for (const c of list ?? []) {
      const field = c.field as string;
      if (canonicalFieldJson(field, (next as Record<string, unknown>)[field]) !== canonicalFieldJson(field, c.resolvedValue)) continue;
      next = withFieldValue(next, field, c.localValue);
      restored++;
    }
    return next;
  };
  const applyToList = <T extends { id: string }>(prefix: string, list: T[] | undefined): T[] | undefined => {
    if (!Array.isArray(list)) return list;
    let changed = false;
    const next = list.map((item) => {
      const patched = item && typeof item === "object" ? apply(item, fixes.get(`${prefix}:${item.id}`)) : item;
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : list;
  };

  const tasks = applyToList("task", plan.tasks) ?? plan.tasks;
  const notes = applyToList("note", plan.notes);
  const meta = fixes.has("meta:") ? apply(plan.meta ?? {}, fixes.get("meta:")) : plan.meta;
  if (restored === 0) return { data: plan, restored };
  const data: JanttData = { ...plan, tasks };
  if (notes !== plan.notes) data.notes = notes;
  if (meta !== plan.meta) data.meta = meta;
  return { data, restored };
}

/**
 * Access as the database rules grant it: only `meta.ownerUid` is the owner, members with role
 * "editor" may edit, and any other member record is read-only.
 */
function deriveAccess(room: FullRoomPayload, user: UserProfile | null | undefined): { isMember: boolean; role: RoomRole } {
  if (!user) return { isMember: false, role: "viewer" };
  if (room.meta?.ownerUid === user.uid) return { isMember: true, role: "collaborator" };
  const member = room.members?.[user.uid];
  return { isMember: Boolean(member), role: member?.role === "editor" ? "collaborator" : "viewer" };
}

function removeRoomParams(url: URL): boolean {
  let changed = false;
  for (const key of ["room", "cloud"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  return changed;
}

/**
 * Owns the `room` / `cloud` URL parameters (view/theme belong to useSharing) and keeps legacy
 * credentials (`#key=`) out of the address bar and history.
 */
function syncRoomUrl(activeRoomId: string | null, keepRoomParam: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    if (activeRoomId) {
      if (url.searchParams.get("room") !== activeRoomId) {
        url.searchParams.set("room", activeRoomId);
        changed = true;
      }
      for (const key of ["cloud", "url", "data", "name", "plan"]) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
    } else if (!keepRoomParam) {
      changed = removeRoomParams(url) || changed;
    }
    if (hashHasRoomSecret(url.hash)) {
      url.hash = "";
      changed = true;
    }
    if (changed) window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // intentionally ignored: the History API can be unavailable (sandboxed frames); the address
    // bar is cosmetic and the open room does not depend on it.
  }
}

export function useRoomSync(options: UseRoomSyncOptions) {
  const { customProjects, activeProjectId, parsedData, userProfile, isLoadingAuth = false } = options;

  const [showRoomModal, setShowRoomModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [lastSyncTime, setLastSyncTime] = useState<Date>(() => new Date());
  const [onlineUsers, setOnlineUsers] = useState<RoomPresence[]>([]);
  const [isActiveRoomMember, setIsActiveRoomMember] = useState(false);
  /** Edits of this user that merges with teammates' changes replaced, until restored or dismissed. */
  const [syncConflicts, setSyncConflicts] = useState<ConflictRecord[]>([]);

  const activeProj = useMemo(
    () => customProjects.find((p) => p.id === activeProjectId),
    [customProjects, activeProjectId]
  );
  const activeRoomId = activeProj?.source === "room" && isValidRoomId(activeProj.roomId) ? activeProj.roomId : null;

  // Editing needs a signed-in account; the database rules decide whether it is an editor.
  const activeRoomRole: "collaborator" | "viewer" | "none" = activeRoomId
    ? activeProj?.role === "collaborator" && userProfile
      ? "collaborator"
      : "viewer"
    : "none";

  // An editor of this room who is currently signed out.
  const isPendingLoginEditor = Boolean(
    activeRoomId && activeProj?.role === "collaborator" && !userProfile && !isLoadingAuth
  );

  /** @deprecated Legacy local edit key; it grants nothing and is kept only for existing consumers. */
  const activeSecretKey = useMemo(
    () => (activeRoomId ? activeProj?.secretKey || getStoredRoomSecret(activeRoomId) : null),
    [activeRoomId, activeProj?.secretKey]
  );

  // Latest values for the long-lived callbacks below (listeners, timers, unload handlers).
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const customProjectsRef = useRef(customProjects);
  customProjectsRef.current = customProjects;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;
  const userProfileRef = useRef(userProfile ?? null);
  userProfileRef.current = userProfile ?? null;
  const roleRef = useRef(activeRoomRole);
  roleRef.current = activeRoomRole;

  const ctxRef = useRef<RoomSyncContext | null>(null);
  const pendingSaveRef = useRef<{ ctx: RoomSyncContext; data: JanttData } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(RETRY_MIN_MS);
  const inFlightRef = useRef(false);
  /** The latest save requested while one was in flight; run when it settles. */
  const rerunRef = useRef<{ ctx: RoomSyncContext; data: JanttData } | null>(null);
  const joinSeqRef = useRef(0);
  const stashedSnapshotRef = useRef<{ roomId: string; room: FullRoomPayload } | null>(null);
  const lastSnapshotRef = useRef<{ roomId: string; room: FullRoomPayload } | null>(null);
  const memberSeenRef = useRef<string | null>(null);
  const connectedRef = useRef<boolean | null>(null);
  const skipPushRef = useRef<JanttData | null>(null);
  /** The context of the save in flight, if any. */
  const inFlightCtxRef = useRef<RoomSyncContext | null>(null);
  /** Project id -> hash of the merge base currently stored for it (see room-storage). */
  const storedBaseRef = useRef(new Map<string, string>());
  /** `syncConflicts` and the room context they belong to. */
  const conflictsRef = useRef<{ ctx: RoomSyncContext | null; list: ConflictRecord[] }>({ ctx: null, list: [] });

  // The room link this page was opened with, read before any effect rewrites the URL.
  const deepLinkRef = useRef<RoomDeepLink | null | undefined>(undefined);
  if (deepLinkRef.current === undefined) {
    deepLinkRef.current = typeof window !== "undefined" ? readRoomDeepLink(window.location.search) : null;
  }

  const statusRef = useRef<RoomSyncStatus>("idle");
  const report = useCallback((status: RoomSyncStatus, message: string) => {
    statusRef.current = status;
    setSyncStatus(status);
    setSyncMessage(message);
    if (status === "in-sync" || status === "merged") setLastSyncTime(new Date());
  }, []);

  const isActiveCtx = useCallback((ctx: RoomSyncContext) => {
    if (ctxRef.current !== ctx) return false;
    const proj = customProjectsRef.current.find((p) => p.id === activeProjectIdRef.current);
    return proj?.source === "room" && proj.roomId === ctx.roomId;
  }, []);

  const getActiveProject = useCallback(
    () => customProjectsRef.current.find((p) => p.id === activeProjectIdRef.current),
    []
  );

  /**
   * Applies a project-list change in memory and, with `persist`, to the stored list
   * (read-modify-write, so plans saved by other tabs are kept).
   */
  const updateProjects = useCallback((mutate: (list: SavedProject[]) => SavedProject[], persist: boolean) => {
    if (persist) updateStoredProjects(mutate);
    customProjectsRef.current = mutate(customProjectsRef.current);
    optionsRef.current.setCustomProjects((prev) => mutate(prev));
  }, []);

  const patchRoomProject = useCallback(
    (roomId: string, patch: Partial<SavedProject>, persist: boolean) => {
      updateProjects(
        (list) => list.map((p) => (p.source === "room" && p.roomId === roomId ? { ...p, ...patch } : p)),
        persist
      );
    },
    [updateProjects]
  );

  const applyToEditor = useCallback((data: JanttData, skipPush: boolean) => {
    const o = optionsRef.current;
    // Read synchronously by pushes that may run before the next render.
    parsedDataRef.current = data;
    if (skipPush) skipPushRef.current = data;
    o.setParsedData(data);
    o.setJsonText(JSON.stringify(data, null, 2));
    o.setPeople(data.people || []);
    o.setTeams(data.teams || []);
    o.setValidationResult(validate(data));
  }, []);

  /**
   * Records a plan state the room acknowledged (saved by us or received from it) as the new
   * merge base. The project stores its hash in `etag` (with `revision`), written in the same
   * update as `projectData`: the plan this device keeps, which always contains that state. So
   * after a reload, edits that never reached the room are recognized and pushed or merged
   * instead of being overwritten by the room copy.
   */
  const acknowledge = useCallback(
    (ctx: RoomSyncContext, ackData: JanttData, hash: string, revision: number, projectData: JanttData) => {
      ctx.base = ackData;
      ctx.baseHash = hash;
      ctx.revision = Math.max(ctx.revision, revision);
      const now = new Date().toISOString();
      patchRoomProject(
        ctx.roomId,
        { data: projectData, updatedAt: now, revision: ctx.revision, etag: hash, lastSyncedAt: now, syncError: undefined },
        true
      );
      // A stored base of an older state no longer matches `etag`: drop it.
      const storedHash = storedBaseRef.current.get(ctx.projectId);
      if (storedHash !== undefined && storedHash !== hash) {
        storedBaseRef.current.delete(ctx.projectId);
        removeRoomBase(ctx.projectId);
      }
    },
    [patchRoomProject]
  );

  /**
   * Stores the merge base of edits that may outlive this page (tab hidden or closed, save failed
   * after leaving the room), so a reload merges them 3-way. Best effort: without it the reload
   * falls back to a 2-way merge after a safety snapshot.
   */
  const persistBase = useCallback((ctx: RoomSyncContext) => {
    if (ctx.base === null || ctx.baseHash === null) return;
    if (storedBaseRef.current.get(ctx.projectId) === ctx.baseHash) return;
    if (saveRoomBase(ctx.projectId, { hash: ctx.baseHash, revision: ctx.revision, data: ctx.base })) {
      storedBaseRef.current.set(ctx.projectId, ctx.baseHash);
    }
  }, []);

  /** Lists edits of this user that a merge replaced, so they can be reviewed and restored. */
  const recordLostEdits = useCallback((ctx: RoomSyncContext, lost: ConflictRecord[]) => {
    if (lost.length === 0) return;
    const list = conflictsRef.current.ctx === ctx ? mergeConflictLists(conflictsRef.current.list, lost) : lost;
    conflictsRef.current = { ctx, list };
    setSyncConflicts(list);
  }, []);

  const clearLostEdits = useCallback(() => {
    if (conflictsRef.current.list.length === 0 && conflictsRef.current.ctx === null) return;
    conflictsRef.current = { ctx: null, list: [] };
    setSyncConflicts([]);
  }, []);

  /** Reports edits of this user that a merge replaced; their version is kept in Version History. */
  const announceLostEdits = useCallback(
    (ctx: RoomSyncContext, lost: ConflictRecord[], before: JanttData) => {
      const o = optionsRef.current;
      o.captureSnapshot(ctx.projectId, before, "Your version before a merge replaced some of your edits");
      recordLostEdits(ctx, lost);
      const replaced = `${plural(lost.length, "of your edits was", "of your edits were")} replaced by newer ones`;
      report("conflict", `Merged teammates' changes – ${replaced}`);
      o.showToast(`Merged teammates' changes: ${replaced}. Your previous version is in Version History.`);
    },
    [recordLostEdits, report]
  );

  const clientId = useCallback(() => {
    const username = userProfileRef.current?.username;
    return username ? `@${username}` : getPeerId();
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /** Re-evaluates the signed-in user's access from a room snapshot. */
  const applyAccess = useCallback(
    (ctx: RoomSyncContext, room: FullRoomPayload) => {
      const user = userProfileRef.current;
      const proj = getActiveProject();
      if (!user || !proj || proj.source !== "room" || proj.roomId !== ctx.roomId) {
        setIsActiveRoomMember(false);
        return;
      }
      const { isMember, role } = deriveAccess(room, user);
      setIsActiveRoomMember(isMember);
      const lostMembership = !isMember && memberSeenRef.current === ctx.roomId;
      memberSeenRef.current = isMember ? ctx.roomId : null;
      if (proj.role === role && !lostMembership) return;

      const o = optionsRef.current;
      const previousRole = proj.role;
      const lostEditing = previousRole === "collaborator" && role === "viewer";
      if (lostEditing) {
        // Keep anything not yet saved before the editor turns read-only.
        const local = parsedDataRef.current;
        if (local && ctx.baseHash !== null && calculatePlanHash(local) !== ctx.baseHash) {
          o.captureSnapshot(proj.id, local, "Unsaved edits before losing edit access");
        }
        if (pendingSaveRef.current?.ctx === ctx) pendingSaveRef.current = null;
      }
      if (previousRole !== role) {
        patchRoomProject(ctx.roomId, { role }, true);
        // Read by the reconcile step that follows, before the next render recomputes it.
        roleRef.current = role;
      }

      if (lostEditing) {
        o.showToast(
          isMember
            ? "Your access to this room changed to view only."
            : "You don't have edit access to this room. Make a local copy to keep editing.",
          true
        );
      } else if (role === "collaborator" && previousRole === "viewer") {
        o.showToast("You can now edit this room.");
      } else if (lostMembership) {
        o.showToast("You were removed from this room's members. You can still view it.", true);
      }
    },
    [getActiveProject, patchRoomProject]
  );

  const handleSnapshotRef = useRef<(roomId: string, room: FullRoomPayload | null) => void>(() => {});
  const runSaveRef = useRef<(ctx: RoomSyncContext, data: JanttData) => Promise<void>>(async () => {});

  const schedulePush = useCallback((ctx: RoomSyncContext, data: JanttData) => {
    pendingSaveRef.current = { ctx, data };
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) void runSaveRef.current(pending.ctx, pending.data);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  /** Saves pending edits now (room switch, plan switch, tab hidden or closed). */
  const flushCloudSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) void runSaveRef.current(pending.ctx, pending.data);
  }, []);

  /** Retries saving the active room's edits immediately. */
  const retryCloudSave = useCallback(() => {
    clearRetry();
    const ctx = ctxRef.current;
    const local = parsedDataRef.current;
    if (ctx && local && roleRef.current === "collaborator") void runSaveRef.current(ctx, local);
  }, [clearRetry]);

  const scheduleRetry = useCallback(() => {
    clearRetry();
    const delay = retryDelayRef.current;
    retryDelayRef.current = Math.min(delay * 2, RETRY_MAX_MS);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      retryCloudSave();
    }, delay);
  }, [clearRetry, retryCloudSave]);

  // ─── Outbound: push local edits ────────────────────────────────────────────
  runSaveRef.current = async (ctx: RoomSyncContext, data: JanttData) => {
    const user = userProfileRef.current;
    if (!user || !isValidRoomId(ctx.roomId)) return;
    const active = isActiveCtx(ctx);
    if (active && roleRef.current !== "collaborator") return;
    if (ENABLE_GITHUB_VERIFICATION_GATE && !isVerifiedUser(user, optionsRef.current.isCloudVerified)) {
      if (active) report("error", "Verify your GitHub account to sync edits to this room.");
      return;
    }
    // Unknown base: the next room snapshot establishes it and pushes or merges these edits.
    const sentBase = ctx.base;
    if (sentBase === null) return;
    if (connectedRef.current === false) {
      if (active) report("offline", "Offline – your edits will sync when you reconnect.");
      return;
    }
    const sentHash = calculatePlanHash(data);
    if (sentHash === ctx.baseHash) {
      if (active && !inFlightRef.current) report("in-sync", "All changes saved");
      return;
    }
    if (inFlightRef.current) {
      rerunRef.current = { ctx, data };
      return;
    }

    inFlightRef.current = true;
    inFlightCtxRef.current = ctx;
    if (active) report("syncing", "Saving to room…");
    try {
      const result = await saveRoomDataAtomic(ctx.roomId, data, user, sentBase);
      retryDelayRef.current = RETRY_MIN_MS;
      clearRetry();
      const committed = result.data;
      const committedHash = calculatePlanHash(committed);
      if (!isActiveCtx(ctx)) {
        // Saved after switching away. Edits newer than this save stay in the cached copy: the
        // stored hash then differs from it, so they are pushed or merged when the room reopens.
        const cached = customProjectsRef.current.find((p) => p.source === "room" && p.roomId === ctx.roomId)?.data;
        const cachedHash = cached ? calculatePlanHash(cached) : null;
        const keep = cached && cachedHash !== sentHash && cachedHash !== committedHash ? cached : committed;
        acknowledge(ctx, committed, committedHash, result.revision, keep);
        return;
      }

      const local = parsedDataRef.current ?? data;
      if (committedHash === sentHash) {
        acknowledge(ctx, committed, committedHash, result.revision, local);
        report("in-sync", "All changes saved");
        return;
      }
      // The room merged in teammates' edits made while we were saving: bring them into the editor.
      // Re-merging what was sent against the commit lists the sent edits the room replaced.
      const lost = lostLocalEdits(reconcilePlans(sentBase, data, committed, { clientId: clientId() }).conflicts);
      if (local === data || calculatePlanHash(local) === sentHash) {
        applyToEditor(cloneData(committed), true);
      } else {
        const merge = reconcilePlans(data, local, committed, { clientId: clientId() });
        lost.push(...lostLocalEdits(merge.conflicts));
        applyToEditor(merge.mergedData === committed ? cloneData(committed) : merge.mergedData, false);
      }
      acknowledge(ctx, committed, committedHash, result.revision, parsedDataRef.current ?? committed);
      if (lost.length > 0) {
        announceLostEdits(ctx, lost, local);
      } else {
        report("merged", "Saved and merged teammates' changes");
      }
    } catch (err) {
      const message = errorMessage(err);
      patchRoomProject(ctx.roomId, { syncError: message }, false);
      if (!isActiveCtx(ctx)) {
        // The room was left with these edits unsaved: they stay in the cached copy.
        persistBase(ctx);
        return;
      }
      if (isPermissionDeniedError(err) || /no longer exists/i.test(message)) {
        report("error", message);
        const snap = lastSnapshotRef.current;
        if (snap && snap.roomId === ctx.roomId) applyAccess(ctx, snap.room);
      } else {
        report("error", `${message} Retrying shortly…`);
        scheduleRetry();
      }
    } finally {
      inFlightRef.current = false;
      inFlightCtxRef.current = null;
      const stashed = stashedSnapshotRef.current;
      stashedSnapshotRef.current = null;
      if (stashed) handleSnapshotRef.current(stashed.roomId, stashed.room);
      const rerun = rerunRef.current;
      rerunRef.current = null;
      if (rerun) {
        // The open room saves the editor's newest content; a room left meanwhile, what was requested.
        const latest = isActiveCtx(rerun.ctx) ? parsedDataRef.current ?? rerun.data : rerun.data;
        void runSaveRef.current(rerun.ctx, latest);
      }
    }
  };

  // ─── Inbound: apply room snapshots ─────────────────────────────────────────
  const handleRoomGone = useCallback(
    async (ctx: RoomSyncContext) => {
      // Confirm before acting: never drop a plan because of a transient event.
      try {
        const snap = await get(ref(rtdb, `rooms/${ctx.roomId}/meta`));
        if (snap.exists()) return;
      } catch {
        // Unconfirmed (offline, refused): keep the room; the next snapshot decides again.
        return;
      }
      if (!isActiveCtx(ctx)) return;
      const proj = getActiveProject();
      if (!proj) return;
      const o = optionsRef.current;
      const local = parsedDataRef.current ?? proj.data;
      if (pendingSaveRef.current?.ctx === ctx) pendingSaveRef.current = null;
      o.captureSnapshot(proj.id, local, "Cloud room deleted – kept as local plan");
      updateProjects(
        (list) =>
          list.map((p) =>
            p.id === proj.id
              ? {
                  ...p,
                  name: `${p.name} (room deleted)`,
                  data: local,
                  updatedAt: new Date().toISOString(),
                  source: "local" as const,
                  roomId: undefined,
                  secretKey: undefined,
                  role: undefined,
                  etag: undefined,
                  revision: undefined,
                  lastSyncedAt: undefined,
                  syncError: undefined
                }
              : p
          ),
        true
      );
      removeRoomSecret(ctx.roomId);
      storedBaseRef.current.delete(ctx.projectId);
      removeRoomBase(ctx.projectId);
      clearLostEdits();
      o.showToast("This cloud room was deleted by its owner. Your copy was kept as a local plan.", true);
    },
    [clearLostEdits, getActiveProject, isActiveCtx, updateProjects]
  );

  const reconcileIncoming = useCallback(
    (ctx: RoomSyncContext, room: FullRoomPayload) => {
      const incoming = room.data;
      if (!incoming || typeof incoming !== "object") return;
      const revision = Number(room.meta?.revision) || 0;
      // listenToRoom stamps contentHash from the emitted data, so this costs nothing.
      const incomingHash = room.meta?.contentHash || calculatePlanHash(incoming);

      if (ctx.base !== null && incomingHash === ctx.baseHash) {
        // Members/meta-only change, or our own save echoing back.
        ctx.revision = Math.max(ctx.revision, revision);
        if (statusRef.current === "syncing" && !inFlightRef.current && !pendingSaveRef.current) {
          report("in-sync", "Up to date");
        }
        return;
      }

      const local = parsedDataRef.current;
      if (!local) return;
      const o = optionsRef.current;
      const localHash = calculatePlanHash(local);

      if (incomingHash === localHash) {
        acknowledge(ctx, incoming, incomingHash, revision, local);
        if (pendingSaveRef.current?.ctx === ctx) pendingSaveRef.current = null;
        report("in-sync", "Up to date");
        return;
      }

      const canEdit = roleRef.current === "collaborator";
      const hasUnsyncedEdits = localHash !== ctx.baseHash;
      if (!canEdit && hasUnsyncedEdits) {
        const proj = getActiveProject();
        if (proj?.role === "collaborator" && !userProfileRef.current) {
          // A signed-out editor: keep their unsaved edits until they sign in and they can be merged.
          report("error", "Sign in to sync your unsaved changes with the room.");
          return;
        }
        if (proj) o.captureSnapshot(proj.id, local, "Unsaved edits replaced by the cloud room version");
      }
      if (!canEdit || (ctx.base !== null && !hasUnsyncedEdits)) {
        // Nothing local to keep: take the room's version.
        if (pendingSaveRef.current?.ctx === ctx) pendingSaveRef.current = null;
        const adopted = cloneData(incoming);
        applyToEditor(adopted, true);
        acknowledge(ctx, incoming, incomingHash, revision, adopted);
        report("in-sync", "Updated with teammates' changes");
        return;
      }

      const unchangedSinceCopy =
        ctx.baseHash === null
          ? // A copy saved without sync bookkeeping: only its revision tells whether the room moved on.
            ctx.revision > 0 && revision === ctx.revision
          : incomingHash === ctx.baseHash;
      if (ctx.base === null && unchangedSinceCopy) {
        // Edits from an earlier session on top of a room that has not changed since.
        acknowledge(ctx, incoming, incomingHash, revision, local);
        schedulePush(ctx, local);
        report("syncing", "Uploading changes made while you were away…");
        return;
      }

      if (ctx.baseHash === null) {
        // The room changed since this copy, and nothing tells local edits from teammates' changes
        // (merging blind would bring back tasks teammates deleted): take the room's version and
        // keep the copy in Version History.
        o.captureSnapshot(ctx.projectId, local, "Cached copy replaced by the cloud room version");
        if (pendingSaveRef.current?.ctx === ctx) pendingSaveRef.current = null;
        const adopted = cloneData(incoming);
        applyToEditor(adopted, true);
        acknowledge(ctx, incoming, incomingHash, revision, adopted);
        report("in-sync", "Updated to the room's latest version");
        o.showToast("Updated this room to its latest version. Your earlier copy is in Version History.");
        return;
      }

      // Both sides changed: 3-way merge (2-way when the base is unknown, with a safety snapshot).
      const base = ctx.base;
      if (base === null) {
        o.captureSnapshot(ctx.projectId, local, "Before merging offline edits with the cloud room");
      }
      const result = reconcilePlans(base, local, incoming, { clientId: clientId() });
      const lost = lostLocalEdits(result.conflicts);
      const merged = result.mergedData === incoming ? cloneData(incoming) : result.mergedData;
      applyToEditor(merged, false);
      acknowledge(ctx, incoming, incomingHash, revision, merged);
      schedulePush(ctx, merged);
      if (base !== null && lost.length > 0) {
        announceLostEdits(ctx, lost, local);
      } else if (base === null) {
        recordLostEdits(ctx, lost);
        const replaced = lost.length > 0 ? ` (${plural(lost.length, "edit was", "edits were")} replaced by newer ones)` : "";
        report(lost.length > 0 ? "conflict" : "merged", `Merged your offline edits with the room${replaced}`);
        o.showToast(`Merged your offline edits with the room${replaced}. The previous version is in Version History.`);
      } else {
        report("merged", "Merged teammates' changes with yours");
      }
    },
    [acknowledge, announceLostEdits, applyToEditor, clientId, getActiveProject, recordLostEdits, report, schedulePush]
  );

  handleSnapshotRef.current = (roomId: string, room: FullRoomPayload | null) => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.roomId !== roomId || !isActiveCtx(ctx)) return;
    if (room === null) {
      void handleRoomGone(ctx);
      return;
    }
    lastSnapshotRef.current = { roomId, room };
    applyAccess(ctx, room);
    if (inFlightRef.current) {
      // Applied once the save settles, so the base never moves under an in-flight merge.
      stashedSnapshotRef.current = { roomId, room };
      return;
    }
    reconcileIncoming(ctx, room);
  };

  // ─── Room activation ───────────────────────────────────────────────────────
  // Declared before the debounce effect: both run on the same commit when the room changes.
  useEffect(() => {
    if (!activeRoomId) {
      ctxRef.current = null;
      setIsActiveRoomMember(false);
      clearLostEdits();
      report("idle", "");
      return;
    }
    const proj = customProjectsRef.current.find((p) => p.id === activeProjectIdRef.current);
    const projectId = proj?.id ?? `room-${activeRoomId}`;
    const data = proj?.data ?? parsedDataRef.current;
    // Without a stored hash (a copy saved by an older version or another code path) the
    // acknowledged state is unknown: the copy is never taken as the merge base.
    const ackHash = proj?.etag || null;
    const revision = proj?.revision ?? 0;
    const ctx: RoomSyncContext = { roomId: activeRoomId, projectId, base: null, baseHash: ackHash, revision };
    if (data && ackHash) {
      if (calculatePlanHash(data) === ackHash) {
        ctx.base = cloneData(data);
        // Nothing pending: a base stored for older edits is stale.
        storedBaseRef.current.delete(projectId);
        removeRoomBase(projectId);
      } else {
        // Edits that never reached the room: merge them against the base stored with them.
        const stored = loadRoomBase(projectId);
        if (stored && stored.hash === ackHash) {
          ctx.base = stored.data;
          ctx.revision = Math.max(revision, stored.revision);
          storedBaseRef.current.set(projectId, stored.hash);
        }
      }
    }
    ctxRef.current = ctx;
    lastSnapshotRef.current = null;
    stashedSnapshotRef.current = null;
    setIsActiveRoomMember(false);
    clearLostEdits();
    report("syncing", "Connecting to room…");

    return () => {
      // Push edits made just before switching away; the save keeps targeting this room.
      flushCloudSave();
      clearRetry();
      retryDelayRef.current = RETRY_MIN_MS;
      if (ctxRef.current === ctx) ctxRef.current = null;
    };
  }, [activeRoomId, clearLostEdits, clearRetry, flushCloudSave, report]);

  // Debounced push of local edits.
  useEffect(() => {
    if (!parsedData || activeRoomRole !== "collaborator") return;
    const ctx = ctxRef.current;
    if (!ctx || ctx.roomId !== activeRoomId) return;
    if (skipPushRef.current === parsedData) return; // Data that just came from the room.
    schedulePush(ctx, parsedData);
  }, [parsedData, activeRoomId, activeRoomRole, schedulePush]);

  // Live room stream.
  useEffect(() => {
    if (!activeRoomId) return;
    const roomId = activeRoomId;
    const unsubscribe = listenToRoom(
      roomId,
      (room) => handleSnapshotRef.current(roomId, room),
      (error) => {
        if (ctxRef.current?.roomId === roomId) report("error", `Live updates stopped: ${error.message}`);
      }
    );
    return () => unsubscribe();
  }, [activeRoomId, report]);

  // Connection state: hold saves while offline and push them on reconnect.
  useEffect(() => {
    if (!activeRoomId) return;
    let hasConnected = false;
    const unsubscribe = onValue(ref(rtdb, ".info/connected"), (snap) => {
      const connected = snap.val() === true;
      connectedRef.current = connected;
      if (connected) {
        // Reconnected, or edits were held back while starting offline: push them now. The live
        // listeners resync on their own, so a viewer (nothing to push) is simply back online.
        const wasOffline = statusRef.current === "offline";
        if (wasOffline) report("in-sync", "Back online");
        if (hasConnected || wasOffline) retryCloudSave();
        hasConnected = true;
      } else if (hasConnected) {
        report("offline", "Offline – your edits will sync when you reconnect.");
      }
    });
    return () => {
      unsubscribe();
      connectedRef.current = null;
    };
  }, [activeRoomId, report, retryCloudSave]);

  // Re-apply the latest snapshot when the signed-in account changes (sign-in, sign-out,
  // profile load): access is re-evaluated and edits held while signed out get merged.
  const userUid = userProfile?.uid ?? null;
  useEffect(() => {
    const ctx = ctxRef.current;
    const snap = lastSnapshotRef.current;
    if (ctx && snap && snap.roomId === ctx.roomId) handleSnapshotRef.current(snap.roomId, snap.room);
  }, [userUid]);

  // Flush on plan switch requests, when the tab is hidden or closed, and on unmount. A page that
  // goes away may never see those saves settle: their merge base is stored for the next load.
  useEffect(() => {
    const onHide = () => {
      flushCloudSave();
      const ctx = ctxRef.current;
      const local = parsedDataRef.current;
      if (ctx && ctx.base !== null && local && calculatePlanHash(local) !== ctx.baseHash) persistBase(ctx);
      const inFlight = inFlightCtxRef.current;
      if (inFlight && inFlight !== ctx) persistBase(inFlight);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribeFlush = commandBus.on("FLUSH_SAVE", flushCloudSave);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeFlush();
      onHide();
    };
  }, [flushCloudSave, persistBase]);

  // ─── Presence ──────────────────────────────────────────────────────────────
  const presenceKey = userProfile
    ? [userProfile.uid, userProfile.username, userProfile.displayName, userProfile.photoURL || ""].join("|")
    : "";
  useEffect(() => {
    if (!activeRoomId || !presenceKey) return;
    return trackRoomPresence(activeRoomId, userProfileRef.current);
  }, [activeRoomId, presenceKey]);

  useEffect(() => {
    if (!activeRoomId) {
      setOnlineUsers([]);
      return;
    }
    const unsubscribe = listenToRoomPresence(activeRoomId, setOnlineUsers);
    return () => {
      unsubscribe();
      setOnlineUsers([]);
    };
  }, [activeRoomId]);

  // ─── URL ownership ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Keep a pending ?room= link in place until it has been opened.
    syncRoomUrl(activeRoomId, Boolean(deepLinkRef.current));
  }, [activeRoomId]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  /** Makes a room the active plan and loads it into the editor. */
  const activateRoom = useCallback(
    (payload: FullRoomPayload, roomId: string, role: RoomRole) => {
      // Persist (and push) the edits of the plan being left, as a plan switch does.
      commandBus.emit("FLUSH_SAVE", undefined);
      const now = new Date().toISOString();
      const id = `room-${roomId}`;
      const existing = customProjectsRef.current.find((p) => p.id === id && p.source === "room");
      // A cached copy may hold edits that were never saved: keep it and let the sync engine
      // push or merge it against the room.
      const data = existing?.data ?? payload.data;
      const project: SavedProject = existing
        ? {
            ...existing,
            name: payload.meta?.title || existing.name,
            // Signed out, the snapshot cannot tell editors apart: keep the known role until sign-in.
            role: userProfileRef.current ? role : existing.role ?? role
          }
        : {
            id,
            name: payload.meta?.title || roomId,
            updatedAt: payload.meta?.updatedAt || now,
            data,
            source: "room",
            roomId,
            role,
            revision: Number(payload.meta?.revision) || 0,
            etag: calculatePlanHash(payload.data),
            lastSyncedAt: now
          };
      updateProjects((list) => [project, ...list.filter((p) => p.id !== id)], true);
      // useProjectState persists and announces the active-plan change.
      activeProjectIdRef.current = id;
      optionsRef.current.setActiveProjectId(id);
      applyToEditor(data, true);
    },
    [applyToEditor, updateProjects]
  );

  const createRoomInternal = useCallback(
    async (title: string, data: JanttData | null): Promise<string | null> => {
      const o = optionsRef.current;
      if (!data) {
        o.showToast("There is no plan to share yet.", true);
        return null;
      }
      const user = userProfileRef.current;
      if (!user) {
        o.showToast("Sign in with GitHub to create a cloud room.", true);
        return null;
      }
      if (ENABLE_GITHUB_VERIFICATION_GATE && !isVerifiedUser(user, o.isCloudVerified)) {
        o.onRequireVerification?.();
        o.showToast("Verify your GitHub account to create cloud rooms.", true);
        return null;
      }
      joinSeqRef.current++; // A room opened meanwhile must not replace the new room.
      setIsProcessing(true);
      try {
        const payload = await createRoom(user, title, data);
        activateRoom(payload, payload.meta.roomId, "collaborator");
        o.showToast(`Cloud room "${payload.meta.title}" is live. Use Share to invite teammates.`);
        return payload.meta.roomId;
      } catch (err) {
        o.showToast(`Couldn't create the room: ${errorMessage(err)}`, true);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [activateRoom]
  );

  /** Creates a room from the current plan. Custom room ids are not supported (`roomId` is ignored). */
  const handleCreateRoom = useCallback(
    async (opts: { title: string; roomId?: string }): Promise<boolean> =>
      (await createRoomInternal(opts.title, parsedDataRef.current)) !== null,
    [createRoomInternal]
  );

  /** Creates a room from the active plan (or `dataOverride`) and returns its id. */
  const createRoomFromActive = useCallback(
    async (title?: string, dataOverride?: JanttData): Promise<string | null> => {
      const fallbackTitle = getActiveProject()?.name || "Shared Jantt Plan";
      return createRoomInternal(title || fallbackTitle, dataOverride || parsedDataRef.current);
    },
    [createRoomInternal, getActiveProject]
  );

  /**
   * Opens a room by id. Read-only: it does not add the user to the room's roster
   * (see `saveActiveRoomToMyRooms`). The role comes from the room's membership list.
   * `_secretKey` is accepted for backward compatibility and ignored.
   */
  const handleJoinRoom = useCallback(
    async (roomIdInput: string, _secretKey?: string): Promise<boolean> => {
      const o = optionsRef.current;
      const roomId = normalizeRoomId(roomIdInput);
      if (!roomId) {
        o.showToast("That room link or ID is not valid.", true);
        return false;
      }
      // Already open and live: reloading the cached copy would drop edits not yet autosaved.
      if (ctxRef.current?.roomId === roomId && getActiveProject()?.roomId === roomId) return true;
      const seq = ++joinSeqRef.current;
      setIsProcessing(true);
      try {
        const payload = await getRoom(roomId);
        // A later join (or room creation) superseded this one.
        if (seq !== joinSeqRef.current) return false;
        if (!payload?.meta || !payload.data) {
          throw new Error(`Room "${roomId}" was not found or has been deleted.`);
        }
        if (payload.meta.roomId && payload.meta.roomId !== roomId) {
          throw new Error("The room's data does not match its link.");
        }
        const { role } = deriveAccess(payload, userProfileRef.current);
        activateRoom(payload, roomId, role);
        o.showToast(`Opened room "${payload.meta.title || roomId}" (${role === "collaborator" ? "can edit" : "view only"}).`);
        return true;
      } catch (err) {
        if (seq === joinSeqRef.current) o.showToast(`Couldn't open the room: ${errorMessage(err)}`, true);
        return false;
      } finally {
        if (seq === joinSeqRef.current) setIsProcessing(false);
      }
    },
    [activateRoom, getActiveProject]
  );

  /** Adds the active room to the signed-in user's "Shared with me" list (joins as viewer). */
  const saveActiveRoomToMyRooms = useCallback(async (): Promise<boolean> => {
    const o = optionsRef.current;
    const user = userProfileRef.current;
    const ctx = ctxRef.current;
    if (!user) {
      o.showToast("Sign in with GitHub to save rooms to your account.", true);
      return false;
    }
    if (!ctx) return false;
    try {
      // joinRoomViaInvite returns the room read-only when the rules refuse the self-enrollment.
      const room = await joinRoomViaInvite(ctx.roomId, user);
      if (room.meta?.ownerUid !== user.uid && !room.members?.[user.uid]) {
        o.showToast("This room doesn't accept new members. You can still open it with its link.", true);
        return false;
      }
      o.showToast("Room saved to your rooms.");
      return true;
    } catch (err) {
      o.showToast(`Couldn't save the room: ${errorMessage(err)}`, true);
      return false;
    }
  }, []);

  /**
   * Reset for room plans: replaces the editor with the room's saved version (fetched from the
   * server, not the cached copy), discarding edits that have not reached the room. Undoable.
   */
  const resetActiveRoomToServer = useCallback(async (): Promise<boolean> => {
    const o = optionsRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !isActiveCtx(ctx)) return false;
    try {
      const payload = await getRoom(ctx.roomId);
      if (!isActiveCtx(ctx)) return false;
      if (!payload?.meta || !payload.data) throw new Error("The room was not found or has been deleted.");
      // The discarded edits must not be pushed any more.
      if (pendingSaveRef.current?.ctx === ctx) pendingSaveRef.current = null;
      if (rerunRef.current?.ctx === ctx) rerunRef.current = null;
      const before = parsedDataRef.current;
      const hash = calculatePlanHash(payload.data);
      const server = cloneData(payload.data);
      applyToEditor(server, true);
      acknowledge(ctx, payload.data, hash, Number(payload.meta.revision) || 0, server);
      clearLostEdits();
      report("in-sync", "Up to date");
      if (before && calculatePlanHash(before) !== hash) {
        // Recorded like any local edit, so Ctrl+Z brings the discarded changes back.
        commandBus.emit("LOCAL_COMMIT", { before, after: server });
        o.showToast("Reset to the room's saved version. Press Ctrl+Z to undo.");
      } else {
        o.showToast("This plan already matches the room's saved version.");
      }
      return true;
    } catch (err) {
      if (isActiveCtx(ctx)) o.showToast(`Couldn't reload the room: ${errorMessage(err)}`, true);
      return false;
    }
  }, [acknowledge, applyToEditor, clearLostEdits, isActiveCtx, report]);

  /** Puts back this user's edits that merges replaced (`syncConflicts`). Undoable; returns the count. */
  const restoreSyncConflicts = useCallback((): number => {
    const o = optionsRef.current;
    const ctx = ctxRef.current;
    const current = parsedDataRef.current;
    const { ctx: owner, list } = conflictsRef.current;
    if (!ctx || owner !== ctx || !current || list.length === 0) {
      clearLostEdits();
      return 0;
    }
    if (roleRef.current !== "collaborator") {
      o.showToast("You can't edit this room right now. Your earlier version is in Version History.", true);
      return 0;
    }
    const { data, restored } = restoreLocalValues(current, list);
    clearLostEdits();
    if (restored === 0) {
      o.showToast(
        "These edits can't be restored automatically (they were changed again or removed). Your earlier version is in Version History.",
        true
      );
      return 0;
    }
    // Fresh field stamps, so the restored values win the next merge like any new edit.
    const next = stampLocalChanges(current, data, { peerId: getPeerId(), nowIso: new Date().toISOString(), syncStatusProgress: false });
    applyToEditor(next, false);
    commandBus.emit("LOCAL_COMMIT", { before: current, after: next });
    const notRestored = list.length - restored;
    o.showToast(
      `Restored ${plural(restored, "of your edits", "of your edits")}.${
        notRestored > 0 ? ` ${plural(notRestored, "other change", "other changes")} can only be recovered from Version History.` : ""
      }`
    );
    return restored;
  }, [applyToEditor, clearLostEdits]);

  /**
   * @deprecated Edit keys no longer grant access; editing rights come from the room owner.
   * Re-checks the current access and explains how to get edit rights.
   */
  const handleUnlockCollaborator = useCallback(
    async (_secretKey?: string): Promise<void> => {
      const o = optionsRef.current;
      if (!userProfileRef.current) {
        o.showToast("Sign in with GitHub to edit. The room owner grants edit access.", true);
        return;
      }
      const ctx = ctxRef.current;
      const snap = lastSnapshotRef.current;
      if (ctx && snap && snap.roomId === ctx.roomId) applyAccess(ctx, snap.room);
      if (roleRef.current !== "collaborator") {
        o.showToast("Ask the room owner to make you an Editor from their Share dialog.");
      }
    },
    [applyAccess]
  );

  // Open the room link this page was opened with, once auth has settled.
  useEffect(() => {
    if (isLoadingAuth) return;
    const link = deepLinkRef.current;
    if (!link) return;
    deepLinkRef.current = null;
    const activeRoom = getActiveProject()?.roomId ?? null;
    if (!link.roomId) {
      optionsRef.current.showToast("This room link is not valid.", true);
      syncRoomUrl(activeRoom, false);
      return;
    }
    if (activeRoom === link.roomId) return;
    void handleJoinRoom(link.roomId).then((ok) => {
      if (!ok) syncRoomUrl(getActiveProject()?.roomId ?? null, false);
    });
  }, [isLoadingAuth, getActiveProject, handleJoinRoom]);

  // In-page navigation to another room link (back/forward, hash links).
  useEffect(() => {
    const onPopState = () => {
      const link = readRoomDeepLink(window.location.search);
      if (!link?.roomId || link.roomId === getActiveProject()?.roomId) return;
      void handleJoinRoom(link.roomId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [getActiveProject, handleJoinRoom]);

  return {
    showRoomModal,
    setShowRoomModal,
    isProcessing,
    syncStatus,
    syncMessage,
    lastSyncTime,
    activeRoomId,
    activeRoomRole,
    isPendingLoginEditor,
    /** True when the signed-in user is the owner or on the active room's member list. */
    isActiveRoomMember,
    activeSecretKey,
    onlineUsers,
    handleCreateRoom,
    handleJoinRoom,
    handleUnlockCollaborator,
    createRoomFromActive,
    saveActiveRoomToMyRooms,
    retryCloudSave,
    flushCloudSave,
    /** Edits of this user that merges with teammates' changes replaced (newest last). */
    syncConflicts,
    restoreSyncConflicts,
    dismissSyncConflicts: clearLostEdits,
    resetActiveRoomToServer
  };
}
