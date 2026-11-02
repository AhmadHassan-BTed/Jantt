# @jantt/svelte

Official Svelte 4 / 5 adapter and action for the **Jantt** JSON Gantt chart engine.

## Installation

```bash
npm install @jantt/svelte @jantt/core
```

## Usage

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
      autoCascade: true,
      onCommit: (newPlan) => {
        plan = newPlan;
      }
    }
  }}
/>
```

### Imperative Mount

```typescript
import { mountJantt } from "@jantt/svelte";

const instance = mountJantt(domNode, planData, {
  autoCascade: true
});
```

## License

MIT © Ahmad Hassan
