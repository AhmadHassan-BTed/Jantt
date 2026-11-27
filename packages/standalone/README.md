# @jantt/standalone

Drop-in browser UMD/IIFE bundle for Jantt. Mount high-performance, interactive Gantt charts into any plain HTML page or legacy application with a single `<script>` tag. No Node.js, bundlers, or frameworks required.

[![License: MIT](https://img.shields.io/badge/License-MIT-38BDF8.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Quickstart

Include the compiled CSS and JS script directly from your CDN or local assets directory:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Jantt Standalone Demo</title>
  <link rel="stylesheet" href="https://unpkg.com/@jantt/standalone/dist/style.css" />
  <script src="https://unpkg.com/@jantt/standalone/dist/jantt.standalone.iife.js"></script>
  <style>
    body {
      margin: 0;
      background: #080D18;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #chart-mount {
      max-width: 1200px;
      height: 600px;
      margin: 40px auto;
    }
  </style>
</head>
<body>
  <div id="chart-mount"></div>

  <script>
    const plan = {
      "$schema": "https://jantt.dev/schema/v1.json",
      "meta": {
        "title": "Standalone Project Roadmap",
        "scale": "week",
        "showCriticalPath": true
      },
      "categories": {
        "dev": { "label": "Engineering", "color": "#38BDF8" }
      },
      "tasks": [
        {
          "id": "A",
          "label": "Requirements Discovery",
          "category": "dev",
          "start": "2026-09-01",
          "end": "2026-09-10",
          "progress": 1.0
        },
        {
          "id": "B",
          "label": "Prototype Construction",
          "category": "dev",
          "start": "2026-09-12",
          "end": "2026-09-28",
          "dependsOn": "A",
          "progress": 0.45
        }
      ]
    };

    // Mount chart to element
    const instance = Jantt.mount("#chart-mount", plan, {
      onCommit: (updatedPlan) => {
        console.log("Chart modified by user:", updatedPlan);
      }
    });
  </script>
</body>
</html>
```

---

## Global API (`window.Jantt`)

Use `Jantt.mount("#chart", plan, { locale: "zh-CN" })` for a Simplified Chinese chart. English is the default.

* `Jantt.mount(target, data, options)` (alias `Jantt.render`): Mounts a full interactive Gantt chart into an HTMLElement or query selector string and returns the chart instance (`update`, `destroy`, `getData`, ...).
* `Jantt.validate(data)`: Validates a raw JSON payload against the schema contract and DAG constraints.
* `Jantt.resolveSchedule(tasks, defaultGapDaysOrOptions)`: Resolves topological dates and dependencies headlessly.
* `Jantt.layout(data, viewportOptions)`: Computes coordinate geometries for custom renderers.
* `Jantt.version`: The package version of the loaded bundle.

---

## License

MIT © [Ahmad Hassan (B-Ted)](https://github.com/AhmadHassan-BTed)
