import { JanttData, Task, NoteItem, Person, Team, ReconcileResult, ConflictRecord } from "./types";

/**
 * Computes a fast, deterministic 64-bit FNV-1a content hash of a Jantt plan.
 * Normalizes keys and sorts array elements by deterministic IDs so identical
 * logical plans always yield the identical hash regardless of key order.
 */
export function calculatePlanHash(data: JanttData | null | undefined): string {
  if (!data) return "0000000000000000";

  // Normalize deterministic payload
  const normalizedTasks = Array.isArray(data.tasks)
    ? [...data.tasks]
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
          dependsOn: t.dependsOn ? String(t.dependsOn) : null,
          gapDays: Number(t.gapDays ?? 0),
          notes: String(t.notes || ""),
          color: String(t.color || "")
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const normalizedNotes = Array.isArray(data.notes)
    ? [...data.notes]
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
  return true;
}

/**
 * Smart 3-Way Task & Plan Reconciler.
 * Compares Base (common ancestor), Local (current client), and Remote (collaborator).
 * Merges non-overlapping edits automatically and cleanly isolates any true conflicts.
 */
export function reconcilePlans(
  base: JanttData | null | undefined,
  local: JanttData,
  remote: JanttData,
  options?: { clientId?: string; preferRemoteOnConflict?: boolean }
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

  // 1. Trivial check: local and remote are already identical
  if (localHash === remoteHash) {
    return {
      mergedData: remote,
      hasConflicts: false,
      conflicts: [],
      summary: { tasksAdded: 0, tasksUpdated: 0, tasksDeleted: 0, notesUpdated: 0, fieldsMerged: 0 },
      remoteChanged: false,
      localChanged: false
    };
  }

  // 2. Trivial check: local made zero modifications since base
  if (baseHash && localHash === baseHash) {
    return {
      mergedData: remote,
      hasConflicts: false,
      conflicts: [],
      summary: { tasksAdded: 0, tasksUpdated: 0, tasksDeleted: 0, notesUpdated: 0, fieldsMerged: 0 },
      remoteChanged: true,
      localChanged: false
    };
  }

  // 3. Trivial check: remote made zero modifications since base
  if (baseHash && remoteHash === baseHash) {
    return {
      mergedData: local,
      hasConflicts: false,
      conflicts: [],
      summary: { tasksAdded: 0, tasksUpdated: 0, tasksDeleted: 0, notesUpdated: 0, fieldsMerged: 0 },
      remoteChanged: false,
      localChanged: true
    };
  }

  // Fallback: If base is missing, treat base as remote's initial snapshot or empty
  const safeBase: JanttData = base || { meta: {}, tasks: [] };

  const baseTaskMap = new Map<string, Task>((safeBase.tasks || []).map((t) => [t.id, t]));
  const localTaskMap = new Map<string, Task>((local.tasks || []).map((t) => [t.id, t]));
  const remoteTaskMap = new Map<string, Task>((remote.tasks || []).map((t) => [t.id, t]));

  const allTaskIds = new Set<string>([
    ...baseTaskMap.keys(),
    ...localTaskMap.keys(),
    ...remoteTaskMap.keys()
  ]);

  const mergedTasks: Task[] = [];

  for (const id of allTaskIds) {
    const inBase = baseTaskMap.has(id);
    const inLocal = localTaskMap.has(id);
    const inRemote = remoteTaskMap.has(id);

    const baseTask = baseTaskMap.get(id);
    const localTask = localTaskMap.get(id);
    const remoteTask = remoteTaskMap.get(id);

    // Case A: Exists in all three
    if (inBase && inLocal && inRemote && baseTask && localTask && remoteTask) {
      const localChanged = !areTasksIdentical(baseTask, localTask);
      const remoteChanged = !areTasksIdentical(baseTask, remoteTask);

      if (!localChanged && !remoteChanged) {
        mergedTasks.push(baseTask);
      } else if (localChanged && !remoteChanged) {
        mergedTasks.push(localTask);
      } else if (!localChanged && remoteChanged) {
        mergedTasks.push(remoteTask);
        tasksUpdated++;
      } else {
        // Both changed: Field-level 3-way reconciliation!
        const mergedTask: Task = { ...baseTask };
        const fields: Array<keyof Task> = [
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
          "color"
        ];

        for (const f of fields) {
          const bVal = baseTask[f];
          const lVal = localTask[f];
          const rVal = remoteTask[f];

          if (JSON.stringify(lVal) === JSON.stringify(rVal)) {
            (mergedTask as any)[f] = lVal;
          } else if (JSON.stringify(lVal) === JSON.stringify(bVal) && JSON.stringify(rVal) !== JSON.stringify(bVal)) {
            // Collaborator changed this field
            (mergedTask as any)[f] = rVal;
            fieldsMerged++;
          } else if (JSON.stringify(rVal) === JSON.stringify(bVal) && JSON.stringify(lVal) !== JSON.stringify(bVal)) {
            // You changed this field
            (mergedTask as any)[f] = lVal;
            fieldsMerged++;
          } else {
            // Overlapping concurrent edit on the exact same field
            const preferRemote = options?.preferRemoteOnConflict !== false;
            const resolvedVal = preferRemote ? rVal : lVal;
            (mergedTask as any)[f] = resolvedVal;

            conflicts.push({
              type: "task_field",
              entityId: id,
              field: String(f),
              localValue: lVal,
              remoteValue: rVal,
              resolvedValue: resolvedVal,
              resolution: preferRemote ? "remote" : "local",
              description: `Field '${String(f)}' on task "${localTask.label || id}" was edited concurrently. Kept ${preferRemote ? "collaborator's" : "your"} value.`
            });
          }
        }

        mergedTasks.push(mergedTask);
        tasksUpdated++;
      }
      continue;
    }

    // Case B: Deleted by remote, kept in local
    if (inBase && inLocal && !inRemote && baseTask && localTask) {
      const localChanged = !areTasksIdentical(baseTask, localTask);
      if (localChanged) {
        // You made changes to a task the collaborator deleted -> Resurrect task to prevent data loss!
        mergedTasks.push(localTask);
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
        // Local did not change it -> accept collaborator's deletion
        tasksDeleted++;
      }
      continue;
    }

    // Case C: Deleted by local, kept in remote
    if (inBase && !inLocal && inRemote && baseTask && remoteTask) {
      const remoteChanged = !areTasksIdentical(baseTask, remoteTask);
      if (remoteChanged) {
        // Collaborator modified a task you deleted -> Keep remote task, notify
        mergedTasks.push(remoteTask);
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
        // Remote did not change it -> accept local deletion
        tasksDeleted++;
      }
      continue;
    }

    // Case D: Added by both local and remote (new task with same ID)
    if (!inBase && inLocal && inRemote && localTask && remoteTask) {
      if (areTasksIdentical(localTask, remoteTask)) {
        mergedTasks.push(localTask);
      } else {
        // Merged with preference
        mergedTasks.push(remoteTask);
        conflicts.push({
          type: "task_field",
          entityId: id,
          localValue: localTask,
          remoteValue: remoteTask,
          resolvedValue: remoteTask,
          resolution: "remote",
          description: `Task ID "${id}" was created independently on both sides.`
        });
      }
      continue;
    }

    // Case E: Added by local only
    if (!inBase && inLocal && !inRemote && localTask) {
      mergedTasks.push(localTask);
      tasksAdded++;
      continue;
    }

    // Case F: Added by remote only
    if (!inBase && !inLocal && inRemote && remoteTask) {
      mergedTasks.push(remoteTask);
      tasksAdded++;
      continue;
    }
  }

  // 4. Reconcile Project Notes
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
      if (lNote.content === rNote.content && lNote.title === rNote.title) {
        mergedNotes.push(rNote);
      } else {
        // Compare updatedAt timestamps
        const lTime = lNote.updatedAt ? new Date(lNote.updatedAt).getTime() : 0;
        const rTime = rNote.updatedAt ? new Date(rNote.updatedAt).getTime() : 0;
        const chosen = rTime >= lTime ? rNote : lNote;
        mergedNotes.push(chosen);
        notesUpdated++;
      }
    } else if (lNote && !rNote) {
      if (!bNote || bNote.content !== lNote.content) {
        mergedNotes.push(lNote);
      }
    } else if (!lNote && rNote) {
      mergedNotes.push(rNote);
      notesUpdated++;
    }
  }

  // 5. Union merge People, Teams, Categories
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

  // 6. Assemble Merged Plan
  const localRev = Number(local.meta?.revision || local.meta?.sync?.revision || 0);
  const remoteRev = Number(remote.meta?.revision || remote.meta?.sync?.revision || 0);
  const baseRev = Number(safeBase.meta?.revision || safeBase.meta?.sync?.revision || 0);
  const nextRevision = Math.max(localRev, remoteRev, baseRev) + 1;
  const nowIso = new Date().toISOString();

  const mergedData: JanttData = {
    ...remote,
    meta: {
      ...remote.meta,
      ...local.meta,
      title: remote.meta?.title || local.meta?.title || "Project Plan",
      revision: nextRevision,
      updatedAt: nowIso,
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
    notes: mergedNotes,
    tasks: mergedTasks
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
      fieldsMerged
    },
    remoteChanged: true,
    localChanged: true
  };
}
