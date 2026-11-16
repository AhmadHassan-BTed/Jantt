import { describe, it, expect, afterEach, vi } from "vitest";
import { createScheduleWorkerClient, executeScheduleWorkerRequest, installScheduleWorker } from "../src/worker";
import type { JanttData, Task } from "../src/types";

/** Minimal in-memory Worker double: records posted messages and lets tests answer or fail. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  posted: any[] = [];
  terminated = false;
  throwOnPost: Error | null = null;

  constructor(public url: string | URL, public options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }
  postMessage(message: any) {
    if (this.throwOnPost) throw this.throwOnPost;
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  /** Answers a request the way a real worker running installScheduleWorker() would. */
  respond(message: any = this.posted[this.posted.length - 1]) {
    this.onmessage?.({ data: executeScheduleWorkerRequest(message) } as MessageEvent);
  }
}

const originalWorker = (globalThis as any).Worker;
function useFakeWorker() {
  FakeWorker.instances = [];
  (globalThis as any).Worker = FakeWorker;
}

afterEach(() => {
  (globalThis as any).Worker = originalWorker;
});

describe("ScheduleWorkerClient", () => {
  const samplePlan: JanttData = {
    meta: { title: "Async Scheduling Plan" },
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-04" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-02", end: "2026-11-08", dependsOn: "t1" }
    ]
  };

  it("resolves schedule dependencies asynchronously", async () => {
    const client = createScheduleWorkerClient();
    const resolved: any = await client.resolveSchedule(samplePlan, { defaultGapDays: 1 });

    expect(resolved.tasks).toHaveLength(2);
    // t1 ends 2026-11-04, gapDays=1 -> t2 starts 2026-11-05
    expect(resolved.tasks[1].start).toBe("2026-11-05");
    client.terminate();
  });

  it("uses the plan's own gap when no option overrides it", async () => {
    const client = createScheduleWorkerClient();
    const resolved: any = await client.resolveSchedule({ ...samplePlan, meta: { defaultGapDays: 0 } });
    expect(resolved.tasks[1].start).toBe("2026-11-04");
  });

  it("honors includeCriticalPath", async () => {
    const client = createScheduleWorkerClient();
    const resolved = (await client.resolveSchedule(samplePlan.tasks, { includeCriticalPath: true })) as Task[];
    expect(resolved.every((t) => typeof t.critical === "boolean")).toBe(true);
  });

  it("executes Monte Carlo schedule simulation asynchronously", async () => {
    const client = createScheduleWorkerClient();
    const result = await client.runMonteCarlo(samplePlan, { iterations: 100 });

    expect(result.iterations).toBe(100);
    expect(result.percentiles.P50.durationDays).toBeGreaterThan(0);
    expect(result.taskCriticality.length).toBeGreaterThan(0);
    client.terminate();
  });

  it("executes resource leveling asynchronously", async () => {
    const client = createScheduleWorkerClient();
    const overAllocatedPlan: JanttData = {
      tasks: [
        { id: "a", label: "Task A", category: "dev", start: "2026-11-01", end: "2026-11-05", assignee: "Alice", priority: "urgent" },
        { id: "b", label: "Task B", category: "dev", start: "2026-11-02", end: "2026-11-04", assignee: "Alice", priority: "low" }
      ]
    };

    const result = await client.levelResources(overAllocatedPlan);
    expect(result.tasks).toHaveLength(2);
    expect(result.adjustments.length).toBeGreaterThanOrEqual(1);
    client.terminate();
  });

  it("handles termination cleanly", () => {
    const client = createScheduleWorkerClient();
    expect(typeof client.isWorkerActive()).toBe("boolean");
    expect(() => client.terminate()).not.toThrow();
  });

  it("round-trips requests through a worker created from the given URL", async () => {
    useFakeWorker();
    const client = createScheduleWorkerClient("/jantt-worker.js");
    const worker = FakeWorker.instances[0];
    expect(client.isWorkerActive()).toBe(true);
    expect(worker.options).toEqual({ type: "module" });

    const pending = client.resolveSchedule(samplePlan, { defaultGapDays: 1 });
    expect(worker.posted[0].type).toBe("RESOLVE_SCHEDULE");
    worker.respond();
    const resolved: any = await pending;
    expect(resolved.tasks[1].start).toBe("2026-11-05");
  });

  it("accepts a worker factory (the form bundlers compile)", async () => {
    useFakeWorker();
    const client = createScheduleWorkerClient(() => new FakeWorker("factory", { type: "module" }) as unknown as Worker);
    const worker = FakeWorker.instances[0];
    expect(worker.url).toBe("factory");
    expect(client.isWorkerActive()).toBe(true);

    const pending = client.resolveSchedule(samplePlan, { defaultGapDays: 1 });
    worker.respond();
    const resolved: any = await pending;
    expect(resolved.tasks[1].start).toBe("2026-11-05");
  });

  it("reports start-up failures and crashes through onError and keeps computing", async () => {
    useFakeWorker();
    const onError = vi.fn();
    const failing = createScheduleWorkerClient(
      () => {
        throw new Error("blocked by CSP");
      },
      { onError }
    );
    expect(failing.isWorkerActive()).toBe(false);
    expect(onError.mock.calls[0][0]).toMatchObject({ name: "ScheduleWorkerError" });
    expect(onError.mock.calls[0][0].message).toContain("blocked by CSP");
    const resolved: any = await failing.resolveSchedule(samplePlan, { defaultGapDays: 1 });
    expect(resolved.tasks[1].start).toBe("2026-11-05");

    const crashing = createScheduleWorkerClient("/jantt-worker.js", { onError });
    FakeWorker.instances[0].onerror?.({ preventDefault() {}, message: "Script error" });
    expect(crashing.isWorkerActive()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[1][0].message).toContain("Script error");
  });

  it("ignores malformed worker responses", async () => {
    useFakeWorker();
    const client = createScheduleWorkerClient("/jantt-worker.js", { timeoutMs: 0 });
    const worker = FakeWorker.instances[0];
    let settled = false;
    const pending = client.runMonteCarlo(samplePlan, { iterations: 10 }).finally(() => {
      settled = true;
    });

    worker.onmessage?.({ data: { id: "1", success: true } } as MessageEvent);
    worker.onmessage?.({ data: null } as MessageEvent);
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    worker.respond();
    await pending;
    expect(settled).toBe(true);
  });

  it("rejects in-flight requests when terminated", async () => {
    useFakeWorker();
    const client = createScheduleWorkerClient("/jantt-worker.js");
    const pending = client.resolveSchedule(samplePlan);
    client.terminate();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(client.isWorkerActive()).toBe(false);
  });

  it("finishes in-flight work on the main thread when the worker crashes", async () => {
    useFakeWorker();
    const client = createScheduleWorkerClient("/jantt-worker.js");
    const pending = client.resolveSchedule(samplePlan, { defaultGapDays: 1 });

    FakeWorker.instances[0].onerror?.({ preventDefault() {} });
    const resolved: any = await pending;
    expect(resolved.tasks[1].start).toBe("2026-11-05");
    expect(client.isWorkerActive()).toBe(false);
  });

  it("computes on the main thread when the payload cannot be posted", async () => {
    useFakeWorker();
    const client = createScheduleWorkerClient("/jantt-worker.js");
    FakeWorker.instances[0].throwOnPost = new Error("DataCloneError");

    const resolved: any = await client.resolveSchedule(samplePlan, { defaultGapDays: 1 });
    expect(resolved.tasks[1].start).toBe("2026-11-05");
  });

  it("times out requests the worker never answers", async () => {
    useFakeWorker();
    const client = createScheduleWorkerClient("/jantt-worker.js", { timeoutMs: 10 });
    await expect(client.resolveSchedule(samplePlan)).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("Schedule worker protocol", () => {
  it("rejects malformed requests without throwing", () => {
    expect(executeScheduleWorkerRequest(null)).toMatchObject({ success: false });
    expect(executeScheduleWorkerRequest({ id: 1, type: "DROP_TABLES", payload: { input: [] } })).toMatchObject({ id: 1, success: false });
    expect(executeScheduleWorkerRequest({ id: 2, type: "RESOLVE_SCHEDULE" })).toMatchObject({ id: 2, success: false });
  });

  it("installScheduleWorker answers every message with a response", () => {
    const sent: any[] = [];
    const scope = { onmessage: null as any, postMessage: (m: unknown) => sent.push(m) };
    installScheduleWorker(scope);

    scope.onmessage({ data: { id: 5, type: "RESOLVE_SCHEDULE", payload: { input: [] } } });
    expect(sent).toEqual([{ id: 5, success: true, result: [] }]);
  });
});
