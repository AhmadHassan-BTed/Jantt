import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  Download,
  FileJson,
  Layers,
  Kanban,
  Users,
  Clock,
  FileSpreadsheet,
  Trash2,
  Plus,
  Cloud,
  RefreshCw,
  GitFork,
  CheckSquare,
  Share2,
  ChevronDown,
  ArrowUpFromLine,
  ArrowDownToLine,
  Save,
  Activity,
  StickyNote
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
  notesCount?: number;
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
  notesCount,
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
  const [ioDropdownOpen, setIoDropdownOpen] = useState(false);
  const ioDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!ioDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ioDropdownRef.current && !ioDropdownRef.current.contains(e.target as Node)) {
        setIoDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIoDropdownOpen(false);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [ioDropdownOpen]);

  return (
    <header className="navbar">
      {/* 1. Left Zone: Brand & AutoSave Status */}
      <div className="brand-section nav-group-left">
        <JanttLogo size={28} />
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
            type="button"
            className="btn-nav btn-restore-sidebar"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Expand JSON Editor Sidebar"
            style={{ marginLeft: "4px" }}
          >
            <FileJson size={13} />
            <span>Show JSON Editor</span>
          </button>
        )}
      </div>

      {/* 2. Center Zone: Primary View Switcher */}
      <div className="nav-group-center">
        <div className="jantt-scale-group">
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "gantt" ? "is-active" : ""}`}
            onClick={() => setActiveView("gantt")}
            title="Gantt Timeline Schedule"
          >
            <Layers size={13} />
            <span>Gantt</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "kanban" ? "is-active" : ""}`}
            onClick={() => setActiveView("kanban")}
            title="Kanban Task Board"
          >
            <Kanban size={13} />
            <span>Kanban</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "tasks" ? "is-active" : ""}`}
            onClick={() => setActiveView("tasks")}
            title="Detailed Tasks & Interactive Todo Checklist"
          >
            <CheckSquare size={13} />
            <span>Tasks</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "summary" ? "is-active" : ""}`}
            onClick={() => setActiveView("summary")}
            title="Project Health, Schedule Buffers, EVM & Budget Performance"
          >
            <Activity size={13} />
            <span>Health &amp; PM</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "notes" ? "is-active" : ""}`}
            onClick={() => setActiveView("notes")}
            title="Shared Project Notes, Specs & Documentation"
          >
            <StickyNote size={13} />
            <span>Notes</span>
            {typeof notesCount === "number" && notesCount > 0 && (
              <span
                style={{
                  fontSize: "9.5px",
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: "10px",
                  background: activeView === "notes" ? "rgba(255,255,255,0.28)" : "var(--jantt-border)",
                  color: activeView === "notes" ? "#FFFFFF" : "var(--jantt-text-muted)",
                  marginLeft: "2px"
                }}
              >
                {notesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Right Zone: Plan Control Center, People, Import/Export, Theme & AI Prompt */}
      <div className="nav-controls nav-group-right">
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
              type="button"
              className="btn-plan-action is-add"
              onClick={handleOpenAddPlanModal}
              title="Create a new blank plan, clone existing, or use a template"
            >
              <Plus size={13} />
              <span>Plan</span>
            </button>

            {/* Link Cloud Plan Button */}
            <button
              type="button"
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
                    type="button"
                    className="btn-plan-action is-sync"
                    onClick={handleSyncActiveProject}
                    disabled={isSyncingProject}
                    title={`Re-fetch and update this plan from the cloud URL (Last synced: ${formatRelativeTime(linkedActive.lastSyncedAt)})`}
                  >
                    <RefreshCw size={12} className={isSyncingProject ? "spin-sync-icon" : ""} />
                  </button>
                  <button
                    type="button"
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
          type="button"
          className="btn-nav"
          onClick={() => setShowPeopleModal(true)}
          title="Manage team members and assignees"
        >
          <Users size={13} />
          <span>People{effectivePeople.length > 0 ? ` (${effectivePeople.length})` : ""}</span>
        </button>

        {/* Hidden File Input for JSON Import */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json,application/json"
          onChange={(e) => {
            handleImportJsonFile(e);
            if (e.target) e.target.value = "";
          }}
          style={{ display: "none" }}
        />

        {/* Unified Import / Export Dropdown */}
        <div className="nav-io-dropdown" ref={ioDropdownRef}>
          <button
            type="button"
            className={`btn-nav nav-io-trigger ${ioDropdownOpen ? "is-open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setIoDropdownOpen((o) => !o);
            }}
            title="Import or export project data"
          >
            <Download size={13} />
            <span>Import / Export</span>
            <ChevronDown size={11} className={`nav-io-chevron ${ioDropdownOpen ? "is-open" : ""}`} />
          </button>

          {ioDropdownOpen && (
            <div className="nav-io-panel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="nav-io-item"
                onClick={() => {
                  fileInputRef.current?.click();
                  setIoDropdownOpen(false);
                }}
              >
                <ArrowUpFromLine size={14} />
                <div className="nav-io-item-text">
                  <span className="nav-io-item-label">Import JSON</span>
                  <span className="nav-io-item-desc">Load a .json file from your computer</span>
                </div>
              </button>
              <div className="nav-io-divider" />
              <button
                type="button"
                className="nav-io-item"
                onClick={() => {
                  handleDownloadJson();
                  setIoDropdownOpen(false);
                }}
              >
                <ArrowDownToLine size={14} />
                <div className="nav-io-item-text">
                  <span className="nav-io-item-label">Export as JSON</span>
                  <span className="nav-io-item-desc">Download the Jantt project file</span>
                </div>
              </button>
              <button
                type="button"
                className="nav-io-item"
                onClick={() => {
                  handleExportCsv();
                  setIoDropdownOpen(false);
                }}
              >
                <FileSpreadsheet size={14} />
                <div className="nav-io-item-text">
                  <span className="nav-io-item-label">Export as CSV</span>
                  <span className="nav-io-item-desc">Spreadsheet-compatible RFC-4180</span>
                </div>
              </button>
            </div>
          )}
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

        {/* Auto-Save & Storage Button */}
        <button
          type="button"
          className="btn-nav"
          onClick={() => setShowAutoSaveModal(true)}
          title="Configure Auto-Save Cadence & Storage"
        >
          <Save size={13} />
          <span>Auto-Save</span>
        </button>

        {/* Prompt AI Button */}
        <button
          type="button"
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
