/**
 * Jantt Core
 * The dependency-free, enterprise JSON Gantt chart engine
 */

import "./theme.css";

export * from "./constants";
export * from "./utils";
export * from "./types";
export * from "./date-math";
export * from "./validator";
export * from "./resolver";
export * from "./cpm";
export * from "./evm";
export * from "./schedule-health";
export * from "./pert";
export * from "./team-resolver";
export * from "./layout";
export * from "./controller";
export * from "./detail-modal";
export * from "./sidebar";
export * from "./renderers";
export * from "./renderer";
export * from "./exporter";
export * from "./themes";
export * from "./remote-sync";
export * from "./reconciler";

import { renderJantt } from "./renderer";
import { validate } from "./validator";
import { resolveSchedule } from "./resolver";
import { calculateCriticalPath, getTaskDependencies } from "./cpm";
import { calculateEVM } from "./evm";
import { auditScheduleIntegrity } from "./schedule-health";
import { calculatePertRisk, estimateTaskPert } from "./pert";
import { layout, computeDependencyPath, getScaleFromDayWidth, SCALE_DAY_WIDTHS } from "./layout";
import { createTaskSidebar } from "./sidebar";
import { exportToCsv, downloadCsv, downloadJson, exportSvgString } from "./exporter";
import { themeManager } from "./themes";
import { parseCloudUrl, fetchRemotePlan } from "./remote-sync";
import { calculatePlanHash, reconcilePlans, mergePlansCommutative, purgeTombstones } from "./reconciler";

export const Jantt = {
  mount: renderJantt,
  createTaskSidebar,
  validate,
  resolveSchedule,
  calculateCriticalPath,
  getTaskDependencies,
  calculateEVM,
  auditScheduleIntegrity,
  calculatePertRisk,
  estimateTaskPert,
  layout,
  computeDependencyPath,
  getScaleFromDayWidth,
  SCALE_DAY_WIDTHS,
  exportToCsv,
  downloadCsv,
  downloadJson,
  exportSvgString,
  themeManager,
  parseCloudUrl,
  fetchRemotePlan,
  calculatePlanHash,
  reconcilePlans,
  mergePlansCommutative,
  purgeTombstones,
  version: "1.2.0"
};


export default Jantt;
