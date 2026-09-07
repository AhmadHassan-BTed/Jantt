import { useState, useCallback, useEffect } from "react";
import type { JanttData, SnapshotEntry } from "@jantt/core";
import { calculatePlanHash } from "@jantt/core";

const MAX_SNAPSHOTS_PER_PROJECT = 30;

function getStorageKey(projectId: string): string {
  return `jantt_snapshots_${projectId}`;
}

const memoryFallback = new Map<string, SnapshotEntry[]>();

function safeSaveSnapshots(key: string, updated: SnapshotEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err: any) {
    // QuotaExceededError or security block
    if (err?.name === "QuotaExceededError" || err?.code === 22 || err?.code === 1014) {
      try {
        // Step 1: Prune older snapshots in the current project by half
        const prunedCurrent = updated.slice(0, Math.max(5, Math.floor(updated.length / 2)));
        localStorage.setItem(key, JSON.stringify(prunedCurrent));
        return;
      } catch {
        // Step 2: Prune other project snapshot keys
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith("jantt_snapshots_") && k !== key) {
              localStorage.removeItem(k);
              break;
            }
          }
          localStorage.setItem(key, JSON.stringify(updated.slice(0, 10)));
          return;
        } catch {
          // Store in memory fallback if all localStorage attempts fail
          memoryFallback.set(key, updated);
        }
      }
    } else {
      memoryFallback.set(key, updated);
    }
  }
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
      const key = getStorageKey(activeProjectId);
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSnapshots(parsed);
          return;
        }
      }
      if (memoryFallback.has(key)) {
        setSnapshots(memoryFallback.get(key) || []);
        return;
      }
    } catch {
      const key = getStorageKey(activeProjectId);
      if (memoryFallback.has(key)) {
        setSnapshots(memoryFallback.get(key) || []);
        return;
      }
    }
    setSnapshots([]);
  }, [activeProjectId]);

  const captureSnapshot = useCallback(
    (projectId: string, data: JanttData, reason: string): SnapshotEntry | null => {
      if (!projectId || !data) return null;
      try {
        const key = getStorageKey(projectId);
        let existing: SnapshotEntry[] = [];
        try {
          const raw = localStorage.getItem(key);
          if (raw) existing = JSON.parse(raw);
        } catch {
          existing = memoryFallback.get(key) || [];
        }

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
        safeSaveSnapshots(key, updated);

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
