#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  console.log(`
\x1b[1m\x1b[36mJantt\x1b[0m — The JSON Gantt Chart Engine

\x1b[1mUsage:\x1b[0m
  jantt open <file.json>     Open interactive Gantt chart viewer for a file
  jantt validate <file.json> Check schema validity of a Jantt JSON file
  jantt --version            Show version

\x1b[1mExamples:\x1b[0m
  npx jantt open ./my-plan.json
  npx jantt validate ./examples/basic.json
`);
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  console.log("jantt v1.1.0");
  process.exit(0);
}

if (command === "validate") {
  const filePath = args[1];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify a JSON file to validate.\x1b[0m");
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

    // Core validation checks
    const errors = [];
    if (!Array.isArray(json.tasks)) {
      errors.push("Missing top-level 'tasks' array.");
    } else {
      const ids = new Set();
      json.tasks.forEach((t, i) => {
        if (!t.id) errors.push(`tasks[${i}]: Missing 'id'.`);
        if (ids.has(t.id)) errors.push(`tasks[${i}]: Duplicate task id '${t.id}'.`);
        ids.add(t.id);
        if (!t.start || !/^\d{4}-\d{2}-\d{2}$/.test(t.start)) errors.push(`tasks[${i}] (${t.id}): Invalid start date format (must be YYYY-MM-DD).`);
        if (!t.end || !/^\d{4}-\d{2}-\d{2}$/.test(t.end)) errors.push(`tasks[${i}] (${t.id}): Invalid end date format (must be YYYY-MM-DD).`);
        if (t.start && t.end && t.start > t.end) errors.push(`tasks[${i}] (${t.id}): Start date ${t.start} is after end date ${t.end}.`);
        if (t.dependsOn && t.dependsOn === t.id) errors.push(`tasks[${i}] (${t.id}): Task cannot depend on itself.`);
      });
    }

    if (errors.length > 0) {
      console.error(`\x1b[31mValidation Failed with ${errors.length} issue(s):\x1b[0m`);
      errors.forEach((err) => console.error(`  - \x1b[33m${err}\x1b[0m`));
      process.exit(1);
    } else {
      console.log(`\x1b[32m✔ Validation Passed: ${filePath} is valid Jantt JSON (${json.tasks.length} tasks)\x1b[0m`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`\x1b[31mJSON Parse Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

if (command === "open") {
  const filePath = args[1];
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

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;

  // Paths to standalone library bundle
  const standaloneJsPath = path.resolve(__dirname, "../../packages/standalone/dist/jantt.standalone.iife.js");
  const standaloneCssPath = path.resolve(__dirname, "../../packages/standalone/dist/style.css");

  const server = http.createServer((req, res) => {
    // Enable CORS for local dev flexibility
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

    // Serve Standalone Assets
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

    // Serve Standalone HTML Viewer
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

    // Auto-open browser
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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
      font-family: var(--jantt-font-sans, 'Inter', sans-serif);
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
      font-family: 'JetBrains Mono', monospace;
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
