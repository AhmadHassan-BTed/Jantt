/**
 * Jantt Core
 * The dependency-free, enterprise JSON Gantt chart engine
 */

import "./theme.css";

export * from "./types";
export * from "./date-math";
export * from "./validator";
export * from "./resolver";
export * from "./layout";
export * from "./controller";
export * from "./detail-modal";
export * from "./renderers";
export * from "./renderer";
export * from "./exporter";

import { renderJantt } from "./renderer";
import { validate } from "./validator";
import { resolveSchedule, calculateCriticalPath } from "./resolver";
import { layout, computeDependencyPath } from "./layout";
import { exportToCsv, downloadCsv, downloadJson, exportSvgString } from "./exporter";

export const Jantt = {
  mount: renderJantt,
  validate,
  resolveSchedule,
  calculateCriticalPath,
  layout,
  computeDependencyPath,
  exportToCsv,
  downloadCsv,
  downloadJson,
  exportSvgString,
  version: "1.1.0"
};

export default Jantt;
