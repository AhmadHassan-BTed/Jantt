# Jantt Cloud Agent API & Remote MCP Guide

> **Live Base URL**: `https://jantt-cloud-api.ahmadhassan-bted.workers.dev`  
> **Live Playground**: `https://ahmadhassan-bted.github.io/Jantt/`  
> **Remote MCP Endpoint**: `POST https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/mcp`  
> **OpenAPI 3.1 Spec**: `GET https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/openapi.json`  
> **JSON Schema v1**: `GET https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/schema`

Jantt Cloud Agent API exposes your Firebase-synced Jantt Cloud plans to external AI agents (Claude Desktop, Cursor, ChatGPT Custom Actions, Antigravity, LangChain, n8n, and custom scripts) via **account-scoped API keys**, a **REST JSON API**, and a **Streamable HTTP Remote MCP server**.

Every write passes through `@jantt/core`'s entrance validation and dependency cascade solver at the Cloudflare edge—so malformed JSON, invalid dates, unknown categories, wrong scalar types, or dependency cycles are rejected before touching Firebase, while valid edits appear live in open browser tabs.

---

## 1. Architecture & Access Model

```text
GitHub Pages Playground (static UI)
  ├── GitHub Firebase Auth (ID token) ──► Cloudflare Worker (jantt-cloud-api)
  │     ├── GET  /v1/account/access       (check entitlement & keys)
  │     ├── POST /v1/keys                 (issue jnt_live_... key — shown once)
  │     ├── DELETE /v1/keys/{keyId}       (revoke key immediately)
  │     └── /v1/admin/*                   (admin-only grant / revoke access)
  └── Firebase RTDB live listeners ◄───► Firebase Realtime Database (jantt-cloud)
                                                  ▲
AI Agents (Claude / Cursor / ChatGPT / scripts)   │ Service Account OAuth2 + ETag CAS
  ├── Authorization: Bearer jnt_live_...          │
  ├── REST API  (/v1/plans/*)  ───────────────────┘
  ├── Remote MCP (POST /v1/mcp) ──────────────────┘
  └── Public Guides (/v1/help, /v1/cheatsheet, /v1/prompt, /v1/schema, /v1/template, POST /v1/validate)
```

### Security & Scoping Guarantees
- **Admin-Controlled Access**: Accounts must be explicitly enabled in `/api_entitlements/{uid}` (or listed in Worker secret `ADMIN_UIDS`) before they can issue or use API keys. Setting `enabled: false` immediately blocks all API keys for that account (`403 API_ACCESS_REVOKED`).
- **Strictly Account-Scoped**: An API key can ONLY list, inspect, or edit cloud plans where the account is the `owner`, `editor`, or `viewer`:
  - `owner`: read, edit tasks/plan, rename, and delete room.
  - `editor`: read and edit tasks/plan; cannot delete room (`403 OWNER_REQUIRED`).
  - `viewer`: read-only (`403 READ_ONLY` on writes).
  - Non-members: `403 FORBIDDEN` (and never shown in `GET /v1/plans`).
- **Zero Raw Keys Stored**: Only `SHA-256` hashes are stored under server-only `/api_keys` (`.read: false`, `.write: false` for all clients).
- **Real-Time Browser Sync**: Writes use Firebase RTDB ETag Compare-And-Set (CAS) with automatic retry, and task deletions create `_deleted: true` tombstones so open browser collaborators reconcile cleanly.

---

## 2. Quickstart (2 Minutes)

### Step 1 — Unlock Access ($1/month) & Generate an API Key
1. Open the [Jantt Playground](https://ahmadhassan-bted.github.io/Jantt/) and sign in with **GitHub**.
2. Click **Agent API** in the header (or the Cloud bar).
3. If your account is locked, Cloud Agent API & Remote MCP access is **$1/month**. Send a **screenshot of your payment** along with your Jantt **@username** on [WhatsApp](https://wa.me/923225522383) (there is a pre-filled WhatsApp button right inside the modal). Once verified, the admin enables your account immediately.
4. Once enabled, enter a label (e.g. `Claude Desktop` or `Cursor`) and click **Generate API Key**. Copy the `jnt_live_...` key immediately—it is displayed once.

### Step 2 — Connect an AI Agent

#### Option A: Remote MCP (Claude Desktop / Cursor / Antigravity)
```json
{
  "mcpServers": {
    "jantt-cloud": {
      "url": "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/mcp",
      "headers": {
        "Authorization": "Bearer jnt_live_YOUR_API_KEY"
      }
    }
  }
}
```

#### Option B: ChatGPT Custom GPT Actions / OpenAPI Clients
1. Import OpenAPI URL: `https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/openapi.json`
2. Set Authentication to **API Key -> Bearer** and paste `jnt_live_YOUR_API_KEY`.
3. Paste the editing instructions from `GET /v1/prompt` into your assistant's system prompt.

#### Option C: Direct REST / cURL
Pass your key via either `Authorization: Bearer jnt_live_...` or `X-API-Key: jnt_live_...`:

```bash
# List all cloud plans accessible to your account
curl -H "Authorization: Bearer jnt_live_YOUR_API_KEY" \
  "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/plans"
```

---

## 3. Public Guides, Schema, Templates & Dry-Run Validation

All discovery, cheatsheet, system prompt, schema, template, and dry-run validation endpoints are **public** (no API key needed), so any developer or AI agent can read Jantt syntax rules and validate JSON before uploading.

| Endpoint | Method | Purpose | Options |
|---|---|---|---|
| `/health` | `GET` | Service status + discovery links | — |
| `/v1/help` | `GET` | Full API & MCP help index | `?format=json` (default) or `?format=markdown` |
| `/v1/cheatsheet` | `GET` | Compact Jantt JSON Cheatsheet & Gotchas | `?format=markdown` (default) or `?format=json` |
| `/v1/prompt` | `GET` | AI Agent System Prompt & Editing Protocol | `?mode=all\|create\|modify`, `?format=markdown\|json` |
| `/v1/schema` | `GET` | Official Jantt JSON Schema (`v1.json`) | `application/schema+json` |
| `/v1/template` | `GET` | Valid Jantt JSON template | `?kind=starter` (default) or `?kind=master` |
| `/v1/openapi.json` | `GET` | OpenAPI 3.1 specification | — |
| `/v1/validate` | `POST` | Dry-run entrance validator (never writes to Firebase) | `?strict=true` or `{ "plan": {...}, "strict": true }` |

### Example: Fetch Cheatsheet & System Prompt
```bash
# Get compact Jantt JSON cheatsheet & gotchas
curl "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/cheatsheet"

# Get ready-to-use system instructions for modifying existing cloud plans
curl "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/prompt?mode=modify"

# Get the official JSON Schema
curl "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/schema"

# Get starter or full master template
curl "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/template?kind=master"
```

### Example: Dry-Run Validate Before Uploading
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "strict": true,
    "plan": {
      "meta": { "title": "Q4 Launch" },
      "categories": { "eng": { "label": "Engineering", "color": "#38BDF8" } },
      "tasks": [
        { "id": "t1", "label": "Spec", "category": "eng", "start": "2026-12-01", "end": "2026-12-04" }
      ]
    }
  }' \
  "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/validate"
```

Response:
```json
{
  "valid": true,
  "strictValid": true,
  "summary": { "taskCount": 1, "errorCount": 0, "warningCount": 0 },
  "errors": [],
  "warnings": []
}
```

---

## 4. Entrance Validation & Syntax Enforcement

Every write endpoint (`POST /v1/plans`, `PUT /v1/plans/{roomId}`, `PATCH /v1/plans/{roomId}`, `POST /v1/plans/{roomId}/tasks`, `PATCH /v1/plans/{roomId}/tasks/{taskId}`, and their MCP equivalents) enforces `@jantt/core` entrance validation **before** touching Firebase:

| Category | Enforced Rules (Rejected with `400` / `409` / `413`) |
|---|---|
| **Payload & Size** | Valid JSON object, max `5 MB` request body (`413 PAYLOAD_TOO_LARGE`), max `5,000` live tasks per cloud plan |
| **Root Structure** | Valid `tasks` array, valid `meta` object/dates, valid `categories` map (`{ label: string, color: CssColor }`), valid `people`/`teams` (`id`, `name`), valid `notes` (`id`, string `title`/`content`, string[] `tags`/`task_ids`) |
| **Task Identity** | Required non-empty unique `id` (duplicate or tombstone ID returns `409 TASK_ALREADY_EXISTS`); internal keys (`_deleted`, `deletedAt`, `resolveCascade`, `__proto__`) stripped on create |
| **Categories** | Every `task.category` must match a key in `plan.categories` (`UNKNOWN_CATEGORY`) |
| **Dates & Sub-Day** | Strict calendar ISO `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (rejects `2026-02-30`), `end >= start`, valid `baseline` ranges |
| **DAG Dependencies** | Valid `dependsOn` syntax (`"t1"`, `"t1:SS+2d"`, `{ "id": "t1", "type": "FS", "lag": 1 }`), no dangling references, no self-links, no circular loops (`CIRCULAR_DEPENDENCY`) |
| **Strict Scalar Types** | `progress` in `0.0..1.0` (or `null`), string `label`/`name`/`assignee`/`notes`, boolean `milestone`/`locked`, finite numeric `gapDays`/`estimatedCost`/`actualCost`, safe CSS `color`, valid `calendar`/`calendarId` |
| **Strict Mode (`?strict=true`)** | Pass `?strict=true` (or `"strict": true` in body / MCP args) to also reject soft advisory warnings (e.g. `MILESTONE_HAS_DURATION`, `DEP_TIMING_CONFLICT`, `DANGLING_REFERENCE`) |

Every error returns LLM-friendly diagnostics in `[CODE] path: message Fix: suggestion` format so agents can self-correct in one retry.

---

## 5. Cloud Plans & Tasks REST API Reference

All endpoints below require `Authorization: Bearer jnt_live_...` (or `X-API-Key: jnt_live_...`).

### Plans (Cloud Rooms)

| Method & Path | Role Required | Description |
|---|---|---|
| `GET /v1/plans` | Any enabled | Lists all owned and shared cloud plans (`roomId`, `title`, `role`, `canEdit`, `canDelete`, `revision`, `taskCount`, `updatedAt`) |
| `POST /v1/plans` | Any enabled | Creates a new owned cloud plan (`{ title, plan?, strict? }`). Defaults to a valid blank starter plan if `plan` is omitted |
| `GET /v1/plans/{roomId}` | `viewer`+ | Returns full room metadata, permissions, and decoded `JanttData` plan (`?includeDeleted=true` includes sync tombstones) |
| `PUT /v1/plans/{roomId}` | `editor`+ | Replaces the full plan JSON (`{ plan, title?, expectedRevision?, strict? }`). Preserves existing sync tombstones |
| `PATCH /v1/plans/{roomId}` | `editor`+ | Partially updates `title`, `meta`, `categories`, `people`, `teams`, `notes`, or `calendars` |
| `DELETE /v1/plans/{roomId}` | `owner` only | Permanently deletes the room and cascades removal of all shared member pointers |

### Tasks (Surgical Edits — Recommended)

| Method & Path | Role Required | Description |
|---|---|---|
| `GET /v1/plans/{roomId}/tasks` | `viewer`+ | Lists live tasks. Supports filters: `?category=...`, `?assignee=...`, `?status=...` |
| `POST /v1/plans/{roomId}/tasks` | `editor`+ | Adds a task, validates schema/DAG, resolves dependency cascades (honoring `meta.useWorkingDays` / `meta.calendar`), and commits atomically. Set `resolveCascade: false` to disable cascade |
| `PATCH /v1/plans/{roomId}/tasks/{taskId}` | `editor`+ | Updates task fields and/or reschedules dates with cascade. Pass `null` to clear optional fields (e.g. `{"assignee": null, "dependsOn": null}`) |
| `DELETE /v1/plans/{roomId}/tasks/{taskId}` | `editor`+ | Soft-deletes the task with a `_deleted: true` sync tombstone and removes dangling `dependsOn` links (`?cleanupDependencies=false` to keep links) |

### Analytics & Export

| Method & Path | Role Required | Description |
|---|---|---|
| `GET /v1/plans/{roomId}/inspect` | `viewer`+ | Validation summary, date span, critical path IDs, early finish, float (supports `?targetDate=YYYY-MM-DD`), categories, and workload per assignee |
| `GET /v1/plans/{roomId}/audit` | `viewer`+ | DCMA schedule health score (`0–100`), grade, detailed checks, and actionable issues (supports `?targetDate=YYYY-MM-DD`) |
| `GET /v1/plans/{roomId}/export.csv` | `viewer`+ | Downloads RFC-4180 CSV spreadsheet (`text/csv`) |

### Example: Add, Reschedule & Delete a Task
```bash
# Add a dependent task (cascades automatically, honors working calendar)
curl -X POST \
  -H "Authorization: Bearer jnt_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "deploy-prod",
    "label": "Deploy to Production",
    "category": "release",
    "start": "2026-12-10",
    "end": "2026-12-11",
    "dependsOn": "t2",
    "assignee": "@ahmadhassanbted"
  }' \
  "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/plans/<ROOM_ID>/tasks"

# Update progress & clear assignee
curl -X PATCH \
  -H "Authorization: Bearer jnt_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "progress": 0.75, "assignee": null }' \
  "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/plans/<ROOM_ID>/tasks/deploy-prod"

# Delete task (sync-safe tombstone + cleans up downstream dependsOn)
curl -X DELETE \
  -H "Authorization: Bearer jnt_live_YOUR_API_KEY" \
  "https://jantt-cloud-api.ahmadhassan-bted.workers.dev/v1/plans/<ROOM_ID>/tasks/deploy-prod"
```

---

## 6. Remote Streamable HTTP MCP Reference (`POST /v1/mcp`)

Speaks JSON-RPC 2.0 (`2025-06-18`, `2025-03-26`, `2024-11-05`), supports batch requests and `202` notifications, and sends built-in `instructions` on `initialize`.

### MCP Tools (13)
| Tool | Purpose |
|---|---|
| `jantt_cloud_get_guide` | Fetch `cheatsheet`, `prompt` (`all`/`create`/`modify`), `schema`, `template`, `master-template`, or `help` |
| `jantt_cloud_validate_plan` | Dry-run validate a `JanttData` JSON object (`strict?: boolean`) without writing |
| `jantt_cloud_list_plans` | List all cloud plans accessible to the authenticated account |
| `jantt_cloud_get_plan` | Read a cloud plan's metadata, role, and full `JanttData` JSON |
| `jantt_cloud_create_plan` | Create a new owned cloud plan |
| `jantt_cloud_delete_plan` | Permanently delete an owned cloud plan (owner only) |
| `jantt_cloud_add_task` | Add a validated task with dependency & working-calendar cascade |
| `jantt_cloud_update_task` | Patch fields / reschedule a task (`null` clears optional fields) |
| `jantt_cloud_delete_task` | Soft-delete a task tombstone and clean up dangling `dependsOn` links |
| `jantt_cloud_replace_plan` | Replace full plan JSON (with optional `expectedRevision` & `strict`) |
| `jantt_cloud_inspect_plan` | Inspect critical path, date span, validation, and workload |
| `jantt_cloud_audit_schedule` | Run DCMA schedule integrity audit (`0–100` score + issues) |
| `jantt_cloud_export_csv` | Export plan as RFC-4180 CSV |

### MCP Resources (`resources/list`, `resources/read`)
- `jantt://cheatsheet` — Jantt JSON Cheatsheet & Gotchas (`text/markdown`)
- `jantt://system-prompt` — Jantt Cloud Editing System Prompt (`text/markdown`)
- `jantt://schema` — Official Jantt JSON Schema v1 (`application/schema+json`)
- `jantt://template/starter` — Minimal valid starter template (`application/json`)
- `jantt://template/master` — Full feature master template (`application/json`)

### MCP Prompts (`prompts/list`, `prompts/get`)
- `jantt_modify_plan` *(optional arg: `roomId`)* — Safe editing protocol + strict constraints for modifying an existing cloud plan
- `jantt_create_plan` *(optional arg: `goal`)* — Creation protocol + full cheatsheet for designing and validating a new plan

---

## 7. Common HTTP Error Codes

| HTTP Status | Error Code | Meaning |
|---|---|---|
| `400` | `INVALID_JSON` / `PLAN_VALIDATION_FAILED` / `INVALID_TASK` / `INVALID_ROOM_ID` / `INVALID_DATE` | Request body or Jantt syntax failed entrance checks; see `error.details` for field-level fixes |
| `401` | `MISSING_API_KEY` / `INVALID_API_KEY` / `FIREBASE_TOKEN_REQUIRED` | Missing, malformed, or revoked key/token |
| `403` | `API_ACCESS_NOT_GRANTED` / `API_ACCESS_REVOKED` / `FORBIDDEN` / `READ_ONLY` / `OWNER_REQUIRED` / `ORIGIN_NOT_ALLOWED` | Entitlement disabled, insufficient room role, or disallowed browser origin |
| `404` | `ROOM_NOT_FOUND` / `TASK_NOT_FOUND` / `KEY_NOT_FOUND` | Resource does not exist |
| `405` | `METHOD_NOT_ALLOWED` | Unsupported HTTP verb (e.g. `GET /v1/mcp` returns `Allow: POST, OPTIONS`) |
| `409` | `TASK_ALREADY_EXISTS` / `REVISION_MISMATCH` / `CONCURRENT_EDIT_CONFLICT` | Duplicate/tombstone task ID or concurrent edit — re-fetch and retry |
| `413` | `PAYLOAD_TOO_LARGE` | Request body exceeds `5 MB` |

---

## 8. Related Documentation
- [Jantt JSON Cheatsheet (Full Spec)](./JANTT_JSON_CHEATSHEET.md)
- [Schema Specification](./schema-spec.md)
- [Security & Privacy Model](./security.md)
- [Worker Deployment Guide (`apps/cloud-api/README.md`)](../apps/cloud-api/README.md)

