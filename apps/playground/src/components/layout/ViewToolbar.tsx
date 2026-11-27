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
  const viewTabs: Array<{ id: ActiveView; label: string; title: string; icon: React.ReactNode; badge?: number }> = [
    { id: "gantt", label: "Gantt", title: "Gantt timeline schedule (1)", icon: <Layers size={14} style={{ color: "#38BDF8" }} /> },
    { id: "canvas", label: "Canvas", title: "High-performance canvas engine for very large plans (2)", icon: <Zap size={14} style={{ color: "#A855F7" }} /> },
    { id: "kanban", label: "Kanban", title: "Kanban task board (3)", icon: <Kanban size={14} style={{ color: "#F59E0B" }} /> },
    { id: "tasks", label: "Tasks", title: "Task checklist and grid (4)", icon: <CheckSquare size={14} style={{ color: "#10B981" }} /> },
    { id: "summary", label: "Health & PM", title: "Project health, schedule buffers, EVM and budget (5)", icon: <Activity size={14} style={{ color: "#F43F5E" }} /> },
    {
      id: "notes",
      label: "Notes",
      title: "Shared project notes, specs and documentation (6)",
      icon: <StickyNote size={14} style={{ color: "#06B6D4" }} />,
      badge: typeof notesCount === "number" && notesCount > 0 ? notesCount : undefined
    }
  ];

  return (
    <div className="view-nav-bar">
      <nav className="view-nav-tabs" aria-label="Views">
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
              title="Scroll timeline directly to the Today line"
            >
              <Crosshair size={12} style={{ color: "#EF4444" }} />
              <span>Today</span>
            </button>
          )}
          {activeView === "gantt" && (
            <div className="toolbar-scale-group" role="group" aria-label="Timeline scale presets">
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
                  title={`Switch timeline to ${s} scale view`}
                >
                  {s}
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
    if (people.selectedPersonFilter === "sort:assignee") return "Sorted: Assignee (A-Z)";
    if (people.selectedPersonFilter.startsWith("team:")) {
      const teamId = people.selectedPersonFilter.slice(5);
      const team = people.teams?.find((t) => t.id === teamId);
      return team ? `Team: ${team.name}` : `Team (${teamId})`;
    }
    const person = people.effectivePeople?.find((p) => p.id === people.selectedPersonFilter);
    return person ? `Person: ${person.name}` : `Person: ${people.selectedPersonFilter}`;
  }, [people.selectedPersonFilter, people.teams, people.effectivePeople]);

  const activeFilterChips = (
    <>
      {isDateActive && (
        <div className="toolbar-filter-chip" title="Active date filter - click to clear">
          <Calendar size={10} style={{ color: "#38BDF8" }} />
          <span>
            {dateFilter.dateFilterActiveSummary?.label
              ? `${dateFilter.dateFilterActiveSummary.label} (${dateFilter.dateFilterActiveSummary.countText})`
              : dateFilter.dateFilterMode === "today"
              ? "Today"
              : dateFilter.dateFilterMode === "week"
              ? "This Week"
              : dateFilter.dateFilterMode === "range"
              ? `${dateFilter.dateFilterRangeStart || "Start"} → ${dateFilter.dateFilterRangeEnd || "End"}`
              : "Date"}
          </span>
          <button
            type="button"
            onClick={() => {
              dateFilter.setDateFilterMode("all");
              dateFilter.setDateFilterRangeStart("");
              dateFilter.setDateFilterRangeEnd("");
            }}
            aria-label="Clear date filter"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {isCriticalPathActive && (
        <div className="toolbar-filter-chip is-amber" title="Critical path highlighting is active - click to toggle off">
          <Zap size={10} style={{ color: "#D97706" }} />
          <span>Critical Path ({criticalCount})</span>
          <button
            type="button"
            onClick={() => viewport?.setShowCriticalPath(false)}
            aria-label="Disable critical path"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {personFilterLabel && (
        <div className="toolbar-filter-chip" title="Active assignee or team filter - click to clear">
          <Users size={10} style={{ color: "#38BDF8" }} />
          <span>{personFilterLabel}</span>
          <button
            type="button"
            onClick={() => people.setSelectedPersonFilter?.("all")}
            aria-label="Remove person filter"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {isCompletedActive && (
        <div className="toolbar-filter-chip" title="Completed tasks display mode - click to reset">
          <CheckCircle2 size={10} style={{ color: dateFilter.completedFilterMode === "filter" ? "#EF4444" : "#F59E0B" }} />
          <span>Completed: {dateFilter.completedFilterMode === "filter" ? "Hidden" : "Dimmed"}</span>
          <button
            type="button"
            onClick={() => dateFilter.setCompletedFilterMode?.("show")}
            aria-label="Reset completed tasks filter"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {isBehaviorActive && (
        <div className="toolbar-filter-chip" title="Non-matching tasks display mode - click to reset">
          <EyeOff size={10} style={{ color: "#818CF8" }} />
          <span>Non-matching: Hidden</span>
          <button
            type="button"
            onClick={() => dateFilter.setDateFilterBehavior("dim")}
            aria-label="Reset non-matching filter"
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
          title="Clear all active filters"
        >
          <RotateCcw size={11} />
          <span>Clear all</span>
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
                    aria-label={showTaskSidebar ? "Split view active: click for timeline only" : "Timeline only: click for split view"}
                    aria-pressed={showTaskSidebar}
                    title={showTaskSidebar ? "Split view active: click for timeline only" : "Timeline only: click for split view"}
                  >
                    {showTaskSidebar ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                  </button>
                )}
                {onJumpToToday && (
                  <button
                    type="button"
                    className="toolbar-today-jump-btn mobile-toolbar-today-btn"
                    onClick={onJumpToToday}
                    title="Jump to today"
                    aria-label="Jump to today"
                  >
                    <Crosshair size={16} style={{ color: "#EF4444" }} aria-hidden="true" />
                    <span className="mobile-today-label">Today</span>
                  </button>
                )}
                {activeView === "gantt" && viewport && (
                  <select className="mobile-scale-picker" aria-label="Timeline scale" value={viewport.currentScale}
                    onChange={event => {
                      viewport.setCurrentDayWidth(undefined);
                      viewport.setCurrentScale(event.target.value as TimeScale);
                    }}>
                    {(["day", "week", "month", "quarter", "year"] as const).map(scale =>
                      <option key={scale} value={scale}>{scale[0].toUpperCase() + scale.slice(1)}</option>)}
                  </select>
                )}
                <div className="mobile-toolbar-actions">
                  <button
                    ref={filterTriggerRef}
                    type="button"
                    className={`mobile-toolbar-icon-btn ${totalActiveFiltersCount ? "is-active" : ""}`}
                    onClick={() => setIsFilterPopoverOpen((open) => !open)}
                    aria-label="Filters"
                    aria-expanded={isFilterPopoverOpen}
                    aria-haspopup="dialog"
                  >
                    <Filter size={16} /><span className="phone-toolbar-label">Filter</span>
                    {totalActiveFiltersCount > 0 && <span className="mobile-toolbar-badge">{totalActiveFiltersCount}</span>}
                  </button>
                  {activeView === "gantt" && viewport && (
                    <button
                      ref={settingsTriggerRef}
                      type="button"
                      className={`mobile-toolbar-icon-btn ${isSettingsPopoverOpen ? "is-active" : ""}`}
                      onClick={() => setIsSettingsPopoverOpen((open) => !open)}
                      aria-label="Chart settings"
                      aria-expanded={isSettingsPopoverOpen}
                      aria-haspopup="dialog"
                    >
                      <SettingsIcon size={16} /><span className="phone-toolbar-label">Settings</span>
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
                      placeholder="Search tasks..."
                      aria-label="Search tasks"
                      value={searchQuery}
                      onChange={(e) => onSearchChange(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="toolbar-search-clear"
                        onClick={() => onSearchChange("")}
                        title="Clear search"
                        aria-label="Clear search"
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
                  aria-label="Filters"
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
                  Project Health ({taskCount} tasks)
                </span>
                <button
                  ref={filterTriggerRef}
                  type="button"
                  className={`toolbar-btn ${totalActiveFiltersCount > 0 ? "is-active" : ""}`}
                  onClick={() => setIsFilterPopoverOpen((open) => !open)}
                  aria-label="Filters"
                  aria-expanded={isFilterPopoverOpen}
                  aria-haspopup="dialog"
                >
                  <Filter size={12} />
                  <span>Filters</span>
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
            title="Add a new task (A)"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>Add Task</span>
          </button>
        )}

        {/* Unified Search Input Box */}
        {onSearchChange && (
          <div className="toolbar-search-box">
            <Search size={12} className="toolbar-search-icon" />
            <input
              type="text"
              className="toolbar-search-input"
              placeholder={`Search ${taskCount} tasks...`}
              aria-label="Search tasks in current view"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="toolbar-search-clear"
                onClick={() => onSearchChange("")}
                title="Clear search"
                aria-label="Clear search"
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
              title="Scroll timeline directly to the Today line"
            >
              <Crosshair size={12} style={{ color: "#EF4444" }} />
              <span>Today</span>
            </button>
          )}
          {activeView === "gantt" && (
            <div className="toolbar-scale-group" role="group" aria-label="Timeline scale presets">
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
                  title={`Switch timeline to ${s} scale view`}
                >
                  {s}
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
            title="Configure task filters (Date scope, Assignee, Critical path, Completed visibility)"
          >
            <Filter size={12} />
            <span>Filters</span>
            {totalActiveFiltersCount > 0 && (
              <span className="toolbar-badge-count">{totalActiveFiltersCount}</span>
            )}
            <ChevronDown size={11} className={`toolbar-chevron ${isFilterPopoverOpen ? "is-open" : ""}`} />
          </button>
          )}

          {/* Grouped Filter Popover Card */}
          {isFilterPopoverOpen && (
            <ToolbarPanel mobile={isMobile} title="Filters" onClose={() => setIsFilterPopoverOpen(false)}>
            <div
              ref={filterPopoverRef}
              className="toolbar-popover-card"
              role={isMobile ? undefined : "dialog"}
              aria-label={isMobile ? undefined : "Filter Settings"}
            >
              <div className="toolbar-popover-header">
                <div className="toolbar-popover-title">
                  <SlidersHorizontal size={13} style={{ color: "#0284C7" }} />
                  <span>Filter Settings</span>
                </div>
                <button
                  type="button"
                  className="toolbar-popover-close"
                  onClick={() => setIsFilterPopoverOpen(false)}
                  aria-label="Close filters"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Group 1: Time Scope / Date Presets */}
              <div className="toolbar-popover-section">
                <div className="toolbar-popover-label">
                  <Calendar size={12} style={{ color: "#38BDF8" }} />
                  <span>Time Scope</span>
                </div>
                <div className="toolbar-segmented-control" role="group" aria-label="Date presets">
                  <Segment active={dateFilter.dateFilterMode === "all"}
                    onClick={() => dateFilter.setDateFilterMode("all")}
                    title="Show all tasks"
                  >
                    All
                  </Segment>
                  <Segment active={dateFilter.dateFilterMode === "today"}
                    onClick={() => dateFilter.setDateFilterMode("today")}
                    title={`Filter tasks active today (${getTodayISODate()})`}
                  >
                    Today
                  </Segment>
                  <Segment active={dateFilter.dateFilterMode === "week"}
                    onClick={() => dateFilter.setDateFilterMode("week")}
                    title="Filter tasks active this week"
                  >
                    This Week
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
                    title="Filter custom date range"
                  >
                    Custom
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
                      title="Range Start Date"
                      aria-label="Range start date"
                    />
                    <span className="toolbar-date-sep" aria-hidden="true">→</span>
                    <input
                      type="date"
                      className="toolbar-date-input"
                      value={dateFilter.dateFilterRangeEnd}
                      onChange={(e) => dateFilter.setDateFilterRangeEnd(e.target.value)}
                      title="Range End Date"
                      aria-label="Range end date"
                    />
                  </div>
                )}
              </div>

              {/* Group 2: Assignee & Team */}
              {people.setSelectedPersonFilter && (
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <Users size={12} style={{ color: "#38BDF8" }} />
                    <span>Assignee &amp; Team</span>
                  </div>
                  <div className="toolbar-select-wrap">
                    <select
                      className="toolbar-select"
                      value={people.selectedPersonFilter || "all"}
                      onChange={(e) => people.setSelectedPersonFilter(e.target.value)}
                      aria-label="Select assignee or team filter"
                    >
                      <option value="all">All People &amp; Teams</option>
                      <option value="sort:assignee">Sort by Assignee (A-Z)</option>
                      {people.teams && people.teams.length > 0 && (
                        <optgroup label="Teams / Squads">
                          {people.teams.map((tm) => (
                            <option key={tm.id} value={`team:${tm.id}`}>
                              Team: {tm.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {people.effectivePeople && people.effectivePeople.length > 0 && (
                        <optgroup label="Team Members">
                          {people.effectivePeople.map((p) => {
                            const count =
                              (assigneeCounts.get(p.name) || 0) + (p.id !== p.name ? assigneeCounts.get(p.id) || 0 : 0);
                            return (
                              <option key={p.id} value={p.id}>
                                {p.name}{count > 0 ? ` (${count} tasks)` : ""}
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
                    <span>Schedule Analysis</span>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={viewport.showCriticalPath}
                    aria-label="Toggle Critical Path"
                    className="toolbar-switch-row"
                    onClick={() => { viewport.setShowCriticalPath((prev: boolean) => !prev); if (isMobile) triggerHaptic("success"); }}
                    title="Toggle Critical Path Highlighting"
                  >
                    <span className="toolbar-switch-info">
                      <span className="toolbar-switch-title">
                        Highlight Critical Path {criticalCount > 0 ? `(${criticalCount} tasks)` : ""}
                      </span>
                      <span className="toolbar-switch-desc">Emphasize dependent tasks determining project finish date</span>
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
                    <span>Completed Tasks</span>
                  </div>
                  <div className="toolbar-segmented-control" role="group" aria-label="Completed tasks display mode">
                    <Segment active={dateFilter.completedFilterMode === "show"}
                      onClick={() => dateFilter.setCompletedFilterMode?.("show")}
                      title="Show completed tasks normally"
                    >
                      <Eye size={11} />
                      <span>Show</span>
                    </Segment>
                    <Segment active={dateFilter.completedFilterMode === "dim"}
                      onClick={() => dateFilter.setCompletedFilterMode?.("dim")}
                      title="Dim completed tasks to emphasize active work"
                    >
                      <EyeOff size={11} style={{ color: "#F59E0B" }} />
                      <span>Dim</span>
                    </Segment>
                    <Segment active={dateFilter.completedFilterMode === "filter"} danger
                      onClick={() => dateFilter.setCompletedFilterMode?.("filter")}
                      title="Completely hide completed tasks from view"
                    >
                      <Filter size={11} style={{ color: "#EF4444" }} />
                      <span>Hide</span>
                    </Segment>
                  </div>
                </div>
              )}

              {/* Group 5: Non-Matching Filtered Tasks */}
              <div className="toolbar-popover-section">
                <div className="toolbar-popover-label">
                  <EyeOff size={12} style={{ color: "#818CF8" }} />
                  <span>Non-Matching Filtered Tasks</span>
                </div>
                <div className="toolbar-segmented-control" role="group" aria-label="Non-matching tasks display mode">
                  <Segment active={dateFilter.dateFilterBehavior === "dim"}
                    onClick={() => dateFilter.setDateFilterBehavior("dim")}
                    title="Dim: keep every task visible in context, fading non-matching ones"
                  >
                    <EyeOff size={11} style={{ color: "#F59E0B" }} />
                    <span>Dim in Context</span>
                  </Segment>
                  <Segment active={dateFilter.dateFilterBehavior === "hide"}
                    onClick={() => dateFilter.setDateFilterBehavior("hide")}
                    title="Hide: strictly display only matching tasks"
                  >
                    <Filter size={11} style={{ color: "#818CF8" }} />
                    <span>Hide</span>
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
                    <span>Reset all filters</span>
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
              title="Chart Settings (Zoom, Row height, Link routing, Auto-cascade)"
            >
              <SettingsIcon size={13} />
              <span>Settings</span>
            </button>
            )}

            {/* Chart Settings Popover Card */}
            {isSettingsPopoverOpen && (
              <ToolbarPanel mobile={isMobile} title="Chart settings" onClose={() => setIsSettingsPopoverOpen(false)}>
              <div
                ref={settingsPopoverRef}
                className="toolbar-popover-card toolbar-settings-card"
                role={isMobile ? undefined : "dialog"}
                aria-label={isMobile ? undefined : "Chart Settings"}
              >
                <div className="toolbar-popover-header">
                  <div className="toolbar-popover-title">
                    <SettingsIcon size={13} style={{ color: "#0284C7" }} />
                    <span>Chart Settings</span>
                  </div>
                  <button
                    type="button"
                    className="toolbar-popover-close"
                    onClick={() => setIsSettingsPopoverOpen(false)}
                    aria-label="Close settings"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Section 1: Timeline Zoom & Row Sizing */}
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <span>Timeline Zoom &amp; Row Height</span>
                  </div>

                  {/* Day Width Slider */}
                  <div className="toolbar-setting-row">
                    <span className="toolbar-setting-label">Day Width</span>
                    <div className="toolbar-slider-wrap">
                      <button
                        type="button"
                        className="toolbar-nudge-btn"
                        onClick={() =>
                          viewport.setCurrentDayWidth(
                            Math.max(DAY_WIDTH_MIN, Math.round(((viewport.currentDayWidth || 26) / 1.25) * 10) / 10)
                          )
                        }
                        title="Zoom out (−)"
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
                        aria-label="Timeline zoom pixels per day"
                      />
                      <button
                        type="button"
                        className="toolbar-nudge-btn"
                        onClick={() =>
                          viewport.setCurrentDayWidth(
                            Math.min(DAY_WIDTH_MAX, Math.round(((viewport.currentDayWidth || 26) * 1.25) * 10) / 10)
                          )
                        }
                        title="Zoom in (+)"
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
                    <span className="toolbar-setting-label">Row Height</span>
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
                        aria-label="Task row height pixels"
                      />
                      <span className="toolbar-slider-readout">
                        {viewport.rowHeightMode === "fit" ? "Fit" : `${viewport.rowHeight}px`}
                      </span>
                    </div>
                  </div>

                  {/* Row Density Presets */}
                  <div className="toolbar-segmented-control" role="group" aria-label="Row density presets">
                    <Segment active={viewport.rowHeightMode === "custom" && viewport.rowHeight === 32}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(32);
                      }}
                      title="Compact task rows (32px)"
                    >
                      Compact
                    </Segment>
                    <Segment active={viewport.rowHeightMode === "custom" && viewport.rowHeight === 46}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(46);
                      }}
                      title="Default task rows (46px)"
                    >
                      Default
                    </Segment>
                    <Segment active={viewport.rowHeightMode === "custom" && viewport.rowHeight === 64}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(64);
                      }}
                      title="Spacious task rows (64px)"
                    >
                      Spacious
                    </Segment>
                    <Segment active={viewport.rowHeightMode === "fit"}
                      onClick={() => viewport.setRowHeightMode("fit")}
                      title="Fit mode: dynamically scale row heights so all tasks fit"
                    >
                      Fit
                    </Segment>
                  </div>
                </div>

                <div className="toolbar-popover-divider" />

                {/* Section 2: Dependencies & Routing */}
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <span>Dependencies &amp; Connectors</span>
                  </div>
                  <div className="toolbar-setting-row">
                    <span className="toolbar-setting-label">Line Routing</span>
                    <div className="toolbar-segmented-control" role="group" aria-label="Connector routing style">
                      <Segment active={viewport.linkRouting === "orthogonal"}
                        onClick={() => viewport.setLinkRouting("orthogonal")}
                      >
                        90° Turn
                      </Segment>
                      <Segment active={viewport.linkRouting === "curved"}
                        onClick={() => viewport.setLinkRouting("curved")}
                      >
                        Curved
                      </Segment>
                      <Segment active={viewport.linkRouting === "direct"}
                        onClick={() => viewport.setLinkRouting("direct")}
                      >
                        Direct
                      </Segment>
                    </div>
                  </div>
                </div>

                <div className="toolbar-popover-divider" />

                {/* Section 3: Scheduling Engine */}
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <span>Scheduling Engine</span>
                  </div>

                  {/* Auto-Cascade Toggle */}
                  <button
                    type="button" role="switch" aria-checked={viewport.autoCascade}
                    aria-label="Toggle Auto-Cascade" disabled={readOnly}
                    className="toolbar-switch-row"
                    onClick={() => {
                      if (!readOnly) viewport.setAutoCascade((prev: boolean) => !prev);
                    }}
                    title="Toggle auto-cascading dependencies"
                  >
                    <span className="toolbar-switch-info">
                      <span className="toolbar-switch-title">Auto-Cascade Tasks</span>
                      <span className="toolbar-switch-desc">Downstream tasks shift automatically when predecessor moves</span>
                    </span>
                    <span className={`toolbar-toggle-switch ${viewport.autoCascade ? "is-active" : ""}`} aria-hidden="true"><span className="toolbar-toggle-thumb" /></span>
                  </button>

                  {/* Baselines Toggle */}
                  <button
                    type="button" role="switch" aria-checked={viewport.showBaselines}
                    aria-label="Toggle Baselines"
                    className="toolbar-switch-row"
                    onClick={() => viewport.setShowBaselines((prev: boolean) => !prev)}
                    title="Toggle baseline comparison bars"
                  >
                    <span className="toolbar-switch-info">
                      <span className="toolbar-switch-title">Show Baselines</span>
                      <span className="toolbar-switch-desc">Display original planned schedule bars beneath active tasks</span>
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
                        <span>Data &amp; Persistence</span>
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
                          <span>Auto-Save &amp; Storage Settings</span>
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
                            <span>Import JSON</span>
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
                            <span>Export JSON</span>
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
                            <span>Export CSV</span>
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
