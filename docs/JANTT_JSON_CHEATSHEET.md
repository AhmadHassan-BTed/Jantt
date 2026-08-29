# Jantt JSON Specification & Benchmark Cheatsheet

> **Version**: 1.2.0  
> **Schema Definition**: `https://jantt.dev/schema/v1.json`  
> **Target Standard**: Swiss Modernism 2.0 / Enterprise Project Management Standard

This document is the official benchmark cheatsheet and reference guide for authoring, validating, and generating **Jantt JSON** datasets for Gantt charts, Kanban boards, and project management applications.

---

## 1. Top-Level Structure

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": { ... },
  "categories": { ... },
  "documents": [ ... ],
  "tasks": [ ... ]
}
```

| Key | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `$schema` | `string` | No | Schema URI identifier |
| `meta` | `object` | No | Project-wide configuration, timeline bounds, and rendering options |
| `categories` | `object` | Yes | Map of category IDs to display labels, brand colors, and icons |
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
