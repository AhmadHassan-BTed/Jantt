import { useState, useCallback, useRef } from "react";
import type { JanttData } from "@jantt/core";

export function useUndoRedo(
  parsedData: JanttData | null,
  onApplyData: (data: JanttData) => void,
  showToast?: (msg: string, isErr?: boolean) => void
) {
  const [past, setPast] = useState<JanttData[]>([]);
  const [future, setFuture] = useState<JanttData[]>([]);
  const isInternalUpdateRef = useRef(false);

  // Push previous state before a mutation
  const pushSnapshot = useCallback((data: JanttData) => {
    if (isInternalUpdateRef.current) return;
    setPast((prev) => {
      // Don't push duplicates
      const last = prev[prev.length - 1];
      if (last && JSON.stringify(last.tasks) === JSON.stringify(data.tasks)) {
        return prev;
      }
      return [...prev.slice(-30), JSON.parse(JSON.stringify(data))];
    });
    setFuture([]);
  }, []);

  // Undo: roll back to previous state
  const undo = useCallback(() => {
    if (past.length === 0 || !parsedData) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    isInternalUpdateRef.current = true;
    setFuture((prev) => [JSON.parse(JSON.stringify(parsedData)), ...prev.slice(0, 30)]);
    setPast(newPast);
    onApplyData(previous);
    setTimeout(() => {
      isInternalUpdateRef.current = false;
    }, 50);

    showToast?.("Undid last change (Ctrl+Z)");
  }, [past, parsedData, onApplyData, showToast]);

  // Redo: re-apply undone state
  const redo = useCallback(() => {
    if (future.length === 0 || !parsedData) return;
    const next = future[0];
    const newFuture = future.slice(1);

    isInternalUpdateRef.current = true;
    setPast((prev) => [...prev.slice(-30), JSON.parse(JSON.stringify(parsedData))]);
    setFuture(newFuture);
    onApplyData(next);
    setTimeout(() => {
      isInternalUpdateRef.current = false;
    }, 50);

    showToast?.("Redid change (Ctrl+Y)");
  }, [future, parsedData, onApplyData, showToast]);

  const clearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pastCount: past.length,
    futureCount: future.length,
    pushSnapshot,
    undo,
    redo,
    clearHistory
  };
}

