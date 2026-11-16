/**
 * Central Components Barrel Export.
 * Organizes components by functional domains:
 * - layout: Application chrome (Navbar with plan & cloud popovers, CloudBar panel, EditorPane, DateFilterBar)
 * - cloud: Collaborative room modals, GitHub onboarding, user hubs
 * - modals: Dialogs for project sharing, template prompts, auto-save, team management
 * - views: High-level visualization views (Kanban, Tasks, Notes, Budget/EVM KPIs)
 * - common: Shared primitives (Logos, Toasts, Empty states, Command palette, Error boundary)
 */

export * from "./layout";
export * from "./cloud";
export * from "./modals";
export * from "./views";
export * from "./common";
