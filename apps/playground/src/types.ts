import type { JanttData, Person } from "@jantt/core";

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  data: JanttData;
  source?: "local" | "linked" | "template";
  sourceUrl?: string;
  lastSyncedAt?: string;
  syncError?: string;
}

export type DateFilterMode = "all" | "today" | "week" | "date" | "range";
export type ActiveView = "gantt" | "kanban" | "tasks" | "summary";

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
