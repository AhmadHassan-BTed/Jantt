import { useState, useRef, useCallback, useEffect, type SetStateAction } from "react";
import {
  type JanttData,
  type Task,
  type Person,
  type Team,
  type ValidationResult,
  validate,
  downloadCsv,
  syncTaskProgressAndStatus,
  calculatePlanHash,
  compareCompositeTimestamps
} from "@jantt/core";
import { commandBus } from "../services/bus";
import { getPeerId } from "../utils";

/** Typing in the JSON editor is parsed/validated once the user pauses this long. */
export const EDITOR_PARSE_DEBOUNCE_MS = 250;

/** Identity and CRDT bookkeeping keys of a task; every other changed key gets a field stamp. */
const UNSTAMPED_TASK_KEYS = new Set(["id", "fieldTimestamps", "updatedAt", "updatedBy", "deletedAt"]);

interface UseEditorStateOptions {
  initialJson: string;
  initialParsed: JanttData | null;
  onPeopleChange?: (people: Person[]) => void;
  onTeamsChange?: (teams: Team[]) => void;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function hasOwn(obj: object | undefined, key: string): boolean {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

/** Field-wise newest of two timestamp maps, so stale copies can never move a stamp backwards. */
function mergeFieldTimestamps(
  older: Record<string, string> | undefined,
  newer: Record<string, string> | undefined
): Record<string, string> {
  const merged: Record<string, string> = { ...(newer || {}) };
  if (older) {
    for (const [field, ts] of Object.entries(older)) {
      if (compareCompositeTimestamps(ts, merged[field]) > 0) merged[field] = ts;
    }
  }
  return merged;
}

export interface StampOptions {
  peerId: string;
  nowIso: string;
  /** Re-derive status <-> progress for tasks whose status or progress changed (chart edits). */
  syncStatusProgress: boolean;
}

/**
 * Stamps every locally changed task field with a fresh composite timestamp so the edit wins
 * last-writer-wins merges with collaborators. Tasks without changes keep their identity.
 */
export function stampLocalChanges(
  prev: JanttData | null,
  next: JanttData,
  { peerId, nowIso, syncStatusProgress }: StampOptions
): JanttData {
  const compositeTs = `${nowIso}#${peerId}`;
  const prevTaskMap = new Map<string, Task>((prev?.tasks || []).map((t) => [t.id, t]));

  const tasks = (next.tasks || []).map((t) => {
    const before = prevTaskMap.get(t.id);
    // Untouched task (same object): nothing to stamp or sync. Keeps large commits cheap.
    if (before === t) return t;
    let current: Task = t;

    if (syncStatusProgress) {
      const statusChanged = !before || before.status !== t.status;
      const progressChanged = !before || before.progress !== t.progress;
      let patch: Partial<Task> | null = null;
      if (!before || (statusChanged && progressChanged)) patch = { status: t.status, progress: t.progress };
      else if (statusChanged) patch = { status: t.status };
      else if (progressChanged) patch = { progress: t.progress };
      if (patch) {
        const synced = syncTaskProgressAndStatus(patch, t);
        const status = "status" in synced ? synced.status : t.status;
        const progress = "progress" in synced ? synced.progress : t.progress;
        if (status !== t.status || progress !== t.progress) {
          current = { ...t, status, progress };
        }
      }
    }

    const fieldTimestamps = mergeFieldTimestamps(before?.fieldTimestamps, current.fieldTimestamps);
    let changed = !before;
    const fields = before ? new Set([...Object.keys(before), ...Object.keys(current)]) : Object.keys(current);
    for (const field of fields) {
      if (UNSTAMPED_TASK_KEYS.has(field)) continue;
      const value = current[field];
      if (before ? !sameValue(value, before[field]) : value !== undefined) {
        fieldTimestamps[field] = compositeTs;
        changed = true;
      }
    }

    if (changed) {
      return { ...current, fieldTimestamps, updatedAt: nowIso, updatedBy: peerId };
    }
    if (!sameValue(fieldTimestamps, current.fieldTimestamps || {})) {
      return { ...current, fieldTimestamps };
    }
    return current;
  });

  return { ...next, tasks };
}

/** Bumps the plan revision and refreshes the content hash / sync metadata for a local commit. */
function withCommitMeta(data: JanttData, peerId: string, nowIso: string): JanttData {
  const nextRevision = (data.meta?.revision || 0) + 1;
  const interim: JanttData = {
    ...data,
    meta: { ...data.meta, revision: nextRevision, updatedAt: nowIso }
  };
  const contentHash = calculatePlanHash(interim);
  return {
    ...interim,
    meta: {
      ...interim.meta,
      contentHash,
      sync: {
        ...(interim.meta?.sync || {}),
        revision: nextRevision,
        contentHash,
        updatedAt: nowIso,
        clientId: peerId
      }
    }
  };
}

/**
 * Resolves the task list of a commit against the current plan.
 * A commit that silently omits two or more live tasks is treated as a partial update (for
 * example a filtered view): omitted tasks are kept and new tasks are added. Tasks the commit
 * explicitly deletes (a new entry in `meta.tombstones`) are always removed. Soft-deleted
 * (`_deleted`) tasks a view left out are always kept.
 */
export function mergeCommittedTasks(
  master: Task[],
  updated: Task[],
  masterTombstones?: Record<string, { deletedAt: string }>,
  updatedTombstones?: Record<string, { deletedAt: string }>
): Task[] {
  const isExplicitlyDeleted = (id: string) =>
    hasOwn(updatedTombstones, id) &&
    (!hasOwn(masterTombstones, id) || updatedTombstones![id]?.deletedAt !== masterTombstones![id]?.deletedAt);

  const updatedMap = new Map(updated.map((t) => [t.id, t]));
  let silentlyMissing = 0;
  const droppedSoftDeleted: Task[] = [];
  for (const t of master) {
    if (updatedMap.has(t.id) || isExplicitlyDeleted(t.id)) continue;
    if (t._deleted) droppedSoftDeleted.push(t);
    else silentlyMissing++;
  }
  if (silentlyMissing <= 1) {
    // Views usually omit soft-deleted tasks; keep them so the deletion keeps propagating
    return droppedSoftDeleted.length > 0 ? [...updated, ...droppedSoftDeleted] : updated;
  }

  const masterIds = new Set<string>();
  const merged: Task[] = [];
  for (const t of master) {
    masterIds.add(t.id);
    const next = updatedMap.get(t.id);
    if (next) merged.push(next);
    else if (!isExplicitlyDeleted(t.id)) merged.push(t);
  }
  for (const t of updated) {
    if (!masterIds.has(t.id)) merged.push(t);
  }
  return merged;
}

export function useEditorState({
  initialJson,
  initialParsed,
  onPeopleChange,
  onTeamsChange
}: UseEditorStateOptions) {
  const [jsonText, setJsonTextState] = useState(initialJson);
  const [parsedData, setParsedDataState] = useState<JanttData | null>(initialParsed);
  const [validationResult, setValidationResult] = useState<ValidationResult>(() =>
    validate(initialParsed || {})
  );
  const [copiedJson, setCopiedJson] = useState(false);
  const [isLiveSyncing, setIsLiveSyncing] = useState(false);
  const syncTimerRef = useRef<number | null>(null);
  const parseTimerRef = useRef<number | null>(null);

  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  const onPeopleChangeRef = useRef(onPeopleChange);
  onPeopleChangeRef.current = onPeopleChange;
  const onTeamsChangeRef = useRef(onTeamsChange);
  onTeamsChangeRef.current = onTeamsChange;

  const cancelPendingParse = useCallback(() => {
    if (parseTimerRef.current !== null) {
      window.clearTimeout(parseTimerRef.current);
      parseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelPendingParse();
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, [cancelPendingParse]);

  const notifyRegistries = useCallback((data: JanttData) => {
    if (Array.isArray(data.people)) onPeopleChangeRef.current?.(data.people);
    if (Array.isArray(data.teams)) onTeamsChangeRef.current?.(data.teams);
  }, []);

  // External loads (project switch, remote merge, restore) supersede any half-typed edit
  const setParsedData = useCallback(
    (value: SetStateAction<JanttData | null>) => {
      cancelPendingParse();
      if (typeof value !== "function") parsedDataRef.current = value;
      setParsedDataState(value);
    },
    [cancelPendingParse]
  );

  const setJsonText = useCallback(
    (value: SetStateAction<string>) => {
      cancelPendingParse();
      setJsonTextState(value);
    },
    [cancelPendingParse]
  );

  /** Parses editor text; a syntax or schema error keeps the last valid plan on screen. */
  const applyEditorText = useCallback(
    (text: string) => {
      let parsed: JanttData;
      try {
        parsed = JSON.parse(text);
      } catch (err: any) {
        setValidationResult({
          valid: false,
          errors: [
            {
              path: "$",
              code: "SCHEMA_MISMATCH",
              message: `JSON Syntax Error: ${err.message}`,
              suggestion: "Fix syntax error (missing comma, unclosed bracket, or quote)."
            }
          ]
        });
        return;
      }
      const val = validate(parsed);
      setValidationResult(val);
      if (!val.valid) return;

      // Stamp edited fields so JSON edits survive merges with collaborators
      const data = stampLocalChanges(parsedDataRef.current, parsed, {
        peerId: getPeerId(),
        nowIso: new Date().toISOString(),
        syncStatusProgress: false
      });
      parsedDataRef.current = data;
      setParsedDataState(data);
      notifyRegistries(data);
    },
    [notifyRegistries]
  );

  const handleEditorChange = useCallback(
    (text: string) => {
      setJsonTextState(text);
      cancelPendingParse();
      parseTimerRef.current = window.setTimeout(() => {
        parseTimerRef.current = null;
        applyEditorText(text);
      }, EDITOR_PARSE_DEBOUNCE_MS);
    },
    [applyEditorText, cancelPendingParse]
  );

  const handleChartCommit = useCallback((updated: JanttData) => {
    // A chart edit supersedes a half-typed JSON edit
    cancelPendingParse();
    const currentMaster = parsedDataRef.current;
    let finalData: JanttData = updated;
    if (currentMaster) {
      const tasks = mergeCommittedTasks(
        currentMaster.tasks || [],
        updated.tasks || [],
        currentMaster.meta?.tombstones,
        updated.meta?.tombstones
      );
      finalData = {
        ...currentMaster,
        ...updated,
        tasks,
        categories: updated.categories !== undefined ? updated.categories : currentMaster.categories,
        notes: updated.notes !== undefined ? updated.notes : currentMaster.notes,
        people: updated.people !== undefined ? updated.people : currentMaster.people,
        teams: updated.teams !== undefined ? updated.teams : currentMaster.teams,
        milestones: updated.milestones !== undefined ? updated.milestones : currentMaster.milestones,
        documents: updated.documents !== undefined ? updated.documents : currentMaster.documents,
        meta: updated.meta ? { ...currentMaster.meta, ...updated.meta } : currentMaster.meta
      };
    }

    const peerId = getPeerId();
    const nowIso = new Date().toISOString();
    const stamped = stampLocalChanges(currentMaster, finalData, { peerId, nowIso, syncStatusProgress: true });
    finalData = withCommitMeta(stamped, peerId, nowIso);

    parsedDataRef.current = finalData;
    setParsedDataState(finalData);
    notifyRegistries(finalData);

    try {
      const formatted = JSON.stringify(finalData, null, 2);
      setJsonTextState(formatted);
      setValidationResult(validate(JSON.parse(formatted)));
    } catch (err) {
      console.error("Failed to serialize JanttData to JSON:", err);
    }

    setIsLiveSyncing(true);
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      setIsLiveSyncing(false);
    }, 1300);

    if (currentMaster) {
      commandBus.emit("LOCAL_COMMIT", { before: currentMaster, after: finalData });
    }
  }, [cancelPendingParse, notifyRegistries]);

  const formatJson = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonText), null, 2);
      cancelPendingParse();
      setJsonTextState(formatted);
      applyEditorText(formatted);
    } catch {
      // Ignore
    }
  }, [jsonText, cancelPendingParse, applyEditorText]);

  const handleCopyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Ignore
    }
  }, [jsonText]);

  const handleDownloadJson = useCallback(() => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jantt-plan-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonText]);

  const handleExportCsv = useCallback(() => {
    if (parsedData) {
      downloadCsv(parsedData, `jantt-schedule-${Date.now()}.csv`);
    }
  }, [parsedData]);

  return {
    jsonText,
    setJsonText,
    parsedData,
    setParsedData,
    validationResult,
    setValidationResult,
    copiedJson,
    isLiveSyncing,
    handleEditorChange,
    handleChartCommit,
    formatJson,
    handleCopyJson,
    handleDownloadJson,
    handleExportCsv
  };
}
