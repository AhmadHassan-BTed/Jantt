/**
 * Jantt Core
 * Framework-agnostic JSON Gantt chart engine: scheduling, analytics, DOM renderer and sync.
 *
 * Public API: every name re-exported below. The 1.x surface only grows (names, signatures and
 * `Jantt` keys stay backward compatible). The DOM building blocks (`renderers/*`) and the gesture
 * types are exported for typing and composition, not as extension points. Replacing `export *`
 * with an explicit list, removing `createDetailModal` and moving the Firebase/remote sync helpers
 * out of core are deferred to the next major release.
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
export { TaskScheduleCoordinator } from "./rendering/task-schedule-coordinator";
export * from "./exporter";
export * from "./themes";
export * from "./remote-sync";
export * from "./reconciler";
export * from "./share-coder";
export * from "./firebase-sync";
export * from "./pipeline";
export * from "./virtualizer";
export * from "./dependencies";
export * from "./calendar";
export * from "./resource-leveler";
export * from "./monte-carlo";
export * from "./baselines";
export * from "./worker";

import { renderJantt } from "./renderer";
import { validate } from "./validator";
import { resolveSchedule } from "./resolver";
import { calculateCriticalPath, getTaskDependencies } from "./cpm";
import { calculateEVM } from "./evm";
import { auditScheduleIntegrity } from "./schedule-health";
import { calculatePertRisk, estimateTaskPert } from "./pert";
import { detectOverAllocations, levelResources } from "./resource-leveler";
import { runMonteCarloSimulation } from "./monte-carlo";
import { freezeProjectBaseline, activateBaselineSnapshot, computeBaselineVariance } from "./baselines";
import { createScheduleWorkerClient } from "./worker";
import { layout, computeDependencyPath, getScaleFromDayWidth, SCALE_DAY_WIDTHS } from "./layout";
import { createTaskSidebar } from "./sidebar";
import { exportToCsv, downloadCsv, downloadJson, exportSvgString } from "./exporter";
import { themeManager } from "./themes";
import { parseCloudUrl, fetchRemotePlan, isMatchingCloudUrl } from "./remote-sync";
import { calculatePlanHash, reconcilePlans, mergePlansCommutative, purgeTombstones, maintainPlanData } from "./reconciler";
import { compressPlanToUrlPayload, decompressPlanFromUrlPayload, cleanPlanForSharing, sanitizePlanForJson } from "./share-coder";
import {
  createCloudRoom,
  fetchCloudRoom,
  saveCloudRoom,
  subscribeToCloudRoom,
  normalizeUsername,
  generateRoomSlug,
  sanitizeRoomId,
  encodeRtdbKey,
  decodeRtdbKey,
  encodePlanForRtdb,
  decodePlanFromRtdb
} from "./firebase-sync";

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
  detectOverAllocations,
  levelResources,
  runMonteCarloSimulation,
  freezeProjectBaseline,
  activateBaselineSnapshot,
  computeBaselineVariance,
  createScheduleWorkerClient,
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
  isMatchingCloudUrl,
  calculatePlanHash,
  reconcilePlans,
  mergePlansCommutative,
  purgeTombstones,
  maintainPlanData,
  cleanPlanForSharing,
  sanitizePlanForJson,
  compressPlanToUrlPayload,
  decompressPlanFromUrlPayload,
  createCloudRoom,
  fetchCloudRoom,
  saveCloudRoom,
  subscribeToCloudRoom,
  normalizeUsername,
  generateRoomSlug,
  sanitizeRoomId,
  encodeRtdbKey,
  decodeRtdbKey,
  encodePlanForRtdb,
  decodePlanFromRtdb,
  /** Keep in sync with package.json "version" (guarded by tests/exporter.test.ts). */
  version: "1.1.0"
};


export default Jantt;
