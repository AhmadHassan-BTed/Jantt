# Jantt Playground App (`@jantt/playground`)

The full-featured interactive web application and sandbox for declarative Gantt planning, real-time collaboration, and AI timeline testing.

[![TypeScript 5.4](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-38BDF8.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Workspace Views

1. **Gantt Chart View**:
   - 90° CAD orthogonal dependency routing with live drag-to-link anchor ports.
   - Dual-pass Critical Path highlight and ghost baseline variance comparison.
   - Inline completion percentage drag handles on task bars.
   - 5 timeline zoom tiers (Day, Week, Month, Quarter, Year) + continuous zoom slider.
2. **Agile Kanban Board**:
   - 4-column workflow board (Pending, In Progress, Completed, Blocked).
   - Multi-field column sorting (by Priority, Start Date, Assignee, WBS).
   - Drag-and-drop task status transitions.
3. **Tasks Checklist View**:
   - 1-click `[x]` completion checkboxes with strikethrough styling.
   - Assignee squad tags, priority pills, and category badges.
4. **Project Health & PM Analytics**:
   - Dual-mode dashboard: Essential summary vs Advanced PM drawer.
   - Earned Value Management (EVM - ANSI/EIA-748): $PV, EV, AC, SV, CV, SPI, CPI, EAC$.
   - DCMA 14-Point schedule audit metrics rating schedules with Letter Grades (A–F).
   - PERT 3-point probabilistic confidence intervals.
5. **Project Notes & Specifications (Master-Detail)**:
   - Dual-pane Notion/Linear-grade architecture with left master sidebar and right document editor.
   - Live autocomplete popover for `@person` team mentions and `/task` roadmap links.
   - Attached tasks drawer showing linked roadmap deliverables.
   - Color filtering, note pinning, and Markdown preview mode.

---

## Collaboration & Security Architecture

* **Role-Based Security**: Distinguishes between authenticated Editors and read-only Viewers. Viewers attempting edits are guided to make an isolated local copy or log in as an authorized editor.
* **GitHub-Only Authentication**: Secure single-provider OAuth 2.0 with automated `@username` handle provisioning.
* **Realtime CRDT Sync**: Powered by Firebase Realtime Database with 3-way reconciliation and offline recovery.
* **Zero Database IDs in JSON**: Strips internal UIDs, tokens, and secret keys to guarantee zero private data leaks in exports.

---

## Running Locally

```bash
# From the repository root:
npm run dev

# Or run playground directly:
npm run dev --workspace=@jantt/playground
```

The application will start on `http://localhost:5173`.

---

## License

MIT © [Ahmad Hassan (B-Ted)](https://github.com/AhmadHassan-BTed)
