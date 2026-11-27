# Jantt Playground App (`@jantt/playground`)

The full-featured interactive web application and sandbox for declarative Gantt planning, real-time collaboration, and AI timeline testing.

[![TypeScript 5.4](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 8](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-38BDF8.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Workspace Views

Switch views from the top bar (or keys `1`-`6`; bottom bar on phones).

1. **Gantt Chart View**:
   - 90° CAD orthogonal dependency routing with live drag-to-link anchor ports.
   - Critical Path highlight and ghost baseline variance comparison.
   - Inline completion percentage drag handles on task bars.
   - 5 timeline zoom tiers (Day, Week, Month, Quarter, Year) + continuous zoom slider.
2. **Canvas View**:
   - Virtualized canvas renderer for very large plans (stress-tested with 100k tasks).
3. **Kanban Board**:
   - Workflow columns: To Do, In Progress, Blocked, In Review, Completed.
   - Multi-field column sorting (by Priority, Start Date, Assignee, WBS).
   - Drag-and-drop task status transitions.
4. **Tasks Checklist View**:
   - 1-click completion checkboxes with strikethrough styling.
   - Assignee squad tags, priority pills, and category badges.
5. **Project Health & PM Analytics**:
   - Earned Value Management (EVM - ANSI/EIA-748): PV, EV, AC, SV, CV, SPI, CPI, EAC.
   - DCMA 14-Point schedule audit with letter grades (A-F).
   - PERT 3-point estimates and Monte Carlo risk simulation (P50 / P80 / P95).
6. **Project Notes & Specifications**:
   - Master-detail notes with `@person` mentions and `/task` links.
   - Attached tasks drawer, color filtering, note pinning, and Markdown preview.

---

## Workspace Shell

* **Plan switcher** (top bar): one popover with exactly three lists (Local plans, My cloud rooms, Shared with me), plus New plan, Import file (`.json`, `.xml` MS Project, `.xer` Primavera, `.csv`) and Manage plans.
* **Cloud popover** (top bar, or "Cloud collaboration" in the phone menu): live room status, role, sync state, presence, invite, join, leave / delete.
* **Command palette**: `Ctrl+K` (`⌘K` on macOS) for views, actions, exports, themes and task search. Press `?` for every keyboard shortcut.
* **Share links**: opening a `#data=` share link always adds a new local plan (or reopens an identical one); existing plans are never replaced.

---

## Collaboration & Security Architecture

* **Role-Based Security**: Distinguishes between authenticated Editors and read-only Viewers. Viewers attempting edits are guided to make an isolated local copy or log in as an authorized editor.
* **GitHub-Only Authentication**: Single-provider OAuth 2.0 with automated `@username` handle provisioning.
* **Realtime Rooms**: Firebase Realtime Database transactions with field-level last-writer-wins merging and offline recovery.
* **Content-Security-Policy**: Production builds install a CSP (inline scripts and event handlers blocked). It is applied at runtime by `src/main.tsx` because GitHub Pages cannot send headers; `public/_headers` carries the same policy for hosts that support it. Keep both in sync when adding a third-party origin.
* **Zero Database IDs in JSON**: Strips internal UIDs, tokens, and secret keys from exports.

---

## Running Locally

```bash
# From the repository root:
npm run dev

# Or run the playground directly:
npm run dev --workspace=@jantt/playground

# Tests and type checks
npm run test --workspace=@jantt/playground
npx tsc --noEmit -p apps/playground/tsconfig.json
```

Workspace packages (`@jantt/core`, `@jantt/react`, `@jantt/interop`, `@jantt/render-canvas`) are resolved from source, so no package build is needed first. The app starts on `http://localhost:5173` (override with `PLAYGROUND_HOST` / `PLAYGROUND_PORT` in the repository `.env`).

---

## Interface language

Choose English or Simplified Chinese under **Appearance → Language** on desktop or **Tools & Settings → Language** on mobile. The choice is stored on this device, and shared plans keep their original task names, notes, and status values.

Translations live in `src/i18n/locales/<locale>.json`. Register a new language and its lazy loader in `src/i18n/index.ts`, and add its month and weekday labels in `src/i18n/timeline.ts`. Keep message keys and named placeholders such as `{count}` in sync with English. Run `npm test -w @jantt/playground` to check both dictionaries.

## License

MIT © [Ahmad Hassan (B-Ted)](https://github.com/AhmadHassan-BTed)
