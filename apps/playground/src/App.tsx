import { closeTopModal, useTopModalId } from "./components/modals/ModalHost";
import { QuickCapture } from "./components/modals/QuickCapture";
import React, { useMemo, useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { RefreshCw, WifiOff, X } from "lucide-react";
import { themeManager, validate, type JanttData, type NoteItem, type Task, type TimeScale } from "@jantt/core";

import type { NotesNavigationIntent, SavedProject } from "./types";
import {
  loadInitialState,
  updateStoredProjects,
  deleteTasks,
  generateId,
  getPeerId,
  importSharedPlan,
  purgeProjectStorage,
  readSharePayloadFromUrl,
  stripSharePayloadFromUrl,
  downloadTextFile,
  buildExportFilename
} from "./utils";
import { removeRoomSecret } from "./room-storage";

// Custom Hooks
import { useToast } from "./hooks/useToast";
import { useSidebarResize } from "./hooks/useSidebarResize";
import { useGanttViewport } from "./hooks/useGanttViewport";
import { useEditorState } from "./hooks/useEditorState";
import { usePeopleTeams } from "./hooks/usePeopleTeams";
import { useProjectState } from "./hooks/useProjectState";
import { useAutoSave } from "./hooks/useAutoSave";
import { useDateFilter } from "./hooks/useDateFilter";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTaskDetailSidebar } from "./hooks/useTaskDetailSidebar";
import { useSharing } from "./hooks/useSharing";
import { useSnapshotVault } from "./hooks/useSnapshotVault";
import { useDynamicSync } from "./hooks/useDynamicSync";
import { useRoomSync } from "./hooks/useRoomSync";
import { useAuth } from "./hooks/useAuth";
import { useApiAccess } from "./hooks/useApiAccess";
import { listenToUserRooms, deleteRoom, leaveRoom } from "./firebase/roomService";
import { ENABLE_GITHUB_VERIFICATION_GATE, type UserRoomPointer } from "./firebase";
import { commandBus } from "./services";
import { useMobileDetection } from "./hooks/useMobileDetection";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { useCopilot } from "./hooks/useCopilot";
import { useAppPlatform } from "./hooks/useAppPlatform";
import { useVisualViewport } from "./hooks/useVisualViewport";
import { useAndroidBackNavigation, type BackNavigationOverlay } from "./hooks/useAndroidBackNavigation";
import {
  APP_PROMO_TTL_MS,
  isPromoSuppressed,
  markPromoSeen,
  registerLaunchQueueHandler,
  syncThemeColorMeta
} from "./services/platform";
import { STORAGE_KEYS } from "./constants";
import { storageService } from "./services/storage";
import { exportMsProjectXml, exportPrimaveraXer, exportExecutiveReportHtml } from "@jantt/interop";
import { OPEN_JSON_EDITOR_EVENT } from "./components/common/EmptyChartState";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

// View & Layout & Modal Components (Domain-Driven Architecture)
import {
  Navbar,
  CloudBar,
  EditorPane,
  ViewRouter,
  ModalHost,
  Toast,
  MobileNavbar,
  MobileBottomNav,
  MobileQuickFab,
  ReadOnlyForkModal,
  EditorLoginModal,
  CommandPalette,
  ShortcutsModal,
  AppDistributionBanner,
  AndroidTestingModal,
  WebAccessModal,
  RateAppModal,
  ConfirmDialog,
  CopilotDrawer,
  type ConfirmDialogProps
} from "./components";

/* -------------------------------------------------------------------------- */
/* Shell helpers                                                               */
/* -------------------------------------------------------------------------- */

/** File types accepted by the universal importer (JSON, MS Project XML, Primavera XER, CSV). */
const IMPORT_ACCEPT = ".json,.xml,.xer,.csv,application/json,text/xml,text/csv";

/** Timeline zoom ladder used by the +, - and 0 shortcuts (finest first). */
const ZOOM_SCALES: TimeScale[] = ["minute", "hour", "day", "week", "month", "quarter", "year"];
const DEFAULT_ZOOM_SCALE: TimeScale = "week";
const RiskDialog = React.lazy(() => import("./components/modals/MonteCarloModal").then(module => ({ default: module.MonteCarloModal })));

/** Any open dialog, sheet, drawer or Navbar popover: single-key shortcuts must not act behind it. */
const OPEN_DIALOG_SELECTOR =
  '.prompt-modal-backdrop, .modal-backdrop, .mobile-sheet-backdrop, .jantt-sidebar-backdrop, .jantt-copilot-backdrop, .nav-popover-panel, [aria-modal="true"]';

/** Targets that own the keyboard (typing, type-ahead, sliders...). */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="spinbutton"], [role="slider"]';

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.isContentEditable || Boolean(el.closest(EDITABLE_SELECTOR));
}

function isDialogOpen(): boolean {
  return typeof document !== "undefined" && Boolean(document.querySelector(OPEN_DIALOG_SELECTOR));
}

/** An in-app confirmation (replaces window.confirm); `onCancel` is supplied by the host. */
type PendingConfirm = Omit<ConfirmDialogProps, "onCancel">;

export function App() {
  const mobile = useMobileDetection();
  const [init] = useState(() => loadInitialState(mobile.isMobile));
  const platform = useAppPlatform(mobile.isMobile);
  useVisualViewport();

  // UI Modals & Notifications
  const toast = useToast();
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showPlanManagerModal, setShowPlanManagerModal] = useState(false);
  const [showReadOnlyForkModal, setShowReadOnlyForkModal] = useState(false);
  const [showEditorLoginModal, setShowEditorLoginModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [inspectedTaskId, setInspectedTaskId] = useState<string | null>(null);
  const [noteBack, setNoteBack] = useState<(() => void) | null>(null);
  const registerNoteBack = useCallback((close: (() => void) | null) => setNoteBack(() => close), []);
  const [captureExpanded, setCaptureExpanded] = useState(false);
  const [capture, setCapture] = useState<{ milestone: boolean; status?: string } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);
  const [showAndroidTestingModal, setShowAndroidTestingModal] = useState(false);
  const [showWebAccessModal, setShowWebAccessModal] = useState(false);
  const [showRateAppModal, setShowRateAppModal] = useState(false);
  const [isAppBannerDismissed, setIsAppBannerDismissed] = useState(
    () => isPromoSuppressed(STORAGE_KEYS.APP_BANNER_DISMISSED_AT, APP_PROMO_TTL_MS)
  );
  const isAppContext = platform.isTwa || platform.isStandalone;

  // Browser-only entry popup for Android early testing (never auto-opens on phone or inside the installed app).
  useEffect(() => {
    if (mobile.isMobile || isAppContext) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("room") || params.has("share") || window.location.hash.includes("share=")) return;
    if (isPromoSuppressed(STORAGE_KEYS.APP_BETA_POPUP_SEEN_AT, APP_PROMO_TTL_MS)) return;
    markPromoSeen(STORAGE_KEYS.APP_BETA_POPUP_SEEN_AT, APP_PROMO_TTL_MS);
    setShowAndroidTestingModal(true);
  }, [mobile.isMobile, isAppContext]);

  const handleCloseAndroidTestingModal = useCallback(() => {
    markPromoSeen(STORAGE_KEYS.APP_BETA_POPUP_SEEN_AT, APP_PROMO_TTL_MS);
    setShowAndroidTestingModal(false);
  }, []);

  const handleDismissAppBanner = useCallback(() => {
    markPromoSeen(STORAGE_KEYS.APP_BANNER_DISMISSED_AT, APP_PROMO_TTL_MS);
    setIsAppBannerDismissed(true);
  }, []);

  // Firebase Authentication & Cloud User Identity
  const auth = useAuth();
  const [showAgentApiModal, setShowAgentApiModal] = useState(false);
  const apiAccess = useApiAccess(auth.currentUser?.uid || null, showAgentApiModal);
  const [ownedRooms, setOwnedRooms] = useState<UserRoomPointer[]>([]);
  const [sharedRooms, setSharedRooms] = useState<UserRoomPointer[]>([]);
  const [shareModalRoomId, setShareModalRoomId] = useState<string | null>(null);
  const [showShareRoomModal, setShowShareRoomModal] = useState(false);
  // The real verification state (not "verified" just because the gate is switched off).
  const isGitHubVerified = Boolean(auth.userProfile?.githubVerified || auth.verificationStatus?.isVerified);

  // Handlers refs for circular hook bindings
  const onCreateCloudRoomRef = useRef<((title: string, data: JanttData) => Promise<string | null>) | undefined>();
  /** Read-only state for callbacks created before the room hook exists. */
  const readOnlyRef = useRef({ isViewer: false, isPendingLoginEditor: false });
  const promptRestrictedRef = useRef<() => void>(() => {});

  // Real-time synchronization of user's personal hub (owned & shared rooms)
  useEffect(() => {
    if (!auth.userProfile?.uid) {
      setOwnedRooms([]);
      setSharedRooms([]);
      return;
    }

    const unsubscribe = listenToUserRooms(auth.userProfile.uid, (owned, shared) => {
      setOwnedRooms(owned);
      setSharedRooms(shared);
    });

    return () => unsubscribe();
  }, [auth.userProfile?.uid]);

  // Editor State (JSON text, parsed AST, schema validation)
  const editor = useEditorState({
    initialJson: init.initialJson,
    initialParsed: init.initialParsed,
    onPeopleChange: (p) => commandBus.emit("PEOPLE_CHANGED", p),
    onTeamsChange: (t) => commandBus.emit("TEAMS_CHANGED", t)
  });

  // Deterministic Undo / Redo History Stack (scoped to the active plan, see effect below)
  const undoRedo = useUndoRedo(
    editor.parsedData,
    (restored) => editor.handleChartCommit(restored),
    toast.showToast
  );

  /**
   * Single entry point for user edits from every view: blocks read-only sessions, then commits.
   * Undo history is recorded by the commit itself (LOCAL_COMMIT), so every view shares one history.
   * Stable identity: the read-only state is read through a ref.
   */
  const { handleChartCommit } = editor;
  const commitPlan = useCallback(
    (next: JanttData) => {
      const { isViewer: viewer, isPendingLoginEditor: pending } = readOnlyRef.current;
      if (viewer || pending) {
        promptRestrictedRef.current();
        return null;
      }
      return handleChartCommit(next);
    },
    [handleChartCommit]
  );

  // Gantt Viewport & Visual Themes
  const viewport = useGanttViewport({
    initialTheme: init.initialTheme,
    initialScale: init.initialScale,
    initialTimeFormat: init.initialTimeFormat,
    onTimeFormatPersist: auth.currentUser ? auth.updateTimeFormat : undefined,
    initialRouting: init.initialRouting,
    initialRowHeightMode: init.initialRowHeightMode,
    initialRowHeight: init.initialRowHeight,
    initialCritical: init.initialCritical,
    initialBaselines: init.initialBaselines,
    initialAutoCascade: init.initialAutoCascade,
    initialView: init.initialView
  });

  // Account vs Browser time-format preference:
  // - Logged-in accounts store & load `timeFormat` on `users/{uid}/timeFormat` (defaulting to "12h" AM/PM).
  // - Guests / logged-out sessions keep their preference in browser localStorage.
  const lastAuthUidRef = useRef<string | null>(null);
  const { syncTimeFormat } = viewport;
  useEffect(() => {
    const uid = auth.userProfile?.uid || null;
    if (!uid) {
      if (lastAuthUidRef.current !== null) {
        const guest = storageService.getItem<string>(STORAGE_KEYS.TIME_FORMAT);
        syncTimeFormat(guest === "24h" ? "24h" : "12h");
      }
      lastAuthUidRef.current = null;
      return;
    }
    const cloudFmt = auth.userProfile?.timeFormat;
    if (cloudFmt === "12h" || cloudFmt === "24h") {
      syncTimeFormat(cloudFmt);
    } else if (lastAuthUidRef.current !== uid) {
      syncTimeFormat("12h");
    }
    lastAuthUidRef.current = uid;
  }, [auth.userProfile?.uid, auth.userProfile?.timeFormat, syncTimeFormat]);

  // Keep the overscroll canvas, detached sheets and browser chrome in the workspace theme.
  useLayoutEffect(() => {
    themeManager.applyTheme(document, viewport.activeTheme.id);
    document.documentElement.style.colorScheme = viewport.activeTheme.mode;
    syncThemeColorMeta(viewport.activeTheme.mode, viewport.activeTheme.vars["--jantt-bg"]);
  }, [viewport.activeTheme]);

  // Sidebar Drag-Resize & Collapse
  const sidebar = useSidebarResize({
    initialWidth: init.initialWidth,
    initialCollapsed: init.initialCollapsed,
    isMobile: mobile.isMobile
  });

  // People & Squad Management
  const people = usePeopleTeams({
    initialPeople: (init.initialParsed as any)?.people || [],
    initialTeams: (init.initialParsed as any)?.teams || [],
    initialPersonFilter: init.initialPersonFilter,
    parsedData: editor.parsedData,
    handleChartCommit: commitPlan,
    showToast: toast.showToast
  });

  // Cross-hook event bus subscriptions (eliminates circular useRef dependencies)
  useEffect(() => {
    const unsubPeople = commandBus.on("PEOPLE_CHANGED", people.setPeople);
    const unsubTeams = commandBus.on("TEAMS_CHANGED", people.setTeams);
    return () => {
      unsubPeople();
      unsubTeams();
    };
  }, [people.setPeople, people.setTeams]);

  // Date & People Filter Engine & Visual Dimming
  const dateFilter = useDateFilter({
    initialMode: init.initialDateFilterMode,
    initialCompletedMode: init.initialCompletedFilterMode,
    parsedData: editor.parsedData,
    activeView: viewport.activeView,
    currentScale: viewport.currentScale,
    currentDayWidth: viewport.currentDayWidth,
    selectedPersonFilter: people.selectedPersonFilter,
    effectivePeople: people.effectivePeople,
    teams: people.teams
  });

  // Project Management (Local & Template CRUD)
  const project = useProjectState({
    // Loaded once by loadInitialState (including a just-imported share link), never re-parsed.
    initialProjects: init.savedProjects,
    initialActiveId: init.activeProjectId,
    parsedData: editor.parsedData,
    setJsonText: editor.setJsonText,
    setParsedData: editor.setParsedData,
    setValidationResult: editor.setValidationResult,
    setPeople: people.setPeople,
    setTeams: people.setTeams,
    setCurrentScale: viewport.setCurrentScale,
    setShowCriticalPath: viewport.setShowCriticalPath,
    setShowBaselines: viewport.setShowBaselines,
    showToast: toast.showToast,
    flushPendingSave: () => commandBus.emit("FLUSH_SAVE", undefined),
    onCreateCloudRoom: (title, data) =>
      onCreateCloudRoomRef.current ? onCreateCloudRoomRef.current(title, data) : Promise.resolve(null)
  });
  /** Latest active plan id, for handlers that resume after a network await. */
  const activeProjectIdRef = useRef(project.activeProjectId);
  activeProjectIdRef.current = project.activeProjectId;

  // PWA shortcuts (?action=) and OS file launches: one-shot, then the transient params are gone.
  const launchHandledRef = useRef(false);
  useEffect(() => {
    if (launchHandledRef.current) return;
    launchHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (action === "new-plan") project.handleOpenAddPlanModal();
    else if (action === "copilot") setShowCopilot(true);

    if (action || params.has("source")) {
      params.delete("action");
      params.delete("source");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    }

    registerLaunchQueueHandler((file) => project.handleImportFile(file));
  }, [project.handleImportFile, project.handleOpenAddPlanModal]);

  // Zero-Data-Loss Version History & Snapshot Vault
  const vault = useSnapshotVault(project.activeProjectId);

  // Cross-tab coherence: the same plan open in several tabs of this browser stays in step.
  const dynamicSync = useDynamicSync({
    activeProjectId: project.activeProjectId,
    parsedData: editor.parsedData,
    setParsedData: editor.setParsedData,
    setJsonText: editor.setJsonText,
    setPeople: people.setPeople,
    setTeams: people.setTeams,
    setValidationResult: editor.setValidationResult
  });

  // Auto-Save Engine with Configurable Cadence, Collision Check, and Cross-Tab Broadcast
  const autoSave = useAutoSave({
    flushEditorDraft: editor.flushEditorDraft,
    jsonText: editor.jsonText,
    parsedData: editor.parsedData,
    activeProjectId: project.activeProjectId,
    onSaveProject: project.saveProjectData,
    showToast: toast.showToast,
    captureSnapshot: vault.captureSnapshot,
    broadcastChange: dynamicSync.broadcastLocalChange
  });

  useEffect(() => {
    const unsubFlush = commandBus.on("FLUSH_SAVE", () => autoSave.flushSave());
    return () => unsubFlush();
  }, [autoSave.flushSave]);

  /** Persists pending edits of the current plan; call before any switch of the active plan. */
  const flushPendingSave = useCallback(() => commandBus.emit("FLUSH_SAVE", undefined), []);
  const applySavedUpdate = () => {
    if (autoSave.prepareReload()) platform.applyUpdate();
    else toast.showToast("Update deferred. Save your changes or correct the JSON before refreshing.", true);
  };

  /**
   * Applies one plan-list change to storage (read-modify-write of the latest stored list, so
   * plans written by another tab survive) and to React state.
   */
  const { setCustomProjects } = project;
  const { showToast } = toast;
  const commitProjectList = useCallback(
    (mutate: (projects: SavedProject[]) => SavedProject[]) => {
      const stored = updateStoredProjects(mutate);
      setCustomProjects((prev) => mutate(prev));
      if (!stored) showToast("Browser storage is full: the plan list could not be saved durably.", true);
    },
    [setCustomProjects, showToast]
  );

  // Firebase Realtime Database cloud room sync (the active room, its presence and deep links)
  const roomSync = useRoomSync({
    inspectedTaskId,
    customProjects: project.customProjects,
    setCustomProjects: project.setCustomProjects,
    activeProjectId: project.activeProjectId,
    setActiveProjectId: project.setActiveProjectId,
    parsedData: editor.parsedData,
    setParsedData: editor.setParsedData,
    setJsonText: editor.setJsonText,
    setPeople: people.setPeople,
    setTeams: people.setTeams,
    setValidationResult: editor.setValidationResult,
    showToast: toast.showToast,
    captureSnapshot: vault.captureSnapshot,
    userProfile: auth.userProfile,
    // ?room= links wait for the restored account instead of opening first as a viewer.
    isLoadingAuth: auth.isLoadingAuth,
    onRequireVerification: () => {
      if (ENABLE_GITHUB_VERIFICATION_GATE) {
        auth.setShowVerificationModal(true);
      }
    }
  });

  const isPendingLoginEditor = roomSync.isPendingLoginEditor;
  const isViewer = roomSync.activeRoomRole === "viewer";
  // Invited editors who have not signed in yet cannot save either: every view treats them as
  // read-only and routes edit attempts to the sign-in prompt (handlePromptRestrictedAction).
  const isReadOnly = isViewer || isPendingLoginEditor;
  readOnlyRef.current = { isViewer, isPendingLoginEditor };
  const isRoomOwner = Boolean(roomSync.activeRoomId && ownedRooms.some((r) => r.roomId === roomSync.activeRoomId));
  const activeRoomTitle =
    ownedRooms.find((r) => r.roomId === roomSync.activeRoomId)?.title ||
    sharedRooms.find((r) => r.roomId === roomSync.activeRoomId)?.title ||
    project.customProjects.find((p) => p.roomId === roomSync.activeRoomId)?.name ||
    editor.parsedData?.meta?.title ||
    "Shared Plan";
  const activePlanName = roomSync.activeRoomId ? activeRoomTitle : project.currentProjectName;
  const roomRoleLabel = !roomSync.activeRoomId
    ? undefined
    : isPendingLoginEditor
    ? "Editor invite"
    : roomSync.activeRoomRole === "collaborator"
    ? "Editor"
    : "Viewer";

  // Undo history belongs to one plan: never replay plan A's snapshot into plan B or a room.
  const { clearHistory } = undoRedo;
  useEffect(() => {
    clearHistory();
  }, [project.activeProjectId, roomSync.activeRoomId, clearHistory]);

  // What happened to a share or legacy link found in the address bar at startup (shown once).
  useEffect(() => {
    if (init.launchNotice) showToast(init.launchNotice.message, init.launchNotice.isError);
  }, [init, showToast]);

  // Sign-in failures (popup blocked, cancelled, network) are reported once, then cleared.
  const { authError, dismissAuthError } = auth;
  useEffect(() => {
    if (!authError) return;
    showToast(authError, true);
    dismissAuthError();
  }, [authError, dismissAuthError, showToast]);

  // Handles restricted editing actions based on whether user holds an editor key or is purely a viewer
  const handlePromptRestrictedAction = useCallback(() => {
    if (isPendingLoginEditor) {
      setShowEditorLoginModal(true);
    } else {
      setShowReadOnlyForkModal(true);
    }
  }, [isPendingLoginEditor]);
  promptRestrictedRef.current = handlePromptRestrictedAction;

  // 1-Click Fork: Make a private local copy so viewers can edit freely
  const { activeProject, handleForkToLocalPlan, handleCreateLocalCopyFromData } = project;
  const handleForkToLocalCopy = useCallback(() => {
    if (!roomSync.allowViewerForks && isReadOnly) {
      toast.showToast("The room owner has disabled local copies.", true);
      return;
    }
    if (activeProject) {
      // Copies the live editor data, flushes the plan being left and opens the copy (URL included).
      handleForkToLocalPlan();
    } else if (editor.parsedData) {
      handleCreateLocalCopyFromData(activeRoomTitle, editor.parsedData);
    } else {
      return;
    }
    setShowReadOnlyForkModal(false);
    setShowEditorLoginModal(false);
  }, [activeProject, handleForkToLocalPlan, handleCreateLocalCopyFromData, editor.parsedData, activeRoomTitle, roomSync.allowViewerForks, isReadOnly, toast.showToast]);

  // Handlers for Cloud Rooms & User Hub
  /**
   * Opens a room by id. The room hook validates the id and the room's identity, derives the role
   * from the membership list, keeps a cached copy's unsynced edits, flushes the plan being left
   * and never adds the user to the room's roster.
   */
  const { handleJoinRoom } = roomSync;
  const handleSelectCloudRoom = useCallback(
    async (roomId: string) => {
      if (await handleJoinRoom(roomId)) setShowPlanManagerModal(false);
    },
    [handleJoinRoom]
  );

  const handleCreateCloudRoomFromData = useCallback(
    async (title: string, data: JanttData): Promise<string | null> => {
      if (!auth.currentUser) {
        void auth.loginWithGitHub();
        return null;
      }
      if (ENABLE_GITHUB_VERIFICATION_GATE && !isGitHubVerified) {
        auth.setShowVerificationModal(true);
        toast.showToast("Support the creator by following & starring repos to collaborate in cloud rooms.", true);
        return null;
      }
      const roomId = await roomSync.createRoomFromActive(title, data);
      if (roomId) {
        setShowPlanManagerModal(false);
      }
      return roomId;
    },
    [auth, isGitHubVerified, roomSync, toast]
  );
  onCreateCloudRoomRef.current = handleCreateCloudRoomFromData;

  const handleSelectProjectOrRoom = useCallback(
    async (projectId: string) => {
      // A cached room copy opens instantly; the room hook then syncs it with the server.
      if (projectId.startsWith("room-") && !project.customProjects.some((p) => p.id === projectId)) {
        await handleSelectCloudRoom(projectId.replace(/^room-/, ""));
        return;
      }
      project.handleSelectProject(projectId);
    },
    [project, handleSelectCloudRoom]
  );

  /**
   * Forgets a room on this device after leaving or deleting it: its cached copy, version history
   * and legacy secret. Runs after a network await, so it reads the latest active plan.
   */
  const { handleSelectProject } = project;
  const dropRoomFromLocalPlans = useCallback(
    (roomId: string) => {
      const projId = `room-${roomId}`;
      if (activeProjectIdRef.current === projId) handleSelectProject("default");
      commitProjectList((prev) => prev.filter((p) => p.id !== projId));
      purgeProjectStorage(projId);
      removeRoomSecret(roomId);
    },
    [handleSelectProject, commitProjectList]
  );

  const handleDeleteCloudRoom = useCallback(
    async (roomId: string) => {
      if (!auth.userProfile) return;
      try {
        await deleteRoom(roomId, auth.userProfile.uid);
        dropRoomFromLocalPlans(roomId);
        toast.showToast("Room permanently deleted and removed from all collaborators.");
      } catch (err: any) {
        toast.showToast(`Failed to delete room: ${err?.message || String(err)}`, true);
      }
    },
    [auth.userProfile, dropRoomFromLocalPlans, toast]
  );

  const handleLeaveCloudRoom = useCallback(
    async (roomId: string) => {
      if (!auth.userProfile) return;
      try {
        await leaveRoom(roomId, auth.userProfile.uid);
        dropRoomFromLocalPlans(roomId);
        toast.showToast("Left room successfully.");
      } catch (err: any) {
        toast.showToast(`Failed to leave room: ${err?.message || String(err)}`, true);
      }
    },
    [auth.userProfile, dropRoomFromLocalPlans, toast]
  );

  const handleOpenShareRoom = useCallback((roomId: string) => {
    setShareModalRoomId(roomId);
    setShowShareRoomModal(true);
  }, []);

  const openImportDialog = useCallback(() => {
    project.fileInputRef.current?.click();
  }, [project.fileInputRef]);

  const handleStartCloudRoom = useCallback(() => {
    if (!editor.parsedData) {
      toast.showToast("Fix the plan JSON before starting a cloud room.", true);
      return;
    }
    void handleCreateCloudRoomFromData(project.currentProjectName, editor.parsedData);
  }, [editor.parsedData, handleCreateCloudRoomFromData, project.currentProjectName, toast]);

  const handleDeleteActiveRoom = useCallback(() => {
    const roomId = roomSync.activeRoomId;
    if (!roomId) return;
    setPendingConfirm({
      title: "Delete cloud room for everyone?",
      tone: "danger",
      confirmLabel: "Delete room permanently",
      confirmPhrase: activeRoomTitle,
      message: (
        <>
          This permanently deletes room <strong>&ldquo;{activeRoomTitle}&rdquo;</strong> (#{roomId}) and all of its
          data. Every collaborator loses access immediately. This cannot be undone. Make a local copy first if you
          want to keep the plan.
        </>
      ),
      onConfirm: () => {
        setPendingConfirm(null);
        void handleDeleteCloudRoom(roomId);
      }
    });
  }, [roomSync.activeRoomId, activeRoomTitle, handleDeleteCloudRoom]);

  const { handleDeleteProject } = project;
  const handleDeleteActivePlan = useCallback(() => {
    const projectId = project.activeProjectId;
    if (projectId === "default") return;
    setPendingConfirm({
      title: "Delete plan from this device?",
      tone: "danger",
      confirmLabel: "Delete plan",
      message: (
        <>
          This permanently deletes <strong>&ldquo;{project.currentProjectName}&rdquo;</strong> and its version history
          from this browser. This cannot be undone. Export it first if you may need it again.
        </>
      ),
      onConfirm: () => {
        setPendingConfirm(null);
        handleDeleteProject(projectId, { confirm: false });
      }
    });
  }, [project.activeProjectId, project.currentProjectName, handleDeleteProject]);

  // 1-Click Snapshot Restoration with Audit Trail
  const handleRestoreSnapshot = useCallback(
    (snapshotData: JanttData, reason: string) => {
      if (readOnlyRef.current.isViewer || readOnlyRef.current.isPendingLoginEditor) {
        promptRestrictedRef.current();
        return;
      }
      // The plan being replaced stays recoverable (the vault skips an identical latest snapshot).
      if (editor.parsedData) vault.captureSnapshot(project.activeProjectId, editor.parsedData, "Pre-Restore Backup");
      editor.setParsedData(snapshotData);
      people.setPeople(snapshotData.people || []);
      people.setTeams(snapshotData.teams || []);
      editor.setJsonText(JSON.stringify(snapshotData, null, 2));
      editor.setValidationResult(validate(snapshotData));
      if (project.activeProjectId !== "default") {
        project.saveProjectData(project.activeProjectId, snapshotData);
      }
      vault.captureSnapshot(project.activeProjectId, snapshotData, reason);
      dynamicSync.broadcastLocalChange(project.activeProjectId, snapshotData);
      toast.showToast(`Restored snapshot: ${reason}!`);
    },
    [editor, people, project, vault, dynamicSync, toast]
  );

  // Share links opened in an already-running app (same-document hash / history navigation).
  // Uses the same import rules as the initial load (utils.importSharedPlan): reopening a link
  // activates the plan imported from it earlier, anything else becomes a new uniquely named
  // local plan. Existing plans are never replaced, and the payload is removed from the URL.
  const lastSharePayloadRef = useRef<string | null>(null);
  const handleShareLinkNavigation = () => {
    try {
      const share = readSharePayloadFromUrl();
      if (!share || share.payload === lastSharePayloadRef.current) return;
      // Same precedence as the initial load: a room deep link wins over a share payload.
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("room") || urlParams.get("cloud")) return;

      lastSharePayloadRef.current = share.payload;
      stripSharePayloadFromUrl();

      const imported = importSharedPlan(project.customProjects, share.payload, share.name);
      if (!imported) {
        toast.showToast("This share link is invalid, damaged or too large to open.", true);
        return;
      }

      if (!imported.isNew) {
        if (imported.project.id !== project.activeProjectId) project.handleSelectProject(imported.project.id);
        toast.showToast(`Opened "${imported.project.name}" (imported from this link earlier).`);
        return;
      }

      // importSharedPlan already gave the new plan a sanitized, unique name and a fresh id.
      flushPendingSave();
      const sharedProj = imported.project;
      const decoded = sharedProj.data;
      commitProjectList((prev) => [sharedProj, ...prev.filter((p) => p.id !== sharedProj.id)]);
      project.setActiveProjectId(sharedProj.id);
      editor.setParsedData(decoded);
      people.setPeople(decoded.people || []);
      people.setTeams(decoded.teams || []);
      editor.setJsonText(JSON.stringify(decoded, null, 2));
      editor.setValidationResult(validate(decoded));
      toast.showToast(`Opened shared plan "${sharedProj.name}" as a new local plan.`);
    } catch (err) {
      console.error("Failed to open shared plan from URL:", err);
    }
  };
  const shareLinkNavigationRef = useRef(handleShareLinkNavigation);
  shareLinkNavigationRef.current = handleShareLinkNavigation;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => shareLinkNavigationRef.current();
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  // Task Actions, Multi-Sort Engines, and View Filters
  const tasks = useTaskActions({
    compact: mobile.isMobile,
    parsedData: editor.parsedData,
    setParsedData: editor.setParsedData,
    setJsonText: editor.setJsonText,
    setValidationResult: editor.setValidationResult,
    handleChartCommit: commitPlan,
    dateFilterMode: dateFilter.dateFilterMode,
    dateFilterBehavior: dateFilter.dateFilterBehavior,
    isTaskMatchingDateFilter: dateFilter.isTaskMatchingDateFilter,
    effectivePeople: people.effectivePeople,
    teams: people.teams,
    initialKanbanSort: init.initialKanbanSort,
    // The Summary table uses the same date, person, team and completed filters as the KPI tiles.
    summaryBaseTasks: dateFilter.summaryKpiTasks,
    autoCascade: viewport.autoCascade
  });

  const [notesIntent, setNotesIntent] = useState<NotesNavigationIntent | null>(null);
  const handleConsumeNotesIntent = useCallback(() => setNotesIntent(null), []);
  useEffect(() => { setNotesIntent(null); }, [project.activeProjectId]);

  const handleAddTaskNote = useCallback((task: Task) => {
    if (isReadOnly) {
      handlePromptRestrictedAction();
      return;
    }
    const currentData = editor.parsedData;
    if (!currentData) return;
    const now = new Date().toISOString();
    const taskTitle = String(task.label || task.name || task.id || "Task").trim();
    const newId = generateId("note");
    const newNote: NoteItem = {
      id: newId,
      title: `${taskTitle} Note`,
      content: "",
      color: "#3B82F6",
      pinned: false,
      task_ids: [task.id],
      createdAt: now,
      updatedAt: now,
      timestamp: now
    };
    commitPlan({
      ...currentData,
      notes: [newNote, ...(Array.isArray(currentData.notes) ? currentData.notes : [])]
    });
    setNotesIntent({ taskId: task.id, noteId: newId, mode: "add", nonce: Date.now() });
    viewport.setActiveView("notes");
  }, [isReadOnly, handlePromptRestrictedAction, editor.parsedData, commitPlan, viewport.setActiveView]);

  const handleOpenTaskNotes = useCallback((task: Task, noteId?: string) => {
    setNotesIntent({ taskId: task.id, noteId: noteId ?? null, mode: "manage", nonce: Date.now() });
    viewport.setActiveView("notes");
  }, [viewport.setActiveView]);

  // Interactive Slide-Out Task Detail Drawer
  const taskDetail = useTaskDetailSidebar({
    onInspectTask: setInspectedTaskId,
    parsedData: editor.parsedData,
    activeTheme: viewport.activeTheme,
    activeView: viewport.activeView,
    handleChartCommit: commitPlan,
    readOnly: isReadOnly,
    onPromptFork: handlePromptRestrictedAction,
    autoCascade: viewport.autoCascade,
    timeFormat: viewport.timeFormat,
    onAddTaskNote: handleAddTaskNote,
    onOpenTaskNotes: handleOpenTaskNotes
  });

  // AI Copilot Live Assistant
  const copilot = useCopilot({
    projectId: project.activeProjectId, activeView: viewport.activeView, inspectedTaskId,
    parsedData: editor.parsedData,
    commitPlan,
    showToast: toast.showToast,
    isReadOnly
  });

  // Share Plan Modal & URL Generation
  const sharing = useSharing({
    activeProjectId: project.activeProjectId,
    activeProject: project.activeProject,
    currentProjectName: project.currentProjectName,
    activeView: viewport.activeView,
    selectedThemeId: viewport.selectedThemeId,
    parsedData: editor.parsedData,
    jsonText: editor.jsonText,
    showToast: toast.showToast
  });

  /** One share entry point: rooms open the invite dialog, other plans the link-share dialog. */
  const { setCopiedShareLink, setShowShareModal } = sharing;
  const handleOpenShare = useCallback(() => {
    if (roomSync.activeRoomId) {
      handleOpenShareRoom(roomSync.activeRoomId);
    } else {
      setCopiedShareLink(false);
      setShowShareModal(true);
    }
  }, [roomSync.activeRoomId, handleOpenShareRoom, setCopiedShareLink, setShowShareModal]);

  // Gantt Dynamic Filtered Viewport & Commit Sync
  const isPersonFiltering =
    people.selectedPersonFilter !== "all" && !people.selectedPersonFilter.startsWith("sort:");
  const isPersonSorting = people.selectedPersonFilter === "sort:assignee";
  const isHideActive =
    ((dateFilter.dateFilterMode !== "all" || isPersonFiltering) &&
      dateFilter.dateFilterBehavior === "hide") ||
    dateFilter.completedFilterMode === "filter";

  const ganttDisplayData = useMemo(() => {
    if (!editor.parsedData) return null;
    if (!isHideActive && !isPersonSorting) return editor.parsedData;
    return {
      ...editor.parsedData,
      tasks: dateFilter.ganttFilteredTasks
    };
  }, [editor.parsedData, isHideActive, isPersonSorting, dateFilter.ganttFilteredTasks]);

  const handleGanttCommit = useCallback(
    (updated: JanttData) => {
      if (isReadOnly) {
        handlePromptRestrictedAction();
        return;
      }
      if (!editor.parsedData) return;
      if (!isHideActive && !isPersonSorting) {
        commitPlan(updated);
        return;
      }
      // Gantt/Canvas only saw the filtered subset: merge it back into the full task list.
      // Tasks hidden by the filter (and tombstones) stay untouched and tasks created in the
      // filtered view are appended. One task the view showed but no longer returns was deleted
      // there: it is removed with a tombstone, and links to it from hidden tasks and notes are
      // cleaned up. Several missing tasks mean a partial list and are kept (the same rule as
      // the editor's commit merge). Full-plan commits (Kanban, Tasks, Notes) pass through unchanged.
      const master = editor.parsedData.tasks;
      const shownIds = new Set((ganttDisplayData?.tasks || []).map((t) => t.id));
      const updatedMap = new Map(updated.tasks.map((t) => [t.id, t]));
      const masterIds = new Set<string>();
      const mergedTasks: Task[] = [];
      const missingShownIds: string[] = [];
      for (const t of master) {
        masterIds.add(t.id);
        const next = updatedMap.get(t.id);
        mergedTasks.push(next || t);
        if (!next && !t._deleted && shownIds.has(t.id)) missingShownIds.push(t.id);
      }
      for (const t of updated.tasks) {
        if (!masterIds.has(t.id)) mergedTasks.push(t);
      }
      const merged: JanttData = { ...editor.parsedData, ...updated, tasks: mergedTasks };
      commitPlan(
        missingShownIds.length === 1
          ? deleteTasks(merged, missingShownIds, `${new Date().toISOString()}#${getPeerId()}`)
          : merged
      );
    },
    [isReadOnly, editor.parsedData, ganttDisplayData, isHideActive, isPersonSorting, commitPlan, handlePromptRestrictedAction]
  );

  // "Open JSON editor" requests (e.g. from the invalid-plan empty state).
  const { setIsSidebarCollapsed } = sidebar;
  useEffect(() => {
    const openEditor = () => {
      setIsSidebarCollapsed(false);
      window.requestAnimationFrame(() => document.getElementById("json-editor-textarea")?.focus());
    };
    window.addEventListener(OPEN_JSON_EDITOR_EVENT, openEditor);
    return () => window.removeEventListener(OPEN_JSON_EDITOR_EVENT, openEditor);
  }, [setIsSidebarCollapsed]);

  /* ------------------------------------------------------------------------ */
  /* Global keyboard shortcuts                                                 */
  /* ------------------------------------------------------------------------ */

  const closeAllDialogs = () => {
    setShowCommandPalette(false);
    setShowShortcutsModal(false);
    setShowAndroidTestingModal(false);
    setShowWebAccessModal(false);
    setShowRateAppModal(false);
    setShowPromptModal(false);
    setShowCopilot(false);
    setIsMobileMenuOpen(false);
    setShowPlanManagerModal(false);
    setShowReadOnlyForkModal(false);
    setShowEditorLoginModal(false);
    setShowShareRoomModal(false);
    setPendingConfirm(null);
    project.setShowAddPlanModal(false);
    people.setShowPeopleModal(false);
    sharing.setShowShareModal(false);
    autoSave.setShowAutoSaveModal(false);
    vault.setShowVersionHistoryModal(false);
    roomSync.setShowRoomModal(false);
    auth.setShowVerificationModal(false);
  };

  const zoomTimeline = (direction: -1 | 0 | 1) => {
    if (viewport.activeView !== "gantt" && viewport.activeView !== "canvas") return;
    viewport.setCurrentDayWidth(undefined);
    if (direction === 0) {
      viewport.setCurrentScale(DEFAULT_ZOOM_SCALE);
      return;
    }
    const index = ZOOM_SCALES.indexOf(viewport.currentScale);
    const next = ZOOM_SCALES[Math.min(ZOOM_SCALES.length - 1, Math.max(0, (index < 0 ? 1 : index) - direction))];
    viewport.setCurrentScale(next);
  };

  const shortcutActions = {
    closeAllDialogs,
    zoomTimeline,
    isPaletteOpen: showCommandPalette,
    isReadOnly,
    undo: undoRedo.undo,
    redo: undoRedo.redo,
    promptRestricted: handlePromptRestrictedAction,
    viewport,
    dateFilter
  };
  const shortcutActionsRef = useRef(shortcutActions);
  shortcutActionsRef.current = shortcutActions;

  // Subscribed once; reads the latest state through the ref above.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const a = shortcutActionsRef.current;
      const key = e.key.toLowerCase();
      const hasCommandModifier = e.metaKey || e.ctrlKey;
      const editable = isEditableTarget(e.target);
      const dialogOpen = isDialogOpen();

      if (e.key === "Escape") {
        if (dialogOpen) a.closeAllDialogs();
        return;
      }

      if (hasCommandModifier && !e.altKey && key === "k") {
        // Toggle the palette, but never stack it over another dialog.
        if (dialogOpen && !a.isPaletteOpen) return;
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }

      if (hasCommandModifier && !e.altKey && key === "j") {
        e.preventDefault();
        setShowCopilot((prev) => !prev);
        return;
      }

      if (hasCommandModifier && !e.altKey && (key === "z" || key === "y")) {
        // Inside text fields the browser's own undo applies; behind dialogs nothing happens.
        if (editable || dialogOpen) return;
        e.preventDefault();
        if (a.isReadOnly) {
          a.promptRestricted();
          return;
        }
        if (key === "y" || e.shiftKey) a.redo();
        else a.undo();
        return;
      }

      // Single-key shortcuts: never with modifiers (keeps Ctrl+C, Ctrl+B... native), never while
      // typing or while a dialog is open.
      if (hasCommandModifier || e.altKey || editable || dialogOpen) return;

      const toggle = (fn: () => void) => {
        e.preventDefault();
        if (!e.repeat) fn();
      };

      switch (e.key) {
        case "?":
          toggle(() => setShowShortcutsModal((prev) => !prev));
          return;
        case "1":
          toggle(() => a.viewport.setActiveView("gantt"));
          return;
        case "2":
          toggle(() => a.viewport.setActiveView("canvas"));
          return;
        case "3":
          toggle(() => a.viewport.setActiveView("kanban"));
          return;
        case "4":
          toggle(() => a.viewport.setActiveView("tasks"));
          return;
        case "5":
          toggle(() => a.viewport.setActiveView("summary"));
          return;
        case "6":
          toggle(() => a.viewport.setActiveView("notes"));
          return;
        case "+":
        case "=":
          e.preventDefault();
          a.zoomTimeline(1);
          return;
        case "-":
        case "_":
          e.preventDefault();
          a.zoomTimeline(-1);
          return;
        case "0":
          toggle(() => a.zoomTimeline(0));
          return;
      }

      switch (key) {
        case "c":
          toggle(() => a.viewport.setShowCriticalPath((prev: boolean) => !prev));
          return;
        case "b":
          toggle(() => a.viewport.setShowBaselines((prev: boolean) => !prev));
          return;
        case "t":
          toggle(() => a.dateFilter.setDateFilterMode((prev: string) => (prev === "today" ? "all" : "today")));
          return;
        case "w":
          toggle(() => a.dateFilter.setDateFilterMode((prev: string) => (prev === "week" ? "all" : "week")));
          return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Exports                                                                   */
  /* ------------------------------------------------------------------------ */

  // The interop exporters drop tombstoned tasks themselves; file names match the Share dialog's.
  const runExport = (label: string, extension: string, mimeType: string, build: (data: JanttData) => string) => {
    if (!editor.parsedData) {
      toast.showToast("Fix the plan JSON before exporting.", true);
      return;
    }
    try {
      downloadTextFile(buildExportFilename(project.currentProjectName, extension), build(editor.parsedData), mimeType);
    } catch (err) {
      toast.showToast(`${label} export failed: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  };

  const handleExportMsProject = () =>
    runExport("MS Project", "xml", "application/xml", (data) =>
      exportMsProjectXml(data, { projectName: project.currentProjectName })
    );

  const handleExportPrimavera = () =>
    runExport("Primavera P6", "xer", "text/plain", (data) =>
      exportPrimaveraXer(data, { projectName: project.currentProjectName })
    );

  const handleExportExecutiveReport = () =>
    runExport("Executive report", "html", "text/html;charset=utf-8", (data) =>
      exportExecutiveReportHtml(data.tasks || [], {
        title: project.currentProjectName || "Executive Project Status & Schedule Health Report",
        // Internal plan ids mean nothing to report readers; rooms have a shareable id.
        projectCode: roomSync.activeRoomId || undefined,
        theme: viewport.activeTheme?.mode === "dark" ? "dark" : "corporate",
        defaultGapDays: data.meta?.defaultGapDays,
        targetDate: typeof data.meta?.targetDate === "string" ? data.meta.targetDate : undefined,
        calendar: data.meta?.calendar,
        useWorkingDays: data.meta?.useWorkingDays,
        calendars: data.calendars,
        people: data.people
      })
    );

  /* ------------------------------------------------------------------------ */
  /* Layout                                                                    */
  /* ------------------------------------------------------------------------ */

  // Cloud collaboration panel, shown in the Navbar "Cloud" popover and the mobile menu. The host
  // passes `close`, called after an action that opens another surface (dialog, sign-in...).
  const renderCloudPanel = (close: () => void) => (
    <CloudBar
      activeRoomId={roomSync.activeRoomId}
      activeRoomRole={roomSync.activeRoomRole}
      activeRoomTitle={activeRoomTitle}
      onlineUsers={roomSync.onlineUsers}
      syncStatus={roomSync.syncStatus}
      syncMessage={roomSync.syncMessage}
      isProcessing={roomSync.isProcessing}
      lastSyncTime={roomSync.lastSyncTime}
      onRetrySync={roomSync.retryCloudSave}
      onStartCloudRoom={handleStartCloudRoom}
      onOpenShareRoom={handleOpenShareRoom}
      onOpenRoomModal={() => roomSync.setShowRoomModal(true)}
      onOpenUserHub={() => setShowPlanManagerModal(true)}
      onOpenAgentApi={() => setShowAgentApiModal(true)}
      isAgentApiEnabled={apiAccess.enabled}
      isPendingLoginEditor={isPendingLoginEditor}
      onOpenEditorLogin={() => setShowEditorLoginModal(true)}
      onPromptFork={() => setShowReadOnlyForkModal(true)}
      // Unknown while the session restores, so no "Sign in" prompt flashes for signed-in users.
      isSignedIn={auth.isLoadingAuth ? undefined : Boolean(auth.currentUser)}
      onSignIn={auth.loginWithGitHub}
      isRoomOwner={isRoomOwner}
      isRoomMember={roomSync.isActiveRoomMember}
      onSaveRoomToMyRooms={roomSync.saveActiveRoomToMyRooms}
      onLeaveRoom={handleLeaveCloudRoom}
      activeView={viewport.activeView}
      selectedThemeId={viewport.selectedThemeId}
      onRequestClose={close}
    />
  );

  const canDeleteActivePlan =
    project.activeProjectId !== "default" && Boolean(project.activeProject) && project.activeProject?.source !== "room";
  const openJsonEditor = () => sidebar.setIsSidebarCollapsed(false);
  const onOpenVerificationModal = ENABLE_GITHUB_VERIFICATION_GATE ? () => auth.setShowVerificationModal(true) : undefined;
  // Notes deleted remotely stay as tombstones until purged; they are not counted.
  const notesCount = useMemo(
    () => (editor.parsedData?.notes || []).filter((n) => !n._deleted).length,
    [editor.parsedData?.notes]
  );

  useEffect(() => { setCaptureExpanded(false); setCapture(null); }, [viewport.activeView, project.activeProjectId, isReadOnly]);

  const remotePresence = useMemo(() => roomSync.onlineUsers.filter(user => user.uid !== auth.currentUser?.uid), [roomSync.onlineUsers, auth.currentUser?.uid]);
  const roomConnection = !platform.isOnline || roomSync.syncStatus === "offline" ? "Offline" :
    { idle: "Connecting", syncing: "Syncing", "in-sync": "Connected", merged: "Connected", conflict: "Conflict", error: "Sync error" }[roomSync.syncStatus];
  const topModalId = useTopModalId();
  const isAnyOverlayOpen =
    Boolean(topModalId) ||
    showRisk ||
    capture !== null ||
    isMobileMenuOpen ||
    showCopilot ||
    taskDetail.isTaskDetailOpen ||
    (mobile.isMobile && !sidebar.isSidebarCollapsed) ||
    showPromptModal ||
    showPlanManagerModal ||
    showReadOnlyForkModal ||
    showEditorLoginModal ||
    showCommandPalette ||
    showShortcutsModal ||
    showAndroidTestingModal ||
    showWebAccessModal ||
    showRateAppModal ||
    showShareRoomModal ||
    showAgentApiModal ||
    pendingConfirm !== null ||
    project.showAddPlanModal ||
    people.showPeopleModal ||
    sharing.showShareModal ||
    autoSave.showAutoSaveModal ||
    vault.showVersionHistoryModal ||
    roomSync.showRoomModal ||
    auth.showVerificationModal;

  const backNavigationOverlays: BackNavigationOverlay[] = [
    { id: "note-editor", isOpen: mobile.isMobile && Boolean(noteBack), close: () => noteBack?.() },
    { id: "capture-menu", isOpen: captureExpanded, close: () => setCaptureExpanded(false) },
    { id: "quick-capture", isOpen: Boolean(capture), close: () => setCapture(null) },
    { id: "mobile-menu", isOpen: mobile.isMobile && isMobileMenuOpen, close: () => setIsMobileMenuOpen(false) },
    { id: "copilot", isOpen: showCopilot, close: () => setShowCopilot(false) },
    {
      id: "task-detail",
      isOpen: taskDetail.isTaskDetailOpen,
      close: taskDetail.closeTaskDetailSidebar
    },
    {
      id: "json-editor",
      isOpen: mobile.isMobile && !sidebar.isSidebarCollapsed,
      close: () => sidebar.setIsSidebarCollapsed(true)
    },
    { id: "read-only-fork", isOpen: showReadOnlyForkModal, close: () => setShowReadOnlyForkModal(false) },
    { id: "editor-login", isOpen: showEditorLoginModal, close: () => setShowEditorLoginModal(false) },
    { id: "prompt", isOpen: showPromptModal, close: () => setShowPromptModal(false) },
    { id: "plan-manager", isOpen: showPlanManagerModal, close: () => setShowPlanManagerModal(false) },
    { id: "add-plan", isOpen: project.showAddPlanModal, close: () => project.setShowAddPlanModal(false) },
    { id: "people", isOpen: people.showPeopleModal, close: () => people.setShowPeopleModal(false) },
    { id: "share", isOpen: sharing.showShareModal, close: () => sharing.setShowShareModal(false) },
    { id: "share-room", isOpen: showShareRoomModal, close: () => setShowShareRoomModal(false) },
    { id: "agent-api", isOpen: showAgentApiModal, close: () => setShowAgentApiModal(false) },
    { id: "auto-save", isOpen: autoSave.showAutoSaveModal, close: () => autoSave.setShowAutoSaveModal(false) },
    {
      id: "version-history",
      isOpen: vault.showVersionHistoryModal,
      close: () => vault.setShowVersionHistoryModal(false)
    },
    { id: "room", isOpen: roomSync.showRoomModal, close: () => roomSync.setShowRoomModal(false) },
    { id: "verification", isOpen: auth.showVerificationModal, close: () => auth.setShowVerificationModal(false) },
    { id: "command-palette", isOpen: showCommandPalette, close: () => setShowCommandPalette(false) },
    { id: "shortcuts", isOpen: showShortcutsModal, close: () => setShowShortcutsModal(false) },
    { id: "android-testing", isOpen: showAndroidTestingModal, close: handleCloseAndroidTestingModal },
    { id: "web-access", isOpen: showWebAccessModal, close: () => setShowWebAccessModal(false) },
    { id: "rate-app", isOpen: showRateAppModal, close: () => setShowRateAppModal(false) },
    { id: "confirm", isOpen: pendingConfirm !== null, close: () => setPendingConfirm(null) },
    { id: `modal-${topModalId}`, isOpen: Boolean(topModalId), close: closeTopModal }
  ];
  useAndroidBackNavigation(backNavigationOverlays, mobile.isMobile || platform.isStandalone);

  useEffect(() => {
    if (!platform.updateAvailable) setIsUpdateDismissed(false);
  }, [platform.updateAvailable]);

  return (
    <div
      className={`playground-app ${viewport.activeTheme.className} ${mobile.isMobile ? "is-mobile-device" : ""} ${mobile.isImmersiveLandscape ? "is-immersive-landscape" : ""}`}
      data-mode={viewport.activeTheme.mode || "dark"}
      style={{
        colorScheme: viewport.activeTheme.mode || "dark",
        ...(viewport.activeTheme.vars as React.CSSProperties)
      }}
    >
      {/* Universal import input (.json, .xml, .xer, .csv): mounted on every layout. */}
      <input
        type="file"
        ref={project.fileInputRef}
        accept={IMPORT_ACCEPT}
        onChange={(e) => {
          project.handleImportJsonFile(e);
          e.target.value = "";
        }}
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {mobile.isMobile ? (
        <MobileNavbar
          onSearch={() => setShowCommandPalette(true)}
          variant={mobile.isImmersiveLandscape ? "floating" : "bar"}
          activePlanName={activePlanName}
          handleOpenAddPlanModal={project.handleOpenAddPlanModal}
          onOpenPlanManager={() => setShowPlanManagerModal(true)}
          activeRoomId={roomSync.activeRoomId}
          onlineUsers={roomSync.onlineUsers}
          onOpenShare={handleOpenShare}
          setShowPeopleModal={people.setShowPeopleModal}
          saveStatus={autoSave.saveStatus}
          autoSaveLabel={autoSave.autoSaveLabel}
          onOpenAutoSave={() => autoSave.setShowAutoSaveModal(true)}
          snapshotsCount={vault.snapshots.length}
          onOpenVersionHistory={() => vault.setShowVersionHistoryModal(true)}
          selectedThemeId={viewport.selectedThemeId}
          setSelectedThemeId={viewport.setSelectedThemeId}
          onOpenPromptModal={() => setShowPromptModal(true)}
          onToggleCopilot={() => setShowCopilot((prev) => !prev)}
          onOpenJsonEditor={openJsonEditor}
          onImportFile={openImportDialog}
          currentUser={auth.currentUser}
          userProfile={auth.userProfile}
          isGitHubVerified={isGitHubVerified}
          onLogin={auth.loginWithGitHub}
          onLogout={auth.logout}
          onOpenVerificationModal={onOpenVerificationModal}
          isViewer={isViewer && !isPendingLoginEditor}
          isPendingLoginEditor={isPendingLoginEditor}
          onOpenEditorLogin={() => setShowEditorLoginModal(true)}
          onPromptFork={() => setShowReadOnlyForkModal(true)}
          cloudPanel={renderCloudPanel}
          cloudStatusLabel={roomSync.activeRoomId ? `${roomConnection} · ${roomRoleLabel}` : "Local plan"}
          roomConnection={roomConnection}
          onUndo={undoRedo.canUndo && !isReadOnly ? undoRedo.undo : undefined}
          onRedo={undoRedo.canRedo && !isReadOnly ? undoRedo.redo : undefined}
          isSigningIn={auth.isSigningIn}
          activeView={viewport.activeView}
          notesCount={notesCount}
          setActiveView={viewport.setActiveView}
          isMenuOpen={isMobileMenuOpen}
          onMenuOpenChange={setIsMobileMenuOpen}
          isOnline={platform.isOnline}
          updateAvailable={platform.updateAvailable}
          canInstall={platform.canInstall}
          isIosSafari={platform.isIosSafari}
          isStandalone={platform.isStandalone}
          isTwa={platform.isTwa}
          onInstall={platform.promptInstall}
          onApplyUpdate={applySavedUpdate}
          onOpenAndroidTesting={() => setShowAndroidTestingModal(true)}
          onOpenWebAccess={() => setShowWebAccessModal(true)}
          onOpenRateApp={() => setShowRateAppModal(true)}
          appModeLabel={platform.isTwa ? "Android App" : platform.isStandalone ? "Standalone App" : "Web"}
        />
      ) : (
        <Navbar
          onlineUsers={roomSync.onlineUsers}
          saveStatus={autoSave.saveStatus}
          lastSavedAt={autoSave.lastSavedAt}
          autoSaveInterval={autoSave.autoSaveInterval}
          autoSaveLabel={autoSave.autoSaveLabel}
          setShowAutoSaveModal={autoSave.setShowAutoSaveModal}
          snapshotsCount={vault.snapshots.length}
          setShowVersionHistoryModal={vault.setShowVersionHistoryModal}
          isSidebarCollapsed={sidebar.isSidebarCollapsed}
          setIsSidebarCollapsed={sidebar.setIsSidebarCollapsed}
          selectedThemeId={viewport.selectedThemeId}
          setSelectedThemeId={viewport.setSelectedThemeId}
          onToggleCopilot={() => setShowCopilot((prev) => !prev)}
          showCopilot={showCopilot}
          currentUser={auth.currentUser}
          userProfile={auth.userProfile}
          isLoadingAuth={auth.isLoadingAuth}
          isSigningIn={auth.isSigningIn}
          onOpenUserHub={() => setShowPlanManagerModal(true)}
          onOpenAgentApi={() => setShowAgentApiModal(true)}
          isAgentApiEnabled={apiAccess.enabled}
          isGitHubVerified={isGitHubVerified}
          onOpenVerificationModal={onOpenVerificationModal}
          onLogin={auth.loginWithGitHub}
          onLogout={auth.logout}
          isViewer={isViewer && !isPendingLoginEditor}
          isPendingLoginEditor={isPendingLoginEditor}
          onOpenEditorLogin={() => setShowEditorLoginModal(true)}
          onPromptFork={() => setShowReadOnlyForkModal(true)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
          activeProjectId={project.activeProjectId}
          activePlanName={activePlanName}
          customProjects={project.customProjects}
          ownedRooms={ownedRooms}
          sharedRooms={sharedRooms}
          onSelectProject={handleSelectProjectOrRoom}
          onNewPlan={project.handleOpenAddPlanModal}
          onImportFile={openImportDialog}
          onOpenPlanManager={() => setShowPlanManagerModal(true)}
          onDeleteActivePlan={canDeleteActivePlan ? handleDeleteActivePlan : undefined}
          onOpenShare={handleOpenShare}
          peopleCount={people.effectivePeople.length}
          onOpenPeople={() => people.setShowPeopleModal(true)}
          activeRoomId={roomSync.activeRoomId}
          roomRoleLabel={roomRoleLabel}
          syncStatus={roomSync.syncStatus}
          syncMessage={roomSync.syncMessage}
          onlineCount={roomSync.onlineUsers.length}
          cloudPanel={renderCloudPanel}
          onDeleteRoom={isRoomOwner && auth.userProfile ? handleDeleteActiveRoom : undefined}
          canInstall={platform.canInstall}
          isStandalone={platform.isStandalone}
          isTwa={platform.isTwa}
          onInstall={platform.promptInstall}
          onOpenAndroidTesting={() => setShowAndroidTestingModal(true)}
          onOpenWebAccess={() => setShowWebAccessModal(true)}
        />
      )}

      {!isAppBannerDismissed && !mobile.isImmersiveLandscape && (
        <AppDistributionBanner
          isAppContext={isAppContext}
          isMobile={mobile.isMobile}
          onOpenAndroidTesting={() => setShowAndroidTestingModal(true)}
          onOpenWebAccess={() => setShowWebAccessModal(true)}
          onOpenRateApp={() => setShowRateAppModal(true)}
          onDismiss={handleDismissAppBanner}
        />
      )}

      {(platform.isOnline === false || (platform.updateAvailable && !isUpdateDismissed)) && (
        <div className="jantt-platform-pill-stack" role="status" aria-live="polite">
          {!platform.isOnline && (
            <div className="jantt-platform-pill is-offline">
              <WifiOff size={13} aria-hidden="true" />
              <span>{autoSave.saveError ? "Offline · Save failed" : autoSave.saveStatus === "saved"
                ? "Offline · Saved on this device" : "Offline · Changes pending"}</span>
            </div>
          )}
          {platform.updateAvailable && !isUpdateDismissed && (
            <div className="jantt-platform-pill is-update">
              <RefreshCw size={13} aria-hidden="true" />
              <span>New version ready</span>
              <button type="button" className="jantt-platform-pill-action" onClick={applySavedUpdate}>
                Refresh
              </button>
              <button
                type="button"
                className="jantt-platform-pill-close"
                onClick={() => setIsUpdateDismissed(true)}
                aria-label="Dismiss update notice"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      <main className="workspace-main">
        <EditorPane
          isSidebarCollapsed={sidebar.isSidebarCollapsed}
          sidebarWidth={sidebar.sidebarWidth}
          setIsSidebarCollapsed={sidebar.setIsSidebarCollapsed}
          isLiveSyncing={editor.isLiveSyncing}
          jsonText={editor.jsonText}
          parsedData={editor.parsedData}
          validationResult={editor.validationResult}
          formatJson={editor.formatJson}
          handleResetActiveProject={project.handleResetActiveProject}
          handleCopyJson={editor.handleCopyJson}
          copiedJson={editor.copiedJson}
          handleEditorChange={editor.handleEditorChange}
          handleImportJsonFile={project.handleImportJsonFile}
          handleDownloadJson={editor.handleDownloadJson}
          handleExportCsv={editor.handleExportCsv}
          isMobile={mobile.isMobile}
          isViewer={isReadOnly}
          isPendingLoginEditor={isPendingLoginEditor}
          onOpenEditorLogin={() => setShowEditorLoginModal(true)}
          onPromptFork={handlePromptRestrictedAction}
        />

        {!sidebar.isSidebarCollapsed && !mobile.isMobile && (
          <div
            className={`workspace-splitter ${sidebar.isResizing ? "is-resizing" : ""}`}
            onPointerDown={sidebar.startResizing}
            title="Drag left/right to adjust JSON sidebar width"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize JSON editor"
            aria-valuenow={sidebar.sidebarWidth}
          >
            <div className="splitter-handle" />
          </div>
        )}

        <section className="chart-pane">
          <div className="chart-container-card">
            {/* A crashing view stays contained; switching view or plan retries it. */}
            <ErrorBoundary scope="pane" resetKey={`${viewport.activeView}:${project.activeProjectId}`}>
              <ViewRouter
                key={project.activeProjectId}
                registerNoteBack={registerNoteBack}
                notesIntent={notesIntent}
                onConsumeNotesIntent={handleConsumeNotesIntent}
                onOpenMonteCarlo={() => setShowRisk(true)}
                remotePresence={remotePresence}
                onInspectTask={setInspectedTaskId}
                onQuickTask={status => setCapture({ milestone: false, status })}
                activeView={viewport.activeView}
                setActiveView={viewport.setActiveView}
                notesCount={notesCount}
                parsedData={editor.parsedData}
                ganttDisplayData={ganttDisplayData}
                handleGanttCommit={handleGanttCommit}
                viewport={viewport}
                dateFilter={dateFilter}
                tasks={tasks}
                people={people}
                taskDetail={taskDetail}
                editor={editor}
                autoSave={autoSave}
                project={project}
                isMobile={mobile.isMobile}
                isViewer={isReadOnly}
                onPromptFork={handlePromptRestrictedAction}
              />
            </ErrorBoundary>
          </div>
        </section>
      </main>

      <CopilotDrawer
        isOpen={showCopilot}
        onClose={() => setShowCopilot(false)}
        copilot={copilot}
        isMobile={mobile.isMobile}
        onOpenPromptModal={() => setShowPromptModal(true)}
      />

      {/* Mobile Bottom Navigation Bar (Hidden in Immersive Landscape to maximize chart space) */}
      {mobile.isMobile && !mobile.isImmersiveLandscape && (
        <MobileBottomNav
          activeView={viewport.activeView}
          setActiveView={viewport.setActiveView}
          notesCount={notesCount}
        />
      )}

      {mobile.isMobile && !mobile.isImmersiveLandscape && !isReadOnly && !isAnyOverlayOpen && (
        <MobileQuickFab activeView={viewport.activeView} expanded={captureExpanded}
          onToggle={() => setCaptureExpanded(value => !value)}
          onCapture={milestone => { setCaptureExpanded(false); setCapture({ milestone }); }} />
      )}

      {capture && !isReadOnly && <QuickCapture milestone={capture.milestone} onClose={() => setCapture(null)}
        onCreate={draft => tasks.createTask({ ...draft, status: capture.status })} />}
      {/* Modals & Popups */}
      <ModalHost
        showPromptModal={showPromptModal}
        setShowPromptModal={setShowPromptModal}
        project={project}
        ownedRooms={ownedRooms}
        sharedRooms={sharedRooms}
        auth={auth}
        showPlanManagerModal={showPlanManagerModal}
        setShowPlanManagerModal={setShowPlanManagerModal}
        handleSelectProjectOrRoom={handleSelectProjectOrRoom}
        handleCreateCloudRoomFromData={handleCreateCloudRoomFromData}
        handleDeleteCloudRoom={handleDeleteCloudRoom}
        handleLeaveCloudRoom={handleLeaveCloudRoom}
        handleOpenShareRoom={handleOpenShareRoom}
        toast={toast}
        people={people}
        editor={editor}
        roomSync={roomSync}
        viewport={viewport}
        sharing={sharing}
        sidebar={sidebar}
        autoSave={autoSave}
        vault={vault}
        handleRestoreSnapshot={handleRestoreSnapshot}
        showShareRoomModal={showShareRoomModal}
        setShowShareRoomModal={setShowShareRoomModal}
        shareModalRoomId={shareModalRoomId}
        showAgentApiModal={showAgentApiModal}
        setShowAgentApiModal={setShowAgentApiModal}
        apiAccess={apiAccess}
      />

      <ReadOnlyForkModal
        allowFork={roomSync.allowViewerForks}
        show={showReadOnlyForkModal}
        setShow={setShowReadOnlyForkModal}
        roomTitle={activeRoomTitle}
        onMakeLocalCopy={handleForkToLocalCopy}
      />

      <EditorLoginModal
        allowFork={roomSync.allowViewerForks}
        show={showEditorLoginModal}
        setShow={setShowEditorLoginModal}
        roomTitle={activeRoomTitle}
        onLogin={auth.loginWithGitHub}
        onMakeLocalCopy={handleForkToLocalCopy}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        parsedData={editor.parsedData}
        activeView={viewport.activeView}
        setActiveView={viewport.setActiveView}
        selectedThemeId={viewport.selectedThemeId}
        setSelectedThemeId={viewport.setSelectedThemeId}
        showCriticalPath={viewport.showCriticalPath}
        onToggleCriticalPath={() => viewport.setShowCriticalPath((prev) => !prev)}
        showBaselines={viewport.showBaselines}
        onToggleBaselines={() => viewport.setShowBaselines((prev) => !prev)}
        onSelectTask={(task) => taskDetail.openTaskDetailSidebar(task)}
        onOpenMonteCarlo={editor.parsedData ? () => setShowRisk(true) : undefined}
        onOpenShare={handleOpenShare}
        onOpenAddPlan={project.handleOpenAddPlanModal}
        onOpenPlanManager={() => setShowPlanManagerModal(true)}
        onOpenShortcuts={() => setShowShortcutsModal(true)}
        onExportMsProject={handleExportMsProject}
        onExportPrimavera={handleExportPrimavera}
        onExportCsv={editor.handleExportCsv}
        onExportExecutiveReport={handleExportExecutiveReport}
        onDownloadJson={editor.handleDownloadJson}
        onJumpToday={() => dateFilter.setDateFilterMode("today")}
        onFilterWeek={() => dateFilter.setDateFilterMode("week")}
      />

      {showRisk && editor.parsedData && <React.Suspense fallback={null}>
        <RiskDialog show onClose={() => setShowRisk(false)} parsedData={editor.parsedData} />
      </React.Suspense>}

      <ShortcutsModal
        show={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      <AndroidTestingModal
        show={showAndroidTestingModal}
        onClose={handleCloseAndroidTestingModal}
      />

      <WebAccessModal
        show={showWebAccessModal}
        onClose={() => setShowWebAccessModal(false)}
      />

      <RateAppModal
        show={showRateAppModal}
        onClose={() => setShowRateAppModal(false)}
      />

      {pendingConfirm && <ConfirmDialog {...pendingConfirm} onCancel={() => setPendingConfirm(null)} />}

      <Toast toasts={toast.toasts} onDismiss={toast.dismissToast} />
    </div>
  );
}

export default App;
