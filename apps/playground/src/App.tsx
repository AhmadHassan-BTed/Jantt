import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  JanttData,
  Task,
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
  resolveSchedule
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
  User,
  Clock,
  FileSpreadsheet,
  RotateCcw,
  FolderPlus,
  Trash2,
  Upload,
  Plus
} from "lucide-react";

import { JanttLogo } from "./components/JanttLogo";
import constructionFixture from "../../../examples/construction-enterprise.json";

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  data: JanttData;
}

const DEFAULT_TEMPLATE: SavedProject = {
  id: "default",
  name: "Default Template: Enterprise Plan",
  updatedAt: "2026-08-31T00:00:00.000Z",
  data: constructionFixture as JanttData
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
  SIDEBAR_WIDTH: "jantt_saved_sidebar_width"
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

  let initialView: "gantt" | "kanban" | "summary" = "gantt";
  try {
    const savedView = localStorage.getItem(STORAGE_KEYS.VIEW) as any;
    if (savedView && ["gantt", "kanban", "summary"].includes(savedView)) initialView = savedView;
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
    initialWidth
  };
}

export function App() {
  const init = useMemo(() => loadInitialState(), []);

  const [customProjects, setCustomProjects] = useState<SavedProject[]>(() => loadSavedProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(init.activeProjectId);
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanTemplateType, setNewPlanTemplateType] = useState<"blank" | "enterprise" | "clone">("blank");
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
  const [activeView, setActiveView] = useState<"gantt" | "kanban" | "summary">(init.initialView);

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
      const newWidth = Math.min(Math.max(moveEvent.clientX, minW), maxW);
      setSidebarWidth(newWidth);
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

  // Switch active project
  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId);
    let projectData: JanttData = DEFAULT_TEMPLATE.data;
    if (projectId !== "default") {
      const found = customProjects.find((p) => p.id === projectId);
      if (found) projectData = found.data;
    }
    const formatted = JSON.stringify(projectData, null, 2);
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
    } else if (newPlanTemplateType === "enterprise") {
      data = {
        ...JSON.parse(JSON.stringify(constructionFixture)),
        meta: {
          ...(constructionFixture.meta || {}),
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
      data
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
  };

  // Delete custom project from localStorage
  const handleDeleteProject = (projectId: string) => {
    if (projectId === "default") return;
    const projToDelete = customProjects.find((p) => p.id === projectId);
    const confirmed = window.confirm(
      `Delete project "${projToDelete?.name || projectId}" from browser storage?`
    );
    if (!confirmed) return;
    const updated = customProjects.filter((p) => p.id !== projectId);
    setCustomProjects(updated);
    saveCustomProjects(updated);
    if (activeProjectId === projectId) {
      handleSelectProject("default");
    }
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
            data: parsed
          };
          const updated = [newProj, ...customProjects];
          setCustomProjects(updated);
          saveCustomProjects(updated);
          setActiveProjectId(newProj.id);
          localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
          setJsonText(JSON.stringify(parsed, null, 2));
          setParsedData(parsed);
          setValidationResult(val);
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

  const rawCheatsheetJson = `{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Project Master Schedule",
    "description": "Cross-functional delivery plan",
    "person": "Alex Morgan",
    "organization": "Acme Engineering Corp",
    "start": "2026-09-01",
    "end": "2027-02-28",
    "defaultGapDays": 2,
    "scale": "week",
    "linkRouting": "orthogonal",
    "showCriticalPath": true,
    "showBaselines": true,
    "currency": "USD",
    "budget": 350000,
    "version": "1.2.0"
  },
  "categories": {
    "planning": { "label": "Planning & Architecture", "color": "#38BDF8", "soft": "rgba(56,189,248,0.15)", "icon": "compass" },
    "core-dev": { "label": "Core Engineering", "color": "#10B981", "soft": "rgba(16,185,129,0.15)", "icon": "code-2" },
    "qa-testing": { "label": "QA & Validation", "color": "#F59E0B", "soft": "rgba(245,158,11,0.15)", "icon": "shield-check" },
    "release": { "label": "Release & Launch", "color": "#A855F7", "soft": "rgba(168,85,247,0.15)", "icon": "rocket" }
  },
  "documents": [
    { "id": "doc-prd", "label": "Product Requirement Document", "status": "have", "owner": "Alex Morgan", "url": "https://docs.acme.com/prd" },
    { "id": "doc-arch", "label": "System Architecture RFC", "status": "have", "owner": "Dev Lead", "url": "https://docs.acme.com/rfc" }
  ],
  "tasks": [
    {
      "id": "spec-approval",
      "wbs": "1.1",
      "label": "Architecture Spec & RFC Signoff",
      "category": "planning",
      "start": "2026-09-01",
      "end": "2026-09-14",
      "assignee": "Alex Morgan",
      "priority": "high",
      "progress": 1.0,
      "status": "completed",
      "estimatedCost": 15000,
      "actualCost": 14200
    },
    {
      "id": "gate-arch-approved",
      "wbs": "1.2",
      "label": "Architecture Gate Approved",
      "category": "planning",
      "start": "2026-09-15",
      "end": "2026-09-15",
      "milestone": true,
      "dependsOn": "spec-approval",
      "status": "completed"
    },
    {
      "id": "core-engine",
      "wbs": "2.1",
      "label": "Core Engine & DAG Solver",
      "category": "core-dev",
      "start": "2026-09-17",
      "end": "2026-10-20",
      "assignee": "Core Dev Team",
      "dependsOn": "gate-arch-approved",
      "gapDays": 2,
      "priority": "urgent",
      "progress": 0.65,
      "status": "in-progress",
      "estimatedCost": 60000,
      "actualCost": 38000,
      "baseline": { "start": "2026-09-15", "end": "2026-10-18" },
      "fields": { "repo": "github.com/org/core", "storyPoints": 21 }
    },
    {
      "id": "qa-e2e",
      "wbs": "3.1",
      "label": "End-to-End Test Suite",
      "category": "qa-testing",
      "start": "2026-10-22",
      "end": "2026-11-15",
      "assignee": "QA Lead",
      "dependsOn": "core-engine",
      "gapDays": 2,
      "priority": "medium",
      "progress": 0.1,
      "status": "not-started",
      "estimatedCost": 25000
    },
    {
      "id": "v1-launch",
      "wbs": "4.1",
      "label": "Production v1.0 Launch Gate",
      "category": "release",
      "start": "2026-11-18",
      "end": "2026-11-18",
      "milestone": true,
      "dependsOn": "qa-e2e",
      "gapDays": 3,
      "status": "not-started"
    }
  ]
}`;

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
          {/* View Switcher: Gantt Timeline, Kanban Board, Budget & Analytics */}
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
              <span>Budget & KPI</span>
            </button>
          </div>

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
              {customProjects.length > 0 && (
                <optgroup label={`My Saved Plans (${customProjects.length})`}>
                  {customProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.data?.tasks?.length || 0} tasks)
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

          {/* Delete Active Custom Plan Button */}
          {activeProjectId !== "default" && (
            <button
              className="btn-nav"
              style={{ color: "#EF4444" }}
              onClick={() => handleDeleteProject(activeProjectId)}
              title="Delete this custom plan from browser memory"
            >
              <Trash2 size={13} />
              <span>Delete Plan</span>
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
                    {err.suggestion && <div className="error-suggestion">💡 {err.suggestion}</div>}
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
              activeView === "gantt" ? (
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
                  viewport={{
                    scale: currentScale,
                    linkRouting,
                    rowHeight,
                    rowHeightMode,
                    showCriticalPath,
                    showBaselines
                  }}
                  theme={activeTheme.vars}
                  themeClassName={activeTheme.className}
                />
              ) : activeView === "kanban" ? (
                <div className="kanban-view-container">
                  {(
                    [
                      { id: "not-started", label: "To Do / Not Started" },
                      { id: "in-progress", label: "In Progress" },
                      { id: "submitted", label: "In Review / Submitted" },
                      { id: "completed", label: "Completed" }
                    ] as const
                  ).map((col) => {
                    const colTasks = parsedData.tasks.filter((t) => {
                      if (col.id === "not-started") return !t.status || t.status === "not-started";
                      return t.status === col.id;
                    });
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
                            return (
                              <div key={t.id} className="kanban-card">
                                <div className="kanban-card-top">
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className="kanban-cat-dot" style={{ background: catColor }} />
                                    <span className="kanban-cat-label">{cat?.label || t.category}</span>
                                  </div>
                                  {t.priority && (
                                    <span className={`kanban-prio-badge is-${t.priority}`}>
                                      {t.priority}
                                    </span>
                                  )}
                                </div>
                                <h4 className="kanban-card-title">{t.label || t.name || t.id}</h4>
                                <div className="kanban-card-meta">
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Calendar size={11} />
                                    <span>{t.start} → {t.end}</span>
                                  </div>
                                  {t.assignee && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <User size={11} />
                                      <span>{t.assignee}</span>
                                    </div>
                                  )}
                                </div>
                                {t.progress !== undefined && t.progress !== null && (
                                  <div className="kanban-card-prog-wrap">
                                    <div className="kanban-card-prog-bar" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                                  </div>
                                )}
                                <div className="kanban-card-footer">
                                  <select
                                    className="kanban-status-select"
                                    value={t.status || "not-started"}
                                    onChange={(e) => {
                                      const updatedTasks = parsedData.tasks.map((item) =>
                                        item.id === t.id ? { ...item, status: e.target.value } : item
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
              ) : (
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
                            (parsedData.tasks.reduce((sum, t) => sum + (t.progress || 0), 0) /
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
                      Work Breakdown & Category Distribution
                    </h3>
                    <table className="summary-table">
                      <thead>
                        <tr>
                          <th>WBS</th>
                          <th>Task Name</th>
                          <th>Category</th>
                          <th>Assignee</th>
                          <th>Dates</th>
                          <th>Budget ($)</th>
                          <th>Status</th>
                          <th>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.tasks.map((t) => {
                          const cat = parsedData.categories?.[t.category];
                          return (
                            <tr key={t.id}>
                              <td style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 700 }}>{t.wbs || "-"}</td>
                              <td style={{ fontWeight: 600 }}>{t.label || t.name || t.id}</td>
                              <td>
                                <span className="jantt-label-dot" style={{ background: cat?.color || "var(--jantt-accent)", display: "inline-block", marginRight: "6px" }} />
                                {cat?.label || t.category}
                              </td>
                              <td>{t.assignee || "-"}</td>
                              <td style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }}>{t.start} → {t.end}</td>
                              <td style={{ fontFamily: "var(--jantt-font-mono)" }}>
                                {t.estimatedCost ? `$${t.estimatedCost.toLocaleString()}` : "-"}
                              </td>
                              <td>
                                <span className={`kanban-prio-badge is-${t.status || "not-started"}`}>
                                  {t.status || "not-started"}
                                </span>
                              </td>
                              <td>{t.progress !== undefined && t.progress !== null ? `${Math.round(t.progress * 100)}%` : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
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
                <h3 style={{ color: "var(--jantt-text)" }}>Cannot render Gantt chart</h3>
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={18} color="var(--jantt-accent)" />
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
                      <strong style={{ display: "block", fontSize: "13px", color: "var(--jantt-text)" }}>
                        ✨ Blank Plan (Clean Slate)
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
                      border: newPlanTemplateType === "enterprise" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                      background: newPlanTemplateType === "enterprise" ? "var(--jantt-surface-hover)" : "var(--jantt-surface)",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="radio"
                      name="planTemplate"
                      checked={newPlanTemplateType === "enterprise"}
                      onChange={() => setNewPlanTemplateType("enterprise")}
                      style={{ marginTop: "3px" }}
                    />
                    <div>
                      <strong style={{ display: "block", fontSize: "13px", color: "var(--jantt-text)" }}>
                        🏢 Enterprise Master Template
                      </strong>
                      <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                        Full high-rise engineering schedule with phases, milestones, and dependencies.
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
                      <strong style={{ display: "block", fontSize: "13px", color: "var(--jantt-text)" }}>
                        📋 Duplicate Current Schedule
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
    </div>
  );
}

export default App;
