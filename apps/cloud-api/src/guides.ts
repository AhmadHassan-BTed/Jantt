import janttSchemaJson from "../../../schema/jantt.schema.json";
import masterTemplateJson from "../../../examples/master-template.json";

export const JANTT_SCHEMA_PUBLIC_URL = "https://ahmadhassan-bted.github.io/Jantt/schema/v1.json";
export const JANTT_DOCS_CHEATSHEET_URL =
  "https://github.com/AhmadHassan-BTed/Jantt/blob/main/docs/JANTT_JSON_CHEATSHEET.md";
export const JANTT_DOCS_CLOUD_API_URL =
  "https://github.com/AhmadHassan-BTed/Jantt/blob/main/docs/cloud-agent-api.md";

export type PromptMode = "all" | "create" | "modify";
export type GuideTopic = "cheatsheet" | "prompt" | "schema" | "template" | "master-template" | "help";

export function getJanttSchema(): Record<string, unknown> {
  return janttSchemaJson as Record<string, unknown>;
}

export function getStarterTemplate(): Record<string, unknown> {
  return {
    $schema: JANTT_SCHEMA_PUBLIC_URL,
    meta: {
      title: "Launch Schedule",
      scale: "week",
      defaultGapDays: 1,
      linkRouting: "orthogonal",
      showCriticalPath: true
    },
    categories: {
      engineering: { label: "Engineering", color: "#38BDF8" },
      release: { label: "Release", color: "#10B981" }
    },
    tasks: [
      {
        id: "t1",
        wbs: "1.0",
        label: "Architecture & Spec",
        category: "engineering",
        start: "2026-12-01",
        end: "2026-12-05",
        progress: 0.5,
        status: "in-progress"
      },
      {
        id: "t2",
        wbs: "1.1",
        label: "Implementation & Verification",
        category: "engineering",
        start: "2026-12-06",
        end: "2026-12-12",
        dependsOn: "t1",
        status: "not-started"
      },
      {
        id: "gate-launch",
        wbs: "2.0",
        label: "Production Launch",
        category: "release",
        start: "2026-12-14",
        end: "2026-12-14",
        milestone: true,
        locked: true,
        dependsOn: "t2",
        status: "not-started"
      }
    ]
  };
}

export function getMasterTemplate(): Record<string, unknown> {
  return masterTemplateJson as Record<string, unknown>;
}

export function getJanttCheatsheet(baseUrl: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  return `# Jantt JSON Cheatsheet & Gotchas (Cloud Agent Reference)

> **JSON Schema**: \`${origin}/v1/schema\` (canonical \`$schema\`: \`${JANTT_SCHEMA_PUBLIC_URL}\`)
> **System Prompt**: \`${origin}/v1/prompt\`
> **Dry-Run Validator**: \`POST ${origin}/v1/validate\`
> **Full Specification**: ${JANTT_DOCS_CHEATSHEET_URL}

---

## 1. Compact Schema Contract

\`\`\`ts
type DateISO = string; // "YYYY-MM-DD" or sub-day "YYYY-MM-DDTHH:MM"
type CssColor = string; // "#38BDF8", "rgb(...)", "hsl(...)", or named CSS color
type Dependency =
  | string // "t1", "t1:SS+2d", "t1:FF-1d", "t1:FS+3d", "t1:SF+0d"
  | { id: string; type?: "FS" | "SS" | "FF" | "SF"; lag?: number; lagMinutes?: number };

interface JanttData {
  $schema?: "${JANTT_SCHEMA_PUBLIC_URL}";
  meta?: {
    title?: string;
    description?: string;
    person?: string;
    organization?: string;
    start?: DateISO;
    end?: DateISO;
    targetDate?: "YYYY-MM-DD";           // Contractual deadline for negative-float CPM/DCMA
    defaultGapDays?: number;             // Default FS gap (engine default: 2)
    autoCascade?: boolean;               // true = auto-cascade; false = strict mode
    useWorkingDays?: boolean;            // Skip weekends/holidays during cascade & CPM
    calendar?: "standard" | "24x7" | "6day" | "sun-thu" | WorkingCalendar | string;
    scale?: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
    timeFormat?: "12h" | "24h";
    linkRouting?: "orthogonal" | "curved" | "direct";
    showCriticalPath?: boolean;
    showBaselines?: boolean;
    currency?: string;
    budget?: number;
  };
  categories: Record<string, { label: string; color: CssColor; soft?: CssColor; icon?: string }>;
  calendars?: Record<string, {
    workingDays?: number[];              // 0=Sun..6=Sat, e.g. [1,2,3,4,5]
    holidays?: Array<string | { date: "YYYY-MM-DD"; name?: string }>;
    region?: "US" | "UK" | "GB" | "EU" | "CA" | "AU";
    exceptions?: Array<{ date: "YYYY-MM-DD"; isWorkingDay: boolean }>;
  }>;
  people?: Array<{ id: string; name: string; username?: string; role?: string; email?: string; teamId?: string; color?: CssColor; calendar?: string; calendarId?: string }>;
  teams?: Array<{ id: string; name: string; color?: CssColor; description?: string }>;
  notes?: Array<{ id: string; title: string; content: string; color?: CssColor; pinned?: boolean; category?: string; tags?: string[]; task_ids?: string[] }>;
  documents?: Array<{ id: string; label: string; status?: "have" | "pending" | "missing"; owner?: string; url?: string; note?: string }>;
  tasks: Array<{
    id: string;                          // Required, unique across plan (max 256 chars)
    label?: string;                      // Display title shown on the bar (alias: name)
    category: string;                    // Required — MUST exist as a key in categories
    start: DateISO;                      // Required — valid calendar date/datetime
    end: DateISO;                        // Required — must be >= start
    dependsOn?: Dependency | Dependency[] | null;
    gapDays?: number | null;             // Per-task FS gap override (null = inherit meta.defaultGapDays)
    progress?: number | null;            // Float 0.0 to 1.0 (NOT 0–100!)
    milestone?: boolean;                 // If true, set start === end (zero duration)
    locked?: boolean;                    // Prevents cascade from moving this task
    assignee?: string;                   // Person name or @username
    teamId?: string;
    wbs?: string;                        // e.g. "1.2.1"
    phase?: string;
    status?: "not-started" | "in-progress" | "submitted" | "completed" | "blocked" | string;
    priority?: "low" | "medium" | "high" | "urgent" | string;
    urgent?: boolean;
    color?: CssColor;
    baseline?: { start: DateISO; end: DateISO };
    pert?: { optimistic: number; mostLikely?: number; pessimistic: number };
    estimatedCost?: number;
    actualCost?: number;
    calendar?: string | object;
    calendarId?: string;                 // Must match a key in top-level calendars
    notes?: string;
    description?: string;
    fields?: Record<string, unknown>;    // Custom metadata (jira, storyPoints, repo, etc.)
  }>;
}
\`\`\`

---

## 2. Dependency Rules (Strict DAG)

| Form | Example | Meaning |
|---|---|---|
| Bare ID | \`"t1"\` | Finish-to-Start (FS) using task \`gapDays\` or \`meta.defaultGapDays\` |
| Typed shorthand | \`"t1:SS+2d"\`, \`"t1:FF-1d"\`, \`"t1:FS+0d"\` | Explicit relation (\`FS\`, \`SS\`, \`FF\`, \`SF\`) + lag/lead days |
| Sub-day shorthand | \`"t1:FS+30m"\` | Minute-level lag/lead for \`YYYY-MM-DDTHH:MM\` tasks |
| Object form | \`{ "id": "t1", "type": "SS", "lag": 2 }\` | Explicit relation & numeric lag (negative = lead, within ±3650 days) |
| Multiple links | \`["t1", { "id": "t2", "type": "FF", "lag": -1 }]\` | All constraints must be satisfied |

- When \`resolveCascade\` is \`true\` (default on \`POST /tasks\` and \`PATCH /tasks/:id\`), downstream unlocked tasks automatically cascade forward—honoring \`meta.useWorkingDays\` and \`meta.calendar\` when configured.

---

## 3. Critical Gotchas (Entrance Gate Rejects These!)

1. **Every \`task.category\` MUST exist in \`categories\`** — add new categories via \`PATCH /v1/plans/:roomId\` before adding tasks in that category (or include them together in \`POST /v1/plans\` / \`PUT /v1/plans/:roomId\`).
2. **\`progress\` is \`0.0\` to \`1.0\`** — send \`0.75\` for 75%, never \`75\`.
3. **Real ISO dates only, and \`end >= start\`** — invalid calendar dates like \`"2026-02-30"\` or reversed ranges return \`400\`.
4. **No cycles & no dangling \`dependsOn\` IDs** — every referenced predecessor must exist as a live task and the graph must remain a strict DAG.
5. **Never reuse a deleted task's \`id\`** — deleted tasks keep a sync tombstone (\`_deleted: true\`) for live browser reconciliation; pick a fresh unique \`id\`.
6. **Use \`null\` in \`PATCH\` to clear optional fields** — e.g. \`{ "assignee": null, "dependsOn": null }\`.
7. **Strict field types** — \`label\`, \`assignee\`, \`notes\` must be strings; \`milestone\`, \`locked\` must be booleans; \`estimatedCost\`, \`actualCost\`, \`gapDays\` must be plain finite numbers (no \`"$" \` or commas); \`color\` must be a safe CSS color (hex, \`rgb()\`, \`hsl()\`, or named color).
8. **Payload limits** — max \`5 MB\` request body and max \`5,000\` live tasks per cloud plan.
9. **Prefer surgical task endpoints over full replacement** — use \`POST /tasks\`, \`PATCH /tasks/:id\`, and \`DELETE /tasks/:id\` so concurrent browser editors merge cleanly without clobbering unrelated changes. If you must use \`PUT /v1/plans/:roomId\`, pass \`expectedRevision\` for optimistic concurrency safety.

---

## 4. Quick-Start Valid JSON Template

Fetch ready-to-edit JSON templates directly from:
- Minimal starter: \`GET ${origin}/v1/template\`
- Full feature master template: \`GET ${origin}/v1/template?kind=master\`
- Validate before saving: \`POST ${origin}/v1/validate\`
`;
}

export function getAgentSystemPrompt(baseUrl: string, mode: PromptMode = "all"): string {
  const origin = baseUrl.replace(/\/+$/, "");

  const createProtocol = `### CREATING A NEW CLOUD PLAN
1. Design \`categories\` first (every category needs \`{ "label": string, "color": "#HEX" }\`).
2. Assign every task a short, unique \`id\` (e.g. \`"t1"\`, \`"design-api"\`), a defined \`category\`, valid ISO dates \`start <= end\`, and clean DAG \`dependsOn\` links.
3. For zero-duration milestone gates, set \`"milestone": true\` and \`start === end\`.
4. Before publishing large or complex JSON plans, run \`POST ${origin}/v1/validate\` (or MCP \`jantt_cloud_validate_plan\`) with \`"strict": true\` to verify zero errors and zero warnings.
5. Create the live room with \`POST ${origin}/v1/plans\` (or MCP \`jantt_cloud_create_plan\`).`;

  const modifyProtocol = `### MODIFYING AN EXISTING CLOUD PLAN
1. Discover rooms with \`GET ${origin}/v1/plans\` (or MCP \`jantt_cloud_list_plans\`) and inspect caller permissions (\`role\`: \`owner\` | \`editor\` | \`viewer\`). Never attempt writes on \`viewer\` rooms.
2. Read the target plan with \`GET ${origin}/v1/plans/{roomId}\` (or MCP \`jantt_cloud_get_plan\`) to see existing \`categories\`, task IDs, \`meta.useWorkingDays\`, \`meta.defaultGapDays\`, and current \`meta.revision\`.
3. Prefer **surgical edits** so live browser collaborators stay seamlessly in sync:
   - Add task: \`POST /v1/plans/{roomId}/tasks\` (or \`jantt_cloud_add_task\`)
   - Update / reschedule task: \`PATCH /v1/plans/{roomId}/tasks/{taskId}\` (or \`jantt_cloud_update_task\`). Pass \`null\` to clear optional fields like \`assignee\` or \`dependsOn\`.
   - Delete task: \`DELETE /v1/plans/{roomId}/tasks/{taskId}\` (or \`jantt_cloud_delete_task\`). Automatically writes a sync-safe tombstone and removes dangling \`dependsOn\` links.
   - Update room title, \`meta\`, \`categories\`, \`people\`, \`teams\`, \`notes\`, or \`calendars\`: \`PATCH /v1/plans/{roomId}\`.
   - Full replacement (only when restructuring the entire schedule): validate first, then \`PUT /v1/plans/{roomId}\` (or \`jantt_cloud_replace_plan\`) with \`expectedRevision\` set to the last fetched \`meta.revision\`.
4. After major schedule changes, run \`GET /v1/plans/{roomId}/inspect\` or \`/audit\` (MCP \`jantt_cloud_inspect_plan\` / \`jantt_cloud_audit_schedule\`) to confirm critical path and schedule health.`;

  const workflowSection =
    mode === "create"
      ? createProtocol
      : mode === "modify"
        ? modifyProtocol
        : `${modifyProtocol}\n\n${createProtocol}`;

  return `You are a Jantt Cloud Schedule Engineer operating live Firebase-synced Jantt Gantt plans through the Jantt Cloud API (${origin}) or Remote MCP (${origin}/v1/mcp).

### AUTHORITATIVE REFERENCES
- Cheatsheet & Gotchas: GET ${origin}/v1/cheatsheet (MCP tool: \`jantt_cloud_get_guide\`, resource: \`jantt://cheatsheet\`)
- Formal JSON Schema: GET ${origin}/v1/schema (MCP resource: \`jantt://schema\`)
- Dry-Run Validator: POST ${origin}/v1/validate (MCP tool: \`jantt_cloud_validate_plan\`)

${workflowSection}

### STRICT SYNTAX & NEGATIVE CONSTRAINTS (NEVER VIOLATE)
- [FORBIDDEN] NEVER assign a task \`category\` that is not defined in \`plan.categories\`. Add the category first if needed.
- [FORBIDDEN] NEVER write invalid calendar dates (e.g. \`2026-02-30\`) or inverted ranges (\`end < start\`). Use \`YYYY-MM-DD\` or \`YYYY-MM-DDTHH:MM\`.
- [FORBIDDEN] NEVER create circular dependencies (\`A -> B -> A\`) or reference non-existent task IDs in \`dependsOn\`.
- [FORBIDDEN] NEVER set \`progress\` outside \`0.0..1.0\` (use \`0.5\` for 50%, never \`50\`).
- [FORBIDDEN] NEVER pass wrong scalar types (e.g. string for \`estimatedCost\`/\`gapDays\`, string for \`milestone\`/\`locked\`, non-string for \`label\`/\`assignee\`, unsafe CSS for \`color\`).
- [FORBIDDEN] NEVER inject internal sync keys (\`_deleted\`, \`deletedAt\`, \`fieldTimestamps\`) when creating tasks, and NEVER reuse a deleted task's ID.
- [FORBIDDEN] NEVER delete or overwrite untouched tasks, categories, people, teams, or notes unless explicitly instructed.
- [FORBIDDEN] NEVER hijack \`task.notes\` or \`task.label\` to record changelogs or AI commentary — summarize your changes in your reply to the user instead.
- [FORBIDDEN] NEVER move \`locked: true\` tasks unless the user explicitly asks to unlock or reschedule them.

### ERROR RECOVERY
If the API returns \`400\` (or MCP \`isError: true\`), read the \`[CODE] path: message Fix: suggestion\` diagnostic carefully, fix the exact field(s), and retry cleanly. If \`409 REVISION_MISMATCH\` or \`CONCURRENT_EDIT_CONFLICT\` occurs, re-fetch the plan with \`GET /v1/plans/{roomId}\` and reapply your edit on top of the latest revision.
`;
}

export function getHelpPayload(baseUrl: string) {
  const origin = baseUrl.replace(/\/+$/, "");
  return {
    service: "jantt-cloud-api",
    version: "1.1.0",
    description:
      "Account-scoped REST API and Remote Streamable HTTP MCP server for inspecting, validating, creating, and editing Firebase-synced Jantt Cloud plans in real time.",
    authentication: {
      agentEndpoints: "Authorization: Bearer jnt_live_... (or X-API-Key: jnt_live_...)",
      accountAndAdminEndpoints: "Authorization: Bearer <Firebase GitHub ID Token> (used by Playground UI)",
      publicEndpoints: [
        "GET /health",
        "GET /v1/help",
        "GET /v1/cheatsheet",
        "GET /v1/prompt",
        "GET /v1/schema",
        "GET /v1/template",
        "GET /v1/openapi.json",
        "POST /v1/validate"
      ]
    },
    guidesAndDiscovery: {
      help: `${origin}/v1/help`,
      cheatsheet: `${origin}/v1/cheatsheet`,
      systemPrompt: `${origin}/v1/prompt`,
      systemPromptCreate: `${origin}/v1/prompt?mode=create`,
      systemPromptModify: `${origin}/v1/prompt?mode=modify`,
      jsonSchema: `${origin}/v1/schema`,
      starterTemplate: `${origin}/v1/template`,
      masterTemplate: `${origin}/v1/template?kind=master`,
      validateDryRun: `${origin}/v1/validate`,
      openapi: `${origin}/v1/openapi.json`,
      docsGuide: JANTT_DOCS_CLOUD_API_URL
    },
    agentEndpoints: {
      mcp: `${origin}/v1/mcp`,
      listPlans: `GET ${origin}/v1/plans`,
      createPlan: `POST ${origin}/v1/plans`,
      getPlan: `GET ${origin}/v1/plans/{roomId}`,
      replacePlan: `PUT ${origin}/v1/plans/{roomId}`,
      patchPlan: `PATCH ${origin}/v1/plans/{roomId}`,
      deletePlan: `DELETE ${origin}/v1/plans/{roomId}`,
      listTasks: `GET ${origin}/v1/plans/{roomId}/tasks`,
      addTask: `POST ${origin}/v1/plans/{roomId}/tasks`,
      updateTask: `PATCH ${origin}/v1/plans/{roomId}/tasks/{taskId}`,
      deleteTask: `DELETE ${origin}/v1/plans/{roomId}/tasks/{taskId}`,
      inspectPlan: `GET ${origin}/v1/plans/{roomId}/inspect`,
      auditSchedule: `GET ${origin}/v1/plans/{roomId}/audit`,
      exportCsv: `GET ${origin}/v1/plans/{roomId}/export.csv`
    },
    mcpCapabilities: {
      transport: "Streamable HTTP JSON-RPC 2.0 (POST /v1/mcp)",
      tools: [
        "jantt_cloud_get_guide",
        "jantt_cloud_validate_plan",
        "jantt_cloud_list_plans",
        "jantt_cloud_get_plan",
        "jantt_cloud_create_plan",
        "jantt_cloud_delete_plan",
        "jantt_cloud_add_task",
        "jantt_cloud_update_task",
        "jantt_cloud_delete_task",
        "jantt_cloud_replace_plan",
        "jantt_cloud_inspect_plan",
        "jantt_cloud_audit_schedule",
        "jantt_cloud_export_csv"
      ],
      resources: [
        "jantt://cheatsheet",
        "jantt://system-prompt",
        "jantt://schema",
        "jantt://template/starter",
        "jantt://template/master"
      ],
      prompts: ["jantt_modify_plan", "jantt_create_plan"]
    },
    entranceValidation: {
      enforcedOnAllWrites: true,
      maxBodyBytes: 5 * 1024 * 1024,
      maxTasksPerPlan: 5000,
      blockedErrors: [
        "INVALID_JSON",
        "SCHEMA_MISMATCH",
        "MISSING_TASKS",
        "INVALID_TASK_OBJECT",
        "MISSING_TASK_ID",
        "DUPLICATE_TASK_ID",
        "MISSING_CATEGORY",
        "UNKNOWN_CATEGORY",
        "INVALID_DATE_FORMAT",
        "INVALID_DATE_RANGE",
        "INVALID_BASELINE_DATE",
        "INVALID_BASELINE_RANGE",
        "INVALID_PROGRESS",
        "INVALID_DEPENDENCY",
        "DANGLING_DEPENDENCY",
        "CIRCULAR_DEPENDENCY",
        "INVALID_COLOR",
        "INVALID_CALENDAR"
      ],
      strictModeOption: "Pass strict: true in POST /v1/validate or ?strict=true on plan writes to also reject non-blocking warnings."
    }
  };
}

export function getHelpMarkdown(baseUrl: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  return `# Jantt Cloud Agent API — Live Help & Quickstart

- **Base URL**: \`${origin}\`
- **Remote MCP**: \`POST ${origin}/v1/mcp\`
- **OpenAPI 3.1**: \`GET ${origin}/v1/openapi.json\`
- **JSON Schema**: \`GET ${origin}/v1/schema\`
- **Cheatsheet & Gotchas**: \`GET ${origin}/v1/cheatsheet\`
- **AI System Prompt**: \`GET ${origin}/v1/prompt\` (\`?mode=all|create|modify\`)
- **Templates**: \`GET ${origin}/v1/template\` (\`?kind=starter|master\`)
- **Dry-Run Validator**: \`POST ${origin}/v1/validate\`

## Authentication
Pass your account-scoped API key (generated from Jantt Playground -> **Agent API**) via either header:
- \`Authorization: Bearer jnt_live_...\`
- \`X-API-Key: jnt_live_...\`

## Quick Examples

\`\`\`bash
# 1. Fetch the cheatsheet & editing prompt (public, no key needed)
curl "${origin}/v1/cheatsheet"
curl "${origin}/v1/prompt?mode=modify"

# 2. Dry-run validate a plan JSON before uploading (public)
curl -X POST -H "Content-Type: application/json" \\
  -d '{"plan":{"categories":{"eng":{"label":"Eng","color":"#38BDF8"}},"tasks":[{"id":"t1","label":"Kickoff","category":"eng","start":"2026-12-01","end":"2026-12-03"}]}}' \\
  "${origin}/v1/validate"

# 3. List your accessible cloud plans
curl -H "Authorization: Bearer jnt_live_YOUR_KEY" "${origin}/v1/plans"

# 4. Add a task (validated & synced live to open browsers)
curl -X POST -H "Authorization: Bearer jnt_live_YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{"id":"t-ai-1","label":"Ship API","category":"eng","start":"2026-12-01","end":"2026-12-05"}' \\
  "${origin}/v1/plans/<ROOM_ID>/tasks"
\`\`\`
`;
}

export const MCP_SERVER_INSTRUCTIONS =
  "You are connected to Jantt Cloud MCP for live Firebase-synced Gantt plans. " +
  "Before authoring complex plans or modifying unfamiliar schemas, read resource `jantt://cheatsheet` / `jantt://system-prompt` or call `jantt_cloud_get_guide`. " +
  "Always call `jantt_cloud_list_plans` and `jantt_cloud_get_plan` first to inspect existing categories, task IDs, roles (never write to `viewer` rooms), and `meta.revision`. " +
  "Prefer surgical task tools (`jantt_cloud_add_task`, `jantt_cloud_update_task`, `jantt_cloud_delete_task`) over full replacement (`jantt_cloud_replace_plan`). " +
  "Use `jantt_cloud_validate_plan` to dry-run check full plan JSON before creating or replacing plans. " +
  "Every task requires a unique `id`, a `category` defined in `categories`, valid ISO dates (`start <= end`), `progress` in `0.0..1.0`, and acyclic `dependsOn` links.";

