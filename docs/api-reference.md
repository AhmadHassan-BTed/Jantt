# Jantt API Reference

Reference for the public surface of every package in the Jantt ecosystem. The generated
typings shipped with each package (`dist/index.d.ts`) are the authoritative, complete list of
exports and signatures; this page explains the parts you will use most.

All packages are published under the `@jantt` npm scope and require Node.js `^20.19.0 || >=22.12.0`
where they run on Node (CLI, MCP server, headless core).

---

## `@jantt/core`

Framework-agnostic engine: validation, scheduling, layout, analytics and the interactive DOM
renderer. One runtime dependency: [`fflate`](https://www.npmjs.com/package/fflate), used for
compressed share links.

```typescript
import { renderJantt, validate, resolveSchedule, calculateCriticalPath, exportToCsv } from "@jantt/core";
import "@jantt/core/theme.css"; // required once for the interactive chart
```

Stylesheet subpaths: `@jantt/core/theme.css` (preferred), `@jantt/core/style.css` and
`@jantt/core/dist/theme.css` all resolve to the same file.

### `renderJantt(container, data, options?): JanttInstance`
Mounts an interactive Gantt chart into an `HTMLElement`.

- `container: HTMLElement`: target element.
- `data: JanttData`: the plan, conforming to the [Jantt JSON Schema](./schema-spec.md).
- `options?: JanttOptions`:
  - `viewport?: ViewportOptions`: `scale` (`"day" | "week" | "month" | "quarter" | "year"`),
    `dayWidth`, `rowHeight` (default 46), `rowHeightMode` (`"custom" | "fit"`), `linkRouting`
    (`"orthogonal" | "curved" | "direct"`), `showCriticalPath`, `showBaselines`, `showToday`,
    `showWeekends`, `autoCascade`, `defaultGapDays`, `columns`, `selectedDate`, and more.
  - `themeClassName?: string`: built-in theme class, e.g. `"jantt-theme-dark"` (Swiss Dark) or
    `"jantt-theme-light"` (Swiss Light). `themeManager.getAllThemes()` lists every theme with its
    `className`.
  - `theme?: Record<string, string>`: CSS variable overrides; keys map to `--jantt-<key>`
    (for example `{ accent: "#38BDF8" }`).
  - `className`, `readOnly`, `autoCascade`, `searchQuery`, `selectedDate`, `sidebarContainer`,
    `disableDragOnTouch`, `isMobile`.
  - Callbacks: `onCommit(final)`, `onChange(draft)`, `onViewportChange`, `onTaskClick`,
    `onTaskAdd`, `onTaskDelete`, `onLinkCreate`, `onLinkDelete`, `onDateClick`,
    `onClearDateFilter`, `onDayWidthChange`, `onError`, `renderDetail`.

**Returns `JanttInstance`:** `update(data, options?)`, `destroy()`, `getData()`,
`filterByDate(dateStr | null)`, `getSelectedDate()`, `setDayWidth(px)`, `getDayWidth()`.

### `validate(data: unknown): ValidationResult`
Validates any value against the Jantt contract and returns LLM-friendly diagnostics
(`{ valid: boolean; errors: ValidationError[] }`, each error with `code`, `path`, `message` and
`suggestion`). Checks include required task fields, duplicate ids, ISO dates and ranges,
progress range, baselines, unknown categories (when a `categories` map is declared), dangling
dependencies and cycles.

### `resolveSchedule(tasks, gapOrOptions?): Task[]`
Pure function that moves every unlocked task to the earliest start its dependencies allow
(FS/SS/FF/SF links with lead/lag; plain links use the task's `gapDays` or the default gap of 2
days), preserving durations. Locked tasks never move and tasks never move earlier. The second
argument is either the default gap in days or `ResolveScheduleOptions`
(`defaultGapDays`, `autoCascade`, working calendars, `diagnostics`).

### `calculateCriticalPath(tasks, options?): CriticalPathResult`
Two-pass CPM: early/late start and finish, total and free float, critical and near-critical
task ids and the critical dependency links.

### Analytics
- `calculateEVM(tasks, options?)`: Earned Value metrics (PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI) from task `estimatedCost`, `actualCost` and `progress`.
- `auditScheduleIntegrity(tasks, options?)`: DCMA-14 style schedule health score and issues.
- `estimateTaskPert(task)`, `calculatePertRisk(tasks, options?)`: PERT three-point estimates.
- `runMonteCarloSimulation(tasks, options?)`: probabilistic finish dates and criticality index.
- `detectOverAllocations(tasks, options?)`, `levelResources(tasks, options?)`: resource checks and leveling.
- `freezeProjectBaseline`, `activateBaselineSnapshot`, `computeBaselineVariance`: baseline snapshots.

### Scheduling building blocks
- Dependencies: `getTaskDependencies`, `getTaskDependencyRelations`, `parseDependencyRelation`, `buildDependencyGraph`, `hasDependencyCycle`.
- Calendars: `createCalendar`, `isWorkingDay`, `addWorkingDays`, `diffWorkingDays`, `getStatutoryHolidays`, `CALENDAR_PRESETS`.
- Dates (UTC, `YYYY-MM-DD`): `addDays`, `diffDays`, `taskDurationDays`, `parseISODate`, `formatISODate`, `isValidISODate`, `isWeekend`.
- Layout: `layout(data, viewport)`, `computeDependencyPath`, `getScaleFromDayWidth`, `SCALE_DAY_WIDTHS`.
- Large plans: `PlanVirtualizer`, `computeVerticalVirtualWindow`, `computeHorizontalVirtualWindow`; off-main-thread scheduling with `createScheduleWorkerClient` / `installScheduleWorker`.

### Exporters

```typescript
const csvString = exportToCsv(data);                // RFC-4180 CSV string
downloadCsv(data, "project-schedule.csv");          // browser download
downloadJson(data, "project-plan.json");            // formatted JSON download
const svg = exportSvgString(chartContainerElement); // standalone SVG markup or null
```

### Themes
`themeManager` (`getTheme(id)`, `getAllThemes()`, `registerTheme(def)`, `applyTheme(target, idOrDef)`)
plus the theme definitions (`swissDarkTheme`, `swissLightTheme`, ...). Built-in ids: `swiss-dark`
(alias `noir`), `swiss-light`, `cyber-emerald`, `midnight-rose`, `sunset-crimson`, `nordic-frost`,
`beenie`.

### Sync, sharing and collaboration
- Remote JSON: `parseCloudUrl(url)`, `isMatchingCloudUrl(a, b)`, `fetchRemotePlan(url, options?)` (with a request timeout and a response size limit).
- Share links: `compressPlanToUrlPayload(plan)`, `decompressPlanFromUrlPayload(payload)`, `cleanPlanForSharing(plan)`, `sanitizePlanForJson(plan)`.
- Merging: `reconcilePlans(base, local, remote)`, `mergePlansCommutative(a, b)`, `calculatePlanHash(plan)`, `purgeTombstones`, `maintainPlanData`.
- Firebase Realtime Database rooms: `createCloudRoom`, `fetchCloudRoom`, `saveCloudRoom`, `subscribeToCloudRoom`, `encodePlanForRtdb`, `decodePlanFromRtdb`, `sanitizeRoomId`, `normalizeUsername`.

### UI helpers
`createTaskSidebar(options)` (task detail drawer) and `createDetailModal(options)`.

The default export (`Jantt`) bundles the most common functions under one object, e.g. `Jantt.mount(...)`.

---

## `@jantt/react`

```tsx
import { Jantt } from "@jantt/react";
import "@jantt/core/theme.css";

function App() {
  return (
    <Jantt
      data={myPlanJson}
      themeClassName="jantt-theme-dark"
      viewport={{ scale: "week", showCriticalPath: true, showBaselines: true, linkRouting: "orthogonal" }}
      onChange={(draft) => console.log("Draft change:", draft)}
      onCommit={(final) => saveToServer(final)}
    />
  );
}
```

`JanttProps` mirrors `JanttOptions` (`data`, `viewport`, `theme`, `themeClassName`, `className`,
`style`, `readOnly`, `onCommit`, `onChange`, `onTaskClick`, `onError`, ...). Peer dependencies:
`react` and `react-dom` 17 or newer.

---

## `@jantt/vue`

```vue
<script setup>
import { JanttTimeline } from "@jantt/vue";
import "@jantt/core/theme.css";
</script>

<template>
  <JanttTimeline :data="plan" theme-class-name="jantt-theme-dark" @commit="onCommit" />
</template>
```

Props: `data` (required), `viewport`, `theme`, `themeClassName`, `className`, `readOnly`,
`autoCascade`, `selectedDate`, and more. Events: `change`, `commit`, `task-click`, `task-add`,
`task-delete`, `viewport-change`, `date-click`, `clear-date-filter`, `day-width-change`, `error`, `ready`.

---

## `@jantt/svelte`

```svelte
<script>
  import { janttAction } from "@jantt/svelte";
  import "@jantt/core/theme.css";
  export let plan;
</script>

<div
  use:janttAction={{ data: plan, options: { themeClassName: "jantt-theme-dark", onCommit: (next) => (plan = next) } }}
  style="width: 100%; height: 600px;"
/>
```

`janttAction(node, { data, options?, onReady? })` and the imperative `mountJantt(node, data, options?)`.
`options` is the full `JanttOptions` object, including all callbacks.

---

## `@jantt/elements`

Registers `<jantt-timeline>` on import. Attributes: `data` (inline JSON), `data-src` (URL),
`scale`, `theme` (theme id such as `swiss-dark`, or class suffix such as `dark`),
`show-critical-path`, `show-baselines`, `auto-cascade`, `read-only`. Events: `jantt-ready`,
`jantt-plan-change`, `jantt-task-click`, `jantt-error`. Methods: `setData`, `getData`, `refresh`.

- Bundlers: `import "@jantt/elements";` (imports `@jantt/core`).
- Browsers without a bundler: the self-contained module `dist/jantt-elements.js` (also the `unpkg`/`jsdelivr` entry and the `@jantt/elements/browser` export).

```html
<script type="module" src="https://unpkg.com/@jantt/elements/dist/jantt-elements.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@jantt/core/dist/theme.css" />
<jantt-timeline data-src="/api/plan.json" theme="swiss-dark" scale="week"></jantt-timeline>
```

---

## `@jantt/standalone`

Drop-in `<script>` tag bundle (IIFE, with a UMD build for CommonJS/AMD loaders) that exposes
`window.Jantt` with `mount`/`render`, `validate`, `resolveSchedule` and `layout`.

```html
<link rel="stylesheet" href="https://unpkg.com/@jantt/standalone/dist/style.css" />
<script src="https://unpkg.com/@jantt/standalone/dist/jantt.standalone.iife.js"></script>

<div id="chart-container" style="height: 600px;"></div>

<script>
  fetch("./roadmap.json")
    .then((r) => r.json())
    .then((planData) => {
      window.Jantt.mount(document.getElementById("chart-container"), planData, {
        themeClassName: "jantt-theme-dark",
        onCommit: (updated) => console.log("Updated plan:", updated)
      });
    });
</script>
```

Files: `dist/jantt.standalone.iife.js` (script tag, `unpkg`/`jsdelivr` entry),
`dist/jantt.standalone.umd.cjs` (package `main`), `dist/style.css` (also `@jantt/standalone/style.css`).

---

## `@jantt/yjs`

Real-time CRDT collaboration on a `Y.Doc`: `bindJanttToYDoc(doc, { initialPlan, onPlanChange })`
returns `{ getPlan, updatePlan, updateTask, deleteTask, destroy }`; `bindJanttAwareness(...)`
shares presence and cursors; `createJanttUndoManager(doc, options?)` scopes undo/redo to local
edits. Peer dependency: `yjs` 13.6+.

---

## `@jantt/interop`

Enterprise formats, all pure string-in/string-out functions:
`exportMsProjectXml(plan)` / `importMsProjectXml(xml)`,
`exportPrimaveraXer(plan)` / `importPrimaveraXer(xer)`,
`exportSpreadsheetCsv(plan)` / `importSpreadsheetCsv(csv)`,
`exportExecutiveReportHtml(tasks, options?)`, `exportExecutiveReportSvg(tasks, options?)` and
`downloadExecutiveReport(tasks, options?, filename?)` (options include `title` and
`theme: "corporate" | "dark" | "light"`).

---

## `@jantt/render-canvas`

`new CanvasTimelineRenderer(plan, { dayWidth, rowHeight, headerHeight, showCriticalPath, theme, colors })`
then `renderer.render(ctx, { scrollX, scrollY, width, height, devicePixelRatio? })` for
virtualized 2D canvas rendering of very large plans; `renderMinimap(...)` draws an overview.

---

## `@jantt/mcp`

Model Context Protocol server (stdio). Run with `npx -y @jantt/mcp`. Tools:
`jantt_inspect_plan`, `jantt_add_task`, `jantt_reschedule_task`, `jantt_audit_schedule`,
`jantt_diff_plans`, `jantt_export_csv`.

---

## CLI (`@jantt/cli`, binary `jantt`)

Always run it through the scoped package name: a bare `npx jantt` would fetch an unrelated
package called `jantt` from the registry.

```bash
# Open any local JSON file with live two-way disk saving
npx @jantt/cli open ./my-roadmap.json --port 4173

# Validate, audit and simulate from the terminal
npx @jantt/cli validate ./my-roadmap.json
npx @jantt/cli audit ./my-roadmap.json
npx @jantt/cli monte-carlo ./my-roadmap.json --runs 5000

# Convert to and from MS Project XML, Primavera P6 XER, CSV, HTML report or SVG
npx @jantt/cli export ./my-roadmap.json --format xml --out ./my-roadmap.xml
npx @jantt/cli import ./schedule.xer --out ./my-roadmap.json
```

After `npm install -g @jantt/cli` (or inside a project that depends on it), the binary is simply `jantt`.

---

## Python bridge (`pip install jantt`)

`jantt.from_records(...)`, `jantt.from_dataframe(df, ...)`, `jantt.to_dataframe(plan)`,
`jantt.to_html(plan_or_df, theme=...)`, `jantt.show(plan_or_df, theme="dark")` (Jupyter) and
`jantt.streamlit(plan_or_df)`. Rendering loads `@jantt/standalone` from unpkg.
