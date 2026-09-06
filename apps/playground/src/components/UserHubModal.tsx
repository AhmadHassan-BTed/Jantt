import React, { useState } from "react";
import {
  Users,
  X,
  Plus,
  Trash2,
  LogOut,
  ExternalLink,
  Share2,
  Crown,
  Clock,
  Radio,
  UserMinus
} from "lucide-react";
import type { UserProfile, UserRoomPointer } from "../firebase/types";
import { formatRelativeTime } from "../utils";

interface UserHubModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  userProfile: UserProfile | null;
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  activeRoomId?: string | null;
  onSelectRoom: (roomId: string) => Promise<void>;
  onCreateNewRoom: () => void;
  onOpenShareRoom: (roomId: string) => void;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onLeaveRoom: (roomId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const UserHubModal: React.FC<UserHubModalProps> = ({
  show,
  setShow,
  userProfile,
  ownedRooms,
  sharedRooms,
  activeRoomId,
  onSelectRoom,
  onCreateNewRoom,
  onOpenShareRoom,
  onDeleteRoom,
  onLeaveRoom,
  onSignOut
}) => {
  const [activeTab, setActiveTab] = useState<"owned" | "shared">("owned");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmLeaveId, setConfirmLeaveId] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  if (!show || !userProfile) return null;

  const handleDelete = async (roomId: string) => {
    setIsActionLoading(true);
    try {
      await onDeleteRoom(roomId);
      setConfirmDeleteId(null);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeave = async (roomId: string) => {
    setIsActionLoading(true);
    try {
      await onLeaveRoom(roomId);
      setConfirmLeaveId(null);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShow(false)}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "680px", width: "95%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with User Info */}
        <div className="prompt-modal-header" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {userProfile.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt="Avatar"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  border: "2px solid var(--jantt-accent)"
                }}
              />
            ) : (
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "var(--jantt-accent)",
                  color: "#FFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "1.2rem"
                }}
              >
                {userProfile.displayName?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--jantt-text)" }}>
                  {userProfile.displayName}
                </h3>
                <span
                  style={{
                    fontSize: "0.78rem",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: 700,
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "var(--jantt-accent)",
                    border: "1px solid rgba(56, 189, 248, 0.3)"
                  }}
                >
                  @{userProfile.username}
                </span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--jantt-muted)", marginTop: "2px" }}>
                {userProfile.email}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => {
                onSignOut();
                setShow(false);
              }}
              className="btn btn-secondary"
              title="Sign Out"
              style={{
                fontSize: "0.8rem",
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: "#F87171"
              }}
            >
              <LogOut size={13} /> Sign Out
            </button>
            <button className="prompt-modal-close" onClick={() => setShow(false)} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Selector & New Room Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: "1px solid var(--jantt-border)",
            background: "rgba(15, 23, 42, 0.3)"
          }}
        >
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("owned")}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: activeTab === "owned" ? "var(--jantt-accent)" : "transparent",
                color: activeTab === "owned" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
                boxShadow: activeTab === "owned" ? "0 2px 8px var(--jantt-accent-glow, rgba(255, 255, 255, 0.2))" : "none",
                transition: "all 0.15s ease"
              }}
            >
              <Crown size={14} /> My Rooms ({ownedRooms.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("shared")}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: activeTab === "shared" ? "var(--jantt-accent)" : "transparent",
                color: activeTab === "shared" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
                boxShadow: activeTab === "shared" ? "0 2px 8px var(--jantt-accent-glow, rgba(255, 255, 255, 0.2))" : "none",
                transition: "all 0.15s ease"
              }}
            >
              <Users size={14} /> Shared with Me ({sharedRooms.length})
            </button>
          </div>

          <button
            onClick={() => {
              onCreateNewRoom();
              setShow(false);
            }}
            className="btn btn-primary"
            style={{
              padding: "6px 14px",
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <Plus size={14} /> New Room
          </button>
        </div>

        {/* Rooms List Body */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {activeTab === "owned" && (
            <div>
              {ownedRooms.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--jantt-muted)" }}>
                  <Radio size={36} style={{ margin: "0 auto 12px auto", opacity: 0.4 }} />
                  <p style={{ margin: "0 0 12px 0", fontSize: "0.95rem" }}>You haven't created any cloud rooms yet.</p>
                  <button
                    onClick={() => {
                      onCreateNewRoom();
                      setShow(false);
                    }}
                    className="btn btn-primary"
                    style={{ fontSize: "0.85rem" }}
                  >
                    Create Your First Cloud Room
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {ownedRooms.map((room) => {
                    const isActive = activeRoomId === room.roomId;
                    return (
                      <div
                        key={room.roomId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "14px 16px",
                          borderRadius: "10px",
                          background: isActive ? "rgba(56, 189, 248, 0.08)" : "rgba(30, 41, 59, 0.5)",
                          border: isActive ? "1px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => { onSelectRoom(room.roomId); setShow(false); }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <strong style={{ fontSize: "0.95rem", color: "var(--jantt-text)" }}>{room.title}</strong>
                            {isActive && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  padding: "2px 6px",
                                  borderRadius: "10px",
                                  fontWeight: 700,
                                  background: "#10B981",
                                  color: "#FFF"
                                }}
                              >
                                CURRENT
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "12px",
                              fontSize: "0.78rem",
                              color: "var(--jantt-muted)",
                              marginTop: "4px"
                            }}
                          >
                            <span>ID: <code style={{ color: "var(--jantt-accent)" }}>{room.roomId}</code></span>
                            <span>•</span>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <Clock size={12} /> {formatRelativeTime(room.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => onOpenShareRoom(room.roomId)}
                            className="btn btn-secondary"
                            title="Share with Teammates or Copy Invite Link"
                            style={{ padding: "6px 10px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                          >
                            <Share2 size={13} /> Share
                          </button>

                          <button
                            onClick={() => { onSelectRoom(room.roomId); setShow(false); }}
                            className="btn btn-primary"
                            style={{ padding: "6px 12px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                          >
                            <ExternalLink size={13} /> Open
                          </button>

                          {confirmDeleteId === room.roomId ? (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                onClick={() => handleDelete(room.roomId)}
                                disabled={isActionLoading}
                                className="btn"
                                style={{
                                  padding: "5px 8px",
                                  fontSize: "0.72rem",
                                  background: "#EF4444",
                                  color: "#FFF"
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="btn btn-secondary"
                                style={{ padding: "5px 8px", fontSize: "0.72rem" }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(room.roomId)}
                              className="btn btn-icon"
                              title="Delete Room (Cascades removal from all collaborators)"
                              style={{ color: "#EF4444", padding: "6px" }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "shared" && (
            <div>
              {sharedRooms.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--jantt-muted)" }}>
                  <Users size={36} style={{ margin: "0 auto 12px auto", opacity: 0.4 }} />
                  <p style={{ margin: 0, fontSize: "0.95rem" }}>No rooms shared with you yet.</p>
                  <p style={{ margin: "6px 0 0 0", fontSize: "0.82rem" }}>
                    Give your handle <code style={{ color: "var(--jantt-accent)" }}>@{userProfile.username}</code> to a teammate so they can add you!
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {sharedRooms.map((room) => {
                    const isActive = activeRoomId === room.roomId;
                    return (
                      <div
                        key={room.roomId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "14px 16px",
                          borderRadius: "10px",
                          background: isActive ? "rgba(56, 189, 248, 0.08)" : "rgba(30, 41, 59, 0.5)",
                          border: isActive ? "1px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => { onSelectRoom(room.roomId); setShow(false); }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <strong style={{ fontSize: "0.95rem", color: "var(--jantt-text)" }}>{room.title}</strong>
                            <span
                              style={{
                                fontSize: "0.68rem",
                                padding: "2px 6px",
                                borderRadius: "8px",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                background: room.role === "editor" ? "rgba(16, 185, 129, 0.2)" : "rgba(56, 189, 248, 0.2)",
                                color: room.role === "editor" ? "#34D399" : "var(--jantt-accent)"
                              }}
                            >
                              {room.role}
                            </span>
                            {isActive && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  padding: "2px 6px",
                                  borderRadius: "10px",
                                  fontWeight: 700,
                                  background: "#10B981",
                                  color: "#FFF"
                                }}
                              >
                                CURRENT
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "12px",
                              fontSize: "0.78rem",
                              color: "var(--jantt-muted)",
                              marginTop: "4px"
                            }}
                          >
                            <span>Owner: <strong style={{ color: "var(--jantt-text)" }}>@{room.ownerUsername}</strong></span>
                            <span>•</span>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <Clock size={12} /> {formatRelativeTime(room.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => { onSelectRoom(room.roomId); setShow(false); }}
                            className="btn btn-primary"
                            style={{ padding: "6px 12px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                          >
                            <ExternalLink size={13} /> Open
                          </button>

                          {confirmLeaveId === room.roomId ? (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                onClick={() => handleLeave(room.roomId)}
                                disabled={isActionLoading}
                                className="btn"
                                style={{
                                  padding: "5px 8px",
                                  fontSize: "0.72rem",
                                  background: "#F59E0B",
                                  color: "#FFF"
                                }}
                              >
                                Leave
                              </button>
                              <button
                                onClick={() => setConfirmLeaveId(null)}
                                className="btn btn-secondary"
                                style={{ padding: "5px 8px", fontSize: "0.72rem" }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmLeaveId(room.roomId)}
                              className="btn btn-icon"
                              title="Leave this shared room"
                              style={{ color: "#F59E0B", padding: "6px" }}
                            >
                              <UserMinus size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
