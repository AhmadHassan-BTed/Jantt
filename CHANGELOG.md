# Changelog

All notable changes to the **Jantt** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **In-App AI Copilot Sidebar (Antigravity-Inspired Interactive Engine)**:
  - Client-side Bring-Your-Own-Key (BYOK) AI Copilot integrated directly into the Jantt Playground (`apps/playground`).
  - Accessible via the top navbar Copilot button and the global shortcut `Ctrl+J` / `Cmd+J`.
  - Antigravity-styled sliding drawer with dark obsidian input card (`#1C1C1E`), auto-expanding multi-line textarea, model selector pill, and dual send/stop streaming indicator.
- **Multi-Provider & Multi-Account Architecture (N Providers & N Keys)**:
  - 10 first-class AI providers out of the box: Google Gemini, OpenAI, Anthropic Claude, Groq, DeepSeek, OpenRouter, Mistral AI, xAI (Grok), Local Ollama, and Custom OpenAI-Compatible.
  - Multi-profile support: users can configure N distinct accounts and API keys (e.g. separate Personal and Work Gemini keys, or multiple Ollama network hosts).
  - Clean Provider Dropdown selector in Settings, eliminating vertical radio-card clutter.
  - Dynamic Custom Model ID input on the fly (`+ Add Custom Model ID...`).
  - Credentials-Only Chat Gating: the chat model selector strictly filters down to only those providers and accounts for which credentials have actually been configured, eliminating menu clutter.
  - Native browser CORS support via OpenRouter (single key for 200+ models with zero backend).
  - Offline local model execution via Ollama (`http://localhost:11434`) with zero API key requirement.
- **Zero-Pollution Schema Sanitizer & Partial State Reconciler**:
  - `sanitizeAndReconcilePlan()` engine: purges non-schema commentary keys (`explanation`, `thought`, `summary`, `changes_made`, `reasoning`) from the plan AST.
  - Protects task `notes` and `label` from being overwritten by AI changelog commentary.
  - Partial updates reconciler: merges partial modifications (e.g. updating 1 or 2 tasks) into the master schedule without dropping existing tasks, categories, people, or notes.
- **Live Auto-Commit vs. Manual Review Mode & 1-Click Revert**:
  - Live Auto-Commit mode: immediately validates and applies clean AI plan edits live to both the interactive Gantt chart canvas and the split JSON code editor.
  - Manual Review mode: generates structural diff preview cards (`+ Added`, `Modified`, `- Removed`) with explicit Accept / Dismiss buttons.
  - 1-click snapshot reversion: every assistant message records the exact prior plan snapshot, enabling instant rollback at any time.
- **Token-Dense Prompt Engineering & Strict Negative Constraints**:
  - Hyper-compact TypeScript interface contract reducing schema prompt tokens by 66% (from ~650 tokens down to ~220 tokens).
  - Dynamic AST pruning (`stripEmptyValues`): drops null, undefined, and empty string properties to save 1,000+ to 2,500+ tokens on large project plans.
  - Strict negative prompting (`[FORBIDDEN]`) preventing circular dependencies, invalid dates (end date < start date), non-schema keys, and unnecessary JSON outputs for analytical inquiries.

Production-readiness hardening pass.

### Fixed
- **Package entry points**: `@jantt/core` now emits `dist/theme.css`, the target of its `./theme.css` and `./style.css` exports (the build had been emitting `core.css`, so every documented stylesheet import failed). `@jantt/core/dist/theme.css` is exported too, so existing imports keep working.
- **Standalone CDN stylesheet**: `@jantt/standalone` now emits `dist/style.css`, matching its `style` field, the README and the Python bridge (it had been emitting `standalone.css`, a 404 on unpkg). The UMD build is now `dist/jantt.standalone.umd.cjs` (the package `main`), so CommonJS loaders no longer parse it as an ES module; the IIFE script-tag file is unchanged.
- **React typings**: `@jantt/react` declarations import the `@jantt/core` package instead of the unpublished `../../core/src` path, so `JanttProps.data` and friends are typed for consumers.
- **Web Component CDN usage**: `@jantt/elements` ships `dist/jantt-elements.js`, a self-contained ES module (also its `unpkg`/`jsdelivr` entry and `@jantt/elements/browser` export); the previous CDN snippet failed on the bare `@jantt/core` import.
- **Docker image**: copies every workspace manifest before `npm ci`, keeps host `node_modules`, `dist`, `.git` and `.env*` out of the image, builds before testing, and serves the playground from unprivileged nginx on port 8080 with gzip, cache and security headers.
- **Documentation**: corrected the dependency and bundle-size claims, test counts, theme snippets (`themeClassName="jantt-theme-dark"`), CSS import paths, the scoped CLI invocation (`npx @jantt/cli`, never the unrelated `npx jantt`), the OAuth scope (`read:user` only), `autoCascade`'s default (`true`), validation rules, the scale widths and module map in the architecture guide, nonexistent API exports, and broken support links. All docs now use the resolvable schema URL `https://ahmadhassan-bted.github.io/Jantt/schema/v1.json`.

### Changed
- **Toolchain**: Vitest 5 (one Vite 8 install, no nested Vite 5) hoisted to the workspace root with a single jsdom 31; contributors need Node.js `^22.22.2 || ^24.15.0 || >=26` (`.nvmrc` pins 22, `.npmrc` enables `engine-strict`). Published packages declare `engines.node` `^20.19.0 || >=22.12.0`, the Vite 8 / rolldown floor.
- **`@jantt/core` packaging**: `fflate` is no longer bundled into `dist`; it stays a regular dependency so applications dedupe it. Every published package now declares `license`, `repository`, `homepage` and `bugs`.
- **Scripts**: `npm run lint` runs the TypeScript typecheck and a syntax check of the JavaScript CLIs (it used to only print a success message); `npm run check:packages` runs publint on every workspace; `npm run clean` works on Windows; the playground has a `test` script, so its suites run in `npm test`.
- **Playground build**: workspace packages are bundled from source, vendor code is split into long-lived `vendor`, `vendor-react` and `vendor-firebase` chunks, and the dev server binds to `localhost` unless `PLAYGROUND_HOST` says otherwise. A root `.env` (see `.env.example`) configures the dev server and optional Firebase project.
- **CI/CD**: least-privilege `permissions` everywhere and no persisted checkout credentials; CI tests Node 22 and 24, lints, and validates package contents. GitHub Pages deploys only commits that passed CI and never cancels a running deployment. Releases run the CI gate, refuse tags that do not match the package versions, build in a job without publish rights, publish with npm provenance (skipping versions already on the registry), and create the GitHub release with the `gh` CLI. High or critical advisories in runtime dependencies now fail the security workflow.

---

## [1.4.0] - 2026-09-08

### Added
- **Role-Based Security & Permissions Guard (Viewer vs Editor)**:
  - Cryptographic token validation and tamper-resistant room parameters, eliminating naive URL-based privilege escalation.
  - Strict read-only viewer mode (`isReadOnly`), disallowing unauthorized mutation across timeline drag-to-move, bar resizing, dependency linking, modal commits, note editing, and task deletion.
  - `ReadOnlyForkModal`: Informative modal when viewers attempt edits, offering "Make a Local Copy" (forks project to isolated local state) or GitHub sign-in.
  - `EditorLoginModal`: Seamless GitHub OAuth / secret token authentication for authorized editors.
- **Swiss Noir Default Aesthetic**:
  - Promoted Swiss Noir to default theme across the entire application and shared room sessions.
  - True pitch-black OLED background (`#080D18`), high-contrast typography, electric cyan (`#38BDF8`) accents, and glassmorphic panels.
- **Project Notes & Specifications Redesign (Master-Detail Dual Pane)**:
  - Complete architectural migration to dual-pane master-detail Notion/Linear-grade interface (`NotesSidebar` + `NoteEditor`).
  - Left Master Sidebar: Search bar, color filter chips (All, Blue, Green, Amber, Purple, Crimson), scrollable note cards with relative timestamps and attached task counters, and 1-click note creation.
  - Right Editor Surface: 26px typography title input, rich `contenteditable` surface with placeholder styling, Markdown preview mode toggle, pinning, color switcher popover, and instant deletion.
  - Live Autocomplete Popover: Notion-style `@person` autocomplete for team members and `/task` autocomplete for roadmap tasks with inline mention pills.
  - Attached Tasks Drawer: Bottom drawer showing linked tasks with team indicators, remove buttons, and task picker search popover.
  - Mobile responsive layout with back button navigation between master sidebar and active note editor.
- **Mobile & Touch Gestures Overhaul**:
  - Comprehensive mobile responsiveness across Gantt, Kanban, Tasks, and Notes views.
  - Touch scrub navigation and pinch-to-zoom timeline scaling.
  - Single-column Kanban scroll snapping (`scroll-snap-type: x mandatory`).
  - Mobile bottom navigation bar for seamless tab switching.
- **Shared Cloud Room Notes & Realtime Collaborative Documentation**:
  - Full bidirectional synchronization of the project `notes` collection across all room members via Firebase Realtime Database WebSockets.
  - Multi-user 3-way CRDT reconciliation with last-write-wins (LWW) per field (`title`, `content`, `color`, `pinned`, `task_ids`) and tombstone propagation for note deletions to prevent resurrection.
  - Strict role-based permissions: Room Owner and Editors possess full read/write permissions (create, edit, re-color, pin, attach tasks, delete); Viewers possess locked read-only access (`readOnly` inputs, non-editable surface, disabled color/pin toggles, hidden delete and attach buttons).
  - Per-project active note scoping (`jantt_active_note_id_${activeProjectId}`) eliminating ghost note states when switching between rooms.
  - Task and note metrics tracking in room metadata (`taskCount` and `noteCount`) for clear visibility in room listings and share modals.
- **Cloud Collaboration & Realtime Sync Refinements**:
  - Firebase Realtime Database CRDT sync with offline queueing and conflict resolution.
  - GitHub Stargazer verification service with automated background checking (`githubVerificationService.ts`).
  - Excluded internal repositories (`.github`, `Fractal-PrivacyPolicy`, `Fractal_basics`) from star requirements.

- **Comprehensive Jantt JSON Specification & Benchmark Cheatsheet (v1.4.0)**:
  - Exhaustive master kitchen-sink dataset and individual copy-pasteable samples for every single engine functionality:
    - Root schema metadata (`$schema`, `scale`, `linkRouting`, `defaultGapDays`, `autoCascade`, `showCriticalPath`, `showBaselines`, `currency`, `budget`).
    - Categories map with hex colors, dark-mode soft tints, and Lucide icons.
    - People & Squads registry with canonical `@username` handles vs offline `person-xxx` personas.
    - Collaborative notes with attached `task_ids`, pinning, tagging, and author attribution (`updatedBy`).
    - Compliance documents & deliverables checklist (`have`, `pending`, `missing`).
    - Complete task variations: WBS, phases, priorities, urgent pulse badge, locked constraints, progress ratios, zero-duration milestone diamonds, multi-prerequisite DAG dependencies, lag/gap days, planned baselines, direct color overrides, and custom domain fields dictionary (`jira`, `storyPoints`, `repo`, `prUrl`).
    - Operations research metrics: Critical Path Method (CPM), Earned Value Management (EVM), DCMA-14 schedule health audits, and PERT risk bounds.

### Changed
- **Zero-Emoji Policy**:
  - Enforced strict zero-emoji policy across all markdown documentation (only `✓` and `✗` preserved).
- **Multi-Audience Documentation**:
  - Tailored documentation for AI agents generating Gantt charts (declarative schema contract), students/hobbyists (simple, beautiful, zero-dependency timelines), and enterprise program directors (EVM, DCMA-14, multi-user CRDT sync).

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
- Fixed JSON editor synchronization when pasting plans with custom people and team entities.

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
