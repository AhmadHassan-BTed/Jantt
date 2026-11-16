import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_TOOLS, executeTool, startMcpServer } from "../src/index";
import basicJson from "../../../examples/basic.json";

const packageVersion = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf-8")
).version;

const planJson = JSON.stringify(basicJson);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("@jantt/mcp Model Context Protocol Server", () => {
  it("exposes all 6 standard timeline MCP tools", () => {
    expect(MCP_TOOLS).toHaveLength(6);
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("jantt_inspect_plan");
    expect(names).toContain("jantt_add_task");
    expect(names).toContain("jantt_reschedule_task");
    expect(names).toContain("jantt_audit_schedule");
    expect(names).toContain("jantt_diff_plans");
    expect(names).toContain("jantt_export_csv");
  });

  describe("argument handling", () => {
    it("explains a missing plan", () => {
      expect(() => executeTool("jantt_inspect_plan", {})).toThrow(/Missing required argument 'planJson'/);
    });

    it("explains malformed JSON", () => {
      expect(() => executeTool("jantt_audit_schedule", { planJson: "{ not json" })).toThrow(/not valid JSON/);
    });

    it("rejects non-object plans", () => {
      expect(() => executeTool("jantt_inspect_plan", { planJson: "[1,2]" })).toThrow(/must be a Jantt plan object/);
    });

    it("rejects modifications to plans without a tasks array", () => {
      expect(() => executeTool("jantt_add_task", { planJson: "{}", task: { id: "x" } })).toThrow(/no 'tasks' array/);
    });
  });

  describe("jantt_inspect_plan", () => {
    it("inspects plan JSON and returns critical path and metrics", () => {
      const res = executeTool("jantt_inspect_plan", { planJson }) as any;
      expect(res.valid).toBe(true);
      expect(res.summary.totalTasks).toBe(basicJson.tasks.length);
      expect(res.summary.criticalPathLength).toBeGreaterThan(0);
    });

    it("reports the date span, duration and workload it promises", () => {
      const res = executeTool("jantt_inspect_plan", { planJson }) as any;
      const starts = basicJson.tasks.map((t) => t.start).sort();
      const ends = basicJson.tasks.map((t) => t.end).sort();
      expect(res.summary.startDate).toBe(starts[0]);
      expect(res.summary.finishDate).toBe(ends[ends.length - 1]);
      expect(res.summary.durationDays).toBeGreaterThan(0);
      const workloadCount = res.summary.workload.reduce((sum: number, w: { taskCount: number }) => sum + w.taskCount, 0);
      expect(workloadCount).toBe(basicJson.tasks.length);
    });

    it("returns structured validation errors and ignores tombstones", () => {
      const plan = clone(basicJson) as any;
      plan.tasks[0].end = "2020-01-01";
      plan.tasks.push({ id: "ghost", category: "arch", start: "2026-09-01", end: "2026-09-02", _deleted: true });
      const res = executeTool("jantt_inspect_plan", { planJson: JSON.stringify(plan) }) as any;
      expect(res.valid).toBe(false);
      expect(res.validationErrors[0]).toMatchObject({ code: "INVALID_DATE_RANGE", path: "tasks[0].end" });
      expect(res.summary.totalTasks).toBe(basicJson.tasks.length);
    });
  });

  describe("jantt_add_task", () => {
    it("adds a task and dynamically recalculates downstream schedule", () => {
      const newTask = {
        id: "new-deploy",
        label: "Production Deployment",
        category: "deploy",
        start: "2026-09-01",
        end: "2026-09-05",
        dependsOn: "core-api:FS+2d"
      };

      const res = executeTool("jantt_add_task", { planJson, task: newTask }) as any;

      expect(res.success).toBe(true);
      expect(res.addedTaskId).toBe("new-deploy");
      const found = res.plan.tasks.find((t: any) => t.id === "new-deploy");
      expect(found).toBeDefined();
      expect(found.start).toBe(res.appliedStart);
      expect(res.adjustedByDependencies).toBe(true);
    });

    it("refuses to overwrite an existing task id", () => {
      const existing = basicJson.tasks[1];
      expect(() =>
        executeTool("jantt_add_task", { planJson, task: { ...existing, label: "Clobbered" } })
      ).toThrow(/already exists/);
    });

    it("explains an id collision with a soft-deleted tombstone", () => {
      const plan = clone(basicJson) as any;
      plan.tasks.push({ id: "ghost", category: "arch", start: "2026-09-01", end: "2026-09-02", _deleted: true });
      expect(() =>
        executeTool("jantt_add_task", {
          planJson: JSON.stringify(plan),
          task: { id: "ghost", category: "arch", start: "2026-09-01", end: "2026-09-02" }
        })
      ).toThrow(/deleted task/);
    });

    it("refuses invalid tasks and reports why", () => {
      expect(() =>
        executeTool("jantt_add_task", {
          planJson,
          task: { id: "bad", category: "deploy", start: "2026-13-40", end: "2026-09-05" }
        })
      ).toThrow(/INVALID_DATE_FORMAT/);
      expect(() =>
        executeTool("jantt_add_task", {
          planJson,
          task: { id: "lost", category: "deploy", start: "2026-09-01", end: "2026-09-05", dependsOn: "nope" }
        })
      ).toThrow(/DANGLING_DEPENDENCY/);
      expect(() => executeTool("jantt_add_task", { planJson, task: "t9" })).toThrow(/must be a task object/);
    });

    it("refuses a task that closes a dependency cycle", () => {
      const plan = {
        categories: { general: { label: "General", color: "#3B82F6" } },
        tasks: [{ id: "a", category: "general", start: "2026-01-01", end: "2026-01-02", dependsOn: "b" }]
      };
      expect(() =>
        executeTool("jantt_add_task", {
          planJson: JSON.stringify(plan),
          task: { id: "b", category: "general", start: "2026-01-03", end: "2026-01-04", dependsOn: "a" }
        })
      ).toThrow(/CIRCULAR_DEPENDENCY/);
    });
  });

  describe("jantt_reschedule_task", () => {
    it("shifts task dates and propagates downstream dependencies", () => {
      const res = executeTool("jantt_reschedule_task", {
        planJson,
        taskId: basicJson.tasks[0].id,
        newStart: "2026-10-01",
        newEnd: "2026-10-10"
      }) as any;

      expect(res.success).toBe(true);
      expect(res.rescheduledTaskId).toBe(basicJson.tasks[0].id);
      const rescheduled = res.plan.tasks.find((t: any) => t.id === basicJson.tasks[0].id);
      expect(rescheduled.start).toBe("2026-10-01");
      expect(rescheduled.end).toBe("2026-10-10");
      expect(res.adjustedByDependencies).toBe(false);
      expect(res.movedTaskIds.length).toBeGreaterThan(0);
    });

    it("reports when dependencies override the requested dates", () => {
      const dependent = basicJson.tasks.find((t: any) => t.dependsOn) as any;
      const res = executeTool("jantt_reschedule_task", {
        planJson,
        taskId: dependent.id,
        newStart: "2026-01-01",
        newEnd: "2026-01-05"
      }) as any;
      expect(res.adjustedByDependencies).toBe(true);
      expect(res.appliedStart).not.toBe("2026-01-01");
      expect(res.requestedStart).toBe("2026-01-01");
    });

    it("fails for unknown tasks and invalid dates", () => {
      expect(() =>
        executeTool("jantt_reschedule_task", { planJson, taskId: "missing", newStart: "2026-10-01", newEnd: "2026-10-02" })
      ).toThrow(/No task with id 'missing'/);
      expect(() =>
        executeTool("jantt_reschedule_task", { planJson, taskId: basicJson.tasks[0].id, newStart: "tomorrow", newEnd: "2026-10-02" })
      ).toThrow(/YYYY-MM-DD/);
      expect(() =>
        executeTool("jantt_reschedule_task", { planJson, taskId: basicJson.tasks[0].id, newStart: "2026-10-05", newEnd: "2026-10-01" })
      ).toThrow(/on or after newStart/);
      // The value is written into the plan, so anything but a bare day is refused.
      expect(() =>
        executeTool("jantt_reschedule_task", { planJson, taskId: basicJson.tasks[0].id, newStart: "2026-10-01Tjunk", newEnd: "2026-10-02" })
      ).toThrow(/YYYY-MM-DD/);
    });
  });

  describe("jantt_audit_schedule", () => {
    it("runs schedule health checks and explains every deduction", () => {
      const res = executeTool("jantt_audit_schedule", { planJson }) as any;
      expect(res.valid).toBe(true);
      expect(res.integrityScore).toBeGreaterThanOrEqual(0);
      expect(res.integrityScore).toBeLessThanOrEqual(100);
      expect(res.metrics.totalTasks).toBe(basicJson.tasks.length);
      expect(res.metrics.negativeFloatChecked).toBe(false);
      expect(res.workingDays).toBe(false);
      expect(res.checks.length).toBeGreaterThan(0);
      const deducted = res.checks.reduce((sum: number, c: { penalty: number }) => sum + c.penalty, 0);
      expect(res.integrityScore).toBe(Math.max(0, Math.round(100 - deducted)));
      expect(MCP_TOOLS.find((t) => t.name === "jantt_audit_schedule")!.description).not.toContain("DCMA-14");
    });

    it("measures duration in working days when the plan uses a working calendar", () => {
      const highDurationFailures = (edit: (plan: any) => void) => {
        const plan = clone(basicJson) as any;
        // 60 calendar days: ~43 working days at 5/7, but 60 on a seven-day calendar (DCMA limit 44).
        plan.tasks.push({ id: "long-haul", category: "arch", start: "2026-09-01", end: "2026-10-31" });
        edit(plan);
        const res = executeTool("jantt_audit_schedule", { planJson: JSON.stringify(plan) }) as any;
        return [res.workingDays, res.checks.find((c: { id: string }) => c.id === "high-duration").failed];
      };
      expect(highDurationFailures(() => undefined)).toEqual([false, 0]);
      expect(highDurationFailures((p) => (p.meta.calendar = "continuous"))).toEqual([true, 1]);
      expect(
        highDurationFailures((p) => {
          p.calendars = { site: { workingDays: [0, 1, 2, 3, 4, 5, 6] } };
          p.meta.calendar = "site";
        })
      ).toEqual([true, 1]);
      expect(
        highDurationFailures((p) => {
          p.meta.calendar = "continuous";
          p.meta.useWorkingDays = false;
        })
      ).toEqual([false, 0]);
    });

    it("detects negative float against a target date", () => {
      const res = executeTool("jantt_audit_schedule", { planJson, targetDate: "2026-09-05" }) as any;
      expect(res.targetDate).toBe("2026-09-05");
      expect(res.metrics.negativeFloatChecked).toBe(true);
      expect(res.metrics.negativeFloat).toBeGreaterThan(0);
    });

    it("rejects an invalid target date", () => {
      expect(() => executeTool("jantt_audit_schedule", { planJson, targetDate: "soon" })).toThrow(/targetDate/);
      const plan = clone(basicJson) as any;
      plan.meta = { ...plan.meta, targetDate: "soon" };
      expect(() => executeTool("jantt_audit_schedule", { planJson: JSON.stringify(plan) })).toThrow(/meta\.targetDate/);
    });
  });

  describe("jantt_export_csv", () => {
    it("exports plan to valid CSV string", () => {
      const res = executeTool("jantt_export_csv", { planJson }) as any;
      expect(res.csv).toBeDefined();
      expect(res.csv).toContain("Task ID,WBS,Label / Name,Category");
    });

    it("skips tombstones and malformed entries", () => {
      const plan = clone(basicJson) as any;
      plan.tasks.push(null, { id: "ghost-row", category: "arch", start: "2026-09-01", end: "2026-09-02", _deleted: true });
      const res = executeTool("jantt_export_csv", { planJson: JSON.stringify(plan) }) as any;
      expect(res.csv).not.toContain("ghost-row");
    });
  });

  describe("jantt_diff_plans", () => {
    it("compares two versions and returns summary metrics", () => {
      const updated = {
        ...basicJson,
        tasks: [
          ...basicJson.tasks,
          { id: "extra-1", label: "Extra Task", category: "dev", start: "2026-09-01", end: "2026-09-03" }
        ]
      };

      const res = executeTool("jantt_diff_plans", {
        basePlanJson: planJson,
        updatedPlanJson: JSON.stringify(updated)
      }) as any;

      expect(res.summary.tasksAdded).toBe(1);
      expect(res.addedTaskIds).toContain("extra-1");
    });

    it("treats tombstoned tasks as deleted and reports field changes and slips", () => {
      const updated = clone(basicJson) as any;
      updated.tasks[0]._deleted = true;
      updated.tasks[1].assignee = "Dana";
      const lastIndex = updated.tasks.length - 1;
      const originalEnd = updated.tasks[lastIndex].end;
      updated.tasks[lastIndex].end = "2026-12-31";

      const res = executeTool("jantt_diff_plans", { basePlanJson: planJson, updatedPlanJson: JSON.stringify(updated) }) as any;

      expect(res.deletedTaskIds).toEqual([basicJson.tasks[0].id]);
      expect(res.changes).toContainEqual({ id: updated.tasks[1].id, field: "assignee", from: null, to: "Dana" });
      expect(res.changes).toContainEqual({ id: updated.tasks[lastIndex].id, field: "end", from: originalEnd, to: "2026-12-31" });
      const slip = res.slips.find((s: { id: string }) => s.id === updated.tasks[lastIndex].id);
      expect(slip.endSlipDays).toBeGreaterThan(0);
      expect(res.summary.projectFinishSlipDays).toBeGreaterThan(0);
    });
  });
});

// -----------------------------------------------------------------------------
// stdio JSON-RPC protocol
// -----------------------------------------------------------------------------
async function converse(lines: string[]): Promise<any[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const rl = startMcpServer(input, output);
  const responses: any[] = [];
  let buffer = "";

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for responses")), 5000);
    output.on("data", (chunk) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const parsed = JSON.parse(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        responses.push(parsed);
        if (!Array.isArray(parsed) && parsed.id === "__end__") {
          clearTimeout(timer);
          resolve();
        }
      }
    });
  });

  for (const line of lines) input.write(`${line}\n`);
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: "__end__", method: "ping" })}\n`);
  await done;
  rl.close();
  return responses.slice(0, -1);
}

const rpc = (id: unknown, method: string, params?: unknown) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const notify = (method: string) => JSON.stringify({ jsonrpc: "2.0", method });

describe("startMcpServer (stdio transport)", () => {
  it("negotiates the protocol version and reports the package version", async () => {
    const [legacy, unknown] = await converse([
      rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } }),
      rpc(2, "initialize", { protocolVersion: "1999-01-01" })
    ]);
    expect(legacy.result.protocolVersion).toBe("2024-11-05");
    expect(legacy.result.serverInfo).toEqual({ name: "jantt-mcp", version: packageVersion });
    expect(unknown.result.protocolVersion).toBe("2025-06-18");
  });

  it("never answers notifications and answers ping with an empty result", async () => {
    const responses = await converse([
      notify("notifications/initialized"),
      notify("notifications/cancelled"),
      notify("notifications/roots/list_changed"),
      rpc(7, "ping")
    ]);
    expect(responses).toEqual([{ jsonrpc: "2.0", id: 7, result: {} }]);
  });

  it("lists tools", async () => {
    const [res] = await converse([rpc("list", "tools/list")]);
    expect(res.result.tools).toHaveLength(6);
  });

  it("uses spec error codes for parse errors, invalid requests and unknown methods", async () => {
    const [parse, invalid, unknownMethod] = await converse(["{ broken", "42", rpc(3, "resources/list")]);
    expect(parse).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: expect.any(String) } });
    expect(invalid.error.code).toBe(-32600);
    expect(unknownMethod).toMatchObject({ id: 3, error: { code: -32601 } });
  });

  it("returns tool failures as isError results and unknown tools as invalid params", async () => {
    const [failed, unknownTool, ok] = await converse([
      rpc(4, "tools/call", { name: "jantt_inspect_plan", arguments: { planJson: "{ nope" } }),
      rpc(5, "tools/call", { name: "jantt_does_not_exist", arguments: {} }),
      rpc(6, "tools/call", { name: "jantt_inspect_plan", arguments: { planJson } })
    ]);
    expect(failed.result.isError).toBe(true);
    expect(failed.result.content[0].text).toContain("not valid JSON");
    expect(failed.error).toBeUndefined();
    expect(unknownTool.error.code).toBe(-32602);
    expect(ok.result.isError).toBeUndefined();
    expect(JSON.parse(ok.result.content[0].text).summary.totalTasks).toBe(basicJson.tasks.length);
  });

  it("answers batches without responding to their notifications", async () => {
    const [batch] = await converse([`[${rpc(8, "ping")},${notify("notifications/initialized")}]`]);
    expect(batch).toEqual([{ jsonrpc: "2.0", id: 8, result: {} }]);
  });
});
