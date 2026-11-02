/**
 * Jantt Yjs Real-Time CRDT Multiplayer Binding
 *
 * Provides bidirectional real-time synchronization between Jantt JSON timeline plans
 * and shared Y.Doc structures with fine-grained delta updates and zero-conflict resolution.
 */

import * as Y from "yjs";
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

const ORIGIN_LOCAL = "jantt-local-binding";

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

  // Delete task
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

export default bindJanttToYDoc;
