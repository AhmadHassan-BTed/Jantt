import React, { useMemo } from "react";
import { isTaskDone, isValidISODate, type JanttData } from "@jantt/core";
import { useI18n } from "../../i18n/I18nProvider";

const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: "short", year: "numeric", timeZone: "UTC" };

export function TimelineHeading({ data, onHealth }: { data: JanttData; onHealth: () => void }) {
  const { t, formatDate } = useI18n();
  const summary = useMemo(() => {
    let total = 0, done = 0, start = "", end = "";
    for (const task of data.tasks) {
      if (task._deleted) continue;
      total++;
      if (isTaskDone(task)) done++;
      if (isValidISODate(task.start) && (!start || task.start < start)) start = task.start;
      if (isValidISODate(task.end) && task.end > end) end = task.end;
    }
    const from = start ? formatDate(start, MONTH_YEAR) : "";
    const to = end ? formatDate(end, MONTH_YEAR) : "";
    return { total, done, dates: from === to ? from : [from, to].filter(Boolean).join(" – ") };
  }, [data.tasks, formatDate]);
  const percent = summary.total ? Math.round(100 * summary.done / summary.total) : 0;
  return <header className="phone-timeline-heading">
    <div><h1>{t("view.timeline")}</h1><p>{summary.dates || t("timeline.projectSchedule")}</p></div>
    <button
      type="button"
      onClick={onHealth}
      aria-label={t("timeline.healthAria", { done: summary.done, total: summary.total })}
    >
      <i aria-hidden="true" style={{ "--complete": `${percent}%` } as React.CSSProperties} />
      <span><strong>{summary.done} / {summary.total}</strong> {t("timeline.complete")}</span>
    </button>
  </header>;
}
