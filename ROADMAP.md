# Jantt Project Roadmap

This document outlines the strategic vision, upcoming milestones, and architectural goals for **Jantt - The JSON Gantt Chart Engine**.

---

## Strategic Vision

To be the world's most capable, lightweight Gantt chart engine - designed specifically for AI agents, developers, and product teams who want their schedule state to live in clean, declarative, portable JSON.

---

## Release Milestones

### Phase 1: Core Foundation (Released in v1.0.0) [Completed]
- [x] `@jantt/core` engine written from first principles in TypeScript.
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
- [x] **Remote JSON Loading**:
  - Load plans from GitHub, Dropbox, or any HTTPS URL (`parseCloudUrl`, `fetchRemotePlan`).

### Phase 4: Analytics, Collaboration & Ecosystem (Released in v1.3.0 - v1.4.0) [Completed]
- [x] **Operations Research Suite**: Critical Path Method with total/free float, Earned Value Management (ANSI/EIA-748), DCMA-14 schedule health audit, PERT estimates, Monte Carlo risk simulation, resource leveling, working calendars with statutory holidays, and baseline snapshots.
- [x] **Cloud Rooms on Firebase Realtime Database**: GitHub sign-in, owner/editor/viewer roles enforced by `database.rules.json`, live multi-user sync with three-way reconciliation, shared notes.
- [x] **Real-Time CRDT Collaboration**: `@jantt/yjs` binding with presence awareness and scoped undo/redo.
- [x] **Framework Wrappers**: `@jantt/vue`, `@jantt/svelte`, and the `<jantt-timeline>` Web Component (`@jantt/elements`).
- [x] **Enterprise Interop**: `@jantt/interop` for MS Project XML, Primavera P6 XER, CSV, and executive reports.
- [x] **Scale**: `PlanVirtualizer` windowed rendering, off-main-thread scheduling worker, and the `@jantt/render-canvas` 2D canvas renderer for very large plans.
- [x] **AI Agent Protocol**: `@jantt/mcp` Model Context Protocol server with deterministic planning tools.

### Phase 5: Hierarchy, Customization & Release Engineering (Upcoming) [Planned]
- [x] **AI Natural Language Commands & Interactive Copilot Sidebar**:
  - In-app AI Copilot sidebar in the playground with Bring-Your-Own-Key (BYOK) multi-provider support (Gemini, OpenAI, Claude, Groq, DeepSeek, OpenRouter, Mistral, xAI, Ollama, Custom).
  - Live auto-commit and review modes, structural diffing, and 1-click snapshot rollback.
  - Zero-pollution AST sanitizer, partial state reconciler, and token-dense prompt engineering.
- [ ] **Hierarchical Grouping & Subtasks**:
  - Parent summary tasks spanning across subtasks with accordion collapse/expand.
  - Category and Assignee lane grouping.
- [ ] **Per-Task Timetable & Time-Slot Integration**:
  - Attach a granular daily/weekly timetable or scheduled time-block breakdown directly inside each task (e.g., recurring sessions, study/work slots, shift windows, or hourly agendas within a task's date span).
  - View and edit task timetables from the task detail view and surface scheduled slots alongside timeline bars without cluttering the top-level Gantt JSON.
- [ ] **Custom Column Configuration in JSON**:
  - Declarative column definitions stored in the plan, building on the existing `viewport.columns` option.
- [ ] **Angular Wrapper**:
  - Lightweight wrapper alongside the React, Vue, Svelte, and Web Component adapters.
- [ ] **Faster Playground Loads**:
  - Lazy-load secondary views and the cloud (Firebase) features so local-only users download less.
- [ ] **Release Automation**:
  - Single-source package versioning and changelog generation for all `@jantt/*` packages.

---

## How to Propose New Features

Have an idea or use-case? Open a [Feature Request](https://github.com/AhmadHassan-BTed/Jantt/issues/new?template=feature_request.yml) on GitHub to discuss the RFC with the community!
