/**
 * Central Components Barrel Export.
 * Organizes components by functional domains:
 * - layout: Persistent application chrome (Navbar, Subheader, CloudBar, EditorPane, DateFilterBar)
 * - cloud: Collaborative room modals, GitHub onboarding, user hubs
 * - modals: Dialogs for project sharing, template prompts, auto-save, team management
 * - views: High-level visualization views (Kanban, Tasks, Notes, Budget/EVM KPIs)
 * - common: Shared visual primitives (Logos, Toasts, Empty states)
 */

export * from "./layout";
export * from "./cloud";
export * from "./modals";
export * from "./views";
export * from "./common";
