import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  FileJson,
  Zap,
  Copy,
  Check,
  AlertTriangle
} from "lucide-react";
import { Modal, ModalHeader } from "./ModalHost";
import { JanttIcon } from "../common/JanttLogo";
import masterTemplateFixture from "../../../../../examples/master-template.json";

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
    "showCriticalPath": false,
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
  "people": [
    {
      "id": "person-id",
      "name": "Alex Mercer",
      "role": "Lead Architect",
      "email": "alex@org.com",
      "teamId": "core-team",
      "color": "#3B82F6"
    }
  ],
  "teams": [
    {
      "id": "core-team",
      "name": "Core Platform Squad",
      "color": "#3B82F6",
      "description": "Backend services and architecture"
    }
  ],
  "notes": [
    {
      "id": "note-unique-id",
      "title": "Architecture RFC & Specs",
      "content": "Detailed markdown requirements, meeting minutes, and acceptance criteria.",
      "color": "#3B82F6",
      "pinned": true,
      "category": "Architecture",
      "tags": ["RFC", "Architecture"],
      "task_ids": ["task-1"],
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
      "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
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
      "dependsOn": "prereq-id" | ["prereq-1", { "id": "prereq-2", "type": "SS", "lag": 2 }] | null,
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
   - "dependsOn" can be a single task ID string, an array of task IDs and/or dependency objects, or null.
   - Dependency object: { "id": "t1", "type": "FS" | "SS" | "FF" | "SF", "lag": <whole days, negative = lead> }. "type" defaults to "FS" (finish-to-start).
   - Without "lag", FS links wait the task's "gapDays" (else meta.defaultGapDays, default 2) and SS/FF/SF links use 0. An explicit "lag" (even 0) replaces the gap.
   - String shorthand is also accepted: "t1:SS", "t1:FF-1d", "t1+2d".
   - All referenced dependency IDs must exist in the "tasks" list (no dangling references).
   - Strict Directed Acyclic Graph: NO circular dependency loops (e.g. A -> B -> C -> A).
   - Timing Sanity: for finish-to-start links, a task's "start" must be on or after the prerequisite "end" + lag (or + gapDays when no lag is given).
4. MILESTONES: For zero-duration milestone gates, set "milestone": true and "start" equal to "end".
5. PROGRESS: Must be a decimal float from 0.0 (0%) to 1.0 (100%).
6. BASELINES: Optional planned timeframe object { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } for baseline variance tracking.
7. LOCKED: Set "locked": true on fixed gates or hard-deadline milestones to prevent accidental drag shifts.`;

const RAW_CHEATSHEET_JSON = JSON.stringify(masterTemplateFixture, null, 2);

type PromptTab = "prompt" | "cheatsheet" | "ideology";
type CopyTarget = "prompt" | "cheatsheet";
type CopyFeedback = { target: CopyTarget; ok: boolean } | null;

const PROMPT_TABS: { id: PromptTab; label: string; icon: React.ReactNode }[] = [
  { id: "prompt", label: "LLM System Prompt", icon: <Sparkles size={13} /> },
  { id: "cheatsheet", label: "JSON Template", icon: <FileJson size={13} /> },
  { id: "ideology", label: "Why JSON-First", icon: <Zap size={13} /> }
];

const COPY_SOURCES: Record<CopyTarget, string> = {
  prompt: LLM_PROMPT_SNIPPET,
  cheatsheet: RAW_CHEATSHEET_JSON
};

/** Clipboard API first, then the legacy selection-based copy for insecure contexts and older browsers. */
async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: try the fallback below.
  }
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const scratch = document.createElement("textarea");
  try {
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.top = "0";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    scratch.remove();
    previouslyFocused?.focus?.();
  }
}

export const PromptModal: React.FC<PromptModalProps> = ({
  showPromptModal,
  setShowPromptModal
}) => {
  const [promptModalTab, setPromptModalTab] = useState<PromptTab>("prompt");
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  if (!showPromptModal) return null;

  const close = () => setShowPromptModal(false);

  const handleCopy = async (target: CopyTarget) => {
    const ok = await writeClipboardText(COPY_SOURCES[target]);
    setCopyFeedback({ target, ok });
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setCopyFeedback(null), ok ? 2000 : 5000);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = PROMPT_TABS.findIndex((t) => t.id === promptModalTab);
    const next = PROMPT_TABS[(idx + (e.key === "ArrowRight" ? 1 : PROMPT_TABS.length - 1)) % PROMPT_TABS.length];
    setPromptModalTab(next.id);
    document.getElementById(`prompt-tab-${next.id}`)?.focus();
  };

  const copyTarget: CopyTarget = promptModalTab === "cheatsheet" ? "cheatsheet" : "prompt";
  const feedback = copyFeedback?.target === copyTarget ? copyFeedback : null;
  const copyLabel = copyTarget === "cheatsheet" ? "Copy JSON Template" : "Copy System Prompt";

  return (
    <Modal onClose={close} maxWidth={760}>
      <ModalHeader icon={<JanttIcon size={20} variant="gradient" />} title="Generate Plans with AI" />

      {/* Modal Segmented Tab Bar */}
      <div
        className="prompt-modal-tabs"
        role="tablist"
        aria-label="AI prompt sections"
        onKeyDown={handleTabKeyDown}
        style={{ overflowX: "auto" }}
      >
        {PROMPT_TABS.map((tab) => {
          const selected = promptModalTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`prompt-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="prompt-tabpanel"
              tabIndex={selected ? 0 : -1}
              className={`prompt-tab-btn ${selected ? "is-active" : ""}`}
              onClick={() => setPromptModalTab(tab.id)}
              style={{ flexShrink: 0 }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        className="prompt-modal-body"
        id="prompt-tabpanel"
        role="tabpanel"
        aria-labelledby={`prompt-tab-${promptModalTab}`}
      >
        {promptModalTab === "prompt" && (
          <>
            <p className="prompt-modal-desc">
              Give this prompt to ChatGPT, Claude, Gemini, Cursor or your own agent, then paste the JSON it returns into
              the editor. Jantt validates it and points out broken dates, unknown categories and dependency cycles.
            </p>
            <textarea
              className="prompt-modal-textarea"
              readOnly
              value={LLM_PROMPT_SNIPPET}
              rows={15}
              aria-label="LLM system prompt"
            />
          </>
        )}

        {promptModalTab === "cheatsheet" && (
          <>
            <p className="prompt-modal-desc">
              A complete example plan using the supported fields. Give it to an LLM or code pipeline as a reference template.
            </p>
            <textarea
              className="prompt-modal-textarea"
              readOnly
              value={RAW_CHEATSHEET_JSON}
              rows={15}
              aria-label="Example Jantt JSON template"
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
                <h5>Feed the Prompt to an LLM</h5>
                <p>Give the AI the compact schema contract (WBS, dates, dependencies, milestones, budget).</p>
              </div>
              <div className="ideology-step-card">
                <div className="step-badge">Step 2</div>
                <h5>AI Outputs Plain JSON</h5>
                <p>Far fewer tokens than UI code, and every field can be checked by the validator.</p>
              </div>
              <div className="ideology-step-card">
                <div className="step-badge">Step 3</div>
                <h5>Instant Interactive Suite</h5>
                <p>Jantt resolves dependency schedules, routes links, and renders Gantt, Kanban &amp; Analytics.</p>
              </div>
              <div className="ideology-step-card">
                <div className="step-badge">Step 4</div>
                <h5>Round-Trip Editing</h5>
                <p>Humans drag and adjust visually. Jantt keeps clean JSON in the browser, ready to export back to the AI agent.</p>
              </div>
            </div>

            <div className="ideology-metrics-row">
              <div className="ideology-metric-box">
                <span className="metric-val">JSON</span>
                <span className="metric-lbl">Output Instead of UI Code</span>
              </div>
              <div className="ideology-metric-box">
                <span className="metric-val">1</span>
                <span className="metric-lbl">Small Runtime Dependency (fflate)</span>
              </div>
              <div className="ideology-metric-box">
                <span className="metric-val">4</span>
                <span className="metric-lbl">Dependency Types (FS/SS/FF/SF)</span>
              </div>
              <div className="ideology-metric-box">
                <span className="metric-val">2-Way</span>
                <span className="metric-lbl">Visual &amp; JSON Editing</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="prompt-modal-footer" style={{ flexWrap: "wrap" }}>
        <span
          role="status"
          style={{
            fontSize: "11.5px",
            color: feedback && !feedback.ok ? "#EF4444" : "var(--jantt-text-dim)",
            fontFamily: feedback ? undefined : "var(--jantt-font-mono)",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          {feedback && !feedback.ok ? (
            <>
              <AlertTriangle size={13} />
              Copy failed. Select the text and press Ctrl+C (Cmd+C on Mac).
            </>
          ) : (
            "Schema: https://jantt.dev/schema/v1.json"
          )}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
          <button type="button" className="btn-nav" onClick={close}>
            Close
          </button>
          <button type="button" className="btn-nav btn-nav-primary" onClick={() => handleCopy(copyTarget)}>
            {feedback?.ok ? <Check size={14} /> : <Copy size={14} />}
            {feedback?.ok ? "Copied" : copyLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
