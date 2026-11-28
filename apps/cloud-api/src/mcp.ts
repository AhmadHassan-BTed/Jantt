import {
  addPlanTask,
  auditAccountPlan,
  createAccountPlan,
  deleteAccountPlan,
  deletePlanTask,
  exportAccountPlanCsv,
  getAccountPlan,
  inspectAccountPlan,
  listAccountPlans,
  replaceAccountPlan,
  updatePlanTask
} from "./plans";
import type { RtdbClient } from "./rtdb";
import type { AuthenticatedApiAccount } from "./types";

const SERVER_VERSION = "1.1.0";
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcId = string | number | null;

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const requireString = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Missing required string argument '${key}'.`);
  }
  return v.trim();
};

export const CLOUD_MCP_TOOLS = [
  {
    name: "jantt_cloud_list_plans",
    description:
      "Lists all Jantt cloud plans accessible to the authenticated account (owned rooms and shared rooms) with roomId, title, role (owner/editor/viewer), taskCount, revision, and updatedAt.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "jantt_cloud_get_plan",
    description:
      "Fetches a Jantt cloud plan by roomId, returning room metadata, caller permissions, and the full JanttData plan JSON.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Cloud room ID from jantt_cloud_list_plans" }
      },
      required: ["roomId"]
    }
  },
  {
    name: "jantt_cloud_create_plan",
    description:
      "Creates a new Jantt cloud plan owned by the authenticated account and saves it live to Firebase. Returns the new roomId and plan.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title for the new cloud room" },
        plan: { type: "object", description: "Optional initial JanttData object (defaults to an empty valid plan)" }
      },
      required: ["title"]
    }
  },
  {
    name: "jantt_cloud_delete_plan",
    description: "Permanently deletes an owned Jantt cloud plan and removes it from all shared members' lists (owner only).",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Cloud room ID to delete" }
      },
      required: ["roomId"]
    }
  },
  {
    name: "jantt_cloud_add_task",
    description:
      "Adds a new task to a cloud plan, validates it against the schema and dependency graph, resolves dependency cascades, and saves it live so open browsers update immediately.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Target cloud room ID" },
        task: {
          type: "object",
          description: "Task object to insert",
          properties: {
            id: { type: "string", description: "Unique task id" },
            label: { type: "string" },
            name: { type: "string" },
            category: { type: "string", description: "Key in the plan's categories map" },
            start: { type: "string", description: "YYYY-MM-DD (or YYYY-MM-DDTHH:MM)" },
            end: { type: "string", description: "YYYY-MM-DD (or YYYY-MM-DDTHH:MM), on or after start" },
            dependsOn: { description: "Prerequisite task id, shorthand (e.g. 't1:SS+2d'), or array" },
            assignee: { type: "string" },
            progress: { type: "number", description: "0.0 to 1.0" },
            status: { type: "string" },
            priority: { type: "string" },
            milestone: { type: "boolean" }
          },
          required: ["id", "category", "start", "end"]
        },
        resolveCascade: { type: "boolean", description: "Resolve downstream dependency cascades (default true)" }
      },
      required: ["roomId", "task"]
    }
  },
  {
    name: "jantt_cloud_update_task",
    description:
      "Updates fields and/or reschedules an existing task in a cloud plan, resolves dependency cascades when dates or dependencies change, and saves live to Firebase.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Target cloud room ID" },
        taskId: { type: "string", description: "ID of task to update" },
        patch: {
          type: "object",
          description: "Fields to update on the task (label, start, end, category, assignee, progress, status, priority, dependsOn, milestone, locked, estimatedCost, actualCost, notes). Pass null to clear optional fields."
        },
        resolveCascade: { type: "boolean", description: "Resolve downstream dependency cascades when dates/deps change (default true)" }
      },
      required: ["roomId", "taskId", "patch"]
    }
  },
  {
    name: "jantt_cloud_delete_task",
    description:
      "Deletes a task from a cloud plan (sync-safe soft tombstone so live browser collaborators stay consistent) and cleans up dangling dependsOn links by default.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Target cloud room ID" },
        taskId: { type: "string", description: "ID of task to delete" },
        cleanupDependencies: { type: "boolean", description: "Remove deleted task from other tasks' dependsOn (default true)" }
      },
      required: ["roomId", "taskId"]
    }
  },
  {
    name: "jantt_cloud_replace_plan",
    description:
      "Replaces the full JanttData JSON of an existing cloud plan (owner/editor). Validates schema and preserves sync tombstones.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Target cloud room ID" },
        plan: { type: "object", description: "Complete JanttData JSON object" },
        title: { type: "string", description: "Optional new room title" },
        expectedRevision: { type: "number", description: "Optional optimistic concurrency revision guard" }
      },
      required: ["roomId", "plan"]
    }
  },
  {
    name: "jantt_cloud_inspect_plan",
    description:
      "Summarizes a cloud plan: validation errors, live task count, date span, critical path task IDs, early finish, categories, and workload per assignee.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Cloud room ID" },
        targetDate: { type: "string", description: "Optional deadline YYYY-MM-DD" }
      },
      required: ["roomId"]
    }
  },
  {
    name: "jantt_cloud_audit_schedule",
    description:
      "Audits schedule health of a cloud plan with selected DCMA checks (missing logic, leads, lags, hard constraints, high/negative float, high duration, broken links).",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Cloud room ID" },
        targetDate: { type: "string", description: "Optional deadline YYYY-MM-DD for negative-float check" }
      },
      required: ["roomId"]
    }
  },
  {
    name: "jantt_cloud_export_csv",
    description: "Exports a cloud plan as an RFC-4180 CSV spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Cloud room ID" }
      },
      required: ["roomId"]
    }
  }
];

async function executeCloudMcpTool(
  name: string,
  args: Record<string, unknown>,
  account: AuthenticatedApiAccount,
  rtdb: RtdbClient,
  nowMs: number
): Promise<unknown> {
  switch (name) {
    case "jantt_cloud_list_plans":
      return { plans: await listAccountPlans(account.uid, rtdb) };

    case "jantt_cloud_get_plan":
      return await getAccountPlan(account.uid, requireString(args, "roomId"), rtdb);

    case "jantt_cloud_create_plan":
      return await createAccountPlan(account.uid, { title: args.title, plan: args.plan }, rtdb, nowMs);

    case "jantt_cloud_delete_plan":
      return await deleteAccountPlan(account.uid, requireString(args, "roomId"), rtdb);

    case "jantt_cloud_add_task":
      return await addPlanTask(
        account.uid,
        requireString(args, "roomId"),
        args.task,
        rtdb,
        { resolveCascade: args.resolveCascade !== false },
        nowMs
      );

    case "jantt_cloud_update_task": {
      const patch = asObject(args.patch);
      if (!patch) {
        throw new Error("Argument 'patch' must be an object of task fields to update.");
      }
      return await updatePlanTask(
        account.uid,
        requireString(args, "roomId"),
        requireString(args, "taskId"),
        patch,
        rtdb,
        { resolveCascade: args.resolveCascade !== false },
        nowMs
      );
    }

    case "jantt_cloud_delete_task":
      return await deletePlanTask(
        account.uid,
        requireString(args, "roomId"),
        requireString(args, "taskId"),
        rtdb,
        { cleanupDependencies: args.cleanupDependencies !== false },
        nowMs
      );

    case "jantt_cloud_replace_plan":
      return await replaceAccountPlan(
        account.uid,
        requireString(args, "roomId"),
        {
          plan: args.plan,
          title: args.title,
          expectedRevision: args.expectedRevision
        },
        rtdb,
        nowMs
      );

    case "jantt_cloud_inspect_plan":
      return await inspectAccountPlan(account.uid, requireString(args, "roomId"), args.targetDate, rtdb);

    case "jantt_cloud_audit_schedule":
      return await auditAccountPlan(account.uid, requireString(args, "roomId"), args.targetDate, rtdb);

    case "jantt_cloud_export_csv":
      return { csv: await exportAccountPlanCsv(account.uid, requireString(args, "roomId"), rtdb) };

    default:
      throw new Error(`Unknown Jantt Cloud MCP tool: ${name}`);
  }
}

async function handleSingleRpcMessage(
  message: unknown,
  account: AuthenticatedApiAccount,
  rtdb: RtdbClient,
  nowMs: number
): Promise<object | undefined> {
  const msg = asObject(message);
  if (!msg) {
    return rpcError(null, INVALID_REQUEST, "Invalid Request: expected a JSON-RPC 2.0 object.");
  }

  const id: JsonRpcId = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
  const isNotification = !("id" in msg);

  if (typeof msg.method !== "string") {
    if ("result" in msg || "error" in msg) return undefined;
    return rpcError(id, INVALID_REQUEST, "Invalid Request: missing 'method'.");
  }
  if (isNotification) return undefined;
  if (msg.jsonrpc !== "2.0") {
    return rpcError(id, INVALID_REQUEST, "Invalid Request: 'jsonrpc' must be \"2.0\".");
  }

  try {
    switch (msg.method) {
      case "initialize": {
        const requested = asObject(msg.params)?.protocolVersion;
        const protocolVersion =
          typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : SUPPORTED_PROTOCOL_VERSIONS[0];
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "jantt-cloud-mcp", version: SERVER_VERSION }
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: CLOUD_MCP_TOOLS });
      case "tools/call": {
        const p = asObject(msg.params) ?? {};
        const name = p.name;
        if (typeof name !== "string" || !CLOUD_MCP_TOOLS.some((t) => t.name === name)) {
          return rpcError(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`);
        }
        try {
          const output = await executeCloudMcpTool(name, asObject(p.arguments) ?? {}, account, rtdb, nowMs);
          return rpcResult(id, {
            content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output, null, 2) }]
          });
        } catch (err) {
          return rpcResult(id, {
            content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            isError: true
          });
        }
      }
      default:
        return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    return rpcError(id, INTERNAL_ERROR, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handleMcpPayload(
  payload: unknown,
  account: AuthenticatedApiAccount,
  rtdb: RtdbClient,
  nowMs: number = Date.now()
): Promise<{ status: number; body: unknown | null }> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { status: 400, body: rpcError(null, INVALID_REQUEST, "Invalid Request: empty batch.") };
    }
    const responses = (
      await Promise.all(payload.map((item) => handleSingleRpcMessage(item, account, rtdb, nowMs)))
    ).filter((item) => item !== undefined);
    if (responses.length === 0) return { status: 202, body: null };
    return { status: 200, body: responses };
  }

  const response = await handleSingleRpcMessage(payload, account, rtdb, nowMs);
  if (response === undefined) return { status: 202, body: null };
  return { status: 200, body: response };
}

