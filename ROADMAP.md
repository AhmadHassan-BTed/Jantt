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

### Phase 3: Multi-View Workspace, People & Extensibility (Released in v1.2.0) [Completed]
- [x] **Multi-View Interactive Workspace**:
  - Gantt Timeline view with sticky data grid and 90° CAD links.
  - Interactive Kanban Board with multi-sort (priority, dates, assignee, WBS).
  - Tasks Checklist (`Todo List` with 1-click completion) and Detailed Cards mode.
  - Budget & KPI Analytics dashboard with cost variance tracking.
- [x] **People & Teams Auto-Discovery Engine**:
  - Automatic entity inference from `meta.person`, `tasks[].assignee`, and `documents[].owner`.
  - 1-click persistence into JSON schema `people[]`.
  - Squad/Team assignments and avatar palette styling.
- [x] **Universal Date Filter Subheader**:
  - Presets for Today, This Week, Pick Date, and Date Range.
  - Contextual Dim vs Filter focus modes across all views.
- [x] **Smooth Cursor-Anchored Column Resizing**:
  - Exponential rubberband curve drag-to-resize header columns.
  - Cursor-anchored viewport transform with `requestAnimationFrame` 60/120fps throttling.
- [x] **Client-Side High-Res Exporters**:
  - Native RFC-4180 CSV spreadsheet export (`exportToCsv`, `downloadCsv`).
  - Native SVG vector download.
  - JSON plan export.
- [x] **Remote Cloud URL Live Sync**:
  - Two-way polling and push sync with remote JSON URLs.
  - ETag caching, conflict detection, and network status indicators.

### Phase 4: Enterprise Hierarchy & Scalability (Upcoming v1.3.0) [In Progress]
- [ ] **Hierarchical Grouping & Subtasks**:
  - Parent summary tasks spanning across subtasks with accordion collapse/expand.
  - Category and Assignee lane grouping.
- [ ] **Custom Column Configuration**:
  - Declarative column definitions in JSON `viewport.columns`.
- [ ] **Virtual Scrolling**:
  - Ultra-high performance rendering for 5,000+ tasks.

### Phase 4: Cloud Sync & Collaborative Ecosystem (v2.0.0 Vision) [Planned]
- [ ] **Firebase Cloud Storage & Real-Time Rooms**:
  - Save, load, and manage Jantt plans directly in Firebase Cloud Firestore.
  - Live collaboration rooms with real-time multi-user syncing.
  - Clean GitHub sign-in for Firebase authentication and repository star verification.
- [ ] **Real-Time Multi-Agent Collaboration (CRDTs)**:
  - Yjs / Automerge bindings for real-time collaborative schedule editing.
- [ ] **AI Natural Language Command Extension**:
  - Built-in prompt tools for Claude, GPT, and Gemini to stream timeline updates directly into Jantt state.
- [ ] **Vue, Svelte, and Angular Official Wrappers**:
  - Lightweight wrappers for other major web frameworks.


---

## How to Propose New Features

Have an idea or use-case? Open a [Feature Request](https://github.com/AhmadHassan-BTed/Jantt/issues/new?template=feature_request.yml) on GitHub to discuss the RFC with the community!
