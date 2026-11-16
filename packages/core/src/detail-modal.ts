import { Task, CategoriesMap } from "./types";
import { createTaskSidebar, TaskSidebarOptions } from "./sidebar";

export interface DetailModalOptions {
  task: Task;
  categories: CategoriesMap;
  theme?: Record<string, string>;
  themeClassName?: string;
  /** Other tasks of the plan, offered as prerequisites. */
  allTasks?: Task[];
  readOnly?: boolean;
  onSave: (updatedTask: Task) => void;
  onClose: () => void;
  onError?: (error: Error) => void;
  customRenderer?: TaskSidebarOptions["customRenderer"];
}

/**
 * Opens the task editor as a modal overlay.
 *
 * @deprecated Kept for backward compatibility: this is the overlay variant of
 * {@link createTaskSidebar} (same editor, escaping, read-only and lock rules). Use that instead.
 */
export function createDetailModal(options: DetailModalOptions): { close: () => void } {
  const { close } = createTaskSidebar(options);
  return { close };
}
