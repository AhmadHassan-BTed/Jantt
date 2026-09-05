import { themeManager, type JanttData } from "@jantt/core";
import type { SavedProject, AutoSaveInterval } from "./types";
import masterTemplateFixture from "../../../examples/master-template.json";

export const DEFAULT_TEMPLATE: SavedProject = {
  id: "default",
  name: "Master Specification & Benchmark Cheatsheet",
  updatedAt: "2026-08-31T00:00:00.000Z",
  data: masterTemplateFixture as JanttData
};

export const AVAILABLE_THEMES = themeManager.getAllThemes();

export const PRIORITY_ORDER: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  "": 0
};

export const STORAGE_KEYS = {
  CUSTOM_PROJECTS: "jantt_custom_projects",
  ACTIVE_PROJECT_ID: "jantt_active_project_id",
  ACTIVE_JSON: "jantt_saved_json",
  THEME: "jantt_saved_theme",
  SCALE: "jantt_saved_scale",
  ROUTING: "jantt_saved_routing",
  ROW_HEIGHT_MODE: "jantt_saved_row_height_mode",
  ROW_HEIGHT: "jantt_saved_row_height",
  CRITICAL: "jantt_saved_critical",
  BASELINES: "jantt_saved_baselines",
  VIEW: "jantt_saved_view",
  SIDEBAR_COLLAPSED: "jantt_saved_sidebar_collapsed",
  SIDEBAR_WIDTH: "jantt_saved_sidebar_width",
  KANBAN_SORT: "jantt_kanban_sort",
  PERSON_FILTER: "jantt_person_filter",
  DATE_FILTER_MODE: "jantt_date_filter_mode",
  COMPLETED_FILTER_MODE: "jantt_completed_filter_mode",
  AUTOSAVE_INTERVAL: "jantt_autosave_interval",
  AUTO_CASCADE: "jantt_saved_auto_cascade",
  ROOM_SECRET_KEYS: "jantt_room_secret_keys"
};

export const AUTOSAVE_OPTIONS: { id: AutoSaveInterval; label: string; desc: string; recommended?: boolean }[] = [
  { id: "5s", label: "5 Seconds", desc: "Recommended. Ideal balance of real-time safety and typing fluidity.", recommended: true },
  { id: "10s", label: "10 Seconds", desc: "Comfortable batch interval for steady workflows." },
  { id: "30s", label: "30 Seconds", desc: "Relaxed batching for large schedules." },
  { id: "60s", label: "1 Minute", desc: "Periodic checkpoint saves." },
  { id: "immediate", label: "Immediate (0s)", desc: "Synchronously persists on every keystroke and drag." },
  { id: "off", label: "Disabled (Manual Only)", desc: "Never auto-saves. Persists only when you click Save Now." }
];

export const PERSON_COLORS = ["#4FAE93", "#38BDF8", "#F59E0B", "#A78BFA", "#F43F5E", "#10B981", "#FB923C", "#60A5FA"];
