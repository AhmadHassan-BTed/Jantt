/**
 * @deprecated Compatibility re-export: `renderJantt` and the engine now live in
 * `rendering/jantt-engine`. Import from there (or from the package root); this shim goes away once
 * the package index stops importing it.
 */
export { renderJantt, JanttRendererEngine } from "./rendering/jantt-engine";
export type { JanttInstance } from "./rendering/jantt-engine";
