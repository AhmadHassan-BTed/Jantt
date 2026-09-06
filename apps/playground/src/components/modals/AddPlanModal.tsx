import React, { useState } from "react";
import {
  FolderPlus,
  X,
  FilePlus,
  Zap,
  Copy,
  Plus,
  HardDrive,
  Cloud,
  Building2,
  ShieldCheck,
  Github
} from "lucide-react";
import type { UserRoomPointer } from "../../firebase/types";

export type PlanDestination = "local" | "new_room" | "existing_room";

interface AddPlanModalProps {
  showAddPlanModal: boolean;
  setShowAddPlanModal: (show: boolean) => void;
  newPlanTitle: string;
  setNewPlanTitle: (title: string) => void;
  newPlanTemplateType: "blank" | "master" | "clone";
  setNewPlanTemplateType: (type: "blank" | "master" | "clone") => void;
  handleCreateNewPlan: (
    title?: string,
    templateType?: "blank" | "master" | "clone",
    destination?: PlanDestination,
    targetRoomId?: string
  ) => void;
  ownedRooms?: UserRoomPointer[];
  sharedRooms?: UserRoomPointer[];
  isLoggedIn?: boolean;
  isGitHubVerified?: boolean;
  onLogin?: () => void;
  onRequireVerification?: () => void;
}

export const AddPlanModal: React.FC<AddPlanModalProps> = ({
  showAddPlanModal,
  setShowAddPlanModal,
  newPlanTitle,
  setNewPlanTitle,
  newPlanTemplateType,
  setNewPlanTemplateType,
  handleCreateNewPlan,
  ownedRooms = [],
  sharedRooms = [],
  isLoggedIn = false,
  isGitHubVerified = false,
  onLogin,
  onRequireVerification
}) => {
  const [destination, setDestination] = useState<PlanDestination>("local");
  const [targetRoomId, setTargetRoomId] = useState<string>("");

  if (!showAddPlanModal) return null;

  // Filter existing rooms the user has write/edit permissions for
  const editableRooms = [
    ...ownedRooms.map((r) => ({ ...r, label: `${r.title} (Owner • ${r.roomId})` })),
    ...sharedRooms
      .filter((r) => r.role === "editor")
      .map((r) => ({ ...r, label: `${r.title} (Editor • @${r.ownerUsername})` }))
  ];

  const selectedTargetRoom = targetRoomId || editableRooms[0]?.roomId || "";

  const handleSubmit = () => {
    if (!newPlanTitle.trim()) return;
    if (destination === "new_room" && !isLoggedIn && onLogin) {
      onLogin();
      return;
    }
    if (destination === "new_room" && !isGitHubVerified && onRequireVerification) {
      onRequireVerification();
      return;
    }
    handleCreateNewPlan(newPlanTitle.trim(), newPlanTemplateType, destination, selectedTargetRoom);
  };

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowAddPlanModal(false)}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "560px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--jantt-accent-glow, rgba(56, 189, 248, 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--jantt-accent, #38BDF8)"
              }}
            >
              <FolderPlus size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Add New Plan / Template
              </h3>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                Choose plan destination, template layout, and title
              </p>
            </div>
          </div>
          <button
            className="prompt-modal-close-btn"
            onClick={() => setShowAddPlanModal(false)}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="prompt-modal-body" style={{ gap: "16px", padding: "18px 20px" }}>
          {/* Plan Title Input */}
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
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="e.g. Q4 Software Release Roadmap"
              autoFocus
            />
          </div>

          {/* Plan Destination Selector */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
              Destination &amp; Storage:
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Option 1: Local Offline Storage */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: destination === "local" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                  background: destination === "local" ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.08))" : "var(--jantt-surface, rgba(15, 23, 42, 0.6))",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <input
                  type="radio"
                  name="planDestination"
                  checked={destination === "local"}
                  onChange={() => setDestination("local")}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                      <HardDrive size={15} color="var(--jantt-accent)" />
                      Local Offline Storage
                    </strong>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(100, 116, 139, 0.2)",
                        color: "var(--jantt-text-muted)"
                      }}
                    >
                      Private &amp; Offline
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)", lineHeight: 1.4 }}>
                    Saved in browser localStorage. No internet needed, private to this machine.
                  </span>
                </div>
              </label>

              {/* Option 2: New Cloud Room */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: destination === "new_room" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                  background: destination === "new_room" ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.08))" : "var(--jantt-surface, rgba(15, 23, 42, 0.6))",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <input
                  type="radio"
                  name="planDestination"
                  checked={destination === "new_room"}
                  onChange={() => setDestination("new_room")}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                      <Cloud size={15} color="#38BDF8" />
                      New Cloud Room
                    </strong>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(56, 189, 248, 0.2)",
                        color: "var(--jantt-accent, #38BDF8)"
                      }}
                    >
                      Live Real-Time Sync
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)", lineHeight: 1.4 }}>
                    Collaborate with 100+ concurrent users with live presence, instant URL sharing, and cloud backups.
                  </span>
                  {!isLoggedIn && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "6px",
                        fontSize: "11px",
                        color: "#F59E0B"
                      }}
                    >
                      <Github size={12} />
                      <span>Requires GitHub sign-in to create live rooms.</span>
                    </div>
                  )}
                  {isLoggedIn && !isGitHubVerified && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "6px",
                        fontSize: "11px",
                        color: "#F59E0B"
                      }}
                    >
                      <ShieldCheck size={12} />
                      <span>Requires 1-time GitHub follow &amp; star verification.</span>
                    </div>
                  )}
                </div>
              </label>

              {/* Option 3: Existing Cloud Room */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: destination === "existing_room" ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                  background: destination === "existing_room" ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.08))" : "var(--jantt-surface, rgba(15, 23, 42, 0.6))",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <input
                  type="radio"
                  name="planDestination"
                  checked={destination === "existing_room"}
                  onChange={() => setDestination("existing_room")}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                      <Building2 size={15} color="#A78BFA" />
                      Existing Cloud Room
                    </strong>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(167, 139, 250, 0.2)",
                        color: "#A78BFA"
                      }}
                    >
                      Overwrite Room
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)", lineHeight: 1.4 }}>
                    Deploy this template or schedule structure directly into an existing room you edit.
                  </span>

                  {destination === "existing_room" && (
                    <div style={{ marginTop: "10px" }} onClick={(e) => e.stopPropagation()}>
                      {editableRooms.length > 0 ? (
                        <div style={{ position: "relative" }}>
                          <select
                            className="select-input"
                            style={{
                              width: "100%",
                              padding: "7px 10px",
                              fontSize: "12px",
                              borderRadius: "6px",
                              background: "rgba(15, 23, 42, 0.9)",
                              border: "1px solid var(--jantt-border)",
                              color: "var(--jantt-text)"
                            }}
                            value={selectedTargetRoom}
                            onChange={(e) => setTargetRoomId(e.target.value)}
                          >
                            {editableRooms.map((r) => (
                              <option key={r.roomId} value={r.roomId}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#F59E0B", padding: "6px 8px", background: "rgba(245, 158, 11, 0.1)", borderRadius: "6px" }}>
                          No editable rooms found. Select "New Cloud Room" or "Local Offline Storage" instead.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Template Structure Options */}
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
                    Clones all current tasks, categories, and links into the new plan.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="prompt-modal-footer">
          <button className="btn-nav" onClick={() => setShowAddPlanModal(false)}>
            Cancel
          </button>

          {destination === "new_room" && !isLoggedIn ? (
            <button
              className="btn-nav btn-nav-primary"
              onClick={onLogin}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Github size={14} />
              <span>Sign in with GitHub to Create Room</span>
            </button>
          ) : destination === "new_room" && !isGitHubVerified ? (
            <button
              className="btn-nav btn-nav-primary"
              onClick={onRequireVerification}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <ShieldCheck size={14} />
              <span>Verify GitHub to Create Room</span>
            </button>
          ) : (
            <button
              className="btn-nav btn-nav-primary"
              onClick={handleSubmit}
              disabled={!newPlanTitle.trim() || (destination === "existing_room" && editableRooms.length === 0)}
            >
              <Plus size={14} />
              <span>
                {destination === "new_room"
                  ? "Create Cloud Room"
                  : destination === "existing_room"
                  ? "Update Cloud Room"
                  : "Create & Save Plan"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
