import {
  MCP_SERVER_INSTRUCTIONS,
  getAgentSystemPrompt,
  getHelpPayload,
  getJanttCheatsheet,
  getJanttSchema,
  getMasterTemplate,
  getStarterTemplate,
  type GuideTopic,
  type PromptMode
} from "./guides";
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
  updatePlanTask,
  validatePlanPayload
} from "./plans";
import type { RtdbClient } from "./rtdb";
import type { AuthenticatedApiAccount } from "./types";

const SERVER_VERSION = "1.2.0";
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_ORIGIN = "https://jantt-cloud-api.ahmadhassan-bted.workers.dev";

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

function parsePromptMode(value: unknown): PromptMode {
  if (value === "create" || value === "modify") return value;
  return "all";
}

export const CLOUD_MCP_RESOURCES = [
  {
    uri: "jantt://cheatsheet",
    name: "Jantt JSON Cheatsheet & Gotchas",
    description:
      "Token-efficient reference for Jantt JSON syntax, dependencies, working calendars, milestones, and common validation gotchas.",
    mimeType: "text/markdown"
  },
  {
    uri: "jantt://system-prompt",
    name: "Jantt Cloud Editing System Prompt",
    description:
      "Authoritative AI agent instructions, safe cloud-modification protocol, and negative constraints for creating/editing Jantt plans.",
    mimeType: "text/markdown"
  },
  {
    uri: "jantt://schema",
    name: "Jantt JSON Schema (v1)",
    description: "Official JSON Schema definition for JanttData plan documents.",
    mimeType: "application/schema+json"
  },
  {
    uri: "jantt://template/starter",
    name: "Jantt Minimal Starter Template",
    description: "Minimal valid 3-item Jantt JSON starter template ready to customize.",
    mimeType: "application/json"
  },
  {
    uri: "jantt://template/master",
    name: "Jantt Master Feature Template",
    description: "Comprehensive Jantt JSON template showcasing WBS, baselines, costs, PERT, notes, people, teams, and dependencies.",
    mimeType: "application/json"
  }
] as const;

export const CLOUD_MCP_PROMPTS = [
  {
    name: "jantt_modify_plan",
    description:
      "System instructions and safe workflow for inspecting and surgically modifying an existing Firebase-synced Jantt Cloud plan.",
    arguments: [
      {
        name: "roomId",
        description: "Optional cloud room ID to focus on",
        required: false
      }
    ]
  },
  {
    name: "jantt_create_plan",
    description:
      "System instructions, Jantt JSON cheatsheet, and validation workflow for designing and creating a new Jantt Cloud plan from scratch.",
    arguments: [
      {
        name: "goal",
        description: "Optional description of the project or timeline to plan",
        required: false
      }
    ]
  }
] as const;

export const CLOUD_MCP_TOOLS = [
  {
    name: "jantt_cloud_get_guide",
    description:
      "Fetches official Jantt authoring documentation directly from the server: 'cheatsheet' (JSON syntax & gotchas), 'prompt' (AI editing system prompt & rules), 'schema' (formal JSON Schema v1), 'template' (minimal valid starter JSON), 'master-template' (full feature showcase JSON), or 'help' (full endpoint & validation guide).",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["cheatsheet", "prompt", "schema", "template", "master-template", "help"],
          description: "Which guide artifact to fetch (default: 'cheatsheet')"
        },
        mode: {
          type: "string",
          enum: ["all", "create", "modify"],
          description: "Optional prompt focus when topic='prompt' (default: 'all')"
        }
      }
    }
  },
  {
    name: "jantt_cloud_validate_plan",
    description:
      "Dry-run validates a Jantt plan JSON object against the exact entrance gate rules (syntax, dates, categories, dependencies, cycles, scalar types, and task limits) WITHOUT writing to Firebase. Returns valid, strictValid, errors, and warnings with self-correction hints.",
    inputSchema: {
      type: "object",
      properties: {
        plan: { type: "object", description: "Complete JanttData JSON object to validate" },
        strict: { type: "boolean", description: "If true, treat non-blocking warnings as errors too (default: false)" }
      },
      required: ["plan"]
    }
  },
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
      "Creates a new Jantt cloud plan owned by the authenticated account, validates it against Jantt syntax rules, and saves it live to Firebase. Returns the new roomId and plan.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title for the new cloud room" },
        plan: { type: "object", description: "Optional initial JanttData object (defaults to an empty valid plan)" },
        strict: { type: "boolean", description: "Reject non-blocking validation warnings too (default: false)" }
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
      "Adds a new task to a cloud plan, validates it against the schema and dependency graph, resolves dependency cascades (honoring working calendars), and saves it live so open browsers update immediately.",
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
          description:
            "Fields to update on the task (label, start, end, category, assignee, progress, status, priority, dependsOn, gapDays, milestone, locked, urgent, wbs, phase, pert, estimatedCost, actualCost, color, notes, description, baseline, fields). Pass null to clear optional fields."
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
      "Replaces the full JanttData JSON of an existing cloud plan (owner/editor). Enforces strict syntax/schema validation and preserves sync tombstones.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string", description: "Target cloud room ID" },
        plan: { type: "object", description: "Complete JanttData JSON object" },
        title: { type: "string", description: "Optional new room title" },
        expectedRevision: { type: "number", description: "Optional optimistic concurrency revision guard" },
        strict: { type: "boolean", description: "Reject non-blocking validation warnings too (default: false)" }
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

function readMcpResource(uri: string, baseUrl: string): { uri: string; mimeType: string; text: string } | null {
  switch (uri) {
    case "jantt://cheatsheet":
      return { uri, mimeType: "text/markdown", text: getJanttCheatsheet(baseUrl) };
    case "jantt://system-prompt":
      return { uri, mimeType: "text/markdown", text: getAgentSystemPrompt(baseUrl, "all") };
    case "jantt://schema":
      return { uri, mimeType: "application/schema+json", text: JSON.stringify(getJanttSchema(), null, 2) };
    case "jantt://template/starter":
      return { uri, mimeType: "application/json", text: JSON.stringify(getStarterTemplate(), null, 2) };
    case "jantt://template/master":
      return { uri, mimeType: "application/json", text: JSON.stringify(getMasterTemplate(), null, 2) };
    default:
      return null;
  }
}

function getMcpPromptResult(name: string, args: Record<string, unknown>, baseUrl: string) {
  if (name === "jantt_modify_plan") {
    const roomId = typeof args.roomId === "string" && args.roomId.trim() ? args.roomId.trim() : null;
    const suffix = roomId
      ? `\n\nTarget cloud roomId: \`${roomId}\`. Start by calling \`jantt_cloud_get_plan({ roomId: "${roomId}" })\`.`
      : "\n\nStart by calling `jantt_cloud_list_plans` to inspect the user's cloud plans and roles.";
    return {
      description: "Instructions and strict syntax rules for modifying an existing Jantt Cloud plan.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${getAgentSystemPrompt(baseUrl, "modify")}${suffix}`
          }
        }
      ]
    };
  }
  if (name === "jantt_create_plan") {
    const goal = typeof args.goal === "string" && args.goal.trim() ? args.goal.trim() : null;
    const suffix = goal ? `\n\nProject goal to schedule:\n${goal}` : "";
    return {
      description: "Instructions, Jantt JSON cheatsheet, and validation workflow for creating a new Jantt Cloud plan.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${getAgentSystemPrompt(baseUrl, "create")}\n\n---\n\n${getJanttCheatsheet(baseUrl)}${suffix}`
          }
        }
      ]
    };
  }
  return null;
}

async function executeCloudMcpTool(
  name: string,
  args: Record<string, unknown>,
  account: AuthenticatedApiAccount,
  rtdb: RtdbClient,
  nowMs: number,
  baseUrl: string
): Promise<unknown> {
  switch (name) {
    case "jantt_cloud_get_guide": {
      const topic = (typeof args.topic === "string" ? args.topic.trim().toLowerCase() : "cheatsheet") as GuideTopic;
      switch (topic) {
        case "cheatsheet":
          return getJanttCheatsheet(baseUrl);
        case "prompt":
          return getAgentSystemPrompt(baseUrl, parsePromptMode(args.mode));
        case "schema":
          return getJanttSchema();
        case "template":
          return getStarterTemplate();
        case "master-template":
          return getMasterTemplate();
        case "help":
          return getHelpPayload(baseUrl);
        default:
          throw new Error(
            `Unknown guide topic '${String(args.topic)}'. Expected one of: cheatsheet, prompt, schema, template, master-template, help.`
          );
      }
    }

    case "jantt_cloud_validate_plan": {
      if (!args.plan || typeof args.plan !== "object" || Array.isArray(args.plan)) {
        throw new Error("Argument 'plan' must be a JanttData JSON object.");
      }
      return validatePlanPayload(args.plan, { strict: args.strict === true });
    }

    case "jantt_cloud_list_plans":
      return { plans: await listAccountPlans(account.uid, rtdb) };

    case "jantt_cloud_get_plan":
      return await getAccountPlan(account.uid, requireString(args, "roomId"), rtdb);

    case "jantt_cloud_create_plan":
      return await createAccountPlan(
        account.uid,
        { title: args.title, plan: args.plan, strict: args.strict === true },
        rtdb,
        nowMs
      );

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
          expectedRevision: args.expectedRevision,
          strict: args.strict === true
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
  nowMs: number,
  baseUrl: string
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
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: { name: "jantt-cloud-mcp", version: SERVER_VERSION },
          instructions: MCP_SERVER_INSTRUCTIONS
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
          const output = await executeCloudMcpTool(name, asObject(p.arguments) ?? {}, account, rtdb, nowMs, baseUrl);
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
      case "resources/list":
        return rpcResult(id, { resources: CLOUD_MCP_RESOURCES });
      case "resources/read": {
        const p = asObject(msg.params) ?? {};
        const uri = typeof p.uri === "string" ? p.uri.trim() : "";
        const content = readMcpResource(uri, baseUrl);
        if (!content) {
          return rpcError(id, INVALID_PARAMS, `Unknown resource URI: ${String(p.uri)}`);
        }
        return rpcResult(id, { contents: [content] });
      }
      case "prompts/list":
        return rpcResult(id, { prompts: CLOUD_MCP_PROMPTS });
      case "prompts/get": {
        const p = asObject(msg.params) ?? {};
        const name = typeof p.name === "string" ? p.name.trim() : "";
        const promptResult = getMcpPromptResult(name, asObject(p.arguments) ?? {}, baseUrl);
        if (!promptResult) {
          return rpcError(id, INVALID_PARAMS, `Unknown prompt: ${String(p.name)}`);
        }
        return rpcResult(id, promptResult);
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
  nowMs: number = Date.now(),
  baseUrl: string = DEFAULT_ORIGIN
): Promise<{ status: number; body: unknown | null }> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { status: 400, body: rpcError(null, INVALID_REQUEST, "Invalid Request: empty batch.") };
    }
    const responses = (
      await Promise.all(payload.map((item) => handleSingleRpcMessage(item, account, rtdb, nowMs, baseUrl)))
    ).filter((item) => item !== undefined);
    if (responses.length === 0) return { status: 202, body: null };
    return { status: 200, body: responses };
  }

  const response = await handleSingleRpcMessage(payload, account, rtdb, nowMs, baseUrl);
  if (response === undefined) return { status: 202, body: null };
  return { status: 200, body: response };
}
