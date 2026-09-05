import {
  type JanttData,
  type Person,
  type Task,
  type Team,
  type TimeScale,
  type LinkRoutingStyle,
  type RowHeightMode,
  validate,
  themeManager,
  getTodayISODate,
  addDays,
  resolveTaskAssignee,
  compressPlanToUrlPayload,
  decompressPlanFromUrlPayload,
  isMatchingCloudUrl
} from "@jantt/core";
import type {
  SavedProject,
  DateFilterMode,
  CompletedFilterMode,
  ActiveView,
  KanbanSortRule,
  EffectivePerson
} from "./types";
import { DEFAULT_TEMPLATE, STORAGE_KEYS, PERSON_COLORS } from "./constants";

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

export function createBlankPlan(title: string): JanttData {
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

export function loadSavedProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveCustomProjects(projects: SavedProject[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, JSON.stringify(projects));
  } catch {}
}

export function encodeDataToBase64Url(data: JanttData): string {
  try {
    return compressPlanToUrlPayload(data);
  } catch (err) {
    console.error("Failed to encode plan data to base64url:", err);
    return "";
  }
}

export function decodeDataFromBase64Url(base64url: string): JanttData | null {
  try {
    return decompressPlanFromUrlPayload(base64url);
  } catch (err) {
    console.error("Failed to decode plan data from base64url:", err);
    return null;
  }
}

export function loadInitialState() {
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
    if (savedJson && activeProjectId === "default") {
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

  let initialRowHeightMode: RowHeightMode = "custom";
  try {
    const savedMode = localStorage.getItem(STORAGE_KEYS.ROW_HEIGHT_MODE) as RowHeightMode;
    if (savedMode && ["fit", "custom"].includes(savedMode)) initialRowHeightMode = savedMode;
  } catch {}

  let initialRowHeight = 48;
  try {
    const savedHeight = localStorage.getItem(STORAGE_KEYS.ROW_HEIGHT);
    if (savedHeight) initialRowHeight = parseInt(savedHeight, 10) || 48;
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
    else if (savedView && ["gantt", "kanban", "summary", "tasks", "notes"].includes(savedView)) initialView = savedView;
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

  // Restore completed filter mode
  let initialCompletedFilterMode: CompletedFilterMode = "show";
  try {
    const savedCFM = localStorage.getItem(STORAGE_KEYS.COMPLETED_FILTER_MODE) as CompletedFilterMode;
    if (savedCFM && ["show", "dim", "filter"].includes(savedCFM)) initialCompletedFilterMode = savedCFM;
  } catch {}

  // Check URL share params (?view=, ?theme=, ?scale=, #data=, ?data=, ?plan=default)
  if (typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;

      const viewParam = urlParams.get("view");
      if (viewParam && ["gantt", "kanban", "summary", "tasks", "notes"].includes(viewParam)) {
        initialView = viewParam as ActiveView;
      }

      const completedParam = urlParams.get("completed") as CompletedFilterMode;
      if (completedParam && ["show", "dim", "filter"].includes(completedParam)) {
        initialCompletedFilterMode = completedParam;
      }

      const themeParam = urlParams.get("theme");
      if (themeParam && themeManager.getTheme(themeParam)) {
        initialTheme = themeParam;
      }

      const scaleParam = urlParams.get("scale") as TimeScale;
      if (scaleParam && ["day", "week", "month", "quarter", "year"].includes(scaleParam)) {
        initialScale = scaleParam;
      }

      const cloudUrl = urlParams.get("url");
      if (cloudUrl) {
        const existingLinked = savedProjects.find(
          (p) => p.source === "linked" && isMatchingCloudUrl(p.sourceUrl, cloudUrl)
        );
        if (existingLinked) {
          activeProjectId = existingLinked.id;
          initialParsed = existingLinked.data;
          initialJson = JSON.stringify(existingLinked.data, null, 2);
          try {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, existingLinked.id);
          } catch {}
        }
      }

      let dataPayload: string | null = null;
      if (hash && !cloudUrl) {
        const rawHash = hash.replace(/^#/, "");
        if (rawHash.startsWith("data=")) {
          dataPayload = rawHash.substring(5);
        } else {
          const hp = new URLSearchParams(rawHash);
          if (hp.get("data")) dataPayload = hp.get("data");
        }
      }
      if (!dataPayload && !cloudUrl) {
        dataPayload = urlParams.get("data");
      }

      // Only import as local if not actively viewing or linking a cloud plan
      const activeCurrent = savedProjects.find((p) => p.id === activeProjectId);
      const isCurrentlyLinked = activeCurrent?.source === "linked" || !!cloudUrl;

      if (dataPayload && !isCurrentlyLinked) {
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
          // Never overwrite a linked cloud project with a local copy
          const existingIndex = savedProjects.findIndex(
            (p) => p.name === sharedName && p.source !== "linked" && p.data?.tasks?.length === decoded.tasks?.length
          );
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
    initialDateFilterMode,
    initialCompletedFilterMode
  };
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

export function isTaskMatchingPersonFilter(
  task: Task,
  selectedPersonFilter: string,
  effectivePeople: EffectivePerson[],
  teams: Team[]
): boolean {
  if (!selectedPersonFilter || selectedPersonFilter === "all" || selectedPersonFilter.startsWith("sort:")) {
    return true;
  }
  if (selectedPersonFilter.startsWith("team:")) {
    const targetTeamId = selectedPersonFilter.replace("team:", "");
    const assigneeInfo = resolveTaskAssignee(task, effectivePeople, teams);
    return assigneeInfo.team?.id === targetTeamId || task.teamId === targetTeamId;
  }
  const targetPerson = effectivePeople.find((p) => p.id === selectedPersonFilter);
  const assigneeInfo = resolveTaskAssignee(task, effectivePeople, teams);
  return (
    task.assignee === selectedPersonFilter ||
    (targetPerson && task.assignee === targetPerson.name) ||
    assigneeInfo.person?.id === selectedPersonFilter ||
    assigneeInfo.person?.name === selectedPersonFilter
  );
}

export function sortTasksByAssignee(
  tasks: Task[],
  effectivePeople: EffectivePerson[],
  teams: Team[]
): Task[] {
  return [...tasks].sort((a, b) => {
    const aInfo = resolveTaskAssignee(a, effectivePeople, teams);
    const bInfo = resolveTaskAssignee(b, effectivePeople, teams);
    const aName = (aInfo.displayName || a.assignee || "").toLowerCase();
    const bName = (bInfo.displayName || b.assignee || "").toLowerCase();
    if (!aName && bName) return 1;
    if (aName && !bName) return -1;
    return aName.localeCompare(bName);
  });
}

