#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  validate,
  calculateCriticalPath,
  auditScheduleIntegrity,
  calculateEVM,
  runMonteCarloSimulation,
  isValidISODate,
  escapeHtml,
  DEFAULT_GAP_DAYS
} from "@jantt/core";

import {
  exportMsProjectXml,
  importMsProjectXml,
  exportPrimaveraXer,
  importPrimaveraXer,
  exportSpreadsheetCsv,
  importSpreadsheetCsv,
  exportExecutiveReportHtml,
  exportExecutiveReportSvg
} from "@jantt/interop";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = require("../package.json").version;

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

// -----------------------------------------------------------------------------
// Terminal output helpers (colors are disabled when piped, or via NO_COLOR / --no-color)
// -----------------------------------------------------------------------------
const rawArgs = process.argv.slice(2);
const forceColor = process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0";
const useColor =
  !process.env.NO_COLOR &&
  !rawArgs.includes("--no-color") &&
  (forceColor || Boolean(process.stdout.isTTY && process.stderr.isTTY));

const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const bold = paint("1");
const red = paint("31");
const green = paint("32");
const yellow = paint("33");
const cyan = paint("36");
const gray = paint("90");

class CliError extends Error {
  constructor(message, exitCode = EXIT_FAILURE) {
    super(message);
    this.exitCode = exitCode;
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

// -----------------------------------------------------------------------------
// Command table
// -----------------------------------------------------------------------------
const GLOBAL_OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  "no-color": { type: "boolean" }
};

const EXPORT_FORMATS = ["xml", "xer", "csv", "html", "svg"];
// Importers take raw bytes and detect the encoding (UTF-8/UTF-16 BOMs, Windows-1252 fallback) themselves.
const IMPORTERS = {
  xml: importMsProjectXml,
  xer: importPrimaveraXer,
  csv: importSpreadsheetCsv,
  tsv: (bytes, options) => importSpreadsheetCsv(bytes, { ...options, delimiter: "\t" })
};
const IMPORT_FORMATS = Object.keys(IMPORTERS);
const MAX_PRINTED_WARNINGS = 20;

const COMMANDS = {
  open: {
    usage: "jantt open <file.json> [--port 3456] [--host 127.0.0.1] [--no-open]",
    options: {
      port: { type: "string", short: "p" },
      host: { type: "string" },
      "no-open": { type: "boolean" }
    },
    run: openCommand
  },
  validate: {
    usage: "jantt validate <file.json> [--json]",
    options: { json: { type: "boolean" } },
    run: validateCommand
  },
  audit: {
    usage: "jantt audit <file.json> [--target YYYY-MM-DD] [--json]",
    options: { target: { type: "string" }, json: { type: "boolean" } },
    run: auditCommand
  },
  "monte-carlo": {
    usage: "jantt monte-carlo <file.json> [--runs 2000] [--variance 0.25] [--seed <n>] [--json]",
    options: {
      runs: { type: "string" },
      iterations: { type: "string" },
      variance: { type: "string" },
      uncertainty: { type: "string" },
      seed: { type: "string" },
      json: { type: "boolean" }
    },
    run: monteCarloCommand
  },
  export: {
    usage: `jantt export <file.json> --format <${EXPORT_FORMATS.join("|")}> [--out <output>] [--force]`,
    options: {
      format: { type: "string", short: "f" },
      out: { type: "string", short: "o" },
      force: { type: "boolean" }
    },
    run: exportCommand
  },
  import: {
    usage: `jantt import <file.${IMPORT_FORMATS.join("|file.")}> [--format <${IMPORT_FORMATS.join("|")}>] [--out <output.json>] [--force]`,
    options: {
      format: { type: "string", short: "f" },
      out: { type: "string", short: "o" },
      force: { type: "boolean" }
    },
    run: importCommand
  }
};

const COMMAND_ALIASES = { montecarlo: "monte-carlo", mc: "monte-carlo" };

function main(argv) {
  // Global flags (--help, --version, --no-color) may precede the command name.
  let commandIndex = 0;
  while (commandIndex < argv.length && argv[commandIndex].startsWith("-")) commandIndex++;
  const leading = parseOrUsageError(argv.slice(0, commandIndex), GLOBAL_OPTIONS, false, "jantt <command> [options]");
  const commandName = argv[commandIndex];

  if (leading.values.version) {
    console.log(`jantt v${VERSION}`);
    return 0;
  }
  if (leading.values.help || !commandName || commandName === "help") {
    printHelp();
    return 0;
  }

  const commandKey = COMMAND_ALIASES[commandName] || commandName;
  const command = Object.hasOwn(COMMANDS, commandKey) ? COMMANDS[commandKey] : undefined;
  if (!command) {
    throw new CliError(`Unknown command '${commandName}'. Run 'jantt --help' to list the available commands.`, EXIT_USAGE);
  }

  const { values: flags, positionals } = parseOrUsageError(
    argv.slice(commandIndex + 1),
    { ...GLOBAL_OPTIONS, ...command.options },
    true,
    command.usage
  );
  if (flags.version) {
    console.log(`jantt v${VERSION}`);
    return 0;
  }
  if (flags.help) {
    printHelp();
    return 0;
  }
  if (positionals.length === 0) {
    throw new CliError(`Missing <file> argument.\nUsage: ${command.usage}`, EXIT_USAGE);
  }
  if (positionals.length > 1) {
    throw new CliError(`Unexpected argument '${positionals[1]}'.\nUsage: ${command.usage}`, EXIT_USAGE);
  }
  return command.run(positionals[0], flags);
}

function parseOrUsageError(args, options, allowPositionals, usage) {
  try {
    return parseArgs({ args, options, allowPositionals, strict: true });
  } catch (err) {
    throw new CliError(`${err.message}\nUsage: ${usage}`, EXIT_USAGE);
  }
}

function numberFlag(raw, name, { fallback, min, max, integer = false }) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (String(raw).trim() === "" || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    throw new CliError(
      `Invalid --${name} '${raw}': expected ${integer ? "an integer" : "a number"} between ${min} and ${max}.`,
      EXIT_USAGE
    );
  }
  return value;
}

// -----------------------------------------------------------------------------
// File helpers
// -----------------------------------------------------------------------------
function readUtf8(filePath) {
  // Strip a UTF-8 BOM (common for files saved by Windows editors) so JSON.parse accepts the file.
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

/** Reads an input file as UTF-8 text, or as raw bytes (`asBytes`) for decoders that detect the encoding. */
function readInputFile(filePath, asBytes = false) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  try {
    return asBytes ? { resolvedPath, bytes: fs.readFileSync(resolvedPath) } : { resolvedPath, text: readUtf8(resolvedPath) };
  } catch (err) {
    if (err.code === "ENOENT") throw new CliError(`File not found: ${resolvedPath}`);
    if (err.code === "EISDIR") throw new CliError(`Expected a file but found a directory: ${resolvedPath}`);
    throw new CliError(`Cannot read ${resolvedPath}: ${err.message}`);
  }
}

function loadPlan(filePath) {
  const { resolvedPath, text } = readInputFile(filePath);
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new CliError(`Invalid JSON in ${filePath}: ${err.message}`);
  }
  // Soft-deleted tombstones are sync bookkeeping, not activities: keep them out of analysis and exports.
  const liveTasks = Array.isArray(json?.tasks)
    ? json.tasks.filter((t) => t && typeof t === "object" && !t._deleted)
    : [];
  return { resolvedPath, json, liveTasks };
}

/** The plan's link gap (meta.defaultGapDays), with the engine default the cascade uses. */
function gapDaysOf(json) {
  return Number.isFinite(json?.meta?.defaultGapDays) ? json.meta.defaultGapDays : DEFAULT_GAP_DAYS;
}

/**
 * The project calendar the health checks measure float and duration in, or undefined for calendar days.
 * Same rule as the cascade: an explicit meta.useWorkingDays wins, otherwise a meta.calendar turns working days on.
 * A calendar name resolves against the plan's `calendars` map before the presets.
 */
function workingCalendarOf(json) {
  const meta = json?.meta;
  const ref = meta?.calendar;
  const useWorkingDays = typeof meta?.useWorkingDays === "boolean" ? meta.useWorkingDays : Boolean(ref);
  if (!useWorkingDays) return undefined;
  if (typeof ref === "string") {
    const named = json.calendars && typeof json.calendars === "object" && Object.hasOwn(json.calendars, ref) ? json.calendars[ref] : undefined;
    return named && typeof named === "object" ? named : ref;
  }
  return ref && typeof ref === "object" && !Array.isArray(ref) ? ref : "standard";
}

function isSameFile(a, b) {
  try {
    const sa = fs.statSync(a, { bigint: true });
    const sb = fs.statSync(b, { bigint: true });
    if (sa.ino !== 0n) return sa.ino === sb.ino && sa.dev === sb.dev;
  } catch {
    return false;
  }
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function writeOutputFile(outPath, content, sourcePath, force) {
  if (isSameFile(outPath, sourcePath)) {
    throw new CliError(`Refusing to overwrite the input file ${sourcePath}; choose a different --out path.`);
  }
  try {
    fs.writeFileSync(outPath, content, { encoding: "utf8", flag: force ? "w" : "wx" });
  } catch (err) {
    if (err.code === "EEXIST") {
      throw new CliError(`Refusing to overwrite existing file ${outPath}; pass --force to replace it.`);
    }
    throw new CliError(`Cannot write ${outPath}: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// 1. VALIDATE COMMAND
// -----------------------------------------------------------------------------
function validateCommand(filePath, flags) {
  const { json, liveTasks } = loadPlan(filePath);
  const result = validate(json);

  if (flags.json) {
    printJson({ file: filePath, valid: result.valid, activities: liveTasks.length, errors: result.errors });
    return result.valid ? 0 : EXIT_FAILURE;
  }

  if (!result.valid) {
    console.error(red(`Validation failed with ${result.errors.length} issue(s) in ${filePath}:`));
    for (const err of result.errors) {
      console.error(`  - ${yellow(`[${err.code}]`)} ${err.path}: ${err.message}`);
      if (err.suggestion) console.error(gray(`    → ${err.suggestion}`));
    }
    return EXIT_FAILURE;
  }

  console.log(green(`[PASS] Validation Passed: ${filePath} is valid Jantt JSON (${liveTasks.length} activities)`));
  return 0;
}

// -----------------------------------------------------------------------------
// 2. AUDIT COMMAND (schedule health with selected DCMA checks, CPM and EVM)
// -----------------------------------------------------------------------------
const PV_BASIS_LABELS = {
  baseline: "task baselines",
  current: "current dates (no baselines set)",
  mixed: "baselines where set, current dates elsewhere"
};

const percent = (ratio) => `${Math.round(ratio * 100)}%`;
const money = (value) => `${value < 0 ? "-" : ""}$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;

/** One row per health check, so every point deducted from the score is explained. */
function formatHealthChecks(checks, targetDate) {
  if (checks.length === 0) return "  (no activities to check)";
  const labelWidth = Math.max(...checks.map((c) => c.label.length)) + 2;
  return checks
    .map((c) => {
      const label = c.label.padEnd(labelWidth);
      // Negative float is only meaningful against a deadline; it is still shown when it costs points.
      if (c.id === "negative-float" && !targetDate && c.passed) {
        return `  ${gray("N/A ")}  ${label}${gray("N/A (no target date; pass --target YYYY-MM-DD or set meta.targetDate)")}`;
      }
      const counts = `${c.failed} / ${c.eligible}`.padEnd(12);
      const limit = `max ${percent(c.threshold)}`.padEnd(10);
      const status = c.passed ? green("PASS") : red("FAIL");
      return `  ${status}  ${label}${counts}${limit}${c.passed ? "" : red(`-${c.penalty} pts`)}`.trimEnd();
    })
    .join("\n");
}

function formatEvm(evm) {
  const spiColor = evm.spi >= 1.0 ? green : red;
  const header = `${bold("Earned Value (ANSI/EIA-748):")} ${gray(`status date ${evm.statusDate}; planned value from ${PV_BASIS_LABELS[evm.pvBasis] ?? evm.pvBasis}`)}`;
  if (!evm.costDataAvailable) {
    return `${header}
  - SPI (Schedule Efficiency):    ${spiColor(evm.spi.toFixed(2))} (${evm.scheduleStatus}; duration-weighted)
  - Cost metrics:                 ${gray("No cost data (add estimatedCost to tasks for CPI, EAC, VAC and TCPI)")}
`;
  }
  // CPI, EAC and TCPI only measure tasks that report an actualCost; without any they are placeholders.
  const costMeasured = evm.costCoverage > 0;
  const coverageNote = evm.costCoverage < 1 ? `; based on ${percent(evm.costCoverage)} of budget` : "";
  const cpi = costMeasured
    ? `${(evm.cpi >= 1.0 ? green : red)(evm.cpi.toFixed(2))} (${evm.costStatus}${coverageNote})`
    : gray("Not measured (no task reports an actualCost)");
  const tcpi = !costMeasured
    ? gray("Not measured")
    : Number.isFinite(evm.tcpi)
      ? evm.tcpi.toFixed(2)
      : red("Unachievable within BAC");
  return `${header}
  - BAC (Budget at Completion):   ${money(evm.bac)}
  - AC (Actual Cost):             ${money(evm.ac)}
  - CPI (Cost Efficiency):        ${cpi}
  - SPI (Schedule Efficiency):    ${spiColor(evm.spi.toFixed(2))} (${evm.scheduleStatus})
  - EAC (Estimate at Completion): ${costMeasured ? money(evm.eac) : gray(`${money(evm.eac)} (= BAC until costs are reported)`)}
  - VAC (Variance at Completion): ${costMeasured ? money(evm.vac) : gray("Not measured")}
  - TCPI (To-Complete Index):     ${tcpi}
`;
}

function auditCommand(filePath, flags) {
  const { json, liveTasks } = loadPlan(filePath);

  const metaTarget = typeof json?.meta?.targetDate === "string" && json.meta.targetDate.trim() ? json.meta.targetDate.trim() : undefined;
  const targetDate = flags.target ?? metaTarget;
  if (targetDate !== undefined && !isValidISODate(targetDate)) {
    throw new CliError(
      flags.target !== undefined
        ? `Invalid --target '${targetDate}': expected a YYYY-MM-DD date.`
        : `meta.targetDate '${targetDate}' in ${filePath} is not a valid YYYY-MM-DD date.`,
      flags.target !== undefined ? EXIT_USAGE : EXIT_FAILURE
    );
  }
  const cpm = calculateCriticalPath(liveTasks, { defaultGapDays: gapDaysOf(json), targetDate });
  const calendar = workingCalendarOf(json);
  const health = auditScheduleIntegrity(liveTasks, cpm, { calendar });
  const evm = calculateEVM(liveTasks);

  if (flags.json) {
    const { taskMetrics: _taskMetrics, ...evmSummary } = evm;
    printJson({
      file: filePath,
      activities: liveTasks.length,
      healthScore: health.healthScore,
      grade: health.grade,
      summary: health.summary,
      targetDate: targetDate ?? null,
      workingDays: calendar !== undefined,
      criticalPath: {
        taskIds: Array.from(cpm.criticalTaskIds),
        projectEarlyFinish: cpm.projectEarlyFinish,
        projectLateFinish: cpm.projectLateFinish,
        projectTotalFloatDays: cpm.projectTotalFloat
      },
      metrics: {
        missingLogic: health.missingLogicCount,
        negativeFloat: targetDate ? health.negativeFloatCount : null,
        highFloat: health.highFloatCount
      },
      checks: health.checks,
      issues: health.issues,
      // JSON has no Infinity, so a TCPI that is unachievable within BAC prints as null.
      evm: evm.costDataAvailable ? evmSummary : null
    });
    return 0;
  }

  const gradeColor = health.grade === "A" ? green : health.grade === "B" ? cyan : health.grade === "C" ? yellow : red;
  const finishLine = `Early Finish: ${cpm.projectEarlyFinish || "N/A"}${targetDate ? `, Target: ${targetDate}` : ""}`;

  console.log(`
${bold(cyan("=== Jantt Schedule Health Audit (selected DCMA checks) ==="))}
File: ${yellow(filePath)} (${liveTasks.length} activities${calendar !== undefined ? "; float and duration in working days" : ""})

${bold("Health Score:")}  ${gradeColor(`${health.healthScore}%`)}  ${bold("Grade:")} ${gradeColor(health.grade)}  ${gray(health.summary)}
${bold("Critical Path:")} ${cpm.criticalTaskIds.size} critical tasks (${finishLine})
${bold("Total Float:")}   ${cpm.projectTotalFloat} days

${bold("Checks")} ${gray("(failed / eligible, pass threshold, points deducted):")}
${formatHealthChecks(health.checks, targetDate)}
`);

  if (liveTasks.length > 0) console.log(formatEvm(evm));

  if (health.issues.length > 0) {
    console.log(bold(`Actionable Issues (${health.issues.length}):`));
    health.issues.slice(0, 10).forEach((issue) => {
      console.log(`  ${yellow(`• [${issue.type || "warning"}] ${issue.message}`)}`);
    });
    if (health.issues.length > 10) {
      console.log(`  ... and ${health.issues.length - 10} more`);
    }
  }

  return 0;
}

// -----------------------------------------------------------------------------
// 3. MONTE CARLO COMMAND
// -----------------------------------------------------------------------------
function monteCarloCommand(filePath, flags) {
  const iterations = numberFlag(flags.runs ?? flags.iterations, "runs", { fallback: 2000, min: 100, max: 50000, integer: true });
  const variance = numberFlag(flags.variance ?? flags.uncertainty, "variance", { fallback: 0.25, min: 0, max: 2 });
  const seed = numberFlag(flags.seed, "seed", { fallback: undefined, min: 0, max: 2 ** 31 - 1, integer: true });

  const { json, liveTasks } = loadPlan(filePath);
  if (liveTasks.length === 0) {
    throw new CliError(`No activities to simulate in ${filePath}.`);
  }

  if (!flags.json) {
    console.log(cyan(`Running ${iterations.toLocaleString()} Monte Carlo simulation iterations on ${liveTasks.length} tasks...`));
  }

  const t0 = performance.now();
  const result = runMonteCarloSimulation(liveTasks, {
    iterations,
    seed,
    defaultGapDays: gapDaysOf(json), // overruns propagate through links like the real cascade
    defaultOptimisticVariance: variance * 0.8,
    defaultPessimisticVariance: variance * 1.4
  });
  const elapsed = Math.round(performance.now() - t0);

  // taskCriticality is in plan order; rank it so the report names the real bottlenecks.
  const ranked = [...result.taskCriticality].sort(
    (a, b) => b.criticalityIndex - a.criticalityIndex || b.sensitivityIndex - a.sensitivityIndex
  );

  if (flags.json) {
    printJson({ file: filePath, elapsedMs: elapsed, ...result, taskCriticality: ranked });
    return 0;
  }

  const p = result.percentiles;
  const bufferDays = Math.max(p.P90.durationDays - result.baselineDurationDays, 0);

  console.log(`
${bold(green(`=== Monte Carlo Probabilistic Risk Results (${elapsed}ms) ===`))}
Baseline Duration:    ${bold(`${result.baselineDurationDays} days`)} (Finish: ${result.baselineCompletionDate})
Mean Duration:        ${bold(`${Math.round(result.meanDurationDays)} days`)} (±${result.standardDeviationDays.toFixed(1)}d)

${bold("Confidence Intervals:")}
  P50 (Median):       ${cyan(`${p.P50.durationDays.toFixed(1)} days`)}  ${gray(`(Finish: ${p.P50.completionDate})`)}
  P80 Confidence:     ${green(`${p.P80.durationDays.toFixed(1)} days`)}  ${gray(`(Finish: ${p.P80.completionDate})`)}
  P90 Confidence:     ${yellow(`${p.P90.durationDays.toFixed(1)} days`)}  ${gray(`(Finish: ${p.P90.completionDate})`)}
  P95 Committed:      ${red(`${p.P95.durationDays.toFixed(1)} days`)}  ${gray(`(Finish: ${p.P95.completionDate})`)}

${bold("Contingency Recommendation:")}
  Add ${bold(yellow(`${Math.ceil(bufferDays)} days`))} buffer to achieve 90% delivery confidence.

${bold("Top Critical Bottleneck Activities:")}`);

  ranked.slice(0, 6).forEach((item) => {
    const pct = Math.round(item.criticalityIndex);
    const color = pct >= 80 ? red : pct >= 50 ? yellow : cyan;
    console.log(`  ${color(`${pct.toString().padStart(3)}%`)} [${item.taskId}] ${item.label || item.taskId}`);
  });

  return 0;
}

// -----------------------------------------------------------------------------
// 4. EXPORT COMMAND
// -----------------------------------------------------------------------------
function exportCommand(filePath, flags) {
  const format = (flags.format || "").toLowerCase();
  if (!EXPORT_FORMATS.includes(format)) {
    throw new CliError(`Please specify a valid format: --format <${EXPORT_FORMATS.join("|")}>`, EXIT_USAGE);
  }

  const { resolvedPath, json, liveTasks } = loadPlan(filePath);
  const parsedPath = path.parse(resolvedPath);
  const defaultOut = path.join(parsedPath.dir, `${parsedPath.name}.${format === "html" ? "report.html" : format}`);
  const outPath = flags.out ? path.resolve(process.cwd(), flags.out) : defaultOut;
  const plan = { ...json, tasks: liveTasks };

  let outputContent;
  try {
    if (format === "xml") {
      outputContent = exportMsProjectXml(plan, { projectName: parsedPath.name });
    } else if (format === "xer") {
      outputContent = exportPrimaveraXer(plan, { projectName: parsedPath.name });
    } else if (format === "csv") {
      outputContent = exportSpreadsheetCsv(plan);
    } else if (format === "html") {
      outputContent = exportExecutiveReportHtml(liveTasks, {
        title: json?.meta?.title || parsedPath.name,
        projectCode: json?.meta?.code || "PROJ-1"
      });
    } else {
      outputContent = exportExecutiveReportSvg(liveTasks, { title: json?.meta?.title || parsedPath.name });
    }
  } catch (err) {
    throw new CliError(`Export failed: ${err.message}`);
  }

  writeOutputFile(outPath, outputContent, resolvedPath, flags.force);
  console.log(green(`Successfully exported ${format.toUpperCase()} to: ${outPath}`));
  return 0;
}

// -----------------------------------------------------------------------------
// 5. IMPORT COMMAND
// -----------------------------------------------------------------------------
function importCommand(filePath, flags) {
  const ext = (flags.format || path.extname(filePath).replace(".", "")).toLowerCase();
  const importer = Object.hasOwn(IMPORTERS, ext) ? IMPORTERS[ext] : undefined;
  if (!importer) {
    throw new CliError(
      `Unsupported import format '${ext}'. Must be ${IMPORT_FORMATS.map((f) => `.${f}`).join(", ")} (or pass --format).`,
      EXIT_USAGE
    );
  }
  const { resolvedPath, bytes } = readInputFile(filePath, true);
  const parsedPath = path.parse(resolvedPath);

  let warningCount = 0;
  const onWarning = (message) => {
    warningCount++;
    if (warningCount <= MAX_PRINTED_WARNINGS) console.warn(yellow(`Warning: ${message}`));
  };
  let planData;
  try {
    planData = importer(bytes, { onWarning });
  } catch (err) {
    throw new CliError(`Import failed: ${err.message}`);
  }
  if (warningCount > MAX_PRINTED_WARNINGS) {
    console.warn(yellow(`... and ${warningCount - MAX_PRINTED_WARNINGS} more warning(s).`));
  }

  const outPath = flags.out ? path.resolve(process.cwd(), flags.out) : path.join(parsedPath.dir, `${parsedPath.name}.json`);
  writeOutputFile(outPath, `${JSON.stringify(planData, null, 2)}\n`, resolvedPath, flags.force);

  const note = warningCount > 0 ? yellow(` (${warningCount} warning(s); review the imported plan)`) : "";
  console.log(`${green(`Successfully imported ${planData.tasks?.length || 0} activities from ${filePath} → ${outPath}`)}${note}`);
  return 0;
}

// -----------------------------------------------------------------------------
// 6. OPEN COMMAND (local viewer: browser edits save to disk, disk edits reload in the page)
// -----------------------------------------------------------------------------
const MAX_SAVE_BYTES = 32 * 1024 * 1024;
const ASSET_JS_URL = "/assets/jantt.standalone.js";
const ASSET_CSS_URL = "/assets/jantt.standalone.css";

function openCommand(filePath, flags) {
  const { resolvedPath, text } = readInputFile(filePath);
  try {
    JSON.parse(text);
  } catch (err) {
    throw new CliError(`Invalid JSON in ${filePath}: ${err.message}`);
  }

  const port = numberFlag(flags.port ?? (process.env.PORT || undefined), "port", { fallback: 3456, min: 0, max: 65535, integer: true });
  const host = flags.host || "127.0.0.1";
  const planPath = fs.realpathSync(resolvedPath); // write through symlinks instead of replacing them
  const fileName = path.basename(resolvedPath);
  const assets = loadViewerAssets();
  if (!assets.css) {
    console.warn(yellow("Warning: the viewer stylesheet was not found; the chart will render unstyled."));
  }

  const token = crypto.randomBytes(24).toString("hex");
  const tokenBuffer = Buffer.from(token);
  const eventClients = new Set();
  let lastSeenVersion = contentVersion(text);
  let allowedHosts = new Set();
  let allowedOrigins = new Set();

  const tokenMatches = (candidate) => {
    const buf = Buffer.from(String(candidate || ""));
    return buf.length === tokenBuffer.length && crypto.timingSafeEqual(buf, tokenBuffer);
  };

  function servePage(res) {
    let pageText;
    let plan;
    try {
      pageText = readUtf8(planPath);
      plan = JSON.parse(pageText);
    } catch (err) {
      sendHtml(res, 500, errorPage(`${fileName} cannot be loaded right now: ${err.message}. Fix the file and reload this page.`));
      return;
    }
    const nonce = crypto.randomBytes(16).toString("base64");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    );
    sendHtml(
      res,
      200,
      renderViewerPage({ fileName, nonce, hasCss: Boolean(assets.css), boot: { token, version: contentVersion(pageText), plan } })
    );
  }

  function openEventStream(req, res, url) {
    if (!tokenMatches(url.searchParams.get("token"))) {
      sendJson(res, 403, { error: "Invalid or missing session token." });
      return;
    }
    let version = lastSeenVersion;
    try {
      version = contentVersion(readUtf8(planPath));
    } catch {
      // Keep the last known version while the file is briefly missing (e.g. an editor's atomic save).
    }
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" });
    res.write(`retry: 2000\ndata: ${JSON.stringify({ version })}\n\n`);
    eventClients.add(res);
    res.on("close", () => eventClients.delete(res));
  }

  function handleSave(req, res) {
    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      sendJson(res, 415, { error: "Content-Type must be application/json." });
      return;
    }
    if (!tokenMatches(req.headers["x-jantt-token"])) {
      sendJson(res, 403, { error: "Invalid or missing session token." });
      return;
    }
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin.toLowerCase())) {
      sendJson(res, 403, { error: "Cross-origin requests are not allowed." });
      return;
    }
    if (Number(req.headers["content-length"]) > MAX_SAVE_BYTES) {
      sendJson(res, 413, { error: "Plan is too large to save." }, { Connection: "close" });
      return;
    }

    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_SAVE_BYTES) {
        rejected = true;
        sendJson(res, 413, { error: "Plan is too large to save." }, { Connection: "close" });
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => {
      rejected = true;
    });
    req.on("end", () => {
      if (rejected) return;

      let plan;
      try {
        // Decode once after all chunks arrive so multi-byte characters split across chunks survive.
        plan = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (err) {
        sendJson(res, 400, { error: `Invalid JSON body: ${err.message}` });
        return;
      }
      if (!plan || typeof plan !== "object" || Array.isArray(plan) || !Array.isArray(plan.tasks)) {
        sendJson(res, 422, { error: "A plan must be a JSON object with a 'tasks' array." });
        return;
      }
      if (plan.tasks.some((t) => !t || typeof t !== "object" || Array.isArray(t))) {
        sendJson(res, 422, { error: "Every entry in 'tasks' must be an object." });
        return;
      }

      // Optimistic concurrency: refuse to clobber changes made on disk since the page loaded them.
      let diskText = "";
      try {
        diskText = readUtf8(planPath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          sendJson(res, 500, { error: `Cannot read ${fileName}: ${err.message}` });
          return;
        }
      }
      const diskVersion = contentVersion(diskText);
      if (req.headers["x-jantt-base"] !== diskVersion) {
        sendJson(res, 409, { error: `${fileName} changed on disk since this page loaded it.`, version: diskVersion });
        return;
      }

      // A valid file is never replaced by an invalid plan. A file that is already invalid on disk still
      // saves (with its issue count), so it can be repaired in the viewer.
      const { errors } = validate(plan);
      if (errors.length > 0 && isValidPlanText(diskText)) {
        const first = errors[0];
        const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : "";
        const reason = `[${first.code}] ${first.path}: ${first.message}${more}`;
        console.warn(yellow(`[Jantt] Did not save ${filePath}: the edit would make it invalid. ${reason}`));
        sendJson(res, 422, { error: `${fileName} would become invalid: ${reason}`, errors: errors.slice(0, 20) });
        return;
      }

      const formatted = `${JSON.stringify(plan, null, 2)}\n`;
      try {
        writeFileAtomic(planPath, formatted);
      } catch (err) {
        sendJson(res, 500, { error: `Could not write ${fileName}: ${err.message}` });
        return;
      }
      const version = contentVersion(formatted);
      lastSeenVersion = version; // the file watcher must not echo our own write back to the page

      const issues = errors.length;
      const liveCount = plan.tasks.filter((t) => !t._deleted).length;
      const note = issues > 0 ? yellow(` - ${issues} validation issue(s); run 'jantt validate ${filePath}'`) : "";
      console.log(`${green(`[Jantt] Saved changes to ${filePath} (${liveCount} tasks)`)}${note}`);
      sendJson(res, 200, { ok: true, version, issues });
    });
  }

  const server = http.createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");

    // DNS-rebinding guard: only answer requests addressed to this server by a name we bound.
    if (!allowedHosts.has(String(req.headers.host || "").toLowerCase())) {
      sendJson(res, 403, { error: "Unexpected Host header." });
      return;
    }

    try {
      const url = new URL(req.url || "/", "http://localhost");
      const route = `${req.method} ${url.pathname}`;
      if (route === "GET /") servePage(res);
      else if (route === `GET ${ASSET_JS_URL}`) sendBody(res, 200, "text/javascript; charset=utf-8", assets.js);
      else if (route === `GET ${ASSET_CSS_URL}` && assets.css) sendBody(res, 200, "text/css; charset=utf-8", assets.css);
      else if (route === "GET /api/events") openEventStream(req, res, url);
      else if (route === "POST /api/save") handleSave(req, res);
      else if (url.pathname === "/api/save") sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
      else sendJson(res, 404, { error: "Not found." });
    } catch (err) {
      if (!res.headersSent) sendJson(res, 500, { error: err.message });
    }
  });

  server.on("error", (err) => {
    const reason =
      err.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Pass --port <n> (or --port 0 for any free port).`
        : err.code === "EACCES"
          ? `Permission denied while binding ${host}:${port}. Try a port above 1024.`
          : err.code === "EADDRNOTAVAIL" || err.code === "ENOTFOUND"
            ? `Address '${host}' is not available on this machine.`
            : err.message;
    console.error(red(`Error: ${reason}`));
    fs.unwatchFile(planPath);
    process.exitCode = EXIT_FAILURE;
  });

  server.listen(port, host, () => {
    const actualPort = server.address().port;
    allowedHosts = buildAllowedHosts(host, actualPort);
    allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));
    const browseHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host;
    const url = `http://${browseHost}:${actualPort}`;

    console.log(`
${bold(cyan("┌────────────────────────────────────────────────────────┐"))}
${bold(cyan("│"))}  ${bold("Jantt Server Running")}
${bold(cyan("│"))}  File:   ${yellow(filePath)}
${bold(cyan("│"))}  URL:    ${green(url)}
${bold(cyan("│"))}  Sync:   browser edits save to disk; disk edits reload in the page
${bold(cyan("│"))}  Stop:   Ctrl+C
${bold(cyan("└────────────────────────────────────────────────────────┘"))}
`);
    if (!isLoopbackHost(host)) {
      console.warn(
        yellow(`Warning: listening on ${host}. Anyone on your network who can reach this address can view and edit ${fileName}.`)
      );
    }

    // Push external edits (editor saves, git checkouts) to open pages.
    fs.watchFile(planPath, { interval: 500 }, (curr) => {
      if (curr.mtimeMs === 0) return; // deleted (or mid atomic-save); wait for it to reappear
      let diskText;
      try {
        diskText = readUtf8(planPath);
      } catch {
        return;
      }
      const version = contentVersion(diskText);
      if (version === lastSeenVersion) return;
      lastSeenVersion = version;
      let plan;
      try {
        plan = JSON.parse(diskText);
      } catch (err) {
        console.warn(yellow(`[Jantt] ${filePath} changed on disk but is not valid JSON yet: ${err.message}`));
        return;
      }
      console.log(cyan(`[Jantt] Reloaded external changes to ${filePath}`));
      const frame = `data: ${JSON.stringify({ version, plan })}\n\n`;
      for (const client of eventClients) client.write(frame);
    });

    if (!flags["no-open"]) openBrowser(url);
  });

  return undefined; // keep running until interrupted
}

function loadViewerAssets() {
  const roots = [];
  try {
    roots.push(path.dirname(require.resolve("@jantt/standalone/package.json")));
  } catch {
    // Not installed as a dependency: fall back to the monorepo checkout below.
  }
  roots.push(path.resolve(__dirname, "../../packages/standalone"));

  for (const root of roots) {
    const jsPath = path.join(root, "dist", "jantt.standalone.iife.js");
    if (!fs.existsSync(jsPath)) continue;
    // dist/style.css is the published name (package.json "style"); Vite 8 builds without cssFileName emit standalone.css.
    const cssPath = ["style.css", "standalone.css"].map((name) => path.join(root, "dist", name)).find((p) => fs.existsSync(p));
    return { js: fs.readFileSync(jsPath), css: cssPath ? fs.readFileSync(cssPath) : null };
  }
  throw new CliError(
    "The Jantt viewer bundle (@jantt/standalone) was not found. Reinstall @jantt/cli, or run 'npm run build --workspace=@jantt/standalone' in the monorepo."
  );
}

function contentVersion(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function isValidPlanText(text) {
  try {
    return validate(JSON.parse(text)).valid;
  } catch {
    return false;
  }
}

function writeFileAtomic(target, content) {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: "utf8", flag: "wx" });
  try {
    try {
      fs.chmodSync(tmp, fs.statSync(target).mode);
    } catch {
      // Target missing or permissions unsupported: keep the default mode.
    }
    fs.renameSync(tmp, target);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    // Windows refuses to replace a file that another process holds open (editors, antivirus): write in place.
    if (err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY") {
      fs.writeFileSync(target, content, "utf8");
      return;
    }
    throw err;
  }
}

function isLoopbackHost(host) {
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

function buildAllowedHosts(host, port) {
  const names = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (host === "0.0.0.0" || host === "::") {
    // LAN visitors may browse by this machine's name as well as by any of its addresses.
    const hostname = os.hostname().toLowerCase();
    if (hostname) names.add(hostname).add(`${hostname}.local`);
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const a of addresses || []) names.add(a.family === "IPv6" || a.family === 6 ? `[${a.address}]` : a.address);
    }
  } else if (!isLoopbackHost(host)) {
    names.add(host.includes(":") ? `[${host.toLowerCase()}]` : host.toLowerCase());
  }
  const hosts = new Set();
  for (const name of names) {
    hosts.add(`${name}:${port}`);
    if (port === 80) hosts.add(name);
  }
  return hosts;
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => console.log(gray(`Open ${url} in your browser.`)));
    child.unref();
  } catch {
    console.log(gray(`Open ${url} in your browser.`));
  }
}

function sendBody(res, status, contentType, body, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": contentType, ...extraHeaders });
  res.end(body);
}

function sendJson(res, status, payload, extraHeaders) {
  sendBody(res, status, "application/json; charset=utf-8", JSON.stringify(payload), extraHeaders);
}

function sendHtml(res, status, html) {
  sendBody(res, status, "text/html; charset=utf-8", html);
}

// JSON that is safe inside a <script type="application/json"> element: with every "<" escaped,
// no string in the plan can close the element or open an HTML comment.
function toScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function errorPage(message) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>Jantt - error</title></head>
<body style="font-family: system-ui, sans-serif; padding: 24px; background: #060911; color: #F1F5F9;">
<h1 style="font-size: 18px;">Jantt could not load the plan</h1><p>${escapeHtml(message)}</p></body></html>`;
}

// Browser-side controller: serialized saves with conflict detection, plus live reload of disk edits.
const VIEWER_BOOT_JS = `
(function () {
  "use strict";
  var boot = JSON.parse(document.getElementById("jantt-boot").textContent);
  var statusEl = document.getElementById("save-status");
  var indicatorEl = document.getElementById("save-indicator");
  var conflictEl = document.getElementById("conflict-actions");
  var mountEl = document.getElementById("chart-mount");
  var TONES = { ok: "#10B981", busy: "#F59E0B", error: "#EF4444" };
  var version = boot.version;
  var pending = null;
  var saving = false;
  var conflictVersion = null;
  var chart = null;

  function setStatus(text, tone) {
    statusEl.textContent = text;
    indicatorEl.style.background = TONES[tone];
  }

  function showConflict(diskVersion) {
    conflictVersion = diskVersion;
    conflictEl.hidden = false;
    setStatus("The file changed on disk. Load the disk version, or keep your changes?", "error");
  }

  function queueSave(plan) {
    pending = plan;
    if (!saving && conflictVersion === null) flush();
  }

  async function flush() {
    saving = true;
    var lastIssues = 0;
    while (pending && conflictVersion === null) {
      var plan = pending;
      pending = null;
      setStatus("Saving...", "busy");
      try {
        var res = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Jantt-Token": boot.token, "X-Jantt-Base": version },
          body: JSON.stringify(plan)
        });
        var body = await res.json().catch(function () { return {}; });
        if (res.ok) {
          version = body.version;
          lastIssues = body.issues || 0;
          continue;
        }
        pending = pending || plan;
        if (res.status === 409) showConflict(body.version);
        else if (res.status === 403) setStatus("Session expired (was the jantt CLI restarted?). Reload this page.", "error");
        else setStatus("Save failed: " + (body.error || "HTTP " + res.status) + " Your next edit will retry.", "error");
      } catch (err) {
        pending = pending || plan;
        setStatus("Save failed: the jantt CLI is not reachable. Your next edit will retry.", "error");
      }
      saving = false;
      return;
    }
    saving = false;
    if (conflictVersion === null) {
      setStatus(lastIssues ? "Saved to disk (" + lastIssues + " validation issue(s))" : "Saved to disk", lastIssues ? "busy" : "ok");
    }
  }

  document.getElementById("reload-btn").addEventListener("click", function () {
    pending = null;
    location.reload();
  });
  document.getElementById("overwrite-btn").addEventListener("click", function () {
    version = conflictVersion;
    conflictVersion = null;
    conflictEl.hidden = true;
    if (!pending && chart) pending = chart.getData();
    if (!saving) flush();
  });

  window.addEventListener("beforeunload", function (event) {
    if (saving || pending) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  var api = window.Jantt && (window.Jantt.default || window.Jantt);
  if (!api || typeof api.mount !== "function") {
    setStatus("Viewer failed to load", "error");
    mountEl.textContent = "The Jantt engine bundle did not load. Reinstall @jantt/cli or rebuild @jantt/standalone, then restart 'jantt open'.";
    return;
  }
  try {
    chart = api.mount(mountEl, boot.plan, { onCommit: queueSave });
  } catch (err) {
    setStatus("Viewer failed to render", "error");
    mountEl.textContent = "Could not render this plan: " + (err && err.message ? err.message : err);
    return;
  }

  var events = new EventSource("/api/events?token=" + encodeURIComponent(boot.token));
  events.onmessage = function (event) {
    var msg = JSON.parse(event.data);
    if (msg.version === version) return;
    if (saving || pending || conflictVersion !== null) {
      showConflict(msg.version);
      return;
    }
    if (!msg.plan) {
      location.reload(); // reconnected after missing a change on disk
      return;
    }
    version = msg.version;
    chart.update(msg.plan);
    setStatus("Reloaded changes from disk", "ok");
  };
  events.onerror = function () {
    if (saving || pending || conflictVersion !== null) return;
    if (events.readyState === EventSource.CLOSED) setStatus("Disconnected from the jantt CLI. Reload this page to reconnect.", "error");
    else setStatus("Reconnecting to the jantt CLI...", "busy");
  };
  events.onopen = function () {
    if (!saving && !pending && conflictVersion === null) setStatus("Synced with disk", "ok");
  };
})();
`;

function renderViewerPage({ fileName, nonce, hasCss, boot }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Jantt - ${escapeHtml(fileName)}</title>
  ${hasCss ? `<link rel="stylesheet" href="${ASSET_CSS_URL}" />` : ""}
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px 24px;
      background: #060911;
      color: #F1F5F9;
      font-family: var(--jantt-font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      background: #141D2F;
      border: 1px solid #24324B;
      border-radius: 12px;
      padding: 12px 20px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 18px;
    }
    .brand-tag {
      font-size: 11px;
      font-family: monospace;
      background: rgba(56, 189, 248, 0.15);
      color: #38BDF8;
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .status-badge {
      font-size: 12px;
      color: #94A3B8;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .save-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10B981;
      transition: background 0.2s ease;
    }
    .conflict-actions { display: inline-flex; gap: 6px; }
    .conflict-actions[hidden] { display: none; }
    .conflict-actions button {
      font: inherit;
      color: #F1F5F9;
      background: #24324B;
      border: 1px solid #38507A;
      border-radius: 6px;
      padding: 3px 10px;
      cursor: pointer;
    }
    .conflict-actions button:hover { background: #2E4166; }
    #chart-mount {
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="brand">
      <span>Jantt</span>
      <span class="brand-tag">${escapeHtml(fileName)}</span>
    </div>
    <div class="status-badge" role="status" aria-live="polite">
      <span class="save-indicator" id="save-indicator"></span>
      <span id="save-status">Synced with disk</span>
      <span class="conflict-actions" id="conflict-actions" hidden>
        <button type="button" id="reload-btn">Load disk version</button>
        <button type="button" id="overwrite-btn">Keep my changes</button>
      </span>
    </div>
  </div>

  <div id="chart-mount"></div>

  <script type="application/json" id="jantt-boot">${toScriptJson(boot)}</script>
  <script src="${ASSET_JS_URL}"></script>
  <script nonce="${nonce}">${VIEWER_BOOT_JS}</script>
</body>
</html>`;
}

function printHelp() {
  console.log(`
${bold(cyan("Jantt"))} - The Ultimate JSON Gantt & Project Timeline Engine (v${VERSION})

${bold("Usage:")}
  jantt open <file.json>                 Open the interactive viewer; edits save back to the file
  jantt validate <file.json>             Verify JSON schema, date validity & dependency integrity
  jantt audit <file.json>                Run a schedule health audit (selected DCMA checks) with CPM and EVM
  jantt monte-carlo <file.json>          Run a probabilistic Monte Carlo schedule risk simulation
  jantt export <file.json> --format <f>  Export to MS Project XML, Primavera P6 XER, CSV, HTML report, or SVG
  jantt import <file> [--out <json>]     Import MS Project XML, Primavera P6 XER, CSV, or TSV into Jantt JSON
  jantt --version                        Show version
  jantt --help                           Show this help menu

${bold("Options:")}
  open          --port <n> (default 3456; 0 picks a free port), --host <addr> (default 127.0.0.1), --no-open
  validate      --json
  audit         --target <YYYY-MM-DD> (enables negative-float checks; defaults to meta.targetDate), --json
  monte-carlo   --runs <100-50000> (default 2000), --variance <0-2> (default 0.25), --seed <n>, --json
  export        --format <xml|xer|csv|html|svg>, --out <path>, --force (overwrite an existing file)
  import        --format <${IMPORT_FORMATS.join("|")}> (default: the file extension), --out <path>, --force
  any command   --no-color (also honors NO_COLOR)

${bold("Export Formats (--format):")}
  xml                                    Microsoft Project (2013-2021) XML format
  xer                                    Oracle Primavera P6 .xer batch file
  csv                                    RFC 4180 spreadsheet with dependencies
  html                                   Printable executive report (print to PDF from your browser)
  svg                                    Standalone high-resolution vector SVG chart

${bold("Exit codes:")} 0 success, 1 failure (invalid plan, I/O error), 2 usage error

${bold("Examples:")}
  jantt open ./project.json --port 3000
  jantt audit ./project.json --target 2026-12-31
  jantt monte-carlo ./project.json --runs 5000
  jantt export ./project.json --format xml --out ./project.xml
  jantt export ./project.json --format html --out ./executive-report.html
  jantt import ./schedule.xer --out ./project.json

  Without a global install, run: npx @jantt/cli <command> [options]
`);
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------
try {
  const exitCode = main(rawArgs);
  if (exitCode !== undefined) process.exitCode = exitCode;
} catch (err) {
  if (err instanceof CliError) {
    const [first, ...rest] = err.message.split("\n");
    console.error(red(`Error: ${first}`));
    for (const line of rest) console.error(line);
    process.exitCode = err.exitCode;
  } else {
    console.error(red(`Unexpected error: ${err && err.stack ? err.stack : err}`));
    process.exitCode = EXIT_FAILURE;
  }
}
