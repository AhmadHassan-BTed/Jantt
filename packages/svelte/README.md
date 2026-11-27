# @jantt/svelte

Official Svelte 4 / 5 adapter and action for the **Jantt** JSON Gantt chart engine.

## Installation

```bash
npm install @jantt/svelte @jantt/core
```

## Usage

Pass `options: { locale: "zh-CN" }` to the action, or `{ locale: "zh-CN" }` to `mountJantt` as its third argument. Bind `locale` to your app's language to switch it reactively. English is the default.

### Using Svelte Action (`use:janttAction`)

```svelte
<script lang="ts">
  import { janttAction } from "@jantt/svelte";
  import type { JanttData } from "@jantt/core";
  import "@jantt/core/theme.css";

  let plan: JanttData = {
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-04" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-05", end: "2026-11-10", dependsOn: "t1" }
    ]
  };
</script>

<div
  style="width: 100%; height: 600px;"
  use:janttAction={{
    data: plan,
    options: {
      onCommit: (newPlan) => {
        plan = newPlan;
      }
    }
  }}
/>
```

Svelte calls the action's `update` whenever the parameter object changes; `data` and `options`
are then handed to the chart, so include stateful settings such as `options.viewport` or
`options.autoCascade` only when you want to (re)apply them.

Errors thrown while mounting or updating are passed to `options.onError` (or logged to the
console). If the first mount fails, the next update retries it, so fixing the data brings the
chart back. Updates after the element is destroyed are ignored.

### Imperative Mount

```typescript
import { mountJantt } from "@jantt/svelte";

const instance = mountJantt(domNode, planData, {
  autoCascade: true
});
```

## License

MIT © Ahmad Hassan
