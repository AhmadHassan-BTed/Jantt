import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { JanttData } from "@jantt/core";
import type { AutoSaveInterval } from "../types";
import { STORAGE_KEYS } from "../constants";

interface UseAutoSaveOptions {
  jsonText: string;
  parsedData: JanttData | null;
  activeProjectId: string;
  onSaveProject?: (projectId: string, data: JanttData) => void;
  showToast: (msg: string, isErr?: boolean) => void;
}

export function useAutoSave({
  jsonText,
  parsedData,
  activeProjectId,
  onSaveProject,
  showToast
}: UseAutoSaveOptions) {
  const [autoSaveInterval, setAutoSaveInterval] = useState<AutoSaveInterval>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTOSAVE_INTERVAL);
      if (saved && ["5s", "10s", "30s", "60s", "immediate", "off"].includes(saved)) {
        return saved as AutoSaveInterval;
      }
    } catch {}
    return "5s";
  });

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "pending">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date>(() => new Date());
  const [showAutoSaveModal, setShowAutoSaveModal] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const isFirstMountRef = useRef(true);

  const jsonTextRef = useRef(jsonText);
  jsonTextRef.current = jsonText;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;
  const onSaveProjectRef = useRef(onSaveProject);
  onSaveProjectRef.current = onSaveProject;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTOSAVE_INTERVAL, autoSaveInterval);
    } catch {}
  }, [autoSaveInterval]);

  const executeSave = useCallback(() => {
    setSaveStatus("saving");
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, jsonTextRef.current);
      if (activeProjectIdRef.current !== "default" && parsedDataRef.current) {
        onSaveProjectRef.current?.(activeProjectIdRef.current, parsedDataRef.current);
      }
    } catch (err) {
      console.error("Auto-save error:", err);
    }
    setLastSavedAt(new Date());
    setSaveStatus("saved");
  }, []);

  const flushSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    executeSave();
  }, [executeSave]);

  const handleManualSaveNow = useCallback(() => {
    flushSave();
    showToast("Plan state successfully saved to browser storage!");
  }, [flushSave, showToast]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, jsonTextRef.current);
        if (activeProjectIdRef.current !== "default" && parsedDataRef.current) {
          const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_PROJECTS);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const updated = list.map((p: any) =>
                p.id === activeProjectIdRef.current
                  ? { ...p, data: parsedDataRef.current, updatedAt: new Date().toISOString() }
                  : p
              );
              localStorage.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, JSON.stringify(updated));
            }
          }
        }
      } catch {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (autoSaveInterval === "immediate") {
      executeSave();
      return;
    }

    if (autoSaveInterval === "off") {
      setSaveStatus("pending");
      return;
    }

    setSaveStatus("pending");
    const delayMs =
      autoSaveInterval === "5s"
        ? 5000
        : autoSaveInterval === "10s"
        ? 10000
        : autoSaveInterval === "30s"
        ? 30000
        : 60000;

    autoSaveTimerRef.current = window.setTimeout(() => {
      executeSave();
    }, delayMs);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [jsonText, activeProjectId, parsedData, autoSaveInterval, executeSave]);

  const [saveTicker, setSaveTicker] = useState(0);
  useEffect(() => {
    const ticker = setInterval(() => setSaveTicker((t) => t + 1), 1000);
    return () => clearInterval(ticker);
  }, []);

  const autoSaveLabel = useMemo(() => {
    if (saveStatus === "saving") return "Saving...";
    if (saveStatus === "pending") return "Unsaved";
    const diffSec = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
    if (diffSec < 5) return "Saved just now";
    if (diffSec < 60) return `Saved ${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Saved ${diffMin}m ago`;
    return `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [saveStatus, lastSavedAt, saveTicker]);

  const storageSizeKb = useMemo(() => {
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
