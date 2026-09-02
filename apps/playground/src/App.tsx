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
  RemoteFetchResult
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
  Star,
  Cloud,
  RefreshCw,
  ExternalLink,
  Link2,
  GitFork,
  Globe,
  Loader2
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
export type DateFilterMode = "all" | "today" | "date";

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
  DATE_FILTER_MODE: "jantt_date_filter_mode"
};


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

  let initialView: "gantt" | "kanban" | "summary" | "today" = "gantt";
  try {
    const savedView = localStorage.getItem(STORAGE_KEYS.VIEW) as any;
    if (savedView && ["gantt", "kanban", "summary", "today"].includes(savedView)) initialView = savedView;
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
    if (savedDFM && ["all", "today", "date"].includes(savedDFM)) initialDateFilterMode = savedDFM;
  } catch {}

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
    initialView,
    initialCollapsed,
    initialWidth,
    initialKanbanSort,
    initialPersonFilter,
    initialDateFilterMode
  };
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
  const [linkRouting, setLinkRouting] = useState<LinkRoutingStyle>(init.initialRouting);
  const [rowHeightMode, setRowHeightMode] = useState<RowHeightMode>(init.initialRowHeightMode);
  const [rowHeight, setRowHeight] = useState<number>(init.initialRowHeight);
  const [showCriticalPath, setShowCriticalPath] = useState(init.initialCritical);
  const [showBaselines, setShowBaselines] = useState(init.initialBaselines);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(init.initialCollapsed);
  const [activeView, setActiveView] = useState<"gantt" | "kanban" | "summary" | "today">(init.initialView);

  // ── Date Filter State ──────────────────────────────────────────────────
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>(init.initialDateFilterMode);
  const [dateFilterValue, setDateFilterValue] = useState<string>(getTodayISODate());

  // ── Summary View Sort State ────────────────────────────────────────────
  const [summarySortConfig, setSummarySortConfig] = useState<SummarySortConfig>({ column: "", direction: null });

  // ── Kanban Multi-Sort State ────────────────────────────────────────────
  const [kanbanSortRules, setKanbanSortRules] = useState<KanbanSortRule[]>(init.initialKanbanSort);

  // ── People & Team Management State ─────────────────────────────────────
  const [people, setPeople] = useState<Person[]>(() => (init.initialParsed as any)?.people || []);
  const [teams, setTeams] = useState<Team[]>(() => (init.initialParsed as any)?.teams || []);
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


  // Auto-persist active state and custom projects to localStorage memory
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, jsonText);
    } catch {}

    // If a custom project is active, auto-update it in customProjects
    if (activeProjectId !== "default" && parsedData) {
      setCustomProjects((prev) => {
        const updated = prev.map((p) =>
          p.id === activeProjectId ? { ...p, data: parsedData, updatedAt: new Date().toISOString() } : p
        );
        saveCustomProjects(updated);
        return updated;
      });
    }
  }, [jsonText, activeProjectId, parsedData]);

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
    if (dateFilterMode === "date") return dateFilterValue;
    return null;
  }, [dateFilterMode, dateFilterValue]);

  const isTaskMatchingDateFilter = useCallback((task: Task): boolean => {
    if (!dateFilterActiveDate) return true;
    return isTaskOnDate(task.start, task.end, dateFilterActiveDate);
  }, [dateFilterActiveDate]);

  // ── Derived State: Summary Sorted Tasks (with progress auto-sync) ─────────
  const sortedSummaryTasks = useMemo(() => {
    if (!parsedData) return [];
    // Apply status → progress auto-sync
    let tasks = parsedData.tasks.map((t) => {
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
          const aInfo = resolveTaskAssignee(a, people, teams);
          const bInfo = resolveTaskAssignee(b, people, teams);
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
  }, [parsedData, summarySortConfig, people, teams]);

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
            const aInfo = resolveTaskAssignee(a, people, teams);
            const bInfo = resolveTaskAssignee(b, people, teams);
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
  }, [kanbanSortRules, people, teams]);

  // ── People & Team Management Handlers ─────────────────────────────────────
  const handleAddPerson = () => {
    if (!newPersonName.trim() || !parsedData) return;
    const PERSON_COLORS = ["#4FAE93", "#38BDF8", "#F59E0B", "#A78BFA", "#F43F5E", "#10B981", "#FB923C", "#60A5FA"];
    const newPerson: Person = {
      id: `person-${Date.now().toString(36)}`,
      name: newPersonName.trim(),
      role: newPersonRole.trim() || undefined,
      teamId: newPersonTeamId || undefined,
      color: PERSON_COLORS[people.length % PERSON_COLORS.length]
    };
    const updated = [...people, newPerson];
    setPeople(updated);
    const updatedData = { ...parsedData, people: updated };
    handleChartCommit(updatedData);
    setNewPersonName("");
    setNewPersonRole("");
    setNewPersonTeamId("");
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
    if (activeView !== "gantt" || dateFilterMode === "all") {
      // Remove all dimming when switching to "all"
      document.querySelectorAll<HTMLElement>("[data-task-id]").forEach((el) => {
        el.classList.remove("jantt-task-dimmed");
      });
      return;
    }
    const handle = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>("[data-task-id]").forEach((el) => {
        const taskId = el.dataset.taskId;
        const task = parsedData?.tasks.find((t) => t.id === taskId);
        if (task && !isTaskMatchingDateFilter(task)) {
          el.classList.add("jantt-task-dimmed");
        } else {
          el.classList.remove("jantt-task-dimmed");
        }
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [activeView, dateFilterMode, dateFilterValue, parsedData, isTaskMatchingDateFilter]);




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
    setParsedData(updated);
    // Sync people and teams from updated data if present
    if (Array.isArray((updated as any).people)) {
      setPeople((updated as any).people);
    }
    if (Array.isArray((updated as any).teams)) {
      setTeams((updated as any).teams);
    }
    const formatted = JSON.stringify(updated, null, 2);
    setJsonText(formatted);
    setValidationResult(validate(updated));


    // Trigger visual sync flash / glow in JSON editor
    setIsLiveSyncing(true);
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      setIsLiveSyncing(false);
    }, 1300);
  }, []);


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
      style={{ ...(activeTheme.vars as React.CSSProperties) }}
    >
      {/* Navbar Header */}
      <header className="navbar">
        <div className="brand-section">
          <JanttLogo size={28} />
          <span className="brand-badge">v1.1.0</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              color: "#10B981",
              background: "rgba(16, 185, 129, 0.12)",
              padding: "2px 8px",
              borderRadius: "12px",
              fontWeight: 600,
              marginLeft: "4px"
            }}
            title="All changes are continuously auto-saved to permanent browser storage (localStorage)"
          >
            <CheckCircle2 size={11} />
            <span>Auto-Saved</span>
          </span>
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
          {/* View Switcher: Gantt Timeline, Kanban Board, Budget & Analytics, Today Focus */}
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
              className={`jantt-scale-btn ${activeView === "summary" ? "is-active" : ""}`}
              onClick={() => setActiveView("summary")}
              title="Project Budget & Performance Analytics"
            >
              <PieChart size={13} />
              <span>Budget &amp; KPI</span>
            </button>
            <button
              className={`jantt-scale-btn today-tab-btn ${activeView === "today" ? "is-active" : ""}`}
              onClick={() => setActiveView("today")}
              title="Today's Focus — tasks active today"
            >
              <Star size={13} />
              <span>Today</span>
            </button>
          </div>

          {/* People (Team) Manager Button */}
          <button
            className="btn-nav"
            onClick={() => setShowPeopleModal(true)}
            title="Manage team members and assignees"
          >
            <Users size={13} />
            <span>People{people.length > 0 ? ` (${people.length})` : ""}</span>
          </button>


          {/* Plan / Project Selector */}
          <div className="nav-select-group">
            <label htmlFor="project-select">Plan:</label>
            <select
              id="project-select"
              className="select-input"
              value={activeProjectId}
              onChange={(e) => handleSelectProject(e.target.value)}
            >
              <optgroup label="Templates">
                <option value="default">{DEFAULT_TEMPLATE.name}</option>
              </optgroup>
              {customProjects.filter((p) => p.source !== "linked").length > 0 && (
                <optgroup label={`💻 Local Plans (${customProjects.filter((p) => p.source !== "linked").length})`}>
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
                <optgroup label={`☁️ Linked Cloud Plans (${customProjects.filter((p) => p.source === "linked").length})`}>
                  {customProjects
                    .filter((p) => p.source === "linked")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        ☁️ {p.name} ({p.data?.tasks?.length || 0} tasks)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* + Add Plan Button */}
          <button
            className="btn-prompt"
            style={{ background: "var(--jantt-accent)", color: "#FFFFFF", fontWeight: 700 }}
            onClick={handleOpenAddPlanModal}
            title="Create a new blank plan, clone existing, or use a template"
          >
            <Plus size={14} />
            <span>Add Plan</span>
          </button>

          {/* Link Cloud Plan Button */}
          <button
            className="btn-nav"
            onClick={handleOpenLinkCloudModal}
            title="Link and sync a remote plan from Google Drive, GitHub, Dropbox or direct URL"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Cloud size={13} style={{ color: "var(--jantt-accent)" }} />
            <span>Link Cloud Plan</span>
          </button>

          {/* Linked Cloud Plan Controls (when active plan is linked) */}
          {customProjects.some((p) => p.id === activeProjectId && p.source === "linked") && (() => {
            const linkedActive = customProjects.find((p) => p.id === activeProjectId)!;
            return (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--jantt-accent)",
                    background: "rgba(56, 189, 248, 0.12)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                  title={`Source URL: ${linkedActive.sourceUrl || "Cloud"}\nLast synced: ${linkedActive.lastSyncedAt || "Never"}`}
                >
                  <Cloud size={11} />
                  <span>Synced: {formatRelativeTime(linkedActive.lastSyncedAt)}</span>
                </span>

                <button
                  className="btn-nav"
                  onClick={handleSyncActiveProject}
                  disabled={isSyncingProject}
                  title="Re-fetch and update this plan from the cloud URL"
                  style={{ color: "var(--jantt-accent)", fontWeight: 600 }}
                >
                  <RefreshCw size={13} className={isSyncingProject ? "spin-sync-icon" : ""} />
                  <span>{isSyncingProject ? "Syncing..." : "Sync"}</span>
                </button>

                <button
                  className="btn-nav"
                  onClick={handleForkToLocalPlan}
                  title="Create an editable local copy of this cloud plan"
                >
                  <GitFork size={13} />
                  <span>Fork</span>
                </button>

                {linkedActive.sourceUrl && (
                  <a
                    href={linkedActive.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-nav"
                    title="Open original cloud link in new tab"
                    style={{ padding: "6px 8px", display: "inline-flex", alignItems: "center" }}
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            );
          })()}

          {/* Delete / Unlink Active Plan Button */}
          {activeProjectId !== "default" && (
            <button
              className="btn-nav"
              style={{ color: "#EF4444" }}
              onClick={() => handleDeleteProject(activeProjectId)}
              title={
                customProjects.find((p) => p.id === activeProjectId)?.source === "linked"
                  ? "Unlink this cloud plan from browser storage"
                  : "Delete this custom plan from browser memory"
              }
            >
              <Trash2 size={13} />
              <span>
                {customProjects.find((p) => p.id === activeProjectId)?.source === "linked"
                  ? "Unlink"
                  : "Delete Plan"}
              </span>
            </button>
          )}


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

          {/* Download JSON Button */}
          <button className="btn-nav" onClick={handleDownloadJson} title="Download Jantt JSON file">
            <Download size={14} />
            <span>JSON</span>
          </button>

          {/* Export CSV Button */}
          <button className="btn-nav" onClick={handleExportCsv} title="Export RFC-4180 CSV / Excel spreadsheet">
            <FileSpreadsheet size={14} />
            <span>CSV</span>
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
                {/* ── Date Filter Bar (shown on Kanban, Budget & KPI, Today) ── */}
                {activeView !== "gantt" && (
                  <div className="date-filter-bar">
                    <div className="date-filter-tabs">
                      <button
                        className={`date-filter-tab ${dateFilterMode === "all" ? "is-active" : ""}`}
                        onClick={() => setDateFilterMode("all")}
                      >All Tasks</button>
                      <button
                        className={`date-filter-tab ${dateFilterMode === "today" ? "is-active" : ""}`}
                        onClick={() => setDateFilterMode("today")}
                      >
                        <Clock size={11} />
                        Today
                      </button>
                      <button
                        className={`date-filter-tab ${dateFilterMode === "date" ? "is-active" : ""}`}
                        onClick={() => setDateFilterMode("date")}
                      >
                        <Calendar size={11} />
                        Pick Date
                      </button>
                    </div>
                    {dateFilterMode === "date" && (
                      <input
                        type="date"
                        className="date-filter-input"
                        value={dateFilterValue}
                        onChange={(e) => setDateFilterValue(e.target.value)}
                      />
                    )}
                    {dateFilterMode !== "all" && (
                      <span className="date-filter-active-label">
                        Showing: {dateFilterMode === "today" ? getTodayISODate() : dateFilterValue}
                      </span>
                    )}
                  </div>
                )}

                {/* ── GANTT VIEW ── */}
                {activeView === "gantt" && (
                  <>
                    {/* Date Filter Bar for Gantt (separate to keep it at top of Gantt toolbar area) */}
                    <div className="date-filter-bar">
                      <div className="date-filter-tabs">
                        <button className={`date-filter-tab ${dateFilterMode === "all" ? "is-active" : ""}`} onClick={() => setDateFilterMode("all")}>All Tasks</button>
                        <button className={`date-filter-tab ${dateFilterMode === "today" ? "is-active" : ""}`} onClick={() => setDateFilterMode("today")}><Clock size={11} />Today</button>
                        <button className={`date-filter-tab ${dateFilterMode === "date" ? "is-active" : ""}`} onClick={() => setDateFilterMode("date")}><Calendar size={11} />Pick Date</button>
                      </div>
                      {dateFilterMode === "date" && (
                        <input type="date" className="date-filter-input" value={dateFilterValue} onChange={(e) => setDateFilterValue(e.target.value)} />
                      )}
                      {dateFilterMode !== "all" && (
                        <span className="date-filter-active-label">Showing: {dateFilterMode === "today" ? getTodayISODate() : dateFilterValue}</span>
                      )}
                    </div>
                    <Jantt
                      data={parsedData}
                      onCommit={handleChartCommit}
                      onTaskAdd={handleAddNewTask}
                      onViewportChange={(vp) => {
                        if (vp.scale) setCurrentScale(vp.scale);
                        if (vp.linkRouting) setLinkRouting(vp.linkRouting);
                        if (vp.rowHeight !== undefined) setRowHeight(vp.rowHeight);
                        if (vp.rowHeightMode !== undefined) setRowHeightMode(vp.rowHeightMode);
                        if (vp.showCriticalPath !== undefined) setShowCriticalPath(vp.showCriticalPath);
                        if (vp.showBaselines !== undefined) setShowBaselines(vp.showBaselines);
                      }}
                      viewport={{ scale: currentScale, linkRouting, rowHeight, rowHeightMode, showCriticalPath, showBaselines }}
                      theme={activeTheme.vars}
                      themeClassName={activeTheme.className}
                    />
                  </>
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
                          >
                            {rule.direction === "asc" ? "↑" : "↓"}
                          </button>
                          {kanbanSortRules.length > 1 && (
                            <button
                              className="kanban-sort-remove-btn"
                              title="Remove this sort rule"
                              onClick={() => setKanbanSortRules(kanbanSortRules.filter((_, i) => i !== idx))}
                            >×</button>
                          )}
                        </div>
                      ))}
                      {kanbanSortRules.length < 4 && (
                        <button
                          className="kanban-sort-add-btn"
                          onClick={() => setKanbanSortRules([...kanbanSortRules, { field: "start", direction: "asc" }])}
                        >+ Add Sort</button>
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
                        return (
                          <div key={col.id} className="kanban-column">
                            <div className="kanban-col-header">
                              <span className="kanban-col-title">{col.label}</span>
                              <span className="kanban-col-count">{colTasks.length}</span>
                            </div>
                            <div className="kanban-card-list">
                              {colTasks.map((t) => {
                                const cat = parsedData.categories?.[t.category];
                                const catColor = cat?.color || "var(--jantt-accent)";
                                const isCompleted = t.status === "completed";
                                const isDimmed = !isTaskMatchingDateFilter(t);
                                const assigneeInfo = resolveTaskAssignee(t, people, teams);
                                return (
                                  <div key={t.id} className={`kanban-card ${isDimmed ? "kanban-card-dimmed" : ""}`}>
                                    <div className="kanban-card-top">
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span className="kanban-cat-dot" style={{ background: catColor }} />
                                        <span className="kanban-cat-label">{cat?.label || t.category}</span>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
                                      <div className="kanban-card-complete-badge">✓ Done</div>
                                    ) : t.progress !== undefined && t.progress !== null ? (
                                      <div className="kanban-card-prog-wrap">
                                        <div className="kanban-card-prog-bar" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                                      </div>
                                    ) : null}
                                    <div className="kanban-card-footer">
                                      <select
                                        className="kanban-status-select"
                                        value={t.status || "not-started"}
                                        onChange={(e) => {
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
                            ${parsedData.tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0).toLocaleString()}
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
                              (parsedData.tasks.reduce((sum, t) => sum + (t.status === "completed" ? 1 : (t.progress || 0)), 0) /
                                Math.max(parsedData.tasks.length, 1)) *
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
                          <span className="kpi-value">{parsedData.tasks.length}</span>
                        </div>
                      </div>
                      <div className="summary-kpi-card">
                        <div className="kpi-icon-wrap" style={{ color: "var(--jantt-critical)" }}>
                          <Clock size={20} />
                        </div>
                        <div className="kpi-data">
                          <span className="kpi-label">Milestones Tracked</span>
                          <span className="kpi-value">{parsedData.tasks.filter((t) => t.milestone).length}</span>
                        </div>
                      </div>
                    </div>

                    <div className="summary-breakdown-card">
                      <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>
                        Work Breakdown &amp; Category Distribution
                        {summarySortConfig.column && (
                          <span style={{ fontSize: "11px", fontWeight: 400, marginLeft: "10px", color: "var(--jantt-text-muted)" }}>
                            Sorted by {summarySortConfig.column} {summarySortConfig.direction === "asc" ? "↑" : "↓"}
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
                                {col === "wbs" ? "WBS" : col === "name" ? "Task Name" : col === "category" ? "Category" : "Assignee / Team"}
                                {summarySortConfig.column === col && (summarySortConfig.direction === "asc" ? " ↑" : " ↓")}
                              </th>
                            ))}
                            <th className={`summary-th-sortable ${summarySortConfig.column === "start" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("start")}>
                              Start{summarySortConfig.column === "start" && (summarySortConfig.direction === "asc" ? " ↑" : " ↓")}
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "end" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("end")}>
                              End{summarySortConfig.column === "end" && (summarySortConfig.direction === "asc" ? " ↑" : " ↓")}
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "budget" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("budget")}>
                              Budget ($){summarySortConfig.column === "budget" && (summarySortConfig.direction === "asc" ? " ↑" : " ↓")}
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "status" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("status")}>
                              Status{summarySortConfig.column === "status" && (summarySortConfig.direction === "asc" ? " ↑" : " ↓")}
                            </th>
                            <th className={`summary-th-sortable ${summarySortConfig.column === "progress" ? "is-sorted" : ""}`} onClick={() => handleSummarySort("progress")}>
                              Progress{summarySortConfig.column === "progress" && (summarySortConfig.direction === "asc" ? " ↑" : " ↓")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSummaryTasks.map((t) => {
                            const cat = parsedData.categories?.[t.category];
                            const isCompleted = t.status === "completed";
                            const effectiveProgress = isCompleted ? 1.0 : (t.progress ?? 0);
                            const isDimmed = !isTaskMatchingDateFilter(t);
                            const assigneeInfo = resolveTaskAssignee(t, people, teams);
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
                                    <span className="progress-complete-badge">✓ 100%</span>
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

                {/* ── TODAY VIEW ── */}
                {activeView === "today" && (
                  <div className="today-view-container">
                    <div className="today-view-header">
                      <div className="today-view-title-section">
                        <Star size={20} style={{ color: "var(--jantt-accent)" }} />
                        <h2 className="today-view-title">Today's Focus</h2>
                        <span className="today-view-date-badge">{getTodayISODate()}</span>
                        <span className="today-task-count-badge">
                          {parsedData.tasks.filter((t) => isTaskOnDate(t.start, t.end, getTodayISODate())).length} tasks active today
                        </span>
                      </div>
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
                          {people.length > 0 && (
                            <optgroup label="Team Members">
                              {people.map((p) => {
                                const pTeam = resolveTeamById(teams, p.teamId);
                                return (
                                  <option key={p.id} value={p.id}>
                                    {p.name}{p.role ? ` (${p.role})` : ""}{pTeam ? ` • ${pTeam.name}` : ""}
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="today-task-grid">
                      {(() => {
                        const today = getTodayISODate();
                        let todayTasks = parsedData.tasks.filter((t) => isTaskOnDate(t.start, t.end, today));
                        if (selectedPersonFilter !== "all") {
                          if (selectedPersonFilter.startsWith("team:")) {
                            const targetTeamId = selectedPersonFilter.replace("team:", "");
                            todayTasks = todayTasks.filter((t) => {
                              const assigneeInfo = resolveTaskAssignee(t, people, teams);
                              return assigneeInfo.team?.id === targetTeamId || t.teamId === targetTeamId;
                            });
                          } else {
                            todayTasks = todayTasks.filter((t) => {
                              const assigneeInfo = resolveTaskAssignee(t, people, teams);
                              return (
                                t.assignee === selectedPersonFilter ||
                                assigneeInfo.person?.id === selectedPersonFilter ||
                                assigneeInfo.person?.name === selectedPersonFilter
                              );
                            });
                          }
                        }
                        if (todayTasks.length === 0) {
                          return (
                            <div className="today-empty-state">
                              <CheckCircle2 size={48} style={{ color: "#10B981" }} />
                              <h3>All Clear!</h3>
                              <p>No tasks scheduled for today{selectedPersonFilter !== "all" ? " for this selection" : ""}.</p>
                            </div>
                          );
                        }
                        return todayTasks.map((t) => {
                          const cat = parsedData.categories?.[t.category];
                          const catColor = cat?.color || "var(--jantt-accent)";
                          const isCompleted = t.status === "completed";
                          const assigneeInfo = resolveTaskAssignee(t, people, teams);
                          return (
                            <div key={t.id} className={`today-task-card ${isCompleted ? "is-completed" : ""}`} style={{ borderTopColor: catColor }}>
                              <div className="today-card-header">
                                <div className="today-card-category">
                                  <span className="kanban-cat-dot" style={{ background: catColor }} />
                                  <span>{cat?.label || t.category}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  {t.wbs && <span className="kanban-wbs-badge">{t.wbs}</span>}
                                  {t.priority && <span className={`kanban-prio-badge is-${t.priority}`}>{t.priority}</span>}
                                </div>
                              </div>
                              <h3 className="today-card-title">{t.label || t.name || t.id}</h3>
                              <div className="today-card-meta">
                                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Calendar size={11} /> {t.start} → {t.end}
                                </span>
                                {t.assignee && (
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
                                <div className="today-card-complete">✓ Completed</div>
                              ) : (
                                <div className="today-card-progress">
                                  <div className="today-prog-bar-wrap">
                                    <div className="today-prog-bar-fill" style={{ width: `${Math.round((t.progress ?? 0) * 100)}%`, background: catColor }} />
                                  </div>
                                  <span className="today-prog-pct">{Math.round((t.progress ?? 0) * 100)}%</span>
                                </div>
                              )}
                              <div className="today-card-actions">
                                <select
                                  className="kanban-status-select"
                                  value={t.status || "not-started"}
                                  onChange={(e) => {
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
                                  <option value="submitted">Submitted / Review</option>
                                  <option value="completed">Mark as Completed ✓</option>
                                </select>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
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
                <span>Team Members ({people.length})</span>
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
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
                      Current Members ({people.length})
                    </label>
                    {people.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--jantt-surface)", border: "1px dashed var(--jantt-border)", borderRadius: "10px", color: "var(--jantt-text-muted)" }}>
                        <Users size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>No team members defined yet.</p>
                        <p style={{ margin: "4px 0 0 0", fontSize: "11.5px" }}>Add members above to assign tasks and filter in the Today view.</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
                        {people.map((p) => {
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
                          const memberCount = people.filter((p) => p.teamId === tm.id).length;
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

