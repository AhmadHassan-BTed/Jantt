import React from "react";
import {
  Sparkles,
  CheckCircle2,
  Download,
  FileJson,
  Layers,
  Kanban,
  PieChart,
  Users,
  Clock,
  FileSpreadsheet,
  Trash2,
  Upload,
  Plus,
  Cloud,
  RefreshCw,
  GitFork,
  CheckSquare,
  Share2
} from "lucide-react";
import { JanttLogo } from "./JanttLogo";
import type { SavedProject, ActiveView, EffectivePerson } from "../types";
import { DEFAULT_TEMPLATE, AVAILABLE_THEMES } from "../constants";
import { formatRelativeTime } from "../utils";

interface NavbarProps {
  saveStatus: "saved" | "saving" | "pending";
  lastSavedAt: Date;
  autoSaveInterval: string;
  autoSaveLabel: string;
  setShowAutoSaveModal: (show: boolean) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
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
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImportJsonFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDownloadJson: () => void;
  handleExportCsv: () => void;
  selectedThemeId: string;
  setSelectedThemeId: (themeId: string) => void;
  setShowPromptModal: (show: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  saveStatus,
  lastSavedAt,
  autoSaveInterval,
  autoSaveLabel,
  setShowAutoSaveModal,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  activeView,
  setActiveView,
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
  effectivePeople,
  fileInputRef,
  handleImportJsonFile,
  handleDownloadJson,
  handleExportCsv,
  selectedThemeId,
  setSelectedThemeId,
  setShowPromptModal
}) => {
  return (
    <header className="navbar">
      <div className="brand-section">
        <JanttLogo size={28} />
        <span className="brand-badge">v1.1.1</span>
        <button
          type="button"
          className={`btn-autosave-badge is-${saveStatus}`}
          onClick={() => setShowAutoSaveModal(true)}
          title={`Last auto-saved: ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} • Cadence: ${autoSaveInterval} • Click to configure`}
        >
          {saveStatus === "saving" ? (
            <RefreshCw size={11} className="spin-sync-icon" />
          ) : saveStatus === "pending" ? (
            <Clock size={11} />
          ) : (
            <CheckCircle2 size={11} />
          )}
          <span>{autoSaveLabel}</span>
        </button>
        {isSidebarCollapsed && (
          <button
            className="btn-nav btn-restore-sidebar"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Expand JSON Editor Sidebar"
            style={{ marginLeft: "8px" }}
          >
            <FileJson size={13} />
            <span>Show JSON Editor</span>
          </button>
        )}
      </div>

      <div className="nav-controls">
        {/* View Switcher: Gantt Timeline, Kanban Board, Detailed Tasks, Budget & Analytics */}
        <div className="jantt-scale-group" style={{ margin: "0 6px" }}>
          <button
            className={`jantt-scale-btn ${activeView === "gantt" ? "is-active" : ""}`}
            onClick={() => setActiveView("gantt")}
            title="Gantt Timeline Schedule"
          >
            <Layers size={13} />
            <span>Gantt</span>
          </button>
          <button
            className={`jantt-scale-btn ${activeView === "kanban" ? "is-active" : ""}`}
            onClick={() => setActiveView("kanban")}
            title="Kanban Task Board"
          >
            <Kanban size={13} />
            <span>Kanban</span>
          </button>
          <button
            className={`jantt-scale-btn ${activeView === "tasks" ? "is-active" : ""}`}
            onClick={() => setActiveView("tasks")}
            title="Detailed Tasks & Interactive Todo Checklist"
          >
            <CheckSquare size={13} />
            <span>Tasks</span>
          </button>
          <button
            className={`jantt-scale-btn ${activeView === "summary" ? "is-active" : ""}`}
            onClick={() => setActiveView("summary")}
            title="Project Budget & Performance Analytics"
          >
            <PieChart size={13} />
            <span>Budget &amp; KPI</span>
          </button>
        </div>

        {/* Plan Control Center — Grouped Cohesive Unit */}
        <div className="nav-plan-group">
          <div className="nav-plan-select-wrap">
            <label htmlFor="project-select" className="nav-plan-label">Plan:</label>
            <select
              id="project-select"
              className="select-input nav-plan-select"
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

          <div className="nav-plan-actions">
            {/* + Add Plan Button */}
            <button
              className="btn-plan-action is-add"
              onClick={handleOpenAddPlanModal}
              title="Create a new blank plan, clone existing, or use a template"
            >
              <Plus size={13} />
              <span>Plan</span>
            </button>

            {/* Link Cloud Plan Button */}
            <button
              className="btn-plan-action"
              onClick={handleOpenLinkCloudModal}
              title="Link and sync a remote plan from Google Drive, GitHub, Dropbox or direct URL"
            >
              <Cloud size={13} style={{ color: "var(--jantt-accent)" }} />
            </button>

            {/* Linked Cloud Plan Controls (when active plan is linked) */}
            {customProjects.some((p) => p.id === activeProjectId && p.source === "linked") && (() => {
              const linkedActive = customProjects.find((p) => p.id === activeProjectId)!;
              return (
                <>
                  <button
                    className="btn-plan-action is-sync"
                    onClick={handleSyncActiveProject}
                    disabled={isSyncingProject}
                    title={`Re-fetch and update this plan from the cloud URL (Last synced: ${formatRelativeTime(linkedActive.lastSyncedAt)})`}
                  >
                    <RefreshCw size={12} className={isSyncingProject ? "spin-sync-icon" : ""} />
                  </button>
                  <button
                    className="btn-plan-action"
                    onClick={handleForkToLocalPlan}
                    title="Create an editable local copy of this cloud plan"
                  >
                    <GitFork size={12} />
                  </button>
                </>
              );
            })()}

            {/* Share Active Plan Button */}
            <button
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
                className="btn-plan-action is-delete"
                style={{ color: "#EF4444" }}
                onClick={() => handleDeleteProject(activeProjectId)}
                title={
                  customProjects.find((p) => p.id === activeProjectId)?.source === "linked"
                    ? "Unlink this cloud plan from browser storage"
                    : "Delete this custom plan from browser memory"
                }
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* People (Team) Manager Button */}
        <button
          className="btn-nav"
          onClick={() => setShowPeopleModal(true)}
          title="Manage team members and assignees"
        >
          <Users size={13} />
          <span>People{effectivePeople.length > 0 ? ` (${effectivePeople.length})` : ""}</span>
        </button>

        {/* Data I/O Group (Import & Export) */}
        <div className="nav-io-group">
          {/* Hidden File Input for JSON Import */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            onChange={handleImportJsonFile}
            style={{ display: "none" }}
          />

          {/* Import JSON Button */}
          <button
            className="btn-nav"
            onClick={() => fileInputRef.current?.click()}
            title="Import a Jantt JSON file from your computer"
          >
            <Upload size={13} />
            <span>Import</span>
          </button>

          <div className="nav-export-split">
            {/* Download JSON Button */}
            <button className="btn-nav" onClick={handleDownloadJson} title="Download Jantt JSON file">
              <Download size={13} />
              <span>JSON</span>
            </button>

            {/* Export CSV Button */}
            <button className="btn-nav" onClick={handleExportCsv} title="Export RFC-4180 CSV / Excel spreadsheet">
              <FileSpreadsheet size={13} />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Theme Selector */}
        <div className="nav-select-group">
          <label htmlFor="theme-select">Theme:</label>
          <select
            id="theme-select"
            className="select-input"
            value={selectedThemeId}
            onChange={(e) => setSelectedThemeId(e.target.value)}
          >
            {AVAILABLE_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Prompt AI Button */}
        <button
          className="btn-prompt"
          onClick={() => setShowPromptModal(true)}
          title="Generate AI Prompt for LLM output"
        >
          <Sparkles size={14} />
          <span>AI Prompt</span>
        </button>
      </div>
    </header>
  );
};
