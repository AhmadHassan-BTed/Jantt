# @jantt/react

Official React component for the Jantt declarative Gantt chart engine. Turn any declarative JSON document into a high-performance, interactive, draggable Gantt timeline with zero boilerplate.

[![TypeScript 5.4](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-38BDF8.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Features

* **Zero-Setup Declarative Component**: Mounts directly via `<Jantt data={plan} />`.
* **Interactive Drag-to-Link & Resizing**: Circular connector ports, 90° CAD orthogonal line routing, duration resizing, and inline progress adjustments.
* **Controlled & Uncontrolled State**: Supports `onChange` for transient pointer drags and `onCommit` for finalized schedule state.
* **Curated Design Systems**: Out-of-the-box Swiss Noir (default dark mode), Swiss Light, Cyber Emerald, Midnight Rose, and Sunset Crimson.
* **Accessibility**: Full keyboard navigation (<kbd>Tab</kbd>, <kbd>ArrowLeft</kbd>/<kbd>ArrowRight</kbd>, <kbd>Enter</kbd>) and ARIA landmarks.

---

## Installation

```bash
npm install @jantt/react @jantt/core
```

---

## Quickstart

```tsx
import React, { useState } from "react";
import { Jantt } from "@jantt/react";
import type { JanttData } from "@jantt/core";
import "@jantt/core/dist/theme.css";

const initialPlan: JanttData = {
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Autonomous Agent Workspace",
    "scale": "week",
    "showCriticalPath": true,
    "showBaselines": true
  },
  "categories": {
    "infra": { "label": "Infrastructure", "color": "#38BDF8" },
    "feature": { "label": "Product Features", "color": "#10B981" }
  },
  "tasks": [
    {
      "id": "t1",
      "label": "Orchestrator Setup",
      "category": "infra",
      "start": "2026-09-01",
      "end": "2026-09-12",
      "progress": 1.0,
      "status": "completed"
    },
    {
      "id": "t2",
      "label": "Declarative UI Integration",
      "category": "feature",
      "start": "2026-09-14",
      "end": "2026-09-30",
      "dependsOn": "t1",
      "progress": 0.5,
      "status": "in-progress"
    }
  ]
};

export function App() {
  const [data, setData] = useState<JanttData>(initialPlan);

  return (
    <div style={{ width: "100%", height: "650px" }}>
      <Jantt
        data={data}
        viewport={{ scale: "week", showCriticalPath: true }}
        onChange={(draft) => console.log("Live drag position:", draft)}
        onCommit={(finalPlan) => {
          console.log("Committed state:", finalPlan);
          setData(finalPlan);
        }}
      />
    </div>
  );
}
```

---

## Component Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `JanttData` | Required | Declarative JSON schedule document. |
| `viewport` | `Partial<ViewportState>` | `{ scale: "week" }` | Active scale (`day`, `week`, `month`, `quarter`, `year`), critical path toggle, baseline toggle. |
| `readOnly` | `boolean` | `false` | Locks task bars and prevents user mutations. |
| `onChange` | `(draft: JanttData) => void` | `undefined` | Fired during live pointer interactions. |
| `onCommit` | `(data: JanttData) => void` | `undefined` | Fired upon pointer release with resolved constraints. |
| `className` | `string` | `""` | Custom CSS wrapper class name. |
| `style` | `React.CSSProperties` | `undefined` | Custom inline container style. |

---

## License

MIT © [Ahmad Hassan (B-Ted)](https://github.com/AhmadHassan-BTed)
