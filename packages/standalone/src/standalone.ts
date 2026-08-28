import { JanttData, JanttOptions, renderJantt, validate, resolveSchedule, layout } from "@jantt/core";
import "@jantt/core/theme.css";

/**
 * Global Jantt API for script tag usage:
 * <script src="jantt.standalone.js"></script>
 * Jantt.mount("#root", planJson, { ... });
 */
export const Jantt = {
  mount: (selectorOrEl: string | HTMLElement, data: JanttData, options?: JanttOptions) => {
    const el = typeof selectorOrEl === "string" ? document.querySelector<HTMLElement>(selectorOrEl) : selectorOrEl;
    if (!el) {
      throw new Error(`[Jantt] Mount target '${selectorOrEl}' not found in document.`);
    }
    return renderJantt(el, data, options);
  },
  validate,
  resolveSchedule,
  layout,
  version: "1.0.0"
};

// Expose on window in browser environments
if (typeof window !== "undefined") {
  (window as unknown as { Jantt: typeof Jantt }).Jantt = Jantt;
}

export default Jantt;
