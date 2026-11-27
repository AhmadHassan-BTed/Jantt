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
 *
 * Errors thrown while mounting or updating go to `options.onError` (or the console). A failed
 * mount is retried on the next update, so fixing the data brings the chart back.
 */
export function janttAction(
  node: HTMLElement,
  params: JanttActionOptions
): JanttActionResult {
  let instance: JanttInstance | null = null;
  let current = params;
  let destroyed = false;

  const reportError = (err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    if (current.options?.onError) {
      current.options.onError(error);
    } else {
      console.error("[@jantt/svelte] Jantt failed to render:", error);
    }
  };

  const mount = () => {
    try {
      instance = renderJantt(node, current.data, current.options || {});
    } catch (err) {
      instance = null;
      reportError(err);
      return;
    }
    current.onReady?.(instance);
  };

  mount();

  return {
    update(newParams: JanttActionOptions) {
      const previousOptions = current.options;
      current = newParams;
      if (destroyed || !newParams.data) return;
      if (!instance) {
        mount();
        return;
      }
      try {
        let options = newParams.options;
        if (options?.locale !== previousOptions?.locale) {
          options = { ...options, locale: options?.locale };
          if (options.viewport === previousOptions?.viewport) delete options.viewport;
        }
        instance.update(newParams.data, options);
      } catch (err) {
        reportError(err);
      }
    },
    destroy() {
      destroyed = true;
      instance?.destroy();
      instance = null;
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
