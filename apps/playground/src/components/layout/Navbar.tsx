import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Layers,
  Clock,
  RefreshCw,
  History,
  Star,
  Cloud,
  LogOut,
  Eye,
  KeyRound,
  Search,
  HelpCircle,
  ChevronDown,
  Check,
  Plus,
  Upload,
  Trash2,
  Share2,
  Users,
  FolderKanban,
  DoorOpen,
  Loader2,
  Palette,
  PanelLeft,
  Download
} from "lucide-react";
import { themeManager } from "@jantt/core";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserProfile, UserRoomPointer } from "../../firebase/types";
import type { RoomSyncStatus } from "../../hooks/useRoomSync";
import { JanttLogo } from "../common/JanttLogo";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n";
import { themeDescription } from "../../i18n/theme";
import { PRIMARY_MODIFIER_LABEL } from "../common/CommandPalette";
import type { SavedProject } from "../../types";
import { AVAILABLE_THEMES, DEFAULT_TEMPLATE } from "../../constants";
import { RoomPresenceStack } from "../cloud/RoomPresenceStack";
import type { RoomPresence } from "../../firebase/types";
import { getTrustedAvatarUrl } from "../../room-storage";

/**
 * Content rendered inside a popover or sheet. A function receives `close`, to call after an
 * action that opens another surface (a dialog, a sign-in popup).
 */
export type PanelSlot = React.ReactNode | ((close: () => void) => React.ReactNode);

export function renderPanelSlot(slot: PanelSlot, close: () => void): React.ReactNode {
  return typeof slot === "function" ? slot(close) : slot;
}

/* -------------------------------------------------------------------------- */
/* Anchored popover                                                            */
/* -------------------------------------------------------------------------- */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Minimum gap between a popover panel and the viewport edge. */
const VIEWPORT_MARGIN = 8;

interface NavPopoverProps {
  id: string;
  /** Accessible name of the popover dialog. */
  label: string;
  triggerClassName?: string;
  triggerTitle?: string;
  triggerAriaLabel?: string;
  triggerContent: React.ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
  /** Receives `close(restoreFocus)`; actions that open a dialog close without restoring focus. */
  children: (close: (restoreFocus?: boolean) => void) => React.ReactNode;
}

/**
 * Non-modal popover anchored under its trigger button: opens on click, closes on outside click,
 * Escape (focus returns to the trigger) or when focus leaves it. Arrow keys move between items.
 */
const NavPopover: React.FC<NavPopoverProps> = ({
  id,
  label,
  triggerClassName = "",
  triggerTitle,
  triggerAriaLabel,
  triggerContent,
  align = "start",
  panelClassName = "",
  children
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Keep the panel on screen: it stays anchored to its trigger and only shifts sideways as far
  // as needed (narrow windows, a trigger near the edge). Re-measured on resize.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const wrap = wrapRef.current;
    if (!panel || !wrap) return;
    const place = () => {
      panel.style.left = "";
      panel.style.right = "";
      const rect = panel.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      let shift = 0;
      if (rect.right > viewportWidth - VIEWPORT_MARGIN) shift = viewportWidth - VIEWPORT_MARGIN - rect.right;
      if (rect.left + shift < VIEWPORT_MARGIN) shift = VIEWPORT_MARGIN - rect.left;
      if (shift === 0) return;
      panel.style.left = `${Math.round(rect.left + shift - wrap.getBoundingClientRect().left)}px`;
      panel.style.right = "auto";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const initial =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ||
      panel?.querySelector<HTMLElement>('[aria-current="true"]') ||
      panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (initial || panel)?.focus();

    const handlePointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const panel = panelRef.current;
    if (!panel) return;
    // Let text inputs keep Home/End for caret movement.
    if ((e.key === "Home" || e.key === "End") && (e.target as HTMLElement).tagName === "INPUT") return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>("[data-popover-item]:not([disabled])"));
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (e.key === "End") next = items.length - 1;
    else if (e.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
    else if (e.key === "ArrowUp") next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div
      ref={wrapRef}
      className={`nav-popover ${isOpen ? "is-open" : ""}`}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (isOpen && next && wrapRef.current && !wrapRef.current.contains(next)) setIsOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`nav-popover-trigger ${triggerClassName} ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={isOpen ? undefined : triggerTitle}
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
      >
        {triggerContent}
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={`nav-popover-panel is-align-${align} ${panelClassName}`}
          onKeyDown={handlePanelKeyDown}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Plan switcher                                                               */
/* -------------------------------------------------------------------------- */

interface PlanEntry {
  id: string;
  name: string;
  meta: string;
}

interface PlanGroup {
  id: "local" | "owned" | "shared";
  label: string;
  emptyText: string;
  entries: PlanEntry[];
}

function countLiveTasks(project: SavedProject): number {
  return (project.data?.tasks || []).filter((t) => !t._deleted).length;
}

/** Exactly three lists: local plans, rooms I own, rooms shared with me (incl. cached room copies). */
function buildPlanGroups(
  customProjects: SavedProject[],
  ownedRooms: UserRoomPointer[],
  sharedRooms: UserRoomPointer[],
  t: (key: MessageKey, params?: Record<string, string | number>) => string
): PlanGroup[] {
  const ownedIds = new Set(ownedRooms.map((r) => `room-${r.roomId}`));
  const sharedIds = new Set(sharedRooms.map((r) => `room-${r.roomId}`));

  const local: PlanEntry[] = [
    { id: "default", name: DEFAULT_TEMPLATE.name, meta: t("nav.builtInTemplate") },
    ...customProjects
      .filter((p) => p.source !== "room")
      .map((p) => {
        const count = countLiveTasks(p);
        return {
          id: p.id,
          name: p.name,
          meta: count === 1 ? t("nav.taskCountOne", { count }) : t("nav.taskCount", { count })
        };
      })
  ];

  const owned: PlanEntry[] = ownedRooms.map((r) => ({ id: `room-${r.roomId}`, name: r.title, meta: t("nav.owner") }));

  const shared: PlanEntry[] = [
    ...sharedRooms.map((r) => ({
      id: `room-${r.roomId}`,
      name: r.title,
      meta: t("nav.roomRoleMeta", {
        user: r.ownerUsername,
        role: r.role === "editor" ? t("nav.editorRole") : t("nav.viewerRole")
      })
    })),
    ...customProjects
      .filter((p) => p.source === "room" && !ownedIds.has(p.id) && !sharedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        meta: p.role === "collaborator" ? t("nav.roomEditor") : t("nav.roomViewer")
      }))
  ];

  return [
    { id: "local", label: t("nav.groupLocal"), emptyText: t("nav.groupLocalEmpty"), entries: local },
    { id: "owned", label: t("nav.groupOwned"), emptyText: t("nav.groupOwnedEmpty"), entries: owned },
    { id: "shared", label: t("nav.groupShared"), emptyText: t("nav.groupSharedEmpty"), entries: shared }
  ];
}

/** Shows a search box once the lists get long enough to need one. */
const PLAN_SEARCH_THRESHOLD = 8;

interface PlanSwitcherBodyProps {
  close: (restoreFocus?: boolean) => void;
  activeProjectId: string;
  activePlanName: string;
  customProjects: SavedProject[];
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  onSelectProject: (id: string) => void;
  onNewPlan: () => void;
  onImportFile: () => void;
  onOpenPlanManager: () => void;
  onDeleteActivePlan?: () => void;
}

const PlanSwitcherBody: React.FC<PlanSwitcherBodyProps> = ({
  close,
  activeProjectId,
  activePlanName,
  customProjects,
  ownedRooms,
  sharedRooms,
  onSelectProject,
  onNewPlan,
  onImportFile,
  onOpenPlanManager,
  onDeleteActivePlan
}) => {
  const [query, setQuery] = useState("");
  const { t } = useI18n();
  const groups = useMemo(
    () => buildPlanGroups(customProjects, ownedRooms, sharedRooms, t),
    [customProjects, ownedRooms, sharedRooms, t]
  );
  const total = groups.reduce((sum, g) => sum + g.entries.length, 0);
  const q = query.trim().toLowerCase();
  const visibleGroups = q
    ? groups.map((g) => ({
        ...g,
        entries: g.entries.filter((e) => e.name.toLowerCase().includes(q) || e.meta.toLowerCase().includes(q))
      }))
    : groups;

  const act = (fn: () => void) => () => {
    close(false);
    fn();
  };

  return (
    <div className="plan-switcher">
      <div className="nav-popover-header">
        <span className="nav-popover-title">{t("nav.switchPlan")}</span>
        <span className="nav-popover-subtitle">{t("nav.availableCount", { count: total })}</span>
      </div>

      {total > PLAN_SEARCH_THRESHOLD && (
        <div className="plan-switcher-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("nav.filterPlans")}
            aria-label={t("nav.filterPlansAria")}
            data-popover-item
            data-autofocus
          />
        </div>
      )}

      <div className="plan-switcher-lists">
        {visibleGroups.map((group) => (
          <div key={group.id} className="plan-switcher-group" role="group" aria-labelledby={`plan-group-${group.id}`}>
            <div className="plan-switcher-group-label" id={`plan-group-${group.id}`}>
              <span>{group.label}</span>
              <span className="plan-switcher-group-count">{group.entries.length}</span>
            </div>
            {group.entries.length === 0 ? (
              <div className="plan-switcher-empty">{q ? t("nav.noMatch") : group.emptyText}</div>
            ) : (
              group.entries.map((entry) => {
                const isActive = entry.id === activeProjectId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`plan-switcher-item ${isActive ? "is-active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    data-popover-item
                    onClick={() => {
                      close(true);
                      if (!isActive) onSelectProject(entry.id);
                    }}
                  >
                    <span className="plan-switcher-item-text">
                      <span className="plan-switcher-item-name">{entry.name}</span>
                      <span className="plan-switcher-item-meta">{entry.meta}</span>
                    </span>
                    {isActive && <Check size={14} className="plan-switcher-check" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
        ))}
      </div>

      <div className="nav-popover-footer">
        <button type="button" className="nav-popover-action" data-popover-item onClick={act(onNewPlan)}>
          <Plus size={14} aria-hidden="true" />
          <span>{t("nav.newPlan")}</span>
        </button>
        <button type="button" className="nav-popover-action" data-popover-item onClick={act(onImportFile)}>
          <Upload size={14} aria-hidden="true" />
          <span>{t("nav.importFile")}</span>
        </button>
        <button type="button" className="nav-popover-action" data-popover-item onClick={act(onOpenPlanManager)}>
          <Layers size={14} aria-hidden="true" />
          <span>{t("nav.managePlans")}</span>
        </button>
        {onDeleteActivePlan && (
          <button
            type="button"
            className="nav-popover-action is-danger"
            data-popover-item
            onClick={act(onDeleteActivePlan)}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span className="nav-popover-action-text">{t("nav.deletePlan", { name: activePlanName })}</span>
          </button>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Theme menu                                                                  */
/* -------------------------------------------------------------------------- */

interface ThemeMenuBodyProps {
  selectedThemeId: string;
  onSelectTheme: (themeId: string) => void;
  close: (restoreFocus?: boolean) => void;
}

const ThemeMenuBody: React.FC<ThemeMenuBodyProps> = ({ selectedThemeId, onSelectTheme, close }) => {
  const { t, locale, setLocale, locales } = useI18n();

  const renderGroup = (mode: "dark" | "light") => {
    const themes = AVAILABLE_THEMES.filter((theme) => theme.mode === mode);
    if (themes.length === 0) return null;
    return (
      <div className="theme-menu-group" role="group" aria-label={mode === "dark" ? t("appearance.darkThemes") : t("appearance.lightThemes")}>
        <div className="theme-menu-group-label">{mode === "dark" ? t("appearance.dark") : t("appearance.light")}</div>
        {themes.map((theme) => {
          const isActive = theme.id === selectedThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              className={`theme-menu-item ${isActive ? "is-active" : ""}`}
              aria-current={isActive ? "true" : undefined}
              data-popover-item
              title={themeDescription(theme, t)}
              onClick={() => {
                onSelectTheme(theme.id);
                close(true);
              }}
            >
              <span
                className="theme-menu-swatch"
                style={{
                  background: theme.vars["--jantt-bg"],
                  borderColor: theme.vars["--jantt-border-strong"] || theme.vars["--jantt-border"]
                }}
                aria-hidden="true"
              >
                <span
                  className="theme-menu-swatch-accent"
                  style={{ background: theme.vars["--jantt-accent"] }}
                />
              </span>
              <span className="theme-menu-copy">
                <span className="theme-menu-name">{theme.label}</span>
                <span className="theme-menu-meta">{theme.mode === "dark" ? t("appearance.darkMode") : t("appearance.lightMode")}</span>
              </span>
              {isActive && <Check size={14} className="theme-menu-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="theme-menu">
      <div className="nav-popover-header">
        <span className="nav-popover-title">{t("appearance.title")}</span>
        <span className="nav-popover-subtitle">{t("appearance.themeCount", { count: AVAILABLE_THEMES.length })}</span>
      </div>
      {renderGroup("dark")}
      {renderGroup("light")}

      <div className="theme-menu-divider" role="separator" />

      <div className="theme-menu-group" role="group" aria-label={t("appearance.interfaceLanguage")}>
        <div className="theme-menu-group-label">{t("appearance.language")}</div>
        <div className="language-menu-options">
          {locales.map((option) => {
            const isActive = option.id === locale;
            return (
              <button
                key={option.id}
                type="button"
                className={`language-menu-item ${isActive ? "is-active" : ""}`}
                aria-pressed={isActive}
                data-popover-item
                lang={option.id}
                onClick={() => setLocale(option.id)}
              >
                <span className="language-menu-name">{option.nativeLabel}</span>
                {isActive && <Check size={14} className="theme-menu-check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <p className="language-menu-hint">{t("appearance.languageHint")}</p>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Navbar                                                                      */
/* -------------------------------------------------------------------------- */

/** Partial on purpose: an unknown future status falls back to its raw name. */
const SYNC_STATE_KEY: Partial<Record<RoomSyncStatus, MessageKey>> = {
  idle: "nav.syncIdle",
  "in-sync": "nav.syncConnected",
  syncing: "nav.syncSyncing",
  merged: "nav.syncMerged",
  conflict: "nav.syncConflict",
  error: "nav.syncError",
  offline: "nav.syncOffline"
};

/** Statuses where local edits may not have reached collaborators. */
const SYNC_PROBLEM_STATES: ReadonlySet<RoomSyncStatus> = new Set<RoomSyncStatus>(["error", "conflict", "offline"]);

interface NavbarProps {
  saveStatus: "saved" | "saving" | "pending";
  lastSavedAt: Date;
  autoSaveInterval: string;
  autoSaveLabel: string;
  setShowAutoSaveModal: (show: boolean) => void;
  snapshotsCount?: number;
  setShowVersionHistoryModal?: (show: boolean) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  selectedThemeId: string;
  setSelectedThemeId: (themeId: string) => void;
  onToggleCopilot?: () => void;
  showCopilot?: boolean;
  currentUser?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  /** While true and signed out, no sign-in button is shown (avoids a "Connect" flash on load). */
  isLoadingAuth?: boolean;
  /** A GitHub sign-in popup is open: the sign-in button is disabled until it settles. */
  isSigningIn?: boolean;
  onOpenUserHub?: () => void;
  isGitHubVerified?: boolean;
  onOpenVerificationModal?: () => void;
  onLogin?: () => void;
  onLogout?: () => void;
  isViewer?: boolean;
  onPromptFork?: () => void;
  isPendingLoginEditor?: boolean;
  onOpenEditorLogin?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenShortcuts?: () => void;
  /** Chromium install prompt availability; the button disappears once installed. */
  canInstall?: boolean;
  isStandalone?: boolean;
  onInstall?: () => void;

  /* Plans */
  activeProjectId: string;
  activePlanName: string;
  customProjects: SavedProject[];
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  onSelectProject: (id: string) => void;
  onNewPlan: () => void;
  onImportFile: () => void;
  onOpenPlanManager: () => void;
  /** Only provided when the active plan is a deletable local plan. */
  onDeleteActivePlan?: () => void;

  /* Share & people */
  onOpenShare: () => void;
  peopleCount: number;
  onOpenPeople: () => void;

  /* Cloud */
  activeRoomId?: string | null;
  /** "Editor", "Viewer", "Editor invite"... */
  roomRoleLabel?: string;
  syncStatus?: RoomSyncStatus;
  syncMessage?: string;
  onlineCount?: number;
  onlineUsers?: RoomPresence[];
  /** Cloud collaboration panel rendered inside the Cloud popover (a function receives `close`). */
  cloudPanel: PanelSlot;
  onLeaveRoom?: () => void;
  onDeleteRoom?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  saveStatus,
  lastSavedAt,
  autoSaveInterval,
  autoSaveLabel,
  setShowAutoSaveModal,
  snapshotsCount = 0,
  setShowVersionHistoryModal,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  selectedThemeId,
  setSelectedThemeId,
  onToggleCopilot,
  showCopilot = false,
  currentUser,
  userProfile,
  isLoadingAuth = false,
  isSigningIn = false,
  onOpenUserHub,
  isGitHubVerified = false,
  onOpenVerificationModal,
  onLogin,
  onLogout,
  isViewer = false,
  onPromptFork,
  isPendingLoginEditor = false,
  onOpenEditorLogin,
  onOpenCommandPalette,
  onOpenShortcuts,
  canInstall = false,
  isStandalone = false,
  onInstall,
  activeProjectId,
  activePlanName,
  customProjects,
  ownedRooms,
  sharedRooms,
  onSelectProject,
  onNewPlan,
  onImportFile,
  onOpenPlanManager,
  onDeleteActivePlan,
  onOpenShare,
  peopleCount,
  onOpenPeople,
  activeRoomId,
  roomRoleLabel,
  syncStatus = "in-sync",
  syncMessage,
  onlineCount = 0,
  onlineUsers = [],
  cloudPanel,
  onLeaveRoom,
  onDeleteRoom
}) => {
  const { t, locale } = useI18n();
  const isRoomActive = Boolean(activeRoomId);
  const savedLocally = t("nav.savedLocally");
  // In a room the badge only reflects the local browser backup; cloud state lives on the Cloud chip.
  const saveLabel = isRoomActive ? autoSaveLabel.replace(/^Saved/, savedLocally) : autoSaveLabel;
  // Keep the chip short; the relative time stays in its title.
  const saveChipLabel = saveStatus === "saved" ? (isRoomActive ? savedLocally : t("nav.saved")) : saveLabel;
  const syncKey = SYNC_STATE_KEY[syncStatus];
  const syncLabel = syncKey ? t(syncKey) : syncStatus;
  const isSyncProblem = SYNC_PROBLEM_STATES.has(syncStatus);
  const lastSavedTime = lastSavedAt.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  // Plans can store a legacy theme alias (e.g. "noir"): resolve it before showing the label.
  const activeTheme = themeManager.getTheme(selectedThemeId);
  const activeThemeLabel = activeTheme?.label || t("appearance.title");
  const activeThemeId = activeTheme?.id || selectedThemeId;

  const accountName = userProfile?.username ? `@${userProfile.username}` : currentUser?.displayName || t("nav.account");
  // Only GitHub-hosted avatars are loaded (profile fields are self-written); otherwise initials.
  const avatarUrl = getTrustedAvatarUrl(userProfile?.photoURL) || getTrustedAvatarUrl(currentUser?.photoURL);

  return (
    <header className="navbar">
      {/* 1. Left Zone: brand, JSON sidebar toggle, and active plan switcher */}
      <div className="nav-zone nav-zone-left">
        <JanttLogo size={28} showWordmark={false} />

        <button
          type="button"
          className={`btn-nav btn-sidebar-toggle nav-icon-btn ${!isSidebarCollapsed ? "is-active" : ""}`}
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          title={isSidebarCollapsed ? t("nav.showSidebarTitle") : t("nav.hideSidebarTitle")}
          aria-label={isSidebarCollapsed ? t("nav.showSidebarAria") : t("nav.hideSidebarAria")}
          aria-expanded={!isSidebarCollapsed}
          aria-controls="editor-pane"
        >
          <PanelLeft
            size={14}
            style={{ color: !isSidebarCollapsed ? "var(--jantt-accent, #38BDF8)" : undefined }}
            aria-hidden="true"
          />
          <span className="nav-label">JSON</span>
        </button>

        <NavPopover
          id="nav-plan-switcher"
          label={t("nav.switchPlan")}
          triggerClassName="nav-plan-trigger"
          triggerTitle={t("nav.switchPlanTitle")}
          triggerAriaLabel={t("nav.currentPlanAria", { name: activePlanName })}
          triggerContent={
            <>
              <FolderKanban size={14} className="nav-plan-trigger-icon" aria-hidden="true" />
              <span className="nav-plan-trigger-name">{activePlanName}</span>
              <ChevronDown size={13} className="nav-popover-chevron" aria-hidden="true" />
            </>
          }
          panelClassName="is-plan-switcher"
        >
          {(close) => (
            <PlanSwitcherBody
              close={close}
              activeProjectId={activeProjectId}
              activePlanName={activePlanName}
              customProjects={customProjects}
              ownedRooms={ownedRooms}
              sharedRooms={sharedRooms}
              onSelectProject={onSelectProject}
              onNewPlan={onNewPlan}
              onImportFile={onImportFile}
              onOpenPlanManager={onOpenPlanManager}
              onDeleteActivePlan={onDeleteActivePlan}
            />
          )}
        </NavPopover>
      </div>

      {/* 2. Right Zone: document state, collaboration, tools, preferences and account */}
      <div className="nav-zone nav-zone-right">
        {/* Cluster 1: This plan's live state and the people you share it with */}
        <div className="nav-cluster nav-cluster-workspace">
          <NavPopover
            id="nav-cloud-panel"
            label={t("nav.cloudCollab")}
            triggerClassName={`nav-cloud-trigger ${isRoomActive ? `is-live is-sync-${syncStatus}` : ""}`}
            triggerTitle={
              isRoomActive
                ? roomRoleLabel
                  ? t("nav.cloudRoomTitleRole", { role: roomRoleLabel, status: syncMessage || syncLabel })
                  : t("nav.cloudRoomTitle", { status: syncMessage || syncLabel })
                : t("nav.cloudStartTitle")
            }
            triggerAriaLabel={
              isRoomActive
                ? onlineCount > 0
                  ? t("nav.cloudRoomAriaOnline", {
                      role: roomRoleLabel || t("nav.member"),
                      status: syncLabel,
                      count: onlineCount
                    })
                  : t("nav.cloudRoomAria", { role: roomRoleLabel || t("nav.member"), status: syncLabel })
                : t("nav.cloudCollab")
            }
            triggerContent={
              <>
                {isRoomActive ? (
                  <span className="nav-cloud-dot" aria-hidden="true" />
                ) : (
                  <Cloud size={14} style={{ color: "#38BDF8" }} aria-hidden="true" />
                )}
                <span className="nav-label">{isRoomActive ? syncLabel : t("nav.cloud")}</span>
                {isRoomActive && <RoomPresenceStack users={onlineUsers} limit={3} />}
                <ChevronDown size={12} className="nav-popover-chevron" aria-hidden="true" />
              </>
            }
            align="end"
            panelClassName="is-cloud-panel"
          >
            {(close) => (
              <div className="nav-cloud-popover">
                {/* The panel offers sign-in, a local copy and Leave itself; owner deletion lives here. */}
                {renderPanelSlot(cloudPanel, () => close(false))}
                {isRoomActive && (onLeaveRoom || onDeleteRoom) && (
                  <div className="nav-popover-footer">
                    {onLeaveRoom && (
                      <button
                        type="button"
                        className="nav-popover-action is-danger"
                        data-popover-item
                        onClick={() => {
                          close(false);
                          onLeaveRoom();
                        }}
                      >
                        <DoorOpen size={14} aria-hidden="true" />
                        <span>{t("nav.leaveRoom")}</span>
                      </button>
                    )}
                    {onDeleteRoom && (
                      <button
                        type="button"
                        className="nav-popover-action is-danger"
                        data-popover-item
                        onClick={() => {
                          close(false);
                          onDeleteRoom();
                        }}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        <span>{t("nav.deleteRoom")}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </NavPopover>

          {isViewer ? (
            <button
              type="button"
              className="btn-autosave-badge is-viewer"
              onClick={onPromptFork}
              title={t("nav.readOnlyTitle")}
              aria-label={t("nav.readOnlyAria")}
            >
              <Eye size={12} aria-hidden="true" />
              <span className="nav-label">{t("nav.readOnly")}</span>
            </button>
          ) : (
            <button
              type="button"
              className={`btn-autosave-badge is-${saveStatus}`}
              onClick={() => setShowAutoSaveModal(true)}
              title={
                isRoomActive
                  ? t("nav.saveTitleLocal", { time: lastSavedTime, interval: autoSaveInterval })
                  : t("nav.saveTitle", { time: lastSavedTime, interval: autoSaveInterval })
              }
              aria-label={t("nav.configureAutoSave", { status: saveLabel })}
            >
              {saveStatus === "saving" ? (
                <RefreshCw size={11} className="spin-sync-icon" aria-hidden="true" />
              ) : saveStatus === "pending" ? (
                <Clock size={11} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={11} aria-hidden="true" />
              )}
              <span className="nav-label">{saveChipLabel}</span>
            </button>
          )}

          {setShowVersionHistoryModal && (
            <button
              type="button"
              className="btn-nav btn-version-history nav-icon-btn"
              onClick={() => setShowVersionHistoryModal(true)}
              title={t("nav.versionHistoryTitle")}
              aria-label={
                snapshotsCount > 0
                  ? t("nav.versionHistoryAriaCount", { count: snapshotsCount })
                  : t("nav.versionHistoryAria")
              }
            >
              <History size={13} style={{ color: "#818CF8" }} aria-hidden="true" />
              {snapshotsCount > 0 && <span className="history-count-badge">{snapshotsCount}</span>}
            </button>
          )}

          <span className="nav-cluster-divider" aria-hidden="true" />

          <button
            type="button"
            className="btn-nav nav-icon-btn nav-share-btn"
            onClick={onOpenShare}
            title={isRoomActive ? t("nav.shareRoomTitle") : t("nav.sharePlanTitle")}
            aria-label={isRoomActive ? t("nav.shareRoomAria") : t("nav.sharePlanAria")}
          >
            <Share2 size={13} style={{ color: "#A855F7" }} aria-hidden="true" />
            <span className="nav-label">{isRoomActive ? t("nav.invite") : t("nav.share")}</span>
            {peopleCount > 0 && <span className="nav-count-pill">{peopleCount}</span>}
          </button>

          {canInstall && !isStandalone && onInstall && (
            <button
              type="button"
              className="btn-nav nav-icon-btn nav-install-btn"
              onClick={onInstall}
              title={t("nav.installTitle")}
              aria-label={t("nav.installTitle")}
            >
              <Download size={13} style={{ color: "#22C55E" }} aria-hidden="true" />
              <span className="nav-label">{t("nav.installApp")}</span>
            </button>
          )}

          <button
            type="button"
            className="btn-nav nav-icon-btn"
            onClick={onOpenPeople}
            title={t("nav.peopleTitle")}
            aria-label={t("nav.peopleAria", { count: peopleCount })}
          >
            <Users size={13} style={{ color: "#F59E0B" }} aria-hidden="true" />
          </button>
        </div>

        {/* Cluster 2: Global search and AI */}
        <div className="nav-cluster nav-cluster-tools">
          {onOpenCommandPalette && (
            <button
              type="button"
              className="btn-nav nav-icon-btn"
              onClick={onOpenCommandPalette}
              title={t("nav.commandPaletteTitle", { shortcut: PRIMARY_MODIFIER_LABEL })}
              aria-label={t("nav.openCommandPalette")}
              aria-keyshortcuts={PRIMARY_MODIFIER_LABEL === "⌘" ? "Meta+K" : "Control+K"}
            >
              <Search size={14} style={{ color: "#38BDF8" }} aria-hidden="true" />
              <kbd className="nav-kbd nav-label">{PRIMARY_MODIFIER_LABEL} K</kbd>
            </button>
          )}

          {onToggleCopilot && (
            <button
              type="button"
              className={`btn-prompt ${showCopilot ? "is-active" : ""}`}
              onClick={onToggleCopilot}
              title={t("nav.copilotTitle", { shortcut: PRIMARY_MODIFIER_LABEL })}
              aria-label={showCopilot ? t("nav.closeCopilot") : t("nav.openCopilot")}
              aria-expanded={showCopilot}
              aria-keyshortcuts={PRIMARY_MODIFIER_LABEL === "⌘" ? "Meta+J" : "Control+J"}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span className="nav-label">Copilot</span>
            </button>
          )}
        </div>

        {/* Cluster 3: Appearance and help */}
        <div className="nav-cluster nav-cluster-preferences">
          <NavPopover
            id="nav-theme-menu"
            label={t("appearance.chooseTheme")}
            triggerClassName="nav-theme-trigger"
            triggerTitle={t("appearance.currentTheme", { name: activeThemeLabel })}
            triggerAriaLabel={`${t("appearance.currentTheme", { name: activeThemeLabel })}. ${t("appearance.chooseTheme")}`}
            triggerContent={
              <>
                <Palette size={14} className="nav-theme-icon" aria-hidden="true" />
                <span className="nav-label">{activeThemeLabel}</span>
                <ChevronDown size={12} className="nav-popover-chevron" aria-hidden="true" />
              </>
            }
            align="end"
            panelClassName="is-theme-menu"
          >
            {(close) => (
              <ThemeMenuBody
                selectedThemeId={activeThemeId}
                onSelectTheme={setSelectedThemeId}
                close={close}
              />
            )}
          </NavPopover>

          {onOpenShortcuts && (
            <button
              type="button"
              className="btn-nav nav-icon-btn"
              onClick={onOpenShortcuts}
              title={t("nav.shortcutsTitle")}
              aria-label={t("nav.shortcutsAria")}
              aria-keyshortcuts="Shift+?"
            >
              <HelpCircle size={14} style={{ color: "#818CF8" }} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Identity: account (or sign-in when signed out) */}
        {currentUser ? (
          <div className="nav-account">
            <button
              type="button"
              className="btn-user-profile-chip"
              onClick={onOpenUserHub}
              title={
                userProfile
                  ? t("nav.signedInAs", {
                      name: userProfile.displayName || t("nav.user"),
                      handle: userProfile.username
                    })
                  : t("nav.finishingSignIn")
              }
              aria-label={t("nav.accountAria", { name: accountName })}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="nav-avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="nav-avatar is-fallback" aria-hidden="true">
                  {(userProfile?.displayName?.[0] || userProfile?.username?.[0] || currentUser.displayName?.[0] || "U").toUpperCase()}
                </span>
              )}
              <span className="nav-account-name nav-label">{userProfile ? accountName : t("nav.signingIn")}</span>
            </button>

            {onOpenVerificationModal && userProfile && (
              <button
                type="button"
                className={`nav-verify-badge ${isGitHubVerified ? "is-verified" : ""}`}
                onClick={onOpenVerificationModal}
                title={
                  isGitHubVerified ? t("nav.verifyCompleteTitle") : t("nav.verifyNeededTitle")
                }
              >
                {isGitHubVerified ? <CheckCircle2 size={11} aria-hidden="true" /> : <Star size={11} aria-hidden="true" />}
                <span className="nav-label">{isGitHubVerified ? t("nav.cloudActive") : t("nav.verifyCloud")}</span>
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                className="nav-signout-btn"
                onClick={onLogout}
                title={t("nav.signOutTitle")}
                aria-label={t("nav.signOut")}
              >
                <LogOut size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (isPendingLoginEditor || isSigningIn) && onLogin && !isLoadingAuth ? (
          <button
            type="button"
            className={`btn-connect-cloud ${isPendingLoginEditor ? "is-pending-editor" : ""}`}
            onClick={isPendingLoginEditor && onOpenEditorLogin ? onOpenEditorLogin : onLogin}
            disabled={isSigningIn}
            aria-busy={isSigningIn || undefined}
            title={
              isSigningIn ? t("nav.finishSignInTitle") : t("nav.editorInviteTitle")
            }
          >
            {isSigningIn ? (
              <Loader2 size={14} className="spin-sync-icon" aria-hidden="true" />
            ) : (
              <KeyRound size={14} aria-hidden="true" />
            )}
            <span>{isSigningIn ? t("nav.signingIn") : t("nav.signInToEdit")}</span>
          </button>
        ) : null}
      </div>

      {/* Announce only sync problems; routine "syncing / in sync" flips would be noise. */}
      <span className="sr-only" role="status">
        {isRoomActive && isSyncProblem
          ? t("nav.syncProblem", { status: syncMessage || syncLabel })
          : ""}
      </span>
    </header>
  );
};
