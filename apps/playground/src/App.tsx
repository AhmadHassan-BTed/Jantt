import { useState, useCallback } from "react";
import { JanttData, validate, ValidationResult, ValidationError, resolveSchedule, TimeScale } from "@jantt/core";
import { Jantt } from "@jantt/react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Download,
  Sliders,
  X,
  FileJson,
  Layers,
  Zap
} from "lucide-react";

import basicFixture from "../../../examples/basic.json";
import constructionFixture from "../../../examples/construction-enterprise.json";
import academicFixture from "../../../examples/academic-roadmap.json";
import brokenMissingIdFixture from "../../../examples/broken-missing-id.json";
import brokenBadDateFixture from "../../../examples/broken-bad-date.json";
import brokenDanglingDepFixture from "../../../examples/broken-dangling-dependency.json";

const PRESETS: Record<string, { label: string; data: any }> = {
  construction: { label: "High-Rise Construction (Enterprise)", data: constructionFixture },
  basic: { label: "Acme Platform v2 Launch", data: basicFixture },
  academic: { label: "Graduate Admissions Roadmap", data: academicFixture },
  brokenMissingId: { label: "Diagnostic: Missing ID", data: brokenMissingIdFixture },
  brokenBadDate: { label: "Diagnostic: Bad Date Range", data: brokenBadDateFixture },
  brokenDangling: { label: "Diagnostic: Dangling Dep", data: brokenDanglingDepFixture }
};

const THEMES: Record<string, { label: string; className: string; vars: Record<string, string> }> = {
  dark: {
    label: "Obsidian Dark",
    className: "jantt-theme-dark",
    vars: {}
  },
  light: {
    label: "Clean Slate",
    className: "jantt-theme-light",
    vars: {
      "--jantt-bg": "#FFFFFF",
      "--jantt-surface": "#F8FAFC",
      "--jantt-border": "#E2E8F0",
      "--jantt-text": "#0F172A",
      "--jantt-text-muted": "#64748B",
      "--jantt-accent": "#0284C7"
    }
  },
  emerald: {
    label: "Cyber Emerald",
    className: "jantt-theme-dark",
    vars: {
      "--jantt-bg": "#061A14",
      "--jantt-surface": "#0C2E24",
      "--jantt-border": "#164E3D",
      "--jantt-text": "#ECFDF5",
      "--jantt-accent": "#10B981",
      "--jantt-accent-glow": "rgba(16, 185, 129, 0.3)"
    }
  },
  sunset: {
    label: "Sunset Crimson",
    className: "jantt-theme-dark",
    vars: {
      "--jantt-bg": "#1A0B12",
      "--jantt-surface": "#2D1220",
      "--jantt-border": "#4C1D36",
      "--jantt-text": "#FFF1F2",
      "--jantt-accent": "#F43F5E",
      "--jantt-accent-glow": "rgba(244, 63, 94, 0.3)"
    }
  }
};

export function App() {
  const [selectedPreset, setSelectedPreset] = useState("construction");
  const [selectedTheme, setSelectedTheme] = useState("dark");
  const [jsonText, setJsonText] = useState(() => JSON.stringify(constructionFixture, null, 2));
  const [parsedData, setParsedData] = useState<JanttData | null>(constructionFixture as JanttData);
  const [validationResult, setValidationResult] = useState<ValidationResult>(() => validate(constructionFixture));
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [defaultGap, setDefaultGap] = useState(2);
  const [currentScale, setCurrentScale] = useState<TimeScale>("week");
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [showBaselines, setShowBaselines] = useState(true);

  // Handle preset selection
  const handleSelectPreset = (key: string) => {
    setSelectedPreset(key);
    const fixture = PRESETS[key].data;
    const formatted = JSON.stringify(fixture, null, 2);
    setJsonText(formatted);
    try {
      const parsed = JSON.parse(formatted);
      const val = validate(parsed);
      setValidationResult(val);
      if (val.valid) {
        setParsedData(parsed);
        setDefaultGap(parsed.meta?.defaultGapDays ?? 2);
        if (parsed.meta?.scale) setCurrentScale(parsed.meta.scale);
        if (parsed.meta?.showCriticalPath !== undefined) setShowCriticalPath(parsed.meta.showCriticalPath);
        if (parsed.meta?.showBaselines !== undefined) setShowBaselines(parsed.meta.showBaselines);
      } else {
        setParsedData(null);
      }
    } catch {
      setParsedData(null);
    }
  };

  // Handle raw text changes in the JSON editor
  const handleEditorChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      const val = validate(parsed);
      setValidationResult(val);
      if (val.valid) {
        setParsedData(parsed);
        setDefaultGap(parsed.meta?.defaultGapDays ?? 2);
      } else {
        setParsedData(null);
      }
    } catch (err: any) {
      setValidationResult({
        valid: false,
        errors: [
          {
            path: "$",
            code: "SCHEMA_MISMATCH",
            message: `JSON Syntax Error: ${err.message}`,
            suggestion: "Fix syntax error (missing comma, unclosed bracket, or quote)."
          }
        ]
      });
      setParsedData(null);
    }
  };

  // Handle live commit from interactive Gantt drag/resize/modal/link
  const handleChartCommit = useCallback((updated: JanttData) => {
    setParsedData(updated);
    const formatted = JSON.stringify(updated, null, 2);
    setJsonText(formatted);
    setValidationResult(validate(updated));
  }, []);

  // Handle gap slider adjustment
  const handleGapChange = (gap: number) => {
    setDefaultGap(gap);
    if (parsedData) {
      const updated: JanttData = {
        ...parsedData,
        meta: { ...parsedData.meta, defaultGapDays: gap },
        tasks: resolveSchedule(parsedData.tasks, gap)
      };
      setParsedData(updated);
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Format JSON in editor
  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      // Ignore
    }
  };

  // Copy JSON to clipboard
  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Ignore
    }
  };

  // Download JSON file
  const handleDownloadJson = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jantt-plan-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const llmPromptSnippet = `Here is the Jantt JSON Schema specification:
https://jantt.dev/schema/v1.json

Output only valid JSON conforming strictly to the Jantt Schema.
Rules:
- Root must contain "tasks": [{ "id": "...", "category": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "dependsOn": "prereq-id" | null, "milestone": boolean, "baseline": { "start": "...", "end": "..." } }]
- All dates must be ISO "YYYY-MM-DD"
- All categories in tasks must match keys in the "categories" dictionary
- Use domain-specific properties inside the "fields" object`;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(llmPromptSnippet);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className={`playground-app ${THEMES[selectedTheme].className}`}>
      {/* Navbar Header */}
      <header className="navbar">
        <div className="brand-section">
          <div className="brand-logo">
            <div className="brand-icon-box">J</div>
            <span>Jantt</span>
          </div>
          <span className="brand-badge">v1.1.0</span>
          <span style={{ fontSize: "13px", color: "#94A3B8", marginLeft: "8px" }}>The JSON Gantt Engine</span>
        </div>

        <div className="nav-controls">
          {/* Preset Selector */}
          <div className="nav-select-group">
            <label htmlFor="preset-select">Preset:</label>
            <select
              id="preset-select"
              className="select-input"
              value={selectedPreset}
              onChange={(e) => handleSelectPreset(e.target.value)}
            >
              {Object.entries(PRESETS).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Selector */}
          <div className="nav-select-group">
            <label htmlFor="theme-select">Theme:</label>
            <select
              id="theme-select"
              className="select-input"
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
            >
              {Object.entries(THEMES).map(([k, t]) => (
                <option key={k} value={k}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt AI Button */}
          <button
            className="btn-nav btn-nav-primary"
            onClick={() => setShowPromptModal(true)}
            title="Get LLM system prompt for generating Jantt JSON"
          >
            <Sparkles size={14} />
            <span>AI Prompt</span>
          </button>

          {/* Download Button */}
          <button className="btn-nav" onClick={handleDownloadJson} title="Download plan as JSON">
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="main-workspace">
        {/* Left Pane: Code Editor & Schema Diagnostics */}
        <section className="editor-pane">
          <div className="pane-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileJson size={15} />
              <span>JSON State (Source of Truth)</span>
            </div>
            <div className="pane-actions">
              <button className="btn-nav" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={formatJson}>
                Format
              </button>
              <button className="btn-nav" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={handleCopyJson}>
                {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                {copiedJson ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="editor-wrapper">
            <textarea
              id="json-editor-textarea"
              className="code-textarea"
              value={jsonText}
              onChange={(e) => handleEditorChange(e.target.value)}
              spellCheck={false}
              placeholder="Paste or write your Jantt JSON plan here..."
            />
          </div>

          {/* Real-time Diagnostics Bar */}
          <div className="diagnostics-panel" id="diagnostics-panel">
            <div className="diagnostics-title">
              {validationResult.valid ? (
                <>
                  <CheckCircle2 size={16} className="diag-valid" />
                  <span className="diag-valid">Valid Jantt Plan ({parsedData?.tasks?.length || 0} tasks)</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} className="diag-invalid" />
                  <span className="diag-invalid">{validationResult.errors.length} Schema Issue(s) Found</span>
                </>
              )}
            </div>

            {!validationResult.valid && (
              <div className="error-list">
                {validationResult.errors.map((err: ValidationError, idx: number) => (
                  <div key={idx} className="error-card">
                    <div className="error-msg">
                      <strong>[{err.code}]</strong> {err.message}
                    </div>
                    {err.suggestion && <div className="error-suggestion">💡 Suggestion: {err.suggestion}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right Pane: Live Chart Render */}
        <section className="chart-pane">
          <div className="chart-controls-bar">
            <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
              {/* Pacing Gap Slider */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <Sliders size={13} color="#38BDF8" />
                <span style={{ fontWeight: 600 }}>Pacing:</span>
                <input
                  type="range"
                  min="0"
                  max="7"
                  value={defaultGap}
                  onChange={(e) => handleGapChange(parseInt(e.target.value, 10))}
                  style={{ accentColor: "#38BDF8", cursor: "pointer", width: "70px" }}
                />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#38BDF8", fontWeight: 600 }}>
                  {defaultGap}d
                </span>
              </div>

              {/* TimeScale Switcher */}
              <div className="jantt-scale-group" style={{ margin: 0 }}>
                {(["day", "week", "month", "quarter", "year"] as TimeScale[]).map((scaleKey) => (
                  <button
                    key={scaleKey}
                    className={`jantt-scale-btn ${currentScale === scaleKey ? "is-active" : ""}`}
                    onClick={() => setCurrentScale(scaleKey)}
                  >
                    {scaleKey}
                  </button>
                ))}
              </div>

              {/* Critical Path Toggle */}
              <button
                className={`jantt-critical-btn ${showCriticalPath ? "is-active" : ""}`}
                onClick={() => setShowCriticalPath(!showCriticalPath)}
                title="Calculate and illuminate the project critical bottleneck chain"
              >
                <Zap size={13} />
                <span>Critical Path</span>
              </button>

              {/* Baselines Toggle */}
              <button
                className={`jantt-critical-btn ${showBaselines ? "is-active" : ""}`}
                style={showBaselines ? { borderColor: "#38BDF8", color: "#38BDF8", background: "rgba(56, 189, 248, 0.15)" } : {}}
                onClick={() => setShowBaselines(!showBaselines)}
                title="Show original baseline plan ghost bars"
              >
                <Layers size={13} />
                <span>Baselines</span>
              </button>
            </div>

            <div style={{ fontSize: "11px", color: "#94A3B8" }}>
              💡 Drag edge to link • Drag progress handle • Drag bar to move • Drag splitter to resize table
            </div>
          </div>

          <div className="chart-container-card">
            {parsedData ? (
              <Jantt
                data={parsedData}
                onCommit={handleChartCommit}
                viewport={{
                  scale: currentScale,
                  showCriticalPath,
                  showBaselines
                }}
                theme={THEMES[selectedTheme].vars}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "400px",
                  gap: "12px",
                  color: "#94A3B8"
                }}
              >
                <AlertTriangle size={36} color="#F43F5E" />
                <h3 style={{ color: "#F1F5F9" }}>Cannot render Gantt chart</h3>
                <p style={{ fontSize: "13px", maxWidth: "400px", textAlign: "center" }}>
                  Please resolve the schema diagnostic errors in the left panel to display the interactive chart.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* AI Prompt Generator Modal */}
      {showPromptModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowPromptModal(false)}>
          <div className="prompt-modal-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px",
                borderBottom: "1px solid #243656"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={18} color="#38BDF8" />
                <h3 style={{ margin: 0, fontSize: "16px", color: "#FFFFFF" }}>AI-Native System Prompt</h3>
              </div>
              <button
                onClick={() => setShowPromptModal(false)}
                style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <p style={{ fontSize: "13px", color: "#94A3B8", lineHeight: "1.5" }}>
                Hand this prompt snippet to ChatGPT, Claude, Gemini, or any LLM to generate guaranteed valid Jantt JSON
                schedules with milestones, baselines, and dependencies:
              </p>
              <textarea
                readOnly
                value={llmPromptSnippet}
                rows={9}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#070B14",
                  border: "1px solid #1E2D4A",
                  borderRadius: "8px",
                  padding: "12px",
                  color: "#E2E8F0",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  resize: "none"
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                padding: "14px 22px",
                borderTop: "1px solid #243656",
                background: "#080E1C"
              }}
            >
              <button className="btn-nav" onClick={() => setShowPromptModal(false)}>
                Close
              </button>
              <button className="btn-nav btn-nav-primary" onClick={handleCopyPrompt}>
                {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                {copiedPrompt ? "Copied to Clipboard" : "Copy Prompt Snippet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
