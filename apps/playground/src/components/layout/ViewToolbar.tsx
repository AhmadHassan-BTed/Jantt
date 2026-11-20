import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Clock,
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
  Download
} from "lucide-react";
import {
  getTodayISODate,
  calculateCriticalPath,
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

export interface ViewToolbarProps {
  activeView: ActiveView;
  taskCount: number;
  onAddTask?: () => void;
  dateFilter: ReturnType<typeof useDateFilter>;
  people: ReturnType<typeof usePeopleTeams>;
  tasks?: Task[];
  viewport?: ReturnType<typeof useGanttViewport>;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenAutoSave?: () => void;
  onImportJson?: () => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
  readOnly?: boolean;
}

export const ViewToolbar: React.FC<ViewToolbarProps> = ({
  activeView,
  taskCount,
  onAddTask,
  dateFilter,
  people,
  tasks = [],
  viewport,
  searchQuery = "",
  onSearchChange,
  onOpenAutoSave,
  onImportJson,
  onExportJson,
  onExportCsv,
  readOnly = false
}) => {
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);

  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  const settingsPopoverRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  // Close filter popover on outside click or Escape
  useEffect(() => {
    if (!isFilterPopoverOpen) return;
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
  }, [isFilterPopoverOpen]);

  // Close settings popover on outside click or Escape
  useEffect(() => {
    if (!isSettingsPopoverOpen) return;
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
  }, [isSettingsPopoverOpen]);

  // Assignee task counts
  const assigneeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t._deleted || !t.assignee) continue;
      counts.set(t.assignee, (counts.get(t.assignee) || 0) + 1);
    }
    return counts;
  }, [tasks]);

  // Critical path task count for Gantt view
  const criticalCount = useMemo(() => {
    if (activeView !== "gantt" || tasks.length === 0) return 0;
    try {
      return calculateCriticalPath(tasks).criticalTaskIds.size;
    } catch {
      return 0;
    }
  }, [activeView, tasks]);

  // Active filter state calculations
  const isPersonActive = Boolean(people.selectedPersonFilter && people.selectedPersonFilter !== "all");
  const isCompletedActive = Boolean(dateFilter.completedFilterMode && dateFilter.completedFilterMode !== "show");
  const isBehaviorActive = dateFilter.dateFilterBehavior === "hide";
  const activeSecondaryFilterCount =
    (isPersonActive ? 1 : 0) + (isCompletedActive ? 1 : 0) + (isBehaviorActive ? 1 : 0);

  const hasAnyActiveFilter =
    dateFilter.dateFilterMode !== "all" ||
    activeSecondaryFilterCount > 0 ||
    Boolean(dateFilter.dateFilterActiveSummary);

  const clearAllFilters = () => {
    dateFilter.setDateFilterMode("all");
    dateFilter.setDateFilterRangeStart("");
    dateFilter.setDateFilterRangeEnd("");
    dateFilter.setCompletedFilterMode?.("show");
    dateFilter.setDateFilterBehavior("dim");
    if (people.selectedPersonFilter !== "all") {
      people.setSelectedPersonFilter?.("all");
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

  return (
    <div className="view-toolbar">
      {/* ─────────────────────────────────────────────────────────────────────────────
          ZONE 1: LEFT (Create, Scope & Time Filter Presets)
          ───────────────────────────────────────────────────────────────────────────── */}
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

        {/* Task Count Badge */}
        <span className="toolbar-task-badge" title="Total project tasks">
          {taskCount} tasks
        </span>

        <span className="toolbar-divider" aria-hidden="true" />

        {/* Date Filter Presets */}
        <div className="toolbar-date-tabs" role="group" aria-label="Date presets">
          <button
            type="button"
            className={`toolbar-tab-btn ${dateFilter.dateFilterMode === "all" ? "is-active" : ""}`}
            aria-pressed={dateFilter.dateFilterMode === "all"}
            onClick={() => dateFilter.setDateFilterMode("all")}
            title="Show all project tasks without date restrictions"
          >
            All Tasks
          </button>
          <button
            type="button"
            className={`toolbar-tab-btn ${dateFilter.dateFilterMode === "today" ? "is-active" : ""}`}
            aria-pressed={dateFilter.dateFilterMode === "today"}
            onClick={() => dateFilter.setDateFilterMode("today")}
            title={`Filter tasks active today (${getTodayISODate()})`}
          >
            <Clock size={11} style={{ color: "#38BDF8" }} />
            Today
          </button>
          <button
            type="button"
            className={`toolbar-tab-btn ${dateFilter.dateFilterMode === "week" ? "is-active" : ""}`}
            aria-pressed={dateFilter.dateFilterMode === "week"}
            onClick={() => dateFilter.setDateFilterMode("week")}
            title="Filter tasks active this week (Monday to Sunday)"
          >
            <Calendar size={11} style={{ color: "#A78BFA" }} />
            This Week
          </button>
          <button
            type="button"
            className={`toolbar-tab-btn ${dateFilter.dateFilterMode === "range" || dateFilter.dateFilterMode === "date" ? "is-active" : ""}`}
            aria-pressed={dateFilter.dateFilterMode === "range" || dateFilter.dateFilterMode === "date"}
            onClick={() => {
              if (dateFilter.dateFilterMode === "range") {
                dateFilter.setDateFilterMode("all");
              } else {
                dateFilter.setDateFilterMode("range");
                if (!dateFilter.dateFilterRangeStart) dateFilter.setDateFilterRangeStart(getTodayISODate());
              }
            }}
            title="Filter tasks overlapping a custom date range"
          >
            <Calendar size={11} style={{ color: "#10B981" }} />
            Date Range
          </button>
        </div>

        {/* Conditional Date Range Pickers */}
        {dateFilter.dateFilterMode === "range" && (
          <div className="toolbar-date-range-inputs">
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

        {/* Conditional Single Date Picker */}
        {dateFilter.dateFilterMode === "date" && (
          <input
            type="date"
            className="toolbar-date-input"
            value={dateFilter.dateFilterValue}
            onChange={(e) => dateFilter.setDateFilterValue(e.target.value)}
            title="Select target date"
            aria-label="Filter date"
          />
        )}

        {/* Active Date Summary Badge */}
        {dateFilter.dateFilterActiveSummary && (
          <div className="toolbar-active-date-chip">
            <span>Showing: <strong>{dateFilter.dateFilterActiveSummary.label}</strong> ({dateFilter.dateFilterActiveSummary.countText})</span>
            <button
              type="button"
              onClick={() => {
                dateFilter.setDateFilterMode("all");
                dateFilter.setDateFilterRangeStart("");
                dateFilter.setDateFilterRangeEnd("");
              }}
              title="Clear date filter"
              aria-label="Clear date filter"
            >
              <X size={10} />
            </button>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          ZONE 2: CENTER (Timeline Time Scale - Centered on Gantt View)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="view-toolbar-center">
        {activeView === "gantt" && viewport && (
          <div className="toolbar-scale-group" role="group" aria-label="Timeline scale presets">
            {(["day", "week", "month", "quarter", "year"] as TimeScale[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`toolbar-scale-btn ${viewport.currentScale === s ? "is-active" : ""}`}
                aria-pressed={viewport.currentScale === s}
                onClick={() => viewport.setCurrentScale(s)}
                title={`Switch timeline to ${s} scale view`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          ZONE 3: RIGHT (Analysis, Grouped Filters, Search & Settings)
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="view-toolbar-right">
        {/* Critical Path Toggle (Gantt View) */}
        {activeView === "gantt" && viewport && (
          <button
            type="button"
            className={`toolbar-critical-btn ${viewport.showCriticalPath ? "is-active" : ""}`}
            onClick={() => viewport.setShowCriticalPath((prev: boolean) => !prev)}
            aria-pressed={viewport.showCriticalPath}
            title="Highlight the critical chain of dependent tasks controlling project duration"
          >
            <Zap size={12} />
            <span>Critical Path ({criticalCount})</span>
          </button>
        )}

        {/* Dynamic Contextual Filter Chips */}
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

        {/* Clear All Filters Button */}
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

        {/* Filters Popover Trigger */}
        <div className="toolbar-popover-container">
          <button
            ref={filterTriggerRef}
            type="button"
            className={`toolbar-btn ${activeSecondaryFilterCount > 0 ? "is-active" : ""}`}
            onClick={() => setIsFilterPopoverOpen((prev) => !prev)}
            aria-expanded={isFilterPopoverOpen}
            aria-haspopup="dialog"
            title="Configure task filters (Assignee, Completed visibility, Non-matching behavior)"
          >
            <Filter size={12} />
            <span>Filters</span>
            {activeSecondaryFilterCount > 0 && (
              <span className="toolbar-badge-count">{activeSecondaryFilterCount}</span>
            )}
            <ChevronDown size={11} className={`toolbar-chevron ${isFilterPopoverOpen ? "is-open" : ""}`} />
          </button>

          {/* Grouped Filter Popover Card */}
          {isFilterPopoverOpen && (
            <div
              ref={filterPopoverRef}
              className="toolbar-popover-card"
              role="dialog"
              aria-label="Filter Settings"
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
                  <X size={12} />
                </button>
              </div>

              {/* Group 1: People & Teams */}
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

              {/* Group 2: Completed Tasks */}
              {dateFilter.setCompletedFilterMode && (
                <div className="toolbar-popover-section">
                  <div className="toolbar-popover-label">
                    <CheckCircle2 size={12} style={{ color: "#10B981" }} />
                    <span>Completed Tasks</span>
                  </div>
                  <div className="toolbar-segmented-control" role="group" aria-label="Completed tasks display mode">
                    <button
                      type="button"
                      className={`toolbar-segmented-btn ${dateFilter.completedFilterMode === "show" ? "is-active" : ""}`}
                      onClick={() => dateFilter.setCompletedFilterMode?.("show")}
                      title="Show completed tasks normally"
                    >
                      <Eye size={11} />
                      <span>Show</span>
                    </button>
                    <button
                      type="button"
                      className={`toolbar-segmented-btn ${dateFilter.completedFilterMode === "dim" ? "is-active" : ""}`}
                      onClick={() => dateFilter.setCompletedFilterMode?.("dim")}
                      title="Dim completed tasks to emphasize active work"
                    >
                      <EyeOff size={11} style={{ color: "#F59E0B" }} />
                      <span>Dim</span>
                    </button>
                    <button
                      type="button"
                      className={`toolbar-segmented-btn ${dateFilter.completedFilterMode === "filter" ? "is-active is-danger" : ""}`}
                      onClick={() => dateFilter.setCompletedFilterMode?.("filter")}
                      title="Completely hide completed tasks from view"
                    >
                      <Filter size={11} style={{ color: "#EF4444" }} />
                      <span>Hide</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Group 3: Non-Matching Filtered Tasks */}
              <div className="toolbar-popover-section">
                <div className="toolbar-popover-label">
                  <EyeOff size={12} style={{ color: "#818CF8" }} />
                  <span>Non-Matching Filtered Tasks</span>
                </div>
                <div className="toolbar-segmented-control" role="group" aria-label="Non-matching tasks display mode">
                  <button
                    type="button"
                    className={`toolbar-segmented-btn ${dateFilter.dateFilterBehavior === "dim" ? "is-active" : ""}`}
                    onClick={() => dateFilter.setDateFilterBehavior("dim")}
                    title="Dim: keep every task visible in context, fading non-matching ones"
                  >
                    <EyeOff size={11} style={{ color: "#F59E0B" }} />
                    <span>Dim in Context</span>
                  </button>
                  <button
                    type="button"
                    className={`toolbar-segmented-btn ${dateFilter.dateFilterBehavior === "hide" ? "is-active" : ""}`}
                    onClick={() => dateFilter.setDateFilterBehavior("hide")}
                    title="Hide: strictly display only matching tasks"
                  >
                    <Filter size={11} style={{ color: "#818CF8" }} />
                    <span>Hide</span>
                  </button>
                </div>
              </div>

              {/* Popover Footer: Quick Reset */}
              {activeSecondaryFilterCount > 0 && (
                <div className="toolbar-popover-footer">
                  <button
                    type="button"
                    className="toolbar-popover-reset-btn"
                    onClick={() => {
                      dateFilter.setCompletedFilterMode?.("show");
                      dateFilter.setDateFilterBehavior("dim");
                      people.setSelectedPersonFilter?.("all");
                    }}
                  >
                    <RotateCcw size={11} />
                    <span>Reset filter settings</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search Input Box */}
        {onSearchChange && (
          <div className="toolbar-search-box">
            <Search size={12} className="toolbar-search-icon" />
            <input
              type="text"
              className="toolbar-search-input"
              placeholder="Search tasks..."
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

        {/* Settings Popover (Gantt View) */}
        {activeView === "gantt" && viewport && (
          <div className="toolbar-popover-container">
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

            {/* Chart Settings Popover Card */}
            {isSettingsPopoverOpen && (
              <div
                ref={settingsPopoverRef}
                className="toolbar-popover-card toolbar-settings-card"
                role="dialog"
                aria-label="Chart Settings"
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
                    <button
                      type="button"
                      className={`toolbar-segmented-btn ${viewport.rowHeightMode === "custom" && viewport.rowHeight === 32 ? "is-active" : ""}`}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(32);
                      }}
                      title="Compact task rows (32px)"
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      className={`toolbar-segmented-btn ${viewport.rowHeightMode === "custom" && viewport.rowHeight === 46 ? "is-active" : ""}`}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(46);
                      }}
                      title="Default task rows (46px)"
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      className={`toolbar-segmented-btn ${viewport.rowHeightMode === "custom" && viewport.rowHeight === 64 ? "is-active" : ""}`}
                      onClick={() => {
                        viewport.setRowHeightMode("custom");
                        viewport.setRowHeight(64);
                      }}
                      title="Spacious task rows (64px)"
                    >
                      Spacious
                    </button>
                    <button
                      type="button"
                      className={`toolbar-segmented-btn ${viewport.rowHeightMode === "fit" ? "is-active" : ""}`}
                      onClick={() => viewport.setRowHeightMode("fit")}
                      title="Fit mode: dynamically scale row heights so all tasks fit"
                    >
                      Fit
                    </button>
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
                      <button
                        type="button"
                        className={`toolbar-segmented-btn ${viewport.linkRouting === "orthogonal" ? "is-active" : ""}`}
                        onClick={() => viewport.setLinkRouting("orthogonal")}
                      >
                        90° Turn
                      </button>
                      <button
                        type="button"
                        className={`toolbar-segmented-btn ${viewport.linkRouting === "curved" ? "is-active" : ""}`}
                        onClick={() => viewport.setLinkRouting("curved")}
                      >
                        Curved
                      </button>
                      <button
                        type="button"
                        className={`toolbar-segmented-btn ${viewport.linkRouting === "direct" ? "is-active" : ""}`}
                        onClick={() => viewport.setLinkRouting("direct")}
                      >
                        Direct
                      </button>
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
                  <div
                    className="toolbar-switch-row"
                    onClick={() => {
                      if (!readOnly) viewport.setAutoCascade((prev: boolean) => !prev);
                    }}
                    title="Toggle auto-cascading dependencies"
                  >
                    <div className="toolbar-switch-info">
                      <span className="toolbar-switch-title">Auto-Cascade Tasks</span>
                      <span className="toolbar-switch-desc">Downstream tasks shift automatically when predecessor moves</span>
                    </div>
                    <button
                      type="button"
                      className={`toolbar-toggle-switch ${viewport.autoCascade ? "is-active" : ""}`}
                      role="switch"
                      aria-checked={viewport.autoCascade}
                      aria-label="Toggle Auto-Cascade"
                    >
                      <span className="toolbar-toggle-thumb" />
                    </button>
                  </div>

                  {/* Baselines Toggle */}
                  <div
                    className="toolbar-switch-row"
                    onClick={() => viewport.setShowBaselines((prev: boolean) => !prev)}
                    title="Toggle baseline comparison bars"
                  >
                    <div className="toolbar-switch-info">
                      <span className="toolbar-switch-title">Show Baselines</span>
                      <span className="toolbar-switch-desc">Display original planned schedule bars beneath active tasks</span>
                    </div>
                    <button
                      type="button"
                      className={`toolbar-toggle-switch ${viewport.showBaselines ? "is-active" : ""}`}
                      role="switch"
                      aria-checked={viewport.showBaselines}
                      aria-label="Toggle Baselines"
                    >
                      <span className="toolbar-toggle-thumb" />
                    </button>
                  </div>
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** Backwards-compatible export for any legacy imports */
export const DateFilterBar = ViewToolbar;
