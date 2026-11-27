import { useMemo } from "react";
import { DEFAULT_TIMELINE_LABELS, formatTimelineLabel, type TimelineLabels } from "@jantt/core";
import { useI18n } from "./I18nProvider";

const MONTHS_ZH = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
const DAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/** Labels and templates shared between the DOM timeline and the Canvas view. */
export function useTimelineLabels(): TimelineLabels {
  const { locale, t } = useI18n();
  return useMemo(() => ({
    locale,
    monthsLong: locale === "zh-CN" ? MONTHS_ZH : DEFAULT_TIMELINE_LABELS.monthsLong,
    monthsShort: locale === "zh-CN" ? MONTHS_ZH : DEFAULT_TIMELINE_LABELS.monthsShort,
    daysShort: locale === "zh-CN" ? DAYS_ZH : DEFAULT_TIMELINE_LABELS.daysShort,
    week: t("timeline.week"),
    quarter: t("timeline.quarter"),
    monthYear: t("timeline.monthYear"),
    quarterYear: t("timeline.quarterYear"),
    today: t("timeline.today"),
    todayTitle: t("timeline.todayTitle"),
    todayTitleNoDate: t("timeline.todayTitleNoDate"),
    taskColumn: t("timeline.taskColumn"),
    daysColumn: t("timeline.daysColumn"),
    progressColumn: t("timeline.progressColumn"),
    durationTitle: t("timeline.durationTitle"),
    progressTitle: t("timeline.progressTitle"),
    milestone: t("timeline.milestone"),
    locked: t("timeline.locked"),
    duration: t("timeline.duration"),
    openTaskDetails: t("timeline.openTaskDetails"),
    addTaskTitle: t("timeline.addTaskTitle"),
    addTask: t("timeline.addTask"),
    newTaskLabel: t("timeline.newTaskLabel"),
    resizeTable: t("timeline.resizeTable"),
    resizeTableAria: t("timeline.resizeTableAria"),
    resizeTableKeys: t("timeline.resizeTableKeys"),
    dragResizeColumn: t("timeline.dragResizeColumn"),
    showTasksOn: t("timeline.showTasksOn"),
    activeDateFilter: t("timeline.activeDateFilter"),
    baselineTitle: t("timeline.baselineTitle"),
    milestoneAria: t("timeline.milestoneAria"),
    milestoneAriaShort: t("timeline.milestoneAriaShort"),
    dragProgress: t("timeline.dragProgress"),
    criticalPillTitle: t("timeline.criticalPillTitle"),
    dragResizeDuration: t("timeline.dragResizeDuration"),
    dragChangeStart: t("timeline.dragChangeStart"),
    dragCreateDependency: t("timeline.dragCreateDependency"),
    dragLinkPrerequisite: t("timeline.dragLinkPrerequisite"),
    removeDependency: t("timeline.removeDependency"),
    removeLink: t("timeline.removeLink"),
    activeDateTitle: t("timeline.activeDateTitle"),
    boundaryDateTitle: t("timeline.boundaryDateTitle"),
    showDateTitle: t("timeline.showDateTitle"),
    clearDateFilter: t("timeline.clearDateFilter"),
    weekTitle: t("timeline.weekTitle"),
    dependencyTitle: t("timeline.dependencyTitle"),
    taskBarDetails: t("timeline.taskBarDetails"),
    urgent: t("timeline.urgent"),
    lockTaskTitle: t("timeline.lockTaskTitle"),
    unlockTaskTitle: t("timeline.unlockTaskTitle"),
    lockTask: t("timeline.lockTask"),
    unlockTask: t("timeline.unlockTask"),
    dragWireLinkPrerequisite: t("timeline.dragWireLinkPrerequisite"),
    tooltipTimeline: t("timeline.tooltipTimeline"),
    tooltipGeneral: t("timeline.tooltipGeneral"),
    tooltipBaseline: t("timeline.tooltipBaseline"),
    tooltipSlip: t("timeline.tooltipSlip"),
    tooltipAhead: t("timeline.tooltipAhead"),
    tooltipOnPlan: t("timeline.tooltipOnPlan"),
    tooltipCritical: t("timeline.tooltipCritical"),
    tooltipBehind: t("timeline.tooltipBehind"),
    tooltipBuffer: t("timeline.tooltipBuffer"),
    tooltipProgress: t("timeline.tooltipProgress"),
    tooltipAssignee: t("timeline.tooltipAssignee"),
    tooltipPriority: t("timeline.tooltipPriority"),
    tooltipBudget: t("timeline.tooltipBudget"),
    tooltipDependsOn: t("timeline.tooltipDependsOn"),
    tooltipScheduleBuffer: t("timeline.tooltipScheduleBuffer"),
    tooltipOpen: t("timeline.tooltipOpen"),
    priorityLow: t("timeline.priorityLow"),
    priorityMedium: t("timeline.priorityMedium"),
    priorityHigh: t("timeline.priorityHigh"),
    priorityUrgent: t("timeline.priorityUrgent"),
  }), [locale, t]);
}

export function useCanvasTimelineLabels() {
  const labels = useTimelineLabels();
  return useMemo(() => ({
    monthLabels: labels.monthsShort,
    quarterLabels: [1, 2, 3, 4].map(quarter => formatTimelineLabel(labels.quarter, { quarter })),
    monthYearTemplate: labels.monthYear
  }), [labels]);
}
