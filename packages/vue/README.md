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
      theme-class-name="jantt-theme-zinc"
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
| `data` | `JanttData` | Required | The project timeline specification. |
| `viewport` | `ViewportOptions` | `undefined` | Viewport dimensions, scale, and day width. |
| `theme` | `Record<string, string>` | `undefined` | Custom CSS theme variables dictionary. |
| `themeClassName` | `string` | `undefined` | Built-in theme class name (e.g. `"jantt-theme-zinc"`). |
| `autoCascade` | `boolean` | `true` | Automatically updates successor start dates when dragging predecessors. |
| `readOnly` | `boolean` | `false` | Disables drag/drop and editing operations. |

## Emits

- `@change(draft: JanttData)`: Fired during real-time dragging.
- `@commit(final: JanttData)`: Fired when an edit is finalized.
- `@task-click(task: Task)`: Fired when a task bar is clicked.
- `@ready(instance: JanttInstance)`: Fired when the underlying chart controller is mounted.

## License

MIT © Ahmad Hassan
