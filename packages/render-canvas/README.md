# @jantt/render-canvas

> **Ultra-high throughput 60 FPS 2D Canvas & OffscreenCanvas renderer for Jantt timelines (100,000+ tasks)**

The `@jantt/render-canvas` package provides a high-performance 2D Canvas rendering engine for Jantt timelines. Designed specifically for massive project plans (10k to 100k+ tasks) where standard DOM/SVG trees face severe overhead, it delivers instantaneous 60 FPS zooming, smooth panning, and $O(1)$ spatial hit-testing.

---

## 🚀 Features

- **60 FPS Hardware-Accelerated 2D Canvas:** Renders tens of thousands of tasks with zero DOM node thrashing.
- **2D Spatial Grid Indexing (`SpatialGridIndex`):** $O(1)$ spatial lookup for mouse hover, selection, and drag handles.
- **Viewport Culling:** Sub-millisecond windowing math renders only what is visible in the viewport.
- **Retina / HiDPI Auto-Scaling:** Crisp typography and anti-aliased orthogonal dependency curves on high-resolution displays (`devicePixelRatio`).
- **Interactive Event Coordinates:** Direct mapping between canvas pixels, time timestamps, and row indices.

---

## 📦 Installation

```bash
npm install @jantt/render-canvas @jantt/core
```

---

## 💻 Quick Start

```typescript
import { CanvasTimelineRenderer } from "@jantt/render-canvas";
import type { JanttData } from "@jantt/core";

const canvas = document.getElementById("timeline-canvas") as HTMLCanvasElement;

const plan: JanttData = {
  tasks: [
    { id: "1", label: "Kickoff", start: "2026-06-01", end: "2026-06-05" },
    { id: "2", label: "Core Dev", start: "2026-06-06", end: "2026-06-20", dependsOn: "1" }
  ]
};

const renderer = new CanvasTimelineRenderer(canvas, {
  rowHeight: 38,
  dayWidth: 32,
  theme: "dark"
});

renderer.setPlan(plan);
renderer.render();

// Spatial hit-testing on mouse move
canvas.addEventListener("mousemove", (e) => {
  const hit = renderer.hitTest(e.offsetX, e.offsetY);
  if (hit) {
    console.log("Hovered task:", hit.task.label, hit.hitType);
  }
});
```

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)

