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

```json
"people": [
  {
    "id": "ahmad-hassan",
    "name": "Ahmad Hassan",
    "role": "Project Lead / Owner",
    "teamId": "research",
    "color": "#38BDF8"
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
| `id` | `string` | **Yes** | Unique identifier (slug or code) |
| `name` | `string` | **Yes** | Full display name |
| `role` | `string` | Optional | Job title, role, or position |
| `teamId` | `string` | Optional | Identifier referencing an entry in `teams[]` |
| `color` | `string` | Optional | Hex/RGB avatar accent color |

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
