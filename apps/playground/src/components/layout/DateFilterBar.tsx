import React from "react";
import { Clock, Calendar, Filter, X, Eye, EyeOff, Users } from "lucide-react";
import { getTodayISODate, type Task, type Team } from "@jantt/core";
import type { DateFilterMode, CompletedFilterMode, EffectivePerson } from "../../types";

interface DateFilterBarProps {
  dateFilterMode: DateFilterMode;
  setDateFilterMode: (mode: DateFilterMode) => void;
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
  // One pass over tasks for all assignee counts (soft-deleted tasks are not counted).
  const assigneeCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t._deleted || !t.assignee) continue;
      counts.set(t.assignee, (counts.get(t.assignee) || 0) + 1);
    }
    return counts;
  }, [tasks]);

  return (
    <div className="date-filter-bar">
      {/* Left Zone: Date Filter Tabs, Pickers & Active Summary */}
      <div className="date-filter-left-zone">
        <div className="date-filter-tabs" role="group" aria-label="Date filter">
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
            className={`date-filter-tab ${dateFilterMode === "date" ? "is-active" : ""}`}
            aria-pressed={dateFilterMode === "date"}
            onClick={() => {
              setDateFilterMode("date");
              if (!dateFilterValue) setDateFilterValue(getTodayISODate());
            }}
            title="Filter tasks active on a specific date"
          >
            <Calendar size={11} style={{ color: "#F59E0B" }} />
            Pick Date
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "range" ? "is-active" : ""}`}
            aria-pressed={dateFilterMode === "range"}
            onClick={() => {
              setDateFilterMode("range");
              if (!dateFilterRangeStart) setDateFilterRangeStart(getTodayISODate());
            }}
            title="Filter tasks overlapping a date range"
          >
            <Filter size={11} style={{ color: "#10B981" }} />
            Date Range
          </button>
        </div>

        {/* Single Date Picker */}
        {dateFilterMode === "date" && (
          <input
            type="date"
            className="date-filter-input"
            value={dateFilterValue}
            onChange={(e) => setDateFilterValue(e.target.value)}
            title="Select target date"
            aria-label="Filter date"
          />
        )}

        {/* Date Range Picker */}
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

        {/* Active Date Filter Summary Badge & Reset */}
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
                setCompletedFilterMode?.("show");
                if (selectedPersonFilter !== "all" && !selectedPersonFilter.startsWith("sort:")) {
                  setSelectedPersonFilter?.("all");
                }
              }}
              title="Clear all filters (date, person and completed) and show every task"
            >
              <X size={11} />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Right Zone: Dim vs Filter Mode & Sort/Filter by People */}
      <div className="date-filter-right-zone">
        {/* Universal Mode Toggle (Dim vs Filter) */}
        <div
          className="date-filter-behavior-group"
          role="group"
          aria-label="Tasks that do not match the date or person filter"
          title="Tasks outside the date / person filter: dim them in place, or hide them"
        >
          <span className="date-filter-behavior-label">Non-matching:</span>
          <button
            type="button"
            className={`date-filter-behavior-btn ${dateFilterBehavior === "dim" ? "is-active" : ""}`}
            aria-pressed={dateFilterBehavior === "dim"}
            onClick={() => setDateFilterBehavior("dim")}
            title="Dim: keep every task visible in context and fade the non-matching ones"
          >
            <EyeOff size={11} style={{ color: "#F59E0B" }} />
            <span>Dim</span>
          </button>
          <button
            type="button"
            className={`date-filter-behavior-btn ${dateFilterBehavior === "hide" ? "is-active" : ""}`}
            aria-pressed={dateFilterBehavior === "hide"}
            onClick={() => setDateFilterBehavior("hide")}
            title="Hide: only show matching tasks"
          >
            <Filter size={11} style={{ color: "#818CF8" }} />
            <span>Hide</span>
          </button>
        </div>

        {/* Completed Tasks Toggle (Show vs Dim vs Filter) */}
        {setCompletedFilterMode && (
          <div
            className="date-filter-behavior-group"
            role="group"
            aria-label="Completed tasks"
            title="Completed tasks: show normally, dim, or hide them"
          >
            <span className="date-filter-behavior-label">Completed:</span>
            <button
              type="button"
              className={`date-filter-behavior-btn ${completedFilterMode === "show" ? "is-active" : ""}`}
              aria-pressed={completedFilterMode === "show"}
              onClick={() => setCompletedFilterMode("show")}
              title="Show Completed: Display completed tasks normally"
            >
              <Eye size={11} style={{ color: "#10B981" }} />
              <span>Show</span>
            </button>
            <button
              type="button"
              className={`date-filter-behavior-btn ${completedFilterMode === "dim" ? "is-active" : ""}`}
              aria-pressed={completedFilterMode === "dim"}
              onClick={() => setCompletedFilterMode("dim")}
              title="Dim Completed: Fade out completed tasks to emphasize active work"
            >
              <EyeOff size={11} style={{ color: "#F59E0B" }} />
              <span>Dim</span>
            </button>
            <button
              type="button"
              className={`date-filter-behavior-btn ${completedFilterMode === "filter" ? "is-active" : ""}`}
              aria-pressed={completedFilterMode === "filter"}
              onClick={() => setCompletedFilterMode("filter")}
              title="Hide completed tasks"
            >
              <Filter size={11} style={{ color: "#EF4444" }} />
              <span>Hide</span>
            </button>
          </div>
        )}

        {/* Sort & Filter by People Dropdown */}
        {setSelectedPersonFilter && (
          <div className="filter-bar-person-wrap" title="Sort or filter tasks by team member or squad">
            <Users size={12} className="filter-bar-person-icon" style={{ color: "#38BDF8" }} />
            <select
              className="filter-bar-person-select"
              value={selectedPersonFilter || "all"}
              onChange={(e) => setSelectedPersonFilter(e.target.value)}
              aria-label="Sort or filter by person or team"
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
                <optgroup label="Filter by Person">
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
            {selectedPersonFilter !== "all" && (
              <button
                type="button"
                className="filter-bar-person-clear"
                onClick={() => setSelectedPersonFilter("all")}
                title="Reset person filter to All"
                aria-label="Clear person filter"
              >
                <X size={10} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
