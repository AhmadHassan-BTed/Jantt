import { useRef, useEffect, useCallback } from "react";
import {
  type Task,
  type JanttData,
  type ThemeDefinition,
  createTaskSidebar,
  resolveSchedule,
  getTaskDependencies
} from "@jantt/core";
import type { ActiveView } from "../types";

interface UseTaskDetailSidebarOptions {
  parsedData: JanttData | null;
  activeTheme: ThemeDefinition;
  activeView: ActiveView;
  handleChartCommit: (data: JanttData) => void;
}

export function useTaskDetailSidebar({
  parsedData,
  activeTheme,
  activeView,
  handleChartCommit
}: UseTaskDetailSidebarOptions) {
  const activeSidebarRef = useRef<{ close: () => void } | null>(null);
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;
  const activeThemeRef = useRef(activeTheme);
  activeThemeRef.current = activeTheme;

  // Close sidebar drawer if open when unmounting or switching view
  useEffect(() => {
    return () => {
      activeSidebarRef.current?.close();
    };
  }, []);

  useEffect(() => {
    activeSidebarRef.current?.close();
  }, [activeView]);

  const openTaskDetailSidebar = useCallback(
    (task: Task) => {
      if (activeSidebarRef.current) {
        try {
          activeSidebarRef.current.close();
        } catch {
          // Ignore
        }
        activeSidebarRef.current = null;
      }
      // Remove any lingering sidebar backdrops if present
      document.querySelectorAll(".jantt-sidebar-backdrop").forEach((el) => {
        el.parentNode?.removeChild(el);
      });

      if (!parsedDataRef.current) return;

      const sidebarInstance = createTaskSidebar({
        task,
        allTasks: parsedDataRef.current.tasks,
        categories: parsedDataRef.current.categories || {},
        theme: activeThemeRef.current.vars,
        themeClassName: activeThemeRef.current.className,
        onClose: () => {
          activeSidebarRef.current = null;
        },
        onSave: (updatedTask) => {
          const currentData = parsedDataRef.current;
          if (!currentData) return;
          const nextTasks = currentData.tasks.map((t) =>
            t.id === updatedTask.id ? updatedTask : t
          );
          const resolved = resolveSchedule(nextTasks, currentData.meta?.defaultGapDays ?? 2);
          handleChartCommit({ ...currentData, tasks: resolved });
        },
        onDelete: (taskId) => {
          const currentData = parsedDataRef.current;
          if (!currentData) return;
          const nextTasks = currentData.tasks.filter((t) => t.id !== taskId);
          nextTasks.forEach((t) => {
            const remaining = getTaskDependencies(t).filter((id) => id !== taskId);
            if (remaining.length === 0) {
              t.dependsOn = null;
            } else if (remaining.length === 1) {
              t.dependsOn = remaining[0];
            } else {
              t.dependsOn = remaining;
            }
          });
          const resolved = resolveSchedule(nextTasks, currentData.meta?.defaultGapDays ?? 2);
          handleChartCommit({ ...currentData, tasks: resolved });
        }
      });

      activeSidebarRef.current = sidebarInstance;
    },
    [handleChartCommit]
  );

  return {
    openTaskDetailSidebar
  };
}
