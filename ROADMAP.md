# Jantt Project Roadmap

This document outlines the strategic vision, upcoming milestones, and architectural goals for **Jantt — The JSON Gantt Chart Engine**.

---

## Strategic Vision

To be the world's most capable, lightweight, dependency-free Gantt chart engine — designed specifically for AI agents, developers, and product teams who want their schedule state to live in clean, declarative, portable JSON.

---

## Release Milestones

### Phase 1: Core Foundation (Released in v1.0.0) [Completed]
- [x] Zero-dependency `@jantt/core` engine.
- [x] UTC date math & ISO-8601 validation.
- [x] Self-correcting JSON Schema validator with granular diagnostics.
- [x] Topological schedule cascade resolver.
- [x] `<Jantt />` React component wrapper.
- [x] Standalone UMD & IIFE script-tag bundles.
- [x] Two-way live-saving CLI runner.
- [x] Split-pane interactive playground.

### Phase 2: DHTMLX-Grade Interactive Polish (Released in v1.1.0) [Completed]
- [x] Interactive Drag-to-Link circular connector ports with live wire preview.
- [x] Crisp 90-degree orthogonal step routing for dependency arrows.
- [x] Multi-scale timeline zoom (`day`, `week`, `month`, `quarter`, `year`).
- [x] Critical path calculation & visual bottleneck glow.
- [x] Milestone diamonds (`milestone: true`) & baseline ghost bars (`baseline: { start, end }`).
- [x] Inline progress dragging handle (0%–100%).
- [x] Draggable grid/timeline splitter.
- [x] Multi-tier hierarchical date header (Year banner, Month row, Day cells).

### Phase 3: Enterprise Extensibility & Portfolio Roadmaps (Upcoming v1.2.0) [In Progress]
- [ ] **Hierarchical Grouping & Subtasks**:
  - Parent summary tasks spanning across subtasks with accordion collapse/expand.
  - Category and Assignee lane grouping.
- [ ] **Client-Side Exporters**:
  - Native high-res PNG image export (`canvas.toBlob()`).
  - Native SVG vector file download.
  - CSV schedule table export.
- [ ] **Custom Column Configuration**:
  - Declarative column definitions in JSON `viewport.columns`.
- [ ] **Virtual Scrolling**:
  - Ultra-high performance rendering for 5,000+ tasks.

### Phase 4: AI & Collaborative Ecosystem (v2.0.0 Vision) [Planned]
- [ ] **Real-Time Multi-Agent Collaboration (CRDTs)**:
  - Yjs / Automerge bindings for real-time collaborative schedule editing.
- [ ] **AI Natural Language Command Extension**:
  - Built-in prompt tools for Claude, GPT, and Gemini to stream timeline updates directly into Jantt state.
- [ ] **Vue, Svelte, and Angular Official Wrappers**:
  - Lightweight wrappers for other major web frameworks.

---

## How to Propose New Features

Have an idea or use-case? Open a [Feature Request](https://github.com/AhmadHassan-BTed/Jantt/issues/new?template=feature_request.yml) on GitHub to discuss the RFC with the community!
