import { GridHeader } from "../types";

export interface TimelineHeaderOptions {
  selectedDate?: string | null;
  onDateClick?: (dateStr: string) => void;
}

/**
 * Renders the multi-tier sticky timeline header (Years, Months, Weekdays, Dates).
 * Dynamically adapts the days tier to prevent text squishing on zoomed-out scales (Month, Quarter, Year)
 * by only rendering legible boundary dates where tasks start or finish.
 * Day cells are interactive and clickable to filter tasks active on that date.
 */
export function renderTimelineHeader(header: GridHeader, options?: TimelineHeaderOptions): HTMLElement {
  const timelineHeader = document.createElement("div");
  timelineHeader.className = "jantt-timeline-header";
  timelineHeader.style.height = `${header.totalHeight}px`;

  // 1. Years tier (rendered when timeline spans multiple years)
  if (header.spansMultipleYears && header.years.length > 0) {
    const yearsRow = document.createElement("div");
    yearsRow.className = "jantt-header-years";
    header.years.forEach((y) => {
      const yCell = document.createElement("div");
      yCell.className = "jantt-year-cell";
      yCell.style.width = `${y.width}px`;
      yCell.textContent = y.label;
      yearsRow.appendChild(yCell);
    });
    timelineHeader.appendChild(yearsRow);
  }

  // 2. Months tier
  const monthsRow = document.createElement("div");
  monthsRow.className = "jantt-header-months";
  header.months.forEach((m) => {
    const mCell = document.createElement("div");
    mCell.className = "jantt-month-cell";
    mCell.style.width = `${m.width}px`;
    mCell.textContent = m.label;
    monthsRow.appendChild(mCell);
  });
  timelineHeader.appendChild(monthsRow);

  // 3. Days / Dates tier (Dynamic & Adaptive)
  const daysRow = document.createElement("div");
  daysRow.className = "jantt-header-days";

  const isZoomedOut = header.scale === "month" || header.scale === "quarter" || header.scale === "year";
  const isCompactWeek = header.scale === "week";

  header.days.forEach((d) => {
    const dCell = document.createElement("div");
    const isBoundary = Boolean(d.isTaskBoundary);
    const isSelected = options?.selectedDate === d.dateStr;
    dCell.className = `jantt-day-cell ${d.isWeekend ? "is-weekend" : ""} ${d.isToday ? "is-today" : ""} ${
      isBoundary ? "is-task-boundary" : ""
    } ${isSelected ? "is-date-selected" : ""}`;
    dCell.style.width = `${d.width}px`;
    dCell.title = isSelected
      ? `${d.dateStr} (Active filter — click to clear)`
      : isBoundary
      ? `${d.dateStr} (Task boundary date — click to show tasks on this date)`
      : `${d.dateStr} (Click to show tasks on this date)`;
    dCell.setAttribute("data-date", d.dateStr);

    if (options?.onDateClick) {
      dCell.addEventListener("click", (e) => {
        e.stopPropagation();
        options.onDateClick!(d.dateStr);
      });
    }

    if (isZoomedOut) {
      // On Month/Quarter/Year scales: ONLY show legible markers on task start/finish boundary dates or today
      if (isBoundary || d.isToday || d.dayOfMonth === 1) {
        dCell.innerHTML = `<span class="jantt-boundary-marker ${d.isToday ? "is-today-marker" : ""}" title="${d.dateStr}">${d.dayOfMonth}</span>`;
      } else {
        dCell.innerHTML = "";
      }
    } else if (isCompactWeek && d.width < 22) {
      // On compact Week scale: show day numbers on task boundaries, Mondays, or 1st of month
      if (isBoundary || d.isToday || d.dayOfWeek === 1 || d.dayOfMonth === 1) {
        dCell.innerHTML = `<span class="jantt-day-num ${isBoundary ? "is-boundary-num" : ""}">${d.label}</span>`;
      } else {
        dCell.innerHTML = "";
      }
    } else {
      // On standard Day scale: show day name and day number
      dCell.innerHTML = `
        <span class="jantt-day-name">${d.dayName}</span>
        <span class="jantt-day-num">${d.label}</span>
      `;
    }

    daysRow.appendChild(dCell);
  });

  timelineHeader.appendChild(daysRow);
  return timelineHeader;
}
