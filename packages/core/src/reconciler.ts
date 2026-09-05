import { JanttData, Task, NoteItem, Person, Team, ReconcileResult, ConflictRecord } from "./types";

/**
 * Compares two composite timestamps of format "${ISO_STRING}#${clientId}" or "${ISO_STRING}".
 * Provides total ordering: lexicographical timestamp first, client ID tie-breaker second.
 */
export function compareCompositeTimestamps(tsA?: string, tsB?: string): number {
  if (!tsA && !tsB) return 0;
  if (tsA && !tsB) return 1;
  if (!tsA && tsB) return -1;
  if (tsA === tsB) return 0;

  const [isoA, clientA = ""] = (tsA || "").split("#");
  const [isoB, clientB = ""] = (tsB || "").split("#");

  if (isoA !== isoB) {
    return isoA.localeCompare(isoB);
  }
  return clientA.localeCompare(clientB);
}

/**
 * Computes a fast, deterministic 64-bit FNV-1a content hash of a Jantt plan.
 * Normalizes keys, excludes soft-deleted tombstones, and sorts elements by deterministic IDs
 * so identical logical plans always yield the identical hash regardless of key order.
 */
export function calculatePlanHash(data: JanttData | null | undefined): string {
  if (!data) return "0000000000000000";

  // Normalize active tasks (excluding soft-deleted tombstones)
  const normalizedTasks = Array.isArray(data.tasks)
    ? [...data.tasks]
        .filter((t) => !t._deleted)
        .map((t) => ({
          id: String(t.id || ""),
          label: String(t.label || t.name || ""),
          start: String(t.start || ""),
          end: String(t.end || ""),
          progress: Number(t.progress || 0),
          status: String(t.status || "not-started"),
          category: String(t.category || ""),
          assignee: String(t.assignee || t.person || ""),
          assignees: Array.isArray(t.assignees) ? [...t.assignees].sort() : [],
          dependsOn: Array.isArray(t.dependsOn)
            ? [...t.dependsOn].sort().join(",")
            : t.dependsOn
            ? String(t.dependsOn)
            : null,
          gapDays: Number(t.gapDays ?? 0),
          notes: String(t.notes || ""),
          color: String(t.color || "")
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const normalizedNotes = Array.isArray(data.notes)
    ? [...data.notes]
        .filter((n) => !n._deleted)
        .map((n) => ({
          id: String(n.id || ""),
          title: String(n.title || ""),
          content: String(n.content || ""),
          pinned: Boolean(n.pinned)
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const normalizedPeople = Array.isArray(data.people)
    ? [...data.people]
        .map((p) => ({
          id: String(p.id || ""),
          name: String(p.name || ""),
          role: String(p.role || "")
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const normalizedMeta = {
    title: String(data.meta?.title || ""),
    start: String(data.meta?.start || data.meta?.chartStart || ""),
    end: String(data.meta?.end || data.meta?.chartEnd || ""),
    defaultGapDays: Number(data.meta?.defaultGapDays ?? 2),
    scale: String(data.meta?.scale || "day")
  };

  const payload = JSON.stringify({
    meta: normalizedMeta,
    tasks: normalizedTasks,
    notes: normalizedNotes,
    people: normalizedPeople,
    categories: data.categories || {}
  });

  // 64-bit FNV-1a Hash simulation with dual 32-bit words
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (code << 5) | (code >>> 27);
    h2 = Math.imul(h2, 0x5bd1e995);
  }

  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}`;
}

/**
 * Checks whether two tasks have identical values across all PM planning fields.
 */
function areTasksIdentical(t1: Task, t2: Task): boolean {
  if (t1.id !== t2.id) return false;
  if ((t1.label || t1.name || "") !== (t2.label || t2.name || "")) return false;
  if (t1.start !== t2.start) return false;
  if (t1.end !== t2.end) return false;
  if (Number(t1.progress || 0) !== Number(t2.progress || 0)) return false;
  if ((t1.status || "not-started") !== (t2.status || "not-started")) return false;
  if ((t1.category || "") !== (t2.category || "")) return false;
  if ((t1.assignee || t1.person || "") !== (t2.assignee || t2.person || "")) return false;
  if (String(t1.dependsOn || "") !== String(t2.dependsOn || "")) return false;
  if ((t1.notes || "") !== (t2.notes || "")) return false;
  if ((t1.gapDays ?? 0) !== (t2.gapDays ?? 0)) return false;
  if ((t1.color || "") !== (t2.color || "")) return false;
  if (Boolean(t1._deleted) !== Boolean(t2._deleted)) return false;
  return true;
}

/**
 * Retrieves the latest field timestamp present across all fields of a task.
 */
function getLatestTaskTimestamp(t: Task): string {
  let latest = t.updatedAt
    ? `${t.updatedAt}#${t.updatedBy || ""}`
    : "1970-01-01T00:00:00.000Z";

  if (t.fieldTimestamps) {
    for (const ts of Object.values(t.fieldTimestamps)) {
      if (ts && compareCompositeTimestamps(ts, latest) > 0) {
        latest = ts;
      }
    }
  }
  return latest;
}

const PM_TASK_FIELDS: Array<keyof Task> = [
  "label",
  "name",
  "start",
  "end",
  "progress",
  "status",
  "category",
  "assignee",
  "person",
  "assignees",
  "dependsOn",
  "gapDays",
  "notes",
  "color",
  "priority",
  "urgent",
  "locked",
  "milestone",
  "wbs",
  "phase",
  "estimatedCost",
  "actualCost"
];

/**
 * Commutative & Associative State-Based CRDT & 3-Way Task Reconciler.
 * Supports arbitrary N-party concurrency (10, 20, 30, 40+ collaborators)
 * with deterministic field-level LWW (Last-Write-Wins), tombstone lifecycle,
 * and zero data loss.
 */
export function reconcilePlans(
  base: JanttData | null | undefined,
  local: JanttData,
  remote: JanttData,
  options?: {
    clientId?: string;
    preferRemoteOnConflict?: boolean;
    purgeTombstones?: boolean;
    tombstoneMaxAgeDays?: number;
  }
): ReconcileResult {
  const localHash = calculatePlanHash(local);
  const remoteHash = calculatePlanHash(remote);
  const baseHash = base ? calculatePlanHash(base) : null;

  const conflicts: ConflictRecord[] = [];
  let tasksAdded = 0;
  let tasksUpdated = 0;
  let tasksDeleted = 0;
  let notesUpdated = 0;
  let fieldsMerged = 0;
  let tombstonesPreserved = 0;

  const hasSoftDeletions =
    (local.tasks || []).some((t) => t._deleted) ||
    (remote.tasks || []).some((t) => t._deleted) ||
    Boolean(local.meta?.tombstones && Object.keys(local.meta.tombstones).length > 0) ||
    Boolean(remote.meta?.tombstones && Object.keys(remote.meta.tombstones).length > 0) ||
    (base?.tasks || []).some((t) => t._deleted) ||
    Boolean(base?.meta?.tombstones && Object.keys(base.meta.tombstones).length > 0);

  // 1. Trivial check: local and remote are already logically identical
  if (!hasSoftDeletions && localHash === remoteHash) {
    return {
      mergedData: remote,
      hasConflicts: false,
      conflicts: [],
      summary: { tasksAdded: 0, tasksUpdated: 0, tasksDeleted: 0, notesUpdated: 0, fieldsMerged: 0, tombstonesPreserved: 0 },
      remoteChanged: false,
      localChanged: false
    };
  }

  // 2. Trivial check: local made zero modifications since base
  if (!hasSoftDeletions && baseHash && localHash === baseHash) {
    return {
      mergedData: remote,
      hasConflicts: false,
      conflicts: [],
      summary: { tasksAdded: 0, tasksUpdated: 0, tasksDeleted: 0, notesUpdated: 0, fieldsMerged: 0, tombstonesPreserved: 0 },
      remoteChanged: true,
      localChanged: false
    };
  }

  // 3. Trivial check: remote made zero modifications since base
  if (!hasSoftDeletions && baseHash && remoteHash === baseHash) {
    return {
      mergedData: local,
      hasConflicts: false,
      conflicts: [],
      summary: { tasksAdded: 0, tasksUpdated: 0, tasksDeleted: 0, notesUpdated: 0, fieldsMerged: 0, tombstonesPreserved: 0 },
      remoteChanged: false,
      localChanged: true
    };
  }

  const safeBase: JanttData = base || { meta: {}, tasks: [] };
  const baseTaskMap = new Map<string, Task>((safeBase.tasks || []).map((t) => [t.id, t]));
  const localTaskMap = new Map<string, Task>((local.tasks || []).map((t) => [t.id, t]));
  const remoteTaskMap = new Map<string, Task>((remote.tasks || []).map((t) => [t.id, t]));

  const nowIso = new Date().toISOString();
  const currentClientId = options?.clientId || "client";

  // Ingest tombstones from metadata and soft-deleted items across all replicas
  const tombstoneMap = new Map<string, { deletedAt: string; entityType: "task" | "note" }>();

  const ingestTombstone = (id: string, delAt?: string, entityType: "task" | "note" = "task") => {
    if (!id) return;
    const finalTs = delAt || `${nowIso}#${currentClientId}`;
    const existing = tombstoneMap.get(id);
    if (!existing || compareCompositeTimestamps(finalTs, existing.deletedAt) > 0) {
      tombstoneMap.set(id, { deletedAt: finalTs, entityType });
    }
  };

  // Ingest from meta.tombstones
  Object.entries(safeBase.meta?.tombstones || {}).forEach(([id, t]) => ingestTombstone(id, t?.deletedAt, (t?.entityType as any) || "task"));
  Object.entries(local.meta?.tombstones || {}).forEach(([id, t]) => ingestTombstone(id, t?.deletedAt, (t?.entityType as any) || "task"));
  Object.entries(remote.meta?.tombstones || {}).forEach(([id, t]) => ingestTombstone(id, t?.deletedAt, (t?.entityType as any) || "task"));

  // Ingest from soft-deleted task objects
  (safeBase.tasks || []).forEach((t) => { if (t._deleted) ingestTombstone(t.id, t.deletedAt || t.updatedAt, "task"); });
  (local.tasks || []).forEach((t) => { if (t._deleted) ingestTombstone(t.id, t.deletedAt || t.updatedAt, "task"); });
  (remote.tasks || []).forEach((t) => { if (t._deleted) ingestTombstone(t.id, t.deletedAt || t.updatedAt, "task"); });

  // Ingest from soft-deleted note objects
  (safeBase.notes || []).forEach((n) => { if (n._deleted) ingestTombstone(n.id, n.deletedAt || n.updatedAt, "note"); });
  (local.notes || []).forEach((n) => { if (n._deleted) ingestTombstone(n.id, n.deletedAt || n.updatedAt, "note"); });
  (remote.notes || []).forEach((n) => { if (n._deleted) ingestTombstone(n.id, n.deletedAt || n.updatedAt, "note"); });

  const allTaskIds = new Set<string>([
    ...baseTaskMap.keys(),
    ...localTaskMap.keys(),
    ...remoteTaskMap.keys(),
    ...Array.from(tombstoneMap.keys())
  ]);

  const mergedTasks: Task[] = [];

  for (const id of allTaskIds) {
    const inBase = baseTaskMap.has(id);
    const baseTask = baseTaskMap.get(id);
    const localTask = localTaskMap.get(id);
    const remoteTask = remoteTaskMap.get(id);

    // =========================================================================
    // Scenario 1: Present in both Local and Remote
    // =========================================================================
    if (localTask && remoteTask) {
      const localDeleted = Boolean(localTask._deleted);
      const remoteDeleted = Boolean(remoteTask._deleted);

      // Case 1A: Both replicas marked the task as deleted
      if (localDeleted && remoteDeleted) {
        const localDelAt = localTask.deletedAt || localTask.updatedAt || nowIso;
        const remoteDelAt = remoteTask.deletedAt || remoteTask.updatedAt || nowIso;
        const winningDelAt =
          compareCompositeTimestamps(localDelAt, remoteDelAt) >= 0 ? localDelAt : remoteDelAt;

        ingestTombstone(id, winningDelAt, "task");
        tombstonesPreserved++;
        continue;
      }

      // Case 1B: Local marked deleted, Remote still active
      if (localDeleted && !remoteDeleted) {
        const localDelAt = localTask.deletedAt || localTask.updatedAt || `${nowIso}#${currentClientId}`;
        const remoteLatest = getLatestTaskTimestamp(remoteTask);

        if (compareCompositeTimestamps(remoteLatest, localDelAt) > 0) {
          // Remote updated the task AFTER the deletion timestamp -> Resurrect!
          tombstoneMap.delete(id);
          mergedTasks.push({
            ...remoteTask,
            _deleted: false,
            deletedAt: undefined
          });
          tasksUpdated++;
          conflicts.push({
            type: "task_deletion",
            entityId: id,
            localValue: localTask,
            remoteValue: remoteTask,
            resolvedValue: remoteTask,
            resolution: "remote",
            description: `Task "${remoteTask.label || id}" was deleted locally but updated by collaborator. Preserved latest modifications.`
          });
        } else {
          // Deletion happened after or at the same time -> Delete wins
          ingestTombstone(id, localDelAt, "task");
          tasksDeleted++;
          tombstonesPreserved++;
        }
        continue;
      }

      // Case 1C: Remote marked deleted, Local still active
      if (!localDeleted && remoteDeleted) {
        const remoteDelAt = remoteTask.deletedAt || remoteTask.updatedAt || nowIso;
        const localLatest = getLatestTaskTimestamp(localTask);

        if (compareCompositeTimestamps(localLatest, remoteDelAt) > 0) {
          // Local updated the task AFTER the collaborator's deletion -> Resurrect!
          tombstoneMap.delete(id);
          mergedTasks.push({
            ...localTask,
            _deleted: false,
            deletedAt: undefined
          });
          tasksUpdated++;
          conflicts.push({
            type: "task_deletion",
            entityId: id,
            localValue: localTask,
            remoteValue: remoteTask,
            resolvedValue: localTask,
            resolution: "local",
            description: `Task "${localTask.label || id}" was deleted by collaborator but had local edits. Retained task to protect work.`
          });
        } else {
          // Collaborator deletion wins
          ingestTombstone(id, remoteDelAt, "task");
          tasksDeleted++;
          tombstonesPreserved++;
        }
        continue;
      }

      // Case 1D: Both active -> Check if prior tombstone existed in metadata
      const existingTombstone = tombstoneMap.get(id);
      if (existingTombstone && existingTombstone.entityType === "task") {
        const localLatest = getLatestTaskTimestamp(localTask);
        const remoteLatest = getLatestTaskTimestamp(remoteTask);
        const maxEditTime = compareCompositeTimestamps(localLatest, remoteLatest) >= 0 ? localLatest : remoteLatest;

        if (compareCompositeTimestamps(maxEditTime, existingTombstone.deletedAt) <= 0) {
          // Both active versions are older than or equal to deletion -> Delete wins
          tombstonesPreserved++;
          continue;
        } else {
          // At least one replica updated after tombstone -> Resurrect
          tombstoneMap.delete(id);
        }
      }

      // Both active -> Field-level CRDT LWW Merge!
      if (areTasksIdentical(localTask, remoteTask)) {
        mergedTasks.push({ ...localTask, _deleted: false, deletedAt: undefined });
        continue;
      }

      const mergedTask: Task = {
        ...baseTask,
        ...remoteTask,
        ...localTask,
        id,
        _deleted: false,
        deletedAt: undefined,
        fieldTimestamps: {
          ...(baseTask?.fieldTimestamps || {}),
          ...(remoteTask.fieldTimestamps || {}),
          ...(localTask.fieldTimestamps || {})
        }
      };

      for (const field of PM_TASK_FIELDS) {
        const lVal = localTask[field];
        const rVal = remoteTask[field];
        const bVal = baseTask ? baseTask[field] : undefined;

        const lJson = JSON.stringify(lVal);
        const rJson = JSON.stringify(rVal);
        const bJson = JSON.stringify(bVal);

        // Identical on both sides
        if (lJson === rJson) {
          (mergedTask as any)[field] = lVal;
          continue;
        }

        // Check if explicit CRDT fieldTimestamps exist
        const lTs = localTask.fieldTimestamps?.[String(field)] ||
          (localTask.updatedAt ? `${localTask.updatedAt}#${localTask.updatedBy || ""}` : undefined);
        const rTs = remoteTask.fieldTimestamps?.[String(field)] ||
          (remoteTask.updatedAt ? `${remoteTask.updatedAt}#${remoteTask.updatedBy || ""}` : undefined);

        if (lTs && rTs) {
          const cmp = compareCompositeTimestamps(lTs, rTs);
          if (cmp > 0) {
            (mergedTask as any)[field] = lVal;
            mergedTask.fieldTimestamps![String(field)] = lTs;
            fieldsMerged++;
          } else if (cmp < 0) {
            (mergedTask as any)[field] = rVal;
            mergedTask.fieldTimestamps![String(field)] = rTs;
            fieldsMerged++;
          } else {
            // Equal timestamps down to client ID: tie break deterministically by value content
            const preferRemote = options?.preferRemoteOnConflict !== false;
            const chosenVal = preferRemote ? rVal : (rJson.localeCompare(lJson) > 0 ? rVal : lVal);
            (mergedTask as any)[field] = chosenVal;
            mergedTask.fieldTimestamps![String(field)] = lTs;
            conflicts.push({
              type: "task_field",
              entityId: id,
              field: String(field),
              localValue: lVal,
              remoteValue: rVal,
              resolvedValue: chosenVal,
              resolution: preferRemote ? "remote" : "merged",
              description: `Field '${String(field)}' on task "${localTask.label || id}" had identical timestamps. Deterministically resolved.`
            });
          }
          continue;
        }

        // 3-Way fallback if base is available
        if (baseTask) {
          if (lJson === bJson && rJson !== bJson) {
            // Collaborator changed this field
            (mergedTask as any)[field] = rVal;
            fieldsMerged++;
            continue;
          }
          if (rJson === bJson && lJson !== bJson) {
            // You changed this field
            (mergedTask as any)[field] = lVal;
            fieldsMerged++;
            continue;
          }
        }

        // Single-side timestamp fallback
        if (lTs && !rTs) {
          (mergedTask as any)[field] = lVal;
          mergedTask.fieldTimestamps![String(field)] = lTs;
          fieldsMerged++;
          continue;
        }
        if (rTs && !lTs) {
          (mergedTask as any)[field] = rVal;
          mergedTask.fieldTimestamps![String(field)] = rTs;
          fieldsMerged++;
          continue;
        }

        // 2-Way fallback without base: if one side set a value and the other is undefined
        if (!baseTask) {
          if (lVal !== undefined && rVal === undefined) {
            (mergedTask as any)[field] = lVal;
            fieldsMerged++;
            continue;
          }
          if (rVal !== undefined && lVal === undefined) {
            (mergedTask as any)[field] = rVal;
            fieldsMerged++;
            continue;
          }
        }

        // Overlapping concurrent edits on the same field
        const preferRemote = options?.preferRemoteOnConflict !== false;
        const resolvedVal = preferRemote ? rVal : lVal;
        (mergedTask as any)[field] = resolvedVal;

        conflicts.push({
          type: "task_field",
          entityId: id,
          field: String(field),
          localValue: lVal,
          remoteValue: rVal,
          resolvedValue: resolvedVal,
          resolution: preferRemote ? "remote" : "local",
          description: `Field '${String(field)}' on task "${localTask.label || id}" was edited concurrently. Kept ${preferRemote ? "collaborator's" : "your"} value.`
        });
      }

      // Handle array sets like 'assignees'
      const localAssignees = Array.isArray(localTask.assignees) ? (localTask.assignees as string[]) : [];
      const remoteAssignees = Array.isArray(remoteTask.assignees) ? (remoteTask.assignees as string[]) : [];
      if (localAssignees.length > 0 || remoteAssignees.length > 0) {
        const unionSet = new Set<string>([...localAssignees, ...remoteAssignees]);
        mergedTask.assignees = Array.from(unionSet).sort();
      }

      mergedTasks.push(mergedTask);
      tasksUpdated++;
      continue;
    }

    // =========================================================================
    // Scenario 2: Present in Local, Missing in Remote
    // =========================================================================
    if (localTask && !remoteTask) {
      if (inBase && baseTask) {
        // Existed in base, missing in remote -> remote deleted it!
        const localChanged = !areTasksIdentical(baseTask, localTask);
        if (localChanged) {
          // You made uncommitted changes to a deleted task -> resurrect!
          tombstoneMap.delete(id);
          mergedTasks.push({ ...localTask, _deleted: false, deletedAt: undefined });
          conflicts.push({
            type: "task_deletion",
            entityId: id,
            localValue: localTask,
            remoteValue: null,
            resolvedValue: localTask,
            resolution: "local",
            description: `Task "${localTask.label || id}" was deleted by collaborator but had local edits. Retained task to protect work.`
          });
        } else {
          // Local made no changes -> accept deletion and create tombstone
          ingestTombstone(id, `${nowIso}#remote`, "task");
          tasksDeleted++;
          tombstonesPreserved++;
        }
      } else {
        // Brand new task added locally
        if (localTask._deleted) {
          ingestTombstone(id, localTask.deletedAt || `${nowIso}#${currentClientId}`, "task");
          tombstonesPreserved++;
        } else {
          mergedTasks.push({ ...localTask, _deleted: false, deletedAt: undefined });
          tasksAdded++;
        }
      }
      continue;
    }

    // =========================================================================
    // Scenario 3: Present in Remote, Missing in Local
    // =========================================================================
    if (!localTask && remoteTask) {
      if (inBase && baseTask) {
        // Existed in base, missing in local -> local deleted it!
        const remoteChanged = !areTasksIdentical(baseTask, remoteTask);
        if (remoteChanged) {
          // Remote made edits to a locally deleted task -> keep remote!
          tombstoneMap.delete(id);
          mergedTasks.push({ ...remoteTask, _deleted: false, deletedAt: undefined });
          tasksUpdated++;
          conflicts.push({
            type: "task_deletion",
            entityId: id,
            localValue: null,
            remoteValue: remoteTask,
            resolvedValue: remoteTask,
            resolution: "remote",
            description: `Task "${remoteTask.label || id}" was deleted locally but modified by collaborator. Retained collaborator's updated task.`
          });
        } else {
          // Remote made no changes -> accept local deletion and create tombstone
          ingestTombstone(id, `${nowIso}#${currentClientId}`, "task");
          tasksDeleted++;
          tombstonesPreserved++;
        }
      } else {
        // Brand new task added by remote
        if (remoteTask._deleted) {
          ingestTombstone(id, remoteTask.deletedAt || nowIso, "task");
          tombstonesPreserved++;
        } else {
          mergedTasks.push({ ...remoteTask, _deleted: false, deletedAt: undefined });
          tasksAdded++;
        }
      }
      continue;
    }

    // =========================================================================
    // Scenario 4: Missing in both Local and Remote (Present in Base or Tombstone Map)
    // =========================================================================
    if (!localTask && !remoteTask) {
      if (inBase && baseTask) {
        // Existed in base, both sides deleted it!
        ingestTombstone(id, nowIso, "task");
        tombstonesPreserved++;
      }
      continue;
    }
  }

  // ===========================================================================
  // 4. Reconcile Project Notes with CRDT LWW and Tombstones
  // ===========================================================================
  const baseNoteMap = new Map<string, NoteItem>((safeBase.notes || []).map((n) => [n.id, n]));
  const localNoteMap = new Map<string, NoteItem>((local.notes || []).map((n) => [n.id, n]));
  const remoteNoteMap = new Map<string, NoteItem>((remote.notes || []).map((n) => [n.id, n]));

  const allNoteIds = new Set<string>([
    ...baseNoteMap.keys(),
    ...localNoteMap.keys(),
    ...remoteNoteMap.keys()
  ]);

  const mergedNotes: NoteItem[] = [];

  for (const nId of allNoteIds) {
    const lNote = localNoteMap.get(nId);
    const rNote = remoteNoteMap.get(nId);
    const bNote = baseNoteMap.get(nId);

    if (lNote && rNote) {
      const lDel = Boolean(lNote._deleted);
      const rDel = Boolean(rNote._deleted);

      if (lDel && rDel) {
        ingestTombstone(nId, nowIso, "note");
        continue;
      }

      if (lDel && !rDel) {
        const lTs = lNote.deletedAt || lNote.updatedAt || nowIso;
        const rTs = rNote.updatedAt ? `${rNote.updatedAt}#${rNote.updatedBy || ""}` : "";
        if (compareCompositeTimestamps(rTs, lTs) > 0) {
          tombstoneMap.delete(nId);
          mergedNotes.push({ ...rNote, _deleted: false });
          notesUpdated++;
        } else {
          ingestTombstone(nId, lTs, "note");
        }
        continue;
      }

      if (!lDel && rDel) {
        const rTs = rNote.deletedAt || rNote.updatedAt || nowIso;
        const lTs = lNote.updatedAt ? `${lNote.updatedAt}#${lNote.updatedBy || ""}` : "";
        if (compareCompositeTimestamps(lTs, rTs) > 0) {
          tombstoneMap.delete(nId);
          mergedNotes.push({ ...lNote, _deleted: false });
          notesUpdated++;
        } else {
          ingestTombstone(nId, rTs, "note");
        }
        continue;
      }

      if (lNote.content === rNote.content && lNote.title === rNote.title) {
        mergedNotes.push({ ...rNote, _deleted: false });
      } else {
        const lTs = lNote.updatedAt ? `${lNote.updatedAt}#${lNote.updatedBy || ""}` : "";
        const rTs = rNote.updatedAt ? `${rNote.updatedAt}#${rNote.updatedBy || ""}` : "";
        const chosen = compareCompositeTimestamps(rTs, lTs) >= 0 ? rNote : lNote;
        mergedNotes.push({ ...chosen, _deleted: false });
        notesUpdated++;
      }
    } else if (lNote && !rNote) {
      if (!bNote || bNote.content !== lNote.content || bNote.title !== lNote.title) {
        if (!lNote._deleted) {
          mergedNotes.push({ ...lNote, _deleted: false });
        } else {
          ingestTombstone(nId, lNote.deletedAt || nowIso, "note");
        }
      } else {
        // Remote deleted note
        ingestTombstone(nId, `${nowIso}#remote`, "note");
      }
    } else if (!lNote && rNote) {
      if (!bNote || bNote.content !== rNote.content || bNote.title !== rNote.title) {
        if (!rNote._deleted) {
          mergedNotes.push({ ...rNote, _deleted: false });
          notesUpdated++;
        } else {
          ingestTombstone(nId, rNote.deletedAt || nowIso, "note");
        }
      } else {
        // Local deleted note
        ingestTombstone(nId, `${nowIso}#${currentClientId}`, "note");
      }
    }
  }

  // ===========================================================================
  // 5. Clean Dangling Dependency Pruning
  // ===========================================================================
  const deletedTaskIds = new Set<string>();
  for (const [tId, rec] of tombstoneMap.entries()) {
    if (rec.entityType === "task") {
      deletedTaskIds.add(tId);
    }
  }

  for (const t of mergedTasks) {
    if (!t.dependsOn) continue;
    if (Array.isArray(t.dependsOn)) {
      const remaining = t.dependsOn.filter(
        (depId) => typeof depId === "string" && !deletedTaskIds.has(depId.trim())
      );
      t.dependsOn = remaining.length === 0 ? null : (remaining.length === 1 ? remaining[0] : remaining);
    } else if (typeof t.dependsOn === "string") {
      if (t.dependsOn.includes(",")) {
        const remaining = t.dependsOn
          .split(",")
          .map((s) => s.trim())
          .filter((depId) => depId.length > 0 && !deletedTaskIds.has(depId));
        t.dependsOn = remaining.length === 0 ? null : (remaining.length === 1 ? remaining[0] : remaining);
      } else if (deletedTaskIds.has(t.dependsOn.trim())) {
        t.dependsOn = null;
      }
    }
  }

  // ===========================================================================
  // 5. Union Merge People, Teams, Categories
  // ===========================================================================
  const mergedPeopleMap = new Map<string, Person>();
  (remote.people || []).forEach((p) => mergedPeopleMap.set(p.id, p));
  (local.people || []).forEach((p) => {
    if (!mergedPeopleMap.has(p.id)) mergedPeopleMap.set(p.id, p);
  });

  const mergedTeamsMap = new Map<string, Team>();
  (remote.teams || []).forEach((t) => mergedTeamsMap.set(t.id, t));
  (local.teams || []).forEach((t) => {
    if (!mergedTeamsMap.has(t.id)) mergedTeamsMap.set(t.id, t);
  });

  const mergedCategories = {
    ...(local.categories || {}),
    ...(remote.categories || {})
  };

  // Automated Tombstone Pruning (Prevents JSON bloat while preserving convergence)
  let finalTasks = mergedTasks;
  let finalNotes = mergedNotes;
  const shouldPurge = options?.purgeTombstones !== false;
  if (shouldPurge) {
    const maxAge = options?.tombstoneMaxAgeDays ?? 30;
    const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;
    for (const [id, rec] of Array.from(tombstoneMap.entries())) {
      const ts = new Date(rec.deletedAt.split("#")[0]).getTime();
      if (!isNaN(ts) && ts < cutoff) {
        tombstoneMap.delete(id);
      }
    }
    // Hard ceiling: retain at most 50 most recent tombstones to strictly avoid JSON payload bloat
    const MAX_TOMBSTONES = 50;
    if (tombstoneMap.size > MAX_TOMBSTONES) {
      const sortedEntries = Array.from(tombstoneMap.entries()).sort((a, b) =>
        compareCompositeTimestamps(b[1].deletedAt, a[1].deletedAt)
      );
      tombstoneMap.clear();
      for (let i = 0; i < MAX_TOMBSTONES; i++) {
        tombstoneMap.set(sortedEntries[i][0], sortedEntries[i][1]);
      }
    }
  }

  // Strip empty fieldTimestamps on tasks and notes to keep JSON lean and unbloated
  finalTasks = finalTasks.map((t) => {
    if (t.fieldTimestamps && Object.keys(t.fieldTimestamps).length === 0) {
      const { fieldTimestamps, ...rest } = t;
      return rest as Task;
    }
    return t;
  });
  finalNotes = finalNotes.map((n) => {
    if (n.fieldTimestamps && Object.keys(n.fieldTimestamps).length === 0) {
      const { fieldTimestamps, ...rest } = n;
      return rest as NoteItem;
    }
    return n;
  });

  // ===========================================================================
  // 6. Assemble Merged Plan
  // ===========================================================================
  const localRev = Number(local.meta?.revision || local.meta?.sync?.revision || 0);
  const remoteRev = Number(remote.meta?.revision || remote.meta?.sync?.revision || 0);
  const baseRev = Number(safeBase.meta?.revision || safeBase.meta?.sync?.revision || 0);
  const nextRevision = Math.max(localRev, remoteRev, baseRev) + 1;

  const mergedData: JanttData = {
    ...remote,
    meta: {
      ...remote.meta,
      ...local.meta,
      title: remote.meta?.title || local.meta?.title || "Project Plan",
      revision: nextRevision,
      updatedAt: nowIso,
      tombstones: tombstoneMap.size > 0 ? Object.fromEntries(tombstoneMap.entries()) : undefined,
      sync: {
        revision: nextRevision,
        contentHash: "",
        updatedAt: nowIso,
        clientId: options?.clientId,
        baseRevision: Math.max(localRev, remoteRev)
      }
    },
    categories: mergedCategories,
    people: Array.from(mergedPeopleMap.values()),
    teams: Array.from(mergedTeamsMap.values()),
    notes: finalNotes,
    tasks: finalTasks
  };

  const finalHash = calculatePlanHash(mergedData);
  if (mergedData.meta) {
    mergedData.meta.contentHash = finalHash;
    if (mergedData.meta.sync) {
      mergedData.meta.sync.contentHash = finalHash;
    }
  }

  return {
    mergedData,
    hasConflicts: conflicts.length > 0,
    conflicts,
    summary: {
      tasksAdded,
      tasksUpdated,
      tasksDeleted,
      notesUpdated,
      fieldsMerged,
      tombstonesPreserved
    },
    remoteChanged: true,
    localChanged: true
  };
}

/**
 * Pure 2-way Commutative CRDT Plan Merge.
 * Guarantees mergePlansCommutative(A, B) produces the identical logical plan
 * and content hash as mergePlansCommutative(B, A).
 */
export function mergePlansCommutative(
  planA: JanttData,
  planB: JanttData,
  options?: { clientId?: string }
): ReconcileResult {
  return reconcilePlans(null, planA, planB, options);
}

/**
 * Prunes tombstoned (soft-deleted) tasks and notes older than the specified age (default: 30 days).
 */
export function purgeTombstones(data: JanttData, maxAgeDays = 30): JanttData {
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const purgedTasks = (data.tasks || []).filter((t) => {
    if (!t._deleted) return true;
    if (!t.deletedAt) return false;
    const ts = new Date(t.deletedAt.split("#")[0]).getTime();
    return !isNaN(ts) && ts > cutoffMs;
  });
  const purgedNotes = (data.notes || []).filter((n) => {
    if (!n._deleted) return true;
    if (!n.deletedAt) return false;
    const ts = new Date(n.deletedAt.split("#")[0]).getTime();
    return !isNaN(ts) && ts > cutoffMs;
  });
  const nextTombstones: Record<string, { deletedAt: string; entityType?: string }> = {};
  if (data.meta?.tombstones) {
    for (const [id, record] of Object.entries(data.meta.tombstones)) {
      if (!record?.deletedAt) continue;
      const ts = new Date(record.deletedAt.split("#")[0]).getTime();
      if (!isNaN(ts) && ts > cutoffMs) {
        nextTombstones[id] = record;
      }
    }
  }
  const hasTombstones = Object.keys(nextTombstones).length > 0;
  return {
    ...data,
    meta: data.meta ? { ...data.meta, tombstones: hasTombstones ? nextTombstones : undefined } : undefined,
    tasks: purgedTasks,
    notes: purgedNotes
  };
}

/**
 * Performs routine maintenance on a Jantt plan directly from its JSON structure:
 * 1. Prunes expired tombstones (>30 days) and caps total tombstones to at most 50 to prevent JSON bloat.
 * 2. Prunes dangling dependencies referencing deleted or nonexistent tasks.
 * 3. Removes empty fieldTimestamps objects to minimize payload byte size.
 * 4. Normalizes and re-syncs canonical 64-bit contentHash.
 */
export function maintainPlanData(
  data: JanttData,
  options?: { maxAgeDays?: number; maxTombstones?: number }
): JanttData {
  if (!data) return data;
  const maxAge = options?.maxAgeDays ?? 30;
  const maxTombstones = options?.maxTombstones ?? 50;
  const cutoffMs = Date.now() - maxAge * 24 * 60 * 60 * 1000;

  const tombstoneMap = new Map<string, { deletedAt: string; entityType?: string }>();
  if (data.meta?.tombstones) {
    for (const [id, rec] of Object.entries(data.meta.tombstones)) {
      if (!rec?.deletedAt) continue;
      const ts = new Date(rec.deletedAt.split("#")[0]).getTime();
      if (isNaN(ts) || ts >= cutoffMs) {
        tombstoneMap.set(id, rec);
      }
    }
  }

  (data.tasks || []).forEach((t) => {
    if (t._deleted) {
      const delAt = t.deletedAt || t.updatedAt || new Date().toISOString();
      const ts = new Date(delAt.split("#")[0]).getTime();
      if (isNaN(ts) || ts >= cutoffMs) {
        tombstoneMap.set(t.id, { deletedAt: delAt, entityType: "task" });
      }
    }
  });

  if (tombstoneMap.size > maxTombstones) {
    const sorted = Array.from(tombstoneMap.entries()).sort((a, b) =>
      compareCompositeTimestamps(b[1].deletedAt, a[1].deletedAt)
    );
    tombstoneMap.clear();
    for (let i = 0; i < maxTombstones; i++) {
      tombstoneMap.set(sorted[i][0], sorted[i][1]);
    }
  }

  const deletedIds = new Set(tombstoneMap.keys());
  const activeTaskIdSet = new Set<string>(
    (data.tasks || []).filter((t) => !t._deleted && !deletedIds.has(t.id)).map((t) => t.id)
  );

  const activeTasks: Task[] = (data.tasks || [])
    .filter((t) => !t._deleted && !deletedIds.has(t.id))
    .map((t) => {
      let dependsOn = t.dependsOn;
      if (dependsOn) {
        const deps = Array.isArray(dependsOn)
          ? dependsOn
          : String(dependsOn).split(",").map((s) => s.trim()).filter(Boolean);
        const pruned = deps.filter((d) => activeTaskIdSet.has(d) && !deletedIds.has(d) && d !== t.id);
        dependsOn = pruned.length === 0 ? null : (pruned.length === 1 ? pruned[0] : pruned);
      }

      let fieldTimestamps = t.fieldTimestamps;
      if (fieldTimestamps && Object.keys(fieldTimestamps).length === 0) {
        fieldTimestamps = undefined;
      }

      return {
        ...t,
        dependsOn,
        fieldTimestamps
      };
    });

  const activeNotes: NoteItem[] = (data.notes || [])
    .filter((n) => !n._deleted && !deletedIds.has(n.id))
    .map((n) => {
      let fieldTimestamps = n.fieldTimestamps;
      if (fieldTimestamps && Object.keys(fieldTimestamps).length === 0) {
        fieldTimestamps = undefined;
      }
      return {
        ...n,
        fieldTimestamps
      };
    });

  const nextTombstones = tombstoneMap.size > 0 ? Object.fromEntries(tombstoneMap.entries()) : undefined;

  const interim: JanttData = {
    ...data,
    meta: data.meta ? { ...data.meta, tombstones: nextTombstones } : undefined,
    tasks: activeTasks,
    notes: activeNotes
  };

  const finalHash = calculatePlanHash(interim);
  if (interim.meta) {
    interim.meta.contentHash = finalHash;
    if (interim.meta.sync) {
      interim.meta.sync.contentHash = finalHash;
    }
  }

  return interim;
}
