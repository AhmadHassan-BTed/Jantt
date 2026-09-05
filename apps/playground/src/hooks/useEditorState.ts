import { useState, useRef, useCallback } from "react";
import {
  type JanttData,
  type Task,
  type Person,
  type Team,
  type ValidationResult,
  validate,
  downloadCsv,
  syncTaskProgressAndStatus,
  calculatePlanHash
} from "@jantt/core";

interface UseEditorStateOptions {
  initialJson: string;
  initialParsed: JanttData | null;
  onPeopleChange?: (people: Person[]) => void;
  onTeamsChange?: (teams: Team[]) => void;
}

export function useEditorState({
  initialJson,
  initialParsed,
  onPeopleChange,
  onTeamsChange
}: UseEditorStateOptions) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [parsedData, setParsedData] = useState<JanttData | null>(initialParsed);
  const [validationResult, setValidationResult] = useState<ValidationResult>(() =>
    validate(initialParsed || {})
  );
  const [copiedJson, setCopiedJson] = useState(false);
  const [isLiveSyncing, setIsLiveSyncing] = useState(false);
  const syncTimerRef = useRef<number | null>(null);

  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  const onPeopleChangeRef = useRef(onPeopleChange);
  onPeopleChangeRef.current = onPeopleChange;
  const onTeamsChangeRef = useRef(onTeamsChange);
  onTeamsChangeRef.current = onTeamsChange;

  const handleEditorChange = useCallback((text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      const val = validate(parsed);
      setValidationResult(val);
      if (val.valid) {
        setParsedData(parsed);
        if (Array.isArray(parsed.people) && onPeopleChangeRef.current) {
          onPeopleChangeRef.current(parsed.people);
        }
        if (Array.isArray(parsed.teams) && onTeamsChangeRef.current) {
          onTeamsChangeRef.current(parsed.teams);
        }
      } else {
        setParsedData(null);
      }
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
      setParsedData(null);
    }
  }, []);

  const handleChartCommit = useCallback((updated: JanttData) => {
    let finalData = updated;
    const currentMaster = parsedDataRef.current;
    if (currentMaster && updated.tasks.length < currentMaster.tasks.length) {
      if (currentMaster.tasks.length - updated.tasks.length > 1) {
        const updatedMap = new Map(updated.tasks.map((t) => [t.id, t]));
        const mergedTasks = currentMaster.tasks.map((t) => updatedMap.get(t.id) || t);
        finalData = { ...currentMaster, ...updated, tasks: mergedTasks };
      }
    }
    if (currentMaster) {
      finalData = {
        ...currentMaster,
        ...finalData,
        categories: finalData.categories !== undefined ? finalData.categories : currentMaster.categories,
        notes: finalData.notes !== undefined ? finalData.notes : currentMaster.notes,
        people: (finalData as any).people !== undefined ? (finalData as any).people : (currentMaster as any).people,
        teams: (finalData as any).teams !== undefined ? (finalData as any).teams : (currentMaster as any).teams,
        milestones: finalData.milestones !== undefined ? finalData.milestones : currentMaster.milestones,
        documents: finalData.documents !== undefined ? finalData.documents : currentMaster.documents,
        meta: finalData.meta ? { ...currentMaster.meta, ...finalData.meta } : currentMaster.meta
      };
    }

    const peerId = (() => {
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
    })();

    const nowIso = new Date().toISOString();
    const compositeTs = `${nowIso}#${peerId}`;
    const prevTaskMap = new Map<string, Task>((currentMaster?.tasks || []).map((t) => [t.id, t]));

    const PM_TRACKED_FIELDS = [
      "label",
      "name",
      "start",
      "end",
      "progress",
      "status",
      "category",
      "assignee",
      "person",
      "assignees",
      "dependsOn",
      "gapDays",
      "notes",
      "color",
      "priority",
      "urgent",
      "locked"
    ] as const;

    const stampedTasks = (finalData.tasks || []).map((t) => {
      const prev = prevTaskMap.get(t.id);
      const synced = syncTaskProgressAndStatus({ status: t.status, progress: t.progress }, t);
      const currentTask = { ...t, ...synced };

      const fieldTimestamps: Record<string, string> = { ...(currentTask.fieldTimestamps || {}) };
      let hasChanges = false;

      if (!prev) {
        hasChanges = true;
        for (const field of PM_TRACKED_FIELDS) {
          if ((currentTask as any)[field] !== undefined) {
            fieldTimestamps[field] = compositeTs;
          }
        }
      } else {
        for (const field of PM_TRACKED_FIELDS) {
          const currVal = (currentTask as any)[field];
          const prevVal = (prev as any)[field];
          if (JSON.stringify(currVal) !== JSON.stringify(prevVal)) {
            fieldTimestamps[field] = compositeTs;
            hasChanges = true;
          }
        }
      }

      if (hasChanges) {
        return {
          ...currentTask,
          fieldTimestamps,
          updatedAt: nowIso,
          updatedBy: peerId
        };
      }

      return currentTask;
    });

    const nextRevision = (finalData.meta?.revision || 0) + 1;
    const interimData: JanttData = {
      ...finalData,
      meta: {
        ...finalData.meta,
        revision: nextRevision,
        updatedAt: nowIso
      },
      tasks: stampedTasks
    };
    const contentHash = calculatePlanHash(interimData);
    finalData = {
      ...interimData,
      meta: {
        ...interimData.meta,
        contentHash,
        sync: {
          ...(interimData.meta?.sync || {}),
          revision: nextRevision,
          contentHash,
          updatedAt: nowIso,
          clientId: peerId
        }
      }
    };

    setParsedData(finalData);
    if (Array.isArray((finalData as any).people) && onPeopleChangeRef.current) {
      onPeopleChangeRef.current((finalData as any).people);
    }
    if (Array.isArray((finalData as any).teams) && onTeamsChangeRef.current) {
      onTeamsChangeRef.current((finalData as any).teams);
    }

    try {
      const cleanJson = JSON.parse(JSON.stringify(finalData));
      const formatted = JSON.stringify(cleanJson, null, 2);
      setJsonText(formatted);
      setValidationResult(validate(cleanJson));
    } catch (err) {
      console.error("Failed to serialize JanttData to JSON:", err);
    }

    setIsLiveSyncing(true);
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      setIsLiveSyncing(false);
    }, 1300);
  }, []);

  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      // Ignore
    }
  }, [jsonText]);

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
