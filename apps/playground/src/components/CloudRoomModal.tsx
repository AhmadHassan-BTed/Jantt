import React, { useState, useEffect } from "react";
import {
  Users,
  X,
  Copy,
  Check,
  Key,
  Globe,
  Radio,
  Plus,
  ArrowRight,
  ShieldCheck,
  Loader2,
  Sparkles
} from "lucide-react";
import type { SavedProject, ActiveView } from "../types";
import {
  buildRoomViewerUrl,
  buildRoomCollaboratorUrl,
  getStoredRoomSecret
} from "../room-storage";

interface CloudRoomModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  activeProject?: SavedProject;
  activeView: ActiveView;
  selectedThemeId: string;
  onCreateRoom: (options: { title: string; roomId?: string }) => Promise<void>;
  onJoinRoom: (roomId: string, secretKey?: string) => Promise<void>;
  onUnlockCollaborator: (secretKey: string) => Promise<void>;
  isProcessing: boolean;
  activeRoomId?: string | null;
  activeRoomRole?: "collaborator" | "viewer" | "none";
  activeSecretKey?: string | null;
}

export const CloudRoomModal: React.FC<CloudRoomModalProps> = ({
  showModal,
  setShowModal,
  activeProject,
  activeView,
  selectedThemeId,
  onCreateRoom,
  onJoinRoom,
  onUnlockCollaborator,
  isProcessing,
  activeRoomId,
  activeRoomRole = "none",
  activeSecretKey
}) => {
  const isCurrentlyInRoom = Boolean(activeRoomId && activeProject?.source === "room");

  const [activeTab, setActiveTab] = useState<"current" | "create" | "join">(
    isCurrentlyInRoom ? "current" : "create"
  );

  // Form states
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [joinRoomInput, setJoinRoomInput] = useState("");
  const [joinSecretKey, setJoinSecretKey] = useState("");
  const [unlockKeyInput, setUnlockKeyInput] = useState("");
  const [copiedViewer, setCopiedViewer] = useState(false);
  const [copiedCollaborator, setCopiedCollaborator] = useState(false);
  const [showUnlockInput, setShowUnlockInput] = useState(false);

  useEffect(() => {
    if (showModal) {
      if (isCurrentlyInRoom) {
        setActiveTab("current");
      } else {
        setActiveTab("create");
        setNewRoomTitle(activeProject?.name || "Sprint Collaboration Room");
        setNewRoomSlug("");
      }
      setCopiedViewer(false);
      setCopiedCollaborator(false);
      setShowUnlockInput(false);
      setUnlockKeyInput("");
    }
  }, [showModal, isCurrentlyInRoom, activeProject?.name]);

  if (!showModal) return null;

  const currentSecret =
    activeSecretKey ||
    (activeRoomId ? getStoredRoomSecret(activeRoomId) : null) ||
    activeProject?.secretKey ||
    "";

  const viewerUrl = activeRoomId
    ? buildRoomViewerUrl(activeRoomId, activeView, selectedThemeId)
    : "";
  const collaboratorUrl =
    activeRoomId && currentSecret
      ? buildRoomCollaboratorUrl(activeRoomId, currentSecret, activeView, selectedThemeId)
      : "";

  const handleCopyViewerLink = async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopiedViewer(true);
      setTimeout(() => setCopiedViewer(false), 2500);
    } catch {}
  };

  const handleCopyCollaboratorLink = async () => {
    if (!collaboratorUrl) return;
    try {
      await navigator.clipboard.writeText(collaboratorUrl);
      setCopiedCollaborator(true);
      setTimeout(() => setCopiedCollaborator(false), 2500);
    } catch {}
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim() || isProcessing) return;
    await onCreateRoom({
      title: newRoomTitle.trim(),
      roomId: newRoomSlug.trim() || undefined
    });
    setActiveTab("current");
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomInput.trim() || isProcessing) return;

    let targetRoomId = joinRoomInput.trim();
    let targetSecret = joinSecretKey.trim();

    // Check if user pasted a full room URL
    if (targetRoomId.includes("http://") || targetRoomId.includes("https://")) {
      try {
        const parsed = new URL(targetRoomId);
        const qRoom = parsed.searchParams.get("room") || parsed.searchParams.get("cloud");
        if (qRoom) targetRoomId = qRoom;

        const hash = parsed.hash.replace(/^#/, "");
        const hp = new URLSearchParams(hash);
        const k = hp.get("key") || hp.get("edit");
        if (k && !targetSecret) targetSecret = k;
      } catch {}
    }

    await onJoinRoom(targetRoomId, targetSecret || undefined);
    setShowModal(false);
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockKeyInput.trim() || isProcessing) return;
    await onUnlockCollaborator(unlockKeyInput.trim());
    setShowUnlockInput(false);
  };

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowModal(false)}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "660px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2))",
                color: "var(--jantt-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(56, 189, 248, 0.3)"
              }}
            >
              <Radio size={22} className="spin-slow" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--jantt-text)" }}>
                Collaboration Rooms
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--jantt-muted)" }}>
                High-scale live collaboration engine for 100+ concurrent team members
              </p>
            </div>
          </div>
          <button
            className="prompt-modal-close"
            onClick={() => setShowModal(false)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            padding: "6px",
            margin: "14px 20px 0 20px",
            background: "rgba(15, 23, 42, 0.5)",
            borderRadius: "10px",
            border: "1px solid var(--jantt-border)"
          }}
        >
          {isCurrentlyInRoom && (
            <button
              onClick={() => setActiveTab("current")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                background: activeTab === "current" ? "var(--jantt-accent)" : "transparent",
                color: activeTab === "current" ? "#FFFFFF" : "var(--jantt-muted)",
                transition: "all 0.15s ease"
              }}
            >
              <Users size={15} /> Active Room
            </button>
          )}
          <button
            onClick={() => setActiveTab("create")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: activeTab === "create" ? "var(--jantt-accent)" : "transparent",
              color: activeTab === "create" ? "#FFFFFF" : "var(--jantt-muted)",
              transition: "all 0.15s ease"
            }}
          >
            <Plus size={15} /> New Room
          </button>
          <button
            onClick={() => setActiveTab("join")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: activeTab === "join" ? "var(--jantt-accent)" : "transparent",
              color: activeTab === "join" ? "#FFFFFF" : "var(--jantt-muted)",
              transition: "all 0.15s ease"
            }}
          >
            <ArrowRight size={15} /> Join Room
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: "18px 20px" }}>
          {/* TAB 1: CURRENT ACTIVE ROOM */}
          {activeTab === "current" && isCurrentlyInRoom && (
            <div>
              {/* Room Status Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background:
                    activeRoomRole === "collaborator"
                      ? "rgba(16, 185, 129, 0.1)"
                      : "rgba(56, 189, 248, 0.1)",
                  border:
                    activeRoomRole === "collaborator"
                      ? "1px solid rgba(16, 185, 129, 0.25)"
                      : "1px solid rgba(56, 189, 248, 0.25)",
                  borderRadius: "10px",
                  marginBottom: "16px"
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "var(--jantt-text)"
                      }}
                    >
                      {activeProject?.name || activeRoomId}
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        background:
                          activeRoomRole === "collaborator"
                            ? "rgba(16, 185, 129, 0.2)"
                            : "rgba(56, 189, 248, 0.2)",
                        color:
                          activeRoomRole === "collaborator" ? "#34D399" : "var(--jantt-accent)"
                      }}
                    >
                      {activeRoomRole === "collaborator" ? "Collaborator (Live Sync)" : "Viewer (Read-Only)"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--jantt-muted)", marginTop: "2px" }}>
                    Room ID: <code style={{ color: "var(--jantt-accent)" }}>{activeRoomId}</code>
                  </div>
                </div>

                {activeRoomRole === "viewer" && (
                  <button
                    onClick={() => setShowUnlockInput(!showUnlockInput)}
                    className="btn btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "5px 10px", display: "flex", gap: "5px", alignItems: "center" }}
                  >
                    <Key size={13} /> Unlock Edit Mode
                  </button>
                )}
              </div>

              {/* Unlock Input Drawer */}
              {showUnlockInput && (
                <form
                  onSubmit={handleUnlockSubmit}
                  style={{
                    padding: "12px",
                    background: "rgba(30, 41, 59, 0.7)",
                    borderRadius: "8px",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    marginBottom: "16px",
                    display: "flex",
                    gap: "8px"
                  }}
                >
                  <input
                    type="password"
                    placeholder="Paste Secret Edit Key (sec_...)"
                    value={unlockKeyInput}
                    onChange={(e) => setUnlockKeyInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid var(--jantt-border)",
                      color: "var(--jantt-text)",
                      fontSize: "0.85rem"
                    }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!unlockKeyInput.trim() || isProcessing}
                    style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                  >
                    {isProcessing ? <Loader2 size={14} className="spin" /> : "Unlock"}
                  </button>
                </form>
              )}

              {/* Link Option 1: Collaborator Link */}
              {collaboratorUrl ? (
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    background: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    marginBottom: "12px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Key size={15} style={{ color: "#34D399" }} />
                      <strong style={{ fontSize: "0.88rem", color: "#34D399" }}>
                        Collaborator Link (Edit & Live Sync)
                      </strong>
                    </div>
                    <button
                      onClick={handleCopyCollaboratorLink}
                      className="btn btn-primary"
                      style={{
                        padding: "6px 12px",
                        fontSize: "0.8rem",
                        background: copiedCollaborator ? "#059669" : "var(--jantt-accent)",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px"
                      }}
                    >
                      {copiedCollaborator ? <Check size={14} /> : <Copy size={14} />}
                      {copiedCollaborator ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                  <p style={{ margin: "0 0 8px 0", fontSize: "0.78rem", color: "var(--jantt-muted)" }}>
                    Share with team members who need to edit tasks, drag dates, and auto-sync in real time.
                  </p>
                  <input
                    readOnly
                    value={collaboratorUrl}
                    onFocus={(e) => e.target.select()}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      fontSize: "0.78rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid var(--jantt-border)",
                      color: "var(--jantt-text)",
                      fontFamily: "monospace"
                    }}
                  />
                </div>
              ) : null}

              {/* Link Option 2: Viewer Link */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "10px",
                  background: "rgba(56, 189, 248, 0.05)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  marginBottom: "14px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Globe size={15} style={{ color: "var(--jantt-accent)" }} />
                    <strong style={{ fontSize: "0.88rem", color: "var(--jantt-accent)" }}>
                      Viewer Link (Safe Read-Only Feed)
                    </strong>
                  </div>
                  <button
                    onClick={handleCopyViewerLink}
                    className="btn btn-secondary"
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px"
                    }}
                  >
                    {copiedViewer ? <Check size={14} /> : <Copy size={14} />}
                    {copiedViewer ? "Copied!" : "Copy Link"}
                  </button>
                </div>
                <p style={{ margin: "0 0 8px 0", fontSize: "0.78rem", color: "var(--jantt-muted)" }}>
                  Share with clients, executives, and stakeholders. They can view live updates but cannot modify tasks.
                </p>
                <input
                  readOnly
                  value={viewerUrl}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid var(--jantt-border)",
                    color: "var(--jantt-text)",
                    fontFamily: "monospace"
                  }}
                />
              </div>

              {/* Multi-Collaborator Safety Notice */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "rgba(30, 41, 59, 0.4)",
                  border: "1px solid var(--jantt-border)"
                }}
              >
                <ShieldCheck size={18} style={{ color: "#34D399", flexShrink: 0, marginTop: "2px" }} />
                <div style={{ fontSize: "0.76rem", color: "var(--jantt-muted)", lineHeight: 1.4 }}>
                  <strong style={{ color: "var(--jantt-text)" }}>100+ Collaborator Concurrency Protection:</strong>{" "}
                  Simultaneous edits are automatically synchronized using Jantt's CRDT 3-Way Reconciler. No false
                  overwrites or lost work.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CREATE NEW ROOM */}
          {activeTab === "create" && (
            <form onSubmit={handleCreateSubmit}>
              <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--jantt-muted)" }}>
                Publish your current Gantt plan into a live Cloud Room. You'll instantly receive a team edit link and
                a stakeholder view link.
              </p>

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--jantt-text)"
                  }}
                >
                  Room Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 Platform Migration"
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.7)",
                    border: "1px solid var(--jantt-border)",
                    color: "var(--jantt-text)",
                    fontSize: "0.9rem"
                  }}
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--jantt-text)"
                  }}
                >
                  Custom Room ID <span style={{ color: "var(--jantt-muted)", fontWeight: 400 }}>(Optional)</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="e.g. team-alpha-sprint (leave empty for random ID)"
                    value={newRoomSlug}
                    onChange={(e) => setNewRoomSlug(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "rgba(15, 23, 42, 0.7)",
                      border: "1px solid var(--jantt-border)",
                      color: "var(--jantt-text)",
                      fontSize: "0.85rem"
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "rgba(56, 189, 248, 0.08)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  marginBottom: "20px"
                }}
              >
                <Sparkles size={16} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
                <span style={{ fontSize: "0.78rem", color: "var(--jantt-muted)" }}>
                  Zero logins or sign-ups required. Live data is permanently saved to your Firebase cloud instance.
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!newRoomTitle.trim() || isProcessing}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 18px" }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} className="spin" /> Creating Room...
                    </>
                  ) : (
                    <>
                      <Radio size={16} /> Create Room & Start Sync
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: JOIN ROOM */}
          {activeTab === "join" && (
            <form onSubmit={handleJoinSubmit}>
              <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--jantt-muted)" }}>
                Connect to an existing Cloud Room using its Room ID or full share link.
              </p>

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--jantt-text)"
                  }}
                >
                  Room ID or Share Link
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste Room ID (e.g. room-9x2m4) or full URL"
                  value={joinRoomInput}
                  onChange={(e) => setJoinRoomInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.7)",
                    border: "1px solid var(--jantt-border)",
                    color: "var(--jantt-text)",
                    fontSize: "0.88rem"
                  }}
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--jantt-text)"
                  }}
                >
                  Secret Edit Key <span style={{ color: "var(--jantt-muted)", fontWeight: 400 }}>(Optional for edit mode)</span>
                </label>
                <input
                  type="password"
                  placeholder="Leave empty to join as View-Only"
                  value={joinSecretKey}
                  onChange={(e) => setJoinSecretKey(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.7)",
                    border: "1px solid var(--jantt-border)",
                    color: "var(--jantt-text)",
                    fontSize: "0.85rem"
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!joinRoomInput.trim() || isProcessing}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 18px" }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} className="spin" /> Connecting...
                    </>
                  ) : (
                    <>
                      <ArrowRight size={16} /> Connect to Room
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
