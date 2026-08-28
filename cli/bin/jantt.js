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
  console.log("jantt v1.0.0");
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

    // Simple inline validation checks matching core validator
    const errors = [];
    if (!Array.isArray(json.tasks)) {
      errors.push("Missing top-level 'tasks' array.");
    } else {
      const ids = new Set();
      json.tasks.forEach((t, i) => {
        if (!t.id) errors.push(`tasks[${i}]: Missing 'id'.`);
        if (ids.has(t.id)) errors.push(`tasks[${i}]: Duplicate task id '${t.id}'.`);
        ids.add(t.id);
        if (!t.start) errors.push(`tasks[${i}] ('${t.id}'): Missing 'start' date.`);
        if (!t.end) errors.push(`tasks[${i}] ('${t.id}'): Missing 'end' date.`);
        if (!t.category) errors.push(`tasks[${i}] ('${t.id}'): Missing 'category'.`);
      });
      json.tasks.forEach((t) => {
        if (t.dependsOn && !ids.has(t.dependsOn)) {
          errors.push(`Task '${t.id}': dependsOn '${t.dependsOn}' does not exist.`);
        }
      });
    }

    if (errors.length === 0) {
      console.log(`\x1b[32m✔ '${filePath}' is valid Jantt JSON (${json.tasks.length} tasks).\x1b[0m`);
      process.exit(0);
    } else {
      console.error(`\x1b[31m✖ Validation failed for '${filePath}':\x1b[0m`);
      errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }
  } catch (e) {
    console.error(`\x1b[31mInvalid JSON file: ${e.message}\x1b[0m`);
    process.exit(1);
  }
}

if (command === "open") {
  const filePath = args[1];
  if (!filePath) {
    console.error("\x1b[31mError: Please specify a JSON file to open. Example: npx jantt open plan.json\x1b[0m");
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
    console.error(`\x1b[31mError: File is not valid JSON (${e.message})\x1b[0m`);
    process.exit(1);
  }

  const PORT = 4173;

  const server = http.createServer((req, res) => {
    // Enable CORS
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

    // Serve Standalone HTML Viewer
    if (req.url === "/" || req.url?.startsWith("/?")) {
      const html = generateStandaloneHtml(planData, filePath);
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

function generateStandaloneHtml(initialData, filePath) {
  const jsonStr = JSON.stringify(initialData);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Jantt — ${path.basename(filePath)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --jantt-bg: #0B111E;
      --jantt-surface: #141D2F;
      --jantt-surface-hover: #1A263D;
      --jantt-border: #24324B;
      --jantt-border-subtle: #1B283E;
      --jantt-text: #F1F5F9;
      --jantt-text-muted: #94A3B8;
      --jantt-text-dim: #64748B;
      --jantt-accent: #38BDF8;
      --jantt-accent-glow: rgba(56, 189, 248, 0.25);
      --jantt-today: #F43F5E;
      --jantt-weekend-bg: rgba(15, 23, 42, 0.45);
      --jantt-grid-line: #1E293B;
      --jantt-dep-line: #64748B;
      --jantt-dep-line-active: #38BDF8;
      --jantt-bar-radius: 6px;
      --jantt-font-sans: 'Inter', system-ui, sans-serif;
      --jantt-font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #060911;
      color: #F1F5F9;
      font-family: var(--jantt-font-sans);
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
      font-family: var(--jantt-font-mono);
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
    }
    #chart-mount {
      width: 100%;
    }
  </style>
  <style>
    /* Inlined Core CSS */
    .jantt-container { display: flex; flex-direction: column; background: var(--jantt-bg); color: var(--jantt-text); font-family: var(--jantt-font-sans); border: 1px solid var(--jantt-border); border-radius: 12px; overflow: hidden; position: relative; user-select: none; width: 100%; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .jantt-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: var(--jantt-surface); border-bottom: 1px solid var(--jantt-border); }
    .jantt-title-block { display: flex; align-items: center; gap: 12px; }
    .jantt-title { font-size: 15px; font-weight: 600; color: var(--jantt-text); }
    .jantt-badge { font-size: 11px; font-family: var(--jantt-font-mono); padding: 2px 8px; border-radius: 100px; background: var(--jantt-accent-glow); color: var(--jantt-accent); border: 1px solid currentColor; }
    .jantt-actions { display: flex; align-items: center; gap: 8px; }
    .jantt-body-wrap { display: flex; position: relative; overflow: auto; max-height: 75vh; }
    .jantt-label-column { position: sticky; left: 0; z-index: 20; background: var(--jantt-surface); border-right: 1px solid var(--jantt-border); flex-shrink: 0; box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15); }
    .jantt-label-header { border-bottom: 1px solid var(--jantt-border); display: flex; align-items: center; padding: 0 14px; font-size: 12px; font-weight: 600; color: var(--jantt-text-muted); text-transform: uppercase; letter-spacing: 0.05em; background: var(--jantt-surface); }
    .jantt-label-row { display: flex; align-items: center; padding: 0 14px; border-bottom: 1px solid var(--jantt-border-subtle); cursor: pointer; transition: background 0.15s ease; font-size: 13px; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .jantt-label-row:hover { background: var(--jantt-surface-hover); }
    .jantt-label-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .jantt-label-text { font-weight: 500; overflow: hidden; text-overflow: ellipsis; color: var(--jantt-text); }
    .jantt-timeline-area { position: relative; flex-grow: 1; }
    .jantt-timeline-header { position: sticky; top: 0; z-index: 10; background: var(--jantt-surface); border-bottom: 1px solid var(--jantt-border); display: flex; flex-direction: column; }
    .jantt-header-months { display: flex; border-bottom: 1px solid var(--jantt-border-subtle); height: 28px; }
    .jantt-month-cell { display: flex; align-items: center; padding-left: 10px; font-size: 12px; font-weight: 600; color: var(--jantt-text); border-right: 1px solid var(--jantt-border-subtle); box-sizing: border-box; }
    .jantt-header-days { display: flex; height: 28px; }
    .jantt-day-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 10px; font-family: var(--jantt-font-mono); color: var(--jantt-text-muted); border-right: 1px solid var(--jantt-grid-line); box-sizing: border-box; }
    .jantt-day-cell.is-weekend { background: var(--jantt-weekend-bg); color: var(--jantt-text-dim); }
    .jantt-day-cell.is-today { color: var(--jantt-today); font-weight: bold; }
    .jantt-grid-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    .jantt-grid-row { border-bottom: 1px solid var(--jantt-border-subtle); box-sizing: border-box; }
    .jantt-grid-day-col { position: absolute; top: 0; bottom: 0; border-right: 1px solid var(--jantt-grid-line); box-sizing: border-box; }
    .jantt-grid-day-col.is-weekend { background: var(--jantt-weekend-bg); }
    .jantt-today-line { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--jantt-today); z-index: 5; pointer-events: none; }
    .jantt-today-badge { position: absolute; top: 2px; left: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #FFF; background: var(--jantt-today); padding: 1px 4px; border-radius: 3px; }
    .jantt-svg-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; }
    .jantt-dep-path { fill: none; stroke: var(--jantt-dep-line); stroke-width: 1.5; stroke-dasharray: 4 2; transition: stroke 0.2s, stroke-width 0.2s; }
    .jantt-dep-path.is-active { stroke: var(--jantt-dep-line-active); stroke-width: 2.2; stroke-dasharray: none; }
    .jantt-task-bar { position: absolute; display: flex; align-items: center; border-radius: var(--jantt-bar-radius); color: #FFFFFF; cursor: grab; z-index: 6; transition: transform 0.08s ease, box-shadow 0.15s ease; overflow: hidden; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2); outline: none; }
    .jantt-task-bar:focus-visible { box-shadow: 0 0 0 2px var(--jantt-bg), 0 0 0 4px var(--jantt-accent); }
    .jantt-task-bar.is-dragging { cursor: grabbing; opacity: 0.9; z-index: 15; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4); }
    .jantt-task-bar.is-locked { cursor: pointer; opacity: 0.85; }
    .jantt-task-progress { position: absolute; top: 0; bottom: 0; left: 0; background: rgba(255, 255, 255, 0.22); pointer-events: none; border-radius: var(--jantt-bar-radius) 0 0 var(--jantt-bar-radius); }
    .jantt-bar-content { position: relative; z-index: 2; padding: 0 10px; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; pointer-events: none; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
    .jantt-resize-handle { position: absolute; top: 0; right: 0; bottom: 0; width: 10px; cursor: col-resize; z-index: 3; background: rgba(255, 255, 255, 0.1); }
    .jantt-resize-handle:hover { background: rgba(255, 255, 255, 0.35); }
    .jantt-modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .jantt-modal-card { background: var(--jantt-surface); border: 1px solid var(--jantt-border); border-radius: 16px; width: 100%; max-width: 540px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6); overflow: hidden; }
    .jantt-modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--jantt-border); }
    .jantt-modal-body { padding: 20px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
    .jantt-modal-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--jantt-border); background: var(--jantt-bg); }
    .jantt-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; }
    .jantt-btn-secondary { background: var(--jantt-surface-hover); color: var(--jantt-text); border-color: var(--jantt-border); }
    .jantt-btn-primary { background: var(--jantt-accent); color: #000; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="brand">
      <span>Jantt</span>
      <span class="brand-tag">${escapeHtml(path.basename(filePath))}</span>
    </div>
    <div class="status-badge">
      <span class="save-indicator"></span>
      <span id="save-status">Auto-saving to disk</span>
    </div>
  </div>

  <div id="chart-mount"></div>

  <script type="module">
    // Minimal runtime bundling or inline logic
    const initialPlan = ${jsonStr};

    // Day math
    const DAY_MS = 86400000;
    const parseD = (s) => new Date(s + "T00:00:00Z");
    const toISO = (d) => d.toISOString().slice(0, 10);
    const addDays = (s, n) => {
      const d = parseD(s);
      d.setUTCDate(d.getUTCDate() + Math.round(n));
      return toISO(d);
    };
    const diffDays = (a, b) => Math.round((parseD(b).getTime() - parseD(a).getTime()) / DAY_MS);

    function resolveSchedule(tasks, defaultGap = 2) {
      const byId = Object.fromEntries(tasks.map(t => [t.id, { ...t }]));
      const groups = {};
      Object.values(byId).filter(t => !t.locked).forEach(t => {
        (groups[t.category || "def"] ||= []).push(t);
      });
      const implicitPrev = {};
      Object.values(groups).forEach(list => {
        const unexp = list.filter(t => !t.dependsOn);
        unexp.sort((a, b) => parseD(a.start) - parseD(b.start));
        for (let i = 1; i < unexp.length; i++) implicitPrev[unexp[i].id] = unexp[i - 1].id;
      });
      for (let p = 0; p < 16; p++) {
        let changed = false;
        for (const t of Object.values(byId)) {
          if (t.locked) continue;
          const depId = t.dependsOn || implicitPrev[t.id];
          if (!depId || !byId[depId]) continue;
          const prereq = byId[depId];
          const gap = t.dependsOn ? (t.gapDays ?? t.minGapDays ?? defaultGap) : defaultGap;
          const minStart = addDays(prereq.end, gap);
          if (diffDays(t.start, minStart) > 0) {
            const dur = Math.max(diffDays(t.start, t.end), 1);
            t.start = minStart;
            t.end = addDays(minStart, dur);
            changed = true;
          }
        }
        if (!changed) break;
      }
      return tasks.map(orig => byId[orig.id] || { ...orig });
    }

    async function saveToServer(data) {
      const statusEl = document.getElementById("save-status");
      statusEl.textContent = "Saving...";
      try {
        const res = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          statusEl.textContent = "Saved to disk";
          setTimeout(() => { statusEl.textContent = "Live sync active"; }, 2000);
        }
      } catch (err) {
        statusEl.textContent = "Error saving";
      }
    }

    // Interactive Layout & Renderer
    function mountJantt(container, data) {
      let currentData = {
        ...data,
        tasks: resolveSchedule(data.tasks || [], data.meta?.defaultGapDays ?? 2)
      };

      const dayWidth = 32;
      const rowHeight = 46;
      const labelWidth = 240;
      const headerHeight = 58;

      function render() {
        container.innerHTML = "";
        const root = document.createElement("div");
        root.className = "jantt-container";
        container.appendChild(root);

        // Find bounds
        let minStart = currentData.meta?.start || (currentData.tasks[0]?.start ?? "2026-09-01");
        let maxEnd = currentData.meta?.end || (currentData.tasks[0]?.end ?? "2026-11-01");
        currentData.tasks.forEach(t => {
          if (diffDays(minStart, t.start) < 0) minStart = t.start;
          if (diffDays(maxEnd, t.end) > 0) maxEnd = t.end;
        });

        const totalDays = Math.max(diffDays(minStart, maxEnd), 1);
        const canvasWidth = totalDays * dayWidth;
        const canvasHeight = currentData.tasks.length * rowHeight;

        // Toolbar
        const toolbar = document.createElement("div");
        toolbar.className = "jantt-toolbar";
        toolbar.innerHTML = '<div class="jantt-title-block"><span class="jantt-title">' + (currentData.meta?.title || "Plan") + '</span><span class="jantt-badge">' + currentData.tasks.length + ' tasks</span></div>';
        root.appendChild(toolbar);

        const bodyWrap = document.createElement("div");
        bodyWrap.className = "jantt-body-wrap";
        root.appendChild(bodyWrap);

        // Labels
        const labelCol = document.createElement("div");
        labelCol.className = "jantt-label-column";
        labelCol.style.width = labelWidth + "px";
        const lHeader = document.createElement("div");
        lHeader.className = "jantt-label-header";
        lHeader.style.height = headerHeight + "px";
        lHeader.textContent = "Tasks";
        labelCol.appendChild(lHeader);

        currentData.tasks.forEach(t => {
          const r = document.createElement("div");
          r.className = "jantt-label-row";
          r.style.height = rowHeight + "px";
          const cat = currentData.categories?.[t.category] || { color: "#3B82F6" };
          r.innerHTML = '<span class="jantt-label-dot" style="background:' + cat.color + '"></span><span class="jantt-label-text">' + (t.label || t.name || t.id) + '</span>';
          labelCol.appendChild(r);
        });
        bodyWrap.appendChild(labelCol);

        // Timeline
        const timelineArea = document.createElement("div");
        timelineArea.className = "jantt-timeline-area";
        timelineArea.style.width = canvasWidth + "px";

        const tHeader = document.createElement("div");
        tHeader.className = "jantt-timeline-header";
        tHeader.style.height = headerHeight + "px";
        const daysRow = document.createElement("div");
        daysRow.className = "jantt-header-days";
        for (let i = 0; i < totalDays; i++) {
          const dStr = addDays(minStart, i);
          const dObj = parseD(dStr);
          const dCell = document.createElement("div");
          dCell.className = "jantt-day-cell";
          dCell.style.width = dayWidth + "px";
          dCell.textContent = dObj.getUTCDate();
          daysRow.appendChild(dCell);
        }
        tHeader.appendChild(daysRow);
        timelineArea.appendChild(tHeader);

        const canvasBody = document.createElement("div");
        canvasBody.style.position = "relative";
        canvasBody.style.width = canvasWidth + "px";
        canvasBody.style.height = canvasHeight + "px";

        // SVG lines
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "jantt-svg-overlay");
        svg.setAttribute("width", canvasWidth);
        svg.setAttribute("height", canvasHeight);
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = '<marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B" /></marker>';
        svg.appendChild(defs);

        const taskPos = new Map();
        currentData.tasks.forEach((t, idx) => {
          const x = diffDays(minStart, t.start) * dayWidth;
          const w = Math.max(diffDays(t.start, t.end), 1) * dayWidth;
          const y = idx * rowHeight + 7;
          taskPos.set(t.id, { x, y, w, h: 32 });
        });

        currentData.tasks.forEach(t => {
          if (!t.dependsOn || !taskPos.has(t.dependsOn)) return;
          const p = taskPos.get(t.dependsOn);
          const c = taskPos.get(t.id);
          const fromX = p.x + p.w;
          const fromY = p.y + p.h / 2;
          const toX = c.x;
          const toY = c.y + c.h / 2;
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", 'M ' + fromX + ' ' + fromY + ' C ' + (fromX + 24) + ' ' + fromY + ', ' + (toX - 24) + ' ' + toY + ', ' + toX + ' ' + toY);
          path.setAttribute("class", "jantt-dep-path");
          path.setAttribute("marker-end", "url(#arr)");
          svg.appendChild(path);
        });
        canvasBody.appendChild(svg);

        // Bars
        currentData.tasks.forEach(t => {
          const pos = taskPos.get(t.id);
          const cat = currentData.categories?.[t.category] || { color: "#3B82F6" };
          const bar = document.createElement("div");
          bar.className = "jantt-task-bar" + (t.locked ? " is-locked" : "");
          bar.style.left = pos.x + "px";
          bar.style.top = pos.y + "px";
          bar.style.width = pos.w + "px";
          bar.style.height = pos.h + "px";
          bar.style.background = cat.color;

          bar.innerHTML = '<div class="jantt-bar-content"><span>' + (t.label || t.name || t.id) + '</span></div>';

          if (!t.locked) {
            const handle = document.createElement("div");
            handle.className = "jantt-resize-handle";
            handle.addEventListener("pointerdown", (e) => startInteraction(e, t, "resize", bar));
            bar.appendChild(handle);

            bar.addEventListener("pointerdown", (e) => {
              if (e.target === handle) return;
              startInteraction(e, t, "move", bar);
            });
          }

          canvasBody.appendChild(bar);
        });

        timelineArea.appendChild(canvasBody);
        bodyWrap.appendChild(timelineArea);
      }

      function startInteraction(e, task, mode, barEl) {
        e.preventDefault();
        e.stopPropagation();
        barEl.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const origStart = task.start;
        const origEnd = task.end;
        let moved = false;

        const onMove = (me) => {
          const dx = me.clientX - startX;
          if (Math.abs(dx) > 3) moved = true;
          const dDays = Math.round(dx / dayWidth);

          if (mode === "move") {
            const dur = Math.max(diffDays(origStart, origEnd), 1);
            const nStart = addDays(origStart, dDays);
            task.start = nStart;
            task.end = addDays(nStart, dur);
          } else {
            const nEnd = addDays(origEnd, dDays);
            if (diffDays(origStart, nEnd) >= 1) task.end = nEnd;
          }
          render();
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          try { barEl.releasePointerCapture(e.pointerId); } catch(_) {}

          if (moved) {
            currentData.tasks = resolveSchedule(currentData.tasks, currentData.meta?.defaultGapDays ?? 2);
            render();
            saveToServer(currentData);
          }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }

      render();
    }

    mountJantt(document.getElementById("chart-mount"), initialPlan);
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
