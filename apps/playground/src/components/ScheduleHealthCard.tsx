import React, { useState } from "react";
import { ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import type { ScheduleHealthResult } from "@jantt/core";

interface ScheduleHealthCardProps {
  audit: ScheduleHealthResult;
}

export const ScheduleHealthCard: React.FC<ScheduleHealthCardProps> = ({ audit }) => {
  const [expanded, setExpanded] = useState(false);

  const gradeColors: Record<string, string> = {
    A: "#10B981",
    B: "#3B82F6",
    C: "#F59E0B",
    D: "#F97316",
    F: "#EF4444"
  };

  const badgeColor = gradeColors[audit.grade] || "#10B981";

  return (
    <div className="summary-breakdown-card" style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: `${badgeColor}1A`,
              color: badgeColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "16px"
            }}
          >
            {audit.grade}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Schedule Health &amp; Integrity Audit
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: `${badgeColor}20`,
                  color: badgeColor,
                  border: `1px solid ${badgeColor}40`
                }}
              >
                {audit.healthScore}/100 Health Score
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              {audit.summary}
            </div>
          </div>
        </div>

        {audit.issues.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
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

      {/* Quick Diagnostic Badges */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginTop: "12px" }}>
        <div style={{ padding: "8px 12px", borderRadius: "6px", background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", display: "flex", alignItems: "center", gap: "8px" }}>
          {audit.negativeFloatCount === 0 ? <CheckCircle2 size={16} color="#10B981" /> : <AlertCircle size={16} color="#EF4444" />}
          <div>
            <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>Negative Float</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: audit.negativeFloatCount === 0 ? "var(--jantt-text)" : "#EF4444" }}>
              {audit.negativeFloatCount === 0 ? "Zero (Deadlines Met)" : `${audit.negativeFloatCount} Task(s) Overdue`}
            </div>
          </div>
        </div>

        <div style={{ padding: "8px 12px", borderRadius: "6px", background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", display: "flex", alignItems: "center", gap: "8px" }}>
          {audit.missingLogicCount === 0 ? <CheckCircle2 size={16} color="#10B981" /> : <AlertTriangle size={16} color="#F59E0B" />}
          <div>
            <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>Logic Completeness</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: audit.missingLogicCount === 0 ? "var(--jantt-text)" : "#F59E0B" }}>
              {audit.missingLogicCount === 0 ? "100% Connected" : `${audit.missingLogicCount} Task(s) Unlinked`}
            </div>
          </div>
        </div>

        <div style={{ padding: "8px 12px", borderRadius: "6px", background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", display: "flex", alignItems: "center", gap: "8px" }}>
          {audit.highFloatCount === 0 ? <CheckCircle2 size={16} color="#10B981" /> : <ShieldCheck size={16} color="#3B82F6" />}
          <div>
            <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>Float Distribution</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--jantt-text)" }}>
              {audit.highFloatCount === 0 ? "Optimal Buffers" : `${audit.highFloatCount} High Float (>44d)`}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Issues Drawer */}
      {expanded && audit.issues.length > 0 && (
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--jantt-border)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {audit.issues.map((issue, idx) => (
            <div
              key={idx}
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
                {issue.severity === "high" ? <AlertCircle size={14} color="#EF4444" /> : <AlertTriangle size={14} color="#F59E0B" />}
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
        </div>
      )}
    </div>
  );
};
