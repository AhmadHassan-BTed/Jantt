import React from "react";
import {
  Sparkles,
  CheckCircle2,
  FileJson,
  Layers,
  Kanban,
  Clock,
  RefreshCw,
  CheckSquare,
  Activity,
  StickyNote,
  History,
  ShieldCheck,
  HardDrive,
  Cloud,
  AlertTriangle
} from "lucide-react";
import { JanttLogo } from "./JanttLogo";
import type { ActiveView } from "../types";
import { AVAILABLE_THEMES } from "../constants";
import type { SyncStatus } from "../hooks/useDynamicSync";

interface NavbarProps {
  saveStatus: "saved" | "saving" | "pending";
  lastSavedAt: Date;
  autoSaveInterval: string;
  autoSaveLabel: string;
  setShowAutoSaveModal: (show: boolean) => void;
  syncStatus?: SyncStatus;
  syncMessage?: string;
  isQuotaShieldActive?: boolean;
  cloudProvider?: string;
  isGoogleDrive?: boolean;
  snapshotsCount?: number;
  setShowVersionHistoryModal?: (show: boolean) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  notesCount?: number;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImportJsonFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  syncStatus,
  syncMessage,
  isQuotaShieldActive,
  cloudProvider,
  isGoogleDrive = false,
  snapshotsCount = 0,
  setShowVersionHistoryModal,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  activeView,
  setActiveView,
  notesCount,
  fileInputRef,
  handleImportJsonFile,
  selectedThemeId,
  setSelectedThemeId,
  setShowPromptModal
}) => {
  const isGdrive = isGoogleDrive || cloudProvider === "google-drive";

  return (
    <header className="navbar">
      {/* 1. Left Zone: Brand, AutoSave Status, Dynamic Sync & Version History */}
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

        {/* Dynamic Real-Time Collaboration Sync Badge */}
        {syncStatus && (
          <div
            className={`btn-sync-badge is-${syncStatus}`}
            title={
              syncStatus === "draft"
                ? "This linked cloud source is read-only (view access). Your edits are saved in browser storage, but not written to Google Drive."
                : `Real-Time Collaboration Sync: ${syncMessage || "Live"} • Continuous change detection active`
            }
          >
            {syncStatus === "draft" ? (
              <AlertTriangle size={11} style={{ marginRight: 4, flexShrink: 0 }} />
            ) : (
              <span className="sync-pulse-dot" />
            )}
            <span>{syncMessage || "In sync"}</span>
          </div>
        )}

        {/* Google Drive Source Indicator */}
        {isGdrive && (
          <div
            className="btn-cloud-source-badge is-google-drive"
            title="Linked to Google Drive JSON file (Read-Only Cloud Feed). Changes you make are stored locally in your browser."
          >
            <HardDrive size={11} />
            <span>Google Drive (View Feed)</span>
          </div>
        )}

        {/* Other Cloud Provider Indicator */}
        {cloudProvider && !isGdrive && (
          <div
            className="btn-cloud-source-badge"
            title={`Linked to ${cloudProvider} file (Read-Only Cloud Feed). Changes you make are stored locally in your browser.`}
          >
            <Cloud size={11} />
            <span>{cloudProvider} (View Feed)</span>
          </div>
        )}

        {/* Serverless Quota Shield Indicator */}
        {isQuotaShieldActive && (
          <div
            className="btn-quota-shield-badge"
            title="Google Drive Quota Shield is ACTIVE: Request coalescing and edge cache fallback engaged to protect against rate limits (429/403)."
          >
            <ShieldCheck size={11} />
            <span>Quota Shield</span>
          </div>
        )}

        {/* Version History & Recovery Vault Button */}
        {setShowVersionHistoryModal && (
          <button
            type="button"
            className="btn-nav btn-version-history"
            onClick={() => setShowVersionHistoryModal(true)}
            title="Version History & Recovery Vault (Roll back to past snapshots with zero data loss)"
          >
            <History size={12} />
            <span>History</span>
            {snapshotsCount > 0 && (
              <span className="history-count-badge">{snapshotsCount}</span>
            )}
          </button>
        )}

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
                  background: activeView === "notes" ? "rgba(0,0,0,0.18)" : "var(--jantt-border)",
                  color: activeView === "notes" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
                  marginLeft: "2px"
                }}
              >
                {notesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Right Zone: Theme Selector & AI Prompt */}
      <div className="nav-controls nav-group-right">
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

        {/* Theme Selector — Sectioned by Dark Mode & Light Mode */}
        <div className="nav-select-group">
          <label htmlFor="theme-select">Theme:</label>
          <select
            id="theme-select"
            className="select-input"
            value={selectedThemeId}
            onChange={(e) => setSelectedThemeId(e.target.value)}
            title="Visual Theme (Sectioned by Dark & Light Modes)"
          >
            <optgroup label="Dark Modes">
              {AVAILABLE_THEMES.filter((t) => t.mode === "dark").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Light Modes">
              {AVAILABLE_THEMES.filter((t) => t.mode === "light").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

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
