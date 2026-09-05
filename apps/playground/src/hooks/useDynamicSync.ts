import { useState, useEffect, useRef, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  fetchRemotePlan,
  parseCloudUrl,
  calculatePlanHash,
  reconcilePlans,
  validate
} from "@jantt/core";
import type { SavedProject } from "../types";
import { saveCustomProjects } from "../utils";
import { STORAGE_KEYS } from "../constants";

export type SyncStatus = "idle" | "in-sync" | "syncing" | "merged" | "conflict" | "draft";

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

function getCollaboratorId(): string {
  if (typeof window === "undefined") return "peer-serverless";
  try {
    let id = localStorage.getItem("jantt_peer_id");
    if (!id) {
      id = `peer-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("jantt_peer_id", id);
    }
    return id;
  } catch {
    return "peer-serverless";
  }
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
  const [isQuotaShieldActive, setIsQuotaShieldActive] = useState<boolean>(false);
  const [cloudProvider, setCloudProvider] = useState<string | undefined>(undefined);

  const clientIdRef = useRef<string>(getCollaboratorId());

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

  // Dynamically compute sync status: detect local un-uploadable edits on read-only cloud feeds
  useEffect(() => {
    const currentProj = customProjects.find((p) => p.id === activeProjectId);
    if (!currentProj || currentProj.source !== "linked") {
      setSyncStatus("in-sync");
      setSyncMessage("Local plan saved");
      setCloudProvider(undefined);
      return;
    }

    if (currentProj.sourceUrl) {
      try {
        const info = parseCloudUrl(currentProj.sourceUrl);
        setCloudProvider(info.provider);
      } catch {}
    }

    if (!baseDataMapRef.current.has(currentProj.id)) {
      baseDataMapRef.current.set(currentProj.id, currentProj.data);
    }

    const currentLocalData = parsedData || currentProj.data;
    const localHash = calculatePlanHash(currentLocalData);
    const baseData = baseDataMapRef.current.get(currentProj.id) || currentProj.data;
    const baseHash = calculatePlanHash(baseData);

    if (localHash !== baseHash) {
      setSyncStatus("draft");
      setSyncMessage("Local edits (Source is read-only)");
    } else {
      setSyncStatus("in-sync");
      setSyncMessage("Up to date with Cloud");
    }
  }, [parsedData, activeProjectId, customProjects]);

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
        const formatted = JSON.stringify(msg.data, null, 2);
        setJsonText(formatted);
        setValidationResult(validate(msg.data));
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, formatted);
        } catch {}
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
        setSyncMessage("Pulling cloud updates...");
      }

      try {
        const res = await fetchRemotePlan(currentProj.sourceUrl, { previousHash: prevHash });

        if (res.quotaShieldActive) {
          setIsQuotaShieldActive(true);
        } else {
          setIsQuotaShieldActive(false);
        }
        if (res.info?.provider) {
          setCloudProvider(res.info.provider);
        }

        const currentLocalData = parsedDataRef.current || currentProj.data;
        const localHash = calculatePlanHash(currentLocalData);
        const baseData = baseDataMapRef.current.get(currentProj.id) || currentProj.data;
        const baseHash = calculatePlanHash(baseData);
        const hasLocalEdits = localHash !== baseHash;

        // If remote file is unchanged according to content hash, nothing to merge
        if (res.notModified) {
          if (hasLocalEdits) {
            setSyncStatus("draft");
            setLastSyncTime(new Date());
            setSyncMessage("Local edits (Cloud source is read-only)");
          } else {
            setSyncStatus("in-sync");
            setLastSyncTime(new Date());
            setSyncMessage(res.quotaShieldActive ? "Up to date (Shield active)" : "Up to date with Cloud");
          }
          return;
        }

        const remoteData = res.data;
        const remoteHash = res.contentHash;
        lastKnownRemoteHashMapRef.current.set(currentProj.id, remoteHash);

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
          const formatted = JSON.stringify(remoteData, null, 2);
          setJsonText(formatted);
          setValidationResult(validate(remoteData));
          try {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, formatted);
          } catch {}

          setSyncStatus("in-sync");
          setLastSyncTime(new Date());
          setSyncMessage(res.quotaShieldActive ? "Up to date (Shield active)" : "Up to date with Cloud");
          showToast(`Pulled latest updates from ${res.info.label}! (Cloud source is read-only)`);
          return;
        }

        // Case 2: Both local and remote have changes -> N-Party CRDT Task Reconciliation!
        setSyncStatus("syncing");
        setSyncMessage("Reconciling collaborator updates...");
        captureSnapshot(currentProj.id, currentLocalData, "Pre-Merge Local Snapshot");

        const reconcileResult = reconcilePlans(baseData, currentLocalData, remoteData, {
          clientId: clientIdRef.current
        });
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
        const formatted = JSON.stringify(mergedData, null, 2);
        setJsonText(formatted);
        setValidationResult(validate(mergedData));
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, formatted);
        } catch {}

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
        if (err?.message?.includes("quota") || err?.message?.includes("429")) {
          setIsQuotaShieldActive(true);
          setSyncMessage("Quota Shield active (pacing requests)");
        }
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

  // Dynamic Adaptive Jittered Polling Loop:
  // - 6s base ± 25% random jitter when tab is active (4.5s to 7.5s) to avoid thundering herd
  // - 14s base when Quota Shield is active (pacing Google Drive)
  // - 30s base when tab is hidden in background
  // - Instant check when tab regains focus
  useEffect(() => {
    let timer: number | null = null;

    const scheduleNext = () => {
      if (timer) clearTimeout(timer);
      const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const baseMs = isHidden ? 30000 : (isQuotaShieldActive ? 14000 : 6000);
      const jitter = (Math.random() - 0.5) * (baseMs * 0.5);
      const delayMs = Math.max(3000, Math.round(baseMs + jitter));

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
  }, [checkAndSyncProject, isQuotaShieldActive]);

  return {
    syncStatus,
    lastSyncTime,
    syncMessage,
    checkAndSyncProject,
    broadcastLocalChange,
    isQuotaShieldActive,
    cloudProvider,
    peerId: clientIdRef.current
  };
}
