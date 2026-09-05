import React from "react";
import { Clock, Calendar, Filter, X, Eye, EyeOff, Users } from "lucide-react";
import { getTodayISODate, type Task, type Team } from "@jantt/core";
import type { DateFilterMode, CompletedFilterMode, EffectivePerson } from "../types";

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
  return (
    <div className="date-filter-bar">
      {/* Left Zone: Date Filter Tabs, Pickers & Active Summary */}
      <div className="date-filter-left-zone">
        <div className="date-filter-tabs">
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "all" ? "is-active" : ""}`}
            onClick={() => setDateFilterMode("all")}
            title="Show all project tasks without date restrictions"
          >
            All Tasks
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "today" ? "is-active" : ""}`}
            onClick={() => setDateFilterMode("today")}
            title={`Filter tasks active today (${getTodayISODate()})`}
          >
            <Clock size={11} />
            Today
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "week" ? "is-active" : ""}`}
            onClick={() => setDateFilterMode("week")}
            title="Filter tasks active this week (Monday to Sunday)"
          >
            <Calendar size={11} />
            This Week
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "date" ? "is-active" : ""}`}
            onClick={() => {
              setDateFilterMode("date");
              if (!dateFilterValue) setDateFilterValue(getTodayISODate());
            }}
            title="Filter tasks active on a specific date"
          >
            <Calendar size={11} />
            Pick Date
          </button>
          <button
            type="button"
            className={`date-filter-tab ${dateFilterMode === "range" ? "is-active" : ""}`}
            onClick={() => {
              setDateFilterMode("range");
              if (!dateFilterRangeStart) setDateFilterRangeStart(getTodayISODate());
            }}
            title="Filter tasks overlapping a date range"
          >
            <Filter size={11} />
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
            />
            <span className="date-filter-range-sep">→</span>
            <input
              type="date"
              className="date-filter-input"
              placeholder="End"
              value={dateFilterRangeEnd}
              onChange={(e) => setDateFilterRangeEnd(e.target.value)}
              title="Range End Date"
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
                setDateFilterValue("");
                setDateFilterRangeStart("");
                setDateFilterRangeEnd("");
              }}
              title="Clear date filter and show all tasks"
            >
              <X size={11} />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Right Zone: Dim vs Filter Mode & Sort/Filter by People */}
      <div className="date-filter-right-zone">
        {/* Universal Mode Toggle (Dim vs Filter) */}
        <div
          className="date-filter-behavior-group"
          title="Date & person filter mode: Dim non-matching tasks or completely Filter/Hide them"
        >
          <span className="date-filter-behavior-label">Mode:</span>
          <button
            type="button"
            className={`date-filter-behavior-btn ${dateFilterBehavior === "dim" ? "is-active" : ""}`}
            onClick={() => setDateFilterBehavior("dim")}
            title="Dim Mode: Keep all tasks visible in context, fade non-matching tasks"
          >
            <EyeOff size={11} />
            <span>Dim</span>
          </button>
          <button
            type="button"
            className={`date-filter-behavior-btn ${dateFilterBehavior === "hide" ? "is-active" : ""}`}
            onClick={() => setDateFilterBehavior("hide")}
            title="Filter Mode: Only show matching tasks, hide non-matching"
          >
            <Filter size={11} />
            <span>Filter</span>
          </button>
        </div>

        {/* Completed Tasks Toggle (Show vs Dim vs Filter) */}
        {setCompletedFilterMode && (
          <div
            className="date-filter-behavior-group"
            title="Completed tasks display mode: Show normally, Dim, or Filter/Hide them"
          >
            <span className="date-filter-behavior-label">Completed:</span>
            <button
              type="button"
              className={`date-filter-behavior-btn ${completedFilterMode === "show" ? "is-active" : ""}`}
              onClick={() => setCompletedFilterMode("show")}
              title="Show Completed: Display completed tasks normally"
            >
              <Eye size={11} />
              <span>Show</span>
            </button>
            <button
              type="button"
              className={`date-filter-behavior-btn ${completedFilterMode === "dim" ? "is-active" : ""}`}
              onClick={() => setCompletedFilterMode("dim")}
              title="Dim Completed: Fade out completed tasks to emphasize active work"
            >
              <EyeOff size={11} />
              <span>Dim</span>
            </button>
            <button
              type="button"
              className={`date-filter-behavior-btn ${completedFilterMode === "filter" ? "is-active" : ""}`}
              onClick={() => setCompletedFilterMode("filter")}
              title="Filter Completed: Completely hide completed tasks"
            >
              <Filter size={11} />
              <span>Filter</span>
            </button>
          </div>
        )}

        {/* Sort & Filter by People Dropdown */}
        {setSelectedPersonFilter && (
          <div className="filter-bar-person-wrap" title="Sort or filter tasks by team member or squad">
            <Users size={12} className="filter-bar-person-icon" />
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
                    const count = tasks.filter(
                      (t) => t.assignee === p.name || t.assignee === p.id
                    ).length;
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
