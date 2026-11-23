import { useRef, useEffect, useCallback, useState } from "react";
import {
  type Task,
  type JanttData,
  type ThemeDefinition,
  createTaskSidebar,
  resolveSchedule
} from "@jantt/core";
import type { ActiveView } from "../types";
import { commandBus } from "../services/bus";
import { deleteTasks, getPeerId, isAutoCascadeEnabled } from "../utils";

interface UseTaskDetailSidebarOptions {
  parsedData: JanttData | null;
  activeTheme: ThemeDefinition;
  activeView: ActiveView;
  handleChartCommit: (data: JanttData) => void;
  readOnly?: boolean;
  onPromptFork?: () => void;
  /** Auto-Cascade toggle. When omitted, the persisted preference is used. */
  autoCascade?: boolean;
}

/** Keys the sidebar never edits; ignored when diffing the edited task. */
const NON_EDITABLE_KEYS = new Set(["id", "fieldTimestamps", "updatedAt", "updatedBy"]);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmptyObject(value: unknown): boolean {
  return value === undefined || (Boolean(value) && typeof value === "object" && Object.keys(value as object).length === 0);
}

/** Fields the user changed in the sidebar, relative to the task as it was when opened. */
function editedFields(original: Task, edited: Task): Partial<Task> {
  const patch: Partial<Task> = {};
  const keys = new Set([...Object.keys(original), ...Object.keys(edited)]);
  keys.forEach((key) => {
    if (NON_EDITABLE_KEYS.has(key)) return;
    const before = original[key];
    const after = edited[key];
    // The sidebar normalizes a missing `fields` map to {}: not an edit
    if (key === "fields" && isEmptyObject(before) && isEmptyObject(after)) return;
    if (!sameValue(before, after)) patch[key] = after;
  });
  return patch;
}

export function useTaskDetailSidebar({
  parsedData,
  activeTheme,
  activeView,
  handleChartCommit,
  readOnly = false,
  onPromptFork,
  autoCascade
}: UseTaskDetailSidebarOptions) {
  const activeSidebarRef = useRef<{ close: () => void } | null>(null);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;
  const activeThemeRef = useRef(activeTheme);
  activeThemeRef.current = activeTheme;
  // Read at event time: permissions and handlers change after the sidebar was opened
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const onPromptForkRef = useRef(onPromptFork);
  onPromptForkRef.current = onPromptFork;
  const handleChartCommitRef = useRef(handleChartCommit);
  handleChartCommitRef.current = handleChartCommit;
  const autoCascadeRef = useRef(autoCascade);
  autoCascadeRef.current = autoCascade;

  const closeSidebar = useCallback(() => {
    const sidebar = activeSidebarRef.current;
    activeSidebarRef.current = null;
    setIsTaskDetailOpen(false);
    try {
      sidebar?.close();
    } catch {
      // Ignore
    }
  }, []);

  // Close sidebar drawer when unmounting, switching view, switching plan or when the
  // permission level changes (an open drawer must never save into another plan or role)
  useEffect(() => closeSidebar, [closeSidebar]);

  useEffect(() => {
    closeSidebar();
  }, [activeView, readOnly, closeSidebar]);

  useEffect(() => commandBus.on("ACTIVE_PROJECT_CHANGED", closeSidebar), [closeSidebar]);

  const openTaskDetailSidebar = useCallback(
    (task: Task) => {
      closeSidebar();
      // Remove any lingering sidebar backdrops if present
      document.querySelectorAll(".jantt-sidebar-backdrop").forEach((el) => {
        el.parentNode?.removeChild(el);
      });

      const openedWith = parsedDataRef.current;
      if (!openedWith) return;
      // Baseline for the diff: the task the drawer was opened with. The drawer saves
      // `{ ...task, ...userChanges }`, so diffing against this copy yields exactly the user's
      // changes; diffing against the stored task would also write back whatever the calling
      // view derived or left out (synced progress, layout copies, slim projections).
      let original: Task = JSON.parse(JSON.stringify(task));

      const reschedule = (tasks: Task[], data: JanttData) =>
        (autoCascadeRef.current ?? isAutoCascadeEnabled())
          ? resolveSchedule(tasks, data.meta?.defaultGapDays ?? 2)
          : tasks;

      const sidebarInstance = createTaskSidebar({
        task,
        allTasks: openedWith.tasks,
        categories: openedWith.categories || {},
        theme: activeThemeRef.current.vars,
        themeClassName: activeThemeRef.current.className,
        readOnly: readOnlyRef.current,
        onClose: () => {
          if (activeSidebarRef.current === sidebarInstance) activeSidebarRef.current = null;
          setIsTaskDetailOpen(false);
        },
        onSave: (updatedTask) => {
          if (readOnlyRef.current) {
            onPromptForkRef.current?.();
            return;
          }
          const currentData = parsedDataRef.current;
          if (!currentData) return;
          const patch = editedFields(original, updatedTask);
          original = JSON.parse(JSON.stringify(updatedTask));
          if (Object.keys(patch).length === 0) return;
          // Merge only the edited fields into the current task, so edits made elsewhere
          // (including collaborators) since the drawer opened are kept
          if (!currentData.tasks.some((t) => t.id === updatedTask.id)) return;
          const nextTasks = currentData.tasks.map((t) => (t.id === updatedTask.id ? { ...t, ...patch } : t));
          handleChartCommitRef.current({ ...currentData, tasks: reschedule(nextTasks, currentData) });
        },
        onDelete: (taskId) => {
          if (readOnlyRef.current) {
            onPromptForkRef.current?.();
            return;
          }
          const currentData = parsedDataRef.current;
          if (!currentData) return;
          const pruned = deleteTasks(currentData, [taskId], `${new Date().toISOString()}#${getPeerId()}`);
          handleChartCommitRef.current({ ...pruned, tasks: reschedule(pruned.tasks, pruned) });
        }
      });

      activeSidebarRef.current = sidebarInstance;
      setIsTaskDetailOpen(true);
    },
    [closeSidebar]
  );

  return {
    openTaskDetailSidebar,
    isTaskDetailOpen,
    closeTaskDetailSidebar: closeSidebar
  };
}
