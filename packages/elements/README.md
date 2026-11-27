# @jantt/elements

Universal Web Component / Custom Elements adapter for the **Jantt** JSON Gantt chart engine.

Drop `<jantt-timeline>` into any HTML page, CMS, or backend framework (Ruby on Rails, Django, Laravel/PHP, WordPress, ASP.NET, Phoenix/Elixir) with zero build steps or JavaScript framework dependencies.

## Installation

```bash
npm install @jantt/elements @jantt/core
```

```javascript
import "@jantt/elements";      // registers <jantt-timeline>
import "@jantt/core/theme.css";
```

Or via CDN with no build step. `dist/jantt-elements.js` is a self-contained ES module (the
engine is bundled in):

```html
<script type="module" src="https://unpkg.com/@jantt/elements/dist/jantt-elements.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@jantt/core/dist/theme.css">
```

The package can be imported during server-side rendering (Next.js, Nuxt, Astro, SvelteKit):
the element is only registered where `customElements` exists.

## Usage

### 1. Declarative Inline JSON

```html
<jantt-timeline
  theme="dark"
  scale="day"
  show-critical-path
  data='{
    "tasks": [
      { "id": "t1", "label": "Architecture", "category": "dev", "start": "2026-11-01", "end": "2026-11-05" },
      { "id": "t2", "label": "Implementation", "category": "dev", "start": "2026-11-06", "end": "2026-11-15", "dependsOn": "t1" }
    ]
  }'>
</jantt-timeline>
```

### 2. Remote URL (`data-src`)

```html
<jantt-timeline data-src="/api/projects/alpha/schedule.json" theme="nordic-frost"></jantt-timeline>
```

### 3. Programmatic JavaScript API

```javascript
import "@jantt/elements";

const timeline = document.querySelector("jantt-timeline");
timeline.setData(myPlanObject);

// Listen to interactive events
timeline.addEventListener("jantt-task-click", (e) => {
  console.log("Clicked task:", e.detail.task);
});

timeline.addEventListener("jantt-plan-change", (e) => {
  console.log("Plan updated:", e.detail.data);
});
```

Setting `data` (or an attribute) after the chart is mounted updates it in place: zoom, scroll
and an open task panel are kept. Assigning the plan from `jantt-plan-change` back to
`timeline.data` is a no-op, so after editing that plan in place assign a new object
(`timeline.data = { ...plan }`). Data assigned before the element is defined (for example by a script
that runs before the module loads) is picked up on upgrade.

## Attributes & Properties

Set `locale="zh-CN"` for Simplified Chinese. To switch an existing chart, set `element.locale` or update the `locale` attribute. English is the default.

Boolean attributes follow HTML conventions: present means on (`show-baselines` or
`show-baselines="true"`), `="false"` means off, and absent means the plan's `meta` value, then
the engine default.

| Attribute | Type | Description |
|-----------|------|-------------|
| `data` | `string (JSON)` | Inline plan JSON string. Can also be set as JS object property `el.data = ...`. Removing the attribute clears the chart. |
| `data-src` | `string (URL)` | Remote endpoint to load plan JSON from via `fetch()` once the element is connected. Changing it aborts the previous request, so a slow stale response never wins. The response must pass `validate()` from `@jantt/core`; an invalid plan is rejected with `jantt-error` and the current chart is kept. |
| `scale` | `"day" \| "week" \| "month" \| "quarter" \| "year"` | Horizontal time axis scale (default: `meta.scale`, then `"day"`). Unknown values are ignored with a warning. |
| `theme` | `"light" \| "dark" \| "cyber-emerald" \| "midnight-rose" \| "nordic-frost" \| "sunset-crimson" \| "beenie"` | Built-in theme (applied as the `jantt-theme-<name>` class; theme ids such as `swiss-dark` also work). Other names are applied as `jantt-theme-<name>` for your own CSS, with a console warning. |
| `show-critical-path` | `boolean` | Highlights critical path tasks and driving dependency curves in crimson (default off). |
| `show-baselines` | `boolean` | Renders ghost baseline bars below active schedule bars (default on). |
| `auto-cascade` | `boolean` | Shifts downstream dependent tasks dynamically during drag (default on). |
| `read-only` | `boolean` | Locks the chart against edits. |

## Events

All events bubble and cross shadow roots (`composed`), so delegated listeners work.

| Event | `detail` | When |
|-------|----------|------|
| `jantt-ready` | `{ controller }` | The chart mounted. |
| `jantt-plan-change` | `{ data }` | An edit was committed. |
| `jantt-plan-draft` | `{ data }` | Live preview during a drag. |
| `jantt-task-click` | `{ task }` | A task was clicked. |
| `jantt-task-add` | `{ task }` | A task was added from the chart. |
| `jantt-task-delete` | `{ taskId }` | A task was deleted from the chart. |
| `jantt-error` | `{ error }` | Invalid inline JSON, a failed `data-src` request or invalid `data-src` plan (the message lists the first validation errors), or a render error. |

## Sizing

The chart fills the element with a default `min-height` of 400px. Set the `--jantt-min-height`
CSS custom property on the element (for example to `0` in split panes) to change it.

## License

MIT © Ahmad Hassan
