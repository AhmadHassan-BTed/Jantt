import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type TimeScale,
  type ValidationResult,
  validate
} from "@jantt/core";
import {
  importMsProjectXml,
  importPrimaveraXer,
  importSpreadsheetCsv
} from "@jantt/interop";
import type { SavedProject } from "../types";
import { DEFAULT_TEMPLATE, STORAGE_KEYS } from "../constants";
import {
  createBlankPlan,
  loadSavedProjects,
  updateStoredProjects,
  generateId,
  cloneTemplateData,
  loadDefaultPlanData,
  purgeProjectStorage
} from "../utils";
import { storageService } from "../services/storage";
import { commandBus } from "../services/bus";

interface UseProjectStateOptions {
  initialProjects: SavedProject[];
  initialActiveId: string;
  parsedData: JanttData | null;
  setJsonText: (text: string) => void;
  setParsedData: (data: JanttData | null) => void;
  setValidationResult: (res: ValidationResult) => void;
  setPeople: (people: Person[]) => void;
  setTeams: (teams: Team[]) => void;
  setCurrentScale: (scale: TimeScale) => void;
  setShowCriticalPath: (val: boolean) => void;
  setShowBaselines: (val: boolean) => void;
  showToast: (msg: string, isErr?: boolean) => void;
  flushPendingSave?: () => void;
  onCreateCloudRoom?: (title: string, data: JanttData) => Promise<string | null>;
  onUpdateExistingRoom?: (roomId: string, data: JanttData) => Promise<boolean>;
}

const STORAGE_FULL_MESSAGE =
  "Browser storage is full: the plan list could not be saved and only lives in this tab. Export your plans (JSON) or delete old ones.";

/**
 * Mirrors the active plan in the address bar. A room's editor secret is never written there:
 * anyone the URL is copied to would get editor rights.
 */
function syncUrlForProject(project?: SavedProject) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    ["url", "data", "name", "plan", "cloud"].forEach((key) => url.searchParams.delete(key));
    if (project?.source === "room" && project.roomId) {
      url.searchParams.set("room", project.roomId);
    } else {
      url.searchParams.delete("room");
    }
    url.hash = "";
    window.history.replaceState(null, "", url.toString());
  } catch {}
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Retitles a plan copy that this hook owns (callers pass a deep copy, never live data). */
function withTitle(copy: JanttData, title: string): JanttData {
  return { ...copy, meta: { ...(copy.meta || {}), title } };
}

export function useProjectState({
  initialProjects,
  initialActiveId,
  parsedData,
  setJsonText,
  setParsedData,
  setValidationResult,
  setPeople,
  setTeams,
  setCurrentScale,
  setShowCriticalPath,
  setShowBaselines,
  showToast,
  flushPendingSave,
  onCreateCloudRoom,
  onUpdateExistingRoom
}: UseProjectStateOptions) {
  const [customProjects, setCustomProjects] = useState<SavedProject[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(initialActiveId);
  const customProjectsRef = useRef(customProjects);
  customProjectsRef.current = customProjects;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  const flushPendingSaveRef = useRef(flushPendingSave);
  flushPendingSaveRef.current = flushPendingSave;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanTemplateType, setNewPlanTemplateType] = useState<"blank" | "master" | "clone">("blank");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProject = useMemo(() => {
    return customProjects.find((p) => p.id === activeProjectId);
  }, [customProjects, activeProjectId]);

  const currentProjectName = useMemo(() => {
    if (activeProjectId === "default") return DEFAULT_TEMPLATE.name;
    return activeProject?.name || parsedData?.meta?.title || "Project Plan";
  }, [activeProjectId, activeProject, parsedData]);

  // Persist and announce every active-plan change, whichever code path made it
  const previousActiveIdRef = useRef<string | null>(null);
  useEffect(() => {
    storageService.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, activeProjectId);
    const previousId = previousActiveIdRef.current;
    previousActiveIdRef.current = activeProjectId;
    if (previousId !== null && previousId !== activeProjectId) {
      commandBus.emit("ACTIVE_PROJECT_CHANGED", { projectId: activeProjectId, previousId });
    }
  }, [activeProjectId]);

  // Another tab changed the plan list: adopt it so this tab never writes a stale list back
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORAGE_KEYS.CUSTOM_PROJECTS) return;
      const fresh = loadSavedProjects();
      customProjectsRef.current = fresh;
      setCustomProjects(fresh);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  /**
   * Applies one list mutation to both browser storage (read-modify-write of the latest stored
   * list) and React state. Returns false when the list could not be stored durably.
   */
  const commitProjects = useCallback((mutate: (projects: SavedProject[]) => SavedProject[]): boolean => {
    const ok = updateStoredProjects(mutate);
    customProjectsRef.current = mutate(customProjectsRef.current);
    setCustomProjects((prev) => mutate(prev));
    if (!ok) showToastRef.current(STORAGE_FULL_MESSAGE, true);
    return ok;
  }, []);

  /** Loads plan data into the editor, people/teams registries and view toggles. */
  const loadIntoEditor = useCallback(
    (data: JanttData) => {
      const formatted = JSON.stringify(data, null, 2);
      setJsonText(formatted);
      let parsed: JanttData | null = null;
      try {
        parsed = JSON.parse(formatted);
      } catch {
        parsed = null;
      }
      const val = validate(parsed || {});
      setValidationResult(val);
      if (!parsed || !val.valid) {
        setParsedData(null);
        return;
      }
      setParsedData(parsed);
      setPeople(parsed.people || []);
      setTeams(parsed.teams || []);
      if (parsed.meta?.scale) setCurrentScale(parsed.meta.scale);
      if (parsed.meta?.showBaselines !== undefined) setShowBaselines(parsed.meta.showBaselines);
      if (parsed.meta?.showCriticalPath !== undefined) setShowCriticalPath(parsed.meta.showCriticalPath);
    },
    [
      setJsonText,
      setParsedData,
      setValidationResult,
      setPeople,
      setTeams,
      setCurrentScale,
      setShowCriticalPath,
      setShowBaselines
    ]
  );

  /**
   * Makes a plan the active one. Pending edits of the outgoing plan are flushed first so they
   * are written to the plan they belong to.
   */
  const activateProject = useCallback(
    (projectId: string, data: JanttData, project?: SavedProject) => {
      flushPendingSaveRef.current?.();
      activeProjectIdRef.current = projectId;
      setActiveProjectId(projectId);
      syncUrlForProject(project);
      loadIntoEditor(data);
    },
    [loadIntoEditor]
  );

  /** Adds a new local plan to the list and opens it. */
  const addAndOpenProject = useCallback(
    (newProj: SavedProject) => {
      commitProjects((list) => [newProj, ...list.filter((p) => p.id !== newProj.id)]);
      activateProject(newProj.id, newProj.data, newProj);
    },
    [commitProjects, activateProject]
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      // Flush before reading the target: re-selecting the open plan must load the edits just
      // saved, not the older stored copy (which the next autosave would write back)
      flushPendingSaveRef.current?.();
      if (projectId === "default") {
        activateProject("default", loadDefaultPlanData());
        return;
      }
      const found =
        customProjectsRef.current.find((p) => p.id === projectId) ||
        loadSavedProjects().find((p) => p.id === projectId);
      if (!found) {
        showToastRef.current("That plan no longer exists in this browser. Opened the default plan instead.", true);
        activateProject("default", loadDefaultPlanData());
        return;
      }
      activateProject(projectId, found.data, found);
    },
    [activateProject]
  );

  const handleOpenAddPlanModal = useCallback(() => {
    setNewPlanTitle(`Custom Plan ${customProjects.length + 1}`);
    setNewPlanTemplateType("blank");
    setShowAddPlanModal(true);
  }, [customProjects.length]);

  const handleCreateNewPlan = useCallback(
    async (
      customTitle?: string,
      customTemplateType?: "blank" | "master" | "clone",
      destination: "local" | "new_room" | "existing_room" = "local",
      targetRoomId?: string
    ) => {
      const title = (customTitle !== undefined ? customTitle : newPlanTitle).trim();
      if (!title) return;

      const templateType = customTemplateType || newPlanTemplateType;

      let data: JanttData;
      if (templateType === "blank") {
        data = createBlankPlan(title);
      } else if (templateType === "master") {
        data = withTitle(cloneTemplateData(), title);
      } else {
        const source = parsedDataRef.current;
        data = source ? withTitle(deepCopy(source), title) : createBlankPlan(title);
      }

      if (destination === "new_room") {
        if (onCreateCloudRoom) {
          setShowAddPlanModal(false);
          await onCreateCloudRoom(title, data);
          return;
        }
      } else if (destination === "existing_room" && targetRoomId) {
        if (onUpdateExistingRoom) {
          setShowAddPlanModal(false);
          await onUpdateExistingRoom(targetRoomId, data);
          return;
        }
      }

      // Default Destination: "local"
      const newProj: SavedProject = {
        id: generateId("plan"),
        name: title,
        updatedAt: new Date().toISOString(),
        data,
        source: "local"
      };
      addAndOpenProject(newProj);
      setShowAddPlanModal(false);
      showToast(`Created local plan "${newProj.name}"`);
    },
    [newPlanTitle, newPlanTemplateType, onCreateCloudRoom, onUpdateExistingRoom, addAndOpenProject, showToast]
  );

  const handleForkToLocalPlan = useCallback(() => {
    const activeProj = customProjectsRef.current.find((p) => p.id === activeProjectIdRef.current);
    if (!activeProj) return;

    const forkedName = `${activeProj.name} (Editable Copy)`;
    const newProj: SavedProject = {
      id: generateId("plan"),
      name: forkedName,
      updatedAt: new Date().toISOString(),
      data: withTitle(deepCopy(parsedDataRef.current || activeProj.data), forkedName),
      source: "local"
    };
    addAndOpenProject(newProj);
    showToast(`Created independent local copy: "${newProj.name}"`);
  }, [addAndOpenProject, showToast]);

  const handleCreateLocalCopyFromData = useCallback(
    (title: string, data: JanttData) => {
      const copyTitle = title.endsWith("(Local Copy)") ? title : `${title} (Local Copy)`;
      const newProj: SavedProject = {
        id: generateId("plan"),
        name: copyTitle,
        updatedAt: new Date().toISOString(),
        data: withTitle(deepCopy(data), copyTitle),
        source: "local"
      };
      addAndOpenProject(newProj);
      showToast(`Saved local offline copy: "${copyTitle}"`);
    },
    [addAndOpenProject, showToast]
  );

  const handleRenameProject = useCallback(
    (projectId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const updatedAt = new Date().toISOString();
      commitProjects((list) =>
        list.map((p) =>
          p.id === projectId
            ? {
                ...p,
                name: trimmed,
                data: p.data ? { ...p.data, meta: { ...(p.data.meta || {}), title: trimmed } } : p.data,
                updatedAt
              }
            : p
        )
      );

      const current = parsedDataRef.current;
      if (activeProjectIdRef.current === projectId && current) {
        const updatedActiveData = {
          ...current,
          meta: { ...(current.meta || {}), title: trimmed }
        };
        setParsedData(updatedActiveData);
        setJsonText(JSON.stringify(updatedActiveData, null, 2));
      }
      showToast(`Renamed plan to "${trimmed}"`);
    },
    [commitProjects, setParsedData, setJsonText, showToast]
  );

  const handleDuplicateProject = useCallback(
    (projectId: string) => {
      // The active plan is duplicated from the editor so unsaved edits are included
      const isActive = projectId === activeProjectIdRef.current && parsedDataRef.current;
      let sourceData: JanttData | null = isActive ? parsedDataRef.current : null;
      let baseName = "Plan";
      if (projectId === "default") {
        sourceData = sourceData || loadDefaultPlanData();
        baseName = DEFAULT_TEMPLATE.name;
      } else {
        const found = customProjectsRef.current.find((p) => p.id === projectId);
        if (found) {
          sourceData = sourceData || found.data;
          baseName = found.name;
        }
      }
      if (!sourceData) return;

      const copyTitle = `${baseName} (Copy)`;
      const newProj: SavedProject = {
        id: generateId("plan"),
        name: copyTitle,
        updatedAt: new Date().toISOString(),
        data: withTitle(deepCopy(sourceData), copyTitle),
        source: "local"
      };
      addAndOpenProject(newProj);
      showToast(`Duplicated into "${copyTitle}"`);
    },
    [addAndOpenProject, showToast]
  );

  /**
   * Removes a plan from this device. Asks for confirmation unless `options.confirm` is false
   * (for flows that already confirmed, or that keep the plan elsewhere, e.g. a move to the cloud).
   */
  const handleDeleteProject = useCallback(
    (projectId: string, options?: { confirm?: boolean }) => {
      if (projectId === "default") return;
      const projToDelete = customProjectsRef.current.find((p) => p.id === projectId);
      const name = projToDelete?.name || projectId;
      const isRoom = projToDelete?.source === "room";
      const promptMsg = isRoom
        ? `Remove the offline copy of cloud room "${name}" from this device?\n\nThe room itself, its members and its cloud data are not affected. To leave or delete the room, use the Plan Manager.`
        : `Permanently delete the local plan "${name}" and its version history from this browser?\n\nThis cannot be undone. Export it first if you may need it again.`;
      if (options?.confirm !== false && !window.confirm(promptMsg)) return;

      // Switch away first (this flushes pending edits), then remove the plan and its storage
      if (activeProjectIdRef.current === projectId) {
        activateProject("default", loadDefaultPlanData());
      }
      commitProjects((list) => list.filter((p) => p.id !== projectId));
      purgeProjectStorage(projectId);
      showToast(isRoom ? `Removed the offline copy of "${name}" from this device.` : `Deleted local plan "${name}".`);
    },
    [activateProject, commitProjects, showToast]
  );

  const handleImportFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onerror = () => {
        showToast(`Could not read "${file.name}".`, true);
      };
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          let parsed: JanttData;
          const lowerName = file.name.toLowerCase();

          if (lowerName.endsWith(".xml")) {
            parsed = importMsProjectXml(content);
          } else if (lowerName.endsWith(".xer")) {
            parsed = importPrimaveraXer(content);
          } else if (lowerName.endsWith(".csv")) {
            parsed = importSpreadsheetCsv(content);
          } else {
            parsed = JSON.parse(content);
          }

          const val = validate(parsed);
          if (!val.valid) {
            const shown = val.errors.slice(0, 3).map((err) => `${err.path}: ${err.message}`).join(" | ");
            const more = val.errors.length > 3 ? ` (+${val.errors.length - 3} more)` : "";
            showToast(`"${file.name}" was not imported: ${shown}${more}`, true);
            return;
          }

          const cleanBase = file.name.replace(/\.(json|xml|xer|csv)$/i, "");
          const newProj: SavedProject = {
            id: generateId("proj"),
            name: parsed.meta?.title || cleanBase,
            updatedAt: new Date().toISOString(),
            data: parsed,
            source: "local"
          };
          addAndOpenProject(newProj);
          showToast(`Imported "${newProj.name}"`);
        } catch (err: any) {
          showToast(`Failed to parse "${file.name}": ${err?.message || err}`, true);
        }
      };
      reader.readAsText(file);
    },
    [addAndOpenProject, showToast]
  );

  const handleImportJsonFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) handleImportFile(file);
    },
    [handleImportFile]
  );

  /**
   * Reverts the active plan to its last saved state, discarding unsaved edits. The default plan
   * is persisted like any other plan, so it reverts to its saved copy (the built-in template
   * only when it was never saved), never silently wiping saved work.
   */
  const handleResetActiveProject = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    const target =
      projectId === "default"
        ? loadDefaultPlanData()
        : customProjectsRef.current.find((p) => p.id === projectId)?.data;
    if (!target) return;
    const before = parsedDataRef.current;
    loadIntoEditor(deepCopy(target));
    if (before) {
      // Recorded like any local edit, so Ctrl+Z brings the discarded changes back
      commandBus.emit("LOCAL_COMMIT", { before, after: target });
      showToast("Reset to the last saved state. Press Ctrl+Z to undo.");
    }
  }, [loadIntoEditor, showToast]);

  /** Persists a plan's data. Returns false when it could not be stored durably. */
  const saveProjectData = useCallback((projectId: string, data: JanttData): boolean => {
    const updatedAt = new Date().toISOString();
    // Only plans that still exist are updated: never resurrect a removed plan
    const apply = (list: SavedProject[]) =>
      list.map((p) => (p.id === projectId ? { ...p, data, updatedAt } : p));
    const ok = updateStoredProjects(apply);
    customProjectsRef.current = apply(customProjectsRef.current);
    setCustomProjects((prev) => apply(prev));
    return ok;
  }, []);

  return {
    customProjects,
    setCustomProjects,
    activeProjectId,
    setActiveProjectId,
    activeProject,
    currentProjectName,
    showAddPlanModal,
    setShowAddPlanModal,
    newPlanTitle,
    setNewPlanTitle,
    newPlanTemplateType,
    setNewPlanTemplateType,
    fileInputRef,
    handleSelectProject,
    handleOpenAddPlanModal,
    handleCreateNewPlan,
    handleForkToLocalPlan,
    handleCreateLocalCopyFromData,
    handleRenameProject,
    handleDuplicateProject,
    handleDeleteProject,
    handleImportFile,
    handleImportJsonFile,
    handleResetActiveProject,
    saveProjectData
  };
}
