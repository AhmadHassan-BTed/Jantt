# @jantt/interop

> **Interoperability engine for Jantt: Microsoft Project XML, Oracle Primavera P6 XER, CSV / TSV spreadsheets, and print-ready executive reports (HTML booklet & vector SVG)**

`@jantt/interop` bridges Jantt JSON plans with enterprise scheduling tools and C-suite reporting pipelines.

---

## 🚀 Features

- **Microsoft Project (.xml, MSPDI 2013–2021):** import and export with 4-type dependencies (`FS`, `SS`, `FF`, `SF`), lead/lag, working-day durations and Start-No-Earlier-Than constraints so MS Project keeps your dates. The Jantt task id and category round-trip through the *Jantt ID* / *Jantt Category* custom fields (Text1 / Text2).
- **Oracle Primavera P6 (.xer):** import and export of the `CALENDAR`, `PROJECT`, `PROJWBS`, `TASK` and `TASKPRED` tables. Import prefers actual, then early, then planned dates, maps status codes and milestones, applies each calendar's hours per day to lag, and handles files that contain several projects.
- **Spreadsheet CSV / TSV (RFC 4180):** two-way sync with Excel and Google Sheets. Import auto-detects `,` `;` and tab delimiters, normalizes common date formats (`11/1/2026`, `1.11.2026`, `1-Nov-26`, ISO timestamps, Excel serial numbers) and percentage progress, and also reads the columns of the `@jantt/core` `exportToCsv` CSV (as written by `@jantt/mcp`). Export neutralizes formulas (CSV injection, including full-width `＝ ＋ － ＠`) and adds a UTF-8 BOM so Excel shows accents correctly.
- **Executive report:** multi-page HTML booklet with ANSI/EIA-748 Earned Value Management (EVM) metrics, a schedule health score (A–F) built from selected DCMA checks (each listed with its result, limit and score deduction), a milestone checklist and auto-paginated vector SVG timelines. Cost figures read "n/a" when the plan has no budgets or no actual costs, and CPI says how much of the budget it covers. Save it as PDF from the browser's print dialog, or export the timeline as a standalone SVG.

Every exporter skips soft-deleted (`_deleted`) tasks and uses `label`, then `name`, then `id` as the task title. A task is a milestone only when it has `milestone: true`; a single-day task exports as a one-day activity (8 h), not a milestone.

### Field matrix

| Jantt field | MS Project XML | Primavera P6 XER | CSV |
| --- | --- | --- | --- |
| `id` | Text1 "Jantt ID" (import falls back to `t<UID>`) | `task_code` (renamed on cross-project collisions) | `ID` |
| `label` / `name` | `Name` | `task_name` | `Label` |
| `start`, `end` | `Start`, `Finish`, `Duration`, SNET constraint | actual → early → target dates | `Start`, `End` |
| `progress` | `PercentComplete` | `phys_complete_pct`, `status_code` | `Progress` (`45%`, `0.45` or `45`) |
| `milestone` | `Milestone` | `task_type` `TT_Mile` / `TT_FinMile` | `Milestone` (`TRUE`; import also accepts `yes`, `y`, `1`, `x`) |
| `category` | Text2 "Jantt Category"; on import of other files, the enclosing summary task's name | WBS node (`wbs_short_name`) | `Category` |
| `dependsOn` (type & lag) | `PredecessorLink` (`LagFormat` and `MinutesPerDay` honored) | `TASKPRED` (lag in calendar hours) | `DependsOn` (`a; b:SS+2d`) |
| `notes` / `description` | `Notes` | – | `Notes` |
| `owner` / `assignee`, `priority` | – | – | `Owner`, `Priority` |
| `status` | – | `TK_Active` → `in-progress`, `TK_Complete` → `completed` | `Status` |
| `estimatedCost` | – | – | `EstimatedCost` (finite numbers only) |

Exports write each dependency's effective lag, including a task or project default gap,
so schedule relationships survive import into formats without Jantt's gap settings. Imported
MS Project and Primavera links retain explicit zero lags. CSV uses a `json:`-prefixed
structured dependency field when task IDs contain commas or semicolons.

Not mapped: resources and assignments, costs (except the CSV `EstimatedCost` column), baselines, custom calendars (exports use a standard 5-day, 8-hour week) and P6 activity codes. MS Project summary rows, blank rows and inactive tasks are skipped on import.

---

## 📦 Installation

```bash
npm install @jantt/interop @jantt/core
```

---

## 💻 Usage Examples

### 1. Microsoft Project XML

```typescript
import { exportMsProjectXml, importMsProjectXml } from "@jantt/interop";
import type { JanttData } from "@jantt/core";

// Ingest an MS Project XML string (or the file's bytes)
const plan: JanttData = importMsProjectXml(xmlString, {
  onWarning: (message) => console.warn(message) // skipped rows, dropped links, ...
});

// Export back to MS Project XML
const xmlOutput = exportMsProjectXml(plan, { projectName: "Plant Upgrade", author: "PMO" });
```

### 2. Oracle Primavera P6 XER

```typescript
import { exportPrimaveraXer, importPrimaveraXer } from "@jantt/interop";

// Pass the raw bytes: P6 writes XER in the Windows ANSI code page by default
const plan = importPrimaveraXer(new Uint8Array(await file.arrayBuffer()), {
  projectId: "ALPHA" // optional: import one project of a multi-project file
});

// Export a P6 import set (CALENDAR, PROJECT, PROJWBS, TASK, TASKPRED)
const xerOutput = exportPrimaveraXer(plan, { projectCode: "PRJ-01" });
```

### 3. Spreadsheet CSV / TSV

```typescript
import { exportSpreadsheetCsv, importSpreadsheetCsv, decodeTextBytes } from "@jantt/interop";

const csv = exportSpreadsheetCsv(plan); // starts with a UTF-8 BOM; pass { bom: false } to omit it

const imported = importSpreadsheetCsv(bytesOrText, {
  delimiter: ";",     // optional; detected from the header row otherwise
  dateFormat: "dmy",  // optional; for ambiguous dates such as 03/04/2026
  onWarning: (message) => console.warn(message)
});

// decodeTextBytes turns file bytes into text (UTF-8 / UTF-16 BOMs, else Windows-1252)
const text = decodeTextBytes(bytes);
```

### 4. Executive Report (HTML booklet & SVG)

```typescript
import { exportExecutiveReportHtml, exportExecutiveReportSvg, downloadExecutiveReport } from "@jantt/interop";

// Standalone, print-ready HTML (landscape pages; use the browser's "Save as PDF")
const html = exportExecutiveReportHtml(plan.tasks, {
  title: "Q4 Mission Critical Roadmap",
  projectCode: "DEF-2026",
  author: "PMO",
  statusDate: "2026-11-16",
  tasksPerPage: 20,
  theme: "corporate", // "corporate" | "light" | "dark"
  includeEvm: true,
  includeHealth: true,
  includeMilestones: true,
  includeTimeline: true,
  // Pass the plan's scheduling settings so the critical path matches the chart
  defaultGapDays: plan.meta?.defaultGapDays,
  targetDate: plan.meta?.targetDate
});

// Standalone vector SVG timeline (for Illustrator, Inkscape, Figma, ...)
const svg = exportExecutiveReportSvg(plan.tasks, { title: "Q4 Roadmap", statusDate: "2026-11-16" });

// Or trigger a direct browser download of the HTML report
downloadExecutiveReport(plan.tasks, { title: "Executive Report" }, "Q4-Roadmap-Report.html");
```

### Errors

The importers throw a descriptive `Error` when a file is not in the expected format (no MSPDI `<Project>` root, no XER `ERMHDR` / `TASK` table, no recognizable CSV header) or contains no importable tasks, instead of returning an empty plan. Recoverable problems are reported through `onWarning`.

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)
