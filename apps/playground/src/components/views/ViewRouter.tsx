import React from "react";
import { Jantt } from "@jantt/react";
import { getTodayISODate, type JanttData } from "@jantt/core";
import type { ActiveView } from "../../types";
import type { useGanttViewport } from "../../hooks/useGanttViewport";
import type { useDateFilter } from "../../hooks/useDateFilter";
import type { useTaskActions } from "../../hooks/useTaskActions";
import type { usePeopleTeams } from "../../hooks/usePeopleTeams";
import type { useTaskDetailSidebar } from "../../hooks/useTaskDetailSidebar";
import type { useEditorState } from "../../hooks/useEditorState";
import type { useAutoSave } from "../../hooks/useAutoSave";
import type { useProjectState } from "../../hooks/useProjectState";
import { KanbanView } from "./KanbanView";
import { TasksView } from "./TasksView";
import { NotesView } from "./NotesView";
import { ViewNavBar, ViewToolbar } from "../layout/ViewToolbar";
import { EmptyChartState } from "../common/EmptyChartState";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";
import { triggerHaptic } from "../../services/platform";
import type { Task } from "@jantt/core";

// Heavy, less-used views load on first use: the canvas renderer and the EVM / schedule-health
// dashboard stay out of the startup bundle. (They are deliberately not re-exported from the
// views barrel, which would pull them back into the main chunk.)
const CanvasView = React.lazy(() => import("./CanvasView").then((m) => ({ default: m.CanvasView })));
const BudgetKpiView = React.lazy(() => import("./BudgetKpiView").then((m) => ({ default: m.BudgetKpiView })));

const viewLoadingFallback = (
  <div className="today-empty-state" role="status" aria-live="polite">
    <p>Loading view...</p>
  </div>
);

export interface ViewRouterProps {
  activeView: ActiveView;
  setActiveView?: (view: ActiveView) => void;
  notesCount?: number;
  parsedData: JanttData | null;
  ganttDisplayData: JanttData | null;
  /**
   * Guarded plan commit (blocks viewers / pending-login editors and records an undo snapshot)
   * for the Gantt, which edits the filtered subset (`ganttDisplayData`) and has it merged back
   * into the full plan.
   */
  handleGanttCommit: (updated: JanttData) => void;
  /**
   * The guarded, authoritative commit for views that always edit the full plan (Kanban, Tasks,
   * Notes). Unlike `handleGanttCommit`, it never merges the result back into a filtered subset,
   * so deletions made there are never undone by an active hide filter. Falls back to
   * `handleGanttCommit` when not provided.
   */
  commitPlan?: (updated: JanttData) => void;
  /** Opens the shell-hosted Monte Carlo dialog; without it the dashboard hosts its own. */
  onOpenMonteCarlo?: () => void;
  viewport: ReturnType<typeof useGanttViewport>;
  dateFilter: ReturnType<typeof useDateFilter>;
  tasks: ReturnType<typeof useTaskActions>;
  people: ReturnType<typeof usePeopleTeams>;
  taskDetail: ReturnType<typeof useTaskDetailSidebar>;
  editor: ReturnType<typeof useEditorState>;
  autoSave: ReturnType<typeof useAutoSave>;
  project: ReturnType<typeof useProjectState>;
  isMobile?: boolean;
  isViewer?: boolean;
  onPromptFork?: () => void;
}

interface ViewErrorBoundaryProps {
  /** Changing the key (e.g. switching views) clears a previous failure. */
  resetKey: string;
  children: React.ReactNode;
}

/** Keeps one failing view (e.g. malformed shared data) from blanking the whole app. */
class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Jantt] View failed to render:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="today-empty-state" role="alert">
        <h3>This view could not be displayed</h3>
        <p>
          Your plan was not changed. Some data may have an unexpected format, or the view could not be loaded (check
          your connection and reload). Try another view, or check the plan in the JSON editor.
          <button
            type="button"
            className="date-filter-reset-btn"
            style={{ marginTop: "12px", display: "inline-flex" }}
            onClick={() => this.setState({ error: null })}
          >
            Try Again
          </button>
        </p>
      </div>
    );
  }
}

export const ViewRouter: React.FC<ViewRouterProps> = ({
  activeView,
  setActiveView,
  notesCount,
  parsedData,
  ganttDisplayData,
  handleGanttCommit,
  commitPlan,
  onOpenMonteCarlo,
  viewport,
  dateFilter,
  tasks,
  people,
  taskDetail,
  editor,
  autoSave,
  project,
  isMobile,
  isViewer = false,
  onPromptFork
}) => {
  const [jumpToTodayCount, setJumpToTodayCount] = React.useState(0);
  const [selectedMobileTaskId, setSelectedMobileTaskId] = React.useState<string | null>(null);
  const [showMobileTaskList, setShowMobileTaskList] = React.useState(false);
  const mobileTapRef = React.useRef<{ id: string; time: number } | null>(null);
  const handleToggleMobileTaskList = React.useCallback(() => {
    triggerHaptic("light");
    setShowMobileTaskList((prev) => !prev);
  }, []);
  const handleMobileTaskOpen = React.useCallback((task: Task) => {
    const now = Date.now();
    const previous = mobileTapRef.current;
    setSelectedMobileTaskId(task.id);
    if (previous?.id === task.id && now - previous.time <= 420) {
      mobileTapRef.current = null;
      triggerHaptic("light");
      taskDetail.openTaskDetailSidebar(task);
      return;
    }
    mobileTapRef.current = { id: task.id, time: now };
  }, [taskDetail.openTaskDetailSidebar]);
  const handleJumpToToday = React.useCallback(() => {
    setJumpToTodayCount((c) => c + 1);
  }, []);
  const ganttScrollRef = React.useRef<{ scrollLeft: number; scrollTop: number } | null>(
    storageService.getItem<{ scrollLeft: number; scrollTop: number }>(STORAGE_KEYS.GANTT_SCROLL)
  );
  const handleSaveGanttScroll = React.useCallback((pos: { scrollLeft: number; scrollTop: number }) => {
    ganttScrollRef.current = pos;
    storageService.setItem(STORAGE_KEYS.GANTT_SCROLL, pos);
  }, []);

  if (!parsedData) {
    return <EmptyChartState />;
  }

  const commitFullPlan = commitPlan ?? handleGanttCommit;

  return (
    <>
      {!isMobile && setActiveView && (
        <ViewNavBar
          activeView={activeView}
          setActiveView={setActiveView}
          notesCount={notesCount}
          viewport={viewport}
          onJumpToToday={handleJumpToToday}
        />
      )}

      {activeView !== "notes" && (
        <ViewToolbar
          isMobile={Boolean(isMobile)}
          activeView={activeView}
          taskCount={parsedData.tasks.length}
          onAddTask={!isViewer ? tasks.handleAddNewTask : undefined}
          dateFilter={dateFilter}
          people={people}
          tasks={parsedData.tasks}
          cpmOptions={{
            defaultGapDays: parsedData.meta?.defaultGapDays,
            targetDate: typeof parsedData.meta?.targetDate === "string" ? parsedData.meta.targetDate : undefined,
            calendar: parsedData.meta?.calendar,
            useWorkingDays: parsedData.meta?.useWorkingDays,
            calendars: parsedData.calendars,
            people: parsedData.people
          }}
          viewport={viewport}
          searchQuery={tasks.tasksSearchQuery}
          onSearchChange={tasks.setTasksSearchQuery}
          onOpenAutoSave={() => autoSave?.setShowAutoSaveModal?.(true)}
          onImportJson={() => project?.fileInputRef?.current?.click()}
          onExportJson={editor?.handleDownloadJson}
          onExportCsv={editor?.handleExportCsv}
          readOnly={isViewer}
          showScaleInline={Boolean(isMobile)}
          onJumpToToday={handleJumpToToday}
          showTaskSidebar={showMobileTaskList}
          onToggleTaskSidebar={isMobile ? handleToggleMobileTaskList : undefined}
        />
      )}

      <ViewErrorBoundary resetKey={activeView}>
        <React.Suspense fallback={viewLoadingFallback}>
          {activeView === "gantt" && ganttDisplayData && (
            <Jantt
              data={ganttDisplayData}
              onCommit={handleGanttCommit}
              readOnly={isViewer}
              showToolbar={false}
              searchQuery={tasks.tasksSearchQuery}
              showDateFilterBadge={false}
              filterTasksByDate={false}
              disableDragOnTouch={Boolean(isMobile)}
              isMobile={isMobile}
              mobileDoubleTapToOpen={Boolean(isMobile)}
              hideLabelColumn={Boolean(isMobile && !showMobileTaskList)}
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
              scrollToTodayTrigger={jumpToTodayCount}
              initialScroll={ganttScrollRef.current}
              onSaveScroll={handleSaveGanttScroll}
              onOpenAutoSave={() => autoSave.setShowAutoSaveModal(true)}
              onImportJson={() => project.fileInputRef.current?.click()}
              onExportJson={editor.handleDownloadJson}
              onExportCsv={editor.handleExportCsv}
            />
          )}

          {activeView === "canvas" && (
            <CanvasView
              parsedData={ganttDisplayData ?? parsedData}
              onTaskClick={isMobile ? handleMobileTaskOpen : taskDetail.openTaskDetailSidebar}
              activeTheme={viewport.activeTheme}
              isViewer={isViewer}
              onOpenScratchPlan={project.handleCreateLocalCopyFromData}
              scrollToTodayTrigger={jumpToTodayCount}
            />
          )}

          {activeView === "kanban" && (
            <KanbanView
              isMobile={Boolean(isMobile)}
              parsedData={parsedData}
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
              openTaskDetailSidebar={isMobile ? handleMobileTaskOpen : taskDetail.openTaskDetailSidebar}
              selectedMobileTaskId={isMobile ? selectedMobileTaskId : null}
              handleChartCommit={commitFullPlan}
              isViewer={isViewer}
              onPromptFork={onPromptFork}
            />
          )}

          {activeView === "tasks" && (
            <TasksView
              isMobile={Boolean(isMobile)}
              parsedData={parsedData}
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
              setCompletedFilterMode={dateFilter.setCompletedFilterMode}
              openTaskDetailSidebar={isMobile ? handleMobileTaskOpen : taskDetail.openTaskDetailSidebar}
              selectedMobileTaskId={isMobile ? selectedMobileTaskId : null}
              handleChartCommit={commitFullPlan}
              isViewer={isViewer}
              onPromptFork={onPromptFork}
            />
          )}

          {activeView === "summary" && (
            <BudgetKpiView
              isMobile={Boolean(isMobile)}
              parsedData={parsedData}
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
              onOpenMonteCarlo={onOpenMonteCarlo}
            />
          )}

          {activeView === "notes" && (
            <NotesView
              parsedData={parsedData}
              handleChartCommit={commitFullPlan}
              effectivePeople={people.effectivePeople}
              teams={people.teams}
              isViewer={isViewer}
              onPromptFork={onPromptFork}
              activeProjectId={project.activeProjectId}
            />
          )}
        </React.Suspense>
      </ViewErrorBoundary>
    </>
  );
};
