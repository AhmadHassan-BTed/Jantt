import { useState, useEffect, useRef, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  fetchRemotePlan,
  calculatePlanHash,
  reconcilePlans,
  validate
} from "@jantt/core";
import type { SavedProject } from "../types";
import { saveCustomProjects } from "../utils";

export type SyncStatus = "idle" | "in-sync" | "syncing" | "merged" | "conflict";

interface UseDynamicSyncOptions {
  activeProjectId: string;
  customProjects: SavedProject[];
  setCustomProjects: React.Dispatch<React.SetStateAction<SavedProject[]>>;
  parsedData: JanttData | null;
  setParsedData: (data: JanttData | null) => void;
  setJsonText: (text: string) => void;
  setPeople: (people: Person[]) => void;
  setTeams: (teams: Team[]) => void;
  setValidationResult: (res: ValidationResult) => void;
  showToast: (msg: string, isErr?: boolean) => void;
  captureSnapshot: (projectId: string, data: JanttData, reason: string) => void;
}

export function useDynamicSync({
  activeProjectId,
  customProjects,
  setCustomProjects,
  parsedData,
  setParsedData,
  setJsonText,
  setPeople,
  setTeams,
  setValidationResult,
  showToast,
  captureSnapshot
}: UseDynamicSyncOptions) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("in-sync");
  const [lastSyncTime, setLastSyncTime] = useState<Date>(() => new Date());
  const [syncMessage, setSyncMessage] = useState<string>("In sync");

  // Keep refs for asynchronous interval callbacks
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const customProjectsRef = useRef(customProjects);
  customProjectsRef.current = customProjects;
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  // Track base data per project when first loaded/synced
  const baseDataMapRef = useRef<Map<string, JanttData>>(new Map());
  const lastKnownRemoteHashMapRef = useRef<Map<string, string>>(new Map());

  // BroadcastChannel for instant cross-tab coherence
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("jantt_cross_tab_sync");
    channelRef.current = ch;

    ch.onmessage = (evt) => {
      const msg = evt.data;
      if (!msg || msg.type !== "PLAN_MUTATED") return;
      if (msg.projectId !== activeProjectIdRef.current) return;

      const currentHash = calculatePlanHash(parsedDataRef.current);
      if (msg.contentHash && msg.contentHash === currentHash) return;

      // Update in-memory state cleanly from sister tab
      if (msg.data) {
        setParsedData(msg.data);
        setPeople(msg.data.people || []);
        setTeams(msg.data.teams || []);
        setJsonText(JSON.stringify(msg.data, null, 2));
        setValidationResult(validate(msg.data));
        setSyncStatus("in-sync");
        setLastSyncTime(new Date());
        setSyncMessage("Synced from another tab");
      }
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [setParsedData, setPeople, setTeams, setJsonText, setValidationResult]);

  // Broadcast local changes to other tabs
  const broadcastLocalChange = useCallback((projectId: string, data: JanttData) => {
    if (!channelRef.current) return;
    try {
      channelRef.current.postMessage({
        type: "PLAN_MUTATED",
        projectId,
        contentHash: calculatePlanHash(data),
        timestamp: new Date().toISOString(),
        data
      });
    } catch {}
  }, []);

  // Sync execution logic
  const checkAndSyncProject = useCallback(
    async (isBackground = true) => {
      const currentProj = customProjectsRef.current.find((p) => p.id === activeProjectIdRef.current);
      if (!currentProj || currentProj.source !== "linked" || !currentProj.sourceUrl) {
        setSyncStatus("in-sync");
        setSyncMessage("Local plan saved");
        return;
      }

      const prevHash = lastKnownRemoteHashMapRef.current.get(currentProj.id) || "";
      if (!isBackground) {
        setSyncStatus("syncing");
        setSyncMessage("Checking remote plan...");
      }

      try {
        const res = await fetchRemotePlan(currentProj.sourceUrl, { previousHash: prevHash });

        // If remote file is unchanged according to content hash, nothing to merge
        if (res.notModified) {
          setSyncStatus("in-sync");
          setLastSyncTime(new Date());
          setSyncMessage("In sync");
          return;
        }

        const remoteData = res.data;
        const remoteHash = res.contentHash;
        lastKnownRemoteHashMapRef.current.set(currentProj.id, remoteHash);

        const currentLocalData = parsedDataRef.current || currentProj.data;
        const localHash = calculatePlanHash(currentLocalData);
        const baseData = baseDataMapRef.current.get(currentProj.id) || currentProj.data;
        const baseHash = calculatePlanHash(baseData);

        // Case 1: Local made no changes since base -> adopt remote directly!
        if (localHash === baseHash) {
          captureSnapshot(currentProj.id, currentLocalData, "Before Collaborator Sync");
          baseDataMapRef.current.set(currentProj.id, remoteData);

          const now = new Date().toISOString();
          const updatedProjects = customProjectsRef.current.map((p) =>
            p.id === currentProj.id
              ? {
                  ...p,
                  data: remoteData,
                  updatedAt: now,
                  lastSyncedAt: now,
                  syncError: undefined
                }
              : p
          );

          setCustomProjects(updatedProjects);
          saveCustomProjects(updatedProjects);
          setParsedData(remoteData);
          setPeople(remoteData.people || []);
          setTeams(remoteData.teams || []);
          setJsonText(JSON.stringify(remoteData, null, 2));
          setValidationResult(validate(remoteData));

          setSyncStatus("in-sync");
          setLastSyncTime(new Date());
          setSyncMessage("Updated from collaborator");
          showToast(`Synced latest updates from ${res.info.label}!`);
          return;
        }

        // Case 2: Both local and remote have changes -> 3-Way Task Reconciliation!
        setSyncStatus("syncing");
        setSyncMessage("Reconciling collaborator updates...");
        captureSnapshot(currentProj.id, currentLocalData, "Pre-Merge Local Snapshot");

        const reconcileResult = reconcilePlans(baseData, currentLocalData, remoteData);
        const mergedData = reconcileResult.mergedData;
        baseDataMapRef.current.set(currentProj.id, remoteData);

        const now = new Date().toISOString();
        const updatedProjects = customProjectsRef.current.map((p) =>
          p.id === currentProj.id
            ? {
                ...p,
                data: mergedData,
                updatedAt: now,
                lastSyncedAt: now,
                syncError: undefined
              }
            : p
        );

        setCustomProjects(updatedProjects);
        saveCustomProjects(updatedProjects);
        setParsedData(mergedData);
        setPeople(mergedData.people || []);
        setTeams(mergedData.teams || []);
        setJsonText(JSON.stringify(mergedData, null, 2));
        setValidationResult(validate(mergedData));

        if (reconcileResult.hasConflicts) {
          setSyncStatus("conflict");
          setLastSyncTime(new Date());
          setSyncMessage(`${reconcileResult.conflicts.length} conflict(s) resolved`);
          showToast(
            `Merged updates from collaborator (${reconcileResult.conflicts.length} conflict resolved, snapshot saved).`
          );
        } else {
          setSyncStatus("merged");
          setLastSyncTime(new Date());
          const mergedCount =
            reconcileResult.summary.tasksUpdated +
            reconcileResult.summary.tasksAdded +
            reconcileResult.summary.fieldsMerged;
          setSyncMessage(`Merged ${mergedCount} update(s)`);
          showToast(`Cleanly merged updates from collaborator!`);
        }
      } catch (err: any) {
        if (!isBackground) {
          showToast(`Sync failed: ${err.message}`, true);
        }
      }
    },
    [
      setCustomProjects,
      setParsedData,
      setPeople,
      setTeams,
      setJsonText,
      setValidationResult,
      showToast,
      captureSnapshot
    ]
  );

  // Dynamic Polling Loop:
  // - 6s interval when tab is active and visible
  // - 30s interval when tab is hidden
  // - Instant check when tab regains focus
  useEffect(() => {
    let timer: number | null = null;

    const scheduleNext = () => {
      if (timer) clearTimeout(timer);
      const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const delayMs = isHidden ? 30000 : 7000;

      timer = window.setTimeout(async () => {
        await checkAndSyncProject(true);
        scheduleNext();
      }, delayMs);
    };

    scheduleNext();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        checkAndSyncProject(true);
        scheduleNext();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [checkAndSyncProject]);

  return {
    syncStatus,
    lastSyncTime,
    syncMessage,
    checkAndSyncProject,
    broadcastLocalChange
  };
}
