import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { validate, calculatePlanHash, type JanttData } from "@jantt/core";

// Re-export all types, constants, and utilities for external consumers
export type {
  SavedProject,
  DateFilterMode,
  ActiveView,
  KanbanSortField,
  KanbanSortRule,
  SortDirection,
  SummarySortConfig,
  AutoSaveInterval,
  EffectivePerson
} from "./types";

export {
  PRIORITY_ORDER,
  AUTOSAVE_OPTIONS,
  DEFAULT_TEMPLATE,
  AVAILABLE_THEMES,
  STORAGE_KEYS,
  PERSON_COLORS
} from "./constants";

export {
  formatRelativeTime,
  encodeDataToBase64Url,
  decodeDataFromBase64Url,
  getEffectivePeople,
  loadInitialState,
  loadSavedProjects,
  saveCustomProjects,
  createBlankPlan
} from "./utils";

import type { SavedProject } from "./types";
import { STORAGE_KEYS } from "./constants";
import { loadInitialState, loadSavedProjects, saveCustomProjects, decodeDataFromBase64Url } from "./utils";

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
import {
  listenToUserRooms,
  joinRoomViaInvite,
  deleteRoom,
  leaveRoom,
  getRoom,
  saveRoomDataAtomic
} from "./firebase/roomService";
import type { UserRoomPointer, FullRoomPayload } from "./firebase";
import { commandBus } from "./services";

// View & Layout & Modal Components (Domain-Driven Architecture)
import {
  Navbar,
  Subheader,
  EditorPane,
  ViewRouter,
  ModalHost,
  Toast
} from "./components";

export function App() {
  const init = useMemo(() => loadInitialState(), []);

  // UI Modals & Notifications
  const toast = useToast();
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showPlanManagerModal, setShowPlanManagerModal] = useState(false);

  // Firebase Authentication & Cloud User Identity
  const auth = useAuth();
  const [ownedRooms, setOwnedRooms] = useState<UserRoomPointer[]>([]);
  const [sharedRooms, setSharedRooms] = useState<UserRoomPointer[]>([]);
  const [shareModalRoomId, setShareModalRoomId] = useState<string | null>(null);
  const [showShareRoomModal, setShowShareRoomModal] = useState(false);

  // Handlers refs for circular hook bindings
  const onCreateCloudRoomRef = useRef<((title: string, data: JanttData) => Promise<string | null>) | undefined>();
  const onUpdateExistingRoomRef = useRef<((roomId: string, data: JanttData) => Promise<boolean>) | undefined>();

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

  // Gantt Viewport & Visual Themes
  const viewport = useGanttViewport({
    initialTheme: init.initialTheme,
    initialScale: init.initialScale,
    initialRouting: init.initialRouting,
    initialRowHeightMode: init.initialRowHeightMode,
    initialRowHeight: init.initialRowHeight,
    initialCritical: init.initialCritical,
    initialBaselines: init.initialBaselines,
    initialAutoCascade: init.initialAutoCascade,
    initialView: init.initialView
  });

  // Sidebar Drag-Resize & Collapse
  const sidebar = useSidebarResize({
    initialWidth: init.initialWidth,
    initialCollapsed: init.initialCollapsed
  });

  // People & Squad Management
  const people = usePeopleTeams({
    initialPeople: (init.initialParsed as any)?.people || [],
    initialTeams: (init.initialParsed as any)?.teams || [],
    initialPersonFilter: init.initialPersonFilter,
    parsedData: editor.parsedData,
    handleChartCommit: editor.handleChartCommit,
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
    initialProjects: loadSavedProjects(),
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
      onCreateCloudRoomRef.current ? onCreateCloudRoomRef.current(title, data) : Promise.resolve(null),
    onUpdateExistingRoom: (roomId, data) =>
      onUpdateExistingRoomRef.current ? onUpdateExistingRoomRef.current(roomId, data) : Promise.resolve(false)
  });

  // Zero-Data-Loss Version History & Snapshot Vault
  const vault = useSnapshotVault(project.activeProjectId);

  // Dynamic Real-Time Collaboration Sync & Instant Cross-Tab Engine
  const dynamicSync = useDynamicSync({
    activeProjectId: project.activeProjectId,
    customProjects: project.customProjects,
    setCustomProjects: project.setCustomProjects,
    parsedData: editor.parsedData,
    setParsedData: editor.setParsedData,
    setJsonText: editor.setJsonText,
    setPeople: people.setPeople,
    setTeams: people.setTeams,
    setValidationResult: editor.setValidationResult,
    showToast: toast.showToast,
    captureSnapshot: vault.captureSnapshot
  });

  // Auto-Save Engine with Configurable Cadence, Collision Check, and Cross-Tab Broadcast
  const autoSave = useAutoSave({
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

  // High-Scale Firebase Realtime Room Sync (100+ Concurrent Collaborators)
  const roomSync = useRoomSync({
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
    activeView: viewport.activeView,
    selectedThemeId: viewport.selectedThemeId,
    userProfile: auth.userProfile,
    onRequireVerification: () => auth.setShowVerificationModal(true)
  });

  // Handlers for Cloud Rooms & User Hub
  const handleSelectCloudRoom = useCallback(
    async (roomId: string) => {
      try {
        if (auth.userProfile && !auth.userProfile.githubVerified) {
          auth.setShowVerificationModal(true);
          toast.showToast("Support the creator by following & starring repos to collaborate in cloud rooms.", true);
          return;
        }

        let roomPayload: FullRoomPayload | null = null;
        if (auth.userProfile) {
          roomPayload = await joinRoomViaInvite(roomId, auth.userProfile);
        } else {
          roomPayload = await getRoom(roomId);
        }

        if (!roomPayload) {
          toast.showToast(`Room "${roomId}" not found or has been deleted`, true);
          return;
        }

        const isOwner = auth.userProfile && roomPayload.meta.ownerUid === auth.userProfile.uid;
        const memberRecord = auth.userProfile ? roomPayload.members?.[auth.userProfile.uid] : null;
        const isEditor = isOwner || memberRecord?.role === "editor";
        const role: "collaborator" | "viewer" = isEditor ? "collaborator" : "viewer";

        const newProj: SavedProject = {
          id: `room-${roomId}`,
          name: roomPayload.meta.title,
          updatedAt: roomPayload.meta.updatedAt,
          data: roomPayload.data,
          source: "room",
          roomId: roomPayload.meta.roomId,
          role,
          revision: roomPayload.meta.revision,
          lastSyncedAt: new Date().toISOString()
        };

        const updated = [newProj, ...project.customProjects.filter((p) => p.id !== newProj.id)];
        project.setCustomProjects(updated);
        saveCustomProjects(updated);
        project.setActiveProjectId(newProj.id);
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, newProj.id);
        } catch {}

        editor.setParsedData(roomPayload.data);
        editor.setJsonText(JSON.stringify(roomPayload.data, null, 2));
        people.setPeople(roomPayload.data.people || []);
        people.setTeams(roomPayload.data.teams || []);
        editor.setValidationResult(validate(roomPayload.data));

        setShowPlanManagerModal(false);
        toast.showToast(`Opened room "${roomPayload.meta.title}"!`);
      } catch (err: any) {
        toast.showToast(`Failed to load room: ${err.message}`, true);
      }
    },
    [auth.userProfile, editor, people, project, toast]
  );

  const handleCreateCloudRoomFromData = useCallback(
    async (title: string, data: JanttData): Promise<string | null> => {
      if (!auth.currentUser) {
        auth.loginWithGitHub();
        return null;
      }
      if (!auth.userProfile?.githubVerified) {
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
    [auth, roomSync, toast]
  );
  onCreateCloudRoomRef.current = handleCreateCloudRoomFromData;

  const handleUpdateExistingCloudRoom = useCallback(
    async (roomId: string, data: JanttData): Promise<boolean> => {
      if (!auth.userProfile) {
        auth.loginWithGitHub();
        return false;
      }
      if (!auth.userProfile.githubVerified) {
        auth.setShowVerificationModal(true);
        toast.showToast("Support the creator by following & starring repos to collaborate in cloud rooms.", true);
        return false;
      }
      try {
        const result = await saveRoomDataAtomic(roomId, data, auth.userProfile);
        if (result.success) {
          toast.showToast(`Updated cloud room "${roomId}" with new plan!`);
          await handleSelectCloudRoom(roomId);
          return true;
        }
        return false;
      } catch (err: any) {
        toast.showToast(`Failed to update room: ${err.message}`, true);
        return false;
      }
    },
    [auth, handleSelectCloudRoom, toast]
  );
  onUpdateExistingRoomRef.current = handleUpdateExistingCloudRoom;

  const handleSelectProjectOrRoom = useCallback(
    async (projectId: string) => {
      if (projectId.startsWith("room-")) {
        const roomId = projectId.replace(/^room-/, "");
        const existing = project.customProjects.find((p) => p.id === projectId);
        if (existing) {
          project.handleSelectProject(projectId);
        } else {
          await handleSelectCloudRoom(roomId);
        }
        return;
      }
      project.handleSelectProject(projectId);
    },
    [project, handleSelectCloudRoom]
  );

  const handleDeleteCloudRoom = useCallback(
    async (roomId: string) => {
      if (!auth.userProfile) return;
      try {
        await deleteRoom(roomId, auth.userProfile.uid);
        const projId = `room-${roomId}`;
        const updated = project.customProjects.filter((p) => p.id !== projId);
        project.setCustomProjects(updated);
        saveCustomProjects(updated);
        if (project.activeProjectId === projId) {
          project.handleSelectProject("default");
        }
        toast.showToast("Room permanently deleted and removed from all collaborators.");
      } catch (err: any) {
        toast.showToast(`Failed to delete room: ${err.message}`, true);
      }
    },
    [auth.userProfile, project, toast]
  );

  const handleLeaveCloudRoom = useCallback(
    async (roomId: string) => {
      if (!auth.userProfile) return;
      try {
        await leaveRoom(roomId, auth.userProfile.uid);
        const projId = `room-${roomId}`;
        const updated = project.customProjects.filter((p) => p.id !== projId);
        project.setCustomProjects(updated);
        saveCustomProjects(updated);
        if (project.activeProjectId === projId) {
          project.handleSelectProject("default");
        }
        toast.showToast("Left room successfully.");
      } catch (err: any) {
        toast.showToast(`Failed to leave room: ${err.message}`, true);
      }
    },
    [auth.userProfile, project, toast]
  );

  const handleOpenShareRoom = useCallback((roomId: string) => {
    setShareModalRoomId(roomId);
    setShowShareRoomModal(true);
  }, []);

  // 1-Click Snapshot Restoration with Audit Trail
  const handleRestoreSnapshot = useCallback(
    (snapshotData: JanttData, reason: string) => {
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

  // Dynamic Live URL Navigation without Reload (seamlessly handles in-place link clicks & address bar updates)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleHashOrUrlChange = () => {
      try {
        const hash = window.location.hash.replace(/^#/, "");
        let dataPayload: string | null = null;
        if (hash.startsWith("data=")) {
          dataPayload = hash.substring(5);
        } else {
          const hp = new URLSearchParams(hash);
          if (hp.get("data")) dataPayload = hp.get("data");
        }
        const urlParams = new URLSearchParams(window.location.search);
        // Never import hash payload as local plan if ?url= cloud link is active
        if (urlParams.get("url")) return;

        if (dataPayload) {
          const currentActive = project.customProjects.find((p) => p.id === project.activeProjectId);
          if (currentActive?.source === "linked") return;

          const decoded = decodeDataFromBase64Url(dataPayload);
          if (decoded) {
            // Guard: don't re-import if current plan already matches decoded payload
            if (editor.parsedData && calculatePlanHash(editor.parsedData) === calculatePlanHash(decoded)) {
              return;
            }

            const sharedName = urlParams.get("name") || decoded.meta?.title || "Shared Plan";
            const sharedId = `shared-${Date.now().toString(36)}`;
            const sharedProj: SavedProject = {
              id: sharedId,
              name: sharedName,
              updatedAt: new Date().toISOString(),
              data: decoded,
              source: "local"
            };
            project.setCustomProjects((prev) => {
              const next = [sharedProj, ...prev.filter((p) => p.name !== sharedName)];
              saveCustomProjects(next);
              return next;
            });
            project.setActiveProjectId(sharedId);
            editor.setParsedData(decoded);
            people.setPeople(decoded.people || []);
            people.setTeams(decoded.teams || []);
            const formatted = JSON.stringify(decoded, null, 2);
            editor.setJsonText(formatted);
            editor.setValidationResult(validate(decoded));
            try {
              localStorage.setItem(STORAGE_KEYS.ACTIVE_JSON, formatted);
              localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, sharedId);
            } catch {}
            toast.showToast(`Updated to shared plan version: ${sharedName}!`);
          }
        }
      } catch (err) {
        console.error("Failed to dynamically update plan on URL change:", err);
      }
    };

    window.addEventListener("hashchange", handleHashOrUrlChange);
    window.addEventListener("popstate", handleHashOrUrlChange);
    return () => {
      window.removeEventListener("hashchange", handleHashOrUrlChange);
      window.removeEventListener("popstate", handleHashOrUrlChange);
    };
  }, [editor, people, project, toast]);

  // Task Actions, Multi-Sort Engines, and View Filters
  const tasks = useTaskActions({
    parsedData: editor.parsedData,
    setParsedData: editor.setParsedData,
    setJsonText: editor.setJsonText,
    setValidationResult: editor.setValidationResult,
    handleChartCommit: editor.handleChartCommit,
    dateFilterMode: dateFilter.dateFilterMode,
    dateFilterBehavior: dateFilter.dateFilterBehavior,
    isTaskMatchingDateFilter: dateFilter.isTaskMatchingDateFilter,
    effectivePeople: people.effectivePeople,
    teams: people.teams,
    initialKanbanSort: init.initialKanbanSort
  });

  // Interactive Slide-Out Task Detail Drawer
  const taskDetail = useTaskDetailSidebar({
    parsedData: editor.parsedData,
    activeTheme: viewport.activeTheme,
    activeView: viewport.activeView,
    handleChartCommit: editor.handleChartCommit
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
      if (!editor.parsedData) return;
      if (!isHideActive && !isPersonSorting) {
        editor.handleChartCommit(updated);
        return;
      }
      const updatedMap = new Map(updated.tasks.map((t) => [t.id, t]));
      const mergedTasks = editor.parsedData.tasks.map((t) => updatedMap.get(t.id) || t);
      editor.handleChartCommit({ ...editor.parsedData, ...updated, tasks: mergedTasks });
    },
    [editor.parsedData, isHideActive, isPersonSorting, editor.handleChartCommit]
  );

  return (
    <div
      className={`playground-app ${viewport.activeTheme.className}`}
      style={{
        colorScheme: viewport.activeTheme.mode || "dark",
        ...(viewport.activeTheme.vars as React.CSSProperties)
      }}
    >
      <Navbar
        saveStatus={autoSave.saveStatus}
        lastSavedAt={autoSave.lastSavedAt}
        autoSaveInterval={autoSave.autoSaveInterval}
        autoSaveLabel={autoSave.autoSaveLabel}
        setShowAutoSaveModal={autoSave.setShowAutoSaveModal}
        snapshotsCount={vault.snapshots.length}
        setShowVersionHistoryModal={vault.setShowVersionHistoryModal}
        isSidebarCollapsed={sidebar.isSidebarCollapsed}
        setIsSidebarCollapsed={sidebar.setIsSidebarCollapsed}
        activeView={viewport.activeView}
        setActiveView={viewport.setActiveView}
        notesCount={editor.parsedData?.notes?.length || 0}
        fileInputRef={project.fileInputRef}
        handleImportJsonFile={project.handleImportJsonFile}
        selectedThemeId={viewport.selectedThemeId}
        setSelectedThemeId={viewport.setSelectedThemeId}
        setShowPromptModal={setShowPromptModal}
        currentUser={auth.currentUser}
        userProfile={auth.userProfile}
        onOpenUserHub={() => setShowPlanManagerModal(true)}
        isGitHubVerified={Boolean(auth.userProfile?.githubVerified || auth.verificationStatus?.isVerified)}
        onOpenVerificationModal={() => auth.setShowVerificationModal(true)}
        onLogin={auth.loginWithGitHub}
        onLogout={auth.logout}
      />

      <Subheader
        activeProjectId={project.activeProjectId}
        customProjects={project.customProjects}
        handleSelectProject={handleSelectProjectOrRoom}
        handleOpenAddPlanModal={project.handleOpenAddPlanModal}
        setShowShareModal={sharing.setShowShareModal}
        setCopiedShareLink={sharing.setCopiedShareLink}
        handleDeleteProject={project.handleDeleteProject}
        setShowPeopleModal={people.setShowPeopleModal}
        effectivePeople={people.effectivePeople}
        ownedRooms={ownedRooms}
        sharedRooms={sharedRooms}
        onOpenPlanManager={() => setShowPlanManagerModal(true)}
        activeRoomId={roomSync.activeRoomId}
        activeRoomRole={roomSync.activeRoomRole}
        activeRoomTitle={
          ownedRooms.find((r) => r.roomId === roomSync.activeRoomId)?.title ||
          sharedRooms.find((r) => r.roomId === roomSync.activeRoomId)?.title ||
          project.customProjects.find((p) => p.roomId === roomSync.activeRoomId)?.name ||
          "Project Room"
        }
        onlineUsers={roomSync.onlineUsers}
        onOpenShareRoom={handleOpenShareRoom}
        onLeaveCloudRoom={handleLeaveCloudRoom}
      />

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
        />

        {!sidebar.isSidebarCollapsed && (
          <div
            className={`workspace-splitter ${sidebar.isResizing ? "is-resizing" : ""}`}
            onPointerDown={sidebar.startResizing}
            title="Drag left/right to adjust JSON sidebar width"
          >
            <div className="splitter-handle" />
          </div>
        )}

        <section className="chart-pane">
          <div className="chart-container-card">
            <ViewRouter
              activeView={viewport.activeView}
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
            />
          </div>
        </section>
      </main>

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
      />

      <Toast
        toastMessage={toast.toastMessage}
        isToastError={toast.isToastError}
      />
    </div>
  );
}

export default App;
