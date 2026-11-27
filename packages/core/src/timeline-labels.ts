import { formatHumanDate, isValidISODate, parseISODate } from "./date-math";
import type { TimelineLabels } from "./types";

/** English fallback for every label the timeline renders itself. */
export const DEFAULT_TIMELINE_LABELS: TimelineLabels = {
  monthsLong: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  daysShort: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  week: "Wk {week}",
  quarter: "Q{quarter}",
  monthYear: "{month} {year}",
  quarterYear: "{quarter} {year}",
  today: "Today",
  todayTitle: "Today: {date} (Click to filter tasks active today)",
  todayTitleNoDate: "Today (Click to filter tasks active today)",
  taskColumn: "Task & Category",
  daysColumn: "Days",
  progressColumn: "Prog",
  durationTitle: "Duration (Days)",
  progressTitle: "Progress Percentage",
  milestone: "Milestone",
  locked: "Locked",
  duration: "{days}d",
  openTaskDetails: "Open task details: {task}",
  addTaskTitle: "Add a new task",
  addTask: "Add Task",
  newTaskLabel: "New Task {number}",
  resizeTable: "Drag to resize table width",
  resizeTableAria: "Resize task table",
  resizeTableKeys: "Drag or use the arrow keys to resize the table",
  dragResizeColumn: "Drag to resize column width / zoom timeline",
  showTasksOn: "Show tasks on {date}",
  activeDateFilter: "{date}, active date filter",
  baselineTitle: "Baseline: {start} to {end}",
  milestoneAria: "Milestone: {task}, Date: {date}",
  milestoneAriaShort: "Milestone: {task}",
  dragProgress: "Drag progress ({percent}%)",
  criticalPillTitle: "Critical Path: task controls project completion date",
  dragResizeDuration: "Drag to resize duration",
  dragChangeStart: "Drag to change start date",
  dragCreateDependency: "Drag from task start to create a dependency",
  dragLinkPrerequisite: "Drag to link prerequisite",
  removeDependency: "Remove dependency: {description}",
  removeLink: "Remove link",
  activeDateTitle: "{date} (Active filter - click to show all dates)",
  boundaryDateTitle: "{date} (Task boundary date - click to show only tasks on this date)",
  showDateTitle: "{date} (Click to show only tasks on this date)",
  clearDateFilter: "Clear date filter {date}",
  weekTitle: "Week {week} (drag to zoom)",
  dependencyTitle: "Dependency: {description} (click to remove)",
  taskBarDetails: "Category: {category}, Start: {start}, End: {end}, Duration: {days} days",
  urgent: "Urgent",
  lockTaskTitle: "Unlocked (Click to lock in place)",
  unlockTaskTitle: "Locked in place (Click to unlock)",
  lockTask: "Lock task",
  unlockTask: "Unlock task",
  dragWireLinkPrerequisite: "Drag wire to link prerequisite",
  tooltipTimeline: "Timeline",
  tooltipGeneral: "General",
  tooltipBaseline: "Baseline Plan",
  tooltipSlip: "+{days}d slip",
  tooltipAhead: "{days}d ahead",
  tooltipOnPlan: "on plan",
  tooltipCritical: "Critical Path (0d buffer)",
  tooltipBehind: "Behind by {days}d (negative float)",
  tooltipBuffer: "{total}d buffer (Free: {free}d)",
  tooltipProgress: "Progress",
  tooltipAssignee: "Assignee / Owner",
  tooltipPriority: "Priority Level",
  tooltipBudget: "Planned Budget",
  tooltipDependsOn: "Depends On",
  tooltipScheduleBuffer: "Schedule Buffer",
  tooltipOpen: "Click to open details sidebar",
  priorityLow: "low",
  priorityMedium: "medium",
  priorityHigh: "high",
  priorityUrgent: "urgent"
};

/** Fills gaps so callers only pass the labels they want to translate. */
export function resolveTimelineLabels(labels?: Partial<TimelineLabels>): TimelineLabels {
  return labels ? { ...DEFAULT_TIMELINE_LABELS, ...labels } : DEFAULT_TIMELINE_LABELS;
}

/** Replaces `{name}` placeholders; unknown placeholders are left untouched. */
export function formatTimelineLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) && values[name] !== undefined ? String(values[name]) : match
  );
}

export function createTimelineDateFormatter(locale?: string): (value: string) => string {
  if (!locale) return formatHumanDate;
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  return value => isValidISODate(value) ? formatter.format(parseISODate(value)) : value;
}
