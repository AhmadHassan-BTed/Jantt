import React, { useMemo, useState, useEffect } from "react";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";
import { ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Lightbulb, CalendarX } from "lucide-react";
import type { ScheduleHealthIssue, ScheduleHealthReport } from "@jantt/core";

interface ScheduleHealthCardProps {
  audit: ScheduleHealthReport;
  /** Whether the plan defines `meta.targetDate`; without one, negative float cannot occur. */
  hasTargetDate?: boolean;
}

/** Issues rendered per group before "Show more", so large plans stay responsive. */
const ISSUES_PAGE_SIZE = 50;

/** Group headings; an issue type without one (added by a newer core) falls back to its id. */
const ISSUE_GROUP_LABELS: Partial<Record<ScheduleHealthIssue["type"], string>> = {
  "negative-float": "Tasks finishing after the target date",
  "missing-logic": "Tasks without predecessors or successors",
  "missing-predecessor": "Tasks without predecessors",
  "missing-successor": "Tasks without successors",
  "broken-chain": "Broken dependency chains",
  "out-of-sequence": "Out-of-sequence progress",
  "high-float": "Tasks with unusually high float",
  "high-duration": "Tasks with unusually long durations",
  lead: "Links with leads (negative lag)",
  lag: "Links with lags",
  "relationship-type": "Non finish-to-start links",
  "hard-constraint": "Hard-constrained (locked) tasks"
};

const SEVERITY_RANK: Record<ScheduleHealthIssue["severity"], number> = { high: 0, medium: 1, low: 2 };

const formatPercent = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

export const ScheduleHealthCard: React.FC<ScheduleHealthCardProps> = ({ audit, hasTargetDate = false }) => {
  const [expanded, setExpanded] = useState<boolean>(() => {
    const saved = storageService.getItem<{ healthExpanded?: boolean }>(STORAGE_KEYS.SUMMARY_VIEW_STATE);
    return Boolean(saved?.healthExpanded);
  });
  useEffect(() => {
    const prev = storageService.getItem<Record<string, unknown>>(STORAGE_KEYS.SUMMARY_VIEW_STATE) || {};
    storageService.setItem(STORAGE_KEYS.SUMMARY_VIEW_STATE, { ...prev, healthExpanded: expanded });
  }, [expanded]);
  const [visibleByGroup, setVisibleByGroup] = useState<Record<string, number>>({});
  const [expandedDiagnosticKeys, setExpandedDiagnosticKeys] = useState<Set<string>>(() => new Set(["target"]));
  const toggleDiagnosticKey = (key: string) => {
    setExpandedDiagnosticKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const panelId = "schedule-health-issues";

  const gradeColors: Record<string, string> = {
    A: "var(--jantt-status-good)",
    B: "var(--jantt-status-info)",
    C: "var(--jantt-status-warn)",
    D: "var(--jantt-status-warn)",
    F: "var(--jantt-status-bad)"
  };

  const badgeColor = gradeColors[audit.grade] || "var(--jantt-status-good)";
  const checks = Array.isArray(audit.checks) ? audit.checks : [];
  const passedChecks = checks.filter((c) => c.passed).length;

  const groups = useMemo(() => {
    const byType = new Map<string, ScheduleHealthIssue[]>();
    for (const issue of audit.issues) {
      const list = byType.get(issue.type);
      if (list) list.push(issue);
      else byType.set(issue.type, [issue]);
    }
    // A loop, not Math.min(...list): spreading one argument per issue overflows the stack on huge plans.
    const worst = (list: ScheduleHealthIssue[]) =>
      list.reduce((min, i) => Math.min(min, SEVERITY_RANK[i.severity] ?? 2), 2);
    return Array.from(byType.entries())
      .map(([type, issues]) => ({ type, issues }))
      .sort((a, b) => worst(a.issues) - worst(b.issues));
  }, [audit.issues]);

  const negativeFloatSummary = !hasTargetDate
    ? { ok: true, neutral: true, text: "No target date set" }
    : audit.negativeFloatCount === 0
    ? { ok: true, neutral: false, text: "On track for target date" }
    : { ok: false, neutral: false, text: `${audit.negativeFloatCount} task(s) finish after target` };

  return (
    <div className="summary-breakdown-card" style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: `color-mix(in srgb, ${badgeColor} 10%, transparent)`,
              color: badgeColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "16px"
            }}
            role="img"
            aria-label={`Grade ${audit.grade}`}
          >
            {audit.grade}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Schedule Health (selected DCMA checks)
              </span>
              <span
                title="Health score: 100 minus the points deducted by each failing check (see the score breakdown). Checks are DCMA-inspired; status-date, resource and baseline checks are not assessed."
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: `color-mix(in srgb, ${badgeColor} 13%, transparent)`,
                  color: badgeColor,
                  border: `1px solid color-mix(in srgb, ${badgeColor} 25%, transparent)`
                }}
              >
                {audit.healthScore}/100 health score
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              {audit.summary}
            </div>
          </div>
        </div>

        {audit.issues.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls={panelId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "6px",
              background: "var(--jantt-surface)",
              border: "1px solid var(--jantt-border)",
              color: "var(--jantt-text)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            <span>{audit.issues.length} {audit.issues.length === 1 ? "Issue" : "Issues"} Detected</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Diagnostic Audits - Compact Expandable List */}
      <div className="kpi-accordion-list" role="region" aria-label="Diagnostic Checks" style={{ marginTop: "12px" }}>
        {/* Audit 1: Target Date Integrity */}
        <div className={`kpi-accordion-item ${expandedDiagnosticKeys.has("target") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleDiagnosticKey("target")}
            aria-expanded={expandedDiagnosticKeys.has("target")}
          >
            <div className="kpi-accordion-lead">
              <div
                className="kpi-accordion-icon"
                style={{
                  background: negativeFloatSummary.neutral
                    ? "color-mix(in srgb, #94A3B8 15%, transparent)"
                    : negativeFloatSummary.ok
                    ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)"
                    : "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)",
                  color: negativeFloatSummary.neutral ? "#94A3B8" : negativeFloatSummary.ok ? "var(--jantt-status-good)" : "var(--jantt-status-bad)"
                }}
              >
                {negativeFloatSummary.neutral ? (
                  <CalendarX size={16} />
                ) : negativeFloatSummary.ok ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Target Date Integrity</span>
                <span className="kpi-accordion-subtitle" title="Negative float: a task can only meet the target date if it finishes earlier than currently planned.">
                  {negativeFloatSummary.text}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span
                className="kpi-accordion-badge"
                style={{
                  background: negativeFloatSummary.neutral
                    ? "color-mix(in srgb, #94A3B8 15%, transparent)"
                    : negativeFloatSummary.ok
                    ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)"
                    : "color-mix(in srgb, var(--jantt-status-bad) 15%, transparent)",
                  color: negativeFloatSummary.neutral ? "#94A3B8" : negativeFloatSummary.ok ? "var(--jantt-status-good)" : "var(--jantt-status-bad)"
                }}
              >
                {negativeFloatSummary.neutral ? "No Target" : negativeFloatSummary.ok ? "Passed" : `${audit.negativeFloatCount} Overdue`}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedDiagnosticKeys.has("target") && (
            <div className="kpi-accordion-body">
              <div><strong>Status:</strong> {negativeFloatSummary.text}</div>
              <div style={{ color: "var(--jantt-text-muted)" }}>
                Negative float occurs when the forecast finish date of any task on the critical path falls after the project target date specified in plan settings.
              </div>
            </div>
          )}
        </div>

        {/* Audit 2: Logic Completeness */}
        <div className={`kpi-accordion-item ${expandedDiagnosticKeys.has("logic") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleDiagnosticKey("logic")}
            aria-expanded={expandedDiagnosticKeys.has("logic")}
          >
            <div className="kpi-accordion-lead">
              <div
                className="kpi-accordion-icon"
                style={{
                  background: audit.missingLogicCount === 0
                    ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)"
                    : "color-mix(in srgb, var(--jantt-status-warn) 15%, transparent)",
                  color: audit.missingLogicCount === 0 ? "var(--jantt-status-good)" : "var(--jantt-status-warn)"
                }}
              >
                {audit.missingLogicCount === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Dependency Logic Completeness</span>
                <span className="kpi-accordion-subtitle">
                  {audit.missingLogicCount === 0 ? "All open tasks connected" : `${audit.missingLogicCount} task(s) unlinked`}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span
                className="kpi-accordion-badge"
                style={{
                  background: audit.missingLogicCount === 0
                    ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)"
                    : "color-mix(in srgb, var(--jantt-status-warn) 15%, transparent)",
                  color: audit.missingLogicCount === 0 ? "var(--jantt-status-good)" : "var(--jantt-status-warn)"
                }}
              >
                {audit.missingLogicCount === 0 ? "100% Linked" : `${audit.missingLogicCount} Unlinked`}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedDiagnosticKeys.has("logic") && (
            <div className="kpi-accordion-body">
              <div><strong>Unlinked Tasks:</strong> {audit.missingLogicCount}</div>
              <div style={{ color: "var(--jantt-text-muted)" }}>
                Tasks without predecessors or successors float independently and will not automatically shift when linked work changes. Link tasks together to preserve schedule integrity.
              </div>
            </div>
          )}
        </div>

        {/* Audit 3: Float Distribution */}
        <div className={`kpi-accordion-item ${expandedDiagnosticKeys.has("float") ? "is-expanded" : ""}`}>
          <button
            type="button"
            className="kpi-accordion-header"
            onClick={() => toggleDiagnosticKey("float")}
            aria-expanded={expandedDiagnosticKeys.has("float")}
          >
            <div className="kpi-accordion-lead">
              <div
                className="kpi-accordion-icon"
                style={{
                  background: audit.highFloatCount === 0
                    ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)"
                    : "color-mix(in srgb, var(--jantt-status-info) 15%, transparent)",
                  color: audit.highFloatCount === 0 ? "var(--jantt-status-good)" : "var(--jantt-status-info)"
                }}
              >
                {audit.highFloatCount === 0 ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
              </div>
              <div className="kpi-accordion-title-wrap">
                <span className="kpi-accordion-title">Float &amp; Buffer Distribution</span>
                <span className="kpi-accordion-subtitle">
                  {audit.highFloatCount === 0 ? "Optimal buffer slack" : `${audit.highFloatCount} task(s) with >44 working days slack`}
                </span>
              </div>
            </div>
            <div className="kpi-accordion-trailing">
              <span
                className="kpi-accordion-badge"
                style={{
                  background: audit.highFloatCount === 0
                    ? "color-mix(in srgb, var(--jantt-status-good) 15%, transparent)"
                    : "color-mix(in srgb, var(--jantt-status-info) 15%, transparent)",
                  color: audit.highFloatCount === 0 ? "var(--jantt-status-good)" : "var(--jantt-status-info)"
                }}
              >
                {audit.highFloatCount === 0 ? "Optimal" : `${audit.highFloatCount} High Slack`}
              </span>
              <ChevronDown size={14} className="kpi-accordion-chevron" />
            </div>
          </button>
          {expandedDiagnosticKeys.has("float") && (
            <div className="kpi-accordion-body">
              <div><strong>High Float Tasks:</strong> {audit.highFloatCount}</div>
              <div style={{ color: "var(--jantt-text-muted)" }}>
                High float (more than 44 working days of slack) often suggests an incomplete downstream dependency network or artificial fixed constraints.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Score breakdown: every check with its population, threshold and deduction */}
      {checks.length > 0 && (
        <details style={{ marginTop: "12px", fontSize: "12px", color: "var(--jantt-text)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--jantt-text-muted)" }}>
            Score breakdown: {passedChecks} of {checks.length} checks pass
          </summary>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px", fontSize: "11.5px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--jantt-text-muted)" }}>
                <th scope="col" style={{ padding: "4px 6px", fontWeight: 600 }}>Check</th>
                <th scope="col" style={{ padding: "4px 6px", fontWeight: 600 }}>Failed</th>
                <th scope="col" style={{ padding: "4px 6px", fontWeight: 600 }}>Limit</th>
                <th scope="col" style={{ padding: "4px 6px", fontWeight: 600 }}>Deduction</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id} style={{ borderTop: "1px solid var(--jantt-border)" }}>
                  <td style={{ padding: "4px 6px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {check.passed ? (
                        <CheckCircle2 size={13} color="var(--jantt-status-good)" role="img" aria-label="Pass" />
                      ) : (
                        <AlertTriangle size={13} color="var(--jantt-status-warn)" role="img" aria-label="Fail" />
                      )}
                      <span>
                        {check.dcmaCheck !== undefined && <span style={{ color: "var(--jantt-text-muted)" }}>#{check.dcmaCheck} </span>}
                        {check.label}
                      </span>
                    </span>
                  </td>
                  <td style={{ padding: "4px 6px", fontFamily: "var(--jantt-font-mono)" }}>
                    {check.eligible === 0 ? "n/a" : `${check.failed} of ${check.eligible} (${formatPercent(check.ratio)})`}
                  </td>
                  <td style={{ padding: "4px 6px", fontFamily: "var(--jantt-font-mono)" }}>
                    {check.threshold === 0 ? "none" : `≤ ${formatPercent(check.threshold)}`}
                  </td>
                  <td style={{ padding: "4px 6px", fontFamily: "var(--jantt-font-mono)", color: check.penalty > 0 ? "var(--jantt-status-bad)" : "var(--jantt-text-muted)" }}>
                    {check.penalty > 0 ? `−${Math.round(check.penalty * 10) / 10}` : "0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* Expandable Issues Drawer, grouped by issue type */}
      {expanded && audit.issues.length > 0 && (
        <div id={panelId} style={{ marginTop: "14px", borderTop: "1px solid var(--jantt-border)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {groups.map(({ type, issues }) => {
            const visible = visibleByGroup[type] ?? ISSUES_PAGE_SIZE;
            return (
              <section key={type} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <h5 style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "var(--jantt-text)" }}>
                  {ISSUE_GROUP_LABELS[type as ScheduleHealthIssue["type"]] || type} ({issues.length})
                </h5>
                {issues.slice(0, visible).map((issue, idx) => (
                  <div
                    key={`${issue.taskId ?? "plan"}-${idx}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "6px",
                      background: issue.severity === "high" ? "#EF444410" : issue.severity === "medium" ? "#F59E0B10" : "var(--jantt-surface)",
                      border: `1px solid ${issue.severity === "high" ? "#EF444430" : issue.severity === "medium" ? "#F59E0B30" : "var(--jantt-border)"}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {issue.severity === "high" ? <AlertCircle size={14} color="var(--jantt-status-bad)" /> : <AlertTriangle size={14} color="var(--jantt-status-warn)" />}
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--jantt-text)" }}>
                        {issue.message}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginLeft: "20px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Lightbulb size={12} style={{ color: "var(--jantt-accent)" }} />
                      <span><strong>Action:</strong> {issue.recommendation}</span>
                    </div>
                  </div>
                ))}
                {issues.length > visible && (
                  <button
                    type="button"
                    onClick={() => setVisibleByGroup((prev) => ({ ...prev, [type]: visible + ISSUES_PAGE_SIZE }))}
                    style={{
                      alignSelf: "flex-start",
                      background: "none",
                      border: "1px solid var(--jantt-border)",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--jantt-accent)",
                      cursor: "pointer"
                    }}
                  >
                    Show {Math.min(ISSUES_PAGE_SIZE, issues.length - visible)} more ({issues.length - visible} hidden)
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
