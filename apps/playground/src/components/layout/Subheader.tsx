import React from "react";
import {
  FolderKanban,
  Plus,
  Share2,
  Trash2,
  Users
} from "lucide-react";
import type { SavedProject, EffectivePerson } from "../../types";
import type { UserRoomPointer } from "../../firebase/types";
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
  sharedRooms = []
}) => {
  return (
    <div className="subheader-bar">
      {/* Left: Expanded Plan Management Section */}
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
              onChange={(e) => handleSelectProject(e.target.value)}
              title="Select Active Project Plan"
            >
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
            {/* + Add Plan Button */}
            <button
              type="button"
              className="btn-plan-action is-add"
              onClick={handleOpenAddPlanModal}
              title="Create a new blank plan, clone existing, or use a template"
            >
              <Plus size={13} />
              <span>New Plan</span>
            </button>

            {/* Export / Share Active Plan Button */}
            <button
              type="button"
              className="btn-plan-action is-share"
              onClick={() => {
                setShowShareModal(true);
                setCopiedShareLink(false);
              }}
              title="Export or share this project plan via compressed link, WhatsApp, or JSON file"
            >
              <Share2 size={12} />
              <span>Export / Share</span>
            </button>

            {/* Delete Active Plan Button */}
            {activeProjectId !== "default" && (
              <button
                type="button"
                className="btn-plan-action is-delete"
                style={{ color: "#EF4444" }}
                onClick={() => handleDeleteProject(activeProjectId)}
                title="Delete this custom plan from browser memory"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: People & Team Collaborators Section */}
      <div className="subheader-people-section">
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
