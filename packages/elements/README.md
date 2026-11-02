# @jantt/elements

Universal Web Component / Custom Elements adapter for the **Jantt** JSON Gantt chart engine.

Drop `<jantt-timeline>` into any HTML page, CMS, or backend framework (Ruby on Rails, Django, Laravel/PHP, WordPress, ASP.NET, Phoenix/Elixir) with zero build steps or JavaScript framework dependencies.

## Installation

```bash
npm install @jantt/elements @jantt/core
```

Or via CDN / unpkg:

```html
<script type="module" src="https://unpkg.com/@jantt/elements"></script>
<link rel="stylesheet" href="https://unpkg.com/@jantt/standalone/dist/style.css">
```

## Usage

### 1. Declarative Inline JSON

```html
<jantt-timeline
  theme="zinc"
  scale="day"
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
<jantt-timeline data-src="/api/projects/alpha/schedule.json" theme="slate"></jantt-timeline>
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

## Attributes & Properties

| Attribute | Type | Description |
|-----------|------|-------------|
| `data` | `string (JSON)` | Inline plan JSON string. Can also be set as JS object property `el.data = ...`. |
| `data-src` | `string (URL)` | Remote endpoint to load plan JSON from via `fetch()`. |
| `scale` | `"day" \| "week" \| "month" \| "quarter" \| "year"` | Horizontal time axis scale (default: `"day"`). |
| `theme` | `"default" \| "dark" \| "zinc" \| "slate" \| "amber" \| "emerald" \| "violet" \| "midnight"` | Built-in theme palette. |
| `show-critical-path` | `boolean` | Highlights critical path tasks and driving dependency curves in crimson. |
| `show-baselines` | `boolean` | Renders dual ghost baseline bars below active schedule bars. |
| `auto-cascade` | `boolean` | When true, shifts downstream dependent tasks dynamically during drag. |

## License

MIT © Ahmad Hassan
