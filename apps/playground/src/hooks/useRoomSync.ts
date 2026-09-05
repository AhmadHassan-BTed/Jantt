import { useState, useEffect, useRef, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  createCloudRoom,
  fetchCloudRoom,
  saveCloudRoom,
  subscribeToCloudRoom,
  reconcilePlans,
  calculatePlanHash,
  validate
} from "@jantt/core";
import type { SavedProject, ActiveView } from "../types";
import { saveCustomProjects } from "../utils";
import { STORAGE_KEYS } from "../constants";
import {
  getStoredRoomSecret,
  storeRoomSecret
} from "../room-storage";

export type RoomSyncStatus = "idle" | "in-sync" | "syncing" | "merged" | "conflict" | "error";

interface UseRoomSyncOptions {
  customProjects: SavedProject[];
  setCustomProjects: React.Dispatch<React.SetStateAction<SavedProject[]>>;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  parsedData: JanttData | null;
  setParsedData: (data: JanttData | null) => void;
  setJsonText: (text: string) => void;
  setPeople: (people: Person[]) => void;
  setTeams: (teams: Team[]) => void;
  setValidationResult: (res: ValidationResult) => void;
  showToast: (msg: string, isErr?: boolean) => void;
  captureSnapshot: (projectId: string, data: JanttData, reason: string) => void;
  activeView: ActiveView;
  selectedThemeId: string;
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

export function useRoomSync({
  customProjects,
  setCustomProjects,
  activeProjectId,
  setActiveProjectId,
  parsedData,
  setParsedData,
  setJsonText,
  setPeople,
  setTeams,
  setValidationResult,
  showToast,
  captureSnapshot,
  activeView,
  selectedThemeId
}: UseRoomSyncOptions) {
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus>("in-sync");
  const [syncMessage, setSyncMessage] = useState<string>("In sync");
  const [lastSyncTime, setLastSyncTime] = useState<Date>(() => new Date());

  const clientIdRef = useRef<string>(getCollaboratorId());
  const activeProj = customProjects.find((p) => p.id === activeProjectId);

  // Active room metadata
  const activeRoomId = activeProj?.source === "room" ? activeProj.roomId : null;
  const activeSecretKey =
    activeProj?.source === "room"
      ? activeProj.secretKey || (activeRoomId ? getStoredRoomSecret(activeRoomId) : null)
      : null;
  const activeRoomRole: "collaborator" | "viewer" | "none" =
    activeProj?.source === "room"
      ? activeSecretKey
        ? "collaborator"
        : "viewer"
      : "none";

  // Base data tracking for 3-way CRDT merge
  const baseDataMapRef = useRef<Map<string, JanttData>>(new Map());
  const etagMapRef = useRef<Map<string, string | null>>(new Map());
  const revisionMapRef = useRef<Map<string, number>>(new Map());

  // Save current project refs for intervals
  const customProjectsRef = useRef(customProjects);
  customProjectsRef.current = customProjects;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  // Auto-update base data map when switching projects
  useEffect(() => {
    if (activeProj?.source === "room" && activeProj.roomId) {
      if (!baseDataMapRef.current.has(activeProj.roomId)) {
        baseDataMapRef.current.set(activeProj.roomId, activeProj.data);
      }
      if (activeProj.etag && !etagMapRef.current.has(activeProj.roomId)) {
        etagMapRef.current.set(activeProj.roomId, activeProj.etag);
      }
      if (activeProj.revision && !revisionMapRef.current.has(activeProj.roomId)) {
        revisionMapRef.current.set(activeProj.roomId, activeProj.revision);
      }
    }
  }, [activeProj]);

  // Keep address bar synced with active room ID & secret key
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeProj?.source === "room" && activeProj.roomId) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("room", activeProj.roomId);
        url.searchParams.set("view", activeView);
        url.searchParams.set("theme", selectedThemeId);
        url.searchParams.delete("url");
        url.searchParams.delete("data");
        url.searchParams.delete("name");

        if (activeSecretKey) {
          url.hash = `key=${encodeURIComponent(activeSecretKey)}`;
        } else {
          url.hash = "";
        }
        window.history.replaceState(null, "", url.toString());
      } catch {}
    }
  }, [activeProj?.source, activeProj?.roomId, activeSecretKey, activeView, selectedThemeId]);

  // 1. Action: Create a brand new Cloud Room
  const handleCreateRoom = useCallback(
    async (options: { title: string; roomId?: string }) => {
      if (!parsedData) {
        showToast("No plan data to create room with", true);
        return;
      }
      setIsProcessing(true);
      try {
        const res = await createCloudRoom(parsedData, options);

        // Store secret key securely
        storeRoomSecret(res.roomId, res.secretKey);
        baseDataMapRef.current.set(res.roomId, parsedData);
        etagMapRef.current.set(res.roomId, res.etag);
        revisionMapRef.current.set(res.roomId, res.revision);

        const newProj: SavedProject = {
          id: `room-${res.roomId}`,
          name: res.title,
          updatedAt: new Date().toISOString(),
          data: parsedData,
          source: "room",
          roomId: res.roomId,
          secretKey: res.secretKey,
          role: "collaborator",
          etag: res.etag,
          revision: res.revision,
          lastSyncedAt: new Date().toISOString()
        };

        const updated = [newProj, ...customProjectsRef.current.filter((p) => p.id !== newProj.id)];
        setCustomProjects(updated);
        saveCustomProjects(updated);
        setActiveProjectId(newProj.id);
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
        } catch {}

        setSyncStatus("in-sync");
        setSyncMessage("Live Room Active");
        setLastSyncTime(new Date());
        showToast(`Cloud Room "${res.title}" is live!`);
      } catch (err: any) {
        showToast(`Failed to create room: ${err.message}`, true);
      } finally {
        setIsProcessing(false);
      }
    },
    [parsedData, setActiveProjectId, setCustomProjects, showToast]
  );

  // 2. Action: Join an existing Cloud Room
  const handleJoinRoom = useCallback(
    async (roomId: string, secretKey?: string) => {
      setIsProcessing(true);
      try {
        const res = await fetchCloudRoom(roomId);
        const resolvedSecret = secretKey || getStoredRoomSecret(res.roomId) || undefined;
        if (resolvedSecret) {
          storeRoomSecret(res.roomId, resolvedSecret);
        }

        const role: "collaborator" | "viewer" = resolvedSecret ? "collaborator" : "viewer";

        baseDataMapRef.current.set(res.roomId, res.data);
        etagMapRef.current.set(res.roomId, res.etag);
        revisionMapRef.current.set(res.roomId, res.revision);

        const newProj: SavedProject = {
          id: `room-${res.roomId}`,
          name: res.title,
          updatedAt: res.updatedAt,
          data: res.data,
          source: "room",
          roomId: res.roomId,
          secretKey: resolvedSecret,
          role,
          etag: res.etag,
          revision: res.revision,
          lastSyncedAt: new Date().toISOString()
        };

        const updated = [newProj, ...customProjectsRef.current.filter((p) => p.id !== newProj.id)];
        setCustomProjects(updated);
        saveCustomProjects(updated);
        setActiveProjectId(newProj.id);
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
        } catch {}

        setParsedData(res.data);
        setJsonText(JSON.stringify(res.data, null, 2));
        setPeople(res.data.people || []);
        setTeams(res.data.teams || []);
        setValidationResult(validate(res.data));

        setSyncStatus("in-sync");
        setSyncMessage(role === "collaborator" ? "Collaborator (Live Sync)" : "Viewer (Read-Only)");
        setLastSyncTime(new Date());
        showToast(`Connected to room "${res.title}" as ${role}!`);
      } catch (err: any) {
        showToast(`Failed to join room: ${err.message}`, true);
      } finally {
        setIsProcessing(false);
      }
    },
    [
      setCustomProjects,
      setActiveProjectId,
      setParsedData,
      setJsonText,
      setPeople,
      setTeams,
      setValidationResult,
      showToast
    ]
  );

  // 3. Action: Unlock Collaborator mode with Secret Key
  const handleUnlockCollaborator = useCallback(
    async (secretKey: string) => {
      if (!activeRoomId) return;
      setIsProcessing(true);
      try {
        storeRoomSecret(activeRoomId, secretKey);

        const updated = customProjectsRef.current.map((p) =>
          p.roomId === activeRoomId
            ? { ...p, secretKey, role: "collaborator" as const }
            : p
        );
        setCustomProjects(updated);
        saveCustomProjects(updated);

        setSyncStatus("in-sync");
        setSyncMessage("Collaborator (Live Sync)");
        showToast("Collaborator mode unlocked! Real-time auto-save is enabled.");
      } catch (err: any) {
        showToast(`Failed to unlock: ${err.message}`, true);
      } finally {
        setIsProcessing(false);
      }
    },
    [activeRoomId, setCustomProjects, showToast]
  );

  // 4. Multi-User Concurrency Engine: Auto-Save with Optimistic Concurrency Control (OCC)
  const isSavingRef = useRef(false);
  const pendingSaveTimerRef = useRef<number | null>(null);

  const triggerCloudSave = useCallback(
    async (currentData: JanttData) => {
      if (
        !activeRoomId ||
        activeRoomRole !== "collaborator" ||
        !activeSecretKey ||
        isSavingRef.current
      ) {
        return;
      }

      isSavingRef.current = true;
      setSyncStatus("syncing");
      setSyncMessage("Saving to cloud room...");

      const currentEtag = etagMapRef.current.get(activeRoomId) || null;
      const currentRev = revisionMapRef.current.get(activeRoomId) || 1;

      try {
        const result = await saveCloudRoom({
          roomId: activeRoomId,
          secretKey: activeSecretKey,
          data: currentData,
          baseRevision: currentRev,
          etag: currentEtag
        });

        if (result.success) {
          etagMapRef.current.set(activeRoomId, result.etag);
          revisionMapRef.current.set(activeRoomId, result.revision);
          baseDataMapRef.current.set(activeRoomId, currentData);

          const now = new Date().toISOString();
          const updated = customProjectsRef.current.map((p) =>
            p.roomId === activeRoomId
              ? {
                  ...p,
                  data: currentData,
                  updatedAt: now,
                  lastSyncedAt: now,
                  etag: result.etag,
                  revision: result.revision,
                  syncError: undefined
                }
              : p
          );
          setCustomProjects(updated);
          saveCustomProjects(updated);

          setSyncStatus("in-sync");
          setSyncMessage("All edits saved to room");
          setLastSyncTime(new Date());
        } else if (result.conflict && result.latestRemoteData) {
          // 412 Concurrency Conflict! Another of the 100+ collaborators saved concurrently!
          setSyncStatus("conflict");
          setSyncMessage("Merging concurrent collaborator edits...");

          captureSnapshot(activeProjectIdRef.current, currentData, "Pre-Merge Local State");
          const baseData = baseDataMapRef.current.get(activeRoomId) || currentData;

          // 3-Way CRDT Merge: Zero data loss
          const reconcileResult = reconcilePlans(baseData, currentData, result.latestRemoteData, {
            clientId: clientIdRef.current
          });
          const merged = reconcileResult.mergedData;

          setParsedData(merged);
          setJsonText(JSON.stringify(merged, null, 2));
          setPeople(merged.people || []);
          setTeams(merged.teams || []);
          setValidationResult(validate(merged));

          // Save the merged version back to cloud with new ETag!
          const retrySave = await saveCloudRoom({
            roomId: activeRoomId,
            secretKey: activeSecretKey,
            data: merged,
            baseRevision: result.revision,
            etag: result.etag
          });

          if (retrySave.success) {
            etagMapRef.current.set(activeRoomId, retrySave.etag);
            revisionMapRef.current.set(activeRoomId, retrySave.revision);
            baseDataMapRef.current.set(activeRoomId, merged);

            const now = new Date().toISOString();
            const updated = customProjectsRef.current.map((p) =>
              p.roomId === activeRoomId
                ? {
                    ...p,
                    data: merged,
                    updatedAt: now,
                    lastSyncedAt: now,
                    etag: retrySave.etag,
                    revision: retrySave.revision
                  }
                : p
            );
            setCustomProjects(updated);
            saveCustomProjects(updated);

            setSyncStatus("merged");
            setSyncMessage("Merged changes cleanly with collaborator");
            setLastSyncTime(new Date());
            showToast("Cleanly merged simultaneous edits from collaborator! 0 lost work.");
          }
        } else {
          setSyncStatus("error");
          setSyncMessage(result.error || "Save error");
        }
      } catch (err: any) {
        setSyncStatus("error");
        setSyncMessage(`Save failed: ${err.message}`);
      } finally {
        isSavingRef.current = false;
      }
    },
    [
      activeRoomId,
      activeRoomRole,
      activeSecretKey,
      captureSnapshot,
      setCustomProjects,
      setParsedData,
      setJsonText,
      setPeople,
      setTeams,
      setValidationResult,
      showToast
    ]
  );

  // Debounced trigger on parsedData mutation
  useEffect(() => {
    if (!activeRoomId || activeRoomRole !== "collaborator" || !parsedData) return;

    const baseData = baseDataMapRef.current.get(activeRoomId);
    if (baseData && calculatePlanHash(baseData) === calculatePlanHash(parsedData)) {
      return; // No local mutations
    }

    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
    }

    pendingSaveTimerRef.current = window.setTimeout(() => {
      triggerCloudSave(parsedData);
    }, 1200);

    return () => {
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
      }
    };
  }, [parsedData, activeRoomId, activeRoomRole, triggerCloudSave]);

  // 5. Live Inbound Server-Sent Events (SSE) Stream
  // Instant <100ms updates when any other collaborator saves
  useEffect(() => {
    if (!activeRoomId || typeof window === "undefined") return;

    const unsubscribe = subscribeToCloudRoom(
      activeRoomId,
      (incomingRoom) => {
        if (!incomingRoom?.data) return;

        const currentLocal = parsedDataRef.current;
        if (!currentLocal) return;

        const incomingHash = incomingRoom.contentHash || calculatePlanHash(incomingRoom.data);
        const localHash = calculatePlanHash(currentLocal);

        if (incomingHash === localHash) return; // Already matching

        const baseData = baseDataMapRef.current.get(activeRoomId) || currentLocal;
        const baseHash = calculatePlanHash(baseData);

        // Case A: Local made no edits -> Adopt incoming state directly!
        if (localHash === baseHash) {
          baseDataMapRef.current.set(activeRoomId, incomingRoom.data);
          revisionMapRef.current.set(activeRoomId, incomingRoom.revision);

          setParsedData(incomingRoom.data);
          setJsonText(JSON.stringify(incomingRoom.data, null, 2));
          setPeople(incomingRoom.data.people || []);
          setTeams(incomingRoom.data.teams || []);
          setValidationResult(validate(incomingRoom.data));

          setSyncStatus("in-sync");
          setSyncMessage("Live update from teammate");
          setLastSyncTime(new Date());
          showToast("Received live updates from teammate!");
          return;
        }

        // Case B: Local also has unsaved changes -> Run 3-Way Reconciler!
        const reconcileResult = reconcilePlans(baseData, currentLocal, incomingRoom.data, {
          clientId: clientIdRef.current
        });
        const merged = reconcileResult.mergedData;
        baseDataMapRef.current.set(activeRoomId, incomingRoom.data);
        revisionMapRef.current.set(activeRoomId, incomingRoom.revision);

        setParsedData(merged);
        setJsonText(JSON.stringify(merged, null, 2));
        setPeople(merged.people || []);
        setTeams(merged.teams || []);
        setValidationResult(validate(merged));

        setSyncStatus("merged");
        setSyncMessage("Merged updates from teammate");
        setLastSyncTime(new Date());
        showToast("Merged live updates from collaborator!");
      },
      () => {
        // SSE network hiccups automatically reconnect
      }
    );

    return () => {
      unsubscribe();
    };
  }, [
    activeRoomId,
    setParsedData,
    setJsonText,
    setPeople,
    setTeams,
    setValidationResult,
    showToast
  ]);

  // 6. URL Mount Check: Auto-connect to Room when URL contains ?room= or ?cloud=
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get("room") || urlParams.get("cloud");
    if (!roomParam) return;

    const hash = window.location.hash.replace(/^#/, "");
    const hp = new URLSearchParams(hash);
    const secretFromHash = hp.get("key") || hp.get("edit") || undefined;

    // Check if already active
    const activeCurrent = customProjectsRef.current.find((p) => p.id === activeProjectIdRef.current);
    if (activeCurrent?.source === "room" && activeCurrent.roomId === roomParam) {
      if (secretFromHash && !activeCurrent.secretKey) {
        handleUnlockCollaborator(secretFromHash);
      }
      return;
    }

    // Join room from URL
    handleJoinRoom(roomParam, secretFromHash);
  }, [handleJoinRoom, handleUnlockCollaborator]);

  return {
    showRoomModal,
    setShowRoomModal,
    isProcessing,
    syncStatus,
    syncMessage,
    lastSyncTime,
    activeRoomId,
    activeRoomRole,
    activeSecretKey,
    handleCreateRoom,
    handleJoinRoom,
    handleUnlockCollaborator
  };
}
