import * as readline from "node:readline";
import { createRequire } from "node:module";
import type { Readable, Writable } from "node:stream";
import {
  JanttData,
  Task,
  ValidationError,
  WorkingCalendar,
  CalendarPreset,
  validate,
  resolveSchedule,
  calculateCriticalPath,
  auditScheduleIntegrity,
  exportToCsv,
  hasDependencyCycle,
  isValidISODate,
  diffDays,
  DEFAULT_GAP_DAYS
} from "@jantt/core";

const SERVER_VERSION: string = createRequire(import.meta.url)("../package.json").version;

/** MCP protocol revisions this server speaks, newest first. */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** Upper bound for a single plan argument, so one oversized call cannot stall the stdio loop. */
const MAX_PLAN_CHARS = 20 * 1024 * 1024;

const planJsonProperty = (description: string) => ({ type: "string", description });
const targetDateProperty = {
  type: "string",
  description: "Optional contractual deadline (YYYY-MM-DD). Defaults to meta.targetDate. Required for negative-float detection."
};

export const MCP_TOOLS = [
  {
    name: "jantt_inspect_plan",
    description:
      "Summarizes a Jantt plan: validation errors, title, live task count, date span (start, finish, duration in calendar days), critical path task ids and early finish (honoring meta.defaultGapDays and an optional targetDate), categories, and workload per assignee (task count and total task-days).",
    inputSchema: {
      type: "object",
      properties: {
        planJson: planJsonProperty("Raw Jantt plan JSON string"),
        targetDate: targetDateProperty
      },
      required: ["planJson"]
    }
  },
  {
    name: "jantt_add_task",
    description:
      "Adds one task to a Jantt plan and returns the updated plan with dependency cascades resolved. Fails without changing anything if the id already exists or the task is invalid (bad dates, unknown category, dangling dependency, or a dependency cycle). Reports the task's final dates, which its predecessors may push later.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: planJsonProperty("Existing Jantt plan JSON string"),
        task: {
          type: "object",
          description: "Task object to insert",
          properties: {
            id: { type: "string", description: "Unique task id (must not exist in the plan yet)" },
            label: { type: "string" },
            category: { type: "string", description: "Key of an entry in the plan's 'categories' map" },
            start: { type: "string", description: "YYYY-MM-DD" },
            end: { type: "string", description: "YYYY-MM-DD, on or after start" },
            dependsOn: { description: "Prerequisite task id, shorthand (e.g. 't1:SS+2d'), or array" },
            assignee: { type: "string" },
            progress: { type: "number", description: "0.0 to 1.0" },
            milestone: { type: "boolean" }
          },
          required: ["id", "category", "start", "end"]
        }
      },
      required: ["planJson", "task"]
    }
  },
  {
    name: "jantt_reschedule_task",
    description:
      "Moves an existing task to new start/end dates and resolves dependency cascades. Successors are pushed later when needed but never pulled earlier, and the task itself is pushed later if its predecessors require it. Returns the requested and applied dates, whether dependencies adjusted them, the ids of other tasks that moved, and the updated plan.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: planJsonProperty("Existing Jantt plan JSON string"),
        taskId: { type: "string", description: "ID of task to reschedule" },
        newStart: { type: "string", description: "New start date (YYYY-MM-DD)" },
        newEnd: { type: "string", description: "New end date (YYYY-MM-DD), on or after newStart" }
      },
      required: ["planJson", "taskId", "newStart", "newEnd"]
    }
  },
  {
    name: "jantt_audit_schedule",
    description:
      "Audits schedule health with selected DCMA checks: missing logic (open ends), leads, lags, non-FS relationships, hard constraints, high float, negative float against a deadline (pass targetDate or set meta.targetDate; without one, negative float is not checked), high duration, out-of-sequence progress and broken links. Float and duration are measured in working days when the plan uses a working calendar. Returns a 0-100 integrity score, a grade, every check with failed/eligible counts, threshold and points deducted, actionable issues, and schema validation errors (including circular dependencies).",
    inputSchema: {
      type: "object",
      properties: {
        planJson: planJsonProperty("Jantt plan JSON string to audit"),
        targetDate: targetDateProperty
      },
      required: ["planJson"]
    }
  },
  {
    name: "jantt_diff_plans",
    description:
      "Compares a base and an updated version of a Jantt plan, ignoring soft-deleted tasks. Returns added, deleted and modified task ids; every field change as {id, field, from, to} (label, category, dates, progress, dependencies, assignee, status, priority, milestone, locked, costs); per-task start/end slip in days; and the project finish slip.",
    inputSchema: {
      type: "object",
      properties: {
        basePlanJson: planJsonProperty("Original baseline plan JSON"),
        updatedPlanJson: planJsonProperty("Updated plan JSON")
      },
      required: ["basePlanJson", "updatedPlanJson"]
    }
  },
  {
    name: "jantt_export_csv",
    description:
      "Converts a Jantt plan into an RFC-4180 CSV spreadsheet: one row per task with WBS, label, category, assignee, priority, dates, duration, budget, progress, milestone flag, dependencies, status, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: planJsonProperty("Jantt plan JSON string")
      },
      required: ["planJson"]
    }
  }
];

// -----------------------------------------------------------------------------
// Argument helpers: every failure becomes a message an agent can act on.
// -----------------------------------------------------------------------------
function parsePlanArg(args: Record<string, unknown>, key: string): JanttData {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === "") {
    throw new Error(`Missing required argument '${key}' (a Jantt plan JSON string).`);
  }
  let plan: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > MAX_PLAN_CHARS) {
      throw new Error(`Argument '${key}' is too large (${raw.length} characters; the limit is ${MAX_PLAN_CHARS}).`);
    }
    try {
      plan = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Argument '${key}' is not valid JSON: ${(err as Error).message}`);
    }
  }
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error(`Argument '${key}' must be a Jantt plan object like { "tasks": [...] }.`);
  }
  return plan as JanttData;
}

/** Tasks of a plan that is about to be modified: the array must exist and hold only objects. */
function requireTasks(plan: JanttData, key: string): Task[] {
  if (!Array.isArray(plan.tasks)) {
    throw new Error(`Argument '${key}' has no 'tasks' array.`);
  }
  const badIndex = plan.tasks.findIndex((t) => !t || typeof t !== "object" || Array.isArray(t));
  if (badIndex !== -1) {
    throw new Error(`Argument '${key}' has an invalid entry at tasks[${badIndex}]; every task must be an object.`);
  }
  return plan.tasks;
}

/** Tasks that are part of the schedule: objects that are not soft-deleted tombstones. */
function liveTasksOf(plan: JanttData): Task[] {
  return Array.isArray(plan.tasks)
    ? plan.tasks.filter((t): t is Task => Boolean(t) && typeof t === "object" && !t._deleted)
    : [];
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required string argument '${key}'.`);
  }
  return value.trim();
}

/** Exactly YYYY-MM-DD: the value is written into the plan, so time suffixes and trailing text are refused. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(args: Record<string, unknown>, key: string): string {
  const value = requireString(args, key);
  if (!ISO_DAY.test(value) || !isValidISODate(value)) {
    throw new Error(`Argument '${key}' must be a valid YYYY-MM-DD date (got '${value}').`);
  }
  return value;
}

function targetDateOf(args: Record<string, unknown>, plan: JanttData): string | undefined {
  const fromArgs = args.targetDate !== undefined && args.targetDate !== null;
  const raw = fromArgs ? args.targetDate : plan.meta?.targetDate;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || !isValidISODate(raw.trim())) {
    const source = fromArgs ? "Argument 'targetDate'" : "The plan's meta.targetDate";
    throw new Error(`${source} must be a valid YYYY-MM-DD date (got ${JSON.stringify(raw)}).`);
  }
  return raw.trim();
}

function gapDaysOf(plan: JanttData): number {
  const gap = plan.meta?.defaultGapDays;
  return typeof gap === "number" && Number.isFinite(gap) ? gap : DEFAULT_GAP_DAYS;
}

/**
 * The project calendar the health checks measure float and duration in, or undefined for calendar days.
 * Same rule as the cascade: an explicit meta.useWorkingDays wins, otherwise a meta.calendar turns working days on.
 * A calendar name resolves against the plan's `calendars` map before the presets.
 */
function workingCalendarOf(plan: JanttData): WorkingCalendar | CalendarPreset | undefined {
  const meta = plan.meta && typeof plan.meta === "object" ? plan.meta : undefined;
  const ref: unknown = meta?.calendar;
  const useWorkingDays = typeof meta?.useWorkingDays === "boolean" ? meta.useWorkingDays : Boolean(ref);
  if (!useWorkingDays) return undefined;
  if (typeof ref === "string") {
    const calendars: unknown = plan.calendars;
    const named =
      calendars && typeof calendars === "object" && Object.hasOwn(calendars, ref) ? (calendars as Record<string, unknown>)[ref] : undefined;
    // Unknown names fall back to the standard Mon-Fri calendar inside the engine, as in the cascade.
    return named && typeof named === "object" ? (named as WorkingCalendar) : (ref as CalendarPreset);
  }
  return ref && typeof ref === "object" && !Array.isArray(ref) ? (ref as WorkingCalendar) : "standard";
}

function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((e) => `- [${e.code}] ${e.path}: ${e.message}${e.suggestion ? ` Fix: ${e.suggestion}` : ""}`)
    .join("\n");
}

/** Ids of tasks (other than `excludeId`) whose dates differ between two versions of a task list. */
function movedTaskIds(before: Task[], after: Task[], excludeId: string): string[] {
  const previous = new Map(before.map((t) => [t.id, t]));
  return after
    .filter((t) => {
      const old = previous.get(t.id);
      return t.id !== excludeId && old !== undefined && (old.start !== t.start || old.end !== t.end);
    })
    .map((t) => t.id);
}

function latestEnd(tasks: Task[]): string | null {
  let latest: string | null = null;
  for (const t of tasks) {
    if (isValidISODate(t.end) && (latest === null || t.end > latest)) latest = t.end;
  }
  return latest;
}

function slipDays(from: unknown, to: unknown): number {
  return typeof from === "string" && typeof to === "string" && isValidISODate(from) && isValidISODate(to) ? diffDays(from, to) : 0;
}

const DIFF_FIELDS = [
  "label",
  "name",
  "category",
  "start",
  "end",
  "progress",
  "dependsOn",
  "assignee",
  "status",
  "priority",
  "milestone",
  "locked",
  "estimatedCost",
  "actualCost"
] as const;

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// -----------------------------------------------------------------------------
// Tool implementations
// -----------------------------------------------------------------------------
export function executeTool(name: string, args: Record<string, unknown>): unknown {
  args = args && typeof args === "object" ? args : {};

  switch (name) {
    case "jantt_inspect_plan": {
      const plan = parsePlanArg(args, "planJson");
      const validation = validate(plan);
      const tasks = liveTasksOf(plan);
      const targetDate = targetDateOf(args, plan);
      const critical = calculateCriticalPath(tasks, {
        defaultGapDays: gapDaysOf(plan),
        targetDate,
        calendar: plan.meta?.calendar,
        useWorkingDays: plan.meta?.useWorkingDays,
        calendars: plan.calendars,
        people: plan.people
      });

      let startDate: string | null = null;
      const workload = new Map<string, { assignee: string; taskCount: number; totalDays: number }>();
      for (const t of tasks) {
        if (isValidISODate(t.start) && (startDate === null || t.start < startDate)) startDate = t.start;
        const assignee = typeof t.assignee === "string" && t.assignee.trim() ? t.assignee : "Unassigned";
        const entry = workload.get(assignee) ?? { assignee, taskCount: 0, totalDays: 0 };
        entry.taskCount += 1;
        entry.totalDays += Math.max(slipDays(t.start, t.end), 0);
        workload.set(assignee, entry);
      }
      const finishDate = latestEnd(tasks);

      return {
        valid: validation.valid,
        validationErrors: validation.errors,
        summary: {
          title: plan.meta?.title || "Untitled Project",
          totalTasks: tasks.length,
          startDate,
          finishDate,
          durationDays: startDate && finishDate ? diffDays(startDate, finishDate) : null,
          criticalPathLength: critical.criticalTaskIds.size,
          criticalTaskIds: Array.from(critical.criticalTaskIds),
          projectEarlyFinish: critical.projectEarlyFinish,
          targetDate: targetDate ?? null,
          projectTotalFloatDays: critical.projectTotalFloat,
          categories: Object.keys(plan.categories || {}),
          workload: Array.from(workload.values()).sort((a, b) => b.taskCount - a.taskCount || b.totalDays - a.totalDays)
        }
      };
    }

    case "jantt_add_task": {
      const plan = parsePlanArg(args, "planJson");
      const tasks = requireTasks(plan, "planJson");
      const task = args.task;
      if (!task || typeof task !== "object" || Array.isArray(task)) {
        throw new Error("Argument 'task' must be a task object like { id, category, start, end }.");
      }
      const newTask = task as Task;
      if (typeof newTask.id !== "string" || newTask.id.trim() === "") {
        throw new Error("task.id must be a non-empty string.");
      }
      const existing = tasks.find((t) => t.id === newTask.id);
      if (existing) {
        throw new Error(
          existing._deleted
            ? `The id '${newTask.id}' belongs to a deleted task that is still kept for sync. Choose a different id.`
            : `A task with id '${newTask.id}' already exists in the plan. Choose a unique id, or use jantt_reschedule_task to move the existing task.`
        );
      }

      const candidate = [...tasks, newTask];
      const errors = validate({ ...plan, tasks: candidate }).errors.filter((e) => e.taskId === newTask.id);
      const live = liveTasksOf(plan);
      if (
        !errors.some((e) => e.code === "CIRCULAR_DEPENDENCY") &&
        hasDependencyCycle([...live, newTask]) &&
        !hasDependencyCycle(live)
      ) {
        errors.push({
          path: "task.dependsOn",
          taskId: newTask.id,
          code: "CIRCULAR_DEPENDENCY",
          message: `Adding task '${newTask.id}' would create a circular dependency.`,
          suggestion: "Remove the dependsOn link that points back into the chain that depends on this task."
        });
      }
      if (errors.length > 0) {
        throw new Error(`Task '${newTask.id}' was not added because it is invalid:\n${formatValidationErrors(errors)}`);
      }

      const resolved = resolveSchedule(candidate, gapDaysOf(plan));
      const placed = resolved.find((t) => t.id === newTask.id) ?? newTask;

      return {
        success: true,
        addedTaskId: newTask.id,
        appliedStart: placed.start,
        appliedEnd: placed.end,
        adjustedByDependencies: placed.start !== newTask.start || placed.end !== newTask.end,
        movedTaskIds: movedTaskIds(tasks, resolved, newTask.id),
        plan: { ...plan, tasks: resolved }
      };
    }

    case "jantt_reschedule_task": {
      const plan = parsePlanArg(args, "planJson");
      const tasks = requireTasks(plan, "planJson");
      const taskId = requireString(args, "taskId");
      const newStart = requireDate(args, "newStart");
      const newEnd = requireDate(args, "newEnd");
      if (diffDays(newStart, newEnd) < 0) {
        throw new Error(`newEnd (${newEnd}) must be on or after newStart (${newStart}).`);
      }
      const target = tasks.find((t) => t.id === taskId && !t._deleted);
      if (!target) {
        throw new Error(`No task with id '${taskId}' exists in the plan. Use jantt_inspect_plan to list task ids.`);
      }

      const updated = tasks.map((t) => (t === target ? { ...t, start: newStart, end: newEnd } : t));
      const resolved = resolveSchedule(updated, gapDaysOf(plan));
      const applied = resolved.find((t) => t.id === taskId) ?? target;

      return {
        success: true,
        rescheduledTaskId: taskId,
        requestedStart: newStart,
        requestedEnd: newEnd,
        appliedStart: applied.start,
        appliedEnd: applied.end,
        adjustedByDependencies: applied.start !== newStart || applied.end !== newEnd,
        movedTaskIds: movedTaskIds(tasks, resolved, taskId),
        plan: { ...plan, tasks: resolved }
      };
    }

    case "jantt_audit_schedule": {
      const plan = parsePlanArg(args, "planJson");
      const validation = validate(plan);
      const tasks = liveTasksOf(plan);
      const targetDate = targetDateOf(args, plan);
      const critical = calculateCriticalPath(tasks, {
        defaultGapDays: gapDaysOf(plan),
        targetDate,
        calendar: plan.meta?.calendar,
        useWorkingDays: plan.meta?.useWorkingDays,
        calendars: plan.calendars,
        people: plan.people
      });
      const calendar = workingCalendarOf(plan);
      const health = auditScheduleIntegrity(tasks, critical, { calendar });

      return {
        valid: validation.valid,
        validationErrors: validation.errors,
        integrityScore: health.healthScore,
        grade: health.grade,
        summary: health.summary,
        targetDate: targetDate ?? null,
        workingDays: calendar !== undefined,
        checks: health.checks,
        issues: health.issues,
        metrics: {
          missingLogic: health.missingLogicCount,
          negativeFloat: health.negativeFloatCount,
          negativeFloatChecked: Boolean(targetDate),
          highFloat: health.highFloatCount,
          totalTasks: health.totalTasksChecked
        }
      };
    }

    case "jantt_diff_plans": {
      const baseTasks = liveTasksOf(parsePlanArg(args, "basePlanJson"));
      const updatedTasks = liveTasksOf(parsePlanArg(args, "updatedPlanJson"));

      const baseById = new Map(baseTasks.map((t) => [t.id, t]));
      const updatedIds = new Set(updatedTasks.map((t) => t.id));
      const added = updatedTasks.filter((t) => !baseById.has(t.id));
      const deleted = baseTasks.filter((t) => !updatedIds.has(t.id));

      const changes: Array<{ id: string; field: string; from: unknown; to: unknown }> = [];
      const slips: Array<{ id: string; startSlipDays: number; endSlipDays: number }> = [];
      const modifiedIds: string[] = [];
      for (const t of updatedTasks) {
        const b = baseById.get(t.id);
        if (!b) continue;
        let modified = false;
        for (const field of DIFF_FIELDS) {
          if (!sameValue(b[field], t[field])) {
            changes.push({ id: t.id, field, from: b[field] ?? null, to: t[field] ?? null });
            modified = true;
          }
        }
        if (modified) modifiedIds.push(t.id);
        const startSlipDays = slipDays(b.start, t.start);
        const endSlipDays = slipDays(b.end, t.end);
        if (startSlipDays !== 0 || endSlipDays !== 0) slips.push({ id: t.id, startSlipDays, endSlipDays });
      }

      const baseFinish = latestEnd(baseTasks);
      const updatedFinish = latestEnd(updatedTasks);

      return {
        summary: {
          tasksAdded: added.length,
          tasksDeleted: deleted.length,
          tasksModified: modifiedIds.length,
          baseFinish,
          updatedFinish,
          projectFinishSlipDays: baseFinish && updatedFinish ? diffDays(baseFinish, updatedFinish) : null
        },
        addedTaskIds: added.map((t) => t.id),
        deletedTaskIds: deleted.map((t) => t.id),
        modifiedTaskIds: modifiedIds,
        changes,
        slips
      };
    }

    case "jantt_export_csv": {
      const plan = parsePlanArg(args, "planJson");
      return { csv: exportToCsv({ ...plan, tasks: liveTasksOf(plan) }) };
    }

    default:
      throw new Error(`Unknown Jantt MCP tool: ${name}`);
  }
}

// -----------------------------------------------------------------------------
// JSON-RPC 2.0 / MCP stdio transport
// -----------------------------------------------------------------------------
type JsonRpcId = string | number | null;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

function callTool(id: JsonRpcId, params: unknown) {
  const p = asObject(params) ?? {};
  const name = p.name;
  if (typeof name !== "string" || !MCP_TOOLS.some((t) => t.name === name)) {
    return rpcError(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`);
  }
  try {
    const output = executeTool(name, asObject(p.arguments) ?? {});
    return rpcResult(id, {
      content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output, null, 2) }]
    });
  } catch (err) {
    // Tool failures are results the model can read and correct, not protocol errors.
    return rpcResult(id, {
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      isError: true
    });
  }
}

function handleRpcMessage(message: unknown): object | undefined {
  const msg = asObject(message);
  if (!msg) return rpcError(null, INVALID_REQUEST, "Invalid Request: expected a JSON-RPC 2.0 object.");

  const id: JsonRpcId = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
  const isNotification = !("id" in msg);

  if (typeof msg.method !== "string") {
    // Responses carry result/error and no method. This server never sends requests, so drop them.
    if ("result" in msg || "error" in msg) return undefined;
    return rpcError(id, INVALID_REQUEST, "Invalid Request: missing 'method'.");
  }
  if (isNotification) return undefined; // notifications (initialized, cancelled, ...) never get a response
  if (msg.jsonrpc !== "2.0") return rpcError(id, INVALID_REQUEST, "Invalid Request: 'jsonrpc' must be \"2.0\".");

  try {
    switch (msg.method) {
      case "initialize": {
        const requested = asObject(msg.params)?.protocolVersion;
        const protocolVersion =
          typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "jantt-mcp", version: SERVER_VERSION }
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: MCP_TOOLS });
      case "tools/call":
        return callTool(id, msg.params);
      default:
        return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    return rpcError(id, INTERNAL_ERROR, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Standard MCP JSON-RPC stdio server loop (newline-delimited messages).
 * The streams default to the process stdio; pass others to embed or test the server.
 */
export function startMcpServer(input: Readable = process.stdin, output: Writable = process.stdout): readline.Interface {
  const rl = readline.createInterface({ input, terminal: false, crlfDelay: Infinity });
  const send = (payload: unknown) => output.write(`${JSON.stringify(payload)}\n`);

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      send(rpcError(null, PARSE_ERROR, "Parse error: message is not valid JSON."));
      return;
    }

    if (Array.isArray(message)) {
      if (message.length === 0) {
        send(rpcError(null, INVALID_REQUEST, "Invalid Request: empty batch."));
        return;
      }
      const responses = message.map(handleRpcMessage).filter((r) => r !== undefined);
      if (responses.length > 0) send(responses);
      return;
    }

    const response = handleRpcMessage(message);
    if (response !== undefined) send(response);
  });

  return rl;
}
