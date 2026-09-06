import React from "react";
import { FolderPlus, X, FilePlus, Zap, Copy, Plus } from "lucide-react";

interface AddPlanModalProps {
  showAddPlanModal: boolean;
  setShowAddPlanModal: (show: boolean) => void;
  newPlanTitle: string;
  setNewPlanTitle: (title: string) => void;
  newPlanTemplateType: "blank" | "master" | "clone";
  setNewPlanTemplateType: (type: "blank" | "master" | "clone") => void;
  handleCreateNewPlan: () => void;
}

export const AddPlanModal: React.FC<AddPlanModalProps> = ({
  showAddPlanModal,
  setShowAddPlanModal,
  newPlanTitle,
  setNewPlanTitle,
  newPlanTemplateType,
  setNewPlanTemplateType,
  handleCreateNewPlan
}) => {
  if (!showAddPlanModal) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowAddPlanModal(false)}>
      <div className="prompt-modal-card" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FolderPlus size={18} color="var(--jantt-accent)" />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
              Add New Plan / Template
            </h3>
          </div>
          <button
            className="prompt-modal-close-btn"
            onClick={() => setShowAddPlanModal(false)}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="prompt-modal-body" style={{ gap: "16px", padding: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px", color: "var(--jantt-text-muted)" }}>
              Plan Name / Title
            </label>
            <input
              type="text"
              className="code-textarea"
              style={{
                width: "100%",
                height: "40px",
                padding: "8px 12px",
                fontSize: "13px",
                fontFamily: "var(--jantt-font-sans)",
                borderRadius: "8px",
                border: "1px solid var(--jantt-border)",
                boxSizing: "border-box"
              }}
              value={newPlanTitle}
              onChange={(e) => setNewPlanTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateNewPlan();
              }}
              placeholder="e.g. Q4 Software Release Roadmap"
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
              Starting Template Structure:
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: newPlanTemplateType === "blank" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                  background: newPlanTemplateType === "blank" ? "var(--jantt-surface-hover)" : "var(--jantt-surface)",
                  cursor: "pointer"
                }}
              >
                <input
                  type="radio"
                  name="planTemplate"
                  checked={newPlanTemplateType === "blank"}
                  onChange={() => setNewPlanTemplateType("blank")}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                    <FilePlus size={15} color="var(--jantt-accent)" />
                    Blank Plan (Clean Slate)
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                    Starts fresh with a minimal template: 1 sample task and category.
                  </span>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: newPlanTemplateType === "master" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                  background: newPlanTemplateType === "master" ? "var(--jantt-surface-hover)" : "var(--jantt-surface)",
                  cursor: "pointer"
                }}
              >
                <input
                  type="radio"
                  name="planTemplate"
                  checked={newPlanTemplateType === "master"}
                  onChange={() => setNewPlanTemplateType("master")}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                    <Zap size={15} color="var(--jantt-accent)" />
                    Master Benchmark Cheatsheet (Full Kitchen-Sink)
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                    The benchmark specification with categories, milestones, multi-dependencies, baselines, and custom fields.
                  </span>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: newPlanTemplateType === "clone" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                  background: newPlanTemplateType === "clone" ? "var(--jantt-surface-hover)" : "var(--jantt-surface)",
                  cursor: "pointer"
                }}
              >
                <input
                  type="radio"
                  name="planTemplate"
                  checked={newPlanTemplateType === "clone"}
                  onChange={() => setNewPlanTemplateType("clone")}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                    <Copy size={15} color="var(--jantt-accent)" />
                    Duplicate Current Schedule
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                    Clones all current tasks, categories, and links into a new separate plan.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="prompt-modal-footer">
          <button className="btn-nav" onClick={() => setShowAddPlanModal(false)}>
            Cancel
          </button>
          <button
            className="btn-nav btn-nav-primary"
            onClick={handleCreateNewPlan}
            disabled={!newPlanTitle.trim()}
          >
            <Plus size={14} />
            <span>Create &amp; Save Plan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
