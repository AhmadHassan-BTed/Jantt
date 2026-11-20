import React, { useState, useRef, useEffect, useMemo } from "react";
import { Clock, Calendar, Filter, X, Eye, EyeOff, Users, CheckCircle2, SlidersHorizontal, RotateCcw, ChevronDown } from "lucide-react";
import { getTodayISODate, type Task, type Team } from "@jantt/core";
import type { DateFilterMode, CompletedFilterMode, EffectivePerson } from "../../types";

interface DateFilterBarProps {
  dateFilterMode: DateFilterMode;
  setDateFilterMode: (mode: DateFilterMode | ((prev: DateFilterMode) => DateFilterMode)) => void;
  dateFilterValue: string;
  setDateFilterValue: (val: string) => void;
  dateFilterRangeStart: string;
  setDateFilterRangeStart: (val: string) => void;
  dateFilterRangeEnd: string;
  setDateFilterRangeEnd: (val: string) => void;
  dateFilterActiveSummary: { label: string; countText: string } | null;
  dateFilterBehavior: "dim" | "hide";
  setDateFilterBehavior: (b: "dim" | "hide") => void;
  completedFilterMode?: CompletedFilterMode;
  setCompletedFilterMode?: (m: CompletedFilterMode) => void;
  selectedPersonFilter?: string;
  setSelectedPersonFilter?: (filter: string) => void;
  effectivePeople?: EffectivePerson[];
  teams?: Team[];
  tasks?: Task[];
}

export const DateFilterBar: React.FC<DateFilterBarProps> = ({
  dateFilterMode,
  setDateFilterMode,
  dateFilterValue,
  setDateFilterValue,
  dateFilterRangeStart,
  setDateFilterRangeStart,
  dateFilterRangeEnd,
  setDateFilterRangeEnd,
  dateFilterActiveSummary,
  dateFilterBehavior,
  setDateFilterBehavior,
  completedFilterMode = "show",
  setCompletedFilterMode,
  selectedPersonFilter = "all",
  setSelectedPersonFilter,
  effectivePeople = [],
  teams = [],
  tasks = []
}) => {
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click or Escape key
  useEffect(() => {
    if (!isFilterPopoverOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsFilterPopoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFilterPopoverOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFilterPopoverOpen]);

  // One pass over tasks for all assignee counts (soft-deleted tasks are not counted)
  const assigneeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t._deleted || !t.assignee) continue;
      counts.set(t.assignee, (counts.get(t.assignee) || 0) + 1);
    }
    return counts;
  }, [tasks]);

  // Count active non-default secondary filters
  const isPersonActive = Boolean(selectedPersonFilter && selectedPersonFilter !== "all");
  const isCompletedActive = Boolean(completedFilterMode && completedFilterMode !== "show");
  const isBehaviorActive = dateFilterBehavior === "hide";
  const activeSecondaryFilterCount =
    (isPersonActive ? 1 : 0) + (isCompletedActive ? 1 : 0) + (isBehaviorActive ? 1 : 0);

  const hasAnyActiveFilter =
    dateFilterMode !== "all" ||
    activeSecondaryFilterCount > 0 ||
    Boolean(dateFilterActiveSummary);

  const clearAllFilters = () => {
    setDateFilterMode("all");
    setDateFilterRangeStart("");
    setDateFilterRangeEnd("");
    setCompletedFilterMode?.("show");
    setDateFilterBehavior("dim");
    if (selectedPersonFilter !== "all") {
      setSelectedPersonFilter?.("all");
    }
  };

  // Find human-readable label for selected person/team
  const personFilterLabel = useMemo(() => {
    if (!selectedPersonFilter || selectedPersonFilter === "all") return null;
    if (selectedPersonFilter === "sort:assignee") return "Sorted: Assignee (A-Z)";
    if (selectedPersonFilter.startsWith("team:")) {
      const teamId = selectedPersonFilter.slice(5);
      const team = teams.find((t) => t.id === teamId);
      return team ? `Team: ${team.name}` : `Team (${teamId})`;
    }
    const person = effectivePeople.find((p) => p.id === selectedPersonFilter);
    return person ? `Person: ${person.name}` : `Person: ${selectedPersonFilter}`;
  }, [selectedPersonFilter, teams, effectivePeople]);

  return (
    <div className="date-filter-bar">
      {/* Left Zone: Date Presets & Conditional Range Pickers */}
      <div className="date-filter-left-zone">
        <div className="date-filter-tabs" role="group" aria-label="Date presets">
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "all" ? "is-active" : ""}`}
            aria-pressed={dateFilterMode === "all"}
            onClick={() => setDateFilterMode("all")}
            title="Show all project tasks without date restrictions"
          >
            All Tasks
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "today" ? "is-active" : ""}`}
            aria-pressed={dateFilterMode === "today"}
            onClick={() => setDateFilterMode("today")}
            title={`Filter tasks active today (${getTodayISODate()})`}
          >
            <Clock size={11} style={{ color: "#38BDF8" }} />
            Today
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "week" ? "is-active" : ""}`}
            aria-pressed={dateFilterMode === "week"}
            onClick={() => setDateFilterMode("week")}
            title="Filter tasks active this week (Monday to Sunday)"
          >
            <Calendar size={11} style={{ color: "#A78BFA" }} />
            This Week
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "range" || dateFilterMode === "date" ? "is-active" : ""}`}
            aria-pressed={dateFilterMode === "range" || dateFilterMode === "date"}
            onClick={() => {
              if (dateFilterMode === "range") {
                setDateFilterMode("all");
              } else {
                setDateFilterMode("range");
                if (!dateFilterRangeStart) setDateFilterRangeStart(getTodayISODate());
              }
            }}
            title="Filter tasks overlapping a custom date range"
          >
            <Calendar size={11} style={{ color: "#10B981" }} />
            Date Range
          </button>
        </div>

        {/* Conditional Single Date Picker */}
        {dateFilterMode === "date" && (
          <div className="date-filter-inline-picker">
            <input
              type="date"
              className="date-filter-input"
              value={dateFilterValue}
              onChange={(e) => setDateFilterValue(e.target.value)}
              title="Select target date"
              aria-label="Filter date"
            />
          </div>
        )}

        {/* Conditional Date Range Pickers */}
        {dateFilterMode === "range" && (
          <div className="date-range-inputs">
            <input
              type="date"
              className="date-filter-input"
              placeholder="Start"
              value={dateFilterRangeStart}
              onChange={(e) => setDateFilterRangeStart(e.target.value)}
              title="Range Start Date"
              aria-label="Range start date"
            />
            <span className="date-filter-range-sep" aria-hidden="true">→</span>
            <input
              type="date"
              className="date-filter-input"
              placeholder="End"
              value={dateFilterRangeEnd}
              onChange={(e) => setDateFilterRangeEnd(e.target.value)}
              title="Range End Date"
              aria-label="Range end date"
            />
          </div>
        )}

        {/* Active Date Summary Badge */}
        {dateFilterActiveSummary && (
          <div className="date-filter-active-wrap">
            <span className="date-filter-active-label">
              Showing: <strong>{dateFilterActiveSummary.label}</strong>
            </span>
            <span className="date-filter-count-badge">
              {dateFilterActiveSummary.countText}
            </span>
            <button
              type="button"
              className="date-filter-reset-btn"
              onClick={() => {
                setDateFilterMode("all");
                setDateFilterRangeStart("");
                setDateFilterRangeEnd("");
              }}
              title="Clear date filter"
              aria-label="Clear date filter"
            >
              <X size={10} />
            </button>
          </div>
        )}
      </div>

      {/* Middle Zone: Contextual Active Filter Chips (Removable) */}
      <div className="date-filter-chips-zone">
        {personFilterLabel && (
          <div className="filter-active-chip" title="Active assignee or team filter - click to clear">
            <Users size={10} style={{ color: "#38BDF8" }} />
            <span>{personFilterLabel}</span>
            <button
              type="button"
              onClick={() => setSelectedPersonFilter?.("all")}
              aria-label="Remove person filter"
            >
              <X size={10} />
            </button>
          </div>
        )}

        {isCompletedActive && (
          <div className="filter-active-chip" title="Completed tasks display mode - click to reset">
            <CheckCircle2 size={10} style={{ color: completedFilterMode === "filter" ? "#EF4444" : "#F59E0B" }} />
            <span>Completed: {completedFilterMode === "filter" ? "Hidden" : "Dimmed"}</span>
            <button
              type="button"
              onClick={() => setCompletedFilterMode?.("show")}
              aria-label="Reset completed tasks filter"
            >
              <X size={10} />
            </button>
          </div>
        )}

        {isBehaviorActive && (
          <div className="filter-active-chip" title="Non-matching tasks display mode - click to reset">
            <EyeOff size={10} style={{ color: "#818CF8" }} />
            <span>Non-matching: Hidden</span>
            <button
              type="button"
              onClick={() => setDateFilterBehavior("dim")}
              aria-label="Reset non-matching filter"
            >
              <X size={10} />
            </button>
          </div>
        )}
      </div>

      {/* Right Zone: Grouped Filters Popover & Quick Actions */}
      <div className="date-filter-right-zone">
        {hasAnyActiveFilter && (
          <button
            type="button"
            className="filter-clear-all-btn"
            onClick={clearAllFilters}
            title="Clear all active filters"
          >
            <RotateCcw size={11} />
            <span>Clear all</span>
          </button>
        )}

        <div className="filter-popover-container">
          <button
            ref={triggerRef}
            type="button"
            className={`filter-popover-btn ${activeSecondaryFilterCount > 0 ? "is-active" : ""}`}
            onClick={() => setIsFilterPopoverOpen((prev) => !prev)}
            aria-expanded={isFilterPopoverOpen}
            aria-haspopup="dialog"
            title="Configure task filters (Assignee, Completed visibility, Non-matching behavior)"
          >
            <Filter size={12} />
            <span>Filters</span>
            {activeSecondaryFilterCount > 0 && (
              <span className="filter-badge-count">{activeSecondaryFilterCount}</span>
            )}
            <ChevronDown size={11} className={`filter-chevron ${isFilterPopoverOpen ? "is-open" : ""}`} />
          </button>

          {/* Grouped Floating Popover Panel */}
          {isFilterPopoverOpen && (
            <div
              ref={popoverRef}
              className="filter-popover-card"
              role="dialog"
              aria-label="Filter Settings"
            >
              <div className="filter-popover-header">
                <div className="filter-popover-title">
                  <SlidersHorizontal size={13} style={{ color: "#0284C7" }} />
                  <span>Filter Settings</span>
                </div>
                <button
                  type="button"
                  className="filter-popover-close"
                  onClick={() => setIsFilterPopoverOpen(false)}
                  aria-label="Close filters"
                >
                  <X size={12} />
                </button>
              </div>

              {/* Group 1: People & Teams */}
              {setSelectedPersonFilter && (
                <div className="filter-popover-section">
                  <div className="filter-popover-section-label">
                    <Users size={12} style={{ color: "#38BDF8" }} />
                    <span>Assignee &amp; Team</span>
                  </div>
                  <div className="filter-popover-select-wrap">
                    <select
                      className="filter-popover-select"
                      value={selectedPersonFilter || "all"}
                      onChange={(e) => setSelectedPersonFilter(e.target.value)}
                      aria-label="Select assignee or team filter"
                    >
                      <option value="all">All People &amp; Teams</option>
                      <option value="sort:assignee">Sort by Assignee (A-Z)</option>
                      {teams.length > 0 && (
                        <optgroup label="Teams / Squads">
                          {teams.map((tm) => (
                            <option key={tm.id} value={`team:${tm.id}`}>
                              Team: {tm.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {effectivePeople.length > 0 && (
                        <optgroup label="Team Members">
                          {effectivePeople.map((p) => {
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
              {setCompletedFilterMode && (
                <div className="filter-popover-section">
                  <div className="filter-popover-section-label">
                    <CheckCircle2 size={12} style={{ color: "#10B981" }} />
                    <span>Completed Tasks</span>
                  </div>
                  <div className="filter-segmented-control" role="group" aria-label="Completed tasks display mode">
                    <button
                      type="button"
                      className={`filter-segmented-btn ${completedFilterMode === "show" ? "is-active" : ""}`}
                      onClick={() => setCompletedFilterMode("show")}
                      title="Show completed tasks normally"
                    >
                      <Eye size={11} />
                      <span>Show</span>
                    </button>
                    <button
                      type="button"
                      className={`filter-segmented-btn ${completedFilterMode === "dim" ? "is-active" : ""}`}
                      onClick={() => setCompletedFilterMode("dim")}
                      title="Dim completed tasks to emphasize active work"
                    >
                      <EyeOff size={11} style={{ color: "#F59E0B" }} />
                      <span>Dim</span>
                    </button>
                    <button
                      type="button"
                      className={`filter-segmented-btn ${completedFilterMode === "filter" ? "is-active is-danger" : ""}`}
                      onClick={() => setCompletedFilterMode("filter")}
                      title="Completely hide completed tasks from view"
                    >
                      <Filter size={11} style={{ color: "#EF4444" }} />
                      <span>Hide</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Group 3: Non-Matching Filtered Tasks */}
              <div className="filter-popover-section">
                <div className="filter-popover-section-label">
                  <EyeOff size={12} style={{ color: "#818CF8" }} />
                  <span>Non-Matching Filtered Tasks</span>
                </div>
                <div className="filter-segmented-control" role="group" aria-label="Non-matching tasks display mode">
                  <button
                    type="button"
                    className={`filter-segmented-btn ${dateFilterBehavior === "dim" ? "is-active" : ""}`}
                    onClick={() => setDateFilterBehavior("dim")}
                    title="Dim: keep every task visible in context, fading non-matching ones"
                  >
                    <EyeOff size={11} style={{ color: "#F59E0B" }} />
                    <span>Dim in Context</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-segmented-btn ${dateFilterBehavior === "hide" ? "is-active" : ""}`}
                    onClick={() => setDateFilterBehavior("hide")}
                    title="Hide: strictly display only matching tasks"
                  >
                    <Filter size={11} style={{ color: "#818CF8" }} />
                    <span>Hide</span>
                  </button>
                </div>
              </div>

              {/* Popover Footer: Quick Reset */}
              {activeSecondaryFilterCount > 0 && (
                <div className="filter-popover-footer">
                  <button
                    type="button"
                    className="filter-popover-reset-btn"
                    onClick={() => {
                      setCompletedFilterMode?.("show");
                      setDateFilterBehavior("dim");
                      setSelectedPersonFilter?.("all");
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
      </div>
    </div>
  );
};
