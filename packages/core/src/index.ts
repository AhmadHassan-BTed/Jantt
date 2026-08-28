/**
 * Jantt Core
 * The dependency-free JSON Gantt chart engine
 */

import "./theme.css";

export * from "./types";
export * from "./date-math";
export * from "./validator";
export * from "./resolver";
export * from "./layout";
export * from "./controller";
export * from "./detail-modal";
export * from "./renderer";

import { renderJantt } from "./renderer";
import { validate } from "./validator";
import { resolveSchedule } from "./resolver";
import { layout } from "./layout";

export const Jantt = {
  mount: renderJantt,
  validate,
  resolveSchedule,
  layout,
  version: "1.0.0"
};

export default Jantt;
