import React, { useState, useEffect, useMemo } from "react";
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
  Globe,
  Layers
} from "lucide-react";
import type { Team, Person } from "@jantt/core";
import { ref, onValue } from "firebase/database";
import {
  rtdb,
  searchUsersByUsername,
  shareRoomWithUser,
  shareRoomWithTeam,
  removeTeamFromRoom,
  removeMemberFromRoom,
  updateMemberRole,
  type UserProfile,
  type RoomMember,
  type RoomTeam
} from "../../firebase";

interface ShareRoomModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  roomId: string | null;
  roomTitle: string;
  currentUserProfile: UserProfile | null;
  showToast: (msg: string, isErr?: boolean) => void;
  planTeams?: Team[];
  planPeople?: Person[];
}

export const ShareRoomModal: React.FC<ShareRoomModalProps> = ({
  show,
  setShow,
  roomId,
  roomTitle,
  currentUserProfile,
  showToast,
  planTeams = [],
  planPeople = []
}) => {
  const [activeTab, setActiveTab] = useState<"link" | "username" | "teams" | "members">("link");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<"editor" | "viewer">("editor");
  const [isSharing, setIsSharing] = useState(false);

  // Teams search
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [selectedTeamRole, setSelectedTeamRole] = useState<"editor" | "viewer">("editor");
  const [isTeamSharing, setIsTeamSharing] = useState(false);

  // Members & Teams in active room
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [roomTeams, setRoomTeams] = useState<RoomTeam[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Listen to members of active room
  useEffect(() => {
    if (!show || !roomId) {
      setMembers([]);
      setRoomTeams([]);
      return;
    }

    const membersRef = ref(rtdb, `rooms/${roomId}/members`);
    const unsubMembers = onValue(membersRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setMembers(Object.values(val));
      } else {
        setMembers([]);
      }
    });

    const teamsRef = ref(rtdb, `rooms/${roomId}/teams`);
    const unsubTeams = onValue(teamsRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setRoomTeams(Object.values(val));
      } else {
        setRoomTeams([]);
      }
    });

    return () => {
      unsubMembers();
      unsubTeams();
    };
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

  // Filtered plan teams
  const filteredTeams = useMemo(() => {
    const q = teamSearchQuery.toLowerCase().trim();
    if (!q) return planTeams;
    return planTeams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (typeof (t as any).department === "string" && ((t as any).department as string).toLowerCase().includes(q))
    );
  }, [planTeams, teamSearchQuery]);

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

  const handleAddTeam = async (team: Team) => {
    if (!roomId || isTeamSharing) return;
    setIsTeamSharing(true);

    try {
      // Resolve members in this team from planPeople
      const teamPersons = planPeople.filter(
        (p) => p.teamId === team.id || (Array.isArray(team.members) && (team.members as unknown[]).includes(p.id))
      );

      // Create synthetic user records for team members
      const usersToAdd: UserProfile[] = teamPersons.map((p) => ({
        uid: `user-${p.id.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        username: (p.username || p.name).toLowerCase().replace(/[^a-z0-9]/g, "_"),
        displayUsername: p.username || p.name,
        displayName: p.name,
        email: (p as any).email || `${p.name.toLowerCase().replace(/\s+/g, ".")}@team.local`,
        photoURL: p.avatar,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      await shareRoomWithTeam(
        roomId,
        { id: team.id, name: team.name, color: team.color },
        usersToAdd,
        selectedTeamRole
      );

      showToast(`Added team "${team.name}" with ${usersToAdd.length} member(s)!`);
    } catch (err: any) {
      showToast(`Failed to add team: ${err.message}`, true);
    } finally {
      setIsTeamSharing(false);
    }
  };

  const handleRemoveTeam = async (teamId: string, teamName: string) => {
    try {
      await removeTeamFromRoom(roomId, teamId);
      showToast(`Removed team "${teamName}" and all its members.`);
    } catch (err: any) {
      showToast(`Could not remove team: ${err.message}`, true);
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
        style={{ maxWidth: "640px", width: "95%", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
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
                justifyContent: "center",
                border: "1px solid rgba(56, 189, 248, 0.3)"
              }}
            >
              <Users size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.12rem", fontWeight: 700, color: "var(--jantt-text)" }}>
                Share Room: {roomTitle}
              </h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--jantt-muted)" }}>
                Room ID: <code style={{ color: "var(--jantt-accent)" }}>{roomId}</code> • {members.length} member{members.length === 1 ? "" : "s"} • {roomTeams.length} team{roomTeams.length === 1 ? "" : "s"}
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
            gap: "4px",
            padding: "6px",
            margin: "0 20px",
            background: "var(--jantt-surface-subtle, rgba(15, 23, 42, 0.5))",
            borderRadius: "10px",
            border: "1px solid var(--jantt-border)"
          }}
        >
          <button
            type="button"
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
              color: activeTab === "link" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
              boxShadow: activeTab === "link" ? "0 2px 8px var(--jantt-accent-glow, rgba(255,255,255,0.2))" : "none",
              transition: "all 0.15s ease"
            }}
          >
            <Globe size={14} /> Invite Link
          </button>
          <button
            type="button"
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
              color: activeTab === "username" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
              boxShadow: activeTab === "username" ? "0 2px 8px var(--jantt-accent-glow, rgba(255,255,255,0.2))" : "none",
              transition: "all 0.15s ease"
            }}
          >
            <Search size={14} /> Individuals
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("teams")}
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
              background: activeTab === "teams" ? "var(--jantt-accent)" : "transparent",
              color: activeTab === "teams" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
              boxShadow: activeTab === "teams" ? "0 2px 8px var(--jantt-accent-glow, rgba(255,255,255,0.2))" : "none",
              transition: "all 0.15s ease"
            }}
          >
            <Layers size={14} /> Teams ({planTeams.length})
          </button>
          <button
            type="button"
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
              color: activeTab === "members" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
              boxShadow: activeTab === "members" ? "0 2px 8px var(--jantt-accent-glow, rgba(255,255,255,0.2))" : "none",
              transition: "all 0.15s ease"
            }}
          >
            <Users size={14} /> Roster ({members.length})
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {/* TAB 1: INVITE LINK */}
          {activeTab === "link" && (
            <div>
              <p style={{ margin: "0 0 14px 0", fontSize: "0.85rem", color: "var(--jantt-muted)" }}>
                Share this direct invite link with teammates. When they open it, they can immediately join and collaborate live.
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
                  Only users authenticated via GitHub can access this room. Real-time changes are synced via persistent WebSockets with zero overwrite conflicts.
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: INDIVIDUALS SEARCH */}
          {activeTab === "username" && (
            <div>
              <p style={{ margin: "0 0 14px 0", fontSize: "0.85rem", color: "var(--jantt-muted)" }}>
                Search for any registered collaborator by username or display name to add them to this room.
              </p>

              <div style={{ position: "relative", marginBottom: "14px" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", color: "var(--jantt-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search @username or name..."
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
                      maxHeight: "220px",
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
                      <option value="editor">Can Edit</option>
                      <option value="viewer">Can View</option>
                    </select>

                    <button
                      onClick={handleShareWithSelectedUser}
                      disabled={isSharing}
                      className="btn btn-primary"
                      style={{ padding: "7px 14px", fontSize: "0.85rem" }}
                    >
                      {isSharing ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEAMS BULK SEARCH & ADDITION */}
          {activeTab === "teams" && (
            <div>
              <p style={{ margin: "0 0 14px 0", fontSize: "0.85rem", color: "var(--jantt-muted)" }}>
                Add entire teams in bulk to grant collaboration access to all team members in one click.
              </p>

              <div style={{ marginBottom: "14px", display: "flex", gap: "10px" }}>
                <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", color: "var(--jantt-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search teams by name..."
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px 9px 36px",
                      borderRadius: "8px",
                      background: "rgba(15, 23, 42, 0.7)",
                      border: "1px solid var(--jantt-border)",
                      color: "var(--jantt-text)",
                      fontSize: "0.88rem"
                    }}
                  />
                </div>
                <select
                  value={selectedTeamRole}
                  onChange={(e) => setSelectedTeamRole(e.target.value as "editor" | "viewer")}
                  className="select-input"
                  style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                >
                  <option value="editor">Add as Editors</option>
                  <option value="viewer">Add as Viewers</option>
                </select>
              </div>

              {filteredTeams.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--jantt-muted)", fontSize: "0.88rem" }}>
                  No teams found in this plan. Create teams under <strong>People & Teams</strong> first to share in bulk.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {filteredTeams.map((team) => {
                    const isAlreadyAdded = roomTeams.some((rt) => rt.id === team.id);
                    const memberCount = (Array.isArray(team.members) ? team.members.length : 0) || planPeople.filter((p) => p.teamId === team.id).length;

                    return (
                      <div
                        key={team.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 16px",
                          borderRadius: "10px",
                          background: isAlreadyAdded ? "rgba(16, 185, 129, 0.08)" : "rgba(30, 41, 59, 0.4)",
                          border: isAlreadyAdded ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--jantt-border)"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "14px",
                              height: "14px",
                              borderRadius: "50%",
                              background: team.color || "var(--jantt-accent)"
                            }}
                          />
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <strong style={{ fontSize: "0.92rem", color: "var(--jantt-text)" }}>{team.name}</strong>
                              {isAlreadyAdded && (
                                <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "10px", background: "#10B981", color: "#FFF", fontWeight: 700 }}>
                                  ADDED
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--jantt-muted)" }}>
                              {memberCount} member{memberCount === 1 ? "" : "s"} {team.department ? `• ${team.department}` : ""}
                            </div>
                          </div>
                        </div>

                        {isAlreadyAdded ? (
                          <button
                            onClick={() => handleRemoveTeam(team.id, team.name)}
                            className="btn btn-secondary"
                            style={{ fontSize: "0.78rem", padding: "5px 10px", color: "#EF4444" }}
                          >
                            Remove Team
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAddTeam(team)}
                            disabled={isTeamSharing}
                            className="btn btn-primary"
                            style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                          >
                            <Layers size={13} /> Add Team ({memberCount})
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ROSTER DIRECTORY & MANAGEMENT */}
          {activeTab === "members" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Added Teams Section */}
              {roomTeams.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--jantt-text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                    Active Teams ({roomTeams.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {roomTeams.map((rt) => (
                      <div
                        key={rt.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 10px",
                          borderRadius: "8px",
                          background: "rgba(56, 189, 248, 0.1)",
                          border: "1px solid rgba(56, 189, 248, 0.25)"
                        }}
                      >
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: rt.color || "var(--jantt-accent)" }} />
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--jantt-text)" }}>{rt.name}</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--jantt-muted)" }}>({rt.memberUids?.length || 0} members)</span>
                        {isOwner && (
                          <button
                            onClick={() => handleRemoveTeam(rt.id, rt.name)}
                            title="Remove entire team from room"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: "0 2px" }}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Members List */}
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--jantt-text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                Individual Members ({members.length})
              </div>

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
                          {member.teamName && (
                            <span style={{ fontSize: "0.68rem", padding: "1px 5px", borderRadius: "4px", background: "rgba(99, 102, 241, 0.15)", color: "#818CF8", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                              {member.teamName}
                            </span>
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
                            className="btn btn-secondary"
                            title="Remove from room"
                            style={{ color: "#EF4444", padding: "6px 8px" }}
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
