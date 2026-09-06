# Jantt JSON Specification & Benchmark Cheatsheet

> **Version**: 1.2.0  
> **Schema Definition**: `https://jantt.dev/schema/v1.json`  
> **Target Standard**: Swiss Modernism 2.0 / Enterprise Project Management Standard

This document is the official benchmark cheatsheet and reference guide for authoring, validating, and generating **Jantt JSON** datasets for Gantt charts, Kanban boards, and project management applications.

---

## AI Agent Workbench & Schema Cheatsheet

### AI-Native Ideology: Stop Asking AI to Write Fragile Timeline Code

Having LLMs generate hundreds of lines of React JSX, SVG coordinate math, and canvas listeners produces brittle, hallucination-prone results. With Jantt, the AI outputs **pure declarative JSON**, and Jantt delivers deterministic, interactive execution.

| 10× | 0 | 100% | 2-Way |
| :---: | :---: | :---: | :---: |
| **Fewer LLM Tokens vs JSX** | **Runtime Dependencies** | **Deterministic DAG Solver** | **Bidirectional State Sync** |

*Schema Contract: `https://jantt.dev/schema/v1.json` (v1.2.0)*

#### The 4-Step Bidirectional Loop

1. **Step 1: Feed Cheatsheet to LLM** — Give the AI the compact schema contract (WBS, dates, DAG dependencies, milestones, budget).
2. **Step 2: AI Outputs Pure JSON** — Uses 10× fewer tokens than JSX. Machine-checkable, type-safe, and zero UI hallucinations.
3. **Step 3: Instant Interactive Suite** — Jantt resolves topological DAG schedules, routes orthogonal wires, and renders Gantt, Kanban & Analytics.
4. **Step 4: Bidirectional Loop** — Humans drag and adjust visually. Jantt syncs clean JSON back to localStorage/disk for the AI agent.

---

### LLM System Prompt

Hand this prompt to ChatGPT, Claude, Gemini, Cursor, or your autonomous AI agent pipelines:

```text
You are a precision project management schedule generator.
Output ONLY raw, valid JSON conforming strictly to the Jantt JSON Schema (https://jantt.dev/schema/v1.json).

# JANTT JSON SCHEMA BENCHMARK & SPECIFICATION CHEATSHEET

## 1. Top-Level Root Structure
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "<Project Title>",
    "description": "<Project narrative and objectives>",
    "person": "<Lead Program Manager / Owner>",
    "organization": "<Enterprise / Organization Name>",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "defaultGapDays": 2,
    "scale": "day" | "week" | "month" | "quarter" | "year",
    "linkRouting": "orthogonal" | "curved" | "direct",
    "showCriticalPath": true,
    "showBaselines": true,
    "currency": "USD",
    "budget": 385000,
    "version": "1.2.0"
  },
  "categories": {
    "<category_id>": {
      "label": "<Category Display Name>",
      "color": "#HEX_COLOR",
      "soft": "#BG_TINT_HEX",
      "icon": "<lucide_icon_name>"
    }
  },
  "people": [
    {
      "id": "@alex",
      "name": "Alex Mercer",
      "username": "@alex",
      "role": "Lead Architect",
      "email": "alex@org.com",
      "teamId": "core-team",
      "color": "#3B82F6"
    },
    {
      "id": "person-contractor",
      "name": "Sarah Miller",
      "role": "External Specialist",
      "teamId": "core-team",
      "color": "#10B981"
    }
  ],
  "teams": [
    {
      "id": "core-team",
      "name": "Core Platform Squad",
      "color": "#3B82F6",
      "description": "Backend services and architecture"
    }
  ],
  "notes": [
    {
      "id": "note-unique-id",
      "title": "Architecture RFC & Specs",
      "content": "Detailed markdown requirements, meeting minutes, and acceptance criteria.",
      "color": "#3B82F6",
      "pinned": true,
      "category": "Architecture",
      "tags": ["RFC", "Architecture"],
      "task_ids": ["task-1"],
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
      "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "documents": [
    {
      "id": "doc-unique-id",
      "label": "<Document or Deliverable Title>",
      "status": "have" | "pending" | "missing",
      "owner": "<Owner Name>",
      "url": "<Documentation Link>",
      "note": "<Review notes / status>"
    }
  ],
  "tasks": [
    {
      "id": "task-unique-id",
      "wbs": "1.1",
      "label": "Task Name / Title",
      "category": "<matching_category_id>",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "assignee": "@alex",
      "phase": "Phase 1: Foundation",
      "priority": "low" | "medium" | "high" | "urgent",
      "estimatedCost": 28000,
      "actualCost": 15000,
      "dependsOn": "prereq-id" | ["prereq-1", "prereq-2"] | null,
      "gapDays": 2,
      "locked": false,
      "progress": 0.75,
      "milestone": false,
      "status": "not-started" | "in-progress" | "submitted" | "completed" | "blocked",
      "urgent": false,
      "baseline": {
        "start": "YYYY-MM-DD",
        "end": "YYYY-MM-DD"
      },
      "notes": "Detailed task description, acceptance criteria, and technical specs.",
      "fields": {
        "jira": "JANTT-101",
        "storyPoints": 13,
        "repo": "github.com/org/repo",
        "deliverable": "schemas/v1.json"
      }
    }
  ]
}

## 2. Critical Constraints & Validation Rules:
1. DATES: All dates must be ISO "YYYY-MM-DD" format. "end" must be >= "start".
2. CATEGORIES: Every task "category" must match an existing key in the "categories" dictionary.
3. DEPENDENCIES (DAG):
   - "dependsOn" can be a single task ID string, an array of strings ["t1", "t2"], or null.
   - All referenced dependency IDs must exist in the "tasks" list (no dangling references).
   - Strict Directed Acyclic Graph: NO circular dependency loops (e.g. A -> B -> C -> A).
   - Timing Sanity: A task's "start" must be on or after prerequisite "end" + gapDays.
4. MILESTONES: For zero-duration milestone gates, set "milestone": true and "start" equal to "end".
5. PROGRESS: Must be a decimal float from 0.0 (0%) to 1.0 (100%).
6. BASELINES: Optional planned timeframe object { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } for baseline variance tracking.
7. LOCKED: Set "locked": true on fixed gates or hard-deadline milestones to prevent accidental drag shifts.
8. SINGLE SOURCE OF TRUTH & NO DATABASE IDS IN JSON:
   - Real registered accounts use "@username" for both "id" and "username".
   - Non-account individuals are defined as offline personas with local ID (e.g. "person-contractor", without "username").
   - Tasks assigned to registered accounts reference the mention in "assignee": "@username".
   - Zero internal database IDs (no Firebase UIDs, auth tokens, or secret keys) in JSON. The only exception is public "@username" mentions.
```

---

## 1. Top-Level Structure

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": { ... },
  "categories": { ... },
  "people": [ ... ],
  "teams": [ ... ],
  "notes": [ ... ],
  "documents": [ ... ],
  "tasks": [ ... ]
}
```

| Key | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `$schema` | `string` | No | Schema URI identifier |
| `meta` | `object` | No | Project-wide configuration, timeline bounds, and rendering options |
| `categories` | `object` | Yes | Map of category IDs to display labels, brand colors, and icons |
| `people` | `array` | No | Team members with avatar colors, contact emails, and squad mappings |
| `teams` | `array` | No | Department or squad registries with distinct theme badge colors |
| `notes` | `array` | No | Project documentation, architecture RFCs, meeting minutes, and checklists |
| `documents` | `array` | No | List of project artifacts, RFCs, compliance checklists, or deliverables |
| `tasks` | `array` | **Yes** | Array of tasks, milestones, baselines, and dependency definitions |

---

## 2. Meta Object (`meta`)

```json
"meta": {
  "title": "Master Kitchen-Sink Specification & Benchmark Cheatsheet",
  "description": "Project narrative scope and instructions.",
  "person": "Lead Technical Program Director",
  "organization": "Acme Global Engineering & Architecture",
  "start": "2026-09-01",
  "end": "2027-01-31",
  "defaultGapDays": 2,
  "scale": "week",
  "linkRouting": "orthogonal",
  "showCriticalPath": true,
  "showBaselines": true,
  "currency": "USD",
  "budget": 385000,
  "version": "1.2.0",
  "generatedAt": "2026-08-29T19:00:00.000Z"
}
```

| Field | Type | Default | Options / Valid Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `title` | `string` | `""` | Any text | Main project name displayed in header |
| `description` | `string` | `""` | Any text | Project scope narrative |
| `person` | `string` | `""` | Any text | Project manager or lead owner |
| `organization` | `string` | `""` | Any text | Organization or enterprise name |
| `start` / `chartStart` | `string` | Dynamic | `YYYY-MM-DD` | Optional explicit timeline start date |
| `end` / `chartEnd` | `string` | Dynamic | `YYYY-MM-DD` | Optional explicit timeline end date |
| `defaultGapDays` | `number` | `2` | Integer `>= 0` | Buffer days between sequential dependent tasks |
| `scale` | `string` | `"day"` | `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` | Initial zoom scale level |
| `linkRouting` | `string` | `"orthogonal"` | `"orthogonal"`, `"curved"`, `"direct"` | Dependency wire connector geometry |
| `showCriticalPath` | `boolean` | `false` | `true`, `false` | Highlight critical path tasks & connections |
| `showBaselines` | `boolean` | `true` | `true`, `false` | Render planned vs actual ghost bars |
| `currency` | `string` | `"USD"` | `"USD"`, `"EUR"`, `"GBP"`, etc. | Currency symbol / code for budgets |
| `budget` | `number` \| `string` | `0` | e.g. `385000` | Total approved project budget |

---

## 3. Categories Map (`categories`)

Every task must reference a valid key defined in the `categories` dictionary:

```json
"categories": {
  "specs": {
    "label": "Architecture & Specs",
    "color": "#3B82F6",
    "soft": "#1E293B",
    "icon": "file-text"
  },
  "core": {
    "label": "Core Engine & Services",
    "color": "#10B981",
    "soft": "#064E3B",
    "icon": "cpu"
  },
  "ui": {
    "label": "Frontend & Design System",
    "color": "#8B5CF6",
    "soft": "#312E81",
    "icon": "layout"
  },
  "security": {
    "label": "Security & Compliance",
    "color": "#F59E0B",
    "soft": "#78350F",
    "icon": "shield-check"
  },
  "devops": {
    "label": "Cloud & Infrastructure",
    "color": "#06B6D4",
    "soft": "#083344",
    "icon": "cloud"
  },
  "qa": {
    "label": "QA & Test Automation",
    "color": "#E11D48",
    "soft": "#4C0519",
    "icon": "check-circle"
  },
  "release": {
    "label": "Deployment & Release",
    "color": "#EC4899",
    "soft": "#831843",
    "icon": "rocket"
  }
}
```

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `label` | `string` | Yes | Human-readable category title |
| `color` | `string` | Yes | Hex/RGB brand color for task bars and badges |
| `soft` | `string` | No | Background tint color for dark/light themes |
| `icon` | `string` | No | Lucide icon identifier (e.g. `cpu`, `layout`, `rocket`) |

---

## 4. Documents (`documents`)

```json
"documents": [
  {
    "id": "doc-arch-rfc",
    "label": "RFC-204: Global Event-Driven Mesh Architecture",
    "status": "have",
    "owner": "Sarah Chen",
    "url": "https://wiki.acme.corp/rfc/204",
    "note": "Approved unanimously by Architecture Review Board on Aug 24"
  },
  {
    "id": "doc-soc2-audit",
    "label": "SOC2 Type II & ISO 27001 Security Checklist",
    "status": "pending",
    "owner": "Marcus Brody",
    "url": "https://compliance.acme.corp/soc2-audit",
    "note": "Under audit review with external auditor"
  },
  {
    "id": "doc-legal-sla",
    "label": "Global Service Level Agreement & Privacy Policy v2",
    "status": "missing",
    "owner": "Legal Counsel",
    "url": "https://legal.acme.corp/sla-v2",
    "note": "Mandatory blocker for GA production rollout"
  }
]
```

| Field | Type | Options / Valid Values | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Unique string | Unique document identifier |
| `label` | `string` | Any text | Document or deliverable title |
| `status` | `string` | `"have"`, `"pending"`, `"missing"` | Fulfillment status |
| `owner` | `string` | Any text | Document owner / author |
| `url` | `string` | URL string | Link to document, RFC, or ticket |
| `note` | `string` | Any text | Status note or review findings |

---

## 5. Tasks (`tasks`)

```json
{
  "id": "task-core-services",
  "wbs": "2.1",
  "label": "High-Performance DAG Constraint Solver Engine",
  "category": "core",
  "start": "2026-09-19",
  "end": "2026-10-22",
  "assignee": "Alex Rivera",
  "priority": "urgent",
  "estimatedCost": 72000,
  "actualCost": 54000,
  "dependsOn": "task-gate-1",
  "gapDays": 2,
  "locked": false,
  "progress": 0.75,
  "milestone": false,
  "status": "in-progress",
  "urgent": true,
  "baseline": {
    "start": "2026-09-17",
    "end": "2026-10-18"
  },
  "notes": "Zero-dependency pure TypeScript topological dependency resolver and critical path calculation engine.",
  "fields": {
    "repo": "github.com/acme/jantt-core",
    "coverageTarget": "95%",
    "jira": "JANTT-201",
    "storyPoints": 21
  }
}
```

### Complete Task Field Reference

| Field | Type | Required | Description | Example |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | **Yes** | Unique task identifier | `"task-core-services"` |
| `label` / `name` | `string` | **Yes** | Display title of the task | `"DAG Constraint Solver"` |
| `category` | `string` | **Yes** | Matching key from `categories` dictionary | `"core"` |
| `start` | `string` | **Yes** | Start date (`YYYY-MM-DD`) | `"2026-09-19"` |
| `end` | `string` | **Yes** | End date (`YYYY-MM-DD` >= `start`) | `"2026-10-22"` |
| `wbs` | `string` | No | Work Breakdown Structure code | `"2.1"`, `"1.2.3"` |
| `assignee` | `string` | No | Responsible team member or role | `"Alex Rivera"` |
| `priority` | `string` | No | `"low"`, `"medium"`, `"high"`, `"urgent"` | `"urgent"` |
| `estimatedCost` | `number` | No | Planned budget allocation | `72000` |
| `actualCost` | `number` | No | Actual spend to date | `54000` |
| `dependsOn` | `string` \| `string[]` \| `null` | No | Single prerequisite ID or array of IDs | `"task-gate-1"` or `["task-1", "task-2"]` |
| `gapDays` | `number` | No | Custom buffer days from prerequisite | `2` |
| `progress` | `number` | No | Completion percentage (`0.0` to `1.0`) | `0.75` (75%) |
| `milestone` | `boolean` | No | `true` if zero-duration diamond checkpoint | `true` (with `start === end`) |
| `status` | `string` | No | `"not-started"`, `"in-progress"`, `"completed"`, `"blocked"` | `"in-progress"` |
| `locked` | `boolean` | No | Prevents accidental drag shifts in GUI | `true` |
| `urgent` | `boolean` | No | Adds red pulse attention badge | `true` |
| `baseline` | `object` | No | `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }` | `{ "start": "2026-09-17", "end": "2026-10-18" }` |
| `notes` | `string` | No | Detailed multi-line notes / instructions | `"Detailed technical description"` |
| `fields` | `object` | No | Arbitrary domain-specific metadata (Jira, GitHub, SLA, etc.) | `{ "jira": "JANTT-201", "storyPoints": 21 }` |

---

## 6. Milestone Checkpoints

A milestone is defined with `"milestone": true` and `"start"` equal to `"end"`:

```json
{
  "id": "task-gate-4",
  "wbs": "5.0",
  "label": "Milestone 4: Global Production GA Launch",
  "category": "release",
  "start": "2027-01-14",
  "end": "2027-01-14",
  "assignee": "Lead Technical Program Director",
  "priority": "urgent",
  "dependsOn": ["task-canary-rollout", "task-developer-portal"],
  "gapDays": 4,
  "locked": true,
  "progress": 0.0,
  "milestone": true,
  "status": "not-started"
}
```

---

## 7. Multi-Prerequisite Dependencies

Tasks can depend on multiple upstream tasks by providing an array of IDs:

```json
{
  "id": "task-gate-3",
  "wbs": "4.0",
  "label": "Milestone 3: Security Clearance & Beta Readiness",
  "category": "security",
  "start": "2026-12-14",
  "end": "2026-12-14",
  "dependsOn": ["task-sec-audit", "task-qa-automation", "task-cloud-infra"]
}
```

---

## 8. Validation Rules

The `@jantt/core` validation engine enforces:
1. **Valid ISO Dates**: `YYYY-MM-DD` calendar format.
2. **Date Order**: `end` must be greater than or equal to `start`.
3. **Category Matching**: Every task's `category` must exist in `categories`.
4. **Unique Task IDs**: No duplicate task IDs permitted.
5. **DAG Dependency Integrity**:
   - No dangling dependencies (`dependsOn` pointing to non-existent tasks).
   - No circular dependency cycles (`A -> B -> C -> A`).
   - Timing sanity (`start` must be on or after prerequisite `end` + `gapDays`).
6. **Progress Bounds**: `progress` must be a float between `0.0` and `1.0`.

---

---

## 9. People & Teams Registry (`people`, `teams`)

The Jantt engine manages human resources, squad allocations, and avatar presentation through optional top-level `people` and `teams` arrays.

### Single Source of Truth & Dual-Mode Member Architecture

To maintain strict database and JSON coherence without leaking internal IDs:
- **Real Registered Teammates**: Defined using their canonical GitHub handle mention for both `id` and `username` (e.g. `"id": "@ahmadhassan"`, `"username": "@ahmadhassan"`).
- **Offline / Non-Account Personas**: Defined with standard local IDs without a `username` (e.g. `"id": "person-contractor"`, `"name": "Contractor Sarah"`).
- **Task Assignees**: Tasks assigned to real accounts reference the handle mention (`"assignee": "@ahmadhassan"`).
- **Zero Internal Database IDs in JSON**: No Firebase UIDs (`uid`, `ownerUid`), secret keys, or auth tokens are ever exposed in JSON. The single canonical exception is public `@username` mentions.

```json
{
  "people": [
    {
      "id": "@ahmadhassan",
      "name": "Ahmad Hassan",
      "username": "@ahmadhassan",
      "role": "Project Lead / Principal Investigator",
      "avatar": "https://avatars.githubusercontent.com/u/104278065?v=4",
      "teamId": "ai-core",
      "color": "#38BDF8"
    },
    {
      "id": "person-contractor",
      "name": "Sarah Miller",
      "role": "External Security Auditor",
      "teamId": "ai-core",
      "color": "#10B981"
    }
  ],
  "teams": [
    {
      "id": "ai-core",
      "name": "Distributed Edge & FL Core",
      "color": "#38BDF8"
    }
  ]
}
```

### People Field Reference

| Field | Type | Required | Description | Example |
|---|---|:---:|---|---|
| `id` | `string` | **Yes** | Unique identifier: `@username` mention for registered accounts, or `person-xxx` for offline personas. | `"@ahmadhassan"` |
| `name` | `string` | **Yes** | Full display name. | `"Ahmad Hassan"` |
| `username` | `string` | No | Canonical GitHub username mention. Present **only** for registered accounts. | `"@ahmadhassan"` |
| `role` | `string` | No | Job title, position, or specialty. | `"Lead Architect"` |
| `teamId` | `string` | No | Identifier referencing an entry in `teams[].id`. | `"ai-core"` |
| `avatar` | `string` | No | Profile photo URL or fallback avatar graphic. | `"https://..."` |
| `color` | `string` | No | Hex color used for visual badge & timeline avatar. | `"#38BDF8"` |
| `email` | `string` | No | Contact email address. | `"user@org.com"` |

> **Automatic Discovery**: If `people` is omitted, the Jantt UI automatically infers assignees from `meta.person`, `tasks[].assignee`, and `documents[].owner`. Inferred members can be formalized into the JSON schema with a single click.

---

## 10. Cloud Security, Plan Sanitization & Real-Time Sync

Jantt integrates a multi-user real-time collaboration engine backed by Firebase Realtime Database and Cloudflare edge proxies:

1. **GitHub-Only Authentication**:
   - Google login is strictly removed. Only GitHub OAuth 2.0 is allowed.
   - Usernames are claimed directly from verified GitHub handles with zero manual typing modal.
2. **Plan Sanitization Pipeline (`sanitizePlanForJson`)**:
   - Every plan document is sanitized before saving to the database or exporting.
   - Recursively purges `uid`, `ownerUid`, `firebaseUid`, `secretKey`, `authId`, `authToken`, and `peerId`.
   - Reconciler timestamps and audit metadata strictly use `@${username}` mentions as client identifiers.
3. **Database Security Rules (`database.rules.json`)**:
   - Explicit index on `username` (`.indexOn: ["username"]`) for high-performance prefix autocomplete.
   - Role-based authorization matrix ensuring only room owners and editors can modify room data and metadata.


---

## 11. Academic Pipeline & Research Planning Benchmark

Jantt is designed to coordinate complex academic pipelines (such as PhD/MS admissions, scholarship competitions, thesis defenses, and visa pathways). Below is a minimal production benchmark:

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Ahmad Hassan — Global PhD/MS Application Pipeline",
    "description": "Concurrent admissions and scholarship pipeline with post-study PR pathways",
    "person": "Ahmad Hassan",
    "start": "2026-09-01",
    "end": "2027-03-31",
    "scale": "month",
    "showCriticalPath": true,
    "showBaselines": true,
    "currency": "USD",
    "budget": 5000
  },
  "categories": {
    "prep": { "label": "Exams & Transcripts", "color": "#F59E0B" },
    "germany": { "label": "Germany (DAAD & Direct)", "color": "#38BDF8" },
    "asia": { "label": "Asia (KAIST & SINGA)", "color": "#10B981" },
    "na": { "label": "North America (Direct PhD)", "color": "#A78BFA" }
  },
  "documents": [
    { "id": "doc-ielts", "label": "IELTS Academic TRF (Band 8.0+)", "status": "have", "owner": "Ahmad Hassan" },
    { "id": "doc-transcripts", "label": "HEC Attested Degree & Transcript", "status": "have", "owner": "Ahmad Hassan" },
    { "id": "doc-sop-germany", "label": "Research Statement (Distributed FL)", "status": "pending", "owner": "Ahmad Hassan" }
  ],
  "tasks": [
    {
      "id": "gre-exam",
      "wbs": "1.1",
      "label": "GRE General Exam & Score Transmission",
      "category": "prep",
      "start": "2026-09-01",
      "end": "2026-09-28",
      "progress": 0.8,
      "priority": "high",
      "assignee": "Ahmad Hassan"
    },
    {
      "id": "gate-prep",
      "wbs": "1.2",
      "label": "All Test Scores & Dossiers Finalized",
      "category": "prep",
      "start": "2026-09-30",
      "end": "2026-09-30",
      "milestone": true,
      "dependsOn": "gre-exam"
    },
    {
      "id": "daad-sub",
      "wbs": "2.1",
      "label": "DAAD Helmut-Schmidt Application Deadline",
      "category": "germany",
      "start": "2026-10-01",
      "end": "2026-10-31",
      "dependsOn": "gate-prep",
      "priority": "urgent",
      "assignee": "Ahmad Hassan",
      "notes": "Verified official DAAD portal deadline. Hard cutoff."
    },
    {
      "id": "singa-sub",
      "wbs": "3.1",
      "label": "Singapore SINGA Agency for Science & Tech Award",
      "category": "asia",
      "start": "2026-10-15",
      "end": "2026-12-01",
      "dependsOn": "gate-prep",
      "priority": "urgent",
      "assignee": "Ahmad Hassan"
    }
  ]
}
```

---

## 12. Personal Productivity & Time Blocking

For daily work, sprint planning, and time blocking:
1. **Daily Focus**: Switch the Date Filter subheader to **Today** to isolate active tasks.
2. **Weekly Sprints**: Select **This Week** to review commitments spanning Monday through Sunday.
3. **Dim vs Filter**:
   - Use **Dim Mode** to fade out future and completed tasks while preserving the surrounding roadmap context.
   - Use **Filter Mode** for zero-distraction focus on items due right now.
4. **Interactive Todo List**: Jump to the **Tasks** tab for a streamlined interactive checklist with one-click completion checkboxes and status updates.
