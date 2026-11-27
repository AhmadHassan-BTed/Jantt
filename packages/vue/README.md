# @jantt/vue

Official Vue 3 Composition API component for the **Jantt** JSON Gantt chart engine.

## Installation

```bash
npm install @jantt/vue @jantt/core
```

## Usage

```vue
<template>
  <div style="height: 600px; width: 100%;">
    <JanttTimeline
      :data="plan"
      theme-class-name="jantt-theme-cyber-emerald"
      :auto-cascade="true"
      @commit="handleCommit"
      @task-click="handleTaskClick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { JanttTimeline } from "@jantt/vue";
import type { JanttData, Task } from "@jantt/core";
import "@jantt/core/theme.css";

const plan = ref<JanttData>({
  tasks: [
    { id: "t1", label: "Architecture", category: "dev", start: "2026-11-01", end: "2026-11-05" },
    { id: "t2", label: "Implementation", category: "dev", start: "2026-11-06", end: "2026-11-15", dependsOn: "t1" }
  ]
});

function handleCommit(newPlan: JanttData) {
  console.log("Plan updated:", newPlan);
}

function handleTaskClick(task: Task) {
  console.log("Task clicked:", task);
}
</script>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `JanttData` | Required | The project timeline specification. Replacing it or mutating it in place updates the chart. |
| `locale` | `string` | `"en"` | Localizes the built-in timeline, toolbar, and task details. Supports English and Simplified Chinese (`zh-CN`). Other locales use English. |
| `viewport` | `ViewportOptions` | `undefined` | Scale, `dayWidth`, `linkRouting`, `rowHeight`, `rowHeightMode`, `showCriticalPath`, `showBaselines`, ... Each value is applied when it changes, so the user's zoom and toolbar toggles survive data updates. |
| `theme` | `Record<string, string>` | `undefined` | Custom CSS theme variables, e.g. `{ accent: "#38BDF8" }`. |
| `themeClassName` | `string` | `undefined` | Built-in theme class: `jantt-theme-light`, `jantt-theme-dark`, `jantt-theme-cyber-emerald`, `jantt-theme-midnight-rose`, `jantt-theme-nordic-frost`, `jantt-theme-sunset-crimson` or `jantt-theme-beenie`. |
| `className` | `string` | `undefined` | Extra class on the wrapper element. |
| `readOnly` | `boolean` | `false` | Disables drag/drop and editing operations. |
| `autoCascade` | `boolean` | `meta.autoCascade`, then `true` | Shifts successor tasks when dragging predecessors. |
| `selectedDate` | `string \| null` | `undefined` | Header date filter (`YYYY-MM-DD`); `null` clears it. |
| `filterTasksByDate` | `boolean` | `true` | Clicking a header date filters rows to that date. |
| `showDateFilterBadge` | `boolean` | `true` | Shows the active date-filter badge. |
| `disableDragOnTouch` | `boolean` | `true` | Keeps touch gestures for scrolling instead of dragging bars. |
| `isMobile` | `boolean` | `false` | Compact mobile layout. |
| `searchQuery` | `string` | `""` | Initial toolbar search text (initial only). |
| `sidebarContainer` | `HTMLElement \| string` | `undefined` | Element or selector that hosts the task detail panel. |
| `renderDetail` | `(task, container, api) => void` | `undefined` | Custom task detail renderer. |

Unset optional booleans fall back to the engine defaults, the same as in `@jantt/react` and `@jantt/elements`.

Import the component as `Jantt` if you prefer that tag. Bind `locale` to your app's reactive language setting, or pass `locale="zh-CN"` for a fixed language. Open task details keep their current wording until reopened so pending edits can stay in place.

```vue
<script setup>
import { Jantt } from "@jantt/vue";
import "@jantt/core/theme.css";

defineProps(["plan", "appLocale"]);
</script>

<template>
  <Jantt :data="plan" :locale="appLocale" />
</template>
```

## Emits

All events are typed (object-syntax `emits`):

- `@change(draft: JanttData)`: Fired during real-time dragging.
- `@commit(final: JanttData)`: Fired when an edit is finalized. Passing this plan back as `data` does not re-render the chart.
- `@task-click(task: Task)`, `@task-add(task: Task)`, `@task-delete(taskId: string)`
- `@link-create(fromTaskId: string, toTaskId: string)`, `@link-delete(fromTaskId: string, toTaskId: string)`
- `@viewport-change(viewport: ViewportOptions)`, `@day-width-change(dayWidth: number)`
- `@date-click(date: string)`, `@clear-date-filter()`
- `@open-auto-save()`, `@import-json()`, `@export-json()`, `@export-csv()`: Toolbar menu actions. Each menu entry appears only when you listen to its event.
- `@error(error: Error)`: Render and update errors. Without a listener they are logged to the console; a failed render is retried when the props change.
- `@ready(instance: JanttInstance)`: Fired when the underlying chart controller is mounted.

## Sizing

The wrapper fills its parent (`width: 100%; height: 100%`) with a default `min-height` of 400px.
Set the `--jantt-min-height` CSS custom property (for example to `0` in split panes or dashboards)
to change it.

## License

MIT © Ahmad Hassan
