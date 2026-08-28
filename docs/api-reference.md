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
  downloadJson
} from "@jantt/core";
```

### `renderJantt(container, data, options?): JanttInstance`
Mounts an interactive Gantt chart into an HTMLElement.

**Parameters:**
- `container: HTMLElement`: Target DOM container.
- `data: JanttData`: Initial JSON state.
- `options?: JanttOptions`: Optional configuration:
  - `viewport?: ViewportOptions`
  - `theme?: Record<string, string>`
  - `readOnly?: boolean`
  - `searchQuery?: string`
  - `onChange?: (draft: JanttData) => void`
  - `onCommit?: (final: JanttData) => void`
  - `onTaskClick?: (task: Task) => void`
  - `onLinkCreate?: (fromId: string, toId: string) => void`
  - `onLinkDelete?: (fromId: string, toId: string) => void`

**Returns `JanttInstance`:**
- `instance.update(newData: JanttData, newOptions?: Partial<JanttOptions>): void`
- `instance.destroy(): void`
- `instance.getData(): JanttData`

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
Pure function that computes topological schedule relaxation and returns an updated task array.

---

### `calculateCriticalPath(tasks: Task[]): CriticalPathResult`
Pure function that computes early/late start float and returns sets of critical task IDs and dependency link keys.

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
        showBaselines: true
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
