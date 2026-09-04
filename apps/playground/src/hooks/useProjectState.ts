import { useState, useRef, useMemo, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type TimeScale,
  type ValidationResult,
  validate
} from "@jantt/core";
import type { SavedProject } from "../types";
import { DEFAULT_TEMPLATE, STORAGE_KEYS } from "../constants";
import { saveCustomProjects, createBlankPlan } from "../utils";
import masterTemplateFixture from "../../../../examples/master-template.json";

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
  flushPendingSave
}: UseProjectStateOptions) {
  const [customProjects, setCustomProjects] = useState<SavedProject[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(initialActiveId);
  const flushPendingSaveRef = useRef(flushPendingSave);
  flushPendingSaveRef.current = flushPendingSave;
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

  const handleSelectProject = useCallback(
    (projectId: string) => {
      // Synchronously flush unpersisted edits of current project before switching
      flushPendingSaveRef.current?.();

      setActiveProjectId(projectId);
      try {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId);
      } catch {}

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
    },
    [
      customProjects,
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

  const handleOpenAddPlanModal = useCallback(() => {
    setNewPlanTitle(`Custom Plan ${customProjects.length + 1}`);
    setNewPlanTemplateType("blank");
    setShowAddPlanModal(true);
  }, [customProjects.length]);

  const handleCreateNewPlan = useCallback(() => {
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
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
    } catch {}
    setJsonText(JSON.stringify(data, null, 2));
    setParsedData(data);
    setPeople(data.people || []);
    setTeams(data.teams || []);
    setValidationResult(validate(data));
    setShowAddPlanModal(false);
    showToast(`Created local plan "${newProj.name}"`);
  }, [
    newPlanTitle,
    newPlanTemplateType,
    parsedData,
    customProjects,
    setJsonText,
    setParsedData,
    setPeople,
    setTeams,
    setValidationResult,
    showToast
  ]);

  const handleForkToLocalPlan = useCallback(() => {
    const activeProj = customProjects.find((p) => p.id === activeProjectId);
    if (!activeProj) return;

    const forkedData = parsedData
      ? JSON.parse(JSON.stringify(parsedData))
      : JSON.parse(JSON.stringify(activeProj.data));

    const newProj: SavedProject = {
      id: `plan-${Date.now().toString(36)}`,
      name: `${activeProj.name} (Editable Copy)`,
      updatedAt: new Date().toISOString(),
      data: forkedData,
      source: "local"
    };

    const updated = [newProj, ...customProjects];
    setCustomProjects(updated);
    saveCustomProjects(updated);
    setActiveProjectId(newProj.id);
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
    } catch {}
    setJsonText(JSON.stringify(forkedData, null, 2));
    setParsedData(forkedData);
    setValidationResult(validate(forkedData));
    showToast(`Created independent local copy: "${newProj.name}"`);
  }, [
    customProjects,
    activeProjectId,
    parsedData,
    setJsonText,
    setParsedData,
    setValidationResult,
    showToast
  ]);

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      if (projectId === "default") return;
      const projToDelete = customProjects.find((p) => p.id === projectId);
      const isLinked = projToDelete?.source === "linked";
      const promptMsg = isLinked
        ? `Unlink cloud plan "${projToDelete?.name || projectId}" from this browser? (Your original cloud file on Google Drive/GitHub remains untouched).`
        : `Delete local plan "${projToDelete?.name || projectId}" from browser storage?`;
      const confirmed = window.confirm(promptMsg);
      if (!confirmed) return;
      if (activeProjectId === projectId) {
        flushPendingSaveRef.current?.();
      }
      const updated = customProjects.filter((p) => p.id !== projectId);
      setCustomProjects(updated);
      saveCustomProjects(updated);
      if (activeProjectId === projectId) {
        handleSelectProject("default");
      }
      showToast(isLinked ? "Unlinked cloud plan." : "Deleted local plan.");
    },
    [customProjects, activeProjectId, handleSelectProject, showToast]
  );

  const handleImportJsonFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
            try {
              localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
            } catch {}
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
    },
    [customProjects, setJsonText, setParsedData, setPeople, setTeams, setValidationResult, showToast]
  );

  const handleResetActiveProject = useCallback(() => {
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
  }, [
    activeProjectId,
    customProjects,
    setJsonText,
    setParsedData,
    setPeople,
    setTeams,
    setValidationResult,
    setCurrentScale,
    setShowCriticalPath,
    setShowBaselines
  ]);

  const saveProjectData = useCallback((projectId: string, data: JanttData) => {
    setCustomProjects((prev) => {
      const updated = prev.map((p) =>
        p.id === projectId
          ? { ...p, data, updatedAt: new Date().toISOString() }
          : p
      );
      saveCustomProjects(updated);
      return updated;
    });
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
    handleDeleteProject,
    handleImportJsonFile,
    handleResetActiveProject,
    saveProjectData
  };
}
