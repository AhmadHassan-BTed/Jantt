#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  validate,
  calculateCriticalPath,
  auditScheduleIntegrity,
  calculateEVM,
  runMonteCarloSimulation
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to parse flags and arguments
function parseArgs(rawArgs) {
  const flags = {};
  const positionals = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        flags[key] = val;
      } else {
        const key = arg.slice(2);
        const next = rawArgs[i + 1];
        if (next && !next.startsWith("-")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const next = rawArgs[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { command: positionals[0], positionals: positionals.slice(1), flags };
}

const { command, positionals, flags } = parseArgs(process.argv.slice(2));

if (command === "--version" || command === "-v" || flags.version || flags.v) {
  console.log("jantt v1.1.0");
  process.exit(0);
}

if (!command || command === "--help" || command === "-h" || flags.help || flags.h) {
  printHelp();
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 1. VALIDATE COMMAND
// -----------------------------------------------------------------------------
if (command === "validate") {
  const filePath = positionals[0];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify a JSON file to validate.\x1b[0m");
    console.error("Usage: jantt validate <file.json>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\x1b[31mError: File not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const json = JSON.parse(content);
    const result = validate(json);

    if (!result.valid) {
      console.error(`\x1b[31mValidation Failed with ${result.errors.length} issue(s):\x1b[0m`);
      result.errors.forEach((err) => console.error(`  - \x1b[33m${err}\x1b[0m`));
      process.exit(1);
    } else {
      console.log(`\x1b[32m[PASS] Validation Passed: ${filePath} is valid Jantt JSON (${json.tasks?.length || 0} activities)\x1b[0m`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`\x1b[31mJSON Parse Error in ${filePath}: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 2. AUDIT COMMAND (DCMA-14 + CPM Analysis)
// -----------------------------------------------------------------------------
if (command === "audit") {
  const filePath = positionals[0];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify a JSON file to audit.\x1b[0m");
    console.error("Usage: jantt audit <file.json>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\x1b[31mError: File not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const json = JSON.parse(content);
    const tasks = json.tasks || [];

    const cpm = calculateCriticalPath(tasks);
    const health = auditScheduleIntegrity(tasks, cpm);
    const evm = calculateEVM(tasks);

    const gradeColor =
      health.grade === "A"
        ? "\x1b[32m"
        : health.grade === "B"
        ? "\x1b[36m"
        : health.grade === "C"
        ? "\x1b[33m"
        : "\x1b[31m";

    console.log(`
\x1b[1m\x1b[36m=== Jantt Schedule Health & DCMA-14 Integrity Audit ===\x1b[0m
File: \x1b[33m${filePath}\x1b[0m (${tasks.length} activities)

\x1b[1mHealth Score:\x1b[0m  ${gradeColor}${health.healthScore}%\x1b[0m  \x1b[1mGrade:\x1b[0m ${gradeColor}${health.grade}\x1b[0m
\x1b[1mCritical Path:\x1b[0m ${cpm.criticalTaskIds.size} critical tasks (Target Finish: ${cpm.projectLateFinish || cpm.projectEarlyFinish || "N/A"})
\x1b[1mTotal Float:\x1b[0m   ${cpm.projectTotalFloat} days

\x1b[1mDiagnostic Findings:\x1b[0m
  - Missing Logic (Open Ends): ${health.missingLogicCount === 0 ? "\x1b[32m0 (Clean)\x1b[0m" : `\x1b[31m${health.missingLogicCount}\x1b[0m`}
  - Negative Float:           ${health.negativeFloatCount === 0 ? "\x1b[32m0 (No slips)\x1b[0m" : `\x1b[31m${health.negativeFloatCount}\x1b[0m`}
  - High Float (>44d):         ${health.highFloatCount}
  - Issues Reported:           ${health.issues.length}
`);

    if (evm.bac > 0) {
      const cpiColor = evm.cpi >= 1.0 ? "\x1b[32m" : "\x1b[31m";
      const spiColor = evm.spi >= 1.0 ? "\x1b[32m" : "\x1b[31m";
      console.log(`\x1b[1mEVM Financial Metrics (ANSI/EIA-748):\x1b[0m
  - BAC (Baseline Budget):    $${Math.round(evm.bac).toLocaleString()}
  - Actual Cost (AC):         $${Math.round(evm.ac).toLocaleString()}
  - CPI (Cost Efficiency):    ${cpiColor}${evm.cpi.toFixed(2)}\x1b[0m (${evm.costStatus})
  - SPI (Schedule Efficiency):${spiColor}${evm.spi.toFixed(2)}\x1b[0m (${evm.scheduleStatus})
  - EAC (Projected Finish):   $${Math.round(evm.eac).toLocaleString()}
`);
    }

    if (health.issues.length > 0) {
      console.log(`\x1b[1mActionable Issues:\x1b[0m`);
      health.issues.slice(0, 10).forEach((issue) => {
        console.log(`  \x1b[33m• [${issue.type || "warning"}] ${issue.message}\x1b[0m`);
      });
      if (health.issues.length > 10) {
        console.log(`  ... and ${health.issues.length - 10} more`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(`\x1b[31mAudit Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 3. MONTE CARLO COMMAND
// -----------------------------------------------------------------------------
if (command === "monte-carlo" || command === "montecarlo" || command === "mc") {
  const filePath = positionals[0];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify a JSON file for Monte Carlo simulation.\x1b[0m");
    console.error("Usage: jantt monte-carlo <file.json> [--runs 2000]");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\x1b[31mError: File not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const json = JSON.parse(content);
    const tasks = (json.tasks || []).filter((t) => !t._deleted);

    const iterations = parseInt(flags.runs || flags.iterations || "2000", 10);
    const variance = parseFloat(flags.variance || flags.uncertainty || "0.25");

    console.log(`\x1b[36mRunning ${iterations.toLocaleString()} Monte Carlo simulation iterations on ${tasks.length} tasks...\x1b[0m`);

    const t0 = performance.now();
    const result = runMonteCarloSimulation(tasks, {
      iterations,
      defaultOptimisticVariance: variance * 0.8,
      defaultPessimisticVariance: variance * 1.4
    });
    const elapsed = Math.round(performance.now() - t0);

    const bufferDays = Math.max(result.percentiles.P90.durationDays - result.baselineDurationDays, 0);

    console.log(`
\x1b[1m\x1b[32m=== Monte Carlo Probabilistic Risk Results (${elapsed}ms) ===\x1b[0m
Baseline Duration:    \x1b[1m${result.baselineDurationDays} days\x1b[0m (Finish: ${result.baselineCompletionDate})
Mean Duration:        \x1b[1m${Math.round(result.meanDurationDays)} days\x1b[0m (&plusmn;${result.standardDeviationDays.toFixed(1)}d)

\x1b[1mConfidence Intervals:\x1b[0m
  P50 (Median):       \x1b[36m${result.percentiles.P50.durationDays.toFixed(1)} days\x1b[0m  \x1b[90m(Finish: ${result.percentiles.P50.completionDate})\x1b[0m
  P80 Confidence:     \x1b[32m${result.percentiles.P80.durationDays.toFixed(1)} days\x1b[0m  \x1b[90m(Finish: ${result.percentiles.P80.completionDate})\x1b[0m
  P90 Confidence:     \x1b[33m${result.percentiles.P90.durationDays.toFixed(1)} days\x1b[0m  \x1b[90m(Finish: ${result.percentiles.P90.completionDate})\x1b[0m
  P95 Committed:      \x1b[31m${result.percentiles.P95.durationDays.toFixed(1)} days\x1b[0m  \x1b[90m(Finish: ${result.percentiles.P95.completionDate})\x1b[0m

\x1b[1mContingency Recommendation:\x1b[0m
  Add \x1b[1m\x1b[33m${Math.ceil(bufferDays)} days\x1b[0m buffer to achieve 90% delivery confidence.

\x1b[1mTop Critical Bottleneck Activities:\x1b[0m`);

    result.taskCriticality.slice(0, 6).forEach((item) => {
      const pct = Math.round(item.criticalityIndex);
      const color = pct >= 80 ? "\x1b[31m" : pct >= 50 ? "\x1b[33m" : "\x1b[36m";
      console.log(`  ${color}${pct.toString().padStart(3)}%\x1b[0m [${item.taskId}] ${item.label || item.taskId}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(`\x1b[31mSimulation Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 4. EXPORT COMMAND
// -----------------------------------------------------------------------------
if (command === "export") {
  const filePath = positionals[0];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify a JSON file to export.\x1b[0m");
    console.error("Usage: jantt export <file.json> --format <xml|xer|csv|html|svg> [--out <output>]");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\x1b[31mError: File not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  const format = (flags.format || flags.f || "").toLowerCase();
  if (!format || !["xml", "xer", "csv", "html", "svg"].includes(format)) {
    console.error("\x1b[31mError: Please specify a valid format: --format <xml|xer|csv|html|svg>\x1b[0m");
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const json = JSON.parse(content);
    const parsedPath = path.parse(resolvedPath);

    let outputContent = "";
    let ext = format;
    if (format === "html") ext = "report.html";

    const defaultOut = path.join(parsedPath.dir, `${parsedPath.name}.${ext}`);
    const outPath = flags.out || flags.o ? path.resolve(process.cwd(), flags.out || flags.o) : defaultOut;

    if (format === "xml") {
      outputContent = exportMsProjectXml(json, { projectName: parsedPath.name });
    } else if (format === "xer") {
      outputContent = exportPrimaveraXer(json, { projectName: parsedPath.name });
    } else if (format === "csv") {
      outputContent = exportSpreadsheetCsv(json);
    } else if (format === "html") {
      outputContent = exportExecutiveReportHtml(json.tasks || [], {
        title: json.meta?.title || parsedPath.name,
        projectCode: json.meta?.code || "PROJ-1"
      });
    } else if (format === "svg") {
      outputContent = exportExecutiveReportSvg(json.tasks || [], {
        title: json.meta?.title || parsedPath.name
      });
    }

    fs.writeFileSync(outPath, outputContent, "utf-8");
    console.log(`\x1b[32mSuccessfully exported ${format.toUpperCase()} to: ${outPath}\x1b[0m`);
    process.exit(0);
  } catch (err) {
    console.error(`\x1b[31mExport Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 5. IMPORT COMMAND
// -----------------------------------------------------------------------------
if (command === "import") {
  const filePath = positionals[0];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify an enterprise file to import (.xml, .xer, .csv).\x1b[0m");
    console.error("Usage: jantt import <file.xml|file.xer|file.csv> [--out <output.json>]");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\x1b[31mError: File not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  const parsedPath = path.parse(resolvedPath);
  const ext = (flags.format || parsedPath.ext.replace(".", "")).toLowerCase();

  try {
    const rawContent = fs.readFileSync(resolvedPath, "utf-8");
    let planData = null;

    if (ext === "xml") {
      planData = importMsProjectXml(rawContent);
    } else if (ext === "xer") {
      planData = importPrimaveraXer(rawContent);
    } else if (ext === "csv") {
      planData = importSpreadsheetCsv(rawContent);
    } else {
      console.error(`\x1b[31mUnsupported import format '${ext}'. Must be .xml, .xer, or .csv\x1b[0m`);
      process.exit(1);
    }

    const defaultOut = path.join(parsedPath.dir, `${parsedPath.name}.json`);
    const outPath = flags.out || flags.o ? path.resolve(process.cwd(), flags.out || flags.o) : defaultOut;

    const formatted = JSON.stringify(planData, null, 2);
    fs.writeFileSync(outPath, formatted, "utf-8");

    console.log(`\x1b[32mSuccessfully imported ${planData.tasks?.length || 0} activities from ${filePath} &rarr; ${outPath}\x1b[0m`);
    process.exit(0);
  } catch (err) {
    console.error(`\x1b[31mImport Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 6. OPEN COMMAND (Interactive Web Viewer with 2-Way Live Sync)
// -----------------------------------------------------------------------------
if (command === "open") {
  const filePath = positionals[0];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify a JSON file to open.\x1b[0m");
    process.exit(1);
  }
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\x1b[31mError: File not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }

  let rawContent = fs.readFileSync(resolvedPath, "utf-8");
  let planData;
  try {
    planData = JSON.parse(rawContent);
  } catch (e) {
    console.error(`\x1b[31mError parsing JSON in ${resolvedPath}: ${e.message}\x1b[0m`);
    process.exit(1);
  }

  const PORT = flags.port ? parseInt(flags.port, 10) : process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;

  // Paths to standalone library bundle
  const standaloneJsPath = path.resolve(__dirname, "../../packages/standalone/dist/jantt.standalone.iife.js");
  const standaloneCssPath = path.resolve(__dirname, "../../packages/standalone/dist/style.css");

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/api/data" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(rawContent);
      return;
    }

    if (req.url === "/api/save" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const formatted = JSON.stringify(parsed, null, 2);
          fs.writeFileSync(resolvedPath, formatted, "utf-8");
          rawContent = formatted;
          console.log(`\x1b[32m[Jantt] Saved changes to ${filePath} (${parsed.tasks?.length || 0} tasks)\x1b[0m`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.url === "/assets/jantt.standalone.iife.js") {
      if (fs.existsSync(standaloneJsPath)) {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(fs.readFileSync(standaloneJsPath));
        return;
      }
    }

    if (req.url === "/assets/style.css") {
      if (fs.existsSync(standaloneCssPath)) {
        res.writeHead(200, { "Content-Type": "text/css" });
        res.end(fs.readFileSync(standaloneCssPath));
        return;
      }
    }

    if (req.url === "/" || req.url?.startsWith("/?")) {
      const html = generateStandaloneHtml(planData, filePath, standaloneJsPath, standaloneCssPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`
\x1b[1m\x1b[36m┌────────────────────────────────────────────────────────┐\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  \x1b[1mJantt Server Running\x1b[0m                                 \x1b[1m\x1b[36m│\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  File:   \x1b[33m${filePath}\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  URL:    \x1b[32m${url}\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  Saving: Two-way live sync back to disk                \x1b[1m\x1b[36m│\x1b[0m
\x1b[1m\x1b[36m└────────────────────────────────────────────────────────┘\x1b[0m
`);

    const startCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${startCmd} ${url}`, () => {});
  });
}

function generateStandaloneHtml(initialData, filePath, standaloneJsPath, standaloneCssPath) {
  const jsonStr = JSON.stringify(initialData);
  const inlinedCss = fs.existsSync(standaloneCssPath) ? fs.readFileSync(standaloneCssPath, "utf-8") : "";
  const inlinedJs = fs.existsSync(standaloneJsPath) ? fs.readFileSync(standaloneJsPath, "utf-8") : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Jantt — ${escapeHtml(path.basename(filePath))}</title>
  <style>
    ${inlinedCss}
  </style>
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
      gap: 6px;
    }
    .save-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10B981;
      transition: background 0.2s ease;
    }
    #chart-mount {
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="brand">
      <span>Jantt</span>
      <span class="brand-tag">${escapeHtml(path.basename(filePath))}</span>
    </div>
    <div class="status-badge">
      <span class="save-indicator" id="save-indicator"></span>
      <span id="save-status">Live sync active</span>
    </div>
  </div>

  <div id="chart-mount"></div>

  <script>
    ${inlinedJs}
  </script>
  <script>
    const initialPlan = ${jsonStr};
    const statusEl = document.getElementById("save-status");
    const indicatorEl = document.getElementById("save-indicator");

    async function saveToServer(data) {
      statusEl.textContent = "Saving...";
      if (indicatorEl) indicatorEl.style.background = "#F59E0B";
      try {
        const res = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          statusEl.textContent = "Saved to disk";
          if (indicatorEl) indicatorEl.style.background = "#10B981";
          setTimeout(() => { statusEl.textContent = "Live sync active"; }, 2000);
        }
      } catch (err) {
        statusEl.textContent = "Error saving";
        if (indicatorEl) indicatorEl.style.background = "#EF4444";
      }
    }

    const janttApi = window.Jantt && (window.Jantt.default || window.Jantt);
    if (janttApi && janttApi.mount) {
      janttApi.mount(
        document.getElementById("chart-mount"),
        initialPlan,
        {
          onCommit: (updatedPlan) => {
            saveToServer(updatedPlan);
          }
        }
      );
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mJantt\x1b[0m — The Ultimate JSON Gantt & Project Timeline Engine (v1.1.0)

\x1b[1mUsage:\x1b[0m
  jantt open <file.json>                Open interactive live-sync viewer in browser
  jantt validate <file.json>            Verify JSON schema, date validity & DAG integrity
  jantt audit <file.json>               Run DCMA-14 schedule health & EVM scorecard audit
  jantt monte-carlo <file.json>         Run probabilistic Monte Carlo schedule risk simulation
  jantt export <file.json> --format <f> Export to MS Project XML, Primavera P6, CSV, PDF/HTML, or SVG
  jantt import <file> [--out <json>]    Losslessly import MS Project XML, Primavera P6 XER, or CSV
  jantt --version                       Show version
  jantt --help                          Show this help menu

\x1b[1mExport Formats (--format):\x1b[0m
  xml                                   Microsoft Project (2013-2021) XML format
  xer                                   Oracle Primavera P6 .xer batch file
  csv                                   RFC 4180 spreadsheet with dependencies
  html                                  Multi-page Executive Report & PDF Booklet
  svg                                   Standalone high-resolution vector SVG chart

\x1b[1mExamples:\x1b[0m
  npx jantt open ./project.json --port 3000
  npx jantt audit ./project.json
  npx jantt monte-carlo ./project.json --runs 5000
  npx jantt export ./project.json --format xml --out ./project.xml
  npx jantt export ./project.json --format html --out ./executive-report.html
  npx jantt import ./schedule.xer --out ./project.json
`);
}
