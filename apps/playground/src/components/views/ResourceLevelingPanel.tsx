import React from "react";
import { AllocationHeatmap } from "./AllocationHeatmap";
import "./health.css";
import { useI18n } from "../../i18n/I18nProvider";
import { validationMessage } from "../../i18n/diagnostics";
import { createCalendar, detectOverAllocations, hasDependencyCycle, levelResources, resolvePersonById, resolveSchedule, validate, type JanttData, type LevelingAdjustment, type LevelingResult, type Task } from "@jantt/core";

interface Props {
  data: JanttData;
  onCommit: (data: JanttData) => void;
  readOnly: boolean;
  onPromptFork?: () => void;
}

const getProjectFinish = (tasks: Task[]): string => tasks.filter((task) => !task._deleted).reduce((latest, task) => task.end > latest ? task.end : latest, "");

const formatPercent = (value: number): string => String(Math.round(value * 10000) / 100);

export const ResourceLevelingPanel: React.FC<Props> = ({ data, onCommit, readOnly, onPromptFork }) => {
  const { t, locale } = useI18n();
  const adjustmentReason = ({ reason, reasonDetail, resourceId }: LevelingAdjustment): string => {
    if (!reasonDetail) return reason;
    if (reasonDetail.kind === "cascade") {
      return t("health.leveling.cascadeReason", { task: reasonDetail.deferredTaskId });
    }
    return t("health.leveling.overallocationReason", {
      resource: resourceId, date: reasonDetail.date, tasks: reasonDetail.higherPriorityTasks
    });
  };
  const [proposal, setProposal] = React.useState<LevelingResult | null>(null);
  const proposalSource = React.useRef<JanttData | null>(null);
  const [optimization, setOptimization] = React.useState<{ source: JanttData; tasks: Task[]; changed: number } | null>(null);
  const [calculating, setCalculating] = React.useState(false);
  const [error, setError] = React.useState<{
    key: "health.leveling.cyclicError" | "health.leveling.workerError" | "health.leveling.scheduleError" | "health.leveling.invalidCapacity";
    detail?: string;
  } | null>(null);
  const [defaultPercent, setDefaultPercent] = React.useState("");
  const [capacityDraft, setCapacityDraft] = React.useState<Record<string, string>>({});
  const workerRef = React.useRef<Worker | null>(null);
  const options = React.useMemo(() => {
    const calendar = data.meta?.calendar;
    const resolvedCalendar = typeof calendar === "string" && data.calendars?.[calendar] ? data.calendars[calendar] : calendar;
    return { calendar: resolvedCalendar ? createCalendar(resolvedCalendar) : undefined, calendars: data.calendars,
      people: data.people, useWorkingDays: data.meta?.useWorkingDays, defaultGapDays: data.meta?.defaultGapDays,
      defaultCapacity: data.meta?.defaultResourceCapacity, resourceCapacities: data.meta?.resourceCapacities };
  }, [data]);
  const allocation = React.useMemo(() => {
    const validation = validate(data);
    const problem = validation.errors.find((issue) => ["MISSING_TASKS", "INVALID_TASK_OBJECT", "MISSING_TASK_ID", "DUPLICATE_TASK_ID", "INVALID_DATE_FORMAT", "INVALID_DATE_RANGE", "INVALID_DEPENDENCY"].includes(issue.code))
      || validation.warnings?.find((warning) => warning.code === "INVALID_CALENDAR");
    if (problem) return { conflicts: [], error: validationMessage(problem, false, locale, t) };
    return { conflicts: detectOverAllocations(data.tasks, options), error: "" };
  }, [data, options, locale, t]);
  const resources = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const task of data.tasks) {
      if (task._deleted || !task.assignee) continue;
      const person = resolvePersonById(data.people, task.assignee);
      const id = person?.id || task.assignee;
      map.set(id, { id, name: person?.name || id });
    }
    return [...map.values()];
  }, [data]);
  React.useEffect(() => {
    setProposal(null);
    setError(null);
    setCalculating(false);
    setDefaultPercent(data.meta?.defaultResourceCapacity === undefined ? "" : formatPercent(data.meta.defaultResourceCapacity));
    setCapacityDraft(Object.fromEntries(resources.map((resource) => {
      const capacity = data.meta?.resourceCapacities?.[resource.id] ?? data.meta?.resourceCapacities?.[resource.name];
      return [resource.id, capacity === undefined ? "" : formatPercent(capacity)];
    })));
    return () => { workerRef.current?.terminate(); workerRef.current = null; };
  }, [data, resources]);

  const saveCapacities = () => {
    if (readOnly) { onPromptFork?.(); return; }
    const values = [defaultPercent, ...Object.values(capacityDraft)];
    if (values.some((value) => value.trim() !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      setError({ key: "health.leveling.invalidCapacity" });
      return;
    }
    const capacities = { ...data.meta?.resourceCapacities };
    for (const resource of resources) {
      delete capacities[resource.id];
      if (resource.name !== resource.id) delete capacities[resource.name];
      const value = capacityDraft[resource.id]?.trim();
      if (value) capacities[resource.id] = Number(value) / 100;
    }
    onCommit({ ...data, meta: { ...data.meta,
      defaultResourceCapacity: defaultPercent.trim() ? Number(defaultPercent) / 100 : undefined,
      resourceCapacities: Object.keys(capacities).length ? capacities : undefined
    } });
  };

  const acceptResult = (result: LevelingResult) => {
    const diagnostics: string[] = [];
    resolveSchedule(result.tasks, { ...options, diagnostics });
    if (diagnostics.length) { setError({ key: "health.leveling.scheduleError", detail: diagnostics.join(" ") }); return; }
    setProposal(result);
  };

  const preview = () => {
    setProposal(null);
    setOptimization(null);
    proposalSource.current = data;
    setError(null);
    if (hasDependencyCycle(data.tasks)) { setError({ key: "health.leveling.cyclicError" }); return; }
    const diagnostics: string[] = [];
    resolveSchedule(data.tasks, { ...options, diagnostics });
    if (diagnostics.length) { setError({ key: "health.leveling.scheduleError", detail: diagnostics.join(" ") }); return; }
    if (typeof Worker === "undefined") {
      try { acceptResult(levelResources(data.tasks, options)); }
      catch (err) { setError({ key: "health.leveling.workerError", detail: err instanceof Error ? err.message : String(err) }); }
      return;
    }
    try {
      const worker = new Worker(new URL("../../workers/resource-leveling.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      setCalculating(true);
      worker.onmessage = (event: MessageEvent<{ result?: LevelingResult; error?: string }>) => {
        if (workerRef.current !== worker) return;
        if (event.data.error) setError({ key: "health.leveling.workerError", detail: event.data.error });
        else if (event.data.result) acceptResult(event.data.result);
        setCalculating(false);
        worker.terminate();
        workerRef.current = null;
      };
      worker.onerror = (event) => {
        if (workerRef.current !== worker) return;
        setError({ key: "health.leveling.workerError", detail: event.message });
        setCalculating(false);
        worker.terminate();
        workerRef.current = null;
      };
      worker.postMessage({ tasks: data.tasks, options });
    } catch (err) {
      workerRef.current?.terminate();
      workerRef.current = null;
      setCalculating(false);
      setError({ key: "health.leveling.workerError", detail: err instanceof Error ? err.message : String(err) });
    }
  };

  // Invalidate during render, before the effect clears an old proposal or worker.
  const currentProposal = proposalSource.current === data ? proposal : null;
  const changes = React.useMemo(() => {
    if (!currentProposal) return [];
    const originals = new Map(data.tasks.map(task => [task.id, task]));
    return currentProposal.tasks.flatMap(task => {
      const original = originals.get(task.id);
      return original && (original.start !== task.start || original.end !== task.end) ? [{ original, task }] : [];
    });
  }, [currentProposal, data.tasks]);
  const beforeFinish = getProjectFinish(data.tasks);
  const afterFinish = currentProposal ? getProjectFinish(currentProposal.tasks) : "";

  return (
    <section className="health-scenarios" aria-label={t("health.leveling.sectionAria")} style={{ margin: "12px 0", padding: 16, border: "1px solid var(--jantt-border)", borderRadius: 8 }}>
      <strong>{t("health.leveling.title")}</strong>
      <p style={{ margin: "8px 0" }}>
        {!allocation.error && <>{t(allocation.conflicts.length === 1 ? "health.leveling.overloadOne" : "health.leveling.overloadMany", { count: allocation.conflicts.length })} </>}
        {t("health.leveling.defaultCapacity", { percent: formatPercent(options.defaultCapacity ?? 1) })}
      </p>
      <AllocationHeatmap conflicts={allocation.conflicts} resources={resources} />
      {allocation.error && <p role="alert">{allocation.error}</p>}
      <details style={{ marginBottom: 12 }}>
        <summary>{t("health.leveling.capacitySettings")}</summary>
        <p>{t("health.leveling.capacityHint")}</p>
        <label>{t("health.leveling.defaultCapacityLabel")} <input aria-label={t("health.leveling.defaultCapacityLabel")} type="number" min="0" step="any" placeholder="100" value={defaultPercent} onChange={(event) => setDefaultPercent(event.target.value)} /></label>
        {resources.map((resource) => <div key={resource.id}>
          <label>{t("health.leveling.resourceCapacityLabel", { name: resource.name })} <input aria-label={t("health.leveling.resourceCapacityLabel", { name: resource.name })} type="number" min="0" step="any" placeholder={defaultPercent || "100"} value={capacityDraft[resource.id] || ""} onChange={(event) => setCapacityDraft((draft) => ({ ...draft, [resource.id]: event.target.value }))} /></label>
        </div>)}
        <button type="button" className="btn-nav" onClick={saveCapacities}>{t("health.leveling.saveCapacities")}</button>
      </details>
      <button type="button" className="btn-nav" onClick={preview} disabled={calculating || Boolean(allocation.error)}>
        {calculating ? t("health.leveling.calculating") : t("health.leveling.preview")}
      </button>
      <button type="button" className="btn-nav" disabled={calculating || Boolean(allocation.error)} onClick={() => {
        setProposal(null);
        setError(null);
        const diagnostics: string[] = [];
        const scheduled = resolveSchedule(data.tasks.filter(task => !task._deleted), { ...options, diagnostics });
        if (diagnostics.length) { setOptimization(null); setError({ key: "health.leveling.scheduleError", detail: diagnostics.join(" ") }); return; }
        const byId = new Map(scheduled.map(task => [task.id, task]));
        let changed = 0;
        const next = data.tasks.map(task => {
          const replacement = byId.get(task.id);
          if (task._deleted || !replacement || (replacement.start === task.start && replacement.end === task.end)) return task;
          changed++;
          return replacement;
        });
        setOptimization({ source: data, tasks: next, changed });
      }}>{t("health.leveling.optimize")}</button>
      {optimization?.source === data && <div className="health-scenario-result" role="status">
        <strong>{t("health.leveling.earliestStart")}</strong>
        <p>{optimization.changed
          ? t("health.leveling.optimizeMany", { count: optimization.changed, finish: getProjectFinish(optimization.tasks), current: beforeFinish })
          : t("health.leveling.optimizeAlready")}</p>
        {optimization.changed > 0 && <button type="button" className="btn-nav" onClick={() => {
          if (readOnly) { onPromptFork?.(); return; }
          onCommit({ ...data, tasks: optimization.tasks });
          setOptimization(null);
        }}>{t("health.leveling.applyScenario")}</button>}
      </div>}
      {error && (
        <div role="alert">
          <p>{locale === "en" && error.detail ? error.detail : t(error.key)}</p>
          {locale !== "en" && error.detail && (
            <details>
              <summary>{t("editor.diagnostics.technicalDetails")}</summary>
              <div>{error.detail}</div>
            </details>
          )}
        </div>
      )}
      {currentProposal && (
        <div aria-live="polite" style={{ marginTop: 12 }}>
          <p><strong>{t(currentProposal.remainingOverallocations.length ? "health.leveling.overloadsRemain" : "health.leveling.noOverloadsRemain")}</strong></p>
          <><p>{t("health.leveling.adjustSummary", {
            adjustments: t(currentProposal.adjustments.length === 1 ? "health.leveling.adjustOne" : "health.leveling.adjustMany", { count: currentProposal.adjustments.length }),
            overloads: t(currentProposal.remainingOverallocations.length === 1 ? "health.leveling.overloadDayOne" : "health.leveling.overloadDayMany", { count: currentProposal.remainingOverallocations.length }),
            ending: currentProposal.daysAdded ? t("health.leveling.extendsBy", { days: currentProposal.daysAdded }) : t("health.leveling.doesNotExtend")
          })}</p>
          <p>{t("health.leveling.finishLine", { before: beforeFinish || "-", after: afterFinish || "-" })} {data.meta?.targetDate && <>{t("health.leveling.targetLine", { date: data.meta.targetDate })} {afterFinish && (afterFinish > data.meta.targetDate ? t("health.leveling.previewExceeds") : t("health.leveling.previewMeets"))}</>}</p></>
          {changes.length > 0 && (
            <ul>{changes.map(({ original, task }) => {
              const adjustments = currentProposal.adjustments.filter((adjustment) => adjustment.taskId === task.id);
              return <li key={task.id}>{task.label || task.id}: {original.start}–{original.end} → {task.start}–{task.end}
                {adjustments.length ? <ul>{adjustments.map((adjustment, index) => <li key={index}>{t("health.leveling.resource", { id: adjustment.resourceId })} {adjustmentReason(adjustment)} {adjustment.withinFloat ? t("health.leveling.withinFloat") : t("health.leveling.outsideFloat")}</li>)}</ul> : <>{" "}{t("health.leveling.scheduleChange")}</>}
              </li>;
            })}</ul>
          )}
          {currentProposal.remainingOverallocations.length > 0 && <div>
            <strong>{t("health.leveling.remainingOverloads")}</strong>
            <ul>{currentProposal.remainingOverallocations.slice(0, 20).map((item) => {
              const locked = item.tasks.filter((id) => currentProposal.tasks.some((task) => task.id === id && task.locked));
              return <li key={`${item.resourceId}-${item.date}`}>{t("health.leveling.overloadItem", { resource: item.resourceId, date: item.date, allocated: formatPercent(item.totalUnits), capacity: formatPercent(item.capacity), tasks: item.tasks.join(", ") })}{locked.length > 0 && <>{" "}{t("health.leveling.lockedTasks", { tasks: locked.join(", ") })}</>}{item.reason === "single-task-exceeds-capacity" && <>{" "}{t("health.leveling.taskExceeds")}</>}</li>;
            })}</ul>
            {currentProposal.remainingOverallocations.length > 20 && <p>{t("health.leveling.andMore", { count: currentProposal.remainingOverallocations.length - 20 })}</p>}
          </div>}
          <p>{t("health.leveling.previewNote")}</p>
          <button type="button" className="btn-nav is-primary" disabled={changes.length === 0} onClick={() => {
            if (proposalSource.current !== data) return;
            if (readOnly) { onPromptFork?.(); return; }
            onCommit({ ...data, tasks: currentProposal.tasks });
            setProposal(null);
          }}>{t("health.leveling.applyPreview")}</button>
        </div>
      )}
    </section>
  );
};
