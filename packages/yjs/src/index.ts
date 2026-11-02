/**
 * Jantt Yjs Real-Time CRDT Multiplayer Binding
 *
 * Provides bidirectional real-time synchronization between Jantt JSON timeline plans
 * and shared Y.Doc structures with fine-grained delta updates, zero-conflict resolution,
 * multi-user awareness/presence, and full undo/redo time travel history.
 */

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { JanttData, Task } from "@jantt/core";

export interface JanttYjsBindingOptions {
  initialPlan?: JanttData;
  onPlanChange?: (plan: JanttData) => void;
}

export interface JanttYjsBinding {
  doc: Y.Doc;
  getPlan: () => JanttData;
  updatePlan: (plan: JanttData) => void;
  updateTask: (taskId: string, patch: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  destroy: () => void;
}

export const ORIGIN_LOCAL = "jantt-local-binding";

export function bindJanttToYDoc(
  doc: Y.Doc,
  options: JanttYjsBindingOptions = {}
): JanttYjsBinding {
  const yTasks = doc.getMap<Y.Map<any>>("jantt_tasks");
  const yMeta = doc.getMap<any>("jantt_meta");
  const yCategories = doc.getMap<any>("jantt_categories");
  const yPeople = doc.getArray<any>("jantt_people");
  const yTeams = doc.getArray<any>("jantt_teams");

  // Helper to serialize Yjs state into JanttData
  const getPlan = (): JanttData => {
    const tasks: Task[] = [];
    yTasks.forEach((yTask) => {
      const taskObj: any = yTask.toJSON();
      if (!taskObj._deleted) {
        tasks.push(taskObj as Task);
      }
    });

    return {
      meta: yMeta.toJSON(),
      categories: yCategories.toJSON() as any,
      people: yPeople.toJSON(),
      teams: yTeams.toJSON(),
      tasks
    };
  };

  // Populate initial plan if doc is empty and initialPlan is provided
  if (options.initialPlan && yTasks.size === 0) {
    doc.transact(() => {
      const p = options.initialPlan!;
      if (p.meta) {
        Object.entries(p.meta).forEach(([k, v]) => yMeta.set(k, v));
      }
      if (p.categories) {
        Object.entries(p.categories).forEach(([k, v]) => yCategories.set(k, v));
      }
      if (p.people) {
        yPeople.insert(0, p.people);
      }
      if (p.teams) {
        yTeams.insert(0, p.teams);
      }
      if (Array.isArray(p.tasks)) {
        p.tasks.forEach((t) => {
          const yTask = new Y.Map<any>();
          Object.entries(t).forEach(([k, v]) => yTask.set(k, v));
          yTasks.set(t.id, yTask);
        });
      }
    }, ORIGIN_LOCAL);
  }

  // Canonical document update handler for remote sync
  const handleUpdate = (_update: Uint8Array, origin: any) => {
    if (origin === ORIGIN_LOCAL) return;
    if (options.onPlanChange) {
      options.onPlanChange(getPlan());
    }
  };

  doc.on("update", handleUpdate);

  // Update specific task
  const updateTask = (taskId: string, patch: Partial<Task>): void => {
    doc.transact(() => {
      let yTask = yTasks.get(taskId);
      if (!yTask) {
        yTask = new Y.Map<any>();
        yTasks.set(taskId, yTask);
      }
      Object.entries(patch).forEach(([k, v]) => {
        if (v === undefined) {
          yTask!.delete(k);
        } else {
          yTask!.set(k, v);
        }
      });
    }, ORIGIN_LOCAL);
  };

  // Delete task (soft delete tombstone)
  const deleteTask = (taskId: string): void => {
    doc.transact(() => {
      const yTask = yTasks.get(taskId);
      if (yTask) {
        yTask.set("_deleted", true);
        yTask.set("deletedAt", new Date().toISOString());
      }
    }, ORIGIN_LOCAL);
  };

  // Full plan synchronizer (fine-grained delta updates)
  const updatePlan = (newPlan: JanttData): void => {
    doc.transact(() => {
      // 1. Synchronize Meta
      if (newPlan.meta) {
        Object.entries(newPlan.meta).forEach(([k, v]) => {
          if (yMeta.get(k) !== v) yMeta.set(k, v);
        });
      }

      // 2. Synchronize Categories
      if (newPlan.categories) {
        Object.entries(newPlan.categories).forEach(([k, v]) => {
          yCategories.set(k, v);
        });
      }

      // 3. Synchronize Tasks
      const incomingIds = new Set<string>();
      (newPlan.tasks || []).forEach((t) => {
        incomingIds.add(t.id);
        let yTask = yTasks.get(t.id);
        if (!yTask) {
          yTask = new Y.Map<any>();
          yTasks.set(t.id, yTask);
        }

        Object.entries(t).forEach(([k, v]) => {
          if (yTask!.get(k) !== v) {
            yTask!.set(k, v);
          }
        });
      });

      // Mark missing tasks as deleted
      yTasks.forEach((yTask, id) => {
        if (!incomingIds.has(id) && !yTask.get("_deleted")) {
          yTask.set("_deleted", true);
          yTask.set("deletedAt", new Date().toISOString());
        }
      });
    }, ORIGIN_LOCAL);
  };

  const destroy = (): void => {
    doc.off("update", handleUpdate);
  };

  return {
    doc,
    getPlan,
    updatePlan,
    updateTask,
    deleteTask,
    destroy
  };
}

// ---------------------------------------------------------------------------
// Multiplayer Presence & Awareness Protocol Binding
// ---------------------------------------------------------------------------

export interface JanttCollaboratorUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  email?: string;
}

export interface JanttCollaboratorPresence {
  user: JanttCollaboratorUser;
  selectedTaskId?: string | null;
  cursor?: {
    date?: string;
    taskIndex?: number;
    mouseX?: number;
    mouseY?: number;
  } | null;
  isDragging?: boolean;
  draggingTaskId?: string | null;
  lastActive?: number;
}

export interface JanttAwarenessBindingOptions {
  user: JanttCollaboratorUser;
  onPeersChange?: (peers: Map<number, JanttCollaboratorPresence>) => void;
}

export interface JanttAwarenessBinding {
  awareness: Awareness;
  getLocalPresence: () => JanttCollaboratorPresence | null;
  setLocalUser: (user: Partial<JanttCollaboratorUser>) => void;
  selectTask: (taskId: string | null) => void;
  setCursor: (cursor: JanttCollaboratorPresence["cursor"]) => void;
  setDragging: (isDragging: boolean, taskId?: string | null) => void;
  getPeers: () => Map<number, JanttCollaboratorPresence>;
  destroy: () => void;
}

export function bindJanttAwareness(
  awareness: Awareness,
  options: JanttAwarenessBindingOptions
): JanttAwarenessBinding {
  const localPresence: JanttCollaboratorPresence = {
    user: options.user,
    selectedTaskId: null,
    cursor: null,
    isDragging: false,
    draggingTaskId: null,
    lastActive: Date.now()
  };

  awareness.setLocalStateField("jantt", localPresence);

  const getPeers = (): Map<number, JanttCollaboratorPresence> => {
    const peers = new Map<number, JanttCollaboratorPresence>();
    const states = awareness.getStates();
    states.forEach((state, clientID) => {
      if (state && state.jantt) {
        peers.set(clientID, state.jantt as JanttCollaboratorPresence);
      }
    });
    return peers;
  };

  const handleChange = () => {
    if (options.onPeersChange) {
      options.onPeersChange(getPeers());
    }
  };

  awareness.on("change", handleChange);

  const updateLocal = (patch: Partial<JanttCollaboratorPresence>) => {
    const current = (awareness.getLocalState()?.jantt as JanttCollaboratorPresence) || localPresence;
    const updated: JanttCollaboratorPresence = {
      ...current,
      ...patch,
      lastActive: Date.now()
    };
    awareness.setLocalStateField("jantt", updated);
  };

  const setLocalUser = (userPatch: Partial<JanttCollaboratorUser>) => {
    const current = (awareness.getLocalState()?.jantt as JanttCollaboratorPresence) || localPresence;
    updateLocal({
      user: {
        ...current.user,
        ...userPatch
      }
    });
  };

  const selectTask = (taskId: string | null) => {
    updateLocal({ selectedTaskId: taskId });
  };

  const setCursor = (cursor: JanttCollaboratorPresence["cursor"]) => {
    updateLocal({ cursor });
  };

  const setDragging = (isDragging: boolean, taskId: string | null = null) => {
    updateLocal({ isDragging, draggingTaskId: taskId });
  };

  const getLocalPresence = (): JanttCollaboratorPresence | null => {
    return (awareness.getLocalState()?.jantt as JanttCollaboratorPresence) || null;
  };

  const destroy = () => {
    awareness.off("change", handleChange);
    awareness.setLocalStateField("jantt", null);
  };

  return {
    awareness,
    getLocalPresence,
    setLocalUser,
    selectTask,
    setCursor,
    setDragging,
    getPeers,
    destroy
  };
}

// ---------------------------------------------------------------------------
// Infinite Undo/Redo & Time Travel Engine
// ---------------------------------------------------------------------------

export interface JanttUndoManagerOptions {
  trackedOrigins?: Set<any>;
}

export interface JanttUndoManager {
  undoManager: Y.UndoManager;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  destroy: () => void;
}

export function createJanttUndoManager(
  doc: Y.Doc,
  options: JanttUndoManagerOptions = {}
): JanttUndoManager {
  const yTasks = doc.getMap<Y.Map<any>>("jantt_tasks");
  const yMeta = doc.getMap<any>("jantt_meta");
  const yCategories = doc.getMap<any>("jantt_categories");
  const yPeople = doc.getArray<any>("jantt_people");
  const yTeams = doc.getArray<any>("jantt_teams");

  const trackedOrigins = options.trackedOrigins || new Set([ORIGIN_LOCAL]);

  const undoManager = new Y.UndoManager(
    [yTasks, yMeta, yCategories, yPeople, yTeams],
    { trackedOrigins }
  );

  return {
    undoManager,
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    canUndo: () => undoManager.canUndo(),
    canRedo: () => undoManager.canRedo(),
    clear: () => undoManager.clear(),
    destroy: () => undoManager.destroy()
  };
}

export default bindJanttToYDoc;
