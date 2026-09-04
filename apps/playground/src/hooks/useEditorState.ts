import { useState, useRef, useCallback } from "react";
import {
  type JanttData,
  type Person,
  type Team,
  type ValidationResult,
  validate,
  downloadCsv
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

    setParsedData(finalData);
    if (Array.isArray((finalData as any).people) && onPeopleChangeRef.current) {
      onPeopleChangeRef.current((finalData as any).people);
    }
    if (Array.isArray((finalData as any).teams) && onTeamsChangeRef.current) {
      onTeamsChangeRef.current((finalData as any).teams);
    }
    const formatted = JSON.stringify(finalData, null, 2);
    setJsonText(formatted);
    setValidationResult(validate(finalData));

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
