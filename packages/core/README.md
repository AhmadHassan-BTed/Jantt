# @jantt/core

The framework-agnostic engine behind Jantt: JSON Gantt plan validation, schedule resolution, critical path and risk analytics, an interactive DOM renderer, and plan sync helpers.

[![TypeScript 5.4](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-38BDF8.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Capabilities

* **Schedule resolver**: pushes every unlocked task to the earliest start its dependencies allow (FS/SS/FF/SF links with lead/lag, task or project gap, optional working calendars), preserving durations. Runs in one topological pass; locked tasks never move and links inside a dependency cycle are ignored with a diagnostic.
* **Critical Path Method**: early/late start and finish, total and free float, near-critical tasks and driving paths.
* **Earned Value Management (ANSI/EIA-748)**: BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC and TCPI.
* **Schedule health audit** (DCMA-style checks such as missing logic, negative float and high float), **PERT** three-point estimates and **Monte Carlo** completion forecasts.
* **Resource leveling** and over-allocation detection, **baselines** and variance.
* **Interactive DOM renderer** (`Jantt.mount`): drag to move, resize, set progress and draw links, multi-select, keyboard editing, a task details drawer, light/dark themes and zoom from day to year.
* **Exporters**: RFC-4180 CSV (with spreadsheet formula-injection protection), JSON download, and an SVG snapshot of the rendered timeline (bars, milestones and dependency links).
* **Sync helpers**: plan reconciliation, share-link compression and Firebase Realtime Database room codecs.

---

## Installation

```bash
npm install @jantt/core
```

The interactive renderer needs the stylesheet:

```ts
import "@jantt/core/theme.css";
```

`@jantt/core` has one small runtime dependency (`fflate`, used for share-link compression).

---

## Usage

### 1. Headless Schedule Resolution & Critical Path

```typescript
import { resolveSchedule, calculateCriticalPath, validate } from "@jantt/core";
import type { JanttData } from "@jantt/core";

const projectData: JanttData = {
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Core Platform Initiative",
    "scale": "week"
  },
  "tasks": [
    {
      "id": "t1",
      "label": "Architecture RFC",
      "category": "core",
      "start": "2026-09-01",
      "end": "2026-09-14",
      "progress": 1.0
    },
    {
      "id": "t2",
      "label": "Core Implementation",
      "category": "core",
      "start": "2026-09-15",
      "end": "2026-10-15",
      "dependsOn": "t1",
      "progress": 0.4
    }
  ]
};

// 1. Validate against schema
const validation = validate(projectData);
if (!validation.valid) {
  console.error("Schema errors:", validation.errors);
}

// 2. Resolve the cascade (default gap: 2 days; pass an options object for calendars)
const resolvedTasks = resolveSchedule(projectData.tasks, 2);

// 3. Compute critical path driving sequence
const { criticalTaskIds } = calculateCriticalPath(resolvedTasks);
console.log("Critical path bottlenecks:", criticalTaskIds);
```

### 2. Interactive chart

```typescript
import { Jantt } from "@jantt/core";
import "@jantt/core/theme.css";

const chart = Jantt.mount(document.getElementById("chart")!, projectData, {
  onCommit: (plan) => save(plan) // fired once per finished edit (drag, keyboard, drawer)
});
```

`onChange` fires at most once per animation frame while a drag is in progress, and `onCommit` once when an edit is final. Later interactions never mutate the task array or the task objects of a payload (edits replace them), so `plan.tasks` is safe to keep in undo stacks or framework state. Pressing Escape (or a cancelled pointer) aborts a drag and restores the previous dates without a commit.

### 3. Exporting to CSV

```typescript
import { exportToCsv } from "@jantt/core";

const csvContent = exportToCsv(projectData);
console.log(csvContent);
```

Durations in the CSV are inclusive calendar days (a task from the 1st to the 5th lasts 5 days); milestones have a duration of 0.

### 4. Off-main-thread computation

```typescript
// jantt-worker.ts
import { installScheduleWorker } from "@jantt/core";
installScheduleWorker();

// app.ts (Vite: the "?worker&url" suffix bundles the worker script and returns its URL)
import { createScheduleWorkerClient } from "@jantt/core";
import workerUrl from "./jantt-worker.ts?worker&url";
const client = createScheduleWorkerClient(workerUrl);
const forecast = await client.runMonteCarlo(projectData, { iterations: 2000 });
```

With another bundler, pass the URL of the built worker script (a plain `new URL("./jantt-worker.ts", import.meta.url)` is copied as a raw asset, not compiled). Without a worker URL, or if the worker fails to load, the client still works, computing asynchronously on the main thread.

---

## Architecture

`@jantt/core` contains no UI framework bindings (see `@jantt/react`, `@jantt/vue`, `@jantt/svelte` and `@jantt/elements`). It ships as ES modules and CommonJS with TypeScript declarations.

```
@jantt/core/src
├── types.ts, constants.ts, utils.ts   # Plan types and shared helpers
├── date-math.ts, calendar.ts          # UTC date arithmetic, working calendars and holidays
├── dependencies.ts                    # Link parsing (FS/SS/FF/SF, lag) and dependency graph
├── validator.ts                       # Schema, reference and cycle checks
├── resolver.ts, pipeline/             # Schedule cascade (sanitize, cycle guard, cascade, CPM stages)
├── cpm.ts, evm.ts, pert.ts            # Critical path, earned value, PERT
├── monte-carlo.ts, resource-leveler.ts, baselines.ts, schedule-health.ts, team-resolver.ts
├── layout.ts, virtualizer.ts          # Date-to-pixel layout and dependency routing
├── renderer.ts, rendering/, renderers/, themes/, theme.css   # DOM renderer (Jantt.mount)
├── controller.ts, controller/         # Pointer/keyboard interaction state machine and gestures
├── sidebar.ts, detail-modal.ts        # Task details drawer (detail modal is its overlay alias)
├── exporter.ts, worker.ts             # CSV/JSON/SVG export, schedule worker client and protocol
└── reconciler.ts, reconciliation/, share-coder.ts, remote-sync.ts, firebase-sync.ts   # Sync
```

---

## License

MIT © [Ahmad Hassan (B-Ted)](https://github.com/AhmadHassan-BTed)
