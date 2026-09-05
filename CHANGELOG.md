# Changelog

All notable changes to the **Jantt** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] - 2026-09-05

### Added
- **Operations Research Critical Path Engine (`@jantt/core/cpm`)**:
  - Full 2-pass Activity-on-Node (AON) DAG topological solver calculating Early/Late Start ($ES, LS$), Early/Late Finish ($EF, LF$), Total Float ($TF$), Free Float ($FF$), and near-critical paths.
  - Resolved leaf task bug; driving dependency chains are identified with exact operations research formulas.
- **Earned Value Management (EVM - ANSI/EIA-748)**:
  - Enterprise metrics suite calculating $BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI$.
  - Dual-mode presentation: intuitive project pulse for everyday managers/hobbyists alongside advanced PM drawer for senior directors and PMP audits.
- **DCMA 14-Point Schedule Health Audit**:
  - Algorithmic audit rating schedules with Letter Grades (A–F) and Health Scores (/100).
  - Diagnostic issues drawer detecting Missing Logic, Negative Float, High Float ($>44$d), and Out-of-Sequence tasks with actionable advice.
- **PERT 3-Point Risk & Confidence Engine**:
  - Beta-distribution expected duration ($\mu = \frac{O + 4M + P}{6}$) and Central Limit Theorem normal distribution confidence intervals ($Z$-score).
- **Shared Project Notes Workspace & Task Attachments**:
  - Root `"notes"` collection in Jantt JSON with support for titles, markdown content, color tints, tags, pinning, and `task_ids` task attachments.
  - Interactive `@person` and `/task-id` mentions with real-time highlighted pills in Markdown preview mode.
  - Sectioned views for Attached Tasks, Mentioned Tasks, and Mentioned People with 1-click attach/detach actions and quick insertion toolbar.
  - Persistent active note state: open notes remain opened across tab transitions and browser reloads with safe flush on unmount.
- **Concise & Streamlined Feature Matrix**:
  - Re-architected README.md and documentation with clear visual tables placing interactive human features up front and complex mathematical algorithms down below.
- **Centralized Data & Persistence Navigation**:
  - Removed cluttered standalone Auto-Save and Import/Export buttons from the top navbar.
  - Consolidated Import JSON, Export JSON, Export CSV, and Auto-Save cadence into the Gantt chart toolbar's Settings popover and the Auto-Save & Storage modal.
- **Direct Task Color Overrides**:
  - Tasks can now declare an optional direct `color: "#HEX"` property that overrides category defaults.
- **Swiss Noir Theme & High-Contrast Styling**:
  - Streamlined "Swiss Noir" true pitch-black theme with high-contrast text styling.
  - Ensured all mode toggles and action buttons dynamically adapt text colors (`--jantt-accent-contrast`) to remain fully visible.

### Changed
- **Zero Emoji Policy**:
  - Replaced all emojis across tooltips, diagnostic cards, and selectors with crisp Lucide SVG icons and high-contrast typography.
- **Schema Validation & Integrity Guard**:
  - Added dedicated schema validation for the `notes` collection in `@jantt/core`.
  - Fortified `handleChartCommit` with master-state deep merging and safe JSON serialization to guarantee GUI interactions never corrupt or break JSON datasets.

---

## [1.2.0] - 2026-09-04

### Added
- **People, Teams & Auto-Discovery Engine**:
  - Automatic entity inference from `meta.person` (Project Lead), `tasks[].assignee`, and `documents[].owner`.
  - Discovered assignees populate member filters, Kanban squad cards, and the People modal with generated avatars.
  - 1-click persistence to write clean `Person` entries into the JSON schema's root `"people"` array.
- **Multi-View Interactive Workspace**:
  - **Tasks View**: Added interactive Todo checklist with one-click completion checkboxes `[x]`, status transitions, and card layouts.
  - **Kanban Board**: Drag-and-drop workflow lanes with multi-column sorting (by priority, dates, assignee, WBS).
  - **Budget & KPI Dashboard**: Real-time project metrics tracking total spend, cost variance, and completion percentage.
- **Universal Date Filter Subheader**:
  - Presets for Today, This Week, Pick Date, and Date Range.
  - Contextual **Dim vs Filter** focus modes across Gantt, Kanban, and Tasks views.
- **Smooth Cursor-Anchored Drag-to-Resize Columns**:
  - Interactive header column dragging with smooth exponential scaling and `requestAnimationFrame` 60/120fps throttling.
  - Cursor-anchored viewport transform preventing position jumping.
- **Client-Side High-Resolution Exporters**:
  - RFC-4180 compliant CSV export (`exportToCsv`, `downloadCsv`), standalone SVG extraction, and formatted JSON downloads.
- **Remote Cloud URL Live Sync**:
  - Live bidirectional two-way sync with remote HTTP/HTTPS JSON endpoints, ETag caching, and conflict diagnostics.
- **Complete Multi-Audience SEO & Discoverability**:
  - Full Schema.org JSON-LD structured data (`SoftwareApplication` / `WebApplication`).
  - Tailored keyword architecture for AI agents, graduate students (PhD/MS application pipelines), and personal productivity roadmaps.

### Fixed
- Fixed Settings popover premature closing caused by orphaned document pointerdown listeners during DOM re-renders.
- Fixed Gantt chart Dim mode synchronization for date-filtered task bars and SVG dependency lines.
- Fixed JSON Monaco editor synchronization when pasting plans with custom people and team entities.

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
