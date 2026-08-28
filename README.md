<div align="center">

# 📊 Jantt
### The Dependency-Free, AI-Native JSON Gantt Chart Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=flat-square)](https://www.npmjs.com/package/@jantt/core)
[![Tests](https://img.shields.io/badge/Tests-22%20passed-brightgreen?style=flat-square)](https://github.com/AhmadHassan-BTed/Jantt/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/AhmadHassan-BTed/Jantt/blob/main/CONTRIBUTING.md)

**Turn any declarative JSON file into a fully interactive, draggable, resizable, high-performance Gantt chart.**  
*Zero external runtime dependencies. 100% pure TypeScript. Works in Plain HTML, React, Node.js CLI, and AI agent toolchains.*

[Live Demo & Interactive Playground](http://localhost:5173/) • [Documentation](./docs/architecture.md) • [JSON Schema](./schema/jantt.schema.json) • [Roadmap](./ROADMAP.md)

</div>

---

## 💡 Why Jantt?

Most project plans, roadmaps, and schedule timelines are now **drafted or manipulated by AI agents** before a human ever looks at them. 

Existing Gantt chart libraries suffer from massive architectural flaws for modern workflows:
- **Heavy Imperative Setup**: They require hundreds of lines of imperative SDK code, complex event bindings, and proprietary runtime data structures.
- **Bloated Dependencies**: They pull in dozens of heavy date and math libraries, inflating bundle sizes.
- **Opaque State**: Syncing state back to disk or streaming incremental AI schedule updates requires complex bi-directional adapters.

**Jantt inverts this model**: **The JSON file *is* the application state.**  
Point Jantt at a JSON file — via a React component, `<script>` tag, or CLI command — and you instantly get a responsive Gantt chart that supports live dragging, resizing, dependency linking, and milestone tracking, writing all mutations directly back to declarative JSON.

---

## ⚡ Feature Matrix

| Capability | Jantt Engine (`@jantt/core`) | DHTMLX Gantt | Frappe Gantt | Mermaid.js |
|---|:---:|:---:|:---:|:---:|
| **Zero Runtime Dependencies** | ✅ **YES (0 deps)** | ❌ No | ❌ No | ❌ No |
| **Declarative JSON as App State** | ✅ **Native Contract** | ❌ Imperative API | ❌ Imperative | ❌ Text DSL |
| **Interactive Drag-to-Link** | ✅ **90° Orthogonal** | ✅ Yes | ❌ No | ❌ Static |
| **Multi-Scale Zoom (Day→Year)** | ✅ **5 Scales** | ✅ Yes | 🟡 Limited | ❌ No |
| **Critical Path Analysis** | ✅ **Built-in Solver** | 🟡 Commercial tier | ❌ No | ❌ No |
| **Milestones & Baselines** | ✅ **First-class** | 🟡 Commercial tier | ❌ No | 🟡 Milestones only |
| **Inline Progress Dragging** | ✅ **0%–100% Handle** | ✅ Yes | 🟡 Read-only | ❌ No |
| **Two-Way Sync CLI** | ✅ **Built-in** | ❌ No | ❌ No | ❌ No |
| **Bundle Size** | **< 14 KB gzip** | ~200 KB | ~35 KB | ~800 KB |

---

## 🏛️ System Architecture

```
                   ┌──────────────────────────────────────┐
                   │       Declarative JSON Document      │
                   │       (Jantt v1 Schema Contract)     │
                   └──────────────────┬───────────────────┘
                                      │
                                      ▼
                   ┌──────────────────────────────────────┐
                   │         @jantt/core Engine           │
                   │  ┌────────────────────────────────┐  │
                   │  │ 1. Schema & Graph Validator    │  │
                   │  └───────────────┬────────────────┘  │
                   │                  ▼                   │
                   │  ┌────────────────────────────────┐  │
                   │  │ 2. Schedule & Critical Path    │  │
                   │  │    Topological Resolver        │  │
                   │  └───────────────┬────────────────┘  │
                   │                  ▼                   │
                   │  ┌────────────────────────────────┐  │
                   │  │ 3. Multi-Scale Layout Engine   │  │
                   │  │    & 90° Orthogonal Router     │  │
                   │  └───────────────┬────────────────┘  │
                   │                  ▼                   │
                   │  ┌────────────────────────────────┐  │
                   │  │ 4. Modular DOM/SVG Renderers   │  │
                   │  └───────────────┬────────────────┘  │
                   │                  ▼                   │
                   │  ┌────────────────────────────────┐  │
                   │  │ 5. Interaction State Machine   │  │
                   │  └────────────────────────────────┘  │
                   └──────────────────┬───────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   @jantt/react   │        │ @jantt/standalone│        │    jantt CLI     │
│  <Jantt /> Prop  │        │   <script> Tag   │        │  Two-Way Sync    │
└──────────────────┘        └──────────────────┘        └──────────────────┘
```

---

## 🚀 Quickstarts

### 1. React Application (`@jantt/react`)

```bash
npm install @jantt/react @jantt/core
```

```tsx
import React, { useState } from "react";
import { Jantt } from "@jantt/react";
import "@jantt/core/dist/theme.css";

const initialPlan = {
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Metropolis High-Rise Construction",
    "scale": "week",
    "showCriticalPath": true,
    "showBaselines": true
  },
  "categories": {
    "civil": { "label": "Civil Engineering", "color": "#10B981" },
    "structure": { "label": "Superstructure", "color": "#8B5CF6" }
  },
  "tasks": [
    { "id": "T1", "label": "Foundation Excavation", "category": "civil", "start": "2026-09-01", "end": "2026-09-20", "progress": 1.0 },
    { "id": "T2", "label": "Steel Core Erection", "category": "structure", "start": "2026-09-22", "end": "2026-10-30", "dependsOn": "T1", "progress": 0.35 }
  ]
};

export function TimelineView() {
  const [plan, setPlan] = useState(initialPlan);

  return (
    <div style={{ width: "100%", height: "600px" }}>
      <Jantt
        data={plan}
        viewport={{ scale: "week", showCriticalPath: true }}
        onChange={(draft) => console.log("Live draft:", draft)}
        onCommit={(finalPlan) => {
          setPlan(finalPlan);
          // Persist to API, database, or localStorage
        }}
      />
    </div>
  );
}
```

---

### 2. Standalone HTML Script-Tag (`@jantt/standalone`)

No bundler, Node.js, or build step required:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="https://unpkg.com/@jantt/standalone/dist/style.css">
  <script src="https://unpkg.com/@jantt/standalone/dist/jantt.standalone.iife.js"></script>
</head>
<body>
  <div id="chart-mount" style="max-width: 1200px; margin: 40px auto;"></div>

  <script>
    fetch("./roadmap.json")
      .then(res => res.json())
      .then(data => {
        window.Jantt.mount(document.getElementById("chart-mount"), data, {
          onCommit: (updatedPlan) => {
            console.log("Updated plan JSON:", updatedPlan);
          }
        });
      });
  </script>
</body>
</html>
```

---

### 3. Local CLI with Live Two-Way Sync (`jantt`)

Open and edit any JSON file with automatic real-time saving back to disk:

```bash
# Open interactive browser chart with auto-save to file
npx jantt open ./examples/construction-enterprise.json

# Validate JSON file against Jantt schema from terminal
npx jantt validate ./examples/basic.json
```

---

### 4. Headless Core Engine (`@jantt/core`)

Use Jantt's constraint solver and date math headlessly in backend services or CLI tools:

```typescript
import { resolveSchedule, calculateCriticalPath, validate, exportToCsv } from "@jantt/core";

// 1. Validate payload
const validation = validate(rawJson);
if (!validation.valid) {
  console.error("Schema errors:", validation.errors);
}

// 2. Cascade topological schedules
const resolvedTasks = resolveSchedule(rawJson.tasks, 2);

// 3. Compute critical path bottleneck sequence
const { criticalTaskIds } = calculateCriticalPath(resolvedTasks);

// 4. Export to CSV spreadsheet
const csvData = exportToCsv({ ...rawJson, tasks: resolvedTasks });
```

---

## 📋 JSON Schema Specification

Every Jantt document conforms strictly to `https://jantt.dev/schema/v1.json`:

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Platform v2 Launch",
    "start": "2026-09-01",
    "end": "2027-02-28",
    "defaultGapDays": 2,
    "scale": "week",
    "showCriticalPath": true,
    "showBaselines": true
  },
  "categories": {
    "dev": { "label": "Engineering", "color": "#3B82F6", "soft": "#1E293B" },
    "milestone": { "label": "Milestones", "color": "#E11D48", "soft": "#881337" }
  },
  "tasks": [
    {
      "id": "design-system",
      "label": "Design System Tokens",
      "category": "dev",
      "start": "2026-09-01",
      "end": "2026-09-15",
      "progress": 1.0,
      "baseline": { "start": "2026-09-01", "end": "2026-09-12" }
    },
    {
      "id": "launch-milestone",
      "label": "Beta Release",
      "category": "milestone",
      "start": "2026-09-17",
      "end": "2026-09-17",
      "milestone": true,
      "dependsOn": "design-system",
      "gapDays": 2,
      "progress": 0.0
    }
  ]
}
```

---

## 🤖 Prompting LLMs for Jantt JSON

Hand this system prompt to ChatGPT, Claude, Gemini, or local LLMs to generate guaranteed valid Jantt timelines:

```markdown
You are a project timeline generator. You output only raw, valid JSON conforming strictly to the Jantt Schema (https://jantt.dev/schema/v1.json).

Rules:
1. Root must contain: "tasks": [{ "id", "label", "category", "start", "end", "dependsOn", "progress", "milestone", "baseline" }]
2. All dates must be ISO "YYYY-MM-DD"
3. All task categories must match keys declared in "categories"
4. Put custom domain metadata inside the "fields" object
5. Output ONLY raw JSON without markdown explanations.
```

---

## 🎨 Theming & CSS Variables

Jantt ships with built-in dark and light themes, completely customizable via CSS custom properties:

```css
:root {
  --jantt-bg: #0B111E;              /* Chart background */
  --jantt-surface: #141D2F;         /* Toolbar & left table surface */
  --jantt-surface-hover: #1A263D;   /* Hover state */
  --jantt-border: #24324B;          /* Border lines */
  --jantt-text: #F1F5F9;            /* Primary typography */
  --jantt-text-muted: #94A3B8;      /* Secondary typography */
  --jantt-accent: #38BDF8;          /* Active selection & ports */
  --jantt-today: #F43F5E;           /* Today indicator line */
  --jantt-critical: #F59E0B;        /* Critical path glowing line */
  --jantt-bar-radius: 6px;          /* Task bar corner radius */
}
```

---

## ⌨️ Keyboard Accessibility

| Key | Action |
|---|---|
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Navigate focus across task bars |
| <kbd>ArrowLeft</kbd> / <kbd>ArrowRight</kbd> | Move task start & end by 1 day (or `defaultGapDays` with <kbd>Alt</kbd>) |
| <kbd>Shift</kbd>+<kbd>ArrowLeft</kbd> / <kbd>Right</kbd> | Resize task duration |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Open task detail modal |
| <kbd>Escape</kbd> | Close modal / cancel active drag |

---

## 📦 Monorepo Packages

| Package | Version | Description |
|---|---|---|
| [`@jantt/core`](./packages/core) | `1.1.0` | Core Gantt layout, solver, and rendering engine (0 dependencies) |
| [`@jantt/react`](./packages/react) | `1.1.0` | React `<Jantt />` component |
| [`@jantt/standalone`](./packages/standalone) | `1.1.0` | Pre-bundled IIFE & UMD scripts for plain HTML |
| [`jantt`](./cli) | `1.1.0` | Node.js CLI runner for terminal opening and validation |
| [`@jantt/playground`](./apps/playground) | `1.1.0` | Interactive split-view sandbox & documentation app |

---

## 🛠️ Development & Contributing

We welcome contributions! Please review [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

```bash
# Clone repository
git clone https://github.com/AhmadHassan-BTed/Jantt.git
cd Jantt

# Install dependencies
npm install

# Run verification suite (22 unit tests)
npm test

# Launch local interactive development playground
npm run dev
```

---

## 📄 License

MIT © 2026 [Ahmad Hassan](https://github.com/AhmadHassan-BTed) & Jantt Contributors. See [LICENSE](./LICENSE) for details.
