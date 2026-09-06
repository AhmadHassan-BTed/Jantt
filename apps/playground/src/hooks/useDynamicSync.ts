import { useState, useEffect, useRef, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  calculatePlanHash,
  validate
} from "@jantt/core";
import type { SavedProject } from "../types";
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

/**
 * Local Cross-Tab Dynamic Coherence Engine
 * Synchronizes edits across multiple browser tabs instantaneously via BroadcastChannel.
 * (All cloud collaboration and multi-user synchronization is handled by Firebase Cloud Rooms).
 */
export function useDynamicSync({
  activeProjectId,
  setParsedData,
  setJsonText,
  setPeople,
  setTeams,
  setValidationResult,
}: UseDynamicSyncOptions) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("in-sync");
  const [lastSyncTime, setLastSyncTime] = useState<Date>(() => new Date());
  const [syncMessage, setSyncMessage] = useState<string>("Local plan saved");

  const clientIdRef = useRef<string>(getCollaboratorId());
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

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

  // Broadcast local changes to other open tabs
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

  const checkAndSyncProject = useCallback(async () => {
    setSyncStatus("in-sync");
    setSyncMessage("Local plan saved");
  }, []);

  return {
    syncStatus,
    lastSyncTime,
    syncMessage,
    checkAndSyncProject,
    broadcastLocalChange,
    isQuotaShieldActive: false,
    cloudProvider: undefined,
    peerId: clientIdRef.current
  };
}
