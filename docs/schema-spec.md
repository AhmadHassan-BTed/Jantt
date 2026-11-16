# Jantt JSON Schema v1 Specification

**Schema Identifier**: `https://jantt.dev/schema/v1.json`  
**Live Resolving Schema**: [`schema/jantt.schema.json`](https://raw.githubusercontent.com/AhmadHassan-BTed/Jantt/main/schema/jantt.schema.json)  
**Web Endpoint**: [`https://ahmadhassan-bted.github.io/Jantt/schema/v1.json`](https://ahmadhassan-bted.github.io/Jantt/schema/v1.json)  
**Local Workspace Path**: [`schema/jantt.schema.json`](../schema/jantt.schema.json)  
**JSON Schema Dialect**: Draft-07

---

## Schema Overview

A valid Jantt JSON document is a single root object containing metadata, category styling configurations, team rosters, document checklists, and an array of task objects.

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": { ... },
  "categories": { ... },
  "calendars": { ... },
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
| `calendars` | `object` | Optional | Named working calendars (see [section 7](#7-working-calendars-calendars)) |
| `people` | `array` | Optional | Registry of team members, roles, and avatar colors |
| `teams` | `array` | Optional | Registry of organizational squads or departments |
| `notes` | `array` | Optional | Shared project documentation, meeting minutes, specs, and checklists |
| `documents` | `array` | Optional | Array of document/credential checklist items |
| `tasks` | `array` | **Required** | Array of task and milestone objects |

---

## 2. Meta Object (`meta`)

```json
{
  "title": "Ahmad Hassan - Global PhD/MS Application Pipeline",
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
| `defaultGapDays` | `number` | `2` | Days between a predecessor's end and the start of a finish-to-start successor when neither the link nor the task sets its own lag/`gapDays`. Tasks without dependencies are never moved. |
| `targetDate` | `string` | — | Contractual deadline (`YYYY-MM-DD`) for float (negative when breached) and PERT on-time probability |
| `autoCascade` | `boolean` | `true` | When `false` (Strict mode), edits never move dependent tasks; violations are reported as validation warnings |
| `calendar` | `string` \| `object` | — | Project working calendar: a preset (`"standard"`, `"continuous"`, `"compressed_4x10"`), an id from `calendars`, or an inline calendar |
| `useWorkingDays` | `boolean` | `true` when `calendar` is set | Skip weekends and holidays when cascading dates |
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
    "color": "#38BDF8",
    "email": "ahmadhassan.bted@gmail.com"
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
| `calendar` / `calendarId` | `string` \| `object` | Optional | Personal working calendar used for this person's tasks when working days are enabled. |

| Field (`teams[]`) | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | **Yes** | Unique team identifier referenced by `people[].teamId` and `tasks[].teamId`. |
| `name` | `string` | **Yes** | Display name. |
| `color` | `string` | Optional | Badge color. |
| `description` | `string` | Optional | Team summary or charter. |

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
  "estimatedCost": 1500,
  "dependsOn": ["ielts-exam", "transcripts:SS+2d"],
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
| `label` (or `name`) | `string` | Optional (recommended) | Human-readable title displayed on the bar and table; falls back to `id` |
| `category` | `string` | **Yes** | Category ID corresponding to a key in `categories` |
| `start` | `string` | **Yes** | Start date in ISO format (`YYYY-MM-DD`) |
| `end` | `string` | **Yes** | End date in ISO format (`YYYY-MM-DD`, `end >= start`). See [dates and durations](#dates-and-durations). |
| `wbs` | `string` | Optional | Work Breakdown Structure hierarchical index (e.g. `"1.0"`, `"2.1"`) |
| `assignee` | `string` | Optional | Responsible individual (`people[].id` or name) |
| `priority` | `string` | Optional | `"low"`, `"medium"`, `"high"`, `"urgent"` |
| `status` | `string` | Optional | `"not-started"`, `"in-progress"`, `"submitted"`, `"completed"` (alias `"done"`), `"blocked"` |
| `estimatedCost` / `actualCost` | `number` | Optional | Planned budget and actual expenditure |
| `dependsOn` | `string` \| `array` \| `object` \| `null` | Optional | Prerequisite links; see [dependency syntax](#dependency-syntax) |
| `gapDays` (or `minGapDays`) | `number` | Optional | Days between a predecessor's end and this task's start for finish-to-start links without an explicit lag (overrides `meta.defaultGapDays`; negative values allow overlap) |
| `progress` | `number` | Optional | Completion ratio between `0.0` (0%) and `1.0` (100%) |
| `milestone` | `boolean` | Optional | When `true`, renders as a 45° diamond pin and is scheduled with zero duration (keep `end` equal to `start`). A task with `start = end` is also drawn as a diamond. |
| `locked` | `boolean` | Optional | When `true`, the task is never moved by the cascade or by dragging; dependency violations are reported as warnings |
| `calendar` / `calendarId` | `string` \| `object` | Optional | Task-specific working calendar (always uses working-day scheduling) |
| `baseline` | `object` | Optional | Original planned dates (`{ start: "...", end: "..." }`) |
| `urgent` | `boolean` | Optional | Displays high-priority pulse indicator |
| `notes` | `string` | Optional | Markdown or text notes displayed in modal & tooltip |
| `color` | `string` | Optional | Bar color override; must be a plain CSS color (see [validation](#8-validation-results)), otherwise the category color is used |
| `pert` | `object` | Optional | Three-point estimate in days (`{ optimistic, mostLikely, pessimistic }`) for PERT and Monte Carlo |
| `fields` | `object` | Optional | Custom domain-specific key-value pairs (e.g. `optimisticDuration`, `mostLikelyDuration`, `pessimisticDuration` for PERT) |

### Dates and durations

- Dates are calendar days (`YYYY-MM-DD`); a well-formed time suffix such as `T09:00:00Z` is tolerated and ignored.
- The bar is drawn through the `end` day, while scheduling measures a task's duration as `end - start` days. A milestone has `end = start` and zero duration.
- A finish-to-start link with gap `g` therefore starts the successor `g` days after the predecessor's `end` date (the default gap of 2 leaves one free day between the bars).

### Dependency syntax

`dependsOn` accepts a single entry, a comma-separated string, or an array mixing strings and objects:

| Form | Meaning |
|---|---|
| `"design"` | Finish-to-start, gap = `gapDays` / `meta.defaultGapDays` |
| `"design:SS"` | Start-to-start with no lag (the gap is not applied to SS/FF/SF) |
| `"design:FS+0"` | Finish-to-start with an explicit zero lag (overrides the gap) |
| `"design:FF-1d"` | Finish-to-finish, successor may finish 1 day before the predecessor |
| `"design+3d"` | Finish-to-start with a 3-day lag |
| `{ "id": "design", "type": "SF", "lag": 2 }` | Object form (`lag` or `lagDays`, whole days within ±3650) |

Types: `FS` finish-to-start (default), `SS` start-to-start, `FF` finish-to-finish, `SF` start-to-finish. An entry that exactly matches an existing task id is always read as that id, so ids such as `"render-3d"` are safe. Unknown types, non-numeric or out-of-range lags, and entries that are neither strings nor objects are reported as `INVALID_DEPENDENCY`.

---

## 6. Notes Specification (`notes[]`)

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

## 7. Working Calendars (`calendars`)

Working calendars make the cascade skip non-working days. A calendar is referenced by preset name (`"standard"` Mon-Fri, `"continuous"` 7 days, `"compressed_4x10"` Mon-Thu), by id from `calendars`, or written inline. A task uses its own calendar, then its assignee's, then `meta.calendar`, then Monday-Friday.

```json
{
  "meta": { "calendar": "site", "useWorkingDays": true },
  "calendars": {
    "site": {
      "workingDays": [1, 2, 3, 4, 5, 6],
      "region": "UK",
      "holidays": ["2026-08-14", { "date": "2026-12-24", "name": "Shutdown" }],
      "exceptions": [{ "date": "2026-12-26", "isWorkingDay": true }]
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `workingDays` | `(number \| string)[]` | Weekdays `0` (Sun) - `6` (Sat) or names like `"Mon"`; invalid or empty lists fall back to Monday-Friday (with a validation warning) |
| `region` | `string` | Statutory holidays with weekend substitute days: `US` (federal), `UK`/`GB` (England & Wales), `EU`, `CA` (federal), `AU` (national) |
| `holidays` | `array` | Extra non-working dates (`"YYYY-MM-DD"` or `{ date, name }`) |
| `exceptions` | `array` | `{ date, isWorkingDay }` overrides that win over weekends and holidays |

---

## 8. Validation Results

`validate()` returns `{ valid, errors, warnings }`. **Errors** make the plan invalid: missing or duplicate ids, bad dates, unknown categories, dangling, circular or malformed dependencies, bad progress, `people`/`teams` entries without a string `id` and `name`, and notes whose `title`, `content` or `tags` have the wrong type. **Warnings** never block loading:

- locked tasks (or any task in Strict mode) that violate a dependency (`DEP_TIMING_CONFLICT`) and milestones with a duration (`MILESTONE_HAS_DURATION`);
- malformed calendars (`INVALID_CALENDAR`), an invalid `meta.targetDate` and dates outside the years 1900-2200 (`INVALID_DATE_RANGE`);
- colors (category, task, person, team, note) that are not plain CSS colors (`INVALID_COLOR`). Accepted: hex (`#abc`, `#aabbcc`, with optional alpha), `rgb()`/`hsl()`/`hwb()`/`lab()`/`lch()`/`oklab()`/`oklch()` with plain arguments, `var(--token)` and named colors. Renderers replace any other value with a default color;
- non-numeric `estimatedCost`/`actualCost`/`gapDays`, non-string task text (`label`, `name`, `assignee`, `description`, `notes`), task ids longer than 256 characters, avatars that are neither initials nor an `https:` URL, and malformed `meta.baselines` snapshots (`SCHEMA_MISMATCH`);
- notes attached to tasks that do not exist (`DANGLING_REFERENCE`) and invalid note timestamps.

Validation is advisory for rendering safety: every renderer escapes text and sanitizes colors itself, so a plan that fails validation still cannot inject markup.
