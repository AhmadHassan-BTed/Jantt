# Jantt JSON Schema v1 Specification

**Schema URI**: `https://jantt.dev/schema/v1.json`  
**JSON Schema Dialect**: Draft-07

---

## Schema Overview

A valid Jantt JSON document is a single root object containing metadata, category styling configurations, team rosters, document checklists, and an array of task objects.

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

---

## 1. Top-Level Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `$schema` | `string` | Optional | Schema URI (`https://jantt.dev/schema/v1.json`) |
| `meta` | `object` | Optional | Global project metadata, default gap, scale, currency, and date bounds |
| `categories` | `object` | Optional | Map of category IDs to visual styles (label, color, soft) |
| `people` | `array` | Optional | Registry of team members, roles, and avatar colors |
| `teams` | `array` | Optional | Registry of organizational squads or departments |
| `notes` | `array` | Optional | Shared project documentation, meeting minutes, specs, and checklists |
| `documents` | `array` | Optional | Array of document/credential checklist items |
| `tasks` | `array` | **Required** | Array of task and milestone objects |

---

## 2. Meta Object (`meta`)

```json
{
  "title": "Ahmad Hassan — Global PhD/MS Application Pipeline",
  "description": "Concurrent, deadline-driven admissions plan and funding tracker",
  "person": "Ahmad Hassan",
  "start": "2026-09-01",
  "end": "2027-02-28",
  "defaultGapDays": 2,
  "scale": "week",
  "linkRouting": "orthogonal",
  "showCriticalPath": true,
  "showBaselines": true,
  "currency": "USD",
  "budget": 250000
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `"Project Schedule"` | Title displayed in the chart toolbar |
| `description` | `string` | `""` | Narrative description of scope or research program |
| `person` | `string` | `""` | Project lead or candidate name (automatically discovered) |
| `start` | `string` | auto-computed | Earliest date shown on timeline (`YYYY-MM-DD`) |
| `end` | `string` | auto-computed | Latest date shown on timeline (`YYYY-MM-DD`) |
| `defaultGapDays` | `number` | `2` | Default spacing (in days) between dependent/sibling tasks |
| `scale` | `string` | `"day"` | Default timeline zoom level: `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` |
| `linkRouting` | `string` | `"orthogonal"` | Connector line routing style: `"orthogonal"`, `"curved"`, `"direct"` |
| `showCriticalPath` | `boolean` | `false` | Whether critical path highlights are enabled by default |
| `showBaselines` | `boolean` | `true` | Whether baseline comparison ghost bars are rendered |
| `currency` | `string` | `"USD"` | Currency code for budgets and expenditures (`USD`, `EUR`, `PKR`, etc.) |
| `budget` | `number` | `0` | Total approved project budget figure |

---

## 3. Categories Dictionary (`categories`)

A dictionary mapping unique category keys to their color presentation:

```json
{
  "admissions": {
    "label": "Direct Admissions",
    "color": "#38BDF8",
    "soft": "rgba(56, 189, 248, 0.15)"
  },
  "scholarships": {
    "label": "Fellowships & Grants",
    "color": "#10B981",
    "soft": "rgba(16, 185, 129, 0.15)"
  }
}
```

---

## 4. People & Teams (`people[]`, `teams[]`)

Jantt defines a single source of truth for all human assignees and squads, cleanly separating real registered GitHub accounts from offline / non-account personas:

```json
"people": [
  {
    "id": "@ahmadhassan",
    "name": "Ahmad Hassan",
    "username": "@ahmadhassan",
    "role": "Project Lead / Principal Investigator",
    "teamId": "research",
    "color": "#38BDF8"
  },
  {
    "id": "person-contractor",
    "name": "Sarah Miller",
    "role": "External Specialist",
    "teamId": "research",
    "color": "#10B981"
  }
],
"teams": [
  {
    "id": "research",
    "name": "Distributed Computing Lab",
    "color": "#10B981"
  }
]
```

| Field (`people[]`) | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | **Yes** | Unique identifier: canonical mention `@username` for real accounts, or standard slug `person-xxx` for offline personas. |
| `name` | `string` | **Yes** | Full display name. |
| `username` | `string` | Optional | Canonical GitHub username mention (e.g. `@username`). Stored when the user is a registered account. |
| `role` | `string` | Optional | Job title, role, or position. |
| `teamId` | `string` | Optional | Identifier referencing an entry in `teams[]`. |
| `avatar` | `string` | Optional | Avatar image URL or fallback initial indicator. |
| `color` | `string` | Optional | Hex/RGB avatar accent color. |
| `email` | `string` | Optional | Email address of the team member. |

> **Single Source of Truth & Zero Internal Database IDs in JSON**:  
> Internal database UIDs, owner UIDs, or private tokens are strictly forbidden from appearing in the plan JSON document. Tasks assigned to registered accounts reference the exact mention handle (`assignee: "@username"`). For offline dummy personas, tasks reference `assignee: "person-xxx"` or `name`. This ensures 100% coherence between the database and the JSON model.

---

## 5. Task Object (`tasks[]`)

```json
{
  "id": "daad-application",
  "wbs": "1.1",
  "label": "DAAD Helmut-Schmidt Fellowship Application",
  "category": "scholarships",
  "start": "2026-09-01",
  "end": "2026-10-31",
  "assignee": "Ahmad Hassan",
  "priority": "urgent",
  "status": "in-progress",
  "cost": 1500,
  "dependsOn": "ielts-exam",
  "gapDays": 2,
  "progress": 0.4,
  "milestone": false,
  "locked": false,
  "baseline": {
    "start": "2026-09-01",
    "end": "2026-10-25"
  },
  "notes": "Verified official DAAD deadline. Documents require certified translation.",
  "fields": {
    "scholarshipValue": "Full tuition + 1,200 EUR/month",
    "portalUrl": "https://www.daad.de/portal"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | **Yes** | Unique identifier for the task |
| `label` (or `name`) | `string` | **Yes** | Human-readable title displayed on the bar and table |
| `category` | `string` | **Yes** | Category ID corresponding to a key in `categories` |
| `start` | `string` | **Yes** | Start date in ISO format (`YYYY-MM-DD`) |
| `end` | `string` | **Yes** | End date in ISO format (`YYYY-MM-DD`, `end >= start`) |
| `wbs` | `string` | Optional | Work Breakdown Structure hierarchical index (e.g. `"1.0"`, `"2.1"`) |
| `assignee` | `string` | Optional | Responsible individual or role |
| `priority` | `string` | Optional | `"low"`, `"medium"`, `"high"`, `"urgent"` |
| `status` | `string` | Optional | `"pending"`, `"in-progress"`, `"completed"`, `"blocked"` |
| `cost` / `estimatedCost` | `number` | Optional | Budget allocation or expected expenditure |
| `dependsOn` | `string` \| `string[]` \| `null` | Optional | Single prerequisite ID or array of IDs |
| `gapDays` (or `minGapDays`) | `number` | Optional | Spacing (in days) between prerequisite end and task start |
| `progress` | `number` | Optional | Completion ratio between `0.0` (0%) and `1.0` (100%) |
| `milestone` | `boolean` | Optional | When `true` or duration is 0, renders as a 45° diamond pin |
| `locked` | `boolean` | Optional | When `true`, task is fixed in place and skipped by the cascade solver |
| `baseline` | `object` | Optional | Original planned dates (`{ start: "...", end: "..." }`) |
| `urgent` | `boolean` | Optional | Displays high-priority pulse indicator |
| `notes` | `string` | Optional | Markdown or text notes displayed in modal & tooltip |
| `fields` | `object` | Optional | Custom domain-specific key-value pairs |

---

## 4. Notes Specification (`notes[]`)

Shared project documentation, meeting minutes, architecture RFCs, and decision logs stored directly in the project JSON.

```json
{
  "notes": [
    {
      "id": "note-arch-rfc",
      "title": "Topological Schedule Solver RFC",
      "content": "Specifying graph resolution with @Alice and reviewing /T1 delivery milestones.",
      "color": "#3B82F6",
      "pinned": true,
      "category": "Architecture",
      "tags": ["RFC", "Core"],
      "task_ids": ["T1", "T2"],
      "createdAt": "2026-09-01T10:00:00Z",
      "updatedAt": "2026-09-05T12:00:00Z"
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | **Yes** | Unique identifier for the note (e.g. `"note-1"`) |
| `title` | `string` | **Yes** | Note title displayed in gallery and editor |
| `content` | `string` | **Yes** | Markdown note body (supports `@person` tagging and `/task-id` mentions) |
| `color` | `string` | Optional | Hex accent tint (e.g. `"#3B82F6"`, `"#10B981"`) |
| `pinned` | `boolean` | Optional | When `true`, pinned to top of the notes gallery |
| `task_ids` | `string[]` | Optional | Array of explicitly attached task IDs |
| `tags` | `string[]` | Optional | Categorization tags |
| `createdAt` | `string` | Optional | ISO 8601 creation timestamp |
| `updatedAt` | `string` | Optional | ISO 8601 last-modified timestamp |

---

## 5. People & Teams Specification (`people[]`, `teams[]`)

```json
{
  "teams": [
    { "id": "eng", "name": "Engineering", "color": "#3B82F6", "description": "Core software team" }
  ],
  "people": [
    { "id": "p-ahmad", "name": "Ahmad Hassan", "teamId": "eng", "role": "Lead Architect", "color": "#10B981" }
  ]
}
```

| Entity | Fields | Description |
|---|---|---|
| **`teams[]`** | `id` (*required*), `name` (*required*), `color`, `description` | Workload squad group with color badges |
| **`people[]`** | `id` (*required*), `name` (*required*), `teamId`, `role`, `color`, `avatar` | Registered team member with avatar initials and task allocations |
