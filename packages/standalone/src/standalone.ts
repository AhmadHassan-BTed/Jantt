import { JanttData, JanttOptions, renderJantt, validate, resolveSchedule, layout } from "@jantt/core";
import "@jantt/core/theme.css";

const mountFn = (selectorOrEl: string | HTMLElement, data: JanttData, options?: JanttOptions) => {
  const el = typeof selectorOrEl === "string" ? document.querySelector<HTMLElement>(selectorOrEl) : selectorOrEl;
  if (!el) {
    throw new Error(`[Jantt] Mount target '${selectorOrEl}' not found in document.`);
  }
  return renderJantt(el, data, options);
};

/**
 * Global Jantt API for script tag usage:
 * <script src="jantt.standalone.iife.js"></script>
 * Jantt.mount("#root", planJson, { ... });
 */
export const Jantt = {
  mount: mountFn,
  render: mountFn,
  validate,
  resolveSchedule,
  layout,
  version: "1.0.0"
};

// Expose on window in browser environments
if (typeof window !== "undefined") {
  const win = window as unknown as { Jantt: typeof Jantt; JanttStandalone: typeof Jantt };
  win.Jantt = Jantt;
  win.JanttStandalone = Jantt;
}

export const JanttStandalone = Jantt;
export default Jantt;
