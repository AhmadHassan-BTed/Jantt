# Changelog

All notable changes to the **Jantt** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-08-28

### Added
- **Interactive Drag-to-Link**: Circular connector anchor ports on task bars with live 90-degree orthogonal preview wire for direct dependency authoring.
- **Inline Progress Dragging**: Drag completion handle inside task bars directly on canvas (0%–100%).
- **Multi-Scale Timeline Zoom**: Seamless scale switching between `day`, `week`, `month`, `quarter`, and `year` views.
- **Critical Path Engine**: Pure algorithmic critical path calculator using early/late start topological analysis and visual glowing highlight.
- **Milestone Diamonds & Baselines**: 45° rotated milestone diamonds (`milestone: true`) and baseline ghost comparison bars (`baseline: { start, end }`).
- **Draggable Table Splitter**: Continuous resize control between left data table and right timeline.
- **Multi-Level Hierarchical Date Header**: Top Year banner (rendered for multi-year roadmaps), full month names, and formatted weekday/day cells.
- **Glassmorphic Hover Tooltip**: Floating info card showing dates, duration, progress, dependencies, notes, and custom fields.
- **Enterprise Demo Fixture**: Metropolis High-Rise Construction (`examples/construction-enterprise.json`).

### Changed
- **Crisp 90-Degree Orthogonal Dependency Lines**: Dependency arrows now route with 90° right angles matching DHTMLX and MS Project conventions.
- Enhanced Playground UI with scale switcher, Critical Path toggle, Baselines toggle, and instant search.

---

## [1.0.0] - 2026-08-28

### Added
- **Core Engine (`@jantt/core`)**:
  - Zero-dependency architecture.
  - Pure UTC date math engine (`addDays`, `diffDays`, `minISODate`, `maxISODate`, `isWeekend`).
  - Strict self-correcting JSON Schema validator with actionable error codes and suggestions.
  - Dual-mode schedule cascade resolver (explicit dependencies & implicit category pacing).
  - High-performance coordinate layout engine with SVG dependency connector paths.
  - Pointer event interaction controller (drag-to-move, drag-to-resize, keyboard navigation).
  - Detail modal for task inspection and custom fields editing.
  - CSS design system with CSS custom properties and light/dark theme presets.
- **React Component (`@jantt/react`)**: `<Jantt data={...} onChange={...} onCommit={...} />`.
- **Standalone Bundles (`@jantt/standalone`)**: UMD and IIFE `<script>` bundles.
- **CLI Runner (`jantt`)**: `jantt open <file>` with two-way live sync back to disk and `jantt validate <file>`.
- **Interactive Playground (`@jantt/playground`)**: Split-screen live JSON sandbox with schema diagnostics and AI prompt generator.
- **Formal JSON Schema (`schema/jantt.schema.json`)**: Schema v1.
