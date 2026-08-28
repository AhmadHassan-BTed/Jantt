# Jantt — The JSON Gantt Chart Engine

> **Turn a single JSON file into a fully interactive Gantt chart** — draggable, resizable, click-for-detail, saveable. Zero runtime dependencies in core. Ready for plain webpages, React apps, CLI workflows, and AI toolchains.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Zero Runtime Deps](https://img.shields.io/badge/Dependencies-0_Runtime-green)](https://github.com/jantt/jantt)

---

## Why Jantt?

Most planning data — product roadmaps, university applications, construction timelines, sprint plans — now gets **drafted by an AI** before a human looks at it.

Static text tables don't visualize time, and existing Gantt libraries require complex imperative setup code. **Jantt inverts that: the JSON file *is* the entire app state.**

1. **Schema as Product**: Hand an LLM the formal JSON schema, and it outputs a valid schedule without SDK knowledge.
2. **Draft, then Commit**: Live drags/resizes are provisional until released, auto-cascading dependencies and spacing.
3. **Zero Backend Required**: Runs directly in the browser, in React, or on your laptop via CLI.
4. **CSS Variable Theming**: Style everything with CSS custom properties without fighting the host page.

---

## 60-Second Quickstarts

### 1. Plain Webpage (`<script>` Tag)

```html
<link rel="stylesheet" href="https://unpkg.com/@jantt/core/dist/theme.css" />
<div id="chart"></div>

<script src="https://unpkg.com/@jantt/standalone/dist/jantt.standalone.js"></script>
<script>
  const plan = {
    meta: { title: "Launch Roadmap", start: "2026-09-01", end: "2026-11-01" },
    categories: {
      dev: { label: "Development", color: "#3B82F6" },
      qa: { label: "Quality Assurance", color: "#F59E0B" }
    },
    tasks: [
      { id: "engine", label: "Core Engine", category: "dev", start: "2026-09-01", end: "2026-09-15" },
      { id: "testing", label: "Integration Tests", category: "qa", start: "2026-09-17", end: "2026-09-28", dependsOn: "engine", gapDays: 2 }
    ]
  };

  Jantt.mount("#chart", plan, {
    onCommit: (updatedPlan) => console.log("Committed state:", updatedPlan)
  });
</script>
```

---

### 2. React Component

```bash
npm install @jantt/react @jantt/core
```

```tsx
import React, { useState } from "react";
import { Jantt } from "@jantt/react";
import "@jantt/core/theme.css";
import initialData from "./plan.json";

export function RoadmapView() {
  const [plan, setPlan] = useState(initialData);

  return (
    <Jantt
      data={plan}
      onCommit={(nextPlan) => {
        setPlan(nextPlan);
        // Persist to local storage, database, or flat file
      }}
      theme={{
        accent: "#38BDF8",
        bg: "#0B111E"
      }}
    />
  );
}
```

---

### 3. CLI (Local File Editor)

Open and interactively edit any `.json` plan locally. Changes save directly back to the file on disk:

```bash
npx jantt open ./my-roadmap.json
```

Or validate a JSON file against the schema:

```bash
npx jantt validate ./my-roadmap.json
```

---

## The Jantt Schema Specification (v1)

Formal Schema: [`schema/jantt.schema.json`](./schema/jantt.schema.json)

```jsonc
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Project Roadmap",
    "start": "2026-09-01",
    "end": "2026-11-15",
    "defaultGapDays": 2
  },
  "categories": {
    "backend": { "label": "Backend Services", "color": "#10B981" },
    "frontend": { "label": "Frontend UI", "color": "#8B5CF6" }
  },
  "tasks": [
    {
      "id": "api-service",
      "label": "REST & GraphQL API",
      "category": "backend",
      "start": "2026-09-01",
      "end": "2026-09-18",
      "dependsOn": null,
      "locked": false,
      "progress": 0.75,
      "fields": {
        "lead": "Alex",
        "repo": "github.com/acme/api"
      }
    },
    {
      "id": "web-dashboard",
      "label": "Client Dashboard",
      "category": "frontend",
      "start": "2026-09-20",
      "end": "2026-10-08",
      "dependsOn": "api-service",
      "gapDays": 2,
      "locked": false,
      "progress": 0.2,
      "fields": {
        "figma": "figma.com/@acme/dash"
      }
    }
  ]
}
```

### Two Scheduling Mechanisms
1. **Explicit Dependency (`dependsOn`)**: A dependent task cannot start before `prerequisite.end + gapDays`. When the prerequisite shifts, the dependent auto-cascades forward while preserving its planned duration.
2. **Implicit Category Pacing**: Tasks sharing a `category` without an explicit `dependsOn` are automatically spaced by `meta.defaultGapDays` so adjacent tasks do not unintentionally collide.

---

## AI Prompt Snippet

Hand this prompt snippet to ChatGPT, Claude, Gemini, or any LLM:

```markdown
Here is the Jantt JSON Schema specification:
https://jantt.dev/schema/v1.json

Output only valid JSON conforming strictly to the Jantt Schema.
Rules:
- Root must contain "tasks": [{ "id": "...", "category": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "dependsOn": "prereq-id" | null, "gapDays": number | null }]
- All dates must be ISO "YYYY-MM-DD"
- All categories in tasks must match keys in the "categories" dictionary
- Use domain-specific properties inside the "fields" object
```

---

## Keyboard Navigation & Accessibility

Jantt is fully keyboard accessible:

| Key | Action |
|---|---|
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Navigate focus across task bars |
| <kbd>ArrowLeft</kbd> / <kbd>ArrowRight</kbd> | Move task start & end by 1 day (or `defaultGapDays` with <kbd>Alt</kbd>) |
| <kbd>Shift</kbd>+<kbd>ArrowLeft</kbd> / <kbd>Right</kbd> | Resize task duration |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Open detail modal |
| <kbd>Escape</kbd> | Close detail modal / cancel draft |

---

## CSS Variables Reference

Override these CSS custom properties to theme Jantt:

```css
:root {
  --jantt-bg: #0B111E;
  --jantt-surface: #141D2F;
  --jantt-border: #24324B;
  --jantt-text: #F1F5F9;
  --jantt-text-muted: #94A3B8;
  --jantt-accent: #38BDF8;
  --jantt-today: #F43F5E;
  --jantt-grid-line: #1E293B;
  --jantt-dep-line: #64748B;
  --jantt-dep-line-active: #38BDF8;
}
```

---

## Packages in Monorepo

- [`@jantt/core`](./packages/core): Zero-dependency pure TypeScript engine (validator, layout math, schedule resolver, DOM+SVG renderer).
- [`@jantt/react`](./packages/react): React `<Jantt />` component wrapper.
- [`@jantt/standalone`](./packages/standalone): UMD/IIFE bundle for `<script>` tag embedding.
- [`jantt` (CLI)](./cli): Local server for `npx jantt open <file.json>`.
- [`@jantt/playground`](./apps/playground): Split-view interactive documentation & JSON sandbox.

---

## License

MIT © 2026 Jantt Team
