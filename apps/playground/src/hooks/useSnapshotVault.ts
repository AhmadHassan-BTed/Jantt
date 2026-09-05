import { useState, useCallback, useEffect } from "react";
import type { JanttData, SnapshotEntry } from "@jantt/core";
import { calculatePlanHash } from "@jantt/core";

const MAX_SNAPSHOTS_PER_PROJECT = 30;

function getStorageKey(projectId: string): string {
  return `jantt_snapshots_${projectId}`;
}

export function useSnapshotVault(activeProjectId: string) {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);

  // Load snapshots for active project
  useEffect(() => {
    if (!activeProjectId) {
      setSnapshots([]);
      return;
    }
    try {
      const raw = localStorage.getItem(getStorageKey(activeProjectId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSnapshots(parsed);
          return;
        }
      }
    } catch {}
    setSnapshots([]);
  }, [activeProjectId]);

  const captureSnapshot = useCallback(
    (projectId: string, data: JanttData, reason: string): SnapshotEntry | null => {
      if (!projectId || !data) return null;
      try {
        const key = getStorageKey(projectId);
        const raw = localStorage.getItem(key);
        const existing: SnapshotEntry[] = raw ? JSON.parse(raw) : [];

        const taskCount = Array.isArray(data.tasks) ? data.tasks.length : 0;
        const contentHash = calculatePlanHash(data);

        // Don't duplicate if the most recent snapshot already has the exact same content hash
        if (existing.length > 0 && existing[0].contentHash === contentHash) {
          return existing[0];
        }

        const newEntry: SnapshotEntry = {
          id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          projectId,
          timestamp: new Date().toISOString(),
          reason,
          data: JSON.parse(JSON.stringify(data)),
          taskCount,
          contentHash
        };

        const updated = [newEntry, ...existing].slice(0, MAX_SNAPSHOTS_PER_PROJECT);
        localStorage.setItem(key, JSON.stringify(updated));

        if (projectId === activeProjectId) {
          setSnapshots(updated);
        }

        return newEntry;
      } catch (err) {
        console.error("Failed to capture snapshot in vault:", err);
        return null;
      }
    },
    [activeProjectId]
  );

  const clearSnapshots = useCallback(
    (projectId: string) => {
      try {
        localStorage.removeItem(getStorageKey(projectId));
        if (projectId === activeProjectId) {
          setSnapshots([]);
        }
      } catch {}
    },
    [activeProjectId]
  );

  return {
    snapshots,
    showVersionHistoryModal,
    setShowVersionHistoryModal,
    captureSnapshot,
    clearSnapshots
  };
}
