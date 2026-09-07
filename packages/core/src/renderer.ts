import { JanttData, JanttOptions } from "./types";
import { JanttRendererEngine, JanttInstance } from "./rendering/index";

export type { JanttInstance };
export { JanttRendererEngine };

/**
 * Mounts an enterprise-grade interactive Jantt chart into the given DOM container.
 * Employs modular rendering sub-systems with high cohesion and zero unnecessary coupling.
 *
 * @param container The host HTMLElement where the chart will be mounted
 * @param initialData The initial Jantt plan specification
 * @param options Optional configuration parameters and lifecycle hooks
 * @returns A JanttInstance controller for programmatic updates and state inspection
 */
export function renderJantt(
  container: HTMLElement,
  initialData: JanttData,
  options: JanttOptions = {}
): JanttInstance {
  const engine = new JanttRendererEngine(container, initialData, options);
  return engine.mount();
}
