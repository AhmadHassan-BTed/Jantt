import { useState, useCallback, useEffect, useRef } from "react";
import type { JanttData, SnapshotEntry } from "@jantt/core";
import { storageService } from "../services/storage";
import { generateId, hashString, snapshotStorageKey } from "../utils";
import { tGlobal } from "../i18n";

const MAX_SNAPSHOTS_PER_PROJECT = 30;
/** Automatic snapshots closer together than this are folded into the newest one. */
const AUTO_SNAPSHOT_MIN_SPACING_MS = 2 * 60 * 1000;
const AUTO_SAVE_REASON = "Auto-Save";

/** Commit bookkeeping that changes on every save without changing the plan's content. */
const VOLATILE_META_KEYS = new Set(["revision", "updatedAt", "contentHash", "sync"]);

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) sorted[k] = (val as Record<string, unknown>)[k];
      return sorted;
    }
    return val;
  });
}

/**
 * Hash of the full plan content (every field and tombstone, stable key order), ignoring only
 * per-commit bookkeeping. Unlike the sync hash, it changes for every field a user can edit
 * (cost, priority, baseline, documents...), so each real change gets its own version.
 */
export function hashPlanContent(data: JanttData): string {
  const meta: Record<string, unknown> = {};
  Object.entries(data.meta || {}).forEach(([k, v]) => {
    if (!VOLATILE_META_KEYS.has(k)) meta[k] = v;
  });
  return hashString(stableStringify({ ...data, meta }));
}

function readSnapshots(key: string): SnapshotEntry[] {
  const stored = storageService.getItem<unknown>(key);
  return Array.isArray(stored) ? (stored as SnapshotEntry[]) : [];
}

/**
 * Writes a project's history. On quota pressure only this project's oldest entries are
 * dropped; other plans' history is never evicted. Returns false when nothing could be
 * written durably (the list is then kept in memory for this session).
 */
function safeSaveSnapshots(key: string, updated: SnapshotEntry[]): boolean {
  if (storageService.setItem(key, updated)) return true;
  for (const keep of [Math.max(5, Math.floor(updated.length / 2)), 3, 1]) {
    if (keep >= updated.length) continue;
    if (storageService.setItem(key, updated.slice(0, keep))) {
      console.warn(tGlobal("hooks.snapshotVault.trimmed", { count: keep }));
      return true;
    }
  }
  // Every attempt failed: keep the full list (not the last trimmed attempt) for this session
  storageService.setItem(key, updated);
  console.warn(tGlobal("hooks.snapshotVault.sessionOnly"));
  return false;
}

export function useSnapshotVault(activeProjectId: string) {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  // Load snapshots for active project
  useEffect(() => {
    setSnapshots(activeProjectId ? readSnapshots(snapshotStorageKey(activeProjectId)) : []);
  }, [activeProjectId]);

  const captureSnapshot = useCallback(
    (projectId: string, data: JanttData, reason: string): SnapshotEntry | null => {
      if (!projectId || !data) return null;
      try {
        const key = snapshotStorageKey(projectId);
        const existing = readSnapshots(key);
        const contentHash = hashPlanContent(data);

        // Don't duplicate if the most recent snapshot already has the exact same content
        if (existing.length > 0 && existing[0].contentHash === contentHash) {
          return existing[0];
        }

        const now = Date.now();
        const newEntry: SnapshotEntry = {
          id: generateId("snap"),
          projectId,
          timestamp: new Date(now).toISOString(),
          reason,
          data: JSON.parse(JSON.stringify(data)),
          taskCount: Array.isArray(data.tasks) ? data.tasks.length : 0,
          contentHash
        };

        // Thin automatic snapshots by time: while less than the spacing window has passed since
        // the checkpoint below the newest auto snapshot, replace the newest one instead of adding
        // another. Once the window has passed (or after an idle gap) the newest one is kept as a
        // checkpoint, so the state right before every new edit burst survives.
        const [head, previous] = existing;
        const foldIntoHead =
          reason === AUTO_SAVE_REASON &&
          head?.reason === AUTO_SAVE_REASON &&
          previous !== undefined &&
          now - new Date(previous.timestamp).getTime() < AUTO_SNAPSHOT_MIN_SPACING_MS;

        const updated = (foldIntoHead ? [newEntry, ...existing.slice(1)] : [newEntry, ...existing]).slice(
          0,
          MAX_SNAPSHOTS_PER_PROJECT
        );
        safeSaveSnapshots(key, updated);

        if (projectId === activeProjectIdRef.current) {
          setSnapshots(updated);
        }

        return newEntry;
      } catch (err) {
        console.error("Failed to capture snapshot in vault:", err);
        return null;
      }
    },
    []
  );

  const clearSnapshots = useCallback((projectId: string) => {
    storageService.removeItem(snapshotStorageKey(projectId));
    if (projectId === activeProjectIdRef.current) {
      setSnapshots([]);
    }
  }, []);

  return {
    snapshots,
    showVersionHistoryModal,
    setShowVersionHistoryModal,
    captureSnapshot,
    clearSnapshots
  };
}
