import { useEffect, useRef, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  calculatePlanHash,
  validate
} from "@jantt/core";
import type { SavedProject } from "../types";
import { getTabInstanceId } from "../room-storage";

const CHANNEL_NAME = "jantt_cross_tab_sync";

interface PlanMutatedMessage {
  type: "PLAN_MUTATED";
  senderId: string;
  projectId: string;
  timestamp: string;
  data: JanttData;
}

interface UseDynamicSyncOptions {
  activeProjectId: string;
  /** The open plan; incoming copies that already match it are ignored. */
  parsedData?: JanttData | null;
  setParsedData: (data: JanttData | null) => void;
  setJsonText: (text: string) => void;
  setPeople: (people: Person[]) => void;
  setTeams: (teams: Team[]) => void;
  setValidationResult: (res: ValidationResult) => void;
  /** @deprecated Unused; accepted for call-site compatibility. */
  customProjects?: SavedProject[];
  /** @deprecated Unused; accepted for call-site compatibility. */
  setCustomProjects?: React.Dispatch<React.SetStateAction<SavedProject[]>>;
  /** @deprecated Unused; accepted for call-site compatibility. */
  showToast?: (msg: string, isErr?: boolean) => void;
  /** @deprecated Unused; accepted for call-site compatibility. */
  captureSnapshot?: (projectId: string, data: JanttData, reason: string) => void;
}

function isPlanMutatedMessage(value: unknown): value is PlanMutatedMessage {
  const msg = value as Partial<PlanMutatedMessage> | null;
  return Boolean(
    msg &&
      msg.type === "PLAN_MUTATED" &&
      typeof msg.senderId === "string" &&
      typeof msg.projectId === "string" &&
      msg.data &&
      typeof msg.data === "object" &&
      Array.isArray(msg.data.tasks)
  );
}

/**
 * Cross-tab coherence: when this browser has the same plan open in several tabs, edits saved in
 * one tab are applied in the others through a BroadcastChannel. Every tab has its own sender id,
 * copies that already match the open plan are ignored, and a plan applied from another tab is
 * not broadcast again when this tab autosaves it, so a change travels exactly once.
 * (Collaboration between users goes through Firebase cloud rooms, see useRoomSync.)
 */
export function useDynamicSync({
  activeProjectId,
  parsedData,
  setParsedData,
  setJsonText,
  setPeople,
  setTeams,
  setValidationResult
}: UseDynamicSyncOptions) {
  const senderId = getTabInstanceId();
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const parsedDataRef = useRef(parsedData ?? null);
  parsedDataRef.current = parsedData ?? null;
  const settersRef = useRef({ setParsedData, setJsonText, setPeople, setTeams, setValidationResult });
  settersRef.current = { setParsedData, setJsonText, setPeople, setTeams, setValidationResult };

  const channelRef = useRef<BroadcastChannel | null>(null);
  /** The plan last applied from another tab: every tab already has it. */
  const lastAppliedRef = useRef<JanttData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (evt) => {
      const msg: unknown = evt.data;
      if (!isPlanMutatedMessage(msg)) return;
      if (msg.senderId === senderId || msg.projectId !== activeProjectIdRef.current) return;

      const current = parsedDataRef.current;
      if (current && calculatePlanHash(current) === calculatePlanHash(msg.data)) return;

      // The sister tab holds the same plan this tab would: mirror it, with its validation result.
      const s = settersRef.current;
      parsedDataRef.current = msg.data;
      lastAppliedRef.current = msg.data;
      s.setParsedData(msg.data);
      s.setPeople(Array.isArray(msg.data.people) ? msg.data.people : []);
      s.setTeams(Array.isArray(msg.data.teams) ? msg.data.teams : []);
      s.setJsonText(JSON.stringify(msg.data, null, 2));
      s.setValidationResult(validate(msg.data));
    };

    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [senderId]);

  /** Sends a saved plan to this browser's other tabs. */
  const broadcastLocalChange = useCallback(
    (projectId: string, data: JanttData) => {
      const channel = channelRef.current;
      // Autosave of a plan that came from another tab: re-sending it would only echo back.
      if (!channel || data === lastAppliedRef.current) return;
      const message: PlanMutatedMessage = {
        type: "PLAN_MUTATED",
        senderId,
        projectId,
        timestamp: new Date().toISOString(),
        data
      };
      try {
        channel.postMessage(message);
      } catch {
        // intentionally ignored: a closed channel or an uncloneable value only skips this
        // best-effort hint; every tab still reads the saved plan from storage on its next load.
      }
    },
    [senderId]
  );

  return {
    broadcastLocalChange,
    /** Identifies this tab in cross-tab messages. */
    peerId: senderId
  };
}
