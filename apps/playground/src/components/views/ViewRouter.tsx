import React from "react";
import { Jantt } from "@jantt/react";
import { getTodayISODate, type JanttData } from "@jantt/core";
import type { ActiveView } from "../../types";
import { KanbanView } from "./KanbanView";
import { TasksView } from "./TasksView";
import { BudgetKpiView } from "./BudgetKpiView";
import { NotesView } from "./NotesView";
import { DateFilterBar } from "../layout/DateFilterBar";
import { EmptyChartState } from "../common/EmptyChartState";

export interface ViewRouterProps {
  activeView: ActiveView;
  parsedData: JanttData | null;
  ganttDisplayData: JanttData | null;
  handleGanttCommit: (updated: JanttData) => void;
  viewport: any;
  dateFilter: any;
  tasks: any;
  people: any;
  taskDetail: any;
  editor: any;
  autoSave: any;
  project: any;
}

export const ViewRouter: React.FC<ViewRouterProps> = ({
  activeView,
  parsedData,
  ganttDisplayData,
  handleGanttCommit,
  viewport,
  dateFilter,
  tasks,
  people,
  taskDetail,
  editor,
  autoSave,
  project
}) => {
  if (!parsedData) {
    return <EmptyChartState />;
  }

  return (
    <>
      {activeView !== "notes" && (
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
          tasks={parsedData.tasks}
        />
      )}

      {activeView === "gantt" && ganttDisplayData && (
        <Jantt
          data={ganttDisplayData}
          onCommit={handleGanttCommit}
          onTaskClick={(task) => taskDetail.openTaskDetailSidebar(task)}
          onTaskAdd={() => tasks.handleAddNewTask()}
          showDateFilterBadge={false}
          filterTasksByDate={false}
          selectedDate={dateFilter.dateFilterActiveDate}
          onDateClick={(clickedDate) => {
            if (clickedDate === getTodayISODate()) {
              dateFilter.setDateFilterMode((prev: string) => (prev === "today" ? "all" : "today"));
            } else {
              dateFilter.setDateFilterMode((prev: string) =>
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

      {activeView === "kanban" && (
        <KanbanView
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
          openTaskDetailSidebar={taskDetail.openTaskDetailSidebar}
          handleChartCommit={editor.handleChartCommit}
        />
      )}

      {activeView === "tasks" && (
        <TasksView
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
          openTaskDetailSidebar={taskDetail.openTaskDetailSidebar}
          handleChartCommit={editor.handleChartCommit}
        />
      )}

      {activeView === "summary" && (
        <BudgetKpiView
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
        />
      )}

      {activeView === "notes" && (
        <NotesView
          parsedData={parsedData}
          handleChartCommit={editor.handleChartCommit}
          effectivePeople={people.effectivePeople}
          teams={people.teams}
        />
      )}
    </>
  );
};
