import { GridHeader } from "../types";

/**
 * Renders the multi-tier sticky timeline header (Years, Months, Weekdays, Dates).
 */
export function renderTimelineHeader(header: GridHeader): HTMLElement {
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

  // 3. Days / Dates tier
  const daysRow = document.createElement("div");
  daysRow.className = "jantt-header-days";
  header.days.forEach((d) => {
    const dCell = document.createElement("div");
    dCell.className = `jantt-day-cell ${d.isWeekend ? "is-weekend" : ""} ${d.isToday ? "is-today" : ""}`;
    dCell.style.width = `${d.width}px`;
    dCell.title = d.dateStr;
    dCell.innerHTML = `
      <span class="jantt-day-name">${d.dayName}</span>
      <span class="jantt-day-num">${d.label}</span>
    `;
    daysRow.appendChild(dCell);
  });
  timelineHeader.appendChild(daysRow);

  return timelineHeader;
}
