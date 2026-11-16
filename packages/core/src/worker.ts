/**
 * Jantt Schedule Worker client and protocol.
 *
 * `createScheduleWorkerClient(source)` runs schedule resolution, Monte Carlo risk simulation and
 * resource leveling in a Web Worker when you give it a worker: a module script URL, or a factory
 * that creates the worker (the form bundlers compile, e.g.
 * `() => new Worker(new URL("./jantt-worker.ts", import.meta.url), { type: "module" })`).
 * That script only needs:
 *
 * ```ts
 * // jantt-worker.ts
 * import { installScheduleWorker } from "@jantt/core";
 * installScheduleWorker();
 * ```
 *
 * Without a worker (or when workers are unavailable, e.g. Node.js/SSR, or the worker fails), the
 * same computations run on the main thread, asynchronously in a later macrotask; they do not
 * block the caller, but long runs still occupy the main thread. `isWorkerActive()` tells which.
 */

import type { JanttData, Task } from "./types.js";
import type { SchedulePipelineOptions } from "./pipeline/schedule-pipeline.js";
import type { MonteCarloOptions, MonteCarloResult } from "./monte-carlo.js";
import type { ResourceLevelingOptions, LevelingResult } from "./resource-leveler.js";
import { SchedulePipeline } from "./pipeline/schedule-pipeline.js";
import { runMonteCarloSimulation } from "./monte-carlo.js";
import { levelResources } from "./resource-leveler.js";

export type WorkerTaskType = "RESOLVE_SCHEDULE" | "RUN_MONTE_CARLO" | "LEVEL_RESOURCES";

export interface WorkerRequest<T = any> {
  id: number;
  type: WorkerTaskType;
  payload: T;
}

export interface WorkerResponse<R = any> {
  id: number;
  success: boolean;
  result?: R;
  error?: string;
}

export interface ScheduleWorkerClient {
  resolveSchedule: (input: JanttData | Task[], options?: SchedulePipelineOptions) => Promise<JanttData | Task[]>;
  runMonteCarlo: (input: JanttData | Task[], options?: MonteCarloOptions) => Promise<MonteCarloResult>;
  levelResources: (input: JanttData | Task[], options?: ResourceLevelingOptions) => Promise<LevelingResult>;
  terminate: () => void;
  isWorkerActive: () => boolean;
}

/** A module worker script URL, or a factory that creates the worker. */
export type ScheduleWorkerSource = string | URL | (() => Worker);

export interface ScheduleWorkerClientOptions {
  /** Rejects a worker request that has not answered within this many ms. Default 30000; 0 disables. */
  timeoutMs?: number;
  /**
   * Receives worker start-up failures and crashes. The client keeps working either way, on the
   * main thread, so this is for reporting only.
   */
  onError?: (error: Error) => void;
}

interface WorkerPayload {
  input: JanttData | Task[];
  options?: unknown;
}

const WORKER_TASK_TYPES: ReadonlySet<string> = new Set<WorkerTaskType>(["RESOLVE_SCHEDULE", "RUN_MONTE_CARLO", "LEVEL_RESOURCES"]);
const DEFAULT_TIMEOUT_MS = 30000;

function extractTasks(input: JanttData | Task[]): Task[] {
  return Array.isArray(input) ? input : (input.tasks || []);
}

function namedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

/** Resolves the schedule with the full pipeline, honoring the plan's own gap and calendars. */
function resolvePlan(input: JanttData | Task[], options: SchedulePipelineOptions = {}): JanttData | Task[] {
  const meta = Array.isArray(input) ? undefined : input.meta;
  const plan = Array.isArray(input) ? undefined : input;
  const pipeline = SchedulePipeline.createDefault({ includeCriticalPath: options.includeCriticalPath });
  const { tasks } = pipeline.execute(extractTasks(input), {
    calendar: meta?.calendar,
    useWorkingDays: meta?.useWorkingDays,
    calendars: plan?.calendars,
    people: plan?.people,
    ...options,
    defaultGapDays: options.defaultGapDays ?? meta?.defaultGapDays
  });
  return plan ? { ...plan, tasks } : tasks;
}

/**
 * Executes one worker protocol request synchronously. Used by {@link installScheduleWorker}
 * inside a worker and by the client's main-thread fallback, so both behave identically.
 */
export function executeScheduleWorkerRequest(request: unknown): WorkerResponse {
  const req = request as Partial<WorkerRequest<WorkerPayload>> | null;
  const id = typeof req?.id === "number" ? req.id : -1;
  if (!req || id < 0 || typeof req.type !== "string" || !WORKER_TASK_TYPES.has(req.type)) {
    return { id, success: false, error: "Invalid schedule worker request." };
  }
  const payload = req.payload;
  if (!payload || typeof payload !== "object" || !payload.input || typeof payload.input !== "object") {
    return { id, success: false, error: "Schedule worker request has no plan or task list." };
  }
  try {
    switch (req.type) {
      case "RESOLVE_SCHEDULE":
        return { id, success: true, result: resolvePlan(payload.input, payload.options as SchedulePipelineOptions) };
      case "RUN_MONTE_CARLO":
        return { id, success: true, result: runMonteCarloSimulation(extractTasks(payload.input), payload.options as MonteCarloOptions) };
      case "LEVEL_RESOURCES":
        return { id, success: true, result: levelResources(extractTasks(payload.input), payload.options as ResourceLevelingOptions) };
    }
  } catch (err) {
    return { id, success: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { id, success: false, error: "Unsupported schedule worker request." };
}

/**
 * Installs the schedule worker protocol handler in a worker global scope
 * (call it from the script you pass to {@link createScheduleWorkerClient}).
 */
export function installScheduleWorker(scope: { onmessage: unknown; postMessage: (message: unknown) => void } = globalThis as any): void {
  scope.onmessage = (event: MessageEvent) => {
    scope.postMessage(executeScheduleWorkerRequest(event.data));
  };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  request: WorkerRequest<WorkerPayload>;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Creates a ScheduleWorkerClient. With a worker `source` (a script URL or a factory; the script
 * calls {@link installScheduleWorker}), work runs in a module Web Worker; otherwise, or if the
 * worker fails, it runs asynchronously on the main thread. After `terminate()`, pending worker
 * requests reject with an `AbortError` and later calls compute on the main thread.
 */
export function createScheduleWorkerClient(
  source?: ScheduleWorkerSource,
  clientOptions: ScheduleWorkerClientOptions = {}
): ScheduleWorkerClient {
  const timeoutMs = clientOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const reportError = (message: string, cause?: unknown) => {
    if (!clientOptions.onError) return;
    const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
    clientOptions.onError(namedError("ScheduleWorkerError", detail ? `${message}: ${detail}` : message));
  };
  let worker: Worker | null = null;
  let requestIdCounter = 0;
  const pendingRequests = new Map<number, PendingRequest>();

  const runOnMainThread = (request: WorkerRequest<WorkerPayload>): Promise<any> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        const response = executeScheduleWorkerRequest(request);
        if (response.success) resolve(response.result);
        else reject(new Error(response.error || "Schedule computation failed"));
      }, 0);
    });

  const settle = (id: number): PendingRequest | undefined => {
    const pending = pendingRequests.get(id);
    if (!pending) return undefined;
    pendingRequests.delete(id);
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    return pending;
  };

  // A crashed or unusable worker is dropped; its in-flight requests finish on the main thread.
  const abandonWorker = (reason: string, cause?: unknown) => {
    if (!worker) return;
    worker.terminate();
    worker = null;
    Array.from(pendingRequests.keys()).forEach((id) => {
      const pending = settle(id);
      if (pending) runOnMainThread(pending.request).then(pending.resolve, pending.reject);
    });
    reportError(reason, cause);
  };

  if (source && typeof Worker !== "undefined") {
    try {
      worker = (typeof source === "function" ? source() : new Worker(source, { type: "module" })) || null;
    } catch (err) {
      // Not fatal: without a worker every request runs on the main thread.
      worker = null;
      reportError("Schedule worker could not be started; computing on the main thread", err);
    }
  }

  if (worker) {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (!data || typeof data.id !== "number" || typeof data.success !== "boolean") return;
      const pending = settle(data.id);
      if (!pending) return;
      if (data.success) {
        pending.resolve(data.result);
      } else {
        pending.reject(new Error(data.error || "Worker operation failed"));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      abandonWorker("Schedule worker failed; computing on the main thread", event.error ?? event.message);
    };
    worker.onmessageerror = () => abandonWorker("Schedule worker sent an unreadable message; computing on the main thread");
  }

  const dispatch = <R>(type: WorkerTaskType, payload: WorkerPayload): Promise<R> => {
    const request: WorkerRequest<WorkerPayload> = { id: ++requestIdCounter, type, payload };
    if (!worker) return runOnMainThread(request);

    const activeWorker = worker;
    return new Promise<R>((resolve, reject) => {
      const pending: PendingRequest = { resolve, reject, request };
      if (timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          if (settle(request.id)) reject(namedError("TimeoutError", `Schedule worker did not answer within ${timeoutMs} ms.`));
        }, timeoutMs);
      }
      pendingRequests.set(request.id, pending);
      try {
        activeWorker.postMessage(request);
      } catch {
        // e.g. DataCloneError: the payload cannot be sent to a worker, but it can be computed here.
        settle(request.id);
        runOnMainThread(request).then(resolve, reject);
      }
    });
  };

  return {
    resolveSchedule: (input: JanttData | Task[], options?: SchedulePipelineOptions): Promise<any> =>
      dispatch("RESOLVE_SCHEDULE", { input, options }),

    runMonteCarlo: (input: JanttData | Task[], options?: MonteCarloOptions): Promise<MonteCarloResult> =>
      dispatch("RUN_MONTE_CARLO", { input, options }),

    levelResources: (input: JanttData | Task[], options?: ResourceLevelingOptions): Promise<LevelingResult> =>
      dispatch("LEVEL_RESOURCES", { input, options }),

    terminate: () => {
      worker?.terminate();
      worker = null;
      Array.from(pendingRequests.keys()).forEach((id) => {
        settle(id)?.reject(namedError("AbortError", "Schedule worker client was terminated."));
      });
    },

    isWorkerActive: () => worker !== null
  };
}

export default createScheduleWorkerClient;
