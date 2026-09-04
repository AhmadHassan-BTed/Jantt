import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  JanttData,
  Task,
  Person,
  Team,
  validate,
  ValidationResult,
  TimeScale,
  LinkRoutingStyle,
  RowHeightMode,
  themeManager,
  ThemeDefinition,
  downloadCsv,
  getTodayISODate,
  addDays,
  resolveSchedule,
  isTaskOnDate,
  resolveTeamById,
  resolveTaskAssignee,
  fetchRemotePlan,
  RemoteFetchResult,
  createTaskSidebar,
  getTaskDependencies
} from "@jantt/core";

import { Jantt } from "@jantt/react";

import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Download,
  X,
  FileJson,
  Layers,
  Zap,
  ChevronLeft,
  Kanban,
  PieChart,
  DollarSign,
  Calendar,
  TrendingUp,
  Users,
  Clock,
  FileSpreadsheet,
  RotateCcw,
  FolderPlus,
  Trash2,
  Upload,
  Plus,
  Info,
  FilePlus,
  SortAsc,
  Cloud,
  RefreshCw,
  ExternalLink,
  Link2,
  GitFork,
  Globe,
  Loader2,
  CheckSquare,
  ListTodo,
  Filter,
  EyeOff,
  Share2,
  Lightbulb,
  ArrowUp,
  ArrowDown,
  Save,
  HardDrive
} from "lucide-react";

import { JanttLogo, JanttIcon } from "./components/JanttLogo";
import masterTemplateFixture from "../../../examples/master-template.json";

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

export function formatRelativeTime(isoStr?: string): string {
  if (!isoStr) return "Never";
  try {
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 5) return "Just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return isoStr;
  }
}


const DEFAULT_TEMPLATE: SavedProject = {
  id: "default",
  name: "Master Specification & Benchmark Cheatsheet",
  updatedAt: "2026-08-31T00:00:00.000Z",
  data: masterTemplateFixture as JanttData
};

const AVAILABLE_THEMES = themeManager.getAllThemes();

function createBlankPlan(title: string): JanttData {
  const today = getTodayISODate();
  return {
    meta: {
      title: title || "New Project Plan",
      scale: "week",
      showCriticalPath: true,
      showBaselines: true
    },
    categories: {
      general: {
        label: "General Tasks",
        color: "#38BDF8",
        soft: "rgba(56, 189, 248, 0.15)"
      }
    },
    tasks: [
      {
        id: "task-1",
        label: "Project Kickoff & Scope",
        category: "general",
        start: today,
        end: addDays(today, 5),
        assignee: "Project Lead",
        phase: "Phase 1: Planning",
        priority: "high",
        progress: 0.25,
        status: "in-progress"
      }
    ]
  };
}

// ── Type Declarations ──────────────────────────────────────────────────────
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

// Priority ordering for multi-sort (higher = more urgent)
export const PRIORITY_ORDER: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  "": 0
};

const STORAGE_KEYS = {
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
  AUTOSAVE_INTERVAL: "jantt_autosave_interval",
  AUTO_CASCADE: "jantt_saved_auto_cascade"
};

export type AutoSaveInterval = "5s" | "10s" | "30s" | "60s" | "immediate" | "off";

export const AUTOSAVE_OPTIONS: { id: AutoSaveInterval; label: string; desc: string; recommended?: boolean }[] = [
  { id: "5s", label: "5 Seconds", desc: "Recommended. Ideal balance of real-time safety and typing fluidity.", recommended: true },
  { id: "10s", label: "10 Seconds", desc: "Comfortable batch interval for steady workflows." },
  { id: "30s", label: "30 Seconds", desc: "Relaxed batching for large schedules." },
  { id: "60s", label: "1 Minute", desc: "Periodic checkpoint saves." },
  { id: "immediate", label: "Immediate (0s)", desc: "Synchronously persists on every keystroke and drag." },
  { id: "off", label: "Disabled (Manual Only)", desc: "Never auto-saves. Persists only when you click Save Now." }
];


function loadSavedProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveCustomProjects(projects: SavedProject[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, JSON.stringify(projects));
  } catch {}
}

export function encodeDataToBase64Url(data: JanttData): string {
  try {
    const jsonStr = JSON.stringify(data);
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    let binary = "";
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (err) {
    console.error("Failed to encode plan data to base64url:", err);
    return "";
  }
}

export function decodeDataFromBase64Url(base64url: string): JanttData | null {
  try {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonStr);
    const val = validate(parsed);
    if (val.valid) return parsed;
    return null;
  } catch (err) {
    console.error("Failed to decode plan data from base64url:", err);
    return null;
  }
}

function loadInitialState() {
  const savedProjects = loadSavedProjects();
  let activeProjectId = "default";
  try {
    const savedId = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    if (savedId && (savedId === "default" || savedProjects.some((p) => p.id === savedId))) {
      activeProjectId = savedId;
    }
  } catch {}

  let initialParsed: JanttData = DEFAULT_TEMPLATE.data;
  if (activeProjectId !== "default") {
    const found = savedProjects.find((p) => p.id === activeProjectId);
    if (found) initialParsed = found.data;
  }

  let initialJson = JSON.stringify(initialParsed, null, 2);

  try {
    const savedJson = localStorage.getItem(STORAGE_KEYS.ACTIVE_JSON);
    if (savedJson) {
      const parsed = JSON.parse(savedJson);
      const val = validate(parsed);
      if (val.valid) {
        initialJson = savedJson;
        initialParsed = parsed;
      }
    }
  } catch {}

  let initialTheme = "swiss-light";
  try {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme && themeManager.getTheme(savedTheme)) initialTheme = savedTheme;
  } catch {}

  let initialScale: TimeScale = "week";
  try {
    const savedScale = localStorage.getItem(STORAGE_KEYS.SCALE) as TimeScale;
    if (savedScale && ["day", "week", "month", "quarter", "year"].includes(savedScale)) {
      initialScale = savedScale;
    } else if (initialParsed?.meta?.scale) {
      initialScale = initialParsed.meta.scale;
    }
  } catch {}

  let initialRouting: LinkRoutingStyle = "orthogonal";
  try {
    const savedRouting = localStorage.getItem(STORAGE_KEYS.ROUTING) as LinkRoutingStyle;
    if (savedRouting && ["orthogonal", "curved", "direct"].includes(savedRouting)) {
      initialRouting = savedRouting;
    }
  } catch {}

  let initialRowHeightMode: RowHeightMode = "fit";
  try {
    const savedMode = localStorage.getItem(STORAGE_KEYS.ROW_HEIGHT_MODE) as RowHeightMode;
    if (savedMode && ["fit", "custom"].includes(savedMode)) initialRowHeightMode = savedMode;
  } catch {}

  let initialRowHeight = 46;
  try {
    const savedHeight = localStorage.getItem(STORAGE_KEYS.ROW_HEIGHT);
    if (savedHeight) initialRowHeight = parseInt(savedHeight, 10) || 46;
  } catch {}

  let initialCritical = true;
  try {
    const savedCrit = localStorage.getItem(STORAGE_KEYS.CRITICAL);
    if (savedCrit !== null) initialCritical = savedCrit === "true";
  } catch {}

  let initialBaselines = true;
  try {
    const savedBase = localStorage.getItem(STORAGE_KEYS.BASELINES);
    if (savedBase !== null) initialBaselines = savedBase === "true";
  } catch {}

  let initialAutoCascade = true;
  try {
    const savedCascade = localStorage.getItem(STORAGE_KEYS.AUTO_CASCADE);
    if (savedCascade !== null) initialAutoCascade = savedCascade === "true";
  } catch {}

  let initialView: ActiveView = "gantt";
  try {
    const savedView = localStorage.getItem(STORAGE_KEYS.VIEW) as any;
    if (savedView === "today") initialView = "tasks";
    else if (savedView && ["gantt", "kanban", "summary", "tasks"].includes(savedView)) initialView = savedView;
  } catch {}

  let initialCollapsed = false;
  try {
    const savedCol = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
    if (savedCol !== null) initialCollapsed = savedCol === "true";
  } catch {}

  let initialWidth = 480;
  try {
    const savedW = localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH);
    if (savedW) initialWidth = parseInt(savedW, 10) || 480;
  } catch {}

  // Restore kanban multi-sort rules
  const DEFAULT_KANBAN_SORT: KanbanSortRule[] = [
    { field: "priority", direction: "desc" },
    { field: "start", direction: "asc" }
  ];
  let initialKanbanSort: KanbanSortRule[] = DEFAULT_KANBAN_SORT;
  try {
    const savedSort = localStorage.getItem(STORAGE_KEYS.KANBAN_SORT);
    if (savedSort) {
      const parsed = JSON.parse(savedSort);
      if (Array.isArray(parsed) && parsed.length > 0) initialKanbanSort = parsed;
    }
  } catch {}

  // Restore person filter
  let initialPersonFilter = "all";
  try {
    const savedPF = localStorage.getItem(STORAGE_KEYS.PERSON_FILTER);
    if (savedPF) initialPersonFilter = savedPF;
  } catch {}

  // Restore date filter mode
  let initialDateFilterMode: DateFilterMode = "all";
  try {
    const savedDFM = localStorage.getItem(STORAGE_KEYS.DATE_FILTER_MODE) as DateFilterMode;
    if (savedDFM && ["all", "today", "week", "date", "range"].includes(savedDFM)) initialDateFilterMode = savedDFM;
  } catch {}

  // Check URL share params (?view=, ?theme=, ?scale=, #data=, ?data=, ?plan=default)
  if (typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;

      const viewParam = urlParams.get("view");
      if (viewParam && ["gantt", "kanban", "summary", "tasks"].includes(viewParam)) {
        initialView = viewParam as ActiveView;
      }

      const themeParam = urlParams.get("theme");
      if (themeParam && themeManager.getTheme(themeParam)) {
        initialTheme = themeParam;
      }

      const scaleParam = urlParams.get("scale") as TimeScale;
      if (scaleParam && ["day", "week", "month", "quarter", "year"].includes(scaleParam)) {
        initialScale = scaleParam;
      }

      let dataPayload: string | null = null;
      if (hash) {
        const rawHash = hash.replace(/^#/, "");
        if (rawHash.startsWith("data=")) {
          dataPayload = rawHash.substring(5);
        } else {
          const hp = new URLSearchParams(rawHash);
          if (hp.get("data")) dataPayload = hp.get("data");
        }
      }
      if (!dataPayload) {
        dataPayload = urlParams.get("data");
      }

      if (dataPayload) {
        const decoded = decodeDataFromBase64Url(dataPayload);
        if (decoded) {
          initialParsed = decoded;
          initialJson = JSON.stringify(decoded, null, 2);
          const sharedName = urlParams.get("name") || decoded.meta?.title || "Shared Plan";
          const sharedId = `shared-${Date.now().toString(36)}`;
          const sharedProj: SavedProject = {
            id: sharedId,
            name: sharedName,
            updatedAt: new Date().toISOString(),
            data: decoded,
            source: "local"
          };
          const existingIndex = savedProjects.findIndex((p) => p.name === sharedName && p.data?.tasks?.length === decoded.tasks?.length);
          if (existingIndex >= 0) {
            savedProjects[existingIndex] = sharedProj;
          } else {
            savedProjects.unshift(sharedProj);
          }
          saveCustomProjects(savedProjects);
          activeProjectId = sharedId;
        }
      } else if (urlParams.get("plan") === "default") {
        activeProjectId = "default";
        initialParsed = DEFAULT_TEMPLATE.data;
        initialJson = JSON.stringify(DEFAULT_TEMPLATE.data, null, 2);
      }
    } catch (err) {
      console.error("Error reading URL share params", err);
    }
  }

  return {
    activeProjectId,
    initialJson,
    initialParsed,
    initialTheme,
    initialScale,
    initialRouting,
    initialRowHeightMode,
    initialRowHeight,
    initialCritical,
    initialBaselines,
    initialAutoCascade,
    initialView,
    initialCollapsed,
    initialWidth,
    initialKanbanSort,
    initialPersonFilter,
    initialDateFilterMode
  };
}

const PERSON_COLORS = ["#4FAE93", "#38BDF8", "#F59E0B", "#A78BFA", "#F43F5E", "#10B981", "#FB923C", "#60A5FA"];

export interface EffectivePerson extends Person {
  isInferred?: boolean;
}

export function getEffectivePeople(data: JanttData | null, registeredPeople: Person[]): EffectivePerson[] {
  const result: EffectivePerson[] = registeredPeople.map((p) => ({ ...p }));
  if (!data) return result;

  const knownIds = new Set(result.map((p) => p.id.toLowerCase()));
  const knownNames = new Set(result.map((p) => p.name.toLowerCase()));

  const discovered = new Map<string, { role?: string }>();

  // 1. From meta.person (Project Lead / Candidate / Owner)
  if (data.meta?.person && typeof data.meta.person === "string" && data.meta.person.trim()) {
    discovered.set(data.meta.person.trim(), { role: "Project Lead / Owner" });
  }

  // 2. From tasks assignee
  if (Array.isArray(data.tasks)) {
    data.tasks.forEach((t) => {
      if (t.assignee && typeof t.assignee === "string" && t.assignee.trim()) {
        const name = t.assignee.trim();
        if (!discovered.has(name)) {
          discovered.set(name, {});
        }
      }
    });
  }

  // 3. From documents owner
  if (Array.isArray(data.documents)) {
    data.documents.forEach((d) => {
      if (d.owner && typeof d.owner === "string" && d.owner.trim()) {
        const name = d.owner.trim();
        if (!discovered.has(name)) {
          discovered.set(name, {});
        }
      }
    });
  }

  let colorIdx = result.length;
  discovered.forEach((metaInfo, name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!knownNames.has(name.toLowerCase()) && !knownIds.has(slug)) {
      result.push({
        id: slug || name,
        name: name,
        role: metaInfo.role,
        color: PERSON_COLORS[colorIdx % PERSON_COLORS.length],
        isInferred: true
      });
      knownNames.add(name.toLowerCase());
      knownIds.add(slug);
      colorIdx++;
    }
  });

  return result;
}

export function App() {
  const init = useMemo(() => loadInitialState(), []);

  const [customProjects, setCustomProjects] = useState<SavedProject[]>(() => loadSavedProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(init.activeProjectId);
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanTemplateType, setNewPlanTemplateType] = useState<"blank" | "master" | "clone">("blank");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedThemeId, setSelectedThemeId] = useState(init.initialTheme);
  const activeTheme: ThemeDefinition = themeManager.getTheme(selectedThemeId) || AVAILABLE_THEMES[0];
  const [jsonText, setJsonText] = useState(init.initialJson);
  const [parsedData, setParsedData] = useState<JanttData | null>(init.initialParsed);
  const [validationResult, setValidationResult] = useState<ValidationResult>(() => validate(init.initialParsed || {}));
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [currentScale, setCurrentScale] = useState<TimeScale>(init.initialScale);
  const [currentDayWidth, setCurrentDayWidth] = useState<number | undefined>(undefined);
  const [linkRouting, setLinkRouting] = useState<LinkRoutingStyle>(init.initialRouting);
  const [rowHeightMode, setRowHeightMode] = useState<RowHeightMode>(init.initialRowHeightMode);
  const [rowHeight, setRowHeight] = useState<number>(init.initialRowHeight);
  const [showCriticalPath, setShowCriticalPath] = useState(init.initialCritical);
  const [showBaselines, setShowBaselines] = useState(init.initialBaselines);
  const [autoCascade, setAutoCascade] = useState<boolean>(init.initialAutoCascade);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(init.initialCollapsed);
  const [activeView, setActiveView] = useState<ActiveView>(init.initialView);

  // ── Date Filter State ──────────────────────────────────────────────────
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>(init.initialDateFilterMode);
  const [dateFilterValue, setDateFilterValue] = useState<string>(getTodayISODate());
  const [dateFilterRangeStart, setDateFilterRangeStart] = useState<string>("");
  const [dateFilterRangeEnd, setDateFilterRangeEnd] = useState<string>("");
  const [dateFilterBehavior, setDateFilterBehavior] = useState<"dim" | "hide">("dim");

  // ── Tasks View State ───────────────────────────────────────────────────
  const [tasksViewMode, setTasksViewMode] = useState<"cards" | "todo">("cards");
  const [tasksSearchQuery, setTasksSearchQuery] = useState<string>("");

  // ── Summary View Sort State ────────────────────────────────────────────
  const [summarySortConfig, setSummarySortConfig] = useState<SummarySortConfig>({ column: "", direction: null });

  // ── Kanban Multi-Sort State ────────────────────────────────────────────
  const [kanbanSortRules, setKanbanSortRules] = useState<KanbanSortRule[]>(init.initialKanbanSort);

  // ── People & Team Management State ─────────────────────────────────────
  const [people, setPeople] = useState<Person[]>(() => (init.initialParsed as any)?.people || []);
  const [teams, setTeams] = useState<Team[]>(() => (init.initialParsed as any)?.teams || []);

  // Auto-derived effective people combining explicitly configured people + assignees discovered in tasks/meta
  const effectivePeople = useMemo(() => {
    return getEffectivePeople(parsedData, people);
  }, [parsedData, people]);
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>(init.initialPersonFilter);
  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [peopleModalTab, setPeopleModalTab] = useState<"people" | "teams">("people");
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState("");
  const [newPersonTeamId, setNewPersonTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamColor, setNewTeamColor] = useState("#38BDF8");
  const [newTeamDesc, setNewTeamDesc] = useState("");

  // ── Cloud Link & Sync State ─────────────────────────────────────────────
  const [showLinkCloudModal, setShowLinkCloudModal] = useState(false);
  const [linkCloudUrl, setLinkCloudUrl] = useState("");
  const [linkCloudName, setLinkCloudName] = useState("");
  const [isFetchingCloudPreview, setIsFetchingCloudPreview] = useState(false);
  const [cloudPreviewResult, setCloudPreviewResult] = useState<RemoteFetchResult | null>(null);
  const [cloudPreviewError, setCloudPreviewError] = useState<string | null>(null);
  const [isSyncingProject, setIsSyncingProject] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isToastError, setIsToastError] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, isErr = false) => {
    setToastMessage(msg);
    setIsToastError(isErr);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Sidebar width resize state
  const [sidebarWidth, setSidebarWidth] = useState(init.initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const isDraggingRef = useRef(false);


  // ── Auto-Save Engine & Configurable Cadence ─────────────────────────────
  const [autoSaveInterval, setAutoSaveInterval] = useState<AutoSaveInterval>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTOSAVE_INTERVAL);
      if (saved && ["5s", "10s", "30s", "60s", "immediate", "off"].includes(saved)) {
        return saved as AutoSaveInterval;
      }
    } catch {}
    return "5s"; // Recommended default
  });

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "pending">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date>(() => new Date());
  const [showAutoSaveModal, setShowAutoSaveModal] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const isFirstMountRef = useRef(true);

  // Sync latest state references for timer and unload flushes
  const jsonTextRef = useRef(jsonText);
  jsonTextRef.current = jsonText;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  // Persist auto-save configuration choice
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTOSAVE_INTERVAL, autoSaveInterval);
    } catch {}
  }, [autoSaveInterval]);

  // Core save execution to browser storage
  const executeSave = useCallback(() => {
    setSaveStatus("saving");
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, jsonTextRef.current);
      if (activeProjectIdRef.current !== "default" && parsedDataRef.current) {
        setCustomProjects((prev) => {
          const updated = prev.map((p) =>
            p.id === activeProjectIdRef.current
              ? { ...p, data: parsedDataRef.current!, updatedAt: new Date().toISOString() }
              : p
          );
          saveCustomProjects(updated);
          return updated;
        });
      }
    } catch (err) {
      console.error("Auto-save error:", err);
    }
    setLastSavedAt(new Date());
    setSaveStatus("saved");
  }, []);

  const handleManualSaveNow = () => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    executeSave();
    showToast("Plan state successfully saved to browser storage!");
  };

  // Immediate flush before tab close / navigation ensures zero lost work
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, jsonTextRef.current);
        if (activeProjectIdRef.current !== "default" && parsedDataRef.current) {
          const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_PROJECTS);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const updated = list.map((p: any) =>
                p.id === activeProjectIdRef.current
                  ? { ...p, data: parsedDataRef.current, updatedAt: new Date().toISOString() }
                  : p
              );
              localStorage.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, JSON.stringify(updated));
            }
          }
        }
      } catch {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Dispatch auto-save according to configured interval
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (autoSaveInterval === "immediate") {
      executeSave();
      return;
    }

    if (autoSaveInterval === "off") {
      setSaveStatus("pending");
      return;
    }

    setSaveStatus("pending");
    const delayMs =
      autoSaveInterval === "5s"
        ? 5000
        : autoSaveInterval === "10s"
        ? 10000
        : autoSaveInterval === "30s"
        ? 30000
        : 60000;

    autoSaveTimerRef.current = window.setTimeout(() => {
      executeSave();
    }, delayMs);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [jsonText, activeProjectId, parsedData, autoSaveInterval, executeSave]);

  // 1-second dynamic relative time ticker
  const [saveTicker, setSaveTicker] = useState(0);
  useEffect(() => {
    const ticker = setInterval(() => setSaveTicker((t) => t + 1), 1000);
    return () => clearInterval(ticker);
  }, []);

  const autoSaveLabel = useMemo(() => {
    if (saveStatus === "saving") return "Saving...";
    if (saveStatus === "pending") return "Unsaved";
    const diffSec = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
    if (diffSec < 5) return "Saved just now";
    if (diffSec < 60) return `Saved ${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Saved ${diffMin}m ago`;
    return `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [saveStatus, lastSavedAt, saveTicker]);

  const storageSizeKb = useMemo(() => {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("jantt_")) {
          total += (localStorage.getItem(k)?.length || 0) * 2;
        }
      }
      return (total / 1024).toFixed(1);
    } catch {
      return "0.0";
    }
  }, [lastSavedAt, showAutoSaveModal]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, activeProjectId);
      localStorage.setItem(STORAGE_KEYS.THEME, selectedThemeId);
      localStorage.setItem(STORAGE_KEYS.SCALE, currentScale);
      localStorage.setItem(STORAGE_KEYS.ROUTING, linkRouting);
      localStorage.setItem(STORAGE_KEYS.ROW_HEIGHT_MODE, rowHeightMode);
      localStorage.setItem(STORAGE_KEYS.ROW_HEIGHT, String(rowHeight));
      localStorage.setItem(STORAGE_KEYS.CRITICAL, String(showCriticalPath));
      localStorage.setItem(STORAGE_KEYS.BASELINES, String(showBaselines));
      localStorage.setItem(STORAGE_KEYS.AUTO_CASCADE, String(autoCascade));
      localStorage.setItem(STORAGE_KEYS.VIEW, activeView);
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(isSidebarCollapsed));
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(sidebarWidth));
    } catch {}
  }, [
    activeProjectId,
    selectedThemeId,
    currentScale,
    linkRouting,
    rowHeightMode,
    rowHeight,
    showCriticalPath,
    showBaselines,
    autoCascade,
    activeView,
    isSidebarCollapsed,
    sidebarWidth
  ]);

  // Persist new state keys
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.KANBAN_SORT, JSON.stringify(kanbanSortRules));
    } catch {}
  }, [kanbanSortRules]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PERSON_FILTER, selectedPersonFilter);
    } catch {}
  }, [selectedPersonFilter]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DATE_FILTER_MODE, dateFilterMode);
    } catch {}
  }, [dateFilterMode]);

  // ── Derived State: Date Filter ────────────────────────────────────────────
  const dateFilterActiveDate = useMemo(() => {
    if (dateFilterMode === "today") return getTodayISODate();
    if (dateFilterMode === "date") return dateFilterValue || null;
    if (dateFilterMode === "range") return dateFilterRangeStart || null;
    return null;
  }, [dateFilterMode, dateFilterValue, dateFilterRangeStart]);

  const isTaskMatchingDateFilter = useCallback((task: Task): boolean => {
    if (dateFilterMode === "all") return true;
    if (dateFilterMode === "today") {
      return isTaskOnDate(task.start, task.end, getTodayISODate());
    }
    if (dateFilterMode === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const distanceToMonday = (dayOfWeek + 6) % 7;
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      const weekStart = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
      const weekEnd = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
      return task.start <= weekEnd && task.end >= weekStart;
    }
    if (dateFilterMode === "date") {
      if (!dateFilterValue) return true;
      return isTaskOnDate(task.start, task.end, dateFilterValue);
    }
    if (dateFilterMode === "range") {
      if (!dateFilterRangeStart && !dateFilterRangeEnd) return true;
      const start = dateFilterRangeStart || "0000-01-01";
      const end = dateFilterRangeEnd || "9999-12-31";
      return task.start <= end && task.end >= start;
    }
    return true;
  }, [dateFilterMode, dateFilterValue, dateFilterRangeStart, dateFilterRangeEnd]);

  const matchingTasksCount = useMemo(() => {
    if (!parsedData) return 0;
    return parsedData.tasks.filter(isTaskMatchingDateFilter).length;
  }, [parsedData, isTaskMatchingDateFilter]);


  // Derived tasks for KPI metrics according to dateFilterBehavior
  const summaryKpiTasks = useMemo(() => {
    if (!parsedData) return [];
    if (dateFilterMode !== "all" && dateFilterBehavior === "hide") {
      return parsedData.tasks.filter(isTaskMatchingDateFilter);
    }
    return parsedData.tasks;
  }, [parsedData, dateFilterMode, dateFilterBehavior, isTaskMatchingDateFilter]);

  const dateFilterActiveSummary = useMemo(() => {
    if (dateFilterMode === "all") return null;
    const total = parsedData?.tasks.length || 0;
    const countText = `${matchingTasksCount} of ${total} tasks active`;
    if (dateFilterMode === "today") return { label: `Today (${getTodayISODate()})`, countText };
    if (dateFilterMode === "week") return { label: `This Week`, countText };
    if (dateFilterMode === "date") return { label: dateFilterValue || "Selected Date", countText };
    if (dateFilterMode === "range") {
      const from = dateFilterRangeStart || "Start";
      const to = dateFilterRangeEnd || "End";
      return { label: `${from} → ${to}`, countText };
    }
    return null;
  }, [dateFilterMode, dateFilterValue, dateFilterRangeStart, dateFilterRangeEnd, matchingTasksCount, parsedData]);

  // ── Derived State: Summary Sorted Tasks (with progress auto-sync) ─────────
  const sortedSummaryTasks = useMemo(() => {
    if (!parsedData) return [];
    let baseTasks = parsedData.tasks;
    if (dateFilterMode !== "all" && dateFilterBehavior === "hide") {
      baseTasks = baseTasks.filter(isTaskMatchingDateFilter);
    }
    // Apply status → progress auto-sync
    let tasks = baseTasks.map((t) => {
      if (t.status === "completed") return { ...t, progress: 1.0 };
      if (t.status === "submitted" && (t.progress ?? 0) < 0.75) return { ...t, progress: 0.75 };
      if (t.status === "not-started" && (t.progress ?? 0) > 0) return { ...t, progress: 0 };
      return t;
    });
    if (!summarySortConfig.column || !summarySortConfig.direction) return tasks;
    const { column, direction } = summarySortConfig;
    const dir = direction === "asc" ? 1 : -1;
    return [...tasks].sort((a, b) => {
      let va: any, vb: any;
      switch (column) {
        case "wbs": va = a.wbs || ""; vb = b.wbs || ""; break;
        case "name": va = (a.label || a.name || a.id).toLowerCase(); vb = (b.label || b.name || b.id).toLowerCase(); break;
        case "category": va = a.category; vb = b.category; break;
        case "assignee": {
          const aInfo = resolveTaskAssignee(a, effectivePeople, teams);
          const bInfo = resolveTaskAssignee(b, effectivePeople, teams);
          va = aInfo.displayName.toLowerCase();
          vb = bInfo.displayName.toLowerCase();
          break;
        }
        case "start": va = a.start; vb = b.start; break;
        case "end": va = a.end; vb = b.end; break;
        case "budget": va = a.estimatedCost || 0; vb = b.estimatedCost || 0; break;
        case "status": va = a.status || "not-started"; vb = b.status || "not-started"; break;
        case "progress": va = a.progress ?? 0; vb = b.progress ?? 0; break;
        default: return 0;
      }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [parsedData, summarySortConfig, effectivePeople, teams]);

  const handleSummarySort = (column: string) => {
    setSummarySortConfig((prev) => {
      if (prev.column === column) {
        if (prev.direction === "asc") return { column, direction: "desc" };
        if (prev.direction === "desc") return { column: "", direction: null };
      }
      return { column, direction: "asc" };
    });
  };

  // ── Kanban Multi-Sort Engine ──────────────────────────────────────────────
  const kanbanMultiSort = useCallback((tasks: Task[]): Task[] => {
    if (kanbanSortRules.length === 0) return tasks;
    return [...tasks].sort((a, b) => {
      for (const rule of kanbanSortRules) {
        let va: any, vb: any;
        const dir = rule.direction === "asc" ? 1 : -1;
        switch (rule.field) {
          case "priority":
            va = PRIORITY_ORDER[a.priority || ""] || 0;
            vb = PRIORITY_ORDER[b.priority || ""] || 0;
            break;
          case "start": va = a.start; vb = b.start; break;
          case "end": va = a.end; vb = b.end; break;
          case "wbs": va = a.wbs || "zzz"; vb = b.wbs || "zzz"; break;
          case "assignee": {
            const aInfo = resolveTaskAssignee(a, effectivePeople, teams);
            const bInfo = resolveTaskAssignee(b, effectivePeople, teams);
            va = aInfo.displayName.toLowerCase();
            vb = bInfo.displayName.toLowerCase();
            break;
          }
          case "progress": va = a.progress ?? 0; vb = b.progress ?? 0; break;
          case "name": va = (a.label || a.name || "").toLowerCase(); vb = (b.label || b.name || "").toLowerCase(); break;
          default: continue;
        }
        const cmp = typeof va === "number" ? (va - vb) * dir : String(va).localeCompare(String(vb)) * dir;
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [kanbanSortRules, effectivePeople, teams]);

  // ── People & Team Management Handlers ─────────────────────────────────────
  const handleAddPerson = () => {
    if (!newPersonName.trim() || !parsedData) return;
    const newPerson: Person = {
      id: `person-${Date.now().toString(36)}`,
      name: newPersonName.trim(),
      role: newPersonRole.trim() || undefined,
      teamId: newPersonTeamId || undefined,
      color: PERSON_COLORS[effectivePeople.length % PERSON_COLORS.length]
    };
    const updated = [...people, newPerson];
    setPeople(updated);
    const updatedData = { ...parsedData, people: updated };
    handleChartCommit(updatedData);
    setNewPersonName("");
    setNewPersonRole("");
    setNewPersonTeamId("");
  };

  const handlePersistPerson = (personToPersist: Person) => {
    if (!parsedData) return;
    const cleanPerson: Person = {
      id: personToPersist.id,
      name: personToPersist.name,
      role: personToPersist.role,
      teamId: personToPersist.teamId,
      color: personToPersist.color || PERSON_COLORS[people.length % PERSON_COLORS.length]
    };
    const updated = [...people, cleanPerson];
    setPeople(updated);
    const updatedData = { ...parsedData, people: updated };
    handleChartCommit(updatedData);
    showToast(`Saved ${personToPersist.name} to project JSON!`);
  };

  const handlePersistAllPeople = () => {
    if (!parsedData) return;
    const cleanPeople: Person[] = effectivePeople.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      teamId: p.teamId,
      color: p.color
    }));
    setPeople(cleanPeople);
    const updatedData = { ...parsedData, people: cleanPeople };
    handleChartCommit(updatedData);
    showToast(`Saved all ${cleanPeople.length} members to project JSON!`);
  };

  const handleRemovePerson = (personId: string) => {
    if (!parsedData) return;
    const updated = people.filter((p) => p.id !== personId);
    setPeople(updated);
    const updatedData = { ...parsedData, people: updated };
    handleChartCommit(updatedData);
  };

  const handleAddTeam = () => {
    if (!newTeamName.trim() || !parsedData) return;
    const newTeam: Team = {
      id: `team-${Date.now().toString(36)}`,
      name: newTeamName.trim(),
      color: newTeamColor || "#38BDF8",
      description: newTeamDesc.trim() || undefined
    };
    const updated = [...teams, newTeam];
    setTeams(updated);
    const updatedData = { ...parsedData, teams: updated };
    handleChartCommit(updatedData);
    setNewTeamName("");
    setNewTeamDesc("");
  };

  const handleRemoveTeam = (teamId: string) => {
    if (!parsedData) return;
    const updatedTeams = teams.filter((t) => t.id !== teamId);
    // Clear teamId on members who belonged to this team
    const updatedPeople = people.map((p) => (p.teamId === teamId ? { ...p, teamId: undefined } : p));
    setTeams(updatedTeams);
    setPeople(updatedPeople);
    const updatedData = { ...parsedData, teams: updatedTeams, people: updatedPeople };
    handleChartCommit(updatedData);
  };

  // Apply Gantt date filter dimming via DOM after render
  useEffect(() => {
    const applyGanttDimming = () => {
      if (activeView !== "gantt" || dateFilterMode === "all" || dateFilterBehavior === "hide") {
        // Remove all dimming when switching to "all" or in "hide" (Filter) mode
        document.querySelectorAll<HTMLElement | SVGElement>("[data-task-id], [data-row-id], [data-grid-row-id], .jantt-dep-path").forEach((el) => {
          el.classList.remove("jantt-task-dimmed");
        });
        return;
      }

      // Dim task bars, milestones, grid rows, and table rows
      document.querySelectorAll<HTMLElement>("[data-task-id], [data-row-id], [data-grid-row-id]").forEach((el) => {
        const taskId = el.dataset.taskId || el.dataset.rowId || el.dataset.gridRowId;
        const task = parsedData?.tasks.find((t) => t.id === taskId);
        if (task && !isTaskMatchingDateFilter(task)) {
          el.classList.add("jantt-task-dimmed");
        } else {
          el.classList.remove("jantt-task-dimmed");
        }
      });

      // Dim SVG dependency connectors if either linked task is outside active date filter
      document.querySelectorAll<SVGElement>(".jantt-dep-path").forEach((path) => {
        const fromId = path.getAttribute("data-from");
        const toId = path.getAttribute("data-to");
        const fromTask = parsedData?.tasks.find((t) => t.id === fromId);
        const toTask = parsedData?.tasks.find((t) => t.id === toId);
        const isFromMatch = fromTask ? isTaskMatchingDateFilter(fromTask) : true;
        const isToMatch = toTask ? isTaskMatchingDateFilter(toTask) : true;
        if (!isFromMatch || !isToMatch) {
          path.classList.add("jantt-task-dimmed");
        } else {
          path.classList.remove("jantt-task-dimmed");
        }
      });
    };

    const handle = requestAnimationFrame(applyGanttDimming);
    const timer = window.setTimeout(applyGanttDimming, 60);
    return () => {
      cancelAnimationFrame(handle);
      window.clearTimeout(timer);
    };
  }, [
    activeView,
    currentScale,
    currentDayWidth,
    dateFilterMode,
    dateFilterValue,
    dateFilterBehavior,
    dateFilterRangeStart,
    dateFilterRangeEnd,
    parsedData,
    isTaskMatchingDateFilter
  ]);




  const startResizing = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const minW = 280;
      const maxW = Math.max(minW, window.innerWidth - 360);
      const newW = Math.max(minW, Math.min(maxW, moveEvent.clientX));
      setSidebarWidth(newW);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, []);

  // Switch between projects / templates
  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId);

    let targetData: JanttData = DEFAULT_TEMPLATE.data;
    if (projectId !== "default") {
      const found = customProjects.find((p) => p.id === projectId);
      if (found) targetData = found.data;
    }

    const formatted = JSON.stringify(targetData, null, 2);
    setJsonText(formatted);
    try {
      const parsed = JSON.parse(formatted);
      const val = validate(parsed);
      setValidationResult(val);
      if (val.valid) {
        setParsedData(parsed);
        // Sync people and teams from new project
        setPeople(parsed.people || []);
        setTeams(parsed.teams || []);
        if (parsed.meta?.scale) setCurrentScale(parsed.meta.scale);
        if (parsed.meta?.showCriticalPath !== undefined) setShowCriticalPath(parsed.meta.showCriticalPath);
        if (parsed.meta?.showBaselines !== undefined) setShowBaselines(parsed.meta.showBaselines);
      } else {
        setParsedData(null);
      }
    } catch {
      setParsedData(null);
    }
  };



  // Open modal to add a new plan/template
  const handleOpenAddPlanModal = () => {
    setNewPlanTitle(`Custom Plan ${customProjects.length + 1}`);
    setNewPlanTemplateType("blank");
    setShowAddPlanModal(true);
  };

  // Create new plan and save to browser storage
  const handleCreateNewPlan = () => {
    if (!newPlanTitle.trim()) return;
    let data: JanttData;
    if (newPlanTemplateType === "blank") {
      data = createBlankPlan(newPlanTitle.trim());
    } else if (newPlanTemplateType === "master") {
      data = {
        ...JSON.parse(JSON.stringify(masterTemplateFixture)),
        meta: {
          ...(masterTemplateFixture.meta || {}),
          title: newPlanTitle.trim()
        }
      };
    } else {
      // clone current active schedule
      data = parsedData
        ? {
            ...JSON.parse(JSON.stringify(parsedData)),
            meta: {
              ...(parsedData.meta || {}),
              title: newPlanTitle.trim()
            }
          }
        : createBlankPlan(newPlanTitle.trim());
    }

    const newProj: SavedProject = {
      id: `plan-${Date.now().toString(36)}`,
      name: newPlanTitle.trim(),
      updatedAt: new Date().toISOString(),
      data,
      source: "local"
    };

    const updated = [newProj, ...customProjects.filter((p) => p.id !== newProj.id)];
    setCustomProjects(updated);
    saveCustomProjects(updated);
    setActiveProjectId(newProj.id);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
    setJsonText(JSON.stringify(data, null, 2));
    setParsedData(data);
    setValidationResult(validate(data));
    setShowAddPlanModal(false);
    showToast(`Created local plan "${newProj.name}"`);
  };

  // Open Link Cloud Plan modal
  const handleOpenLinkCloudModal = () => {
    setLinkCloudUrl("");
    setLinkCloudName("");
    setCloudPreviewResult(null);
    setCloudPreviewError(null);
    setIsFetchingCloudPreview(false);
    setShowLinkCloudModal(true);
  };

  // Fetch & Preview remote cloud plan
  const handleFetchCloudPreview = async () => {
    if (!linkCloudUrl.trim()) return;
    setIsFetchingCloudPreview(true);
    setCloudPreviewError(null);
    try {
      const res = await fetchRemotePlan(linkCloudUrl.trim());
      setCloudPreviewResult(res);
      if (!linkCloudName.trim()) {
        setLinkCloudName(res.title);
      }
    } catch (err: any) {
      setCloudPreviewError(err.message || "Failed to fetch remote plan");
      setCloudPreviewResult(null);
    } finally {
      setIsFetchingCloudPreview(false);
    }
  };

  // Save linked cloud plan to custom projects
  const handleSaveLinkedCloudPlan = async () => {
    let result = cloudPreviewResult;
    if (!result) {
      if (!linkCloudUrl.trim()) return;
      setIsFetchingCloudPreview(true);
      try {
        result = await fetchRemotePlan(linkCloudUrl.trim());
      } catch (err: any) {
        setCloudPreviewError(err.message || "Failed to fetch remote plan");
        setIsFetchingCloudPreview(false);
        return;
      }
      setIsFetchingCloudPreview(false);
    }

    const newProj: SavedProject = {
      id: `cloud-${Date.now().toString(36)}`,
      name: linkCloudName.trim() || result.title || "Linked Cloud Plan",
      updatedAt: new Date().toISOString(),
      data: result.data,
      source: "linked",
      sourceUrl: result.info.originalUrl,
      lastSyncedAt: new Date().toISOString()
    };

    const updated = [newProj, ...customProjects.filter((p) => p.id !== newProj.id)];
    setCustomProjects(updated);
    saveCustomProjects(updated);
    setActiveProjectId(newProj.id);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
    setJsonText(JSON.stringify(result.data, null, 2));
    setParsedData(result.data);
    setPeople(result.data.people || []);
    setTeams(result.data.teams || []);
    setValidationResult(validate(result.data));
    setShowLinkCloudModal(false);
    showToast(`Linked "${newProj.name}" from ${result.info.label}!`);
  };

  // Re-sync active linked cloud plan from original URL
  const handleSyncActiveProject = async () => {
    const activeProject = customProjects.find((p) => p.id === activeProjectId);
    if (!activeProject || activeProject.source !== "linked" || !activeProject.sourceUrl) return;

    setIsSyncingProject(true);
    try {
      const res = await fetchRemotePlan(activeProject.sourceUrl);
      const updatedData = res.data;
      const now = new Date().toISOString();

      const updated = customProjects.map((p) =>
        p.id === activeProjectId
          ? {
              ...p,
              data: updatedData,
              updatedAt: now,
              lastSyncedAt: now,
              syncError: undefined
            }
          : p
      );
      setCustomProjects(updated);
      saveCustomProjects(updated);
      setParsedData(updatedData);
      setPeople(updatedData.people || []);
      setTeams(updatedData.teams || []);
      setJsonText(JSON.stringify(updatedData, null, 2));
      setValidationResult(validate(updatedData));
      showToast(`Synced latest version from ${res.info.label}!`);
    } catch (err: any) {
      showToast(`Sync failed: ${err.message}`, true);
      const updated = customProjects.map((p) =>
        p.id === activeProjectId ? { ...p, syncError: err.message } : p
      );
      setCustomProjects(updated);
      saveCustomProjects(updated);
    } finally {
      setIsSyncingProject(false);
    }
  };

  // Fork linked plan to an independent local editable copy
  const handleForkToLocalPlan = () => {
    const activeProject = customProjects.find((p) => p.id === activeProjectId);
    if (!activeProject) return;

    const forkedData = parsedData
      ? JSON.parse(JSON.stringify(parsedData))
      : JSON.parse(JSON.stringify(activeProject.data));

    const newProj: SavedProject = {
      id: `plan-${Date.now().toString(36)}`,
      name: `${activeProject.name} (Editable Copy)`,
      updatedAt: new Date().toISOString(),
      data: forkedData,
      source: "local"
    };

    const updated = [newProj, ...customProjects];
    setCustomProjects(updated);
    saveCustomProjects(updated);
    setActiveProjectId(newProj.id);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
    setJsonText(JSON.stringify(forkedData, null, 2));
    setParsedData(forkedData);
    setValidationResult(validate(forkedData));
    showToast(`Created independent local copy: "${newProj.name}"`);
  };

  // Delete custom or linked project from localStorage
  const handleDeleteProject = (projectId: string) => {
    if (projectId === "default") return;
    const projToDelete = customProjects.find((p) => p.id === projectId);
    const isLinked = projToDelete?.source === "linked";
    const promptMsg = isLinked
      ? `Unlink cloud plan "${projToDelete?.name || projectId}" from this browser? (Your original cloud file on Google Drive/GitHub remains untouched).`
      : `Delete local plan "${projToDelete?.name || projectId}" from browser storage?`;
    const confirmed = window.confirm(promptMsg);
    if (!confirmed) return;
    const updated = customProjects.filter((p) => p.id !== projectId);
    setCustomProjects(updated);
    saveCustomProjects(updated);
    if (activeProjectId === projectId) {
      handleSelectProject("default");
    }
    showToast(isLinked ? "Unlinked cloud plan." : "Deleted local plan.");
  };

  // Import JSON file from local disk
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const val = validate(parsed);
        if (val.valid) {
          const projName = parsed.meta?.title || file.name.replace(/\.json$/i, "");
          const newProj: SavedProject = {
            id: `proj-${Date.now().toString(36)}`,
            name: projName,
            updatedAt: new Date().toISOString(),
            data: parsed,
            source: "local"
          };
          const updated = [newProj, ...customProjects];
          setCustomProjects(updated);
          saveCustomProjects(updated);
          setActiveProjectId(newProj.id);
          localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
          setJsonText(JSON.stringify(parsed, null, 2));
          setParsedData(parsed);
          setPeople(parsed.people || []);
          setTeams(parsed.teams || []);
          setValidationResult(val);
          showToast(`Imported "${newProj.name}"`);
        } else {
          alert("The imported file has schema errors:\n" + val.errors.map((err) => `${err.path}: ${err.message}`).join("\n"));
        }
      } catch (err: any) {
        alert("Invalid JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };


  // Reset active plan back to original template or saved state
  const handleResetActiveProject = () => {
    let targetData = DEFAULT_TEMPLATE.data;
    if (activeProjectId !== "default") {
      const found = customProjects.find((p) => p.id === activeProjectId);
      if (found) targetData = found.data;
    }
    const formatted = JSON.stringify(targetData, null, 2);
    setJsonText(formatted);
    try {
      const parsed = JSON.parse(formatted);
      const val = validate(parsed);
      setValidationResult(val);
      if (val.valid) {
        setParsedData(parsed);
        setPeople(parsed.people || []);
        setTeams(parsed.teams || []);
        if (parsed.meta?.scale) setCurrentScale(parsed.meta.scale);
        if (parsed.meta?.showCriticalPath !== undefined) setShowCriticalPath(parsed.meta.showCriticalPath);
        if (parsed.meta?.showBaselines !== undefined) setShowBaselines(parsed.meta.showBaselines);
      }
    } catch {}
  };

  // Handle raw text changes in the JSON editor
  const handleEditorChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      const val = validate(parsed);
      setValidationResult(val);
      if (val.valid) {
        setParsedData(parsed);
        if (Array.isArray(parsed.people)) {
          setPeople(parsed.people);
        }
        if (Array.isArray(parsed.teams)) {
          setTeams(parsed.teams);
        }
      } else {
        setParsedData(null);
      }
    } catch (err: any) {
      setValidationResult({
        valid: false,
        errors: [
          {
            path: "$",
            code: "SCHEMA_MISMATCH",
            message: `JSON Syntax Error: ${err.message}`,
            suggestion: "Fix syntax error (missing comma, unclosed bracket, or quote)."
          }
        ]
      });
      setParsedData(null);
    }
  };

  const [isLiveSyncing, setIsLiveSyncing] = useState(false);
  const syncTimerRef = useRef<number | null>(null);

  // Handle live commit from interactive Gantt drag/resize/modal/link/multi-shift
  const handleChartCommit = useCallback((updated: JanttData) => {
    // If incoming data has fewer tasks than current master, safeguard against truncated filter sets
    let finalData = updated;
    const currentMaster = parsedDataRef.current;
    if (currentMaster && updated.tasks.length < currentMaster.tasks.length) {
      // If difference is more than 1 (or tasks were missing due to an external filter), merge to prevent data loss
      if (currentMaster.tasks.length - updated.tasks.length > 1) {
        const updatedMap = new Map(updated.tasks.map((t) => [t.id, t]));
        const mergedTasks = currentMaster.tasks.map((t) => updatedMap.get(t.id) || t);
        finalData = { ...currentMaster, ...updated, tasks: mergedTasks };
      }
    }

    setParsedData(finalData);
    // Sync people and teams from updated data if present
    if (Array.isArray((finalData as any).people)) {
      setPeople((finalData as any).people);
    }
    if (Array.isArray((finalData as any).teams)) {
      setTeams((finalData as any).teams);
    }
    const formatted = JSON.stringify(finalData, null, 2);
    setJsonText(formatted);
    setValidationResult(validate(finalData));

    // Trigger visual sync flash / glow in JSON editor
    setIsLiveSyncing(true);
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      setIsLiveSyncing(false);
    }, 1300);
  }, []);

  const activeSidebarRef = useRef<{ close: () => void } | null>(null);

  // Close sidebar drawer if open when unmounting or switching view
  useEffect(() => {
    return () => {
      activeSidebarRef.current?.close();
    };
  }, []);

  useEffect(() => {
    activeSidebarRef.current?.close();
  }, [activeView]);

  const activeThemeRef = useRef(activeTheme);
  activeThemeRef.current = activeTheme;

  // Open the slide-out Task Details Sidebar / Drawer (Swiss Modernist design) for a given task
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


  // Format JSON in editor
  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      // Ignore
    }
  };

  // Copy JSON to clipboard
  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Ignore
    }
  };

  // Download JSON file
  const handleDownloadJson = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jantt-plan-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export CSV file
  const handleExportCsv = () => {
    if (parsedData) {
      downloadCsv(parsedData, `jantt-schedule-${Date.now()}.csv`);
    }
  };

  // ── Shareable Link & Cloud Source Helpers ──────────────────────────────
  const currentProjectName = useMemo(() => {
    if (activeProjectId === "default") return DEFAULT_TEMPLATE.name;
    const found = customProjects.find((p) => p.id === activeProjectId);
    return found?.name || parsedData?.meta?.title || "Project Plan";
  }, [activeProjectId, customProjects, parsedData]);

  const activeProject = useMemo(() => {
    return customProjects.find((p) => p.id === activeProjectId) || (activeProjectId === "default" ? DEFAULT_TEMPLATE : undefined);
  }, [activeProjectId, customProjects]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    const pathname = window.location.pathname;

    if (activeProject && activeProject.source === "linked" && activeProject.sourceUrl) {
      return `${origin}${pathname}?url=${encodeURIComponent(activeProject.sourceUrl)}&view=${activeView}&theme=${selectedThemeId}`;
    }

    if (activeProjectId === "default" && jsonText === JSON.stringify(DEFAULT_TEMPLATE.data, null, 2)) {
      return `${origin}${pathname}?plan=default&view=${activeView}&theme=${selectedThemeId}`;
    }

    // Local / custom plan or edited template
    if (parsedData) {
      const b64 = encodeDataToBase64Url(parsedData);
      const nameParam = currentProjectName && currentProjectName !== DEFAULT_TEMPLATE.name
        ? `&name=${encodeURIComponent(currentProjectName)}`
        : "";
      return `${origin}${pathname}?view=${activeView}&theme=${selectedThemeId}${nameParam}#data=${b64}`;
    }

    return `${origin}${pathname}`;
  }, [activeProjectId, activeProject, activeView, selectedThemeId, parsedData, jsonText, currentProjectName]);

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.left = "-999999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedShareLink(true);
      showToast("Shareable link copied to clipboard!");
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch {
      showToast("Failed to copy link to clipboard", true);
    }
  };

  const handleNativeShare = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: currentProjectName,
          text: `Check out this project plan: ${currentProjectName}`,
          url: shareUrl
        });
        showToast("Shared successfully!");
      }
    } catch {
      // User cancelled native share
    }
  };

  // Auto-fetch remote cloud plan if ?url= is passed in URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const remoteUrl = params.get("url");
    if (!remoteUrl) return;

    // Check if project is already linked with this sourceUrl
    const existing = customProjects.find((p) => p.sourceUrl === remoteUrl);
    if (existing) {
      if (activeProjectId !== existing.id) {
        handleSelectProject(existing.id);
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetchRemotePlan(remoteUrl);
        if (cancelled) return;
        const newProj: SavedProject = {
          id: `cloud-${Date.now().toString(36)}`,
          name: res.title || "Linked Cloud Plan",
          updatedAt: new Date().toISOString(),
          data: res.data,
          source: "linked",
          sourceUrl: res.info.originalUrl,
          lastSyncedAt: new Date().toISOString()
        };
        const updated = [newProj, ...customProjects.filter((p) => p.id !== newProj.id)];
        setCustomProjects(updated);
        saveCustomProjects(updated);
        setActiveProjectId(newProj.id);
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
        setJsonText(JSON.stringify(res.data, null, 2));
        setParsedData(res.data);
        setPeople(res.data.people || []);
        setTeams(res.data.teams || []);
        setValidationResult(validate(res.data));
        showToast(`Loaded shared plan from ${res.info.label}!`);
      } catch (err: any) {
        if (!cancelled) {
          showToast(`Failed to load plan from URL: ${err.message || err}`, true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Quick Add New Task
  const handleAddNewTask = () => {
    if (!parsedData) return;
    const today = getTodayISODate();
    let lastEnd = today;
    if (parsedData.tasks.length > 0) {
      lastEnd = parsedData.tasks[parsedData.tasks.length - 1].end || today;
    }
    const catKeys = Object.keys(parsedData.categories || {});
    const defaultCat = catKeys.length > 0 ? catKeys[0] : "general";
    const nextIdx = parsedData.tasks.length + 1;
    const newTask: Task = {
      id: `task-${Date.now().toString(36)}`,
      wbs: `${nextIdx}.0`,
      label: `New Task ${nextIdx}`,
      category: defaultCat,
      start: lastEnd,
      end: addDays(lastEnd, 7),
      progress: 0,
      status: "not-started",
      dependsOn: parsedData.tasks.length > 0 ? parsedData.tasks[parsedData.tasks.length - 1].id : null,
      gapDays: parsedData.meta?.defaultGapDays ?? 2
    };

    const nextTasks = [...parsedData.tasks, newTask];
    const resolved = resolveSchedule(nextTasks, parsedData.meta?.defaultGapDays ?? 2);
    const updated = { ...parsedData, tasks: resolved };
    setParsedData(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    setValidationResult(validate(updated));
  };

  const [promptModalTab, setPromptModalTab] = useState<"prompt" | "cheatsheet" | "ideology">("prompt");
  const [copiedRawCheatsheet, setCopiedRawCheatsheet] = useState(false);

  const rawCheatsheetJson = JSON.stringify(masterTemplateFixture, null, 2);

  const llmPromptSnippet = `You are a precision project management schedule generator.
Output ONLY raw, valid JSON conforming strictly to the Jantt JSON Schema (https://jantt.dev/schema/v1.json).

# JANTT JSON SCHEMA BENCHMARK & SPECIFICATION CHEATSHEET

## 1. Top-Level Root Structure
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "<Project Title>",
    "description": "<Project narrative and objectives>",
    "person": "<Lead Program Manager / Owner>",
    "organization": "<Enterprise / Organization Name>",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "defaultGapDays": 2,
    "scale": "day" | "week" | "month" | "quarter" | "year",
    "linkRouting": "orthogonal" | "curved" | "direct",
    "showCriticalPath": true,
    "showBaselines": true,
    "currency": "USD",
    "budget": 385000,
    "version": "1.2.0"
  },
  "categories": {
    "<category_id>": {
      "label": "<Category Display Name>",
      "color": "#HEX_COLOR",
      "soft": "#BG_TINT_HEX",
      "icon": "<lucide_icon_name>"
    }
  },
  "documents": [
    {
      "id": "doc-unique-id",
      "label": "<Document or Deliverable Title>",
      "status": "have" | "pending" | "missing",
      "owner": "<Owner Name>",
      "url": "<Documentation Link>",
      "note": "<Review notes / status>"
    }
  ],
  "tasks": [
    {
      "id": "task-unique-id",
      "wbs": "1.1",
      "label": "Task Name / Title",
      "category": "<matching_category_id>",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "assignee": "Team Member Name",
      "phase": "Phase 1: Foundation",
      "priority": "low" | "medium" | "high" | "urgent",
      "estimatedCost": 28000,
      "actualCost": 15000,
      "dependsOn": "prereq-id" | ["prereq-1", "prereq-2"] | null,
      "gapDays": 2,
      "locked": false,
      "progress": 0.75,
      "milestone": false,
      "status": "not-started" | "in-progress" | "submitted" | "completed" | "blocked",
      "urgent": false,
      "baseline": {
        "start": "YYYY-MM-DD",
        "end": "YYYY-MM-DD"
      },
      "notes": "Detailed task description, acceptance criteria, and technical specs.",
      "fields": {
        "jira": "JANTT-101",
        "storyPoints": 13,
        "repo": "github.com/org/repo",
        "deliverable": "schemas/v1.json"
      }
    }
  ]
}

## 2. Critical Constraints & Validation Rules:
1. DATES: All dates must be ISO "YYYY-MM-DD" format. "end" must be >= "start".
2. CATEGORIES: Every task "category" must match an existing key in the "categories" dictionary.
3. DEPENDENCIES (DAG):
   - "dependsOn" can be a single task ID string, an array of strings ["t1", "t2"], or null.
   - All referenced dependency IDs must exist in the "tasks" list (no dangling references).
   - Strict Directed Acyclic Graph: NO circular dependency loops (e.g. A -> B -> C -> A).
   - Timing Sanity: A task's "start" must be on or after prerequisite "end" + gapDays.
4. MILESTONES: For zero-duration milestone gates, set "milestone": true and "start" equal to "end".
5. PROGRESS: Must be a decimal float from 0.0 (0%) to 1.0 (100%).
6. BASELINES: Optional planned timeframe object { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } for baseline variance tracking.
7. LOCKED: Set "locked": true on fixed gates or hard-deadline milestones to prevent accidental drag shifts.`;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(llmPromptSnippet);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {}
  };

  const handleCopyRawCheatsheet = async () => {
    try {
      await navigator.clipboard.writeText(rawCheatsheetJson);
      setCopiedRawCheatsheet(true);
      setTimeout(() => setCopiedRawCheatsheet(false), 2000);
    } catch {}
  };

  return (
    <div
      className={`playground-app ${activeTheme.className}`}
      style={{
        colorScheme: activeTheme.mode || "dark",
        ...(activeTheme.vars as React.CSSProperties)
      }}
    >
      {/* Navbar Header */}
      <header className="navbar">
        <div className="brand-section">
          <JanttLogo size={28} />
          <span className="brand-badge">v1.1.1</span>
          <button
            type="button"
            className={`btn-autosave-badge is-${saveStatus}`}
            onClick={() => setShowAutoSaveModal(true)}
            title={`Last auto-saved: ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} • Cadence: ${autoSaveInterval} • Click to configure`}
          >
            {saveStatus === "saving" ? (
              <RefreshCw size={11} className="spin-sync-icon" />
            ) : saveStatus === "pending" ? (
              <Clock size={11} />
            ) : (
              <CheckCircle2 size={11} />
            )}
            <span>{autoSaveLabel}</span>
          </button>
          {isSidebarCollapsed && (
            <button
              className="btn-nav btn-restore-sidebar"
              onClick={() => setIsSidebarCollapsed(false)}
              title="Expand JSON Editor Sidebar"
              style={{ marginLeft: "8px" }}
            >
              <FileJson size={13} />
              <span>Show JSON Editor</span>
            </button>
          )}
        </div>

        <div className="nav-controls">
          {/* View Switcher: Gantt Timeline, Kanban Board, Detailed Tasks, Budget & Analytics */}
          <div className="jantt-scale-group" style={{ margin: "0 6px" }}>
            <button
              className={`jantt-scale-btn ${activeView === "gantt" ? "is-active" : ""}`}
              onClick={() => setActiveView("gantt")}
              title="Gantt Timeline Schedule"
            >
              <Layers size={13} />
              <span>Gantt</span>
            </button>
            <button
              className={`jantt-scale-btn ${activeView === "kanban" ? "is-active" : ""}`}
              onClick={() => setActiveView("kanban")}
              title="Kanban Task Board"
            >
              <Kanban size={13} />
              <span>Kanban</span>
            </button>
            <button
              className={`jantt-scale-btn ${activeView === "tasks" ? "is-active" : ""}`}
              onClick={() => setActiveView("tasks")}
              title="Detailed Tasks & Interactive Todo Checklist"
            >
              <CheckSquare size={13} />
              <span>Tasks</span>
            </button>
            <button
              className={`jantt-scale-btn ${activeView === "summary" ? "is-active" : ""}`}
              onClick={() => setActiveView("summary")}
              title="Project Budget & Performance Analytics"
            >
              <PieChart size={13} />
              <span>Budget &amp; KPI</span>
            </button>
          </div>


          {/* Plan Control Center — Grouped Cohesive Unit */}
          <div className="nav-plan-group">
            <div className="nav-plan-select-wrap">
              <label htmlFor="project-select" className="nav-plan-label">Plan:</label>
              <select
                id="project-select"
                className="select-input nav-plan-select"
                value={activeProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
                title="Select Active Project Plan"
              >
                <optgroup label="Templates">
                  <option value="default">{DEFAULT_TEMPLATE.name}</option>
                </optgroup>
                {customProjects.filter((p) => p.source !== "linked").length > 0 && (
                  <optgroup label={`Local Plans (${customProjects.filter((p) => p.source !== "linked").length})`}>
                    {customProjects
                      .filter((p) => p.source !== "linked")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.data?.tasks?.length || 0} tasks)
                        </option>
                      ))}
                  </optgroup>
                )}
                {customProjects.filter((p) => p.source === "linked").length > 0 && (
                  <optgroup label={`Linked Cloud Plans (${customProjects.filter((p) => p.source === "linked").length})`}>
                    {customProjects
                      .filter((p) => p.source === "linked")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.data?.tasks?.length || 0} tasks)
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="nav-plan-actions">
              {/* + Add Plan Button */}
              <button
                className="btn-plan-action is-add"
                onClick={handleOpenAddPlanModal}
                title="Create a new blank plan, clone existing, or use a template"
              >
                <Plus size={13} />
                <span>Plan</span>
              </button>

              {/* Link Cloud Plan Button */}
              <button
                className="btn-plan-action"
                onClick={handleOpenLinkCloudModal}
                title="Link and sync a remote plan from Google Drive, GitHub, Dropbox or direct URL"
              >
                <Cloud size={13} style={{ color: "var(--jantt-accent)" }} />
              </button>

              {/* Linked Cloud Plan Controls (when active plan is linked) */}
              {customProjects.some((p) => p.id === activeProjectId && p.source === "linked") && (() => {
                const linkedActive = customProjects.find((p) => p.id === activeProjectId)!;
                return (
                  <>
                    <button
                      className="btn-plan-action is-sync"
                      onClick={handleSyncActiveProject}
                      disabled={isSyncingProject}
                      title={`Re-fetch and update this plan from the cloud URL (Last synced: ${formatRelativeTime(linkedActive.lastSyncedAt)})`}
                    >
                      <RefreshCw size={12} className={isSyncingProject ? "spin-sync-icon" : ""} />
                    </button>
                    <button
                      className="btn-plan-action"
                      onClick={handleForkToLocalPlan}
                      title="Create an editable local copy of this cloud plan"
                    >
                      <GitFork size={12} />
                    </button>
                  </>
                );
              })()}

              {/* Share Active Plan Button (Unified popup modal for link sharing & source document) */}
              <button
                className="btn-plan-action is-share"
                onClick={() => {
                  setShowShareModal(true);
                  setCopiedShareLink(false);
                }}
                title="Share this project plan via link or open source"
              >
                <Share2 size={12} />
                <span>Share</span>
              </button>

              {/* Delete / Unlink Active Plan Button */}
              {activeProjectId !== "default" && (
                <button
                  className="btn-plan-action is-delete"
                  style={{ color: "#EF4444" }}
                  onClick={() => handleDeleteProject(activeProjectId)}
                  title={
                    customProjects.find((p) => p.id === activeProjectId)?.source === "linked"
                      ? "Unlink this cloud plan from browser storage"
                      : "Delete this custom plan from browser memory"
                  }
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* People (Team) Manager Button */}
          <button
            className="btn-nav"
            onClick={() => setShowPeopleModal(true)}
            title="Manage team members and assignees"
          >
            <Users size={13} />
            <span>People{effectivePeople.length > 0 ? ` (${effectivePeople.length})` : ""}</span>
          </button>

          {/* Data I/O Group (Import & Export) */}
          <div className="nav-io-group">
            {/* Hidden File Input for JSON Import */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleImportJsonFile}
              style={{ display: "none" }}
            />

            {/* Import JSON Button */}
            <button
              className="btn-nav"
              onClick={() => fileInputRef.current?.click()}
              title="Import a Jantt JSON file from your computer"
            >
              <Upload size={13} />
              <span>Import</span>
            </button>

            <div className="nav-export-split">
              {/* Download JSON Button */}
              <button className="btn-nav" onClick={handleDownloadJson} title="Download Jantt JSON file">
                <Download size={13} />
                <span>JSON</span>
              </button>

              {/* Export CSV Button */}
              <button className="btn-nav" onClick={handleExportCsv} title="Export RFC-4180 CSV / Excel spreadsheet">
                <FileSpreadsheet size={13} />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Theme Selector */}
          <div className="nav-select-group">
            <label htmlFor="theme-select">Theme:</label>
            <select
              id="theme-select"
              className="select-input"
              value={selectedThemeId}
              onChange={(e) => setSelectedThemeId(e.target.value)}
            >
              {AVAILABLE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt AI Button */}
          <button
            className="btn-prompt"
            onClick={() => setShowPromptModal(true)}
            title="Generate AI Prompt for LLM output"
          >
            <Sparkles size={14} />
            <span>AI Prompt</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="workspace-main">
        {/* Left Pane: Collapsible JSON Editor */}
        <section
          id="editor-pane"
          className={`editor-pane ${isSidebarCollapsed ? "is-collapsed" : ""}`}
          style={{ width: isSidebarCollapsed ? "0px" : `${sidebarWidth}px` }}
        >
          <div className="pane-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileJson size={15} />
              <span>JSON State (Source of Truth)</span>
              {isLiveSyncing && (
                <span className="sync-pulse-badge">
                  <Zap size={11} />
                  <span>Live Synced</span>
                </span>
              )}
            </div>
            <div className="pane-actions">
              <button className="btn-nav" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={formatJson} title="Format JSON">
                Format
              </button>
              <button className="btn-nav" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={handleResetActiveProject} title="Reset current plan back to saved state or default template">
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
              <button className="btn-nav" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={handleCopyJson} title="Copy JSON">
                {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                {copiedJson ? "Copied" : "Copy"}
              </button>
              <button
                className="btn-nav"
                style={{ padding: "3px 6px", fontSize: "11px" }}
                onClick={() => setIsSidebarCollapsed(true)}
                title="Collapse JSON Sidebar"
              >
                <ChevronLeft size={13} />
              </button>
            </div>
          </div>

          <div className={`editor-wrapper ${isLiveSyncing ? "is-live-updating" : ""}`}>
            <textarea
              id="json-editor-textarea"
              className={`code-textarea ${isLiveSyncing ? "is-live-glowing" : ""}`}
              value={jsonText}
              onChange={(e) => handleEditorChange(e.target.value)}
              spellCheck={false}
              placeholder="Paste or write your Jantt JSON plan here..."
            />
          </div>

          {/* Real-time Diagnostics Bar */}
          <div className="diagnostics-panel" id="diagnostics-panel">
            <div className="diagnostics-title">
              {validationResult.valid ? (
                <>
                  <CheckCircle2 size={16} className="diag-valid" />
                  <span className="diag-valid">Valid Jantt Plan ({parsedData?.tasks?.length || 0} tasks)</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} className="diag-invalid" />
                  <span className="diag-invalid">{validationResult.errors.length} Schema Issue(s) Found</span>
                </>
              )}
            </div>

            {!validationResult.valid && (
              <div className="error-list">
                {validationResult.errors.map((err, idx) => (
                  <div key={idx} className="error-card">
                    <div className="error-msg">
                      <strong>{err.path}:</strong> {err.message}
                    </div>
                    {err.suggestion && (
                      <div className="error-suggestion" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Info size={14} style={{ flexShrink: 0 }} />
                        <span>{err.suggestion}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Draggable Splitter Divider */}
        {!isSidebarCollapsed && (
          <div
            className={`workspace-splitter ${isResizing ? "is-resizing" : ""}`}
            onPointerDown={startResizing}
            title="Drag left/right to adjust JSON sidebar width"
          >
            <div className="splitter-handle" />
          </div>
        )}

        {/* Right Pane: Live Full-Space Chart / Kanban / Analytics Render */}
        <section className="chart-pane">
          <div className="chart-container-card">
            {parsedData ? (
              <>
                {/* ── Contextual Date Filter Sub-header (Active across Gantt, Kanban, Tasks, Budget & KPI) ── */}
                <div className="date-filter-bar">
                  <div className="date-filter-tabs">
                    <button
                      className={`date-filter-tab ${dateFilterMode === "all" ? "is-active" : ""}`}
                      onClick={() => setDateFilterMode("all")}
                      title="Show all project tasks without date restrictions"
                    >
                      All Tasks
                    </button>
                    <button
                      className={`date-filter-tab ${dateFilterMode === "today" ? "is-active" : ""}`}
                      onClick={() => setDateFilterMode("today")}
                      title={`Filter tasks active today (${getTodayISODate()})`}
                    >
                      <Clock size={11} />
                      Today
                    </button>
                    <button
                      className={`date-filter-tab ${dateFilterMode === "week" ? "is-active" : ""}`}
                      onClick={() => setDateFilterMode("week")}
                      title="Filter tasks active this week (Monday to Sunday)"
                    >
                      <Calendar size={11} />
                      This Week
                    </button>
                    <button
                      className={`date-filter-tab ${dateFilterMode === "date" ? "is-active" : ""}`}
                      onClick={() => {
                        setDateFilterMode("date");
                        if (!dateFilterValue) setDateFilterValue(getTodayISODate());
                      }}
                      title="Filter tasks active on a specific date"
                    >
                      <Calendar size={11} />
                      Pick Date
                    </button>
                    <button
                      className={`date-filter-tab ${dateFilterMode === "range" ? "is-active" : ""}`}
                      onClick={() => {
                        setDateFilterMode("range");
                        if (!dateFilterRangeStart) setDateFilterRangeStart(getTodayISODate());
                      }}
                      title="Filter tasks overlapping a date range"
                    >
                      <Filter size={11} />
                      Date Range
                    </button>
                  </div>

                  {/* Single Date Picker */}
                  {dateFilterMode === "date" && (
                    <input
                      type="date"
                      className="date-filter-input"
                      value={dateFilterValue}
                      onChange={(e) => setDateFilterValue(e.target.value)}
                      title="Select target date"
                    />
                  )}

                  {/* Date Range Picker */}
                  {dateFilterMode === "range" && (
                    <div className="date-range-inputs">
                      <input
                        type="date"
                        className="date-filter-input"
                        placeholder="Start"
                        value={dateFilterRangeStart}
                        onChange={(e) => setDateFilterRangeStart(e.target.value)}
                        title="Range Start Date"
                      />
                      <span className="date-filter-range-sep">→</span>
                      <input
                        type="date"
                        className="date-filter-input"
                        placeholder="End"
                        value={dateFilterRangeEnd}
                        onChange={(e) => setDateFilterRangeEnd(e.target.value)}
                        title="Range End Date"
                      />
                    </div>
                  )}

                  {/* Active Filter Summary Badge & Reset */}
                  {dateFilterActiveSummary && (
                    <div className="date-filter-active-wrap">
                      <span className="date-filter-active-label">
                        Showing: <strong>{dateFilterActiveSummary.label}</strong>
                      </span>
                      <span className="date-filter-count-badge">
                        {dateFilterActiveSummary.countText}
                      </span>
                      <button
                        className="date-filter-reset-btn"
                        onClick={() => {
                          setDateFilterMode("all");
                          setDateFilterValue("");
                          setDateFilterRangeStart("");
                          setDateFilterRangeEnd("");
                        }}
                        title="Clear date filter and show all tasks"
                      >
                        <X size={11} />
                        Clear
                      </button>
                    </div>
                  )}

                  {/* Universal Filter Behavior Toggle (Dim vs Filter) across all views */}
                  {dateFilterMode !== "all" && (
                    <div className="date-filter-behavior-group">
                      <span className="date-filter-behavior-label">Mode:</span>
                      <button
                        className={`date-filter-behavior-btn ${dateFilterBehavior === "dim" ? "is-active" : ""}`}
                        onClick={() => setDateFilterBehavior("dim")}
                        title="Dim Mode: Keep all tasks visible, fade non-matching tasks"
                      >
                        <EyeOff size={11} />
                        Dim
                      </button>
                      <button
                        className={`date-filter-behavior-btn ${dateFilterBehavior === "hide" ? "is-active" : ""}`}
                        onClick={() => setDateFilterBehavior("hide")}
                        title="Filter Mode: Only show tasks matching the active date filter"
                      >
                        <Filter size={11} />
                        Filter
                      </button>
                    </div>
                  )}
                </div>

                {/* ── GANTT VIEW ── */}
                {activeView === "gantt" && parsedData && (
                  <Jantt
                    data={parsedData}
                    onCommit={handleChartCommit}
                    selectedDate={dateFilterMode === "all" ? null : (dateFilterBehavior === "hide" ? dateFilterActiveDate : null)}
                    onDateClick={(clickedDate) => {
                      if (clickedDate === getTodayISODate()) {
                        setDateFilterMode((prev) => (prev === "today" ? "all" : "today"));
                      } else {
                        setDateFilterMode((prev) => (prev === "date" && dateFilterValue === clickedDate ? "all" : "date"));
                        setDateFilterValue(clickedDate);
                      }
                    }}
                    onClearDateFilter={() => {
                      setDateFilterMode("all");
                    }}
                    onDayWidthChange={(dw) => {
                      setCurrentDayWidth(dw);
                    }}
                    onViewportChange={(vp) => {
                      if (vp.scale) setCurrentScale(vp.scale);
                      if (vp.dayWidth !== undefined) setCurrentDayWidth(vp.dayWidth);
                      if (vp.linkRouting) setLinkRouting(vp.linkRouting);
                      if (vp.rowHeight !== undefined) setRowHeight(vp.rowHeight);
                      if (vp.rowHeightMode !== undefined) setRowHeightMode(vp.rowHeightMode);
                      if (vp.showCriticalPath !== undefined) setShowCriticalPath(vp.showCriticalPath);
                      if (vp.showBaselines !== undefined) setShowBaselines(vp.showBaselines);
                      if (vp.autoCascade !== undefined) setAutoCascade(vp.autoCascade);
                      if (vp.selectedDate !== undefined) {
                        if (vp.selectedDate === null) {
                          setDateFilterMode("all");
                        } else if (vp.selectedDate === getTodayISODate()) {
                          setDateFilterMode("today");
                        } else {
                          setDateFilterMode("date");
                          setDateFilterValue(vp.selectedDate);
                        }
                      }
                    }}
                    viewport={{
                      scale: currentScale,
                      dayWidth: currentDayWidth,
                      linkRouting,
                      rowHeight,
                      rowHeightMode,
                      showCriticalPath,
                      showBaselines,
                      autoCascade,
                      selectedDate: dateFilterActiveDate
                    }}
                    theme={activeTheme.vars}
                    themeClassName={activeTheme.className}
                  />
                )}

                {/* ── KANBAN VIEW ── */}
                {activeView === "kanban" && (
                  <div className="kanban-outer-wrap">
                    {/* Multi-Sort Bar */}
                    <div className="kanban-sort-bar">
                      <span className="kanban-sort-label">
                        <SortAsc size={12} />
                        Sort by:
                      </span>
                      {kanbanSortRules.map((rule, idx) => (
                        <div key={idx} className="kanban-sort-chip">
                          <select
                            className="kanban-sort-field-select"
                            value={rule.field}
                            onChange={(e) => {
                              const updated = [...kanbanSortRules];
                              updated[idx] = { ...rule, field: e.target.value as KanbanSortField };
                              setKanbanSortRules(updated);
                            }}
                          >
                            <option value="priority">Priority</option>
                            <option value="start">Start Date</option>
                            <option value="end">End Date</option>
                            <option value="wbs">WBS</option>
                            <option value="assignee">Assignee</option>
                            <option value="progress">Progress</option>
                            <option value="name">Task Name</option>
                          </select>
                          <button
                            className="kanban-sort-dir-btn"
                            title={rule.direction === "asc" ? "Ascending — click to reverse" : "Descending — click to reverse"}
                            onClick={() => {
                              const updated = [...kanbanSortRules];
                              updated[idx] = { ...rule, direction: rule.direction === "asc" ? "desc" : "asc" };
                              setKanbanSortRules(updated);
                            }}
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          >
                            {rule.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                          </button>
                          {kanbanSortRules.length > 1 && (
                            <button
                              className="kanban-sort-remove-btn"
                              title="Remove this sort rule"
                              onClick={() => setKanbanSortRules(kanbanSortRules.filter((_, i) => i !== idx))}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      ))}
                      {kanbanSortRules.length < 4 && (
                        <button
                          className="kanban-sort-add-btn"
                          onClick={() => setKanbanSortRules([...kanbanSortRules, { field: "start", direction: "asc" }])}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          <Plus size={11} />
                          <span>Add Sort</span>
                        </button>
                      )}
                    </div>

                    {/* Kanban Columns */}
                    <div className="kanban-view-container">
                      {(
                        [
                          { id: "not-started", label: "To Do / Not Started" },
                          { id: "in-progress", label: "In Progress" },
                          { id: "submitted", label: "In Review / Submitted" },
                          { id: "completed", label: "Completed" }
                        ] as const
                      ).map((col) => {
                        const colTasks = kanbanMultiSort(
                          parsedData.tasks.filter((t) => {
                            if (col.id === "not-started") return !t.status || t.status === "not-started";
                            return t.status === col.id;
                          })
                        );
                        const visibleTasks = dateFilterMode !== "all" && dateFilterBehavior === "hide"
                          ? colTasks.filter(isTaskMatchingDateFilter)
                          : colTasks;
                        const matchingCount = colTasks.filter(isTaskMatchingDateFilter).length;
                        return (
                          <div key={col.id} className="kanban-column">
                            <div className="kanban-col-header">
                              <span className="kanban-col-title">{col.label}</span>
                              <span className="kanban-col-count">
                                {dateFilterMode !== "all" ? `${matchingCount}/${colTasks.length}` : colTasks.length}
                              </span>
                            </div>
                            <div className="kanban-card-list">
                              {visibleTasks.map((t) => {
                                const cat = parsedData.categories?.[t.category];
                                const catColor = cat?.color || "var(--jantt-accent)";
                                const isCompleted = t.status === "completed";
                                const isDimmed = dateFilterMode !== "all" && dateFilterBehavior === "dim" && !isTaskMatchingDateFilter(t);
                                const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                                return (
                                  <div
                                    key={t.id}
                                    className={`kanban-card ${isDimmed ? "kanban-card-dimmed" : ""}`}
                                    onClick={() => openTaskDetailSidebar(t)}
                                  >
                                    <div className="kanban-card-top">
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span className="kanban-cat-dot" style={{ background: catColor }} />
                                        <span className="kanban-cat-label">{cat?.label || t.category}</span>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                        {isDimmed && (
                                          <span className="task-dimmed-tag" title="Task duration falls outside active date filter">
                                            Outside Date
                                          </span>
                                        )}
                                        {t.priority && (
                                          <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>
                                        )}
                                      </div>
                                    </div>
                                    {/* WBS Number + Task Title */}
                                    <div className="kanban-card-title-row">
                                      {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                                      <h4 className="kanban-card-title">{t.label || t.name || t.id}</h4>
                                    </div>
                                    <div className="kanban-card-meta">
                                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                        <Calendar size={11} />
                                        <span>{t.start} → {t.end}</span>
                                      </div>
                                      {t.assignee && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                                          <span
                                            style={{
                                              display: "inline-flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              width: "16px",
                                              height: "16px",
                                              borderRadius: "50%",
                                              background: assigneeInfo.avatarColor,
                                              color: "#FFFFFF",
                                              fontSize: "9px",
                                              fontWeight: 700,
                                              flexShrink: 0
                                            }}
                                          >
                                            {assigneeInfo.initials}
                                          </span>
                                          <span>{assigneeInfo.displayName}</span>
                                          {assigneeInfo.team && (
                                            <span
                                              style={{
                                                fontSize: "9px",
                                                fontWeight: 700,
                                                background: `${assigneeInfo.team.color || "var(--jantt-accent)"}1F`,
                                                color: assigneeInfo.team.color || "var(--jantt-accent)",
                                                padding: "1px 5px",
                                                borderRadius: "4px"
                                              }}
                                            >
                                              {assigneeInfo.team.name}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {/* Progress: hide for completed, show checkmark */}
                                    {isCompleted ? (
                                      <div className="kanban-card-complete-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                        <Check size={11} />
                                        <span>Done</span>
                                      </div>
                                    ) : t.progress !== undefined && t.progress !== null ? (
                                      <div className="kanban-card-prog-wrap">
                                        <div className="kanban-card-prog-bar" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                                      </div>
                                    ) : null}
                                    <div className="kanban-card-footer">
                                      <select
                                        className="kanban-status-select"
                                        value={t.status || "not-started"}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          const newStatus = e.target.value;
                                          let newProgress = t.progress;
                                          if (newStatus === "completed") newProgress = 1.0;
                                          else if (newStatus === "submitted" && (t.progress ?? 0) < 0.75) newProgress = 0.75;
                                          else if (newStatus === "not-started") newProgress = 0;
                                          const updatedTasks = parsedData.tasks.map((item) =>
                                            item.id === t.id ? { ...item, status: newStatus, progress: newProgress } : item
                                          );
                                          handleChartCommit({ ...parsedData, tasks: updatedTasks });
                                        }}
                                      >
                                        <option value="not-started">Move to: To Do</option>
                                        <option value="in-progress">Move to: In Progress</option>
                                        <option value="submitted">Move to: In Review</option>
                                        <option value="completed">Move to: Completed</option>
                                      </select>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── BUDGET & KPI VIEW ── */}
                {activeView === "summary" && (
                  <div className="summary-view-container">
                    <div className="summary-kpi-grid">
                      <div className="summary-kpi-card">
                        <div className="kpi-icon-wrap" style={{ color: "var(--jantt-accent)" }}>
                          <DollarSign size={20} />
                        </div>
                        <div className="kpi-data">
                          <span className="kpi-label">Total Estimated Budget</span>
                          <span className="kpi-value">
                            ${summaryKpiTasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="summary-kpi-card">
                        <div className="kpi-icon-wrap" style={{ color: "#10B981" }}>
                          <TrendingUp size={20} />
                        </div>
                        <div className="kpi-data">
                          <span className="kpi-label">Project Progress</span>
                          <span className="kpi-value">
                            {Math.round(
                              (summaryKpiTasks.reduce((sum, t) => sum + (t.status === "completed" ? 1 : (t.progress || 0)), 0) /
                                Math.max(summaryKpiTasks.length, 1)) *
                              100
                            )}%
                          </span>
                        </div>
                      </div>
                      <div className="summary-kpi-card">
                        <div className="kpi-icon-wrap" style={{ color: "var(--jantt-today)" }}>
                          <Zap size={20} />
                        </div>
                        <div className="kpi-data">
                          <span className="kpi-label">Total Active Tasks</span>
                          <span className="kpi-value">{summaryKpiTasks.length}</span>
                        </div>
                      </div>
                      <div className="summary-kpi-card">
                        <div className="kpi-icon-wrap" style={{ color: "var(--jantt-critical)" }}>
                          <Clock size={20} />
                        </div>
                        <div className="kpi-data">
                          <span className="kpi-label">Milestones Tracked</span>
                          <span className="kpi-value">{summaryKpiTasks.filter((t) => t.milestone).length}</span>
                        </div>
                      </div>
                    </div>

                    <div className="summary-breakdown-card">
                      <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>
                        Work Breakdown &amp; Category Distribution
                        {summarySortConfig.column && (
                          <span style={{ fontSize: "11px", fontWeight: 400, marginLeft: "10px", color: "var(--jantt-text-muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <span>Sorted by {summarySortConfig.column}</span>
                            {summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                            <button
                              onClick={() => setSummarySortConfig({ column: "", direction: null })}
                              style={{ marginLeft: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--jantt-accent)", fontSize: "11px" }}
                            >Clear</button>
                          </span>
                        )}
                      </h3>
                      <table className="summary-table">
                        <thead>
                          <tr>
                            {(["wbs", "name", "category", "assignee"] as const).map((col) => (
                              <th key={col} className={`summary-th-sortable ${summarySortConfig.column === col ? "is-sorted" : ""}`} onClick={() => handleSummarySort(col)}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <span>{col === "wbs" ? "WBS" : col === "name" ? "Task Name" : col === "category" ? "Category" : "Assignee / Team"}</span>
                                  {summarySortConfig.column === col && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                                </span>
                              </th>
                            ))}
                            <th className={`summary-th-sortable ${summarySortConfig.column === "start" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("start")}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <span>Start</span>
                                {summarySortConfig.column === "start" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                              </span>
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "end" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("end")}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <span>End</span>
                                {summarySortConfig.column === "end" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                              </span>
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "budget" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("budget")}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <span>Budget ($)</span>
                                {summarySortConfig.column === "budget" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                              </span>
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "status" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("status")}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <span>Status</span>
                                {summarySortConfig.column === "status" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                              </span>
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "progress" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("progress")}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <span>Progress</span>
                                {summarySortConfig.column === "progress" && (summarySortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSummaryTasks.map((t) => {
                            const cat = parsedData.categories?.[t.category];
                            const isCompleted = t.status === "completed";
                            const effectiveProgress = isCompleted ? 1.0 : (t.progress ?? 0);
                            const isDimmed = !isTaskMatchingDateFilter(t);
                            const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                            return (
                              <tr key={t.id} className={isDimmed ? "summary-row-dimmed" : ""}>
                                <td style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 700 }}>{t.wbs || "-"}</td>
                                <td style={{ fontWeight: 600 }}>{t.label || t.name || t.id}</td>
                                <td>
                                  <span className="jantt-label-dot" style={{ background: cat?.color || "var(--jantt-accent)", display: "inline-block", marginRight: "6px" }} />
                                  {cat?.label || t.category}
                                </td>
                                <td>
                                  {t.assignee ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          width: "18px",
                                          height: "18px",
                                          borderRadius: "50%",
                                          background: assigneeInfo.avatarColor,
                                          color: "#FFFFFF",
                                          fontSize: "10px",
                                          fontWeight: 700,
                                          flexShrink: 0
                                        }}
                                      >
                                        {assigneeInfo.initials}
                                      </span>
                                      <span style={{ fontWeight: 500 }}>{assigneeInfo.displayName}</span>
                                      {assigneeInfo.team && (
                                        <span
                                          style={{
                                            fontSize: "9.5px",
                                            fontWeight: 600,
                                            background: `${assigneeInfo.team.color || "var(--jantt-accent)"}1A`,
                                            color: assigneeInfo.team.color || "var(--jantt-accent)",
                                            padding: "1px 5px",
                                            borderRadius: "4px"
                                          }}
                                        >
                                          {assigneeInfo.team.name}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ color: "var(--jantt-text-muted)" }}>-</span>
                                  )}
                                </td>
                                <td style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }}>{t.start}</td>
                                <td style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }}>{t.end}</td>
                                <td style={{ fontFamily: "var(--jantt-font-mono)" }}>
                                  {t.estimatedCost ? `$${t.estimatedCost.toLocaleString()}` : "-"}
                                </td>
                                <td>
                                  <span className={`kanban-prio-badge is-status-${(t.status || "not-started").replace("-", "")}`}>
                                    {t.status || "not-started"}
                                  </span>
                                </td>
                                <td>
                                  {isCompleted ? (
                                    <span className="progress-complete-badge" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                      <Check size={11} />
                                      <span>100%</span>
                                    </span>
                                  ) : (
                                    <div className="summary-progress-cell">
                                      <div className="summary-mini-progress-bar">
                                        <div className="summary-mini-progress-fill" style={{ width: `${Math.round(effectiveProgress * 100)}%` }} />
                                      </div>
                                      <span className="summary-progress-pct">{Math.round(effectiveProgress * 100)}%</span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── TASKS VIEW (Todo List & Detailed Task Cards) ── */}
                {activeView === "tasks" && (
                  <div className="tasks-view-container">
                    {/* Header with Title, Stats, Search, View Mode, Person Filter, Add Task */}
                    <div className="tasks-view-header">
                      <div className="tasks-view-title-section">
                        <CheckSquare size={22} style={{ color: "var(--jantt-accent)" }} />
                        <div>
                          <h2 className="tasks-view-title">Tasks &amp; Detailed Todo</h2>
                          <span className="tasks-view-subtitle">
                            {parsedData.tasks.filter(isTaskMatchingDateFilter).length} task{parsedData.tasks.filter(isTaskMatchingDateFilter).length === 1 ? "" : "s"}
                            {dateFilterMode !== "all" ? " matching active date filter" : " in project"}
                            {" • "}
                            {parsedData.tasks.filter(isTaskMatchingDateFilter).filter((t) => t.status === "completed").length} completed
                            {" • "}
                            {parsedData.tasks.filter(isTaskMatchingDateFilter).filter((t) => t.status === "in-progress").length} in progress
                          </span>
                        </div>
                      </div>

                      <div className="tasks-view-toolbar">
                        {/* Search Filter */}
                        <div className="tasks-search-wrap">
                          <input
                            type="text"
                            className="tasks-search-input"
                            placeholder="Search tasks, WBS, tags..."
                            value={tasksSearchQuery}
                            onChange={(e) => setTasksSearchQuery(e.target.value)}
                          />
                          {tasksSearchQuery && (
                            <button
                              className="tasks-search-clear"
                              onClick={() => setTasksSearchQuery("")}
                              title="Clear search"
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {/* Mode Selector: Cards vs Todo Checklist */}
                        <div className="tasks-mode-group">
                          <button
                            className={`tasks-mode-btn ${tasksViewMode === "cards" ? "is-active" : ""}`}
                            onClick={() => setTasksViewMode("cards")}
                            title="Display as detailed task cards"
                          >
                            <Kanban size={12} />
                            Cards
                          </button>
                          <button
                            className={`tasks-mode-btn ${tasksViewMode === "todo" ? "is-active" : ""}`}
                            onClick={() => setTasksViewMode("todo")}
                            title="Display as interactive Todo checklist"
                          >
                            <ListTodo size={12} />
                            Todo List
                          </button>
                        </div>

                        {/* Person / Team Filter */}
                        <div className="today-view-person-filter">
                          <Users size={13} />
                          <select
                            className="today-person-select"
                            value={selectedPersonFilter}
                            onChange={(e) => setSelectedPersonFilter(e.target.value)}
                          >
                            <option value="all">All People &amp; Teams</option>
                            {teams.length > 0 && (
                              <optgroup label="Teams / Squads">
                                {teams.map((tm) => (
                                  <option key={tm.id} value={`team:${tm.id}`}>
                                    Team: {tm.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {effectivePeople.length > 0 && (
                              <optgroup label="Team Members & Assignees">
                                {effectivePeople.map((p) => {
                                  const pTeam = resolveTeamById(teams, p.teamId);
                                  const count = parsedData.tasks.filter((t) => t.assignee === p.name || t.assignee === p.id).length;
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.name}{count > 0 ? ` (${count} tasks)` : ""}{pTeam ? ` • ${pTeam.name}` : ""}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                          </select>
                        </div>

                        {/* + Add Task Button */}
                        <button
                          className="btn-nav is-primary"
                          style={{ padding: "5px 10px", borderRadius: "7px", fontSize: "11.5px" }}
                          onClick={handleAddNewTask}
                          title="Create a new task in this project"
                        >
                          <Plus size={12} />
                          <span>Add Task</span>
                        </button>
                      </div>
                    </div>

                    {/* Tasks Content: Checklist or Cards */}
                    {(() => {
                      let tasksToDisplay = dateFilterMode !== "all" && dateFilterBehavior === "hide"
                        ? parsedData.tasks.filter(isTaskMatchingDateFilter)
                        : parsedData.tasks;

                      if (selectedPersonFilter !== "all") {
                        if (selectedPersonFilter.startsWith("team:")) {
                          const targetTeamId = selectedPersonFilter.replace("team:", "");
                          tasksToDisplay = tasksToDisplay.filter((t) => {
                            const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                            return assigneeInfo.team?.id === targetTeamId || t.teamId === targetTeamId;
                          });
                        } else {
                          const targetPerson = effectivePeople.find((p) => p.id === selectedPersonFilter);
                          tasksToDisplay = tasksToDisplay.filter((t) => {
                            const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                            return (
                              t.assignee === selectedPersonFilter ||
                              (targetPerson && t.assignee === targetPerson.name) ||
                              assigneeInfo.person?.id === selectedPersonFilter ||
                              assigneeInfo.person?.name === selectedPersonFilter
                            );
                          });
                        }
                      }

                      if (tasksSearchQuery.trim()) {
                        const q = tasksSearchQuery.toLowerCase();
                        tasksToDisplay = tasksToDisplay.filter((t) =>
                          (t.label || t.name || t.id).toLowerCase().includes(q) ||
                          (t.wbs || "").toLowerCase().includes(q) ||
                          (t.category || "").toLowerCase().includes(q) ||
                          (t.assignee || "").toLowerCase().includes(q)
                        );
                      }

                      if (tasksToDisplay.length === 0) {
                        return (
                          <div className="today-empty-state">
                            <CheckCircle2 size={48} style={{ color: "#10B981" }} />
                            <h3>All Clear!</h3>
                            <p>
                              No tasks matching your active date filter and search criteria.
                              {dateFilterMode !== "all" && (
                                <button
                                  className="date-filter-reset-btn"
                                  style={{ marginTop: "12px", display: "inline-flex" }}
                                  onClick={() => setDateFilterMode("all")}
                                >
                                  Show All Tasks
                                </button>
                              )}
                            </p>
                          </div>
                        );
                      }

                      if (tasksViewMode === "todo") {
                        return (
                          <div className="tasks-todo-list">
                            {tasksToDisplay.map((t) => {
                              const cat = parsedData.categories?.[t.category];
                              const catColor = cat?.color || "var(--jantt-accent)";
                              const isCompleted = t.status === "completed";
                              const isDimmed = dateFilterMode !== "all" && dateFilterBehavior === "dim" && !isTaskMatchingDateFilter(t);
                              const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                              return (
                                <div
                                  key={t.id}
                                  className={`tasks-todo-row ${isCompleted ? "is-completed" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                                  style={{ borderLeftColor: catColor }}
                                  onClick={() => openTaskDetailSidebar(t)}
                                >
                                  <div className="tasks-todo-left">
                                    <button
                                      className={`tasks-checkbox-btn ${isCompleted ? "is-checked" : ""}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const nextStatus = isCompleted ? "in-progress" : "completed";
                                        const nextProgress = isCompleted ? 0 : 1.0;
                                        const updatedTasks = parsedData.tasks.map((item) =>
                                          item.id === t.id ? { ...item, status: nextStatus, progress: nextProgress } : item
                                        );
                                        handleChartCommit({ ...parsedData, tasks: updatedTasks });
                                      }}
                                      title={isCompleted ? "Mark as in progress" : "Mark as completed"}
                                    >
                                      {isCompleted ? (
                                        <CheckCircle2 size={18} />
                                      ) : (
                                        <div style={{ width: 16, height: 16, border: "2px solid var(--jantt-border-strong)", borderRadius: 4 }} />
                                      )}
                                    </button>
                                    <div className="tasks-todo-body">
                                      <div className="tasks-todo-title-wrap">
                                        {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                                        <span className="kanban-cat-dot" style={{ background: catColor }} />
                                        <span className="kanban-cat-label" style={{ fontSize: "11px" }}>{cat?.label || t.category}</span>
                                        <span className={`tasks-todo-title ${isCompleted ? "is-struck" : ""}`}>
                                          {t.label || t.name || t.id}
                                        </span>
                                        {isDimmed && (
                                          <span className="task-dimmed-tag" title="Task duration falls outside active date filter">
                                            Outside Date Filter
                                          </span>
                                        )}
                                        {t.priority && (
                                          <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>
                                        )}
                                      </div>
                                      <div className="tasks-todo-meta">
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                          <Calendar size={11} /> {t.start} → {t.end}
                                        </span>
                                        {t.assignee && (
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                            <span style={{ width: 14, height: 14, borderRadius: "50%", background: assigneeInfo.avatarColor, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: 700 }}>
                                              {assigneeInfo.initials}
                                            </span>
                                            <span>{assigneeInfo.displayName}</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="tasks-todo-right">
                                    <select
                                      className="kanban-status-select"
                                      value={t.status || "not-started"}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const newStatus = e.target.value;
                                        let newProgress = t.progress;
                                        if (newStatus === "completed") newProgress = 1.0;
                                        else if (newStatus === "submitted" && (t.progress ?? 0) < 0.75) newProgress = 0.75;
                                        else if (newStatus === "not-started") newProgress = 0;
                                        const updatedTasks = parsedData.tasks.map((item) =>
                                          item.id === t.id ? { ...item, status: newStatus, progress: newProgress } : item
                                        );
                                        handleChartCommit({ ...parsedData, tasks: updatedTasks });
                                      }}
                                    >
                                      <option value="not-started">To Do</option>
                                      <option value="in-progress">In Progress</option>
                                      <option value="submitted">Submitted</option>
                                      <option value="completed">Completed</option>
                                    </select>
                                    <button
                                      className="kanban-sort-remove-btn"
                                      title="Delete task"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updatedTasks = parsedData.tasks.filter((item) => item.id !== t.id);
                                        const resolved = resolveSchedule(updatedTasks, parsedData.meta?.defaultGapDays ?? 2);
                                        handleChartCommit({ ...parsedData, tasks: resolved });
                                      }}
                                    >
                                      <Trash2 size={13} style={{ color: "var(--jantt-text-muted)" }} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

                      // Otherwise Detailed Cards mode
                      return (
                        <div className="today-task-grid">
                          {tasksToDisplay.map((t) => {
                            const cat = parsedData.categories?.[t.category];
                            const catColor = cat?.color || "var(--jantt-accent)";
                            const isCompleted = t.status === "completed";
                            const isDimmed = dateFilterMode !== "all" && dateFilterBehavior === "dim" && !isTaskMatchingDateFilter(t);
                            const assigneeInfo = resolveTaskAssignee(t, effectivePeople, teams);
                            return (
                              <div
                                key={t.id}
                                className={`today-task-card ${isCompleted ? "is-completed" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                                style={{ borderTopColor: catColor }}
                                onClick={() => openTaskDetailSidebar(t)}
                              >
                                <div className="today-card-header">
                                  <div className="today-card-category">
                                    <span className="kanban-cat-dot" style={{ background: catColor }} />
                                    <span>{cat?.label || t.category}</span>
                                    {isDimmed && (
                                      <span className="task-dimmed-tag" title="Task duration falls outside active date filter">
                                        Outside Date
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                                    {t.priority && <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>}
                                    <button
                                      className={`tasks-card-check-btn ${isCompleted ? "is-checked" : ""}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const nextStatus = isCompleted ? "in-progress" : "completed";
                                        const nextProgress = isCompleted ? 0 : 1.0;
                                        const updatedTasks = parsedData.tasks.map((item) =>
                                          item.id === t.id ? { ...item, status: nextStatus, progress: nextProgress } : item
                                        );
                                        handleChartCommit({ ...parsedData, tasks: updatedTasks });
                                      }}
                                    >
                                      {isCompleted ? <Check size={11} /> : null}
                                      <span>{isCompleted ? "Done" : "Check"}</span>
                                    </button>
                                  </div>
                                </div>
                                <h3 className="today-card-title">{t.label || t.name || t.id}</h3>
                                <div className="today-card-meta">
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Calendar size={11} /> {t.start} → {t.end}
                                  </span>
                                  {t.assignee && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          width: "18px",
                                          height: "18px",
                                          borderRadius: "50%",
                                          background: assigneeInfo.avatarColor,
                                          color: "#FFFFFF",
                                          fontSize: "10px",
                                          fontWeight: 700
                                        }}
                                      >
                                        {assigneeInfo.initials}
                                      </span>
                                      <span style={{ fontWeight: 600, color: "var(--jantt-text)" }}>{assigneeInfo.displayName}</span>
                                      {assigneeInfo.role && (
                                        <span style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>({assigneeInfo.role})</span>
                                      )}
                                      {assigneeInfo.team && (
                                        <span
                                          style={{
                                            fontSize: "9.5px",
                                            fontWeight: 700,
                                            background: `${assigneeInfo.team.color || "var(--jantt-accent)"}1F`,
                                            color: assigneeInfo.team.color || "var(--jantt-accent)",
                                            padding: "2px 6px",
                                            borderRadius: "100px",
                                            border: `1px solid ${assigneeInfo.team.color || "var(--jantt-accent)"}40`
                                          }}
                                        >
                                          {assigneeInfo.team.name}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {isCompleted ? (
                                  <div className="today-card-complete" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                    <Check size={11} />
                                    <span>Completed</span>
                                  </div>
                                ) : (
                                  <div className="today-card-progress">
                                    <div className="today-prog-bar-wrap">
                                      <div className="today-prog-bar-fill" style={{ width: `${Math.round((t.progress ?? 0) * 100)}%`, background: catColor }} />
                                    </div>
                                    <span className="today-prog-pct">{Math.round((t.progress ?? 0) * 100)}%</span>
                                  </div>
                                )}
                                <div className="today-card-actions" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <select
                                    className="kanban-status-select"
                                    value={t.status || "not-started"}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      const newStatus = e.target.value;
                                      let newProgress = t.progress;
                                      if (newStatus === "completed") newProgress = 1.0;
                                      else if (newStatus === "submitted" && (t.progress ?? 0) < 0.75) newProgress = 0.75;
                                      else if (newStatus === "not-started") newProgress = 0;
                                      const updatedTasks = parsedData.tasks.map((item) =>
                                        item.id === t.id ? { ...item, status: newStatus, progress: newProgress } : item
                                      );
                                      handleChartCommit({ ...parsedData, tasks: updatedTasks });
                                    }}
                                  >
                                    <option value="not-started">To Do</option>
                                    <option value="in-progress">In Progress</option>
                                    <option value="submitted">Submitted</option>
                                    <option value="completed">Completed</option>
                                  </select>
                                  <button
                                    className="kanban-sort-remove-btn"
                                    title="Delete task"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updatedTasks = parsedData.tasks.filter((item) => item.id !== t.id);
                                      const resolved = resolveSchedule(updatedTasks, parsedData.meta?.defaultGapDays ?? 2);
                                      handleChartCommit({ ...parsedData, tasks: resolved });
                                    }}
                                  >
                                    <Trash2 size={13} style={{ color: "var(--jantt-text-muted)" }} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  minHeight: "350px",
                  gap: "12px",
                  color: "var(--jantt-text-muted)"
                }}
              >
                <AlertTriangle size={36} color="#F43F5E" />
                <h3 style={{ color: "var(--jantt-text)" }}>Cannot render chart</h3>
                <p style={{ fontSize: "13px", maxWidth: "400px", textAlign: "center" }}>
                  Please resolve the schema diagnostic errors in the left panel to display the interactive chart.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>


      {/* AI Agent Workbench & Schema Cheatsheet Modal */}
      {showPromptModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowPromptModal(false)}>
          <div className="prompt-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <JanttIcon size={22} variant="gradient" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                  AI Agent Workbench & Schema Cheatsheet
                </h3>
              </div>
              <button
                className="prompt-modal-close-btn"
                onClick={() => setShowPromptModal(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Segmented Tab Bar */}
            <div className="prompt-modal-tabs">
              <button
                className={`prompt-tab-btn ${promptModalTab === "prompt" ? "is-active" : ""}`}
                onClick={() => setPromptModalTab("prompt")}
              >
                <Sparkles size={13} />
                <span>LLM System Prompt</span>
              </button>
              <button
                className={`prompt-tab-btn ${promptModalTab === "cheatsheet" ? "is-active" : ""}`}
                onClick={() => setPromptModalTab("cheatsheet")}
              >
                <FileJson size={13} />
                <span>JSON Schema Cheatsheet</span>
              </button>
              <button
                className={`prompt-tab-btn ${promptModalTab === "ideology" ? "is-active" : ""}`}
                onClick={() => setPromptModalTab("ideology")}
              >
                <Zap size={13} />
                <span>AI-Native Ideology</span>
              </button>
            </div>

            <div className="prompt-modal-body">
              {promptModalTab === "prompt" && (
                <>
                  <p className="prompt-modal-desc">
                    Hand this prompt to ChatGPT, Claude, Gemini, Cursor, or your autonomous AI agent. The model will output 100% valid, constraint-checked Jantt JSON schedules without hallucinating UI code:
                  </p>
                  <textarea
                    className="prompt-modal-textarea"
                    readOnly
                    value={llmPromptSnippet}
                    rows={15}
                  />
                </>
              )}

              {promptModalTab === "cheatsheet" && (
                <>
                  <p className="prompt-modal-desc">
                    Raw minimal Jantt JSON template structure. Provide this benchmark template directly to any code or LLM pipeline:
                  </p>
                  <textarea
                    className="prompt-modal-textarea"
                    readOnly
                    value={rawCheatsheetJson}
                    rows={15}
                  />
                </>
              )}

              {promptModalTab === "ideology" && (
                <div className="ideology-wrap">
                  <div className="ideology-hero">
                    <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "var(--jantt-accent)" }}>
                      Stop Asking AI to Write Fragile Timeline Code
                    </h4>
                    <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.5, color: "var(--jantt-text-muted)" }}>
                      Having LLMs generate hundreds of lines of React JSX, SVG coordinate math, and canvas listeners produces brittle, hallucination-prone results. With Jantt, the AI outputs <strong>pure declarative JSON</strong>, and Jantt delivers deterministic, interactive execution.
                    </p>
                  </div>

                  <div className="ideology-steps-grid">
                    <div className="ideology-step-card">
                      <div className="step-badge">Step 1</div>
                      <h5>Feed Cheatsheet to LLM</h5>
                      <p>Give the AI the compact schema contract (WBS, dates, DAG dependencies, milestones, budget).</p>
                    </div>
                    <div className="ideology-step-card">
                      <div className="step-badge">Step 2</div>
                      <h5>AI Outputs Pure JSON</h5>
                      <p>Uses 10× fewer tokens. Machine-checkable, type-safe, and zero UI hallucinations.</p>
                    </div>
                    <div className="ideology-step-card">
                      <div className="step-badge">Step 3</div>
                      <h5>Instant Interactive Suite</h5>
                      <p>Jantt resolves topological DAG schedules, routes orthogonal wires, and renders Gantt, Kanban & Analytics.</p>
                    </div>
                    <div className="ideology-step-card">
                      <div className="step-badge">Step 4</div>
                      <h5>Bidirectional Loop</h5>
                      <p>Humans drag and adjust visually. Jantt syncs clean JSON back to localStorage/disk for the AI agent.</p>
                    </div>
                  </div>

                  <div className="ideology-metrics-row">
                    <div className="ideology-metric-box">
                      <span className="metric-val">10×</span>
                      <span className="metric-lbl">Fewer LLM Tokens vs JSX</span>
                    </div>
                    <div className="ideology-metric-box">
                      <span className="metric-val">0</span>
                      <span className="metric-lbl">Runtime Dependencies</span>
                    </div>
                    <div className="ideology-metric-box">
                      <span className="metric-val">100%</span>
                      <span className="metric-lbl">Deterministic DAG Solver</span>
                    </div>
                    <div className="ideology-metric-box">
                      <span className="metric-val">2-Way</span>
                      <span className="metric-lbl">Bidirectional State Sync</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="prompt-modal-footer">
              <span style={{ fontSize: "11.5px", color: "var(--jantt-text-dim)", fontFamily: "var(--jantt-font-mono)" }}>
                Schema: https://jantt.dev/schema/v1.json (v1.2.0)
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button className="btn-nav" onClick={() => setShowPromptModal(false)}>
                  Close
                </button>
                {promptModalTab === "prompt" && (
                  <button className="btn-nav btn-nav-primary" onClick={handleCopyPrompt}>
                    {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                    {copiedPrompt ? "Copied Prompt" : "Copy LLM System Prompt"}
                  </button>
                )}
                {promptModalTab === "cheatsheet" && (
                  <button className="btn-nav btn-nav-primary" onClick={handleCopyRawCheatsheet}>
                    {copiedRawCheatsheet ? <Check size={14} /> : <Copy size={14} />}
                    {copiedRawCheatsheet ? "Copied JSON" : "Copy Raw Cheatsheet JSON"}
                  </button>
                )}
                {promptModalTab === "ideology" && (
                  <button className="btn-nav btn-nav-primary" onClick={handleCopyPrompt}>
                    {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                    {copiedPrompt ? "Copied Prompt" : "Copy System Prompt"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Plan / Template Modal */}
      {showAddPlanModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowAddPlanModal(false)}>
          <div className="prompt-modal-card" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className="prompt-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FolderPlus size={18} color="var(--jantt-accent)" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                  Add New Plan / Template
                </h3>
              </div>
              <button
                className="prompt-modal-close-btn"
                onClick={() => setShowAddPlanModal(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="prompt-modal-body" style={{ gap: "16px", padding: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px", color: "var(--jantt-text-muted)" }}>
                  Plan Name / Title
                </label>
                <input
                  type="text"
                  className="code-textarea"
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontFamily: "var(--jantt-font-sans)",
                    borderRadius: "8px",
                    border: "1px solid var(--jantt-border)",
                    boxSizing: "border-box"
                  }}
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateNewPlan();
                  }}
                  placeholder="e.g. Q4 Software Release Roadmap"
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
                  Starting Template Structure:
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: newPlanTemplateType === "blank" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                      background: newPlanTemplateType === "blank" ? "var(--jantt-surface-hover)" : "var(--jantt-surface)",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="radio"
                      name="planTemplate"
                      checked={newPlanTemplateType === "blank"}
                      onChange={() => setNewPlanTemplateType("blank")}
                      style={{ marginTop: "3px" }}
                    />
                    <div>
                      <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                        <FilePlus size={15} color="var(--jantt-accent)" />
                        Blank Plan (Clean Slate)
                      </strong>
                      <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                        Starts fresh with a minimal template: 1 sample task and category.
                      </span>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: newPlanTemplateType === "master" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                      background: newPlanTemplateType === "master" ? "var(--jantt-surface-hover)" : "var(--jantt-surface)",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="radio"
                      name="planTemplate"
                      checked={newPlanTemplateType === "master"}
                      onChange={() => setNewPlanTemplateType("master")}
                      style={{ marginTop: "3px" }}
                    />
                    <div>
                      <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                        <Zap size={15} color="var(--jantt-accent)" />
                        Master Benchmark Cheatsheet (Full Kitchen-Sink)
                      </strong>
                      <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                        The benchmark specification with categories, milestones, multi-dependencies, baselines, and custom fields.
                      </span>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: newPlanTemplateType === "clone" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                      background: newPlanTemplateType === "clone" ? "var(--jantt-surface-hover)" : "var(--jantt-surface)",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="radio"
                      name="planTemplate"
                      checked={newPlanTemplateType === "clone"}
                      onChange={() => setNewPlanTemplateType("clone")}
                      style={{ marginTop: "3px" }}
                    />
                    <div>
                      <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                        <Copy size={15} color="var(--jantt-accent)" />
                        Duplicate Current Schedule
                      </strong>
                      <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                        Clones all current tasks, categories, and links into a new separate plan.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="prompt-modal-footer">
              <button className="btn-nav" onClick={() => setShowAddPlanModal(false)}>
                Cancel
              </button>
              <button
                className="btn-nav btn-nav-primary"
                onClick={handleCreateNewPlan}
                disabled={!newPlanTitle.trim()}
              >
                <Plus size={14} />
                <span>Create & Save Plan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* People & Teams Management Modal */}
      {showPeopleModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowPeopleModal(false)}>
          <div className="prompt-modal-card" style={{ maxWidth: "620px" }} onClick={(e) => e.stopPropagation()}>
            <div className="prompt-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={18} color="var(--jantt-accent)" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                  Team &amp; Assignee Management
                </h3>
              </div>
              <button
                className="prompt-modal-close-btn"
                onClick={() => setShowPeopleModal(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs (Members vs Teams) */}
            <div className="prompt-modal-tabs">
              <button
                className={`prompt-tab-btn ${peopleModalTab === "people" ? "is-active" : ""}`}
                onClick={() => setPeopleModalTab("people")}
              >
                <Users size={13} />
                <span>Team Members ({effectivePeople.length})</span>
              </button>
              <button
                className={`prompt-tab-btn ${peopleModalTab === "teams" ? "is-active" : ""}`}
                onClick={() => setPeopleModalTab("teams")}
              >
                <Layers size={13} />
                <span>Teams &amp; Squads ({teams.length})</span>
              </button>
            </div>

            <div className="prompt-modal-body" style={{ gap: "18px", padding: "20px" }}>
              {peopleModalTab === "people" ? (
                <>
                  {/* Add New Member Input Bar */}
                  <div style={{ background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", borderRadius: "10px", padding: "14px" }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
                      Add New Team Member
                    </label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        className="code-textarea"
                        style={{
                          flex: "1 1 160px",
                          height: "38px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          fontFamily: "var(--jantt-font-sans)",
                          borderRadius: "8px",
                          border: "1px solid var(--jantt-border)",
                          boxSizing: "border-box"
                        }}
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddPerson();
                        }}
                        placeholder="Full Name (e.g. Alex Morgan)"
                      />
                      <input
                        type="text"
                        className="code-textarea"
                        style={{
                          flex: "1 1 130px",
                          height: "38px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          fontFamily: "var(--jantt-font-sans)",
                          borderRadius: "8px",
                          border: "1px solid var(--jantt-border)",
                          boxSizing: "border-box"
                        }}
                        value={newPersonRole}
                        onChange={(e) => setNewPersonRole(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddPerson();
                        }}
                        placeholder="Role (e.g. Tech Lead)"
                      />
                      {teams.length > 0 && (
                        <select
                          className="code-textarea"
                          style={{
                            flex: "1 1 120px",
                            height: "38px",
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontFamily: "var(--jantt-font-sans)",
                            borderRadius: "8px",
                            border: "1px solid var(--jantt-border)",
                            boxSizing: "border-box",
                            background: "var(--jantt-surface-solid)",
                            color: "var(--jantt-text)"
                          }}
                          value={newPersonTeamId}
                          onChange={(e) => setNewPersonTeamId(e.target.value)}
                        >
                          <option value="">No Team Assigned</option>
                          {teams.map((tm) => (
                            <option key={tm.id} value={tm.id}>Team: {tm.name}</option>
                          ))}
                        </select>
                      )}
                      <button
                        className="btn-nav btn-nav-primary"
                        style={{ height: "38px", padding: "0 14px", flexShrink: 0 }}
                        onClick={handleAddPerson}
                        disabled={!newPersonName.trim()}
                      >
                        <Plus size={14} />
                        <span>Add Member</span>
                      </button>
                    </div>
                  </div>

                  {/* People List */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", margin: 0, color: "var(--jantt-text-muted)" }}>
                        Current Members ({effectivePeople.length})
                      </label>
                      {effectivePeople.length > people.length && (
                        <button
                          className="btn-nav btn-nav-primary"
                          style={{ height: "24px", padding: "0 10px", fontSize: "10.5px" }}
                          onClick={handlePersistAllPeople}
                          title="Save all detected schedule assignees into the project JSON 'people' array"
                        >
                          Save All to JSON
                        </button>
                      )}
                    </div>

                    {effectivePeople.length > people.length && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "rgba(56, 189, 248, 0.08)",
                          border: "1px solid rgba(56, 189, 248, 0.2)",
                          borderRadius: "8px",
                          marginBottom: "10px",
                          fontSize: "11.5px",
                          color: "var(--jantt-text)"
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <Lightbulb size={14} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
                          <span>
                            <strong>{effectivePeople.length - people.length} assignee{effectivePeople.length - people.length === 1 ? "" : "s"}</strong> detected from schedule &amp; meta ({parsedData?.meta?.person ? `${parsedData.meta.person}, etc.` : "tasks"}).
                          </span>
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                          Visible across all views &amp; filters
                        </span>
                      </div>
                    )}

                    {effectivePeople.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--jantt-surface)", border: "1px dashed var(--jantt-border)", borderRadius: "10px", color: "var(--jantt-text-muted)" }}>
                        <Users size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>No team members defined yet.</p>
                        <p style={{ margin: "4px 0 0 0", fontSize: "11.5px" }}>Add members above to assign tasks and filter in the Today view.</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
                        {effectivePeople.map((p) => {
                          const assignedCount = parsedData?.tasks.filter(
                            (t) => t.assignee === p.name || t.assignee === p.id
                          ).length || 0;
                          const initials = p.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase();
                          const avatarBg = p.color || "var(--jantt-accent)";
                          const memberTeam = resolveTeamById(teams, p.teamId);

                          return (
                            <div
                              key={p.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 14px",
                                background: "var(--jantt-surface)",
                                border: "1px solid var(--jantt-border)",
                                borderRadius: "8px"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div
                                  style={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "50%",
                                    background: avatarBg,
                                    color: "#FFFFFF",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    flexShrink: 0
                                  }}
                                >
                                  {initials}
                                </div>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                                      {p.name}
                                    </span>
                                    <span style={{ fontSize: "10px", fontFamily: "var(--jantt-font-mono)", color: "var(--jantt-text-muted)" }}>
                                      #{p.id}
                                    </span>
                                    {p.isInferred && (
                                      <span
                                        style={{
                                          fontSize: "9.5px",
                                          fontWeight: 600,
                                          background: "rgba(56, 189, 248, 0.12)",
                                          color: "var(--jantt-accent)",
                                          padding: "1px 6px",
                                          borderRadius: "100px",
                                          border: "1px solid rgba(56, 189, 248, 0.25)"
                                        }}
                                        title="Automatically discovered from schedule assignees & metadata"
                                      >
                                        Inferred
                                      </span>
                                    )}
                                    {memberTeam && (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          fontWeight: 600,
                                          background: `${memberTeam.color || "var(--jantt-accent)"}1F`,
                                          color: memberTeam.color || "var(--jantt-accent)",
                                          padding: "1px 6px",
                                          borderRadius: "100px"
                                        }}
                                      >
                                        {memberTeam.name}
                                      </span>
                                    )}
                                  </div>
                                  {p.role && (
                                    <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                                      {p.role}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    padding: "2px 8px",
                                    borderRadius: "100px",
                                    background: assignedCount > 0 ? "rgba(56, 189, 248, 0.12)" : "var(--jantt-border-subtle)",
                                    color: assignedCount > 0 ? "var(--jantt-accent)" : "var(--jantt-text-muted)"
                                  }}
                                >
                                  {assignedCount} {assignedCount === 1 ? "task" : "tasks"}
                                </span>
                                {p.isInferred ? (
                                  <button
                                    onClick={() => handlePersistPerson(p)}
                                    className="btn-nav"
                                    style={{
                                      padding: "3px 8px",
                                      height: "26px",
                                      fontSize: "11px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px"
                                    }}
                                    title={`Add ${p.name} permanently to project JSON "people" array`}
                                  >
                                    <Plus size={11} />
                                    <span>Save to JSON</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRemovePerson(p.id)}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: "var(--jantt-text-muted)",
                                      cursor: "pointer",
                                      padding: "4px",
                                      borderRadius: "4px",
                                      display: "flex",
                                      alignItems: "center"
                                    }}
                                    title={`Remove ${p.name}`}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Add New Team / Squad Box */}
                  <div style={{ background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", borderRadius: "10px", padding: "14px" }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
                      Add New Team / Squad
                    </label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        type="text"
                        className="code-textarea"
                        style={{
                          flex: "1 1 160px",
                          height: "38px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          fontFamily: "var(--jantt-font-sans)",
                          borderRadius: "8px",
                          border: "1px solid var(--jantt-border)",
                          boxSizing: "border-box"
                        }}
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddTeam();
                        }}
                        placeholder="Team Name (e.g. Core Engineering)"
                      />
                      <input
                        type="color"
                        style={{
                          width: "38px",
                          height: "38px",
                          border: "1px solid var(--jantt-border)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          padding: "2px",
                          background: "var(--jantt-surface-solid)"
                        }}
                        value={newTeamColor}
                        onChange={(e) => setNewTeamColor(e.target.value)}
                        title="Pick Team Color"
                      />
                      <input
                        type="text"
                        className="code-textarea"
                        style={{
                          flex: "1 1 180px",
                          height: "38px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          fontFamily: "var(--jantt-font-sans)",
                          borderRadius: "8px",
                          border: "1px solid var(--jantt-border)",
                          boxSizing: "border-box"
                        }}
                        value={newTeamDesc}
                        onChange={(e) => setNewTeamDesc(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddTeam();
                        }}
                        placeholder="Description / Mission"
                      />
                      <button
                        className="btn-nav btn-nav-primary"
                        style={{ height: "38px", padding: "0 14px", flexShrink: 0 }}
                        onClick={handleAddTeam}
                        disabled={!newTeamName.trim()}
                      >
                        <Plus size={14} />
                        <span>Add Team</span>
                      </button>
                    </div>
                  </div>

                  {/* Teams List */}
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
                      Current Teams ({teams.length})
                    </label>
                    {teams.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--jantt-surface)", border: "1px dashed var(--jantt-border)", borderRadius: "10px", color: "var(--jantt-text-muted)" }}>
                        <Layers size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>No teams defined yet.</p>
                        <p style={{ margin: "4px 0 0 0", fontSize: "11.5px" }}>Create teams above to organize members and filter schedules by squad.</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
                        {teams.map((tm) => {
                          const memberCount = effectivePeople.filter((p) => p.teamId === tm.id).length;
                          return (
                            <div
                              key={tm.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 14px",
                                background: "var(--jantt-surface)",
                                border: "1px solid var(--jantt-border)",
                                borderRadius: "8px"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span
                                  style={{
                                    width: "14px",
                                    height: "14px",
                                    borderRadius: "50%",
                                    background: tm.color || "var(--jantt-accent)",
                                    display: "inline-block",
                                    flexShrink: 0
                                  }}
                                />
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                                      {tm.name}
                                    </span>
                                    <span style={{ fontSize: "10px", fontFamily: "var(--jantt-font-mono)", color: "var(--jantt-text-muted)" }}>
                                      #{tm.id}
                                    </span>
                                  </div>
                                  {tm.description && (
                                    <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                                      {tm.description}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    padding: "2px 8px",
                                    borderRadius: "100px",
                                    background: "rgba(56, 189, 248, 0.12)",
                                    color: "var(--jantt-accent)"
                                  }}
                                >
                                  {memberCount} {memberCount === 1 ? "member" : "members"}
                                </span>
                                <button
                                  onClick={() => handleRemoveTeam(tm.id)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--jantt-text-muted)",
                                    cursor: "pointer",
                                    padding: "4px",
                                    borderRadius: "4px",
                                    display: "flex",
                                    alignItems: "center"
                                  }}
                                  title={`Remove ${tm.name}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="prompt-modal-footer">
              <span style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                Teams and members are referenced by ID across your schedule.
              </span>
              <button
                className="btn-nav btn-nav-primary"
                onClick={() => setShowPeopleModal(false)}
              >
                <Check size={14} />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Remote / Cloud Plan Modal ────────────────────────────────────── */}
      {showLinkCloudModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowLinkCloudModal(false)}>
          <div
            className="prompt-modal-card"
            style={{ maxWidth: "620px", width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompt-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "var(--jantt-accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Cloud size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                    Link Remote / Cloud Plan
                  </h3>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                    Paste a link to your file from Google Drive, GitHub, Dropbox, or any direct JSON URL.
                  </p>
                </div>
              </div>
              <button className="btn-modal-close" onClick={() => setShowLinkCloudModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Cloud Tips Banner */}
              <div
                style={{
                  background: "var(--jantt-surface, #F8FAFC)",
                  border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "12px",
                  color: "var(--jantt-text)"
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Globe size={14} style={{ color: "var(--jantt-accent)" }} />
                  <span>How to get share links:</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--jantt-text-muted)", lineHeight: 1.6 }}>
                  <li>
                    <strong>Google Drive:</strong> Right-click file &rarr; <em>Share</em> &rarr; Set to <em>&quot;Anyone with the link can view&quot;</em> &rarr; Copy link &amp; paste here.
                  </li>
                  <li>
                    <strong>GitHub:</strong> Paste any GitHub file URL (e.g. <code>github.com/.../blob/main/schedule.json</code>).
                  </li>
                  <li>
                    <strong>Dropbox:</strong> Paste any shared Dropbox link (e.g. <code>dropbox.com/s/.../plan.json</code>).
                  </li>
                  <li>
                    <strong>Direct URL:</strong> Any public HTTPS endpoint serving valid Jantt JSON.
                  </li>
                </ul>
              </div>

              {/* URL Input */}
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, marginBottom: "6px", color: "var(--jantt-text)" }}>
                  Cloud Share Link or JSON URL:
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="prompt-input"
                    style={{ flex: 1 }}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    value={linkCloudUrl}
                    onChange={(e) => {
                      setLinkCloudUrl(e.target.value);
                      setCloudPreviewError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFetchCloudPreview();
                    }}
                  />
                  <button
                    className="btn-nav btn-nav-primary"
                    onClick={handleFetchCloudPreview}
                    disabled={isFetchingCloudPreview || !linkCloudUrl.trim()}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {isFetchingCloudPreview ? (
                      <>
                        <Loader2 size={14} className="spin-sync-icon" />
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <Link2 size={14} />
                        <span>Fetch &amp; Preview</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {cloudPreviewError && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid #EF4444",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "12.5px",
                    color: "#EF4444",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px"
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Unable to link remote plan:</div>
                    <div style={{ marginTop: "2px", whiteSpace: "pre-wrap" }}>{cloudPreviewError}</div>
                  </div>
                </div>
              )}

              {/* Preview Card */}
              {cloudPreviewResult && (
                <div
                  style={{
                    background: "rgba(56, 189, 248, 0.06)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    borderRadius: "8px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={16} style={{ color: "#10B981" }} />
                      <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--jantt-text)" }}>
                        {cloudPreviewResult.title}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "100px",
                        background: "var(--jantt-accent)",
                        color: "#FFFFFF"
                      }}
                    >
                      {cloudPreviewResult.info.label}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", fontSize: "12px" }}>
                    <div style={{ background: "var(--jantt-surface, #F8FAFC)", padding: "8px", borderRadius: "6px" }}>
                      <div style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>Tasks</div>
                      <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--jantt-text)" }}>
                        {cloudPreviewResult.taskCount}
                      </div>
                    </div>
                    <div style={{ background: "var(--jantt-surface, #F8FAFC)", padding: "8px", borderRadius: "6px" }}>
                      <div style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>Categories</div>
                      <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--jantt-text)" }}>
                        {Object.keys(cloudPreviewResult.data.categories || {}).length}
                      </div>
                    </div>
                    <div style={{ background: "var(--jantt-surface, #F8FAFC)", padding: "8px", borderRadius: "6px" }}>
                      <div style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>Schema</div>
                      <div style={{ fontWeight: 700, fontSize: "13px", color: "#10B981", marginTop: "2px" }}>
                        Valid &#x2713;
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--jantt-text)" }}>
                      Display Name (in your plan selector):
                    </label>
                    <input
                      type="text"
                      className="prompt-input"
                      value={linkCloudName}
                      onChange={(e) => setLinkCloudName(e.target.value)}
                      placeholder="Custom display name"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="prompt-modal-footer">
              <button className="btn-nav" onClick={() => setShowLinkCloudModal(false)}>
                Cancel
              </button>
              <button
                className="btn-nav btn-nav-primary"
                onClick={handleSaveLinkedCloudPlan}
                disabled={!linkCloudUrl.trim() || isFetchingCloudPreview}
              >
                <Cloud size={14} />
                <span>Save &amp; Subscribe to Plan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Plan Popup Modal ────────────────────────────────────── */}
      {showShareModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowShareModal(false)}>
          <div
            className="prompt-modal-card"
            style={{ maxWidth: "580px", width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompt-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "var(--jantt-accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Share2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                    Share Project Plan
                  </h3>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                    Copy a direct shareable link or open the original plan source.
                  </p>
                </div>
              </div>
              <button className="prompt-modal-close-btn" onClick={() => setShowShareModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Plan Overview Card */}
              <div
                style={{
                  background: "var(--jantt-surface, #F8FAFC)",
                  border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px"
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--jantt-text)" }}>
                    {currentProjectName}
                  </div>
                  <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                    {parsedData?.tasks?.length || 0} tasks &bull; View: {activeView.toUpperCase()} &bull; Theme: {activeTheme.label}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "3px 9px",
                    borderRadius: "100px",
                    background: activeProject?.source === "linked" ? "rgba(16, 185, 129, 0.12)" : "rgba(56, 189, 248, 0.12)",
                    color: activeProject?.source === "linked" ? "#10B981" : "var(--jantt-accent)",
                    border: `1px solid ${activeProject?.source === "linked" ? "rgba(16, 185, 129, 0.3)" : "rgba(56, 189, 248, 0.3)"}`
                  }}
                >
                  {activeProject?.source === "linked" ? "Cloud Linked" : activeProjectId === "default" ? "Template" : "Direct Plan"}
                </span>
              </div>

              {/* Shareable Link Input Section */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--jantt-text)"
                  }}
                >
                  Shareable Link:
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    className="prompt-input"
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      fontFamily: "var(--jantt-font-mono, monospace)",
                      fontSize: "12px",
                      flex: 1
                    }}
                  />
                  <button
                    className="btn-nav btn-nav-primary"
                    onClick={handleCopyShareLink}
                    style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    title="Copy share link to clipboard"
                  >
                    {copiedShareLink ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedShareLink ? "Copied!" : "Copy Link"}</span>
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                    Opens the exact schedule, active view, and theme in any browser.
                  </span>
                  {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                    <button
                      className="btn-nav"
                      style={{ fontSize: "11px", padding: "2px 8px" }}
                      onClick={handleNativeShare}
                      title="Open native device share dialog"
                    >
                      <Share2 size={11} />
                      <span>Share Device...</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Source Document Section ("or opening the source") */}
              <div
                style={{
                  background: "var(--jantt-surface, #F8FAFC)",
                  border: "1px solid var(--jantt-border, #E2E8F0)",
                  borderRadius: "10px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {activeProject?.source === "linked" ? (
                      <Cloud size={16} style={{ color: "var(--jantt-accent)" }} />
                    ) : (
                      <FileJson size={16} style={{ color: "var(--jantt-accent)" }} />
                    )}
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                      {activeProject?.source === "linked" ? "Original Cloud Source" : "Plan Source"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    {activeProject?.sourceUrl ? (
                      <a
                        href={activeProject.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-nav btn-nav-primary"
                        style={{ fontSize: "12px", textDecoration: "none" }}
                        title="Open the original source file URL in a new browser tab"
                      >
                        <ExternalLink size={13} />
                        <span>Open Source</span>
                      </a>
                    ) : (
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-nav"
                        style={{ fontSize: "12px", textDecoration: "none" }}
                        title="Open this plan link in a new browser tab"
                      >
                        <ExternalLink size={13} />
                        <span>Open Link</span>
                      </a>
                    )}
                  </div>
                </div>

                {activeProject?.sourceUrl ? (
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: "var(--jantt-text-muted)",
                      wordBreak: "break-all",
                      fontFamily: "var(--jantt-font-mono, monospace)",
                      background: "var(--jantt-bg, #FFFFFF)",
                      border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
                      borderRadius: "6px",
                      padding: "8px 10px"
                    }}
                  >
                    {activeProject.sourceUrl}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                      Raw JSON schedule data is self-contained. You can inspect or download the JSON source.
                    </span>
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <button
                        className="btn-nav"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => {
                          setShowShareModal(false);
                          setIsSidebarCollapsed(false);
                        }}
                        title="Open JSON editor sidebar"
                      >
                        <FileJson size={12} />
                        <span>View JSON</span>
                      </button>
                      <button
                        className="btn-nav"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={handleDownloadJson}
                        title="Download JSON file"
                      >
                        <Download size={12} />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="prompt-modal-footer">
              <button className="btn-nav" onClick={() => setShowShareModal(false)}>
                Close
              </button>
              <div style={{ display: "flex", gap: "8px" }}>
                {activeProject?.sourceUrl && (
                  <a
                    href={activeProject.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-nav"
                    style={{ textDecoration: "none" }}
                  >
                    <ExternalLink size={13} />
                    <span>Open Source</span>
                  </a>
                )}
                <button
                  className="btn-nav btn-nav-primary"
                  onClick={handleCopyShareLink}
                >
                  {copiedShareLink ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedShareLink ? "Link Copied!" : "Copy Share Link"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-Save Configuration Modal ────────────────────────────────────── */}
      {showAutoSaveModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowAutoSaveModal(false)}>
          <div
            className="prompt-modal-window"
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompt-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <Save size={18} style={{ color: "var(--jantt-accent)" }} />
                <div>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>Auto-Save Settings</h2>
                  <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                    Configure automatic persistence and review client storage
                  </span>
                </div>
              </div>
              <button className="prompt-modal-close-btn" onClick={() => setShowAutoSaveModal(false)}>
                <X size={15} />
              </button>
            </div>

            <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Status Banner */}
              <div
                style={{
                  background: saveStatus === "saved" ? "rgba(16, 185, 129, 0.09)" : "rgba(245, 158, 11, 0.09)",
                  border: `1px solid ${saveStatus === "saved" ? "rgba(16, 185, 129, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
                  borderRadius: "10px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {saveStatus === "saved" ? (
                    <CheckCircle2 size={18} style={{ color: "#10B981", flexShrink: 0 }} />
                  ) : saveStatus === "saving" ? (
                    <RefreshCw size={18} className="spin-sync-icon" style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
                  ) : (
                    <Clock size={18} style={{ color: "#F59E0B", flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--jantt-text)" }}>
                      {saveStatus === "saved"
                        ? "All changes saved"
                        : saveStatus === "saving"
                        ? "Saving changes..."
                        : "Pending unsaved changes"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                      Last saved: {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                  </div>
                </div>

                <button
                  className="btn-nav btn-nav-primary"
                  onClick={handleManualSaveNow}
                  style={{ fontSize: "11.5px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                  title="Force an immediate save to permanent browser storage"
                >
                  <Save size={12} />
                  <span>Save Now</span>
                </button>
              </div>

              {/* Cadence Selector */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--jantt-text-muted)", marginBottom: "8px" }}>
                  Auto-Save Cadence
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {AUTOSAVE_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        padding: "8px 12px",
                        background: autoSaveInterval === opt.id ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.08))" : "var(--jantt-surface)",
                        border: `1px solid ${autoSaveInterval === opt.id ? "var(--jantt-accent, #38BDF8)" : "var(--jantt-border)"}`,
                        borderRadius: "8px",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <input
                        type="radio"
                        name="autosave-interval"
                        value={opt.id}
                        checked={autoSaveInterval === opt.id}
                        onChange={() => setAutoSaveInterval(opt.id)}
                        style={{ marginTop: "3px" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--jantt-text)" }}>{opt.label}</span>
                          {opt.recommended && (
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--jantt-accent)", background: "var(--jantt-accent-glow)", padding: "1px 6px", borderRadius: "100px" }}>
                              Recommended
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                          {opt.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Diagnostic Footer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: "var(--jantt-surface)",
                  borderRadius: "8px",
                  border: "1px solid var(--jantt-border-subtle)",
                  fontSize: "11.5px",
                  color: "var(--jantt-text-muted)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <HardDrive size={13} style={{ color: "var(--jantt-accent)" }} />
                  <span>Persistent Client Storage (localStorage)</span>
                </div>
                <span style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 600, color: "var(--jantt-text)" }}>
                  ~{storageSizeKb} KB
                </span>
              </div>
            </div>

            <div className="prompt-modal-footer">
              <button className="btn-nav" onClick={() => setShowAutoSaveModal(false)}>
                Close
              </button>
              <button className="btn-nav btn-nav-primary" onClick={() => setShowAutoSaveModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Toast Notification ────────────────────────────────────────── */}
      {toastMessage && (
        <div
          className={`jantt-toast ${isToastError ? "toast-error" : "toast-success"}`}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            borderRadius: "8px",
            background: isToastError ? "#EF4444" : "#10B981",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: "13px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
            animation: "jantt-slide-in-right 0.25s ease-out"
          }}
        >
          {isToastError ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toastMessage}</span>
        </div>
      )}

    </div>

  );
}

export default App;

