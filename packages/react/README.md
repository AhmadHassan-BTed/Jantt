# @jantt/react

Official React component for the Jantt declarative Gantt chart engine. Turn any declarative JSON document into a high-performance, interactive, draggable Gantt timeline with zero boilerplate.

[![TypeScript 5.4](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-38BDF8.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Features

* **Zero-Setup Declarative Component**: Mounts directly via `<Jantt data={plan} />`.
* **Interactive Drag-to-Link & Resizing**: Circular connector ports, 90° CAD orthogonal line routing, duration resizing, and inline progress adjustments.
* **Controlled & Uncontrolled State**: Supports `onChange` for transient pointer drags and `onCommit` for finalized schedule state.
* **Curated Design Systems**: Out-of-the-box Swiss Noir (default dark mode), Swiss Light, Cyber Emerald, Midnight Rose, Sunset Crimson, Nordic Frost, and Pink Beenie.
* **Server Components ready**: the bundle ships with a `"use client"` directive, so `<Jantt>` can be imported straight into a Next.js App Router page.
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
import "@jantt/core/theme.css";

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

## Controlled vs. uncontrolled

The chart keeps its own state for everything the user changes inside it: zoom and scale, the
critical-path, baseline and auto-cascade toggles, row height and the header date filter.

* A prop is applied when **its value changes**. Re-rendering with the same `viewport`, `selectedDate`
  or `autoCascade` value never resets what the user did in the toolbar, so you can pass an initial
  `viewport={{ scale: "week" }}` and still let the user zoom.
* To fully control a setting, mirror it back from `onViewportChange` / `onDayWidthChange` (as with
  any controlled input).
* Passing back the plan the chart just emitted through `onCommit` or `onChange` does not re-render it.
* When `data` is unchanged, a prop change keeps the user's latest edits instead of reverting to `data`.

---

## Component Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `JanttData` | Required | Declarative JSON schedule document. |
| `locale` | `string` | `"en"` | Built-in timeline, toolbar, and task-details language. Supports `en` and Simplified Chinese (`zh-CN`). Other values use English. |
| `labels` | `Partial<TimelineLabels>` | `undefined` | Custom timeline labels that override the selected language's defaults. |
| `viewport` | `ViewportOptions` | `undefined` | Scale, `dayWidth`, `linkRouting`, `rowHeight`, `rowHeightMode`, `showCriticalPath`, `showBaselines`, `labelWidth`, `showToday`, `showWeekends`, `columns`, ... Without `scale`, the chart uses `meta.scale`, then `"day"`. Applied when a value changes (see above). |
| `readOnly` | `boolean` | `false` | Locks task bars and prevents user mutations. |
| `autoCascade` | `boolean` | `meta.autoCascade`, then `true` | Shift dependent tasks while dragging a predecessor. |
| `selectedDate` | `string \| null` | `undefined` | Active header date filter (`YYYY-MM-DD`); `null` clears it. |
| `filterTasksByDate` | `boolean` | `true` | Clicking a header date filters the rows to that date. |
| `showDateFilterBadge` | `boolean` | `true` | Shows the active date-filter badge in the toolbar. |
| `searchQuery` | `string` | `""` | Initial toolbar search text (initial only). |
| `theme` | `Record<string, string>` | `undefined` | CSS variable overrides, e.g. `{ accent: "#38BDF8" }` or `{ "--jantt-accent": "#38BDF8" }`. |
| `themeClassName` | `string` | `undefined` | Built-in theme class: `jantt-theme-light`, `jantt-theme-dark`, `jantt-theme-cyber-emerald`, `jantt-theme-midnight-rose`, `jantt-theme-nordic-frost`, `jantt-theme-sunset-crimson`, `jantt-theme-beenie`. |
| `className` | `string` | `""` | Extra class name on the wrapper element. |
| `style` | `React.CSSProperties` | `undefined` | Inline style merged into the wrapper element. |
| `sidebarContainer` | `HTMLElement \| string` | `undefined` | Element or selector that hosts the task detail panel. |
| `renderDetail` | `(task, container, api) => void` | `undefined` | Custom task detail renderer; `api.updateTask(patch)` and `api.close()`. |
| `isMobile` | `boolean` | `false` | Compact mobile layout. |
| `disableDragOnTouch` | `boolean` | `true` | Keeps touch gestures for scrolling instead of dragging bars. |
| `onChange` | `(draft: JanttData) => void` | `undefined` | Fired during live pointer interactions. |
| `onCommit` | `(final: JanttData) => void` | `undefined` | Fired when an edit is finalized, with resolved constraints. |
| `onTaskClick` | `(task: Task) => void` | `undefined` | A task bar or row was clicked. |
| `onTaskAdd` | `(task: Task) => void` | `undefined` | A task was added from the chart. |
| `onTaskDelete` | `(taskId: string) => void` | `undefined` | A task was deleted from the chart. |
| `onLinkCreate` | `(fromTaskId: string, toTaskId: string) => void` | `undefined` | A dependency was drawn between two tasks. |
| `onLinkDelete` | `(fromTaskId: string, toTaskId: string) => void` | `undefined` | A dependency was removed. |
| `onViewportChange` | `(viewport: ViewportOptions) => void` | `undefined` | Scale, zoom, toggles or date filter changed inside the chart. |
| `onDayWidthChange` | `(dayWidth: number) => void` | `undefined` | Zoom level changed (wheel, slider, column drag). |
| `onDateClick` | `(date: string) => void` | `undefined` | A header date was clicked. |
| `onClearDateFilter` | `() => void` | `undefined` | The date filter badge was cleared. |
| `onOpenAutoSave` / `onImportJson` / `onExportJson` / `onExportCsv` | `() => void` | `undefined` | Toolbar menu actions; the related menu entries appear when provided. |
| `onError` | `(error: Error) => void` | `undefined` | Render, update and interaction errors. Without it, errors are logged to the console; a failed render never unmounts your app and is retried when the props change. |

---

Pass your app's reactive language to the chart with `<Jantt data={plan} locale={appLocale} />`. Zoom and plan state are preserved when the language changes. An open task drawer uses the new language when reopened.

---

## License

MIT © [Ahmad Hassan (B-Ted)](https://github.com/AhmadHassan-BTed)
