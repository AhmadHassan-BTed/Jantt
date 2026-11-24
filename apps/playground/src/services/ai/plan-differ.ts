import { diffDays, isValidISODate, type JanttData, type Task } from "@jantt/core";
import type { PlanDiff } from "./types";

function getTaskLabel(task: Task): string {
  return task.label || (task as any).name || task.id;
}

export function computePlanDiff(oldPlan: JanttData | null, newPlan: JanttData): PlanDiff {
  const oldTasks = (oldPlan?.tasks || []).filter((t) => !t._deleted);
  const newTasks = (newPlan.tasks || []).filter((t) => !t._deleted);

  const oldTaskMap = new Map<string, Task>(oldTasks.map((t) => [t.id, t]));
  const newTaskMap = new Map<string, Task>(newTasks.map((t) => [t.id, t]));

  const tasksAdded: string[] = [];
  const tasksRemoved: string[] = [];
  const tasksModified: PlanDiff["tasksModified"] = [];

  // Identify added & modified tasks
  for (const nextTask of newTasks) {
    const prevTask = oldTaskMap.get(nextTask.id);
    if (!prevTask) {
      tasksAdded.push(getTaskLabel(nextTask));
      continue;
    }

    const changedFields: string[] = [];
    const checkedKeys = new Set([...Object.keys(prevTask), ...Object.keys(nextTask)]);
    for (const stamp of ["updatedAt", "updatedBy", "fieldTimestamps"]) checkedKeys.delete(stamp);

    for (const key of checkedKeys) {
      const vOld = prevTask[key];
      const vNew = nextTask[key];
      if (JSON.stringify(vOld) !== JSON.stringify(vNew)) {
        changedFields.push(String(key));
      }
    }

    if (changedFields.length > 0) {
      tasksModified.push({
        id: nextTask.id,
        label: getTaskLabel(nextTask),
        changedFields,
        dateChanges: (["start", "end"] as const).filter(key => changedFields.includes(key)).map(key => {
          const from = prevTask[key], to = nextTask[key];
          const delta = isValidISODate(from) && isValidISODate(to) ? diffDays(from, to) : null;
          return `${key === "start" ? "Start" : "Finish"} ${from} → ${to}${delta === null ? "" : ` (${delta > 0 ? "+" : ""}${delta}d)`}`;
        })
      });
    }
  }

  // Identify removed tasks
  for (const prevTask of oldTasks) {
    if (!newTaskMap.has(prevTask.id)) {
      tasksRemoved.push(getTaskLabel(prevTask));
    }
  }

  // Meta diff
  const metaChanged: string[] = [];
  const beforeMeta = oldPlan?.meta || {}, afterMeta = newPlan.meta || {};
  const bookkeeping = new Set(["revision", "contentHash", "sync", "updatedAt", "tombstones"]);
  for (const key of new Set([...Object.keys(beforeMeta), ...Object.keys(afterMeta)])) {
    if (!bookkeeping.has(key) && JSON.stringify(beforeMeta[key]) !== JSON.stringify(afterMeta[key])) metaChanged.push(key);
  }

  const categoriesChanged = JSON.stringify(oldPlan?.categories || {}) !== JSON.stringify(newPlan.categories || {});
  const peopleChanged = JSON.stringify(oldPlan?.people || []) !== JSON.stringify(newPlan.people || []);
  const otherUpdates = ["teams", "documents", "calendars"].filter(key => JSON.stringify(oldPlan?.[key]) !== JSON.stringify(newPlan[key]));
  const notesChanged = JSON.stringify(oldPlan?.notes || []) !== JSON.stringify(newPlan.notes || []);

  // Summary generation
  const summaryParts: string[] = [];
  if (tasksAdded.length > 0) summaryParts.push(`Added ${tasksAdded.length} task${tasksAdded.length === 1 ? "" : "s"}`);
  if (tasksModified.length > 0) summaryParts.push(`Modified ${tasksModified.length} task${tasksModified.length === 1 ? "" : "s"}`);
  if (tasksRemoved.length > 0) summaryParts.push(`Removed ${tasksRemoved.length} task${tasksRemoved.length === 1 ? "" : "s"}`);
  if (metaChanged.length > 0) summaryParts.push(`Updated project meta (${metaChanged.join(", ")})`);
  if (categoriesChanged) summaryParts.push("Updated categories");
  if (peopleChanged) summaryParts.push("Updated people / teams");
  if (notesChanged) summaryParts.push("Updated notes");

  for (const key of otherUpdates) summaryParts.push(`Updated ${key}`);
  const summary = summaryParts.length > 0 ? summaryParts.join(" • ") : "No structural differences detected";

  return {
    tasksAdded,
    tasksRemoved,
    tasksModified,
    metaChanged,
    categoriesChanged,
    peopleChanged,
    notesChanged,
    summary
  };
}
