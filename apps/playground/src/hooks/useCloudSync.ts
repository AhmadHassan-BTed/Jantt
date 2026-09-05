import { useState, useEffect, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  type RemoteFetchResult,
  fetchRemotePlan,
  reconcilePlans,
  validate
} from "@jantt/core";
import type { SavedProject } from "../types";
import { STORAGE_KEYS } from "../constants";
import { saveCustomProjects } from "../utils";

interface UseCloudSyncOptions {
  customProjects: SavedProject[];
  setCustomProjects: React.Dispatch<React.SetStateAction<SavedProject[]>>;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  handleSelectProject: (id: string) => void;
  parsedData: JanttData | null;
  setJsonText: (text: string) => void;
  setParsedData: (data: JanttData | null) => void;
  setPeople: (people: Person[]) => void;
  setTeams: (teams: Team[]) => void;
  setValidationResult: (res: ValidationResult) => void;
  showToast: (msg: string, isErr?: boolean) => void;
  captureSnapshot?: (projectId: string, data: JanttData, reason: string) => void;
}

export function useCloudSync({
  customProjects,
  setCustomProjects,
  activeProjectId,
  setActiveProjectId,
  handleSelectProject,
  parsedData,
  setJsonText,
  setParsedData,
  setPeople,
  setTeams,
  setValidationResult,
  showToast,
  captureSnapshot
}: UseCloudSyncOptions) {
  const [showLinkCloudModal, setShowLinkCloudModal] = useState(false);
  const [linkCloudUrl, setLinkCloudUrl] = useState("");
  const [linkCloudName, setLinkCloudName] = useState("");
  const [isFetchingCloudPreview, setIsFetchingCloudPreview] = useState(false);
  const [cloudPreviewResult, setCloudPreviewResult] = useState<RemoteFetchResult | null>(null);
  const [cloudPreviewError, setCloudPreviewError] = useState<string | null>(null);
  const [isSyncingProject, setIsSyncingProject] = useState(false);

  const handleOpenLinkCloudModal = useCallback(() => {
    setLinkCloudUrl("");
    setLinkCloudName("");
    setCloudPreviewResult(null);
    setCloudPreviewError(null);
    setIsFetchingCloudPreview(false);
    setShowLinkCloudModal(true);
  }, []);

  const handleFetchCloudPreview = useCallback(async () => {
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
  }, [linkCloudUrl, linkCloudName]);

  const handleSaveLinkedCloudPlan = useCallback(async () => {
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
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
    } catch {}
    setJsonText(JSON.stringify(result.data, null, 2));
    setParsedData(result.data);
    setPeople(result.data.people || []);
    setTeams(result.data.teams || []);
    setValidationResult(validate(result.data));
    setShowLinkCloudModal(false);
    showToast(`Linked "${newProj.name}" from ${result.info.label}!`);
  }, [
    cloudPreviewResult,
    linkCloudUrl,
    linkCloudName,
    customProjects,
    setCustomProjects,
    setActiveProjectId,
    setJsonText,
    setParsedData,
    setPeople,
    setTeams,
    setValidationResult,
    showToast
  ]);

  const handleSyncActiveProject = useCallback(async () => {
    const activeProj = customProjects.find((p) => p.id === activeProjectId);
    if (!activeProj || activeProj.source !== "linked" || !activeProj.sourceUrl) return;

    setIsSyncingProject(true);
    try {
      const res = await fetchRemotePlan(activeProj.sourceUrl);
      const remoteData = res.data;
      const currentLocalData = parsedData || activeProj.data;

      // Capture pre-sync safety snapshot
      captureSnapshot?.(activeProj.id, currentLocalData, "Pre-Manual Sync Snapshot");

      // Smart 3-way reconciliation
      const reconcileResult = reconcilePlans(activeProj.data, currentLocalData, remoteData);
      const finalData = reconcileResult.mergedData;
      const now = new Date().toISOString();

      const updated = customProjects.map((p) =>
        p.id === activeProjectId
          ? {
              ...p,
              data: finalData,
              updatedAt: now,
              lastSyncedAt: now,
              syncError: undefined
            }
          : p
      );
      setCustomProjects(updated);
      saveCustomProjects(updated);
      setParsedData(finalData);
      setPeople(finalData.people || []);
      setTeams(finalData.teams || []);
      setJsonText(JSON.stringify(finalData, null, 2));
      setValidationResult(validate(finalData));

      if (reconcileResult.hasConflicts) {
        showToast(
          `Synced & merged from ${res.info.label} (${reconcileResult.conflicts.length} conflict resolved, snapshot saved).`
        );
      } else {
        const mergedTotal =
          reconcileResult.summary.tasksUpdated +
          reconcileResult.summary.tasksAdded +
          reconcileResult.summary.fieldsMerged;
        if (mergedTotal > 0) {
          showToast(`Synced & cleanly merged ${mergedTotal} update(s) from ${res.info.label}!`);
        } else {
          showToast(`Synced latest version from ${res.info.label}!`);
        }
      }
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
  }, [
    customProjects,
    activeProjectId,
    parsedData,
    captureSnapshot,
    setCustomProjects,
    setParsedData,
    setPeople,
    setTeams,
    setJsonText,
    setValidationResult,
    showToast
  ]);

  // Auto-fetch remote cloud plan if ?url= is passed in URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const remoteUrl = params.get("url");
    if (!remoteUrl) return;

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
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
        } catch {}
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

  return {
    showLinkCloudModal,
    setShowLinkCloudModal,
    linkCloudUrl,
    setLinkCloudUrl,
    linkCloudName,
    setLinkCloudName,
    isFetchingCloudPreview,
    cloudPreviewResult,
    cloudPreviewError,
    setCloudPreviewError,
    isSyncingProject,
    handleOpenLinkCloudModal,
    handleFetchCloudPreview,
    handleSaveLinkedCloudPlan,
    handleSyncActiveProject
  };
}
