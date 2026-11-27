import { diffDays, isValidISODate, type JanttData, type Task } from "@jantt/core";
import { tGlobal } from "../../i18n";
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
          return tGlobal("services.ai.diff.dateChange", { type: key === "start" ? tGlobal("services.ai.diff.start") : tGlobal("services.ai.diff.finish"), from, to, delta: delta === null ? "" : ` (${delta > 0 ? "+" : ""}${delta}d)` });
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
  if (tasksAdded.length > 0) summaryParts.push(tGlobal("services.ai.diff.added", { count: tasksAdded.length }));
  if (tasksModified.length > 0) summaryParts.push(tGlobal("services.ai.diff.modified", { count: tasksModified.length }));
  if (tasksRemoved.length > 0) summaryParts.push(tGlobal("services.ai.diff.removed", { count: tasksRemoved.length }));
  if (metaChanged.length > 0) summaryParts.push(tGlobal("services.ai.diff.metaUpdated", { keys: metaChanged.join(", ") }));
  if (categoriesChanged) summaryParts.push(tGlobal("services.ai.diff.categoriesUpdated"));
  if (peopleChanged) summaryParts.push(tGlobal("services.ai.diff.peopleUpdated"));
  if (notesChanged) summaryParts.push(tGlobal("services.ai.diff.notesUpdated"));

  for (const key of otherUpdates) summaryParts.push(tGlobal("services.ai.diff.keyUpdated", { key }));
  const summary = summaryParts.length > 0 ? summaryParts.join(" • ") : tGlobal("services.ai.diff.noDifferences");

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
