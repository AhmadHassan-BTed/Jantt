# Jantt JSON Schema v1 Specification

**Schema URI**: `https://jantt.dev/schema/v1.json`  
**JSON Schema Dialect**: Draft-07

---

## 📋 Schema Overview

A valid Jantt JSON document is a single object containing metadata, category configurations, document checklists, and an array of task objects.

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": { ... },
  "categories": { ... },
  "documents": [ ... ],
  "tasks": [ ... ]
}
```

---

## 1. Top-Level Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `$schema` | `string` | Optional | Schema URI (`https://jantt.dev/schema/v1.json`) |
| `meta` | `object` | Optional | Global project metadata, default gap, scale, and date bounds |
| `categories` | `object` | Optional | Map of category IDs to visual styles (label, color, soft) |
| `documents` | `array` | Optional | Array of document/credential checklist items |
| `tasks` | `array` | **Required** | Array of task and milestone objects |

---

## 2. Meta Object (`meta`)

```json
{
  "title": "Platform v2.0 Roadmap",
  "start": "2026-09-01",
  "end": "2027-02-28",
  "defaultGapDays": 2,
  "scale": "week",
  "showCriticalPath": true,
  "showBaselines": true
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `"Project Schedule"` | Title displayed in the chart toolbar |
| `start` | `string` | auto-computed | Earliest date shown on timeline (`YYYY-MM-DD`) |
| `end` | `string` | auto-computed | Latest date shown on timeline (`YYYY-MM-DD`) |
| `defaultGapDays` | `number` | `2` | Default spacing (in days) between dependent/sibling tasks |
| `scale` | `string` | `"day"` | Default timeline zoom level: `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` |
| `showCriticalPath` | `boolean` | `false` | Whether critical path highlights are enabled by default |
| `showBaselines` | `boolean` | `true` | Whether baseline comparison ghost bars are rendered |

---

## 3. Categories Dictionary (`categories`)

A dictionary mapping unique category keys to their color presentation:

```json
{
  "dev": {
    "label": "Core Engineering",
    "color": "#3B82F6",
    "soft": "#1E293B"
  },
  "design": {
    "label": "UI & Design System",
    "color": "#EC4899",
    "soft": "#831843"
  }
}
```

---

## 4. Task Object (`tasks[]`)

```json
{
  "id": "build-api",
  "label": "Build Core GraphQL API",
  "category": "dev",
  "start": "2026-09-01",
  "end": "2026-09-15",
  "dependsOn": "db-schema",
  "gapDays": 2,
  "progress": 0.85,
  "milestone": false,
  "locked": false,
  "urgent": true,
  "baseline": {
    "start": "2026-09-01",
    "end": "2026-09-12"
  },
  "notes": "Blocked until DB migrations land.",
  "fields": {
    "assignee": "Sarah Chen",
    "storyPoints": 13
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | **Yes** | Unique identifier for the task |
| `label` (or `name`) | `string` | Optional | Human-readable title displayed on the bar and table |
| `category` | `string` | **Yes** | Category ID corresponding to a key in `categories` |
| `start` | `string` | **Yes** | Start date in ISO format (`YYYY-MM-DD`) |
| `end` | `string` | **Yes** | End date in ISO format (`YYYY-MM-DD`, `end >= start`) |
| `dependsOn` | `string` \| `null` | Optional | ID of the prerequisite task |
| `gapDays` (or `minGapDays`) | `number` | Optional | Spacing (in days) between prerequisite end and task start |
| `progress` | `number` | Optional | Completion ratio between `0.0` (0%) and `1.0` (100%) |
| `milestone` | `boolean` | Optional | When `true` or duration is 0, renders as a 45° diamond pin |
| `locked` | `boolean` | Optional | When `true`, task is fixed in place and skipped by the cascade solver |
| `baseline` | `object` | Optional | Original planned dates (`{ start: "...", end: "..." }`) |
| `urgent` | `boolean` | Optional | Displays priority indicator |
| `notes` | `string` | Optional | Markdown or text notes displayed in modal & tooltip |
| `fields` | `object` | Optional | Custom domain-specific key-value pairs |
