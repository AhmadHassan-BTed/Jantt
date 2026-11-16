import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { JanttData } from "@jantt/core";
import type { AutoSaveInterval } from "../types";
import { STORAGE_KEYS } from "../constants";
import { storageService } from "../services/storage";

interface UseAutoSaveOptions {
  /** @deprecated Not used any more: saves persist the parsed plan, never half-typed JSON. */
  jsonText?: string;
  parsedData: JanttData | null;
  activeProjectId: string;
  /** Persists a plan; returning false reports a failed (non-durable) write. */
  onSaveProject?: (projectId: string, data: JanttData) => boolean | void;
  showToast: (msg: string, isErr?: boolean) => void;
  captureSnapshot?: (projectId: string, data: JanttData, reason: string) => void;
  broadcastChange?: (projectId: string, data: JanttData) => void;
}

const AUTOSAVE_INTERVALS: AutoSaveInterval[] = ["5s", "10s", "30s", "60s", "immediate", "off"];

const INTERVAL_MS: Record<Exclude<AutoSaveInterval, "off">, number> = {
  immediate: 400,
  "5s": 5000,
  "10s": 10000,
  "30s": 30000,
  "60s": 60000
};

export const SAVE_FAILED_MESSAGE =
  "Changes could not be saved: browser storage is full or blocked. Export your plan (JSON) to keep a copy, then free space by deleting old plans.";

export function useAutoSave({
  parsedData,
  activeProjectId,
  onSaveProject,
  showToast,
  captureSnapshot,
  broadcastChange
}: UseAutoSaveOptions) {
  const [autoSaveInterval, setAutoSaveInterval] = useState<AutoSaveInterval>(() => {
    const saved = storageService.getItem<string>(STORAGE_KEYS.AUTOSAVE_INTERVAL);
    return saved && AUTOSAVE_INTERVALS.includes(saved as AutoSaveInterval) ? (saved as AutoSaveInterval) : "5s";
  });

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "pending">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date>(() => new Date());
  const [showAutoSaveModal, setShowAutoSaveModal] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const isDirtyRef = useRef(false);
  const pendingSinceRef = useRef<number | null>(null);
  const failureAnnouncedRef = useRef(false);

  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;
  const onSaveProjectRef = useRef(onSaveProject);
  onSaveProjectRef.current = onSaveProject;
  const captureSnapshotRef = useRef(captureSnapshot);
  captureSnapshotRef.current = captureSnapshot;
  const broadcastChangeRef = useRef(broadcastChange);
  broadcastChangeRef.current = broadcastChange;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  /** Plan state seen by the last change check: lets a switch save the outgoing plan's edits. */
  const lastSeenRef = useRef({ projectId: activeProjectId, data: parsedData });

  useEffect(() => {
    storageService.setItem(STORAGE_KEYS.AUTOSAVE_INTERVAL, autoSaveInterval);
  }, [autoSaveInterval]);

  const clearTimer = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  /** Writes one plan. Returns false when the write did not reach durable storage. */
  const persist = useCallback((projectId: string, data: JanttData | null, withSideEffects: boolean): boolean => {
    if (!data) return true;
    if (projectId === "default") {
      return storageService.setItem(STORAGE_KEYS.DEFAULT_PLAN, data);
    }
    const ok = onSaveProjectRef.current?.(projectId, data) !== false;
    if (ok && withSideEffects) {
      try {
        captureSnapshotRef.current?.(projectId, data, "Auto-Save");
      } catch (err) {
        console.error("Snapshot capture failed:", err);
      }
      try {
        broadcastChangeRef.current?.(projectId, data);
      } catch {}
    }
    return ok;
  }, []);

  const reportResult = useCallback((ok: boolean, announceFailure: boolean) => {
    if (ok) {
      isDirtyRef.current = false;
      pendingSinceRef.current = null;
      failureAnnouncedRef.current = false;
      setSaveError(null);
      setLastSavedAt(new Date());
      setSaveStatus("saved");
      return;
    }
    // Never claim "saved" after a failed write: the edits stay pending and are retried
    setSaveError(SAVE_FAILED_MESSAGE);
    setSaveStatus("pending");
    if (announceFailure || !failureAnnouncedRef.current) {
      failureAnnouncedRef.current = true;
      showToastRef.current(SAVE_FAILED_MESSAGE, true);
    }
  }, []);

  const runSave = useCallback(
    (announceFailure: boolean): boolean => {
      clearTimer();
      let ok = false;
      try {
        ok = persist(activeProjectIdRef.current, parsedDataRef.current, true);
      } catch (err) {
        console.error("Auto-save error:", err);
      }
      reportResult(ok, announceFailure);
      return ok;
    },
    [clearTimer, persist, reportResult]
  );

  /** Saves the active plan now, whether or not it changed. */
  const executeSave = useCallback(() => runSave(false), [runSave]);

  /** Saves the active plan only if it has unsaved edits (plan switch, tab close). */
  const flushSave = useCallback(() => {
    if (isDirtyRef.current || autoSaveTimerRef.current !== null) runSave(false);
  }, [runSave]);

  const handleManualSaveNow = useCallback(() => {
    if (runSave(true)) showToast("Plan saved to browser storage.");
  }, [runSave, showToast]);

  // Persist pending edits when the page goes away. Mobile browsers often skip beforeunload,
  // so pagehide and visibilitychange are handled too.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleHide = () => flushSave();
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushSave();
      // The edits could not reach durable storage (full or blocked): ask before they are lost
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleHide);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [flushSave]);

  useEffect(() => {
    const lastSeen = lastSeenRef.current;
    lastSeenRef.current = { projectId: activeProjectId, data: parsedData };

    if (lastSeen.projectId !== activeProjectId) {
      // The active plan was switched (by any code path): pending edits belong to the
      // outgoing plan, and the freshly loaded plan starts out saved.
      if (isDirtyRef.current) {
        let ok = false;
        try {
          ok = persist(lastSeen.projectId, lastSeen.data, false);
        } catch (err) {
          console.error("Saving the previous plan failed:", err);
        }
        if (!ok) showToastRef.current(SAVE_FAILED_MESSAGE, true);
      }
      clearTimer();
      isDirtyRef.current = false;
      pendingSinceRef.current = null;
      failureAnnouncedRef.current = false;
      setSaveError(null);
      setSaveStatus("saved");
      return;
    }

    if (lastSeen.data !== parsedData) {
      isDirtyRef.current = true;
      if (pendingSinceRef.current === null) pendingSinceRef.current = Date.now();
    }
    if (!isDirtyRef.current) return;

    setSaveStatus("pending");
    clearTimer();
    if (autoSaveInterval === "off") return;

    // Debounce, but continuous editing can never postpone a save beyond twice the interval
    const interval = INTERVAL_MS[autoSaveInterval];
    const deadline = (pendingSinceRef.current ?? Date.now()) + interval * 2;
    const delay = Math.max(0, Math.min(interval, deadline - Date.now()));
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      runSave(false);
    }, delay);
  }, [activeProjectId, parsedData, autoSaveInterval, persist, clearTimer, runSave]);

  // Refresh the relative "Saved ... ago" label only when its text can change, and stop
  // after an hour (the label then shows a clock time), so an idle app does not re-render.
  const [, setLabelTick] = useState(0);
  useEffect(() => {
    if (saveStatus !== "saved" || saveError) return;
    let timer: number | undefined;
    const schedule = () => {
      const age = Date.now() - lastSavedAt.getTime();
      const delay = age < 60000 ? 10000 - (age % 10000) : age < 3600000 ? 60000 - (age % 60000) : null;
      if (delay === null) return;
      timer = window.setTimeout(() => {
        setLabelTick((t) => t + 1);
        schedule();
      }, delay + 50);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [saveStatus, saveError, lastSavedAt]);

  let autoSaveLabel: string;
  if (saveError) {
    autoSaveLabel = "Save failed";
  } else if (saveStatus === "saving") {
    autoSaveLabel = "Saving...";
  } else if (saveStatus === "pending") {
    autoSaveLabel = "Unsaved";
  } else {
    const diffSec = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
    if (diffSec < 10) autoSaveLabel = "Saved just now";
    else if (diffSec < 60) autoSaveLabel = `Saved ${Math.floor(diffSec / 10) * 10}s ago`;
    else if (diffSec < 3600) autoSaveLabel = `Saved ${Math.floor(diffSec / 60)}m ago`;
    else autoSaveLabel = `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  // Scanning all of localStorage is costly; only do it while the settings dialog is open
  const storageSizeKb = useMemo(() => {
    if (!showAutoSaveModal) return "0.0";
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("jantt_")) {
          total += (localStorage.getItem(k)?.length || 0) * 2;
        }
      }
      return (total / 1024).toFixed(1);
    } catch {
      return "0.0";
    }
  }, [lastSavedAt, showAutoSaveModal]);

  return {
    autoSaveInterval,
    setAutoSaveInterval,
    saveStatus,
    /** Message of the last failed save, or null. */
    saveError,
    lastSavedAt,
    autoSaveLabel,
    storageSizeKb,
    showAutoSaveModal,
    setShowAutoSaveModal,
    handleManualSaveNow,
    executeSave,
    flushSave
  };
}
