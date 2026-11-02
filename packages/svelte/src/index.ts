/**
 * Jantt Svelte Adapter
 *
 * Provides a high-performance Svelte action and mount utilities for the Jantt JSON Gantt chart engine.
 */

import {
  JanttData,
  JanttOptions,
  renderJantt,
  JanttInstance
} from "@jantt/core";

export interface JanttActionOptions {
  data: JanttData;
  options?: Partial<JanttOptions>;
  onReady?: (instance: JanttInstance) => void;
}

export interface JanttActionResult {
  update: (newParams: JanttActionOptions) => void;
  destroy: () => void;
}

/**
 * Svelte Action to mount and reactively bind a Jantt timeline to any DOM element:
 *
 * <div use:janttAction={{ data: plan, options: { autoCascade: true } }} />
 */
export function janttAction(
  node: HTMLElement,
  params: JanttActionOptions
): JanttActionResult {
  let instance: JanttInstance | null = null;

  try {
    instance = renderJantt(node, params.data, params.options || {});
    if (params.onReady && instance) {
      params.onReady(instance);
    }
  } catch (err) {
    if (params.options?.onError) {
      params.options.onError(err as Error);
    } else {
      console.error("[@jantt/svelte] Failed to mount Jantt instance:", err);
    }
  }

  return {
    update(newParams: JanttActionOptions) {
      if (!instance || !newParams.data) return;
      instance.update(newParams.data, newParams.options);
    },
    destroy() {
      if (instance && typeof instance.destroy === "function") {
        instance.destroy();
        instance = null;
      }
    }
  };
}

/**
 * Direct imperative mount helper for Svelte components.
 */
export function mountJantt(
  node: HTMLElement,
  data: JanttData,
  options?: JanttOptions
): JanttInstance {
  return renderJantt(node, data, options);
}

export default janttAction;
