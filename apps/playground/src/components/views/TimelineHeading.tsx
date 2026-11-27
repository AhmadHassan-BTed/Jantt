import React, { useMemo } from "react";
import { getDatePart, isTaskDone, isValidISODate, toEpochMinutes, type JanttData } from "@jantt/core";

const month = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

export function TimelineHeading({ data, onHealth }: { data: JanttData; onHealth: () => void }) {
  const summary = useMemo(() => {
    let total = 0, done = 0, start = "", end = "", minM = Infinity, maxM = -Infinity;
    for (const task of data.tasks) {
      if (task._deleted) continue;
      total++;
      if (isTaskDone(task)) done++;
      if (isValidISODate(task.start)) {
        const m = toEpochMinutes(task.start);
        if (m < minM) { minM = m; start = getDatePart(task.start); }
      }
      if (isValidISODate(task.end)) {
        const m = toEpochMinutes(task.end);
        if (m > maxM) { maxM = m; end = getDatePart(task.end); }
      }
    }
    const from = start && month.format(new Date(`${start}T00:00:00Z`));
    const to = end && month.format(new Date(`${end}T00:00:00Z`));
    return { total, done, dates: from === to ? from : [from, to].filter(Boolean).join(" – ") };
  }, [data.tasks]);
  const percent = summary.total ? Math.round(100 * summary.done / summary.total) : 0;
  return <header className="phone-timeline-heading">
    <div><h1>Timeline</h1><p>{summary.dates || "Project schedule"}</p></div>
    <button type="button" onClick={onHealth} aria-label={`${summary.done} of ${summary.total} tasks complete. Open project health`}>
      <i aria-hidden="true" style={{ "--complete": `${percent}%` } as React.CSSProperties} />
      <span><strong>{summary.done} / {summary.total}</strong> complete</span>
    </button>
  </header>;
}
