import React from "react";
import { Clock, Calendar, Filter, X, EyeOff } from "lucide-react";
import { getTodayISODate } from "@jantt/core";
import type { DateFilterMode } from "../types";

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
  setDateFilterBehavior
}) => {
  return (
    <div className="date-filter-bar">
      <div className="date-filter-tabs">
        <button
          className={`date-filter-tab ${dateFilterMode === "all" ? "is-active" : ""}`}
          onClick={() => setDateFilterMode("all")}
          title="Show all project tasks without date restrictions"
        >
          All Tasks
        </button>
        <button
          className={`date-filter-tab ${dateFilterMode === "today" ? "is-active" : ""}`}
          onClick={() => setDateFilterMode("today")}
          title={`Filter tasks active today (${getTodayISODate()})`}
        >
          <Clock size={11} />
          Today
        </button>
        <button
          className={`date-filter-tab ${dateFilterMode === "week" ? "is-active" : ""}`}
          onClick={() => setDateFilterMode("week")}
          title="Filter tasks active this week (Monday to Sunday)"
        >
          <Calendar size={11} />
          This Week
        </button>
        <button
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

      {/* Active Filter Summary Badge & Reset */}
      {dateFilterActiveSummary && (
        <div className="date-filter-active-wrap">
          <span className="date-filter-active-label">
            Showing: <strong>{dateFilterActiveSummary.label}</strong>
          </span>
          <span className="date-filter-count-badge">
            {dateFilterActiveSummary.countText}
          </span>
          <button
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

      {/* Universal Filter Behavior Toggle (Dim vs Filter) across all views */}
      {dateFilterMode !== "all" && (
        <div className="date-filter-behavior-group">
          <span className="date-filter-behavior-label">Mode:</span>
          <button
            className={`date-filter-behavior-btn ${dateFilterBehavior === "dim" ? "is-active" : ""}`}
            onClick={() => setDateFilterBehavior("dim")}
            title="Dim Mode: Keep all tasks visible, fade non-matching tasks"
          >
            <EyeOff size={11} />
            Dim
          </button>
          <button
            className={`date-filter-behavior-btn ${dateFilterBehavior === "hide" ? "is-active" : ""}`}
            onClick={() => setDateFilterBehavior("hide")}
            title="Filter Mode: Only show tasks matching the active date filter"
          >
            <Filter size={11} />
            Filter
          </button>
        </div>
      )}
    </div>
  );
};
