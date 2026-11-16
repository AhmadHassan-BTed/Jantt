import type { JanttData, Person } from "@jantt/core";

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  data: JanttData;
  /** Where the plan lives: only on this device, or as the offline copy of a cloud room. */
  source?: "local" | "room";
  roomId?: string;
  secretKey?: string;
  role?: "collaborator" | "viewer";
  /**
   * Sync base of a room copy: `calculatePlanHash` of the last state the room acknowledged.
   * Written by room sync together with `revision` and the data, so after a reload it tells
   * unsynced local edits apart from the acknowledged room state.
   */
  etag?: string | null;
  /** Room revision of the last acknowledged state (see `etag`). */
  revision?: number;
  lastSyncedAt?: string;
  syncError?: string;
  /** Hash of the share-link payload this plan was imported from (dedupes re-opened links). */
  importedFromHash?: string;
  /** Room this local copy was made from; opening "Make a local copy" again reuses the copy. */
  forkedFromRoomId?: string;
}

export type DateFilterMode = "all" | "today" | "week" | "date" | "range";
export type CompletedFilterMode = "show" | "dim" | "filter";
export type ActiveView = "gantt" | "canvas" | "kanban" | "tasks" | "summary" | "notes";

export type KanbanSortField = "priority" | "start" | "end" | "wbs" | "assignee" | "progress" | "name";
export interface KanbanSortRule {
  field: KanbanSortField;
  direction: "asc" | "desc";
}

export type SortDirection = "asc" | "desc" | null;
export interface SummarySortConfig {
  column: string;
  direction: SortDirection;
}

export type AutoSaveInterval = "5s" | "10s" | "30s" | "60s" | "immediate" | "off";

export interface EffectivePerson extends Person {
  isInferred?: boolean;
}
