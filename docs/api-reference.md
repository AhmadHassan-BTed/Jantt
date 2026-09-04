# Jantt API Reference

Comprehensive reference for all packages in the Jantt ecosystem.

---

## `@jantt/core`

Zero-dependency TypeScript engine.

```typescript
import {
  renderJantt,
  validate,
  resolveSchedule,
  calculateCriticalPath,
  layout,
  exportToCsv,
  downloadCsv,
  downloadJson,
  themeManager,
  fetchRemotePlan,
  pushRemotePlan,
  startRemoteSyncPolling
} from "@jantt/core";
```

### `renderJantt(container, data, options?): JanttInstance`
Mounts an interactive Gantt chart into an HTMLElement.

**Parameters:**
- `container: HTMLElement`: Target DOM container element.
- `data: JanttData`: Initial JSON state conforming to Jantt Schema v1.
- `options?: JanttOptions`: Optional configuration:
  - `viewport?: ViewportOptions`
    - `scale?: TimeScale` (`"day" | "week" | "month" | "quarter" | "year"`)
    - `dayWidth?: number` (Custom pixel width per day)
    - `rowHeight?: number` (Default 46px)
    - `rowHeightMode?: "custom" | "fit"`
    - `linkRouting?: "orthogonal" | "curved" | "direct"`
    - `showCriticalPath?: boolean`
    - `showBaselines?: boolean`
    - `selectedDate?: string | null`
    - `columns?: GridColumn[]`
  - `theme?: Record<string, string>` (Custom CSS variable tokens)
  - `themeClassName?: string` (Theme class e.g. `"theme-swiss-dark"`)
  - `readOnly?: boolean`
  - `searchQuery?: string`
  - `selectedDate?: string | null`
  - `onCommit?: (final: JanttData) => void`
  - `onChange?: (draft: JanttData) => void`
  - `onViewportChange?: (viewport: ViewportOptions) => void`
  - `onTaskClick?: (task: Task) => void`
  - `onTaskAdd?: (newTask: Task) => void`
  - `onTaskDelete?: (taskId: string) => void`
  - `onDateClick?: (dateStr: string) => void`
  - `onClearDateFilter?: () => void`
  - `onDayWidthChange?: (dayWidth: number) => void`

**Returns `JanttInstance`:**
- `instance.update(newData: JanttData, newOptions?: Partial<JanttOptions>): void`
- `instance.destroy(): void`
- `instance.getData(): JanttData`
- `instance.filterByDate(dateStr: string | null): void`
- `instance.getSelectedDate(): string | null`
- `instance.setDayWidth(w: number): void`
- `instance.getDayWidth(): number`

---

### `validate(data: unknown): ValidationResult`
Validates an arbitrary JavaScript object or JSON against the Jantt Schema.

**Returns:**
```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

---

### `resolveSchedule(tasks: Task[], defaultGapDays?: number): Task[]`
Pure function that computes topological schedule relaxation and returns an updated task array. Handles multi-predecessor dependencies (`dependsOn: string[]`) and preserves durations.

---

### `calculateCriticalPath(tasks: Task[]): CriticalPathResult`
Pure function that computes early/late start float and returns sets of critical task IDs and dependency link keys.

---

### Exporters (`@jantt/core`)

```typescript
// Export schedule data as RFC-4180 CSV string
const csvString = exportToCsv(data);

// Trigger immediate browser CSV file download
downloadCsv(data, "project-schedule.csv");

// Trigger formatted JSON file download
downloadJson(data, "project-plan.json");
```

---

## `@jantt/react`

Official React component wrapper.

```tsx
import { Jantt } from "@jantt/react";
import "@jantt/core/dist/theme.css";

function App() {
  return (
    <Jantt
      data={myPlanJson}
      viewport={{
        scale: "week",
        showCriticalPath: true,
        showBaselines: true,
        linkRouting: "orthogonal"
      }}
      onChange={(draft) => console.log("Draft change:", draft)}
      onCommit={(final) => saveToServer(final)}
    />
  );
}
```

---

## `@jantt/standalone`

Drop-in `<script>` tag bundle for vanilla HTML/JS applications.

```html
<link rel="stylesheet" href="https://unpkg.com/@jantt/standalone/dist/style.css" />
<script src="https://unpkg.com/@jantt/standalone/dist/jantt.standalone.iife.js"></script>

<div id="chart-container" style="height: 600px;"></div>

<script>
  fetch("./roadmap.json")
    .then(r => r.json())
    .then(planData => {
      window.Jantt.mount(document.getElementById("chart-container"), planData, {
        onCommit: (updated) => console.log("Updated plan:", updated)
      });
    });
</script>
```

---

## CLI Runner (`jantt`)

```bash
# Open any local JSON file with live two-way disk saving
npx jantt open ./my-roadmap.json --port 4173

# Validate a JSON file from terminal
npx jantt validate ./my-roadmap.json
```
