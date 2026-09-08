# @jantt/core

The zero-runtime-dependency mathematical engine and algorithmic foundation for declarative Gantt charts, critical path analysis, and project schedule validation.

[![TypeScript 5.4](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zero Runtime Dependencies](https://img.shields.io/badge/Dependencies-0%20Runtime-10B981?style=flat-square)](https://www.npmjs.com/package/@jantt/core)
[![Tests Passing](https://img.shields.io/badge/Tests-339%2F339%20Passing-brightgreen?style=flat-square)](https://github.com/AhmadHassan-BTed/Jantt)
[![License: MIT](https://img.shields.io/badge/License-MIT-38BDF8.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Capabilities

* **Topological Schedule Resolver**: 2-pass Activity-on-Node (AON) DAG solver that cascades predecessor offsets and respects `locked: true` milestones.
* **Operations Research Critical Path Engine**: Calculates Early/Late Start ($ES, LS$), Early/Late Finish ($EF, LF$), Total Float ($TF$), and Free Float ($FF$). Zero-float driving paths are mathematically flagged.
* **Earned Value Management (EVM - ANSI/EIA-748)**: Computes $BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI$ for project health and cost variance.
* **DCMA 14-Point Schedule Health Audit**: Validates schedules against defense-grade standards (Missing Logic, Negative Float, High Float $>44$ days).
* **PERT 3-Point Risk & Confidence Bounds**: Beta-distribution expected duration ($\mu = \frac{O + 4M + P}{6}$) and Central Limit Theorem normal distribution confidence intervals.
* **Multi-Scale Coordinate Mapper**: Translates dates and task metadata into precise SVG/DOM coordinates across Day, Week, Month, Quarter, and Year zoom levels with 90° CAD orthogonal line routing.
* **Client-Side Exporters**: RFC-4180 compliant CSV spreadsheet generator and standalone SVG export.

---

## Installation

```bash
npm install @jantt/core
```

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

// 2. Resolve topological cascade (default gap: 2 days)
const resolvedTasks = resolveSchedule(projectData.tasks, 2);

// 3. Compute critical path driving sequence
const { criticalTaskIds } = calculateCriticalPath(resolvedTasks);
console.log("Critical path bottlenecks:", criticalTaskIds);
```

### 2. Exporting to CSV

```typescript
import { exportToCsv } from "@jantt/core";

const csvContent = exportToCsv(projectData);
console.log(csvContent);
```

---

## Architecture

`@jantt/core` contains zero UI framework bindings and zero external runtime dependencies. It compiles down to pure modern ES modules and CommonJS definitions under 14 KB gzipped.

```
@jantt/core
├── src/
│   ├── cpm.ts              # Operations Research Critical Path & Float
│   ├── evm.ts              # Earned Value Management (EVM ANSI/EIA-748)
│   ├── dcma14.ts           # DCMA 14-point schedule audit
│   ├── date-math.ts        # Pure UTC calendar arithmetic
│   ├── validator.ts        # Schema, cycle, and graph integrity checker
│   ├── resolver.ts         # Topological DAG constraint relaxation
│   ├── layout.ts           # Coordinate math & 90° CAD orthogonal routing
│   ├── controller.ts       # Pointer event state machine for drag/resize
│   └── exporter.ts         # CSV, SVG, and JSON exporters
└── tests/                  # 339 unit tests across 22 test suites
```

---

## License

MIT © [Ahmad Hassan (B-Ted)](https://github.com/AhmadHassan-BTed)
