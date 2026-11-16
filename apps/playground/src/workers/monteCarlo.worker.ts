/**
 * Module Web Worker that answers the core schedule-worker protocol (Monte Carlo, schedule
 * resolution, resource leveling) off the main thread. Load it through Vite's `?worker&url`
 * import and pass the URL to `createScheduleWorkerClient`, which falls back to the main thread
 * when workers are unavailable.
 *
 * It imports the core worker module directly: the `@jantt/core` index pulls in theme.css and
 * DOM renderer code, neither of which can load inside a worker.
 */
import { installScheduleWorker } from "../../../../packages/core/src/worker";

installScheduleWorker();
