import React, { useState, useEffect } from "react";
import {
  Users,
  X,
  Copy,
  Check,
  Search,
  UserPlus,
  Crown,
  Shield,
  Trash2,
  Loader2,
  Globe
} from "lucide-react";
import type { UserProfile, RoomMember } from "../firebase/types";
import { searchUsersByUsername } from "../firebase/authService";
import {
  shareRoomWithUser,
  removeMemberFromRoom,
  updateMemberRole
} from "../firebase/roomService";
import { ref, onValue } from "firebase/database";
import { rtdb } from "../firebase/firebaseConfig";

interface ShareRoomModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  roomId: string | null;
  roomTitle: string;
  currentUserProfile: UserProfile | null;
  showToast: (msg: string, isErr?: boolean) => void;
}

export const ShareRoomModal: React.FC<ShareRoomModalProps> = ({
  show,
  setShow,
  roomId,
  roomTitle,
  currentUserProfile,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<"username" | "link" | "members">("username");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<"editor" | "viewer">("editor");
  const [isSharing, setIsSharing] = useState(false);

  // Members of this room
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Listen to members of active room
  useEffect(() => {
    if (!show || !roomId) {
      setMembers([]);
      return;
    }

    const membersRef = ref(rtdb, `rooms/${roomId}/members`);
    const unsubscribe = onValue(membersRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setMembers(Object.values(val));
      } else {
        setMembers([]);
      }
    });

    return () => unsubscribe();
  }, [show, roomId]);

  // Real-time username autocomplete search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchUsersByUsername(searchQuery, currentUserProfile?.uid);
        // Filter out users who are already members
        const memberUids = new Set(members.map((m) => m.uid));
        setSearchResults(results.filter((u) => !memberUids.has(u.uid)));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, members, currentUserProfile?.uid]);

  if (!show || !roomId) return null;

  const origin = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const inviteLink = `${origin}?room=${encodeURIComponent(roomId)}`;

  const isOwner = currentUserProfile && members.some((m) => m.uid === currentUserProfile.uid && m.role === "owner");

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      showToast("Invite link copied to clipboard!");
    } catch {}
  };

  const handleShareWithSelectedUser = async () => {
    if (!selectedUser || isSharing) return;
    setIsSharing(true);
    try {
      await shareRoomWithUser(roomId, selectedUser, selectedRole);
      showToast(`Added @${selectedUser.username} as ${selectedRole}!`);
      setSelectedUser(null);
      setSearchQuery("");
      setSearchResults([]);
    } catch (err: any) {
      showToast(`Failed to share: ${err.message}`, true);
    } finally {
      setIsSharing(false);
    }
  };

  const handleRoleChange = async (memberUid: string, newRole: "editor" | "viewer") => {
    try {
      await updateMemberRole(roomId, memberUid, newRole);
      showToast("Member permissions updated.");
    } catch (err: any) {
      showToast(`Could not update role: ${err.message}`, true);
    }
  };

  const handleRemoveMember = async (memberUid: string, username: string) => {
    try {
      await removeMemberFromRoom(roomId, memberUid);
      showToast(`Removed @${username} from room.`);
    } catch (err: any) {
      showToast(`Could not remove member: ${err.message}`, true);
    }
  };

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShow(false)}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "620px", width: "95%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="prompt-modal-header" style={{ padding: "16px 20px" }}>
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
                justifyContent: "center"
              }}
            >
              <Users size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--jantt-text)" }}>
                Share Room: {roomTitle}
              </h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--jantt-muted)" }}>
                Room ID: <code style={{ color: "var(--jantt-accent)" }}>{roomId}</code> • {members.length} member{members.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button className="prompt-modal-close" onClick={() => setShow(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            padding: "6px",
            margin: "0 20px",
            background: "rgba(15, 23, 42, 0.4)",
            borderRadius: "10px",
            border: "1px solid var(--jantt-border)"
          }}
        >
          <button
            onClick={() => setActiveTab("username")}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: activeTab === "username" ? "var(--jantt-accent)" : "transparent",
              color: activeTab === "username" ? "#FFF" : "var(--jantt-muted)"
            }}
          >
            <Search size={14} /> Add by Username
          </button>
          <button
            onClick={() => setActiveTab("link")}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: activeTab === "link" ? "var(--jantt-accent)" : "transparent",
              color: activeTab === "link" ? "#FFF" : "var(--jantt-muted)"
            }}
          >
            <Globe size={14} /> Invite Link
          </button>
          <button
            onClick={() => setActiveTab("members")}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: activeTab === "members" ? "var(--jantt-accent)" : "transparent",
              color: activeTab === "members" ? "#FFF" : "var(--jantt-muted)"
            }}
          >
            <Users size={14} /> Members ({members.length})
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {/* TAB 1: USERNAME AUTOCOMPLETE SEARCH */}
          {activeTab === "username" && (
            <div>
              <p style={{ margin: "0 0 14px 0", fontSize: "0.85rem", color: "var(--jantt-muted)" }}>
                Search for any teammate by typing their handle. Selected users will immediately see this room in their personal hub!
              </p>

              <div style={{ position: "relative", marginBottom: "14px" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", color: "var(--jantt-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search @username (e.g. alex, dev_lead)..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedUser(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 38px 10px 36px",
                      borderRadius: "8px",
                      background: "rgba(15, 23, 42, 0.7)",
                      border: "1px solid var(--jantt-border)",
                      color: "var(--jantt-text)",
                      fontSize: "0.9rem"
                    }}
                  />
                  {isSearching && (
                    <Loader2 size={16} className="spin" style={{ position: "absolute", right: "12px", color: "var(--jantt-muted)" }} />
                  )}
                </div>

                {/* Autocomplete Dropdown List */}
                {searchResults.length > 0 && !selectedUser && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      background: "rgba(15, 23, 42, 0.98)",
                      border: "1px solid var(--jantt-border)",
                      borderRadius: "8px",
                      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
                      zIndex: 100,
                      maxHeight: "200px",
                      overflowY: "auto"
                    }}
                  >
                    {searchResults.map((user) => (
                      <div
                        key={user.uid}
                        onClick={() => {
                          setSelectedUser(user);
                          setSearchQuery(`@${user.username}`);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                          transition: "background 0.15s ease"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.15)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {user.photoURL ? (
                            <img src={user.photoURL} alt="Avatar" style={{ width: "28px", height: "28px", borderRadius: "50%" }} />
                          ) : (
                            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--jantt-accent)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>
                              {user.displayName?.[0]?.toUpperCase() || "U"}
                            </div>
                          )}
                          <div>
                            <strong style={{ fontSize: "0.88rem", color: "var(--jantt-text)" }}>{user.displayName}</strong>
                            <div style={{ fontSize: "0.78rem", color: "var(--jantt-accent)" }}>@{user.username}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--jantt-muted)" }}>{user.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected User Action Card */}
              {selectedUser && (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "10px",
                    background: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {selectedUser.photoURL ? (
                      <img src={selectedUser.photoURL} alt="Avatar" style={{ width: "36px", height: "36px", borderRadius: "50%" }} />
                    ) : (
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--jantt-accent)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                        {selectedUser.displayName?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--jantt-text)", fontSize: "0.95rem" }}>
                        {selectedUser.displayName} <span style={{ color: "var(--jantt-accent)", fontWeight: 600 }}>@{selectedUser.username}</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--jantt-muted)" }}>{selectedUser.email}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as "editor" | "viewer")}
                      className="select-input"
                      style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                    >
                      <option value="editor">Can Edit (Collaborator)</option>
                      <option value="viewer">Can View (Read-Only)</option>
                    </select>

                    <button
                      onClick={handleShareWithSelectedUser}
                      disabled={isSharing}
                      className="btn btn-primary"
                      style={{ padding: "7px 14px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      {isSharing ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INVITE LINK */}
          {activeTab === "link" && (
            <div>
              <p style={{ margin: "0 0 14px 0", fontSize: "0.85rem", color: "var(--jantt-muted)" }}>
                Share this direct invite link with anyone. When they open it, they will be prompted to log in with Google to join.
              </p>

              <div
                style={{
                  padding: "16px",
                  borderRadius: "10px",
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid var(--jantt-border)",
                  marginBottom: "16px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--jantt-text)" }}>
                    Room Invite Link
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="btn btn-primary"
                    style={{ padding: "6px 14px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    {copiedLink ? "Copied!" : "Copy Link"}
                  </button>
                </div>
                <input
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid var(--jantt-border)",
                    color: "var(--jantt-text)",
                    fontSize: "0.82rem",
                    fontFamily: "monospace"
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.2)"
                }}
              >
                <Shield size={16} style={{ color: "#34D399", flexShrink: 0 }} />
                <span style={{ fontSize: "0.78rem", color: "var(--jantt-muted)" }}>
                  Only authenticated users can access the room data. Real-time changes are synced via persistent WebSockets.
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: MEMBERS DIRECTORY & ROLE MANAGEMENT */}
          {activeTab === "members" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {members.map((member) => {
                const isMemberOwner = member.role === "owner";
                const isMe = currentUserProfile && member.uid === currentUserProfile.uid;

                return (
                  <div
                    key={member.uid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(30, 41, 59, 0.4)",
                      border: "1px solid var(--jantt-border)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {member.photoURL ? (
                        <img src={member.photoURL} alt="Avatar" style={{ width: "32px", height: "32px", borderRadius: "50%" }} />
                      ) : (
                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--jantt-accent)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>
                          {member.displayName?.[0]?.toUpperCase() || "U"}
                        </div>
                      )}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong style={{ fontSize: "0.88rem", color: "var(--jantt-text)" }}>{member.displayName}</strong>
                          {isMe && (
                            <span style={{ fontSize: "0.7rem", color: "var(--jantt-accent)", fontWeight: 700 }}>(You)</span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "var(--jantt-muted)" }}>@{member.username}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isMemberOwner ? (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#F59E0B",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: "rgba(245, 158, 11, 0.15)"
                          }}
                        >
                          <Crown size={12} /> Owner
                        </span>
                      ) : isOwner ? (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.uid, e.target.value as "editor" | "viewer")}
                            className="select-input"
                            style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => handleRemoveMember(member.uid, member.username)}
                            className="btn btn-icon"
                            title="Remove from room"
                            style={{ color: "#EF4444", padding: "6px" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: member.role === "editor" ? "rgba(16, 185, 129, 0.15)" : "rgba(56, 189, 248, 0.15)",
                            color: member.role === "editor" ? "#34D399" : "var(--jantt-accent)"
                          }}
                        >
                          {member.role === "editor" ? "Editor" : "Viewer"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
