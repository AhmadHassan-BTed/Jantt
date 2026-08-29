import { useState, useCallback, useRef } from "react";
import {
  JanttData,
  validate,
  ValidationResult,
  TimeScale,
  LinkRoutingStyle,
  themeManager,
  ThemeDefinition,
  downloadCsv
} from "@jantt/core";
import { Jantt } from "@jantt/react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Download,
  X,
  FileJson,
  Layers,
  Zap,
  ChevronLeft,
  Kanban,
  PieChart,
  DollarSign,
  Calendar,
  TrendingUp,
  User,
  Clock,
  FileSpreadsheet
} from "lucide-react";

import basicFixture from "../../../examples/basic.json";
import constructionFixture from "../../../examples/construction-enterprise.json";
import academicFixture from "../../../examples/academic-roadmap.json";
import masterFixture from "../../../examples/master-template.json";
import brokenMissingIdFixture from "../../../examples/broken-missing-id.json";
import brokenBadDateFixture from "../../../examples/broken-bad-date.json";
import brokenDanglingDepFixture from "../../../examples/broken-dangling-dependency.json";

const PRESETS: Record<string, { label: string; data: any }> = {
  master: { label: "Master Kitchen-Sink (All Features)", data: masterFixture },
  construction: { label: "High-Rise Construction (Enterprise)", data: constructionFixture },
  basic: { label: "Acme Platform v2 Launch", data: basicFixture },
  academic: { label: "Graduate Admissions Roadmap", data: academicFixture },
  brokenMissingId: { label: "Diagnostic: Missing ID", data: brokenMissingIdFixture },
  brokenBadDate: { label: "Diagnostic: Bad Date Range", data: brokenBadDateFixture },
  brokenDangling: { label: "Diagnostic: Dangling Dep", data: brokenDanglingDepFixture }
};

const AVAILABLE_THEMES = themeManager.getAllThemes();

export function App() {
  const [selectedPreset, setSelectedPreset] = useState("construction");
  const [selectedThemeId, setSelectedThemeId] = useState("swiss-light");
  const activeTheme: ThemeDefinition = themeManager.getTheme(selectedThemeId) || AVAILABLE_THEMES[0];
  const [jsonText, setJsonText] = useState(() => JSON.stringify(constructionFixture, null, 2));
  const [parsedData, setParsedData] = useState<JanttData | null>(constructionFixture as JanttData);
  const [validationResult, setValidationResult] = useState<ValidationResult>(() => validate(constructionFixture));
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [currentScale, setCurrentScale] = useState<TimeScale>("week");
  const [linkRouting, setLinkRouting] = useState<LinkRoutingStyle>("orthogonal");
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [showBaselines, setShowBaselines] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<"gantt" | "kanban" | "summary">("gantt");

  // Sidebar width resize state
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const isDraggingRef = useRef(false);

  const startResizing = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const minW = 280;
      const maxW = Math.max(minW, window.innerWidth - 360);
      const newWidth = Math.min(Math.max(moveEvent.clientX, minW), maxW);
      setSidebarWidth(newWidth);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, []);

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

  const [isLiveSyncing, setIsLiveSyncing] = useState(false);
  const syncTimerRef = useRef<number | null>(null);

  // Handle live commit from interactive Gantt drag/resize/modal/link/multi-shift
  const handleChartCommit = useCallback((updated: JanttData) => {
    setParsedData(updated);
    const formatted = JSON.stringify(updated, null, 2);
    setJsonText(formatted);
    setValidationResult(validate(updated));

    // Trigger visual sync flash / glow in JSON editor
    setIsLiveSyncing(true);
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      setIsLiveSyncing(false);
    }, 1300);
  }, []);

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

  // Export CSV file
  const handleExportCsv = () => {
    if (parsedData) {
      downloadCsv(parsedData, `jantt-schedule-${Date.now()}.csv`);
    }
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
    <div
      className={`playground-app ${activeTheme.className}`}
      style={{ ...(activeTheme.vars as React.CSSProperties) }}
    >
      {/* Navbar Header */}
      <header className="navbar">
        <div className="brand-section">
          <div className="brand-logo">
            <div className="brand-icon-box">J</div>
            <span>Jantt</span>
          </div>
          <span className="brand-badge">v1.1.0</span>
          {isSidebarCollapsed && (
            <button
              className="btn-nav btn-restore-sidebar"
              onClick={() => setIsSidebarCollapsed(false)}
              title="Expand JSON Editor Sidebar"
              style={{ marginLeft: "8px" }}
            >
              <FileJson size={13} />
              <span>Show JSON Editor</span>
            </button>
          )}
        </div>

        <div className="nav-controls">
          {/* View Switcher: Gantt Timeline, Kanban Board, Budget & Analytics */}
          <div className="jantt-scale-group" style={{ margin: "0 6px" }}>
            <button
              className={`jantt-scale-btn ${activeView === "gantt" ? "is-active" : ""}`}
              onClick={() => setActiveView("gantt")}
              title="Gantt Timeline Schedule"
            >
              <Layers size={13} />
              <span>Gantt</span>
            </button>
            <button
              className={`jantt-scale-btn ${activeView === "kanban" ? "is-active" : ""}`}
              onClick={() => setActiveView("kanban")}
              title="Kanban Task Board"
            >
              <Kanban size={13} />
              <span>Kanban</span>
            </button>
            <button
              className={`jantt-scale-btn ${activeView === "summary" ? "is-active" : ""}`}
              onClick={() => setActiveView("summary")}
              title="Project Budget & Performance Analytics"
            >
              <PieChart size={13} />
              <span>Budget & KPI</span>
            </button>
          </div>

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
              value={selectedThemeId}
              onChange={(e) => setSelectedThemeId(e.target.value)}
            >
              {AVAILABLE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt AI Button */}
          <button
            className="btn-prompt"
            onClick={() => setShowPromptModal(true)}
            title="Generate AI Prompt for LLM output"
          >
            <Sparkles size={14} />
            <span>AI Prompt</span>
          </button>

          {/* Download JSON Button */}
          <button className="btn-nav" onClick={handleDownloadJson} title="Download Jantt JSON file">
            <Download size={14} />
            <span>JSON</span>
          </button>

          {/* Export CSV Button */}
          <button className="btn-nav" onClick={handleExportCsv} title="Export RFC-4180 CSV / Excel spreadsheet">
            <FileSpreadsheet size={14} />
            <span>CSV</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="workspace-main">
        {/* Left Pane: Collapsible JSON Editor */}
        <section
          id="editor-pane"
          className={`editor-pane ${isSidebarCollapsed ? "is-collapsed" : ""}`}
          style={isSidebarCollapsed ? undefined : { width: `${sidebarWidth}px`, flexShrink: 0 }}
        >
          <div className="pane-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileJson size={15} />
              <span>JSON State (Source of Truth)</span>
              {isLiveSyncing && (
                <span className="sync-pulse-badge">
                  <Zap size={11} />
                  <span>Live Synced</span>
                </span>
              )}
            </div>
            <div className="pane-actions">
              <button className="btn-nav" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={formatJson} title="Format JSON">
                Format
              </button>
              <button className="btn-nav" style={{ padding: "3px 8px", fontSize: "11px" }} onClick={handleCopyJson} title="Copy JSON">
                {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                {copiedJson ? "Copied" : "Copy"}
              </button>
              <button
                className="btn-nav"
                style={{ padding: "3px 6px", fontSize: "11px" }}
                onClick={() => setIsSidebarCollapsed(true)}
                title="Collapse JSON Sidebar"
              >
                <ChevronLeft size={13} />
              </button>
            </div>
          </div>

          <div className={`editor-wrapper ${isLiveSyncing ? "is-live-updating" : ""}`}>
            <textarea
              id="json-editor-textarea"
              className={`code-textarea ${isLiveSyncing ? "is-live-glowing" : ""}`}
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
                {validationResult.errors.map((err, idx) => (
                  <div key={idx} className="error-card">
                    <div className="error-msg">
                      <strong>{err.path}:</strong> {err.message}
                    </div>
                    {err.suggestion && <div className="error-suggestion">💡 {err.suggestion}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Draggable Splitter Divider */}
        {!isSidebarCollapsed && (
          <div
            className={`workspace-splitter ${isResizing ? "is-resizing" : ""}`}
            onPointerDown={startResizing}
            title="Drag left/right to adjust JSON sidebar width"
          >
            <div className="splitter-handle" />
          </div>
        )}

        {/* Right Pane: Live Full-Space Chart / Kanban / Analytics Render */}
        <section className="chart-pane">
          <div className="chart-container-card">
            {parsedData ? (
              activeView === "gantt" ? (
                <Jantt
                  data={parsedData}
                  onCommit={handleChartCommit}
                  onViewportChange={(vp) => {
                    if (vp.scale) setCurrentScale(vp.scale);
                    if (vp.linkRouting) setLinkRouting(vp.linkRouting);
                    if (vp.showCriticalPath !== undefined) setShowCriticalPath(vp.showCriticalPath);
                    if (vp.showBaselines !== undefined) setShowBaselines(vp.showBaselines);
                  }}
                  viewport={{
                    scale: currentScale,
                    linkRouting,
                    showCriticalPath,
                    showBaselines
                  }}
                  theme={activeTheme.vars}
                  themeClassName={activeTheme.className}
                />
              ) : activeView === "kanban" ? (
                <div className="kanban-view-container">
                  {(
                    [
                      { id: "not-started", label: "To Do / Not Started" },
                      { id: "in-progress", label: "In Progress" },
                      { id: "submitted", label: "In Review / Submitted" },
                      { id: "completed", label: "Completed" }
                    ] as const
                  ).map((col) => {
                    const colTasks = parsedData.tasks.filter((t) => {
                      if (col.id === "not-started") return !t.status || t.status === "not-started";
                      return t.status === col.id;
                    });
                    return (
                      <div key={col.id} className="kanban-column">
                        <div className="kanban-col-header">
                          <span className="kanban-col-title">{col.label}</span>
                          <span className="kanban-col-count">{colTasks.length}</span>
                        </div>
                        <div className="kanban-card-list">
                          {colTasks.map((t) => {
                            const cat = parsedData.categories?.[t.category];
                            const catColor = cat?.color || "var(--jantt-accent)";
                            return (
                              <div key={t.id} className="kanban-card">
                                <div className="kanban-card-top">
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className="kanban-cat-dot" style={{ background: catColor }} />
                                    <span className="kanban-cat-label">{cat?.label || t.category}</span>
                                  </div>
                                  {t.priority && (
                                    <span className={`kanban-prio-badge is-${t.priority}`}>
                                      {t.priority}
                                    </span>
                                  )}
                                </div>
                                <h4 className="kanban-card-title">{t.label || t.name || t.id}</h4>
                                <div className="kanban-card-meta">
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Calendar size={11} />
                                    <span>{t.start} → {t.end}</span>
                                  </div>
                                  {t.assignee && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <User size={11} />
                                      <span>{t.assignee}</span>
                                    </div>
                                  )}
                                </div>
                                {t.progress !== undefined && t.progress !== null && (
                                  <div className="kanban-card-prog-wrap">
                                    <div className="kanban-card-prog-bar" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                                  </div>
                                )}
                                <div className="kanban-card-footer">
                                  <select
                                    className="kanban-status-select"
                                    value={t.status || "not-started"}
                                    onChange={(e) => {
                                      const updatedTasks = parsedData.tasks.map((item) =>
                                        item.id === t.id ? { ...item, status: e.target.value } : item
                                      );
                                      handleChartCommit({ ...parsedData, tasks: updatedTasks });
                                    }}
                                  >
                                    <option value="not-started">Move to: To Do</option>
                                    <option value="in-progress">Move to: In Progress</option>
                                    <option value="submitted">Move to: In Review</option>
                                    <option value="completed">Move to: Completed</option>
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="summary-view-container">
                  <div className="summary-kpi-grid">
                    <div className="summary-kpi-card">
                      <div className="kpi-icon-wrap" style={{ color: "var(--jantt-accent)" }}>
                        <DollarSign size={20} />
                      </div>
                      <div className="kpi-data">
                        <span className="kpi-label">Total Estimated Budget</span>
                        <span className="kpi-value">
                          ${parsedData.tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="summary-kpi-card">
                      <div className="kpi-icon-wrap" style={{ color: "#10B981" }}>
                        <TrendingUp size={20} />
                      </div>
                      <div className="kpi-data">
                        <span className="kpi-label">Project Progress</span>
                        <span className="kpi-value">
                          {Math.round(
                            (parsedData.tasks.reduce((sum, t) => sum + (t.progress || 0), 0) /
                              Math.max(parsedData.tasks.length, 1)) *
                              100
                          )}%
                        </span>
                      </div>
                    </div>

                    <div className="summary-kpi-card">
                      <div className="kpi-icon-wrap" style={{ color: "var(--jantt-today)" }}>
                        <Zap size={20} />
                      </div>
                      <div className="kpi-data">
                        <span className="kpi-label">Total Active Tasks</span>
                        <span className="kpi-value">{parsedData.tasks.length}</span>
                      </div>
                    </div>

                    <div className="summary-kpi-card">
                      <div className="kpi-icon-wrap" style={{ color: "var(--jantt-critical)" }}>
                        <Clock size={20} />
                      </div>
                      <div className="kpi-data">
                        <span className="kpi-label">Milestones Tracked</span>
                        <span className="kpi-value">{parsedData.tasks.filter((t) => t.milestone).length}</span>
                      </div>
                    </div>
                  </div>

                  <div className="summary-breakdown-card">
                    <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>
                      Work Breakdown & Category Distribution
                    </h3>
                    <table className="summary-table">
                      <thead>
                        <tr>
                          <th>WBS</th>
                          <th>Task Name</th>
                          <th>Category</th>
                          <th>Assignee</th>
                          <th>Dates</th>
                          <th>Budget ($)</th>
                          <th>Status</th>
                          <th>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.tasks.map((t) => {
                          const cat = parsedData.categories?.[t.category];
                          return (
                            <tr key={t.id}>
                              <td style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 700 }}>{t.wbs || "-"}</td>
                              <td style={{ fontWeight: 600 }}>{t.label || t.name || t.id}</td>
                              <td>
                                <span className="jantt-label-dot" style={{ background: cat?.color || "var(--jantt-accent)", display: "inline-block", marginRight: "6px" }} />
                                {cat?.label || t.category}
                              </td>
                              <td>{t.assignee || "-"}</td>
                              <td style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }}>{t.start} → {t.end}</td>
                              <td style={{ fontFamily: "var(--jantt-font-mono)" }}>
                                {t.estimatedCost ? `$${t.estimatedCost.toLocaleString()}` : "-"}
                              </td>
                              <td>
                                <span className={`kanban-prio-badge is-${t.status || "not-started"}`}>
                                  {t.status || "not-started"}
                                </span>
                              </td>
                              <td>{t.progress !== undefined && t.progress !== null ? `${Math.round(t.progress * 100)}%` : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  minHeight: "350px",
                  gap: "12px",
                  color: "var(--jantt-text-muted)"
                }}
              >
                <AlertTriangle size={36} color="#F43F5E" />
                <h3 style={{ color: "var(--jantt-text)" }}>Cannot render Gantt chart</h3>
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
