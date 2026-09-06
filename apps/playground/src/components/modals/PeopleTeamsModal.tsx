import React, { useState, useEffect } from "react";
import {
  Users,
  X,
  Layers,
  Plus,
  Lightbulb,
  Trash2,
  Check,
  Search,
  UserCheck
} from "lucide-react";
import {
  type Person,
  type Team,
  type JanttData,
  resolveTeamById
} from "@jantt/core";
import type { EffectivePerson } from "../../types";
import { searchUsersByUsername, type UserProfile } from "../../firebase";

interface PeopleTeamsModalProps {
  showPeopleModal: boolean;
  setShowPeopleModal: (show: boolean) => void;
  peopleModalTab: "people" | "teams";
  setPeopleModalTab: (tab: "people" | "teams") => void;
  effectivePeople: EffectivePerson[];
  people: Person[];
  teams: Team[];
  parsedData: JanttData | null;
  newPersonName: string;
  setNewPersonName: (val: string) => void;
  newPersonRole: string;
  setNewPersonRole: (val: string) => void;
  newPersonTeamId: string;
  setNewPersonTeamId: (val: string) => void;
  handleAddPerson: () => void;
  onAddRealTeammate?: (user: UserProfile) => void;
  handlePersistAllPeople: () => void;
  handlePersistPerson: (p: Person) => void;
  handleRemovePerson: (id: string) => void;
  newTeamName: string;
  setNewTeamName: (val: string) => void;
  newTeamColor: string;
  setNewTeamColor: (val: string) => void;
  newTeamDesc: string;
  setNewTeamDesc: (val: string) => void;
  handleAddTeam: () => void;
  handleRemoveTeam: (id: string) => void;
}

export const PeopleTeamsModal: React.FC<PeopleTeamsModalProps> = ({
  showPeopleModal,
  setShowPeopleModal,
  peopleModalTab,
  setPeopleModalTab,
  effectivePeople,
  people,
  teams,
  parsedData,
  newPersonName,
  setNewPersonName,
  newPersonRole,
  setNewPersonRole,
  newPersonTeamId,
  setNewPersonTeamId,
  handleAddPerson,
  onAddRealTeammate,
  handlePersistAllPeople,
  handlePersistPerson,
  handleRemovePerson,
  newTeamName,
  setNewTeamName,
  newTeamColor,
  setNewTeamColor,
  newTeamDesc,
  setNewTeamDesc,
  handleAddTeam,
  handleRemoveTeam
}) => {
  const [memberMode, setMemberMode] = useState<"search" | "custom">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchUsersByUsername(searchQuery);
        setSearchResults(results);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!showPeopleModal) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowPeopleModal(false)}>
      <div className="prompt-modal-card" style={{ maxWidth: "620px" }} onClick={(e) => e.stopPropagation()}>
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={18} color="var(--jantt-accent)" />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
              Team &amp; Assignee Management
            </h3>
          </div>
          <button
            className="prompt-modal-close-btn"
            onClick={() => setShowPeopleModal(false)}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Tabs (Members vs Teams) */}
        <div className="prompt-modal-tabs">
          <button
            className={`prompt-tab-btn ${peopleModalTab === "people" ? "is-active" : ""}`}
            onClick={() => setPeopleModalTab("people")}
          >
            <Users size={13} />
            <span>Team Members ({effectivePeople.length})</span>
          </button>
          <button
            className={`prompt-tab-btn ${peopleModalTab === "teams" ? "is-active" : ""}`}
            onClick={() => setPeopleModalTab("teams")}
          >
            <Layers size={13} />
            <span>Teams &amp; Squads ({teams.length})</span>
          </button>
        </div>

        <div className="prompt-modal-body" style={{ gap: "18px", padding: "20px" }}>
          {peopleModalTab === "people" ? (
            <>
              {/* Add New Member Section (Search Registered Teammates vs Offline Persona) */}
              <div style={{ background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", margin: 0, color: "var(--jantt-text-muted)" }}>
                    Add Team Member
                  </label>
                  <div style={{ display: "flex", background: "var(--jantt-bg)", borderRadius: "6px", padding: "2px", border: "1px solid var(--jantt-border)" }}>
                    <button
                      type="button"
                      onClick={() => setMemberMode("search")}
                      style={{
                        padding: "4px 9px",
                        fontSize: "11px",
                        fontWeight: 600,
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        background: memberMode === "search" ? "var(--jantt-surface)" : "transparent",
                        color: memberMode === "search" ? "var(--jantt-accent)" : "var(--jantt-text-muted)",
                        boxShadow: memberMode === "search" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                        transition: "all 0.15s ease"
                      }}
                    >
                      Search GitHub Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemberMode("custom")}
                      style={{
                        padding: "4px 9px",
                        fontSize: "11px",
                        fontWeight: 600,
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        background: memberMode === "custom" ? "var(--jantt-surface)" : "transparent",
                        color: memberMode === "custom" ? "var(--jantt-accent)" : "var(--jantt-text-muted)",
                        boxShadow: memberMode === "custom" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                        transition: "all 0.15s ease"
                      }}
                    >
                      Offline / Persona
                    </button>
                  </div>
                </div>

                {memberMode === "search" ? (
                  <div>
                    <div style={{ position: "relative" }}>
                      <Search size={14} style={{ position: "absolute", left: "12px", top: "12px", color: "var(--jantt-text-muted)", pointerEvents: "none" }} />
                      <input
                        type="text"
                        className="code-textarea"
                        style={{
                          width: "100%",
                          height: "38px",
                          padding: "8px 12px 8px 34px",
                          fontSize: "13px",
                          fontFamily: "var(--jantt-font-sans)",
                          borderRadius: "8px",
                          border: "1px solid var(--jantt-border)",
                          boxSizing: "border-box"
                        }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search registered users by @username..."
                      />
                    </div>

                    {isSearching && (
                      <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "6px" }}>
                        Searching registered accounts...
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div
                        style={{
                          marginTop: "8px",
                          border: "1px solid var(--jantt-border)",
                          borderRadius: "8px",
                          background: "var(--jantt-bg)",
                          maxHeight: "180px",
                          overflowY: "auto",
                          padding: "6px"
                        }}
                      >
                        {searchResults.map((usr) => (
                          <div
                            key={usr.uid}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "7px 10px",
                              borderRadius: "6px",
                              background: "var(--jantt-surface)",
                              border: "1px solid var(--jantt-border-subtle)",
                              marginBottom: "4px"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {usr.photoURL ? (
                                <img
                                  src={usr.photoURL}
                                  alt={usr.username}
                                  style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover" }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "50%",
                                    background: "var(--jantt-accent)",
                                    color: "#fff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "11px",
                                    fontWeight: 700
                                  }}
                                >
                                  {usr.username[0]?.toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--jantt-text)" }}>
                                    {usr.displayName || usr.username}
                                  </span>
                                  <span style={{ fontSize: "11px", color: "var(--jantt-accent)", fontFamily: "var(--jantt-font-mono)", fontWeight: 600 }}>
                                    @{usr.username}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn-nav btn-nav-primary"
                              style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}
                              onClick={() => {
                                if (onAddRealTeammate) {
                                  onAddRealTeammate(usr);
                                  setSearchQuery("");
                                  setSearchResults([]);
                                }
                              }}
                            >
                              <Plus size={12} />
                              <span>Add Teammate</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchQuery.trim().length > 0 && !isSearching && searchResults.length === 0 && (
                      <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "6px" }}>
                        No registered GitHub account found with username matching "{searchQuery}". Switch to "Offline / Persona" to add an external member.
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      className="code-textarea"
                      style={{
                        flex: "1 1 160px",
                        height: "38px",
                        padding: "8px 12px",
                        fontSize: "13px",
                        fontFamily: "var(--jantt-font-sans)",
                        borderRadius: "8px",
                        border: "1px solid var(--jantt-border)",
                        boxSizing: "border-box"
                      }}
                      value={newPersonName}
                      onChange={(e) => setNewPersonName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddPerson();
                      }}
                      placeholder="Full Name (e.g. Alex Morgan)"
                    />
                    <input
                      type="text"
                      className="code-textarea"
                      style={{
                        flex: "1 1 130px",
                        height: "38px",
                        padding: "8px 12px",
                        fontSize: "13px",
                        fontFamily: "var(--jantt-font-sans)",
                        borderRadius: "8px",
                        border: "1px solid var(--jantt-border)",
                        boxSizing: "border-box"
                      }}
                      value={newPersonRole}
                      onChange={(e) => setNewPersonRole(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddPerson();
                      }}
                      placeholder="Role (e.g. Contractor)"
                    />
                    {teams.length > 0 && (
                      <select
                        className="code-textarea"
                        style={{
                          flex: "1 1 120px",
                          height: "38px",
                          padding: "6px 10px",
                          fontSize: "12px",
                          fontFamily: "var(--jantt-font-sans)",
                          borderRadius: "8px",
                          border: "1px solid var(--jantt-border)",
                          boxSizing: "border-box",
                          background: "var(--jantt-surface-solid)",
                          color: "var(--jantt-text)"
                        }}
                        value={newPersonTeamId}
                        onChange={(e) => setNewPersonTeamId(e.target.value)}
                      >
                        <option value="">No Team Assigned</option>
                        {teams.map((tm) => (
                          <option key={tm.id} value={tm.id}>Team: {tm.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      className="btn-nav btn-nav-primary"
                      style={{ height: "38px", padding: "0 14px", flexShrink: 0 }}
                      onClick={handleAddPerson}
                      disabled={!newPersonName.trim()}
                    >
                      <Plus size={14} />
                      <span>Add Persona</span>
                    </button>
                  </div>
                )}
              </div>

              {/* People List */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", margin: 0, color: "var(--jantt-text-muted)" }}>
                    Current Members ({effectivePeople.length})
                  </label>
                  {effectivePeople.length > people.length && (
                    <button
                      className="btn-nav btn-nav-primary"
                      style={{ height: "24px", padding: "0 10px", fontSize: "10.5px" }}
                      onClick={handlePersistAllPeople}
                      title="Save all detected schedule assignees into the project JSON 'people' array"
                    >
                      Save All to JSON
                    </button>
                  )}
                </div>

                {effectivePeople.length > people.length && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "rgba(56, 189, 248, 0.08)",
                      border: "1px solid rgba(56, 189, 248, 0.2)",
                      borderRadius: "8px",
                      marginBottom: "10px",
                      fontSize: "11.5px",
                      color: "var(--jantt-text)"
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <Lightbulb size={14} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
                      <span>
                        <strong>{effectivePeople.length - people.length} assignee{effectivePeople.length - people.length === 1 ? "" : "s"}</strong> detected from schedule &amp; meta ({parsedData?.meta?.person ? `${parsedData.meta.person}, etc.` : "tasks"}).
                      </span>
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                      Visible across all views &amp; filters
                    </span>
                  </div>
                )}

                {effectivePeople.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--jantt-surface)", border: "1px dashed var(--jantt-border)", borderRadius: "10px", color: "var(--jantt-text-muted)" }}>
                    <Users size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>No team members defined yet.</p>
                    <p style={{ margin: "4px 0 0 0", fontSize: "11.5px" }}>Add members above to assign tasks and filter in the Today view.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
                    {effectivePeople.map((p) => {
                      const assignedCount = parsedData?.tasks.filter(
                        (t) => t.assignee === p.name || t.assignee === p.id || (p.username && t.assignee === p.username)
                      ).length || 0;
                      const initials = p.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase();
                      const avatarBg = p.color || "var(--jantt-accent)";
                      const memberTeam = resolveTeamById(teams, p.teamId);

                      return (
                        <div
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            background: "var(--jantt-surface)",
                            border: "1px solid var(--jantt-border)",
                            borderRadius: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {p.avatar ? (
                              <img
                                src={p.avatar}
                                alt={p.name}
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  objectFit: "cover",
                                  flexShrink: 0,
                                  border: "1px solid var(--jantt-border)"
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  background: avatarBg,
                                  color: "#FFFFFF",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  flexShrink: 0
                                }}
                              >
                                {initials}
                              </div>
                            )}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                                  {p.name}
                                </span>
                                {p.username ? (
                                  <span
                                    style={{
                                      fontSize: "10.5px",
                                      fontFamily: "var(--jantt-font-mono)",
                                      fontWeight: 600,
                                      color: "var(--jantt-accent)",
                                      background: "rgba(56, 189, 248, 0.1)",
                                      padding: "1px 6px",
                                      borderRadius: "100px",
                                      border: "1px solid rgba(56, 189, 248, 0.25)",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px"
                                    }}
                                    title="Verified Registered GitHub Account"
                                  >
                                    <UserCheck size={10} />
                                    {p.username.startsWith("@") ? p.username : `@${p.username}`}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: "9.5px",
                                      color: "var(--jantt-text-muted)",
                                      background: "var(--jantt-border-subtle)",
                                      padding: "1px 5px",
                                      borderRadius: "4px"
                                    }}
                                    title="Offline / Non-Account Persona"
                                  >
                                    Offline
                                  </span>
                                )}
                                {p.isInferred && (
                                  <span
                                    style={{
                                      fontSize: "9.5px",
                                      fontWeight: 600,
                                      background: "rgba(56, 189, 248, 0.12)",
                                      color: "var(--jantt-accent)",
                                      padding: "1px 6px",
                                      borderRadius: "100px",
                                      border: "1px solid rgba(56, 189, 248, 0.25)"
                                    }}
                                    title="Automatically discovered from schedule assignees & metadata"
                                  >
                                    Inferred
                                  </span>
                                )}
                                {memberTeam && (
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      background: `${memberTeam.color || "var(--jantt-accent)"}1F`,
                                      color: memberTeam.color || "var(--jantt-accent)",
                                      padding: "1px 6px",
                                      borderRadius: "100px"
                                    }}
                                  >
                                    {memberTeam.name}
                                  </span>
                                )}
                              </div>
                              {p.role && (
                                <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                                  {p.role}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                background: assignedCount > 0 ? "rgba(56, 189, 248, 0.12)" : "var(--jantt-border-subtle)",
                                color: assignedCount > 0 ? "var(--jantt-accent)" : "var(--jantt-text-muted)"
                              }}
                            >
                              {assignedCount} {assignedCount === 1 ? "task" : "tasks"}
                            </span>
                            {p.isInferred ? (
                              <button
                                onClick={() => handlePersistPerson(p)}
                                className="btn-nav"
                                style={{
                                  padding: "3px 8px",
                                  height: "26px",
                                  fontSize: "11px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px"
                                }}
                                title={`Add ${p.name} permanently to project JSON "people" array`}
                              >
                                <Plus size={11} />
                                <span>Save to JSON</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRemovePerson(p.id)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--jantt-text-muted)",
                                  cursor: "pointer",
                                  padding: "4px",
                                  borderRadius: "4px",
                                  display: "flex",
                                  alignItems: "center"
                                }}
                                title={`Remove ${p.name}`}
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
            </>
          ) : (
            <>
              {/* Add New Team / Squad Box */}
              <div style={{ background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", borderRadius: "10px", padding: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
                  Add New Team / Squad
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    className="code-textarea"
                    style={{
                      flex: "1 1 160px",
                      height: "38px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      fontFamily: "var(--jantt-font-sans)",
                      borderRadius: "8px",
                      border: "1px solid var(--jantt-border)",
                      boxSizing: "border-box"
                    }}
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTeam();
                    }}
                    placeholder="Team Name (e.g. Core Engineering)"
                  />
                  <input
                    type="color"
                    style={{
                      width: "38px",
                      height: "38px",
                      border: "1px solid var(--jantt-border)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      padding: "2px",
                      background: "var(--jantt-surface-solid)"
                    }}
                    value={newTeamColor}
                    onChange={(e) => setNewTeamColor(e.target.value)}
                    title="Pick Team Color"
                  />
                  <input
                    type="text"
                    className="code-textarea"
                    style={{
                      flex: "1 1 180px",
                      height: "38px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      fontFamily: "var(--jantt-font-sans)",
                      borderRadius: "8px",
                      border: "1px solid var(--jantt-border)",
                      boxSizing: "border-box"
                    }}
                    value={newTeamDesc}
                    onChange={(e) => setNewTeamDesc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTeam();
                    }}
                    placeholder="Description / Mission"
                  />
                  <button
                    className="btn-nav btn-nav-primary"
                    style={{ height: "38px", padding: "0 14px", flexShrink: 0 }}
                    onClick={handleAddTeam}
                    disabled={!newTeamName.trim()}
                  >
                    <Plus size={14} />
                    <span>Add Team</span>
                  </button>
                </div>
              </div>

              {/* Teams List */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "var(--jantt-text-muted)" }}>
                  Current Teams ({teams.length})
                </label>
                {teams.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--jantt-surface)", border: "1px dashed var(--jantt-border)", borderRadius: "10px", color: "var(--jantt-text-muted)" }}>
                    <Layers size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>No teams defined yet.</p>
                    <p style={{ margin: "4px 0 0 0", fontSize: "11.5px" }}>Create teams above to organize members and filter schedules by squad.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
                    {teams.map((tm) => {
                      const memberCount = effectivePeople.filter((p) => p.teamId === tm.id).length;
                      return (
                        <div
                          key={tm.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            background: "var(--jantt-surface)",
                            border: "1px solid var(--jantt-border)",
                            borderRadius: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              style={{
                                width: "14px",
                                height: "14px",
                                borderRadius: "50%",
                                background: tm.color || "var(--jantt-accent)",
                                display: "inline-block",
                                flexShrink: 0
                              }}
                            />
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                                  {tm.name}
                                </span>
                                <span style={{ fontSize: "10px", fontFamily: "var(--jantt-font-mono)", color: "var(--jantt-text-muted)" }}>
                                  #{tm.id}
                                </span>
                              </div>
                              {tm.description && (
                                <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                                  {tm.description}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                background: "rgba(56, 189, 248, 0.12)",
                                color: "var(--jantt-accent)"
                              }}
                            >
                              {memberCount} {memberCount === 1 ? "member" : "members"}
                            </span>
                            <button
                              onClick={() => handleRemoveTeam(tm.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--jantt-text-muted)",
                                cursor: "pointer",
                                padding: "4px",
                                borderRadius: "4px",
                                display: "flex",
                                alignItems: "center"
                              }}
                              title={`Remove ${tm.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="prompt-modal-footer">
          <span style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
            Teams and members are referenced by ID across your schedule.
          </span>
          <button
            className="btn-nav btn-nav-primary"
            onClick={() => setShowPeopleModal(false)}
          >
            <Check size={14} />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
