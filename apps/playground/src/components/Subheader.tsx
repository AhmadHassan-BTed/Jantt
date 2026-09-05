import React from "react";
import {
  FolderKanban,
  Plus,
  Cloud,
  RefreshCw,
  GitFork,
  Share2,
  Trash2,
  Users
} from "lucide-react";
import type { SavedProject, EffectivePerson } from "../types";
import { DEFAULT_TEMPLATE } from "../constants";
import { formatRelativeTime } from "../utils";

export interface SubheaderProps {
  activeProjectId: string;
  customProjects: SavedProject[];
  handleSelectProject: (id: string) => void;
  handleOpenAddPlanModal: () => void;
  handleOpenLinkCloudModal: () => void;
  isSyncingProject: boolean;
  handleSyncActiveProject: () => void;
  handleForkToLocalPlan: () => void;
  setShowShareModal: (show: boolean) => void;
  setCopiedShareLink: (copied: boolean) => void;
  handleDeleteProject: (id: string) => void;
  setShowPeopleModal: (show: boolean) => void;
  effectivePeople: EffectivePerson[];
}

export const Subheader: React.FC<SubheaderProps> = ({
  activeProjectId,
  customProjects,
  handleSelectProject,
  handleOpenAddPlanModal,
  handleOpenLinkCloudModal,
  isSyncingProject,
  handleSyncActiveProject,
  handleForkToLocalPlan,
  setShowShareModal,
  setCopiedShareLink,
  handleDeleteProject,
  setShowPeopleModal,
  effectivePeople
}) => {
  const activeProject = customProjects.find((p) => p.id === activeProjectId);
  const isLinked = activeProject?.source === "linked";

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
              {customProjects.filter((p) => p.source !== "linked").length > 0 && (
                <optgroup label={`Local Plans (${customProjects.filter((p) => p.source !== "linked").length})`}>
                  {customProjects
                    .filter((p) => p.source !== "linked")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.data?.tasks?.length || 0} tasks)
                      </option>
                    ))}
                </optgroup>
              )}
              {customProjects.filter((p) => p.source === "linked").length > 0 && (
                <optgroup label={`Linked Cloud Plans (${customProjects.filter((p) => p.source === "linked").length})`}>
                  {customProjects
                    .filter((p) => p.source === "linked")
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

            {/* Link Cloud Plan Button */}
            <button
              type="button"
              className="btn-plan-action is-cloud"
              onClick={handleOpenLinkCloudModal}
              title="Link and sync a remote plan from Google Drive, GitHub, Dropbox or direct URL"
            >
              <Cloud size={13} style={{ color: "var(--jantt-accent)" }} />
              <span>Link Cloud</span>
            </button>

            {/* Linked Cloud Plan Controls */}
            {isLinked && activeProject && (
              <>
                <button
                  type="button"
                  className="btn-plan-action is-sync"
                  onClick={handleSyncActiveProject}
                  disabled={isSyncingProject}
                  title={`Re-fetch and update this plan from the cloud URL (Last synced: ${formatRelativeTime(activeProject.lastSyncedAt)})`}
                >
                  <RefreshCw size={12} className={isSyncingProject ? "spin-sync-icon" : ""} />
                  <span>Sync</span>
                </button>
                <button
                  type="button"
                  className="btn-plan-action"
                  onClick={handleForkToLocalPlan}
                  title="Create an editable local copy of this cloud plan"
                >
                  <GitFork size={12} />
                  <span>Fork</span>
                </button>
              </>
            )}

            {/* Share Active Plan Button */}
            <button
              type="button"
              className="btn-plan-action is-share"
              onClick={() => {
                setShowShareModal(true);
                setCopiedShareLink(false);
              }}
              title="Share this project plan via link or open source"
            >
              <Share2 size={12} />
              <span>Share</span>
            </button>

            {/* Delete / Unlink Active Plan Button */}
            {activeProjectId !== "default" && (
              <button
                type="button"
                className="btn-plan-action is-delete"
                style={{ color: "#EF4444" }}
                onClick={() => handleDeleteProject(activeProjectId)}
                title={
                  isLinked
                    ? "Unlink this cloud plan from browser storage"
                    : "Delete this custom plan from browser memory"
                }
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
