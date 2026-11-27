# @jantt/render-canvas

> **High-throughput 2D Canvas renderer for Jantt timelines (100,000+ tasks)**

The `@jantt/render-canvas` package provides a 2D Canvas rendering engine for Jantt timelines. It is designed for very large plans (10k to 100k+ tasks), where DOM / SVG trees become too heavy, and keeps zooming and panning smooth with viewport culling and $O(1)$ hit-testing.

---

## 🚀 Features

- **Viewport culling:** only the rows and days inside the viewport (plus a small overscan) are drawn.
- **Per-plan precomputation:** day offsets, durations, dependency edges and the critical path are computed once per plan, so a frame never parses dates.
- **$O(1)$ hit-testing (`SpatialGanttGrid`):** resolves the task and handle (`bar`, `handle-start`, `handle-end`, `progress`) under the pointer. Points over the sticky header never hit a row.
- **HiDPI:** pass `devicePixelRatio` and size the canvas backing store accordingly; drawing happens in CSS pixels.
- **Dependency links by type:** `FS`, `SS`, `FF` and `SF` links leave and enter the correct bar edges, including links whose rows are off-screen.
- **Critical path:** highlights the tasks and driving links computed by the `@jantt/core` CPM engine (honoring `meta.targetDate` and `meta.defaultGapDays`). If you already ran the CPM, flag the critical tasks with `critical: true` and the renderer reuses that result instead of computing it again.
- **Two-tier header:** month / year labels above day numbers (Mondays only when zoomed out), with weekend shading.
- **Minimap:** an overview of the whole plan with the current viewport; task bars are cached in an `OffscreenCanvas` layer where available.
- **Themes:** `swiss-dark` (default) and `swiss-light` presets, with per-color overrides.

Soft-deleted (`_deleted`) tasks are never drawn or hit-tested. Only tasks flagged `milestone: true` are drawn as diamonds; a single-day task is a one-day bar. Plans are treated as immutable: calling `setPlan` with the same plan object and tasks array is a no-op, so pass a new object after edits.

---

## 📦 Installation

```bash
npm install @jantt/render-canvas @jantt/core
```

---

## 💻 Quick Start

```typescript
import { CanvasTimelineRenderer, type ViewportState } from "@jantt/render-canvas";
import type { JanttData } from "@jantt/core";

const canvas = document.getElementById("timeline-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const plan: JanttData = {
  tasks: [
    { id: "1", label: "Kickoff", category: "pm", start: "2026-06-01", end: "2026-06-05" },
    { id: "2", label: "Core Dev", category: "dev", start: "2026-06-08", end: "2026-06-19", dependsOn: "1" }
  ]
};

const renderer = new CanvasTimelineRenderer(plan, {
  rowHeight: 38,
  dayWidth: 32,
  headerHeight: 44,
  theme: "swiss-dark",
  showCriticalPath: true
});

let scrollX = 0;
let scrollY = 0;

function viewport(): ViewportState {
  return {
    scrollX,
    scrollY,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

function draw() {
  const vp = viewport();
  // Size the backing store in device pixels (round to avoid resizing every frame)
  const backingWidth = Math.round(vp.width * vp.devicePixelRatio!);
  const backingHeight = Math.round(vp.height * vp.devicePixelRatio!);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  renderer.render(ctx, vp);
}

draw();

// Hit-testing in CSS pixels relative to the canvas
canvas.addEventListener("mousemove", (e) => {
  const hit = renderer.hitTest(e.offsetX, e.offsetY, viewport());
  if (hit) {
    console.log("Hovered task:", hit.task.label, hit.hitType);
  }
});

// Update the plan or options later
renderer.setPlan({ ...plan, tasks: [...plan.tasks] });
renderer.updateOptions({ dayWidth: 48, theme: "swiss-light", colors: { primary: "#7C3AED" } });
```

### Language

Pass `{ locale: "zh-CN" }` in the renderer options for a Simplified Chinese timeline header. Call `renderer.updateOptions({ locale: "en" })` to switch back. Explicit `monthLabels`, `quarterLabels`, and `monthYearTemplate` override the preset.

### Minimap

```typescript
const minimap = document.getElementById("minimap") as HTMLCanvasElement; // 220 x 110 CSS px
const dpr = window.devicePixelRatio || 1;
minimap.width = Math.round(220 * dpr); // the minimap scales to its own backing store
minimap.height = Math.round(110 * dpr);

const { scaleX, scaleY } = renderer.renderMinimap(minimap.getContext("2d")!, 220, 110, viewport());
// Convert a minimap click back to a scroll position: worldX = clickX / scaleX, worldY = clickY / scaleY

const { totalWorldWidth, totalWorldHeight, timelineStart, timelineEnd } = renderer.getWorldBounds();
```

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)
