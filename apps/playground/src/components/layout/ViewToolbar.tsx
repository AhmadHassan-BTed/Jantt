import { triggerHaptic } from "../../services/platform";
import { Modal } from "../modals/ModalHost";
import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Calendar,
  Filter,
  X,
  Eye,
  EyeOff,
  Users,
  CheckCircle2,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  Zap,
  Search,
  Settings as SettingsIcon,
  FileJson,
  Upload,
  Download,
  Layers,
  Kanban,
  CheckSquare,
  Activity,
  StickyNote,
  Crosshair,
  PanelLeftOpen,
  PanelLeftClose
} from "lucide-react";
import {
  getTodayISODate,
  calculateCriticalPath,
  type CriticalPathOptions,
  type TimeScale,
  DAY_WIDTH_MIN,
  DAY_WIDTH_MAX,
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  type Task
} from "@jantt/core";
import type { ActiveView } from "../../types";
import type { useGanttViewport } from "../../hooks/useGanttViewport";
import type { useDateFilter } from "../../hooks/useDateFilter";
import type { usePeopleTeams } from "../../hooks/usePeopleTeams";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n";

/** Locale keys for the timeline scale presets, shared by the desktop and mobile controls. */
const SCALE_LABEL_KEYS: Record<TimeScale, MessageKey> = {
  day: "scale.day",
  week: "scale.week",
  month: "scale.month",
  quarter: "scale.quarter",
  year: "scale.year"
};

export interface ViewNavBarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  notesCount?: number;
  viewport?: ReturnType<typeof useGanttViewport>;
  onJumpToToday?: () => void;
}

/**
 * Tier 2 View Bar: switches the active visualization lens (Gantt, Canvas, Kanban, Tasks,
 * Health & PM, Notes) and hosts view-level scale controls for the timeline.
 * Reflects the control hierarchy: Global / Project (Navbar) -> View (ViewNavBar) -> Task / Data (ViewToolbar).
 */
export const ViewNavBar: React.FC<ViewNavBarProps> = ({
  activeView,
  setActiveView,
  notesCount,
  viewport,
  onJumpToToday
}) => {
  const { t } = useI18n();
  const viewTabs: Array<{ id: ActiveView; label: string; title: string; icon: React.ReactNode; badge?: number }> = [
    { id: "gantt", label: t("view.gantt"), title: t("view.ganttTitle"), icon: <Layers size={14} style={{ color: "#38BDF8" }} /> },
    { id: "canvas", label: t("view.canvas"), title: t("view.canvasTitle"), icon: <Zap size={14} style={{ color: "#A855F7" }} /> },
    { id: "kanban", label: t("view.kanban"), title: t("view.kanbanTitle"), icon: <Kanban size={14} style={{ color: "#F59E0B" }} /> },
    { id: "tasks", label: t("view.tasks"), title: t("view.tasksTitle"), icon: <CheckSquare size={14} style={{ color: "#10B981" }} /> },
    { id: "summary", label: t("view.summary"), title: t("view.summaryTitle"), icon: <Activity size={14} style={{ color: "#F43F5E" }} /> },
    {
      id: "notes",
      label: t("view.notes"),
      title: t("view.notesTitle"),
      icon: <StickyNote size={14} style={{ color: "#06B6D4" }} />,
      badge: typeof notesCount === "number" && notesCount > 0 ? notesCount : undefined
    }
  ];

  return (
    <div className="view-nav-bar">
      <nav className="view-nav-tabs" aria-label={t("view.views")}>
        <div className="jantt-scale-group">
          {viewTabs.map((tab) => {
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`jantt-scale-btn ${isActive ? "is-active" : ""}`}
                onClick={() => setActiveView(tab.id)}
                title={tab.title}
                aria-label={tab.badge ? `${tab.label} (${tab.badge})` : tab.label}
                aria-pressed={isActive}
              >
                {tab.icon}
                <span className="nav-tab-label">{tab.label}</span>
                {tab.badge !== undefined && <span className="nav-tab-badge">{tab.badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {(activeView === "gantt" || activeView === "canvas") && viewport && (
        <div className="view-nav-scale">
          {onJumpToToday && (
            <button
              type="button"
              className="toolbar-today-jump-btn"
              onClick={onJumpToToday}
              title={t("view.jumpToTodayTitle")}
            >
              <Crosshair size={12} style={{ color: "#EF4444" }} />
              <span>{t("common.today")}</span>
            </button>
          )}
          {activeView === "gantt" && (
            <div className="toolbar-scale-group" role="group" aria-label={t("view.scalePresets")}>
              {(["day", "week", "month", "quarter", "year"] as TimeScale[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`toolbar-scale-btn ${viewport.currentScale === s ? "is-active" : ""}`}
                  aria-pressed={viewport.currentScale === s}
                  onClick={() => {
                    viewport.setCurrentDayWidth(undefined);
                    viewport.setCurrentScale(s);
                  }}
                  title={t("view.switchScale", { scale: t(SCALE_LABEL_KEYS[s]) })}
                >
                  {t(SCALE_LABEL_KEYS[s])}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface ViewToolbarProps {
  isMobile?: boolean;
  activeView: ActiveView;
  taskCount: number;
  onAddTask?: () => void;
  dateFilter: ReturnType<typeof useDateFilter>;
  people: ReturnType<typeof usePeopleTeams>;
  tasks?: Task[];
  cpmOptions?: CriticalPathOptions;
  viewport?: ReturnType<typeof useGanttViewport>;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenAutoSave?: () => void;
  onImportJson?: () => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
  readOnly?: boolean;
  /** Shows the timeline scale control inline in this bar (used on mobile where ViewNavBar is hidden). */
  showScaleInline?: boolean;
  onJumpToToday?: () => void;
  /** Mobile Gantt Task & Category sidebar visibility state (collapsed by default on mobile). */
  showTaskSidebar?: boolean;
  onToggleTaskSidebar?: () => void;
}

function Segment({ active, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  danger?: boolean;
}) {
  return <button {...props} type="button" aria-pressed={active}
    className={`toolbar-segmented-btn${active ? " is-active" : ""}${active && danger ? " is-danger" : ""}`} />;
}

function ToolbarPanel({ mobile, title, onClose, children }: {
  mobile: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return mobile ? <Modal ariaLabel={title} onClose={onClose}><div className="toolbar-sheet-content">{children}</div></Modal> : <>{children}</>;
}

export const ViewToolbar: React.FC<ViewToolbarProps> = ({
  isMobile = false,
  activeView,
  taskCount,
  onAddTask,
  dateFilter,
  people,
  tasks = [],
  cpmOptions,
  viewport,
  searchQuery = "",
  onSearchChange,
  onOpenAutoSave,
  onImportJson,
  onExportJson,
  onExportCsv,
  readOnly = false,
  showScaleInline = false,
  onJumpToToday,
  showTaskSidebar = false,
  onToggleTaskSidebar
}) => {
  const { t } = useI18n();
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);

  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  const settingsPopoverRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  // Close filter popover on outside click or Escape
  useEffect(() => {
    if (!isFilterPopoverOpen || isMobile) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(e.target as Node) &&
        filterTriggerRef.current &&
        !filterTriggerRef.current.contains(e.target as Node)
      ) {
        setIsFilterPopoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFilterPopoverOpen(false);
        filterTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFilterPopoverOpen, isMobile]);

  // Close settings popover on outside click or Escape
  useEffect(() => {
    if (!isSettingsPopoverOpen || isMobile) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        settingsPopoverRef.current &&
        !settingsPopoverRef.current.contains(e.target as Node) &&
        settingsTriggerRef.current &&
        !settingsTriggerRef.current.contains(e.target as Node)
      ) {
        setIsSettingsPopoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSettingsPopoverOpen(false);
        settingsTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsPopoverOpen, isMobile]);

  // Assignee task counts
  const assigneeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t._deleted || !t.assignee) continue;
      counts.set(t.assignee, (counts.get(t.assignee) || 0) + 1);
    }
    return counts;
  }, [tasks]);

  // Critical path task count for Gantt view (honors plan gap, deadline, and working calendars)
  const criticalCount = useMemo(() => {
    if (activeView !== "gantt" || tasks.length === 0) return 0;
    try {
      return calculateCriticalPath(tasks, cpmOptions).criticalTaskIds.size;
    } catch {
      return 0;
    }
  }, [
    activeView,
    tasks,
    cpmOptions?.defaultGapDays,
    cpmOptions?.targetDate,
    cpmOptions?.calendar,
    cpmOptions?.useWorkingDays,
    cpmOptions?.calendars,
    cpmOptions?.people
  ]);

  // Active filter state calculations
  const isDateActive = dateFilter.dateFilterMode !== "all" || Boolean(dateFilter.dateFilterActiveSummary);
  const isPersonActive = Boolean(people.selectedPersonFilter && people.selectedPersonFilter !== "all");
  const isCompletedActive = Boolean(dateFilter.completedFilterMode && dateFilter.completedFilterMode !== "show");
  const isBehaviorActive = dateFilter.dateFilterBehavior === "hide";
  const isCriticalPathActive = Boolean(activeView === "gantt" && viewport?.showCriticalPath);

  const totalActiveFiltersCount =
    (isDateActive ? 1 : 0) +
    (isPersonActive ? 1 : 0) +
    (isCompletedActive ? 1 : 0) +
    (isBehaviorActive ? 1 : 0) +
    (isCriticalPathActive ? 1 : 0);

  const hasAnyActiveFilter = totalActiveFiltersCount > 0;

  const clearAllFilters = () => {
    dateFilter.setDateFilterMode("all");
    dateFilter.setDateFilterRangeStart("");
    dateFilter.setDateFilterRangeEnd("");
    dateFilter.setCompletedFilterMode?.("show");
    dateFilter.setDateFilterBehavior("dim");
    if (people.selectedPersonFilter !== "all") {
      people.setSelectedPersonFilter?.("all");
    }
    if (viewport?.showCriticalPath) {
      viewport.setShowCriticalPath(false);
    }
  };

  // Human-readable person filter label
  const personFilterLabel = useMemo(() => {
    if (!people.selectedPersonFilter || people.selectedPersonFilter === "all") return null;
    if (people.selectedPersonFilter === "sort:assignee") return t("toolbar.sortedAssignee");
    if (people.selectedPersonFilter.startsWith("team:")) {
      const teamId = people.selectedPersonFilter.slice(5);
      const team = people.teams?.find((item) => item.id === teamId);
      return team ? t("toolbar.teamLabel", { name: team.name }) : t("toolbar.teamIdLabel", { id: teamId });
    }
    const person = people.effectivePeople?.find((p) => p.id === people.selectedPersonFilter);
    return t("toolbar.personLabel", { name: person ? person.name : people.selectedPersonFilter });
  }, [people.selectedPersonFilter, people.teams, people.effectivePeople, t]);

  const activeFilterChips = (
    <>
      {isDateActive && (
        <div className="toolbar-filter-chip" title={t("toolbar.activeDateFilterTitle")}>
          <Calendar size={10} style={{ color: "#38BDF8" }} />
          <span>
            {dateFilter.dateFilterActiveSummary?.label
              ? `${dateFilter.dateFilterActiveSummary.label} (${dateFilter.dateFilterActiveSummary.countText})`
              : dateFilter.dateFilterMode === "today"
              ? t("common.today")
              : dateFilter.dateFilterMode === "week"
              ? t("common.thisWeek")
              : dateFilter.dateFilterMode === "range"
              ? `${dateFilter.dateFilterRangeStart || t("toolbar.startPlaceholder")} → ${dateFilter.dateFilterRangeEnd || t("toolbar.endPlaceholder")}`
              : t("toolbar.date")}
          </span>
          <button
            type="button"
            onClick={() => {
              dateFilter.setDateFilterMode("all");
              dateFilter.setDateFilterRangeStart("");
              dateFilter.setDateFilterRangeEnd("");
            }}
            aria-label={t("toolbar.clearDateFilter")}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {isCriticalPathActive && (
        <div className="toolbar-filter-chip is-amber" title={t("toolbar.criticalPathActiveTitle")}>
          <Zap size={10} style={{ color: "#D97706" }} />
          <span>{t("toolbar.criticalPath", { count: criticalCount })}</span>
          <button
            type="button"
            onClick={() => viewport?.setShowCriticalPath(false)}
            aria-label={t("toolbar.disableCriticalPath")}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {personFilterLabel && (
        <div className="toolbar-filter-chip" title={t("toolbar.personFilterTitle")}>
          <Users size={10} style={{ color: "#38BDF8" }} />
          <span>{personFilterLabel}</span>
          <button
            type="button"
            onClick={() => people.setSelectedPersonFilter?.("all")}
            aria-label={t("toolbar.removePersonFilter")}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {isCompletedActive && (
        <div className="toolbar-filter-chip" title={t("toolbar.completedFilterTitle")}>
          <CheckCircle2 size={10} style={{ color: dateFilter.completedFilterMode === "filter" ? "#EF4444" : "#F59E0B" }} />
          <span>{t("toolbar.completedChip", {
            mode: dateFilter.completedFilterMode === "filter" ? t("toolbar.completedHidden") : t("toolbar.completedDimmed")
          })}</span>
          <button
            type="button"
            onClick={() => dateFilter.setCompletedFilterMode?.("show")}
            aria-label={t("toolbar.resetCompleted")}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {isBehaviorActive && (
        <div className="toolbar-filter-chip" title={t("toolbar.nonMatchingTitle")}>
          <EyeOff size={10} style={{ color: "#818CF8" }} />
          <span>{t("toolbar.nonMatchingHidden")}</span>
          <button
            type="button"
            onClick={() => dateFilter.setDateFilterBehavior("dim")}
            aria-label={t("toolbar.resetNonMatching")}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {hasAnyActiveFilter && (
        <button
          type="button"
          className="toolbar-clear-all-btn"
          onClick={clearAllFilters}
          title={t("toolbar.clearAllTitle")}
        >
          <RotateCcw size={11} />
          <span>{t("toolbar.clearAll")}</span>
        </button>
      )}
    </>
  );

  return (
    <div className={isMobile ? "view-toolbar is-mobile-toolbar" : "view-toolbar"}>
      {isMobile && (
        <>
          <div className="mobile-toolbar-row">
            {(activeView === "gantt" || activeView === "canvas") && (
              <>
                {activeView === "gantt" && onToggleTaskSidebar && (
                  <button
                    type="button"
                    className={`mobile-toolbar-icon-btn mobile-toolbar-layout-toggle ${showTaskSidebar ? "is-active" : ""}`}
                    onClick={onToggleTaskSidebar}
                    aria-label={showTaskSidebar ? t("toolbar.splitViewAria") : t("toolbar.timelineOnlyAria")}
                    aria-pressed={showTaskSidebar}
                    title={showTaskSidebar ? t("toolbar.splitViewAria") : t("toolbar.timelineOnlyAria")}
                  >
                    {showTaskSidebar ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                  </button>
                )}
                {onJumpToToday && (
                  <button
                    type="button"
                    className="toolbar-today-jump-btn mobile-toolbar-today-btn"
                    onClick={onJumpToToday}
                    title={t("toolbar.jumpToToday")}
                    aria-label={t("toolbar.jumpToToday")}
                  >
                    <Crosshair size={16} aria-hidden="true" />
                    <span className="mobile-today-label">{t("common.today")}</span>
                  </button>
                )}
                {activeView === "gantt" && viewport && (
                  <select className="mobile-scale-picker" aria-label={t("toolbar.timelineScale")} value={viewport.currentScale}
                    onChange={event => {
                      viewport.setCurrentDayWidth(undefined);
                      viewport.setCurrentScale(event.target.value as TimeScale);
                    }}>
                    {(["day", "week", "month", "quarter", "year"] as const).map(scale =>
                      <option key={scale} value={scale}>{t(SCALE_LABEL_KEYS[scale])}</option>)}
                  </select>
                )}
                <div className="mobile-toolbar-actions">
                  <button
                    ref={filterTriggerRef}
                    type="button"
                    className={`mobile-toolbar-icon-btn ${totalActiveFiltersCount ? "is-active" : ""}`}
                    onClick={() => setIsFilterPopoverOpen((open) => !open)}
                    aria-label={t("toolbar.filters")}
                    aria-expanded={isFilterPopoverOpen}
                    aria-haspopup="dialog"
                  >
                    <Filter size={16} /><span className="phone-toolbar-label">{t("toolbar.filter")}</span>
                    {totalActiveFiltersCount > 0 && <span className="mobile-toolbar-badge">{totalActiveFiltersCount}</span>}
                  </button>
                  {activeView === "gantt" && viewport && (
                    <button
                      ref={settingsTriggerRef}
                      type="button"
                      className={`mobile-toolbar-icon-btn ${isSettingsPopoverOpen ? "is-active" : ""}`}
                      onClick={() => setIsSettingsPopoverOpen((open) => !open)}
                      aria-label={t("toolbar.chartSettings")}
                      aria-expanded={isSettingsPopoverOpen}
                      aria-haspopup="dialog"
                    >
                      <SettingsIcon size={16} /><span className="phone-toolbar-label">{t("toolbar.settings")}</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {(activeView === "kanban" || activeView === "tasks") && (
              <>
                {onSearchChange && (
                  <div className="toolbar-search-box mobile-toolbar-search-wrap">
                    <Search size={12} className="toolbar-search-icon" />
                    <input
                      type="text"
                      className="toolbar-search-input"
                      placeholder={t("toolbar.searchTasks")}
                      aria-label={t("toolbar.searchAriaShort")}
                      value={searchQuery}
                      onChange={(e) => onSearchChange(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="toolbar-search-clear"
                        onClick={() => onSearchChange("")}
                        title={t("toolbar.clearSearch")}
                        aria-label={t("toolbar.clearSearch")}
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                )}
                <button
                  ref={filterTriggerRef}
                  type="button"
                  className={`mobile-toolbar-icon-btn ${totalActiveFiltersCount ? "is-active" : ""}`}
                  onClick={() => setIsFilterPopoverOpen((open) => !open)}
                  aria-label={t("toolbar.filters")}
                  aria-expanded={isFilterPopoverOpen}
                  aria-haspopup="dialog"
                >
                  <Filter size={15} />
                  {totalActiveFiltersCount > 0 && <span className="mobile-toolbar-badge">{totalActiveFiltersCount}</span>}
                </button>
              </>
            )}

            {activeView === "summary" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--jantt-text-muted)" }}>
                  {t("view.projectHealth", { count: taskCount })}
                </span>
                <button
                  ref={filterTriggerRef}
                  type="button"
                  className={`toolbar-btn ${totalActiveFiltersCount > 0 ? "is-active" : ""}`}
                  onClick={() => setIsFilterPopoverOpen((open) => !open)}
                  aria-label={t("toolbar.filters")}
                  aria-expanded={isFilterPopoverOpen}
                  aria-haspopup="dialog"
                >
                  <Filter size={12} />
                  <span>{t("toolbar.filters")}</span>
                  {totalActiveFiltersCount > 0 && <span className="toolbar-badge-count">{totalActiveFiltersCount}</span>}
                </button>
              </div>
            )}
          </div>

          {hasAnyActiveFilter && <div className="mobile-toolbar-chips-row">{activeFilterChips}</div>}
        </>
      )}

      {/* ZONE 1: LEFT (Desktop Create, Search & Conditional Dynamic Filter Chips) */}
      {!isMobile && (
      <div className="view-toolbar-left">
        {/* Primary Add Task Button */}
        {onAddTask && !readOnly && (
          <button
            type="button"
            className="toolbar-add-task-btn"
            onClick={onAddTask}
            title={t("toolbar.addTaskTitle")}
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>{t("toolbar.addTask")}</span>
          </button>
        )}

        {/* Unified Search Input Box */}
        {onSearchChange && (
          <div className="toolbar-search-box">
            <Search size={12} className="toolbar-search-icon" />
            <input
              type="text"
              className="toolbar-search-input"
              placeholder={t("toolbar.searchCount", { count: taskCount })}
              aria-label={t("toolbar.searchAria")}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="toolbar-search-clear"
                onClick={() => onSearchChange("")}
                title={t("toolbar.clearSearch")}
                aria-label={t("toolbar.clearSearch")}
              >
                <X size={10} />
              </button>
            )}
          </div>
        )}

        {activeFilterChips}
      </div>
      )}

      {/* ZONE 2: CENTER (Inline scale fallback when non-mobile compact) */}
      {!isMobile && showScaleInline && (activeView === "gantt" || activeView === "canvas") && viewport && (
        <div className="view-toolbar-center">
          {onJumpToToday && (
            <button
              type="button"
              className="toolbar-today-jump-btn"
              onClick={onJumpToToday}
              title={t("view.jumpToTodayTitle")}
            >
              <Crosshair size={12} style={{ color: "#EF4444" }} />
              <span>{t("common.today")}</span>
            </button>
          )}
          {activeView === "gantt" && (
            <div className="toolbar-scale-group" role="group" aria-label={t("view.scalePresets")}>
              {(["day", "week", "month", "quarter", "year"] as TimeScale[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`toolbar-scale-btn ${viewport.currentScale === s ? "is-active" : ""}`}
                  aria-pressed={viewport.currentScale === s}
                  onClick={() => {
                    viewport.setCurrentDayWidth(undefined);
                    viewport.setCurrentScale(s);
                  }}
                  title={t("view.switchScale", { scale: t(SCALE_LABEL_KEYS[s]) })}
                >
                  {t(SCALE_LABEL_KEYS[s])}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          ZONE 3: RIGHT (Grouped Filters & Viewport Settings)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="view-toolbar-right">
        <div className="toolbar-action-cluster">
        {/* Filters Popover Trigger (desktop only; mobile trigger sits in .mobile-toolbar-row) */}
        <div className="toolbar-popover-container">
          {!isMobile && (
          <button
            ref={filterTriggerRef}
            type="button"
            className={`toolbar-btn ${totalActiveFiltersCount > 0 ? "is-active" : ""}`}
            onClick={() => setIsFilterPopoverOpen((prev) => !prev)}
            aria-expanded={isFilterPopoverOpen}
            aria-haspopup="dialog"
            title={t("toolbar.filtersConfigureTitle")}
          >
            <Filter size={12} />
            <span>{t("toolbar.filters")}</span>
            {totalActiveFiltersCount > 0 && (
              <span className="toolbar-badge-count">{totalActiveFiltersCount}</span>
            )}
            <ChevronDown size={11} className={`toolbar-chevron ${isFilterPopoverOpen ? "is-open" : ""}`} />
          </button>
          )}

          {/* Grouped Filter Popover Card */}
          {isFilterPopoverOpen && (
            <ToolbarPanel mobile={isMobile} title={t("toolbar.filters")} onClose={() => setIsFilterPopoverOpen(false)}>
            <div
              ref={filterPopoverRef}
              className="toolbar-popover-card"
              role={isMobile ? undefined : "dialog"}
              aria-label={isMobile ? undefined : t("toolbar.filterSettingsAria")}
            >
              <div className="toolbar-popover-header">
                <div className="toolbar-popover-title">
                  <SlidersHorizontal size={13} style={{ color: "#0284C7" }} />
                  <span>{t("toolbar.filterSettings")}</span>
                </div>
                <button
                  type="button"
                  className="toolbar-popover-close"
                  onClick={() => setIsFilterPopoverOpen(false)}
                  aria-label={t("toolbar.closeFilters")}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Group 1: Time Scope / Date Presets */}
              <div className="toolbar-popover-section">
                <div className="toolbar-popover-label">
                  <Calendar size={12} style={{ color: "#38BDF8" }} />
                  <span>{t("toolbar.timeScope")}</span>
                </div>
                <div className="toolbar-segmented-control" role="group" aria-label={t("toolbar.datePresets")}>
                  <Segment active={dateFilter.dateFilterMode === "all"}
                    onClick={() => dateFilter.setDateFilterMode("all")}
                    title={t("toolbar.allTasksTitle")}
                  >
                    {t("common.all")}
                  </Segment>
                  <Segment active={dateFilter.dateFilterMode === "today"}
                    onClick={() => dateFilter.setDateFilterMode("today")}
                    title={t("toolbar.todayFilterTitle", { date: getTodayISODate() })}
                  >
                    {t("common.today")}
                  </Segment>
                  <Segment active={dateFilter.dateFilterMode === "week"}
                    onClick={() => dateFilter.setDateFilterMode("week")}
                    title={t("toolbar.thisWeekTitle")}
                  >
                    {t("common.thisWeek")}
                  </Segment>
                  <Segment active={dateFilter.dateFilterMode === "range" || dateFilter.dateFilterMode === "date"}
                    onClick={() => {
                      if (dateFilter.dateFilterMode === "range") {
                        dateFilter.setDateFilterMode("all");
                      } else {
                        dateFilter.setDateFilterMode("range");
                        if (!dateFilter.dateFilterRangeStart) dateFilter.setDateFilterRangeStart(getTodayISODate());
                      }
                    }}
                    title={t("toolbar.customRangeTitle")}
                  >
                    {t("common.custom")}
                  </Segment>
                </div>

                {/* Conditional Date Range Inputs inside Popover */}
                {dateFilter.dateFilterMode === "range" && (
                  <div className="toolbar-popover-date-row" style={{ marginTop: "6px" }}>
                    <input
                      type="date"
                      className="toolbar-date-input"
                      value={dateFilter.dateFilterRangeStart}
                      onChange={(e) => dateFilter.setDateFilterRangeStart(e.target.value)}
                      title={t("toolbar.rangeStartTitle")}
                      aria-label={t("toolbar.rangeStart")}
                    />
                    <span className="toolbar-date-sep" aria-hidden="true">→</span>
                    <input
                      type="date"
                      className="toolbar-date-input"
                      value={dateFilter.dateFilterRangeEnd}
                      onChange={(e) => dateFilter.setDateFilterRangeEnd(e.target.value)}
                      title={t("toolbar.rangeEndTitle")}
                      aria-label={t("toolbar.rangeEnd")}
                    />
                  </div>
                )}
              </div>

              {/* Group 2: Assignee & Team */}
              {people.setSelectedPersonFilter && (
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <Users size={12} style={{ color: "#38BDF8" }} />
                    <span>{t("toolbar.assigneeTeam")}</span>
                  </div>
                  <div className="toolbar-select-wrap">
                    <select
                      className="toolbar-select"
                      value={people.selectedPersonFilter || "all"}
                      onChange={(e) => people.setSelectedPersonFilter(e.target.value)}
                      aria-label={t("toolbar.assigneeTeamAria")}
                    >
                      <option value="all">{t("toolbar.allPeopleTeams")}</option>
                      <option value="sort:assignee">{t("toolbar.sortByAssignee")}</option>
                      {people.teams && people.teams.length > 0 && (
                        <optgroup label={t("toolbar.teamsSquads")}>
                          {people.teams.map((tm) => (
                            <option key={tm.id} value={`team:${tm.id}`}>
                              {t("toolbar.teamOption", { name: tm.name })}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {people.effectivePeople && people.effectivePeople.length > 0 && (
                        <optgroup label={t("toolbar.teamMembers")}>
                          {people.effectivePeople.map((p) => {
                            const count =
                              (assigneeCounts.get(p.name) || 0) + (p.id !== p.name ? assigneeCounts.get(p.id) || 0 : 0);
                            return (
                              <option key={p.id} value={p.id}>
                                {p.name}{count > 0 ? ` (${t("toolbar.taskCount", { count })})` : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              )}

              {/* Group 3: Schedule Analysis (Critical Path) */}
              {activeView === "gantt" && viewport && (
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <Zap size={12} style={{ color: "#F59E0B" }} />
                    <span>{t("toolbar.scheduleAnalysis")}</span>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={viewport.showCriticalPath}
                    aria-label={t("toolbar.toggleCriticalPath")}
                    className="toolbar-switch-row"
                    onClick={() => { viewport.setShowCriticalPath((prev: boolean) => !prev); if (isMobile) triggerHaptic("success"); }}
                    title={t("toolbar.criticalPathTitle")}
                  >
                    <span className="toolbar-switch-info">
                      <span className="toolbar-switch-title">
                        {t("toolbar.highlightCriticalPath", {
                          count: criticalCount > 0 ? t("toolbar.highlightCriticalPathCount", { count: criticalCount }) : ""
                        })}
                      </span>
                      <span className="toolbar-switch-desc">{t("toolbar.criticalPathDesc")}</span>
                    </span>
                    <span className={`toolbar-toggle-switch ${viewport.showCriticalPath ? "is-active" : ""}`} aria-hidden="true"><span className="toolbar-toggle-thumb" /></span>
                  </button>
                </div>
              )}

              {/* Group 4: Completed Tasks */}
              {dateFilter.setCompletedFilterMode && (
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <CheckCircle2 size={12} style={{ color: "#10B981" }} />
                    <span>{t("toolbar.completedTasks")}</span>
                  </div>
                  <div className="toolbar-segmented-control" role="group" aria-label={t("toolbar.completedModeAria")}>
                    <Segment active={dateFilter.completedFilterMode === "show"}
                      onClick={() => dateFilter.setCompletedFilterMode?.("show")}
                      title={t("toolbar.completedShowTitle")}
                    >
                      <Eye size={11} />
                      <span>{t("common.show")}</span>
                    </Segment>
                    <Segment active={dateFilter.completedFilterMode === "dim"}
                      onClick={() => dateFilter.setCompletedFilterMode?.("dim")}
                      title={t("toolbar.completedDimTitle")}
                    >
                      <EyeOff size={11} style={{ color: "#F59E0B" }} />
                      <span>{t("common.dim")}</span>
                    </Segment>
                    <Segment active={dateFilter.completedFilterMode === "filter"} danger
                      onClick={() => dateFilter.setCompletedFilterMode?.("filter")}
                      title={t("toolbar.completedHideTitle")}
                    >
                      <Filter size={11} style={{ color: "#EF4444" }} />
                      <span>{t("common.hide")}</span>
                    </Segment>
                  </div>
                </div>
              )}

              {/* Group 5: Non-Matching Filtered Tasks */}
              <div className="toolbar-popover-section">
                <div className="toolbar-popover-label">
                  <EyeOff size={12} style={{ color: "#818CF8" }} />
                  <span>{t("toolbar.nonMatchingTasks")}</span>
                </div>
                <div className="toolbar-segmented-control" role="group" aria-label={t("toolbar.nonMatchingAria")}>
                  <Segment active={dateFilter.dateFilterBehavior === "dim"}
                    onClick={() => dateFilter.setDateFilterBehavior("dim")}
                    title={t("toolbar.dimInContextTitle")}
                  >
                    <EyeOff size={11} style={{ color: "#F59E0B" }} />
                    <span>{t("toolbar.dimInContext")}</span>
                  </Segment>
                  <Segment active={dateFilter.dateFilterBehavior === "hide"}
                    onClick={() => dateFilter.setDateFilterBehavior("hide")}
                    title={t("toolbar.hideTitle")}
                  >
                    <Filter size={11} style={{ color: "#818CF8" }} />
                    <span>{t("common.hide")}</span>
                  </Segment>
                </div>
              </div>

              {/* Popover Footer: Quick Reset */}
              {totalActiveFiltersCount > 0 && (
                <div className="toolbar-popover-footer">
                  <button
                    type="button"
                    className="toolbar-popover-reset-btn"
                    onClick={clearAllFilters}
                  >
                    <RotateCcw size={11} />
                    <span>{t("toolbar.resetAllFilters")}</span>
                  </button>
                </div>
              )}
            </div>
            </ToolbarPanel>
          )}
        </div>

        {/* Settings Popover (Gantt View) */}
        {activeView === "gantt" && viewport && (
          <div className="toolbar-popover-container">
            {!isMobile && (
            <button
              ref={settingsTriggerRef}
              type="button"
              className={`toolbar-btn ${isSettingsPopoverOpen ? "is-active" : ""}`}
              onClick={() => setIsSettingsPopoverOpen((prev) => !prev)}
              aria-expanded={isSettingsPopoverOpen}
              aria-haspopup="dialog"
              title={t("toolbar.settingsTitle")}
            >
              <SettingsIcon size={13} />
              <span>{t("toolbar.settings")}</span>
            </button>
            )}

            {/* Chart Settings Popover Card */}
            {isSettingsPopoverOpen && (
              <ToolbarPanel mobile={isMobile} title={t("toolbar.chartSettings")} onClose={() => setIsSettingsPopoverOpen(false)}>
              <div
                ref={settingsPopoverRef}
                className="toolbar-popover-card toolbar-settings-card"
                role={isMobile ? undefined : "dialog"}
                aria-label={isMobile ? undefined : t("toolbar.chartSettingsAria")}
              >
                <div className="toolbar-popover-header">
                  <div className="toolbar-popover-title">
                    <SettingsIcon size={13} style={{ color: "#0284C7" }} />
                    <span>{t("toolbar.chartSettingsAria")}</span>
                  </div>
                  <button
                    type="button"
                    className="toolbar-popover-close"
                    onClick={() => setIsSettingsPopoverOpen(false)}
                    aria-label={t("toolbar.closeSettings")}
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Section 1: Timeline Zoom & Row Sizing */}
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <span>{t("toolbar.timelineZoomRow")}</span>
                  </div>

                  {/* Day Width Slider */}
                  <div className="toolbar-setting-row">
                    <span className="toolbar-setting-label">{t("toolbar.dayWidth")}</span>
                    <div className="toolbar-slider-wrap">
                      <button
                        type="button"
                        className="toolbar-nudge-btn"
                        onClick={() =>
                          viewport.setCurrentDayWidth(
                            Math.max(DAY_WIDTH_MIN, Math.round(((viewport.currentDayWidth || 26) / 1.25) * 10) / 10)
                          )
                        }
                        title={t("toolbar.zoomOut")}
                      >
                        −
                      </button>
                      <input
                        type="range"
                        className="toolbar-range-slider"
                        min={DAY_WIDTH_MIN}
                        max={DAY_WIDTH_MAX}
                        step={0.1}
                        value={viewport.currentDayWidth || 26}
                        onChange={(e) => viewport.setCurrentDayWidth(parseFloat(e.target.value))}
                        aria-label={t("toolbar.zoomAria")}
                      />
                      <button
                        type="button"
                        className="toolbar-nudge-btn"
                        onClick={() =>
                          viewport.setCurrentDayWidth(
                            Math.min(DAY_WIDTH_MAX, Math.round(((viewport.currentDayWidth || 26) * 1.25) * 10) / 10)
                          )
                        }
                        title={t("toolbar.zoomIn")}
                      >
                        +
                      </button>
                      <span className="toolbar-slider-readout">
                        {Math.round(viewport.currentDayWidth || 26)}px
                      </span>
                    </div>
                  </div>

                  {/* Row Height Slider */}
                  <div className="toolbar-setting-row">
                    <span className="toolbar-setting-label">{t("toolbar.rowHeight")}</span>
                    <div className="toolbar-slider-wrap">
                      <input
                        type="range"
                        className="toolbar-range-slider"
                        min={MIN_ROW_HEIGHT}
                        max={MAX_ROW_HEIGHT}
                        step={2}
                        value={viewport.rowHeight}
                        disabled={viewport.rowHeightMode === "fit"}
                        onChange={(e) => viewport.setRowHeight(parseInt(e.target.value, 10))}
                        aria-label={t("toolbar.rowHeightAria")}
                      />
                      <span className="toolbar-slider-readout">
                        {viewport.rowHeightMode === "fit" ? "Fit" : `${viewport.rowHeight}px`}
                      </span>
                    </div>
                  </div>

                  {/* Row Density Presets */}
                  <div className="toolbar-segmented-control" role="group" aria-label={t("toolbar.rowDensity")}>
                    <Segment active={viewport.rowHeightMode === "custom" && viewport.rowHeight === 32}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(32);
                      }}
                      title={t("toolbar.compactTitle")}
                    >
                      {t("toolbar.compact")}
                    </Segment>
                    <Segment active={viewport.rowHeightMode === "custom" && viewport.rowHeight === 46}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(46);
                      }}
                      title={t("toolbar.defaultTitle")}
                    >
                      {t("toolbar.default")}
                    </Segment>
                    <Segment active={viewport.rowHeightMode === "custom" && viewport.rowHeight === 64}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(64);
                      }}
                      title={t("toolbar.spaciousTitle")}
                    >
                      {t("toolbar.spacious")}
                    </Segment>
                    <Segment active={viewport.rowHeightMode === "fit"}
                      onClick={() => viewport.setRowHeightMode("fit")}
                      title={t("toolbar.fitTitle")}
                    >
                      {t("toolbar.fit")}
                    </Segment>
                  </div>
                </div>

                <div className="toolbar-popover-divider" />

                {/* Section 2: Dependencies & Routing */}
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <span>{t("toolbar.dependencies")}</span>
                  </div>
                  <div className="toolbar-setting-row">
                    <span className="toolbar-setting-label">{t("toolbar.lineRouting")}</span>
                    <div className="toolbar-segmented-control" role="group" aria-label={t("toolbar.routingAria")}>
                      <Segment active={viewport.linkRouting === "orthogonal"}
                        onClick={() => viewport.setLinkRouting("orthogonal")}
                      >
                        {t("toolbar.orthogonal")}
                      </Segment>
                      <Segment active={viewport.linkRouting === "curved"}
                        onClick={() => viewport.setLinkRouting("curved")}
                      >
                        {t("toolbar.curved")}
                      </Segment>
                      <Segment active={viewport.linkRouting === "direct"}
                        onClick={() => viewport.setLinkRouting("direct")}
                      >
                        {t("toolbar.direct")}
                      </Segment>
                    </div>
                  </div>
                </div>

                <div className="toolbar-popover-divider" />

                {/* Section 3: Scheduling Engine */}
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <span>{t("toolbar.schedulingEngine")}</span>
                  </div>

                  {/* Auto-Cascade Toggle */}
                  <button
                    type="button" role="switch" aria-checked={viewport.autoCascade}
                    aria-label={t("toolbar.toggleAutoCascade")} disabled={readOnly}
                    className="toolbar-switch-row"
                    onClick={() => {
                      if (!readOnly) viewport.setAutoCascade((prev: boolean) => !prev);
                    }}
                    title={t("toolbar.autoCascadeTitle")}
                  >
                    <span className="toolbar-switch-info">
                      <span className="toolbar-switch-title">{t("toolbar.autoCascade")}</span>
                      <span className="toolbar-switch-desc">{t("toolbar.autoCascadeDesc")}</span>
                    </span>
                    <span className={`toolbar-toggle-switch ${viewport.autoCascade ? "is-active" : ""}`} aria-hidden="true"><span className="toolbar-toggle-thumb" /></span>
                  </button>

                  {/* Baselines Toggle */}
                  <button
                    type="button" role="switch" aria-checked={viewport.showBaselines}
                    aria-label={t("toolbar.toggleBaselines")}
                    className="toolbar-switch-row"
                    onClick={() => viewport.setShowBaselines((prev: boolean) => !prev)}
                    title={t("toolbar.baselinesTitle")}
                  >
                    <span className="toolbar-switch-info">
                      <span className="toolbar-switch-title">{t("toolbar.showBaselines")}</span>
                      <span className="toolbar-switch-desc">{t("toolbar.showBaselinesDesc")}</span>
                    </span>
                    <span className={`toolbar-toggle-switch ${viewport.showBaselines ? "is-active" : ""}`} aria-hidden="true"><span className="toolbar-toggle-thumb" /></span>
                  </button>
                </div>

                {/* Section 4: Data & Persistence */}
                {(onOpenAutoSave || onImportJson || onExportJson || onExportCsv) && (
                  <>
                    <div className="toolbar-popover-divider" />
                    <div className="toolbar-popover-section">
                      <div className="toolbar-popover-label">
                        <span>{t("toolbar.dataPersistence")}</span>
                      </div>
                      {onOpenAutoSave && (
                        <button
                          type="button"
                          className="toolbar-action-full-btn"
                          onClick={() => {
                            setIsSettingsPopoverOpen(false);
                            onOpenAutoSave();
                          }}
                        >
                          <FileJson size={12} />
                          <span>{t("toolbar.autoSaveSettings")}</span>
                        </button>
                      )}
                      <div className="toolbar-action-grid">
                        {onImportJson && (
                          <button
                            type="button"
                            className="toolbar-action-grid-btn"
                            onClick={() => {
                              setIsSettingsPopoverOpen(false);
                              onImportJson();
                            }}
                          >
                            <Upload size={12} />
                            <span>{t("toolbar.importJson")}</span>
                          </button>
                        )}
                        {onExportJson && (
                          <button
                            type="button"
                            className="toolbar-action-grid-btn"
                            onClick={() => {
                              setIsSettingsPopoverOpen(false);
                              onExportJson();
                            }}
                          >
                            <Download size={12} />
                            <span>{t("toolbar.exportJson")}</span>
                          </button>
                        )}
                        {onExportCsv && (
                          <button
                            type="button"
                            className="toolbar-action-grid-btn"
                            onClick={() => {
                              setIsSettingsPopoverOpen(false);
                              onExportCsv();
                            }}
                          >
                            <Download size={12} />
                            <span>{t("toolbar.exportCsv")}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              </ToolbarPanel>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

/** Backwards-compatible export for any legacy imports */
export const DateFilterBar = ViewToolbar;
