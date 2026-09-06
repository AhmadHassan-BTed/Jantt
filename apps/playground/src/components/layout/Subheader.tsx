import React from "react";
import {
  FolderKanban,
  Plus,
  Share2,
  Trash2,
  Users,
  Layers,
  Radio,
  UserPlus,
  LogOut
} from "lucide-react";
import type { SavedProject, EffectivePerson } from "../../types";
import type { UserRoomPointer, RoomPresence } from "../../firebase/types";
import { DEFAULT_TEMPLATE } from "../../constants";

export interface SubheaderProps {
  activeProjectId: string;
  customProjects: SavedProject[];
  handleSelectProject: (id: string) => void;
  handleOpenAddPlanModal: () => void;
  setShowShareModal: (show: boolean) => void;
  setCopiedShareLink: (copied: boolean) => void;
  handleDeleteProject: (id: string) => void;
  setShowPeopleModal: (show: boolean) => void;
  effectivePeople: EffectivePerson[];
  ownedRooms?: UserRoomPointer[];
  sharedRooms?: UserRoomPointer[];
  onOpenPlanManager?: () => void;
  activeRoomId?: string | null;
  activeRoomRole?: "collaborator" | "viewer" | "none";
  activeRoomTitle?: string;
  onlineUsers?: RoomPresence[];
  onOpenShareRoom?: (roomId: string) => void;
  onLeaveCloudRoom?: (roomId: string) => void;
}

export const Subheader: React.FC<SubheaderProps> = ({
  activeProjectId,
  customProjects,
  handleSelectProject,
  handleOpenAddPlanModal,
  setShowShareModal,
  setCopiedShareLink,
  handleDeleteProject,
  setShowPeopleModal,
  effectivePeople,
  ownedRooms = [],
  sharedRooms = [],
  onOpenPlanManager,
  activeRoomId,
  activeRoomRole = "none",
  activeRoomTitle,
  onlineUsers = [],
  onOpenShareRoom,
  onLeaveCloudRoom
}) => {
  const isRoomActive = Boolean(activeRoomId);

  return (
    <div className="subheader-bar">
      {/* Left: Clean Plan Selector & Quick Management */}
      <div className="subheader-plan-section">
        <div className="subheader-plan-group">
          <div className="subheader-plan-select-wrap">
            <FolderKanban size={15} style={{ color: "var(--jantt-accent, #38BDF8)", flexShrink: 0 }} />
            <label htmlFor="subheader-project-select" className="subheader-plan-label">
              Plan:
            </label>
            <select
              id="subheader-project-select"
              className="select-input subheader-plan-select"
              value={activeProjectId}
              onChange={(e) => {
                const nextId = e.target.value;
                if (nextId && nextId !== activeProjectId) {
                  handleSelectProject(nextId);
                }
              }}
              title="Select Active Project Plan"
            >
              {/* Fallback option so browser never collapses activeProjectId to default if options are pending render */}
              {activeProjectId !== "default" &&
                !customProjects.some((p) => p.id === activeProjectId) &&
                !ownedRooms.some((r) => `room-${r.roomId}` === activeProjectId) &&
                !sharedRooms.some((s) => `room-${s.roomId}` === activeProjectId) && (
                  <option value={activeProjectId} style={{ display: "none" }}>
                    Active Plan
                  </option>
                )}
              <optgroup label="Templates">
                <option value="default">{DEFAULT_TEMPLATE.name}</option>
              </optgroup>
              {ownedRooms.length > 0 && (
                <optgroup label={`👑 My Rooms (${ownedRooms.length})`}>
                  {ownedRooms.map((r) => (
                    <option key={`room-${r.roomId}`} value={`room-${r.roomId}`}>
                      {r.title} (Owner • {r.roomId})
                    </option>
                  ))}
                </optgroup>
              )}
              {sharedRooms.length > 0 && (
                <optgroup label={`👥 Shared With Me (${sharedRooms.length})`}>
                  {sharedRooms.map((r) => (
                    <option key={`room-${r.roomId}`} value={`room-${r.roomId}`}>
                      {r.title} (@{r.ownerUsername} • {r.role === "editor" ? "Editor" : "Viewer"})
                    </option>
                  ))}
                </optgroup>
              )}
              {customProjects.filter(
                (p) =>
                  p.source === "room" &&
                  !ownedRooms.some((o) => `room-${o.roomId}` === p.id) &&
                  !sharedRooms.some((s) => `room-${s.roomId}` === p.id)
              ).length > 0 && (
                <optgroup label="Other Cloud Rooms">
                  {customProjects
                    .filter(
                      (p) =>
                        p.source === "room" &&
                        !ownedRooms.some((o) => `room-${o.roomId}` === p.id) &&
                        !sharedRooms.some((s) => `room-${s.roomId}` === p.id)
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Room: {p.roomId} • {p.role === "collaborator" ? "Collaborator" : "Viewer"} • {p.data?.tasks?.length || 0} tasks)
                      </option>
                    ))}
                </optgroup>
              )}
              {customProjects.filter((p) => p.source !== "room").length > 0 && (
                <optgroup label={`Local Plans (${customProjects.filter((p) => p.source !== "room").length})`}>
                  {customProjects
                    .filter((p) => p.source !== "room")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.data?.tasks?.length || 0} tasks)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="subheader-plan-actions">
            {/* Manage Plans Button */}
            {onOpenPlanManager && (
              <button
                type="button"
                className="btn-plan-action is-manage"
                onClick={onOpenPlanManager}
                title="Open Plan Manager: View all 3 lists (Local, Owned, Shared), drag & drop, and organize"
              >
                <Layers size={13} />
                <span>Manage Plans</span>
              </button>
            )}

            {/* + Add Plan Button */}
            <button
              type="button"
              className="btn-plan-action is-add"
              onClick={handleOpenAddPlanModal}
              title="Create a new blank plan, clone existing, or create cloud room"
            >
              <Plus size={13} />
              <span>New Plan</span>
            </button>

            {/* Delete Active Plan Button */}
            {activeProjectId !== "default" && (
              <button
                type="button"
                className="btn-plan-action is-delete"
                style={{ color: "#EF4444" }}
                onClick={() => handleDeleteProject(activeProjectId)}
                title="Delete this plan"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Center Live Room Badge (when inside a Cloud Room) */}
        {isRoomActive && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginLeft: "12px",
              padding: "4px 10px",
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.35)",
              borderRadius: "20px",
              fontSize: "12px"
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#22C55E",
                boxShadow: "0 0 6px #22C55E",
                display: "inline-block"
              }}
            />
            <Radio size={12} color="#22C55E" />
            <span style={{ fontWeight: 600, color: "var(--jantt-text, #F8FAFC)" }}>
              {activeRoomTitle || activeRoomId}
            </span>
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: "10px",
                background: activeRoomRole === "collaborator" ? "rgba(56, 189, 248, 0.2)" : "rgba(148, 163, 184, 0.2)",
                color: activeRoomRole === "collaborator" ? "#38BDF8" : "#94A3B8"
              }}
            >
              {activeRoomRole === "collaborator" ? "Editor" : "Viewer"}
            </span>

            {onlineUsers.length > 0 && (
              <span style={{ fontSize: "11px", color: "var(--jantt-text-muted, #94A3B8)" }}>
                {onlineUsers.length} online
              </span>
            )}

            {activeRoomId && onOpenShareRoom && (
              <button
                type="button"
                className="btn-plan-action"
                style={{
                  height: "22px",
                  padding: "0 7px",
                  fontSize: "11px",
                  background: "rgba(34, 197, 94, 0.2)",
                  color: "#22C55E",
                  border: "1px solid rgba(34, 197, 94, 0.4)",
                  borderRadius: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                onClick={() => onOpenShareRoom(activeRoomId)}
                title="Invite collaborators & teams to this room"
              >
                <UserPlus size={11} />
                <span>Invite</span>
              </button>
            )}

            {activeRoomId && onLeaveCloudRoom && (
              <button
                type="button"
                className="btn-plan-action"
                style={{
                  height: "22px",
                  padding: "0 6px",
                  fontSize: "11px",
                  color: "#EF4444",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px"
                }}
                onClick={() => onLeaveCloudRoom(activeRoomId)}
                title="Leave this cloud room"
              >
                <LogOut size={11} />
                <span>Leave</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Quick Share & People / Teams */}
      <div className="subheader-people-section" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Share Active Plan Button */}
        <button
          type="button"
          className="btn-plan-action is-share"
          onClick={() => {
            setShowShareModal(true);
            setCopiedShareLink(false);
          }}
          title="Share plan via link, WhatsApp, or JSON"
          style={{
            height: "30px",
            padding: "0 10px",
            background: "var(--jantt-surface-solid, rgba(21, 34, 56, 0.9))",
            border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.12))",
            borderRadius: "7px",
            color: "var(--jantt-text, #F8FAFC)"
          }}
        >
          <Share2 size={13} style={{ color: "var(--jantt-accent, #38BDF8)" }} />
          <span>Share</span>
        </button>

        {/* People & Teams Modal Trigger Button */}
        <button
          type="button"
          className="subheader-btn-people"
          onClick={() => setShowPeopleModal(true)}
          title="Manage team members, roles, and task assignees"
        >
          <Users size={14} style={{ color: "var(--jantt-accent, #38BDF8)" }} />
          <span className="subheader-people-title">People &amp; Teams</span>
          <span className="subheader-people-count-pill">
            {effectivePeople.length}
          </span>
        </button>

        {/* Quick Collaborators Avatar Stack */}
        {effectivePeople.length > 0 && (
          <div
            className="subheader-avatar-stack"
            onClick={() => setShowPeopleModal(true)}
            title="Click to view and manage team members"
          >
            {effectivePeople.slice(0, 4).map((person) => {
              const initials = (person.name || "U")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return (
                <div
                  key={person.id}
                  className="subheader-avatar-pill"
                  style={{ backgroundColor: person.color || "var(--jantt-accent, #38BDF8)" }}
                  title={`${person.name}${person.role ? ` (${person.role})` : ""}${person.teamName ? ` • ${person.teamName}` : ""}`}
                >
                  {initials}
                </div>
              );
            })}
            {effectivePeople.length > 4 && (
              <div className="subheader-avatar-more" title={`${effectivePeople.length - 4} more team members`}>
                +{effectivePeople.length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

