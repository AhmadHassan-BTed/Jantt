import React, { useMemo, useRef, useState, useCallback } from "react";
import { Jantt } from "@jantt/react";
import { getTodayISODate, validate, type Person, type Team, type JanttData } from "@jantt/core";

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

import { loadInitialState, loadSavedProjects } from "./utils";

// Custom Hooks
import { useToast } from "./hooks/useToast";
import { useSidebarResize } from "./hooks/useSidebarResize";
import { useGanttViewport } from "./hooks/useGanttViewport";
import { useEditorState } from "./hooks/useEditorState";
import { usePeopleTeams } from "./hooks/usePeopleTeams";
import { useProjectState } from "./hooks/useProjectState";
import { useAutoSave } from "./hooks/useAutoSave";
import { useDateFilter } from "./hooks/useDateFilter";
import { useCloudSync } from "./hooks/useCloudSync";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTaskDetailSidebar } from "./hooks/useTaskDetailSidebar";
import { useSharing } from "./hooks/useSharing";
import { useSnapshotVault } from "./hooks/useSnapshotVault";
import { useDynamicSync } from "./hooks/useDynamicSync";

// View & Modal Components
import { Navbar } from "./components/Navbar";
import { EditorPane } from "./components/EditorPane";
import { DateFilterBar } from "./components/DateFilterBar";
import { KanbanView } from "./components/KanbanView";
import { BudgetKpiView } from "./components/BudgetKpiView";
import { TasksView } from "./components/TasksView";
import { NotesView } from "./components/NotesView";
import { PromptModal } from "./components/PromptModal";
import { AddPlanModal } from "./components/AddPlanModal";
import { PeopleTeamsModal } from "./components/PeopleTeamsModal";
import { CloudLinkModal } from "./components/CloudLinkModal";
import { ShareModal } from "./components/ShareModal";
import { AutoSaveModal } from "./components/AutoSaveModal";
import { VersionHistoryModal } from "./components/VersionHistoryModal";
import { Toast } from "./components/Toast";
import { EmptyChartState } from "./components/EmptyChartState";

export function App() {
  const init = useMemo(() => loadInitialState(), []);

  // UI Modals & Notifications
  const toast = useToast();
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Cross-hook sync refs
  const onPeopleChangeRef = useRef<((p: Person[]) => void) | undefined>();
  const onTeamsChangeRef = useRef<((t: Team[]) => void) | undefined>();

  // Editor State (JSON text, parsed AST, schema validation)
  const editor = useEditorState({
    initialJson: init.initialJson,
    initialParsed: init.initialParsed,
    onPeopleChange: (p) => onPeopleChangeRef.current?.(p),
    onTeamsChange: (t) => onTeamsChangeRef.current?.(t)
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
  onPeopleChangeRef.current = people.setPeople;
  onTeamsChangeRef.current = people.setTeams;

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

  const flushPendingSaveRef = useRef<() => void>(() => {});

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
    flushPendingSave: () => flushPendingSaveRef.current()
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
  flushPendingSaveRef.current = autoSave.flushSave;

  // Cloud Link & Remote Sync with 3-Way Task Reconciliation
  const cloud = useCloudSync({
    customProjects: project.customProjects,
    setCustomProjects: project.setCustomProjects,
    activeProjectId: project.activeProjectId,
    setActiveProjectId: project.setActiveProjectId,
    handleSelectProject: project.handleSelectProject,
    parsedData: editor.parsedData,
    setJsonText: editor.setJsonText,
    setParsedData: editor.setParsedData,
    setPeople: people.setPeople,
    setTeams: people.setTeams,
    setValidationResult: editor.setValidationResult,
    showToast: toast.showToast,
    captureSnapshot: vault.captureSnapshot
  });

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

  // Task Actions, Multi-Sort Engines, and View Filters
  const tasks = useTaskActions({
    parsedData: editor.parsedData,
    setParsedData: editor.setParsedData,
    setJsonText: editor.setJsonText,
    setValidationResult: editor.setValidationResult,
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
        syncStatus={dynamicSync.syncStatus}
        syncMessage={dynamicSync.syncMessage}
        isQuotaShieldActive={dynamicSync.isQuotaShieldActive}
        cloudProvider={dynamicSync.cloudProvider}
        snapshotsCount={vault.snapshots.length}
        setShowVersionHistoryModal={vault.setShowVersionHistoryModal}
        isSidebarCollapsed={sidebar.isSidebarCollapsed}
        setIsSidebarCollapsed={sidebar.setIsSidebarCollapsed}
        activeView={viewport.activeView}
        setActiveView={viewport.setActiveView}
        notesCount={editor.parsedData?.notes?.length || 0}
        activeProjectId={project.activeProjectId}
        customProjects={project.customProjects}
        handleSelectProject={project.handleSelectProject}
        handleOpenAddPlanModal={project.handleOpenAddPlanModal}
        handleOpenLinkCloudModal={cloud.handleOpenLinkCloudModal}
        isSyncingProject={cloud.isSyncingProject}
        handleSyncActiveProject={cloud.handleSyncActiveProject}
        handleForkToLocalPlan={project.handleForkToLocalPlan}
        setShowShareModal={sharing.setShowShareModal}
        setCopiedShareLink={sharing.setCopiedShareLink}
        handleDeleteProject={project.handleDeleteProject}
        setShowPeopleModal={people.setShowPeopleModal}
        effectivePeople={people.effectivePeople}
        fileInputRef={project.fileInputRef}
        handleImportJsonFile={project.handleImportJsonFile}
        selectedThemeId={viewport.selectedThemeId}
        setSelectedThemeId={viewport.setSelectedThemeId}
        setShowPromptModal={setShowPromptModal}
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
            {editor.parsedData ? (
              <>
                {viewport.activeView !== "notes" && (
                  <DateFilterBar
                    dateFilterMode={dateFilter.dateFilterMode}
                    setDateFilterMode={dateFilter.setDateFilterMode}
                    dateFilterValue={dateFilter.dateFilterValue}
                    setDateFilterValue={dateFilter.setDateFilterValue}
                    dateFilterRangeStart={dateFilter.dateFilterRangeStart}
                    setDateFilterRangeStart={dateFilter.setDateFilterRangeStart}
                    dateFilterRangeEnd={dateFilter.dateFilterRangeEnd}
                    setDateFilterRangeEnd={dateFilter.setDateFilterRangeEnd}
                    dateFilterActiveSummary={dateFilter.dateFilterActiveSummary}
                    dateFilterBehavior={dateFilter.dateFilterBehavior}
                    setDateFilterBehavior={dateFilter.setDateFilterBehavior}
                    completedFilterMode={dateFilter.completedFilterMode}
                    setCompletedFilterMode={dateFilter.setCompletedFilterMode}
                    selectedPersonFilter={people.selectedPersonFilter}
                    setSelectedPersonFilter={people.setSelectedPersonFilter}
                    effectivePeople={people.effectivePeople}
                    teams={people.teams}
                    tasks={editor.parsedData.tasks}
                  />
                )}

                {viewport.activeView === "gantt" && ganttDisplayData && (
                  <Jantt
                    data={ganttDisplayData}
                    onCommit={handleGanttCommit}
                    showDateFilterBadge={false}
                    filterTasksByDate={false}
                    selectedDate={dateFilter.dateFilterActiveDate}
                    onDateClick={(clickedDate) => {
                      if (clickedDate === getTodayISODate()) {
                        dateFilter.setDateFilterMode((prev) => (prev === "today" ? "all" : "today"));
                      } else {
                        dateFilter.setDateFilterMode((prev) =>
                          prev === "date" && dateFilter.dateFilterValue === clickedDate ? "all" : "date"
                        );
                        dateFilter.setDateFilterValue(clickedDate);
                      }
                    }}
                    onClearDateFilter={() => {
                      dateFilter.setDateFilterMode("all");
                    }}
                    onDayWidthChange={(dw) => {
                      viewport.setCurrentDayWidth(dw);
                    }}
                    onViewportChange={(vp) => {
                      if (vp.scale) viewport.setCurrentScale(vp.scale);
                      if (vp.dayWidth !== undefined) viewport.setCurrentDayWidth(vp.dayWidth);
                      if (vp.linkRouting) viewport.setLinkRouting(vp.linkRouting);
                      if (vp.rowHeight !== undefined) viewport.setRowHeight(vp.rowHeight);
                      if (vp.rowHeightMode !== undefined) viewport.setRowHeightMode(vp.rowHeightMode);
                      if (vp.showCriticalPath !== undefined) viewport.setShowCriticalPath(vp.showCriticalPath);
                      if (vp.showBaselines !== undefined) viewport.setShowBaselines(vp.showBaselines);
                      if (vp.autoCascade !== undefined) viewport.setAutoCascade(vp.autoCascade);
                      if (vp.selectedDate !== undefined) {
                        if (vp.selectedDate === null) {
                          dateFilter.setDateFilterMode("all");
                        } else if (vp.selectedDate === getTodayISODate()) {
                          dateFilter.setDateFilterMode("today");
                        } else {
                          dateFilter.setDateFilterMode("date");
                          dateFilter.setDateFilterValue(vp.selectedDate);
                        }
                      }
                    }}
                    viewport={{
                      scale: viewport.currentScale,
                      dayWidth: viewport.currentDayWidth,
                      linkRouting: viewport.linkRouting,
                      rowHeight: viewport.rowHeight,
                      rowHeightMode: viewport.rowHeightMode,
                      showCriticalPath: viewport.showCriticalPath,
                      showBaselines: viewport.showBaselines,
                      autoCascade: viewport.autoCascade,
                      selectedDate: dateFilter.dateFilterActiveDate,
                      showDateFilterBadge: false,
                      filterTasksByDate: false
                    }}
                    theme={viewport.activeTheme.vars}
                    themeClassName={viewport.activeTheme.className}
                    onOpenAutoSave={() => autoSave.setShowAutoSaveModal(true)}
                    onImportJson={() => project.fileInputRef.current?.click()}
                    onExportJson={editor.handleDownloadJson}
                    onExportCsv={editor.handleExportCsv}
                  />
                )}

                {viewport.activeView === "kanban" && (
                  <KanbanView
                    parsedData={editor.parsedData}
                    kanbanSortRules={tasks.kanbanSortRules}
                    setKanbanSortRules={tasks.setKanbanSortRules}
                    kanbanMultiSort={tasks.kanbanMultiSort}
                    dateFilterMode={dateFilter.dateFilterMode}
                    dateFilterBehavior={dateFilter.dateFilterBehavior}
                    completedFilterMode={dateFilter.completedFilterMode}
                    isTaskMatchingDateFilter={dateFilter.isTaskMatchingDateFilter}
                    effectivePeople={people.effectivePeople}
                    teams={people.teams}
                    selectedPersonFilter={people.selectedPersonFilter}
                    openTaskDetailSidebar={taskDetail.openTaskDetailSidebar}
                    handleChartCommit={editor.handleChartCommit}
                  />
                )}

                {viewport.activeView === "tasks" && (
                  <TasksView
                    parsedData={editor.parsedData}
                    dateFilterMode={dateFilter.dateFilterMode}
                    dateFilterBehavior={dateFilter.dateFilterBehavior}
                    completedFilterMode={dateFilter.completedFilterMode}
                    isTaskMatchingDateFilter={dateFilter.isTaskMatchingDateFilter}
                    tasksSearchQuery={tasks.tasksSearchQuery}
                    setTasksSearchQuery={tasks.setTasksSearchQuery}
                    tasksViewMode={tasks.tasksViewMode}
                    setTasksViewMode={tasks.setTasksViewMode}
                    selectedPersonFilter={people.selectedPersonFilter}
                    setSelectedPersonFilter={people.setSelectedPersonFilter}
                    teams={people.teams}
                    effectivePeople={people.effectivePeople}
                    handleAddNewTask={tasks.handleAddNewTask}
                    setDateFilterMode={dateFilter.setDateFilterMode}
                    openTaskDetailSidebar={taskDetail.openTaskDetailSidebar}
                    handleChartCommit={editor.handleChartCommit}
                  />
                )}

                {viewport.activeView === "summary" && (
                  <BudgetKpiView
                    parsedData={editor.parsedData}
                    summaryKpiTasks={dateFilter.summaryKpiTasks}
                    summarySortConfig={tasks.summarySortConfig}
                    setSummarySortConfig={tasks.setSummarySortConfig}
                    handleSummarySort={tasks.handleSummarySort}
                    sortedSummaryTasks={tasks.sortedSummaryTasks}
                    isTaskMatchingDateFilter={dateFilter.isTaskMatchingDateFilter}
                    effectivePeople={people.effectivePeople}
                    teams={people.teams}
                    selectedPersonFilter={people.selectedPersonFilter}
                    dateFilterBehavior={dateFilter.dateFilterBehavior}
                    completedFilterMode={dateFilter.completedFilterMode}
                  />
                )}

                {viewport.activeView === "notes" && (
                  <NotesView
                    parsedData={editor.parsedData}
                    handleChartCommit={editor.handleChartCommit}
                    effectivePeople={people.effectivePeople}
                    teams={people.teams}
                  />
                )}
              </>
            ) : (
              <EmptyChartState />
            )}
          </div>
        </section>
      </main>

      {/* Modals & Popups */}
      <PromptModal
        showPromptModal={showPromptModal}
        setShowPromptModal={setShowPromptModal}
      />

      <AddPlanModal
        showAddPlanModal={project.showAddPlanModal}
        setShowAddPlanModal={project.setShowAddPlanModal}
        newPlanTitle={project.newPlanTitle}
        setNewPlanTitle={project.setNewPlanTitle}
        newPlanTemplateType={project.newPlanTemplateType}
        setNewPlanTemplateType={project.setNewPlanTemplateType}
        handleCreateNewPlan={project.handleCreateNewPlan}
      />

      <PeopleTeamsModal
        showPeopleModal={people.showPeopleModal}
        setShowPeopleModal={people.setShowPeopleModal}
        peopleModalTab={people.peopleModalTab}
        setPeopleModalTab={people.setPeopleModalTab}
        effectivePeople={people.effectivePeople}
        people={people.people}
        teams={people.teams}
        parsedData={editor.parsedData}
        newPersonName={people.newPersonName}
        setNewPersonName={people.setNewPersonName}
        newPersonRole={people.newPersonRole}
        setNewPersonRole={people.setNewPersonRole}
        newPersonTeamId={people.newPersonTeamId}
        setNewPersonTeamId={people.setNewPersonTeamId}
        handleAddPerson={people.handleAddPerson}
        handlePersistAllPeople={people.handlePersistAllPeople}
        handlePersistPerson={people.handlePersistPerson}
        handleRemovePerson={people.handleRemovePerson}
        newTeamName={people.newTeamName}
        setNewTeamName={people.setNewTeamName}
        newTeamColor={people.newTeamColor}
        setNewTeamColor={people.setNewTeamColor}
        newTeamDesc={people.newTeamDesc}
        setNewTeamDesc={people.setNewTeamDesc}
        handleAddTeam={people.handleAddTeam}
        handleRemoveTeam={people.handleRemoveTeam}
      />

      <CloudLinkModal
        showLinkCloudModal={cloud.showLinkCloudModal}
        setShowLinkCloudModal={cloud.setShowLinkCloudModal}
        linkCloudUrl={cloud.linkCloudUrl}
        setLinkCloudUrl={cloud.setLinkCloudUrl}
        linkCloudName={cloud.linkCloudName}
        setLinkCloudName={cloud.setLinkCloudName}
        isFetchingCloudPreview={cloud.isFetchingCloudPreview}
        cloudPreviewResult={cloud.cloudPreviewResult}
        cloudPreviewError={cloud.cloudPreviewError}
        setCloudPreviewError={cloud.setCloudPreviewError}
        handleFetchCloudPreview={cloud.handleFetchCloudPreview}
        handleSaveLinkedCloudPlan={cloud.handleSaveLinkedCloudPlan}
      />

      <ShareModal
        showShareModal={sharing.showShareModal}
        setShowShareModal={sharing.setShowShareModal}
        currentProjectName={project.currentProjectName}
        parsedData={editor.parsedData}
        activeView={viewport.activeView}
        activeTheme={viewport.activeTheme}
        activeProject={project.activeProject}
        activeProjectId={project.activeProjectId}
        shareUrl={sharing.shareUrl}
        handleCopyShareLink={sharing.handleCopyShareLink}
        copiedShareLink={sharing.copiedShareLink}
        handleNativeShare={sharing.handleNativeShare}
        setIsSidebarCollapsed={sidebar.setIsSidebarCollapsed}
        handleDownloadJson={editor.handleDownloadJson}
      />

      <AutoSaveModal
        showAutoSaveModal={autoSave.showAutoSaveModal}
        setShowAutoSaveModal={autoSave.setShowAutoSaveModal}
        saveStatus={autoSave.saveStatus}
        lastSavedAt={autoSave.lastSavedAt}
        handleManualSaveNow={autoSave.handleManualSaveNow}
        autoSaveInterval={autoSave.autoSaveInterval}
        setAutoSaveInterval={autoSave.setAutoSaveInterval}
        storageSizeKb={autoSave.storageSizeKb}
        onImportJson={() => project.fileInputRef.current?.click()}
        onExportJson={editor.handleDownloadJson}
        onExportCsv={editor.handleExportCsv}
      />

      <VersionHistoryModal
        showModal={vault.showVersionHistoryModal}
        setShowModal={vault.setShowVersionHistoryModal}
        snapshots={vault.snapshots}
        currentProjectName={project.currentProjectName}
        onRestoreSnapshot={handleRestoreSnapshot}
        onClearHistory={() => vault.clearSnapshots(project.activeProjectId)}
      />

      <Toast
        toastMessage={toast.toastMessage}
        isToastError={toast.isToastError}
      />
    </div>
  );
}

export default App;
