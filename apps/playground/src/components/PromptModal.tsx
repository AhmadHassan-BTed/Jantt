import React, { useState } from "react";
import {
  X,
  Sparkles,
  FileJson,
  Zap,
  Copy,
  Check
} from "lucide-react";
import { JanttIcon } from "./JanttLogo";
import masterTemplateFixture from "../../../../examples/master-template.json";

interface PromptModalProps {
  showPromptModal: boolean;
  setShowPromptModal: (show: boolean) => void;
}

const LLM_PROMPT_SNIPPET = `You are a precision project management schedule generator.
Output ONLY raw, valid JSON conforming strictly to the Jantt JSON Schema (https://jantt.dev/schema/v1.json).

# JANTT JSON SCHEMA BENCHMARK & SPECIFICATION CHEATSHEET

## 1. Top-Level Root Structure
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "<Project Title>",
    "description": "<Project narrative and objectives>",
    "person": "<Lead Program Manager / Owner>",
    "organization": "<Enterprise / Organization Name>",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "defaultGapDays": 2,
    "scale": "day" | "week" | "month" | "quarter" | "year",
    "linkRouting": "orthogonal" | "curved" | "direct",
    "showCriticalPath": true,
    "showBaselines": true,
    "currency": "USD",
    "budget": 385000,
    "version": "1.2.0"
  },
  "categories": {
    "<category_id>": {
      "label": "<Category Display Name>",
      "color": "#HEX_COLOR",
      "soft": "#BG_TINT_HEX",
      "icon": "<lucide_icon_name>"
    }
  },
  "documents": [
    {
      "id": "doc-unique-id",
      "label": "<Document or Deliverable Title>",
      "status": "have" | "pending" | "missing",
      "owner": "<Owner Name>",
      "url": "<Documentation Link>",
      "note": "<Review notes / status>"
    }
  ],
  "tasks": [
    {
      "id": "task-unique-id",
      "wbs": "1.1",
      "label": "Task Name / Title",
      "category": "<matching_category_id>",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "assignee": "Team Member Name",
      "phase": "Phase 1: Foundation",
      "priority": "low" | "medium" | "high" | "urgent",
      "estimatedCost": 28000,
      "actualCost": 15000,
      "dependsOn": "prereq-id" | ["prereq-1", "prereq-2"] | null,
      "gapDays": 2,
      "locked": false,
      "progress": 0.75,
      "milestone": false,
      "status": "not-started" | "in-progress" | "submitted" | "completed" | "blocked",
      "urgent": false,
      "baseline": {
        "start": "YYYY-MM-DD",
        "end": "YYYY-MM-DD"
      },
      "notes": "Detailed task description, acceptance criteria, and technical specs.",
      "fields": {
        "jira": "JANTT-101",
        "storyPoints": 13,
        "repo": "github.com/org/repo",
        "deliverable": "schemas/v1.json"
      }
    }
  ]
}

## 2. Critical Constraints & Validation Rules:
1. DATES: All dates must be ISO "YYYY-MM-DD" format. "end" must be >= "start".
2. CATEGORIES: Every task "category" must match an existing key in the "categories" dictionary.
3. DEPENDENCIES (DAG):
   - "dependsOn" can be a single task ID string, an array of strings ["t1", "t2"], or null.
   - All referenced dependency IDs must exist in the "tasks" list (no dangling references).
   - Strict Directed Acyclic Graph: NO circular dependency loops (e.g. A -> B -> C -> A).
   - Timing Sanity: A task's "start" must be on or after prerequisite "end" + gapDays.
4. MILESTONES: For zero-duration milestone gates, set "milestone": true and "start" equal to "end".
5. PROGRESS: Must be a decimal float from 0.0 (0%) to 1.0 (100%).
6. BASELINES: Optional planned timeframe object { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } for baseline variance tracking.
7. LOCKED: Set "locked": true on fixed gates or hard-deadline milestones to prevent accidental drag shifts.`;

const RAW_CHEATSHEET_JSON = JSON.stringify(masterTemplateFixture, null, 2);

export const PromptModal: React.FC<PromptModalProps> = ({
  showPromptModal,
  setShowPromptModal
}) => {
  const [promptModalTab, setPromptModalTab] = useState<"prompt" | "cheatsheet" | "ideology">("prompt");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedRawCheatsheet, setCopiedRawCheatsheet] = useState(false);

  if (!showPromptModal) return null;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(LLM_PROMPT_SNIPPET);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {}
  };

  const handleCopyRawCheatsheet = async () => {
    try {
      await navigator.clipboard.writeText(RAW_CHEATSHEET_JSON);
      setCopiedRawCheatsheet(true);
      setTimeout(() => setCopiedRawCheatsheet(false), 2000);
    } catch {}
  };

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowPromptModal(false)}>
      <div className="prompt-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <JanttIcon size={22} variant="gradient" />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
              AI Agent Workbench &amp; Schema Cheatsheet
            </h3>
          </div>
          <button
            className="prompt-modal-close-btn"
            onClick={() => setShowPromptModal(false)}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Segmented Tab Bar */}
        <div className="prompt-modal-tabs">
          <button
            className={`prompt-tab-btn ${promptModalTab === "prompt" ? "is-active" : ""}`}
            onClick={() => setPromptModalTab("prompt")}
          >
            <Sparkles size={13} />
            <span>LLM System Prompt</span>
          </button>
          <button
            className={`prompt-tab-btn ${promptModalTab === "cheatsheet" ? "is-active" : ""}`}
            onClick={() => setPromptModalTab("cheatsheet")}
          >
            <FileJson size={13} />
            <span>JSON Schema Cheatsheet</span>
          </button>
          <button
            className={`prompt-tab-btn ${promptModalTab === "ideology" ? "is-active" : ""}`}
            onClick={() => setPromptModalTab("ideology")}
          >
            <Zap size={13} />
            <span>AI-Native Ideology</span>
          </button>
        </div>

        <div className="prompt-modal-body">
          {promptModalTab === "prompt" && (
            <>
              <p className="prompt-modal-desc">
                Hand this prompt to ChatGPT, Claude, Gemini, Cursor, or your autonomous AI agent. The model will output 100% valid, constraint-checked Jantt JSON schedules without hallucinating UI code:
              </p>
              <textarea
                className="prompt-modal-textarea"
                readOnly
                value={LLM_PROMPT_SNIPPET}
                rows={15}
              />
            </>
          )}

          {promptModalTab === "cheatsheet" && (
            <>
              <p className="prompt-modal-desc">
                Raw minimal Jantt JSON template structure. Provide this benchmark template directly to any code or LLM pipeline:
              </p>
              <textarea
                className="prompt-modal-textarea"
                readOnly
                value={RAW_CHEATSHEET_JSON}
                rows={15}
              />
            </>
          )}

          {promptModalTab === "ideology" && (
            <div className="ideology-wrap">
              <div className="ideology-hero">
                <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "var(--jantt-accent)" }}>
                  Stop Asking AI to Write Fragile Timeline Code
                </h4>
                <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.5, color: "var(--jantt-text-muted)" }}>
                  Having LLMs generate hundreds of lines of React JSX, SVG coordinate math, and canvas listeners produces brittle, hallucination-prone results. With Jantt, the AI outputs <strong>pure declarative JSON</strong>, and Jantt delivers deterministic, interactive execution.
                </p>
              </div>

              <div className="ideology-steps-grid">
                <div className="ideology-step-card">
                  <div className="step-badge">Step 1</div>
                  <h5>Feed Cheatsheet to LLM</h5>
                  <p>Give the AI the compact schema contract (WBS, dates, DAG dependencies, milestones, budget).</p>
                </div>
                <div className="ideology-step-card">
                  <div className="step-badge">Step 2</div>
                  <h5>AI Outputs Pure JSON</h5>
                  <p>Uses 10× fewer tokens. Machine-checkable, type-safe, and zero UI hallucinations.</p>
                </div>
                <div className="ideology-step-card">
                  <div className="step-badge">Step 3</div>
                  <h5>Instant Interactive Suite</h5>
                  <p>Jantt resolves topological DAG schedules, routes orthogonal wires, and renders Gantt, Kanban &amp; Analytics.</p>
                </div>
                <div className="ideology-step-card">
                  <div className="step-badge">Step 4</div>
                  <h5>Bidirectional Loop</h5>
                  <p>Humans drag and adjust visually. Jantt syncs clean JSON back to localStorage/disk for the AI agent.</p>
                </div>
              </div>

              <div className="ideology-metrics-row">
                <div className="ideology-metric-box">
                  <span className="metric-val">10×</span>
                  <span className="metric-lbl">Fewer LLM Tokens vs JSX</span>
                </div>
                <div className="ideology-metric-box">
                  <span className="metric-val">0</span>
                  <span className="metric-lbl">Runtime Dependencies</span>
                </div>
                <div className="ideology-metric-box">
                  <span className="metric-val">100%</span>
                  <span className="metric-lbl">Deterministic DAG Solver</span>
                </div>
                <div className="ideology-metric-box">
                  <span className="metric-val">2-Way</span>
                  <span className="metric-lbl">Bidirectional State Sync</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="prompt-modal-footer">
          <span style={{ fontSize: "11.5px", color: "var(--jantt-text-dim)", fontFamily: "var(--jantt-font-mono)" }}>
            Schema: https://jantt.dev/schema/v1.json (v1.2.0)
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button className="btn-nav" onClick={() => setShowPromptModal(false)}>
              Close
            </button>
            {promptModalTab === "prompt" && (
              <button className="btn-nav btn-nav-primary" onClick={handleCopyPrompt}>
                {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                {copiedPrompt ? "Copied Prompt" : "Copy LLM System Prompt"}
              </button>
            )}
            {promptModalTab === "cheatsheet" && (
              <button className="btn-nav btn-nav-primary" onClick={handleCopyRawCheatsheet}>
                {copiedRawCheatsheet ? <Check size={14} /> : <Copy size={14} />}
                {copiedRawCheatsheet ? "Copied JSON" : "Copy Raw Cheatsheet JSON"}
              </button>
            )}
            {promptModalTab === "ideology" && (
              <button className="btn-nav btn-nav-primary" onClick={handleCopyPrompt}>
                {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                {copiedPrompt ? "Copied Prompt" : "Copy System Prompt"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
