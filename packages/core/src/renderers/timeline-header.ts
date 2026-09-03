import { GridHeader } from "../types";

export interface TimelineHeaderOptions {
  selectedDate?: string | null;
  dayWidth?: number;
  onDateClick?: (dateStr: string) => void;
  onColumnResize?: (newDayWidth: number) => void;
}

/**
 * Renders the multi-tier sticky timeline header (Years, Months, Weekdays, Dates).
 * Dynamically adapts the days tier to prevent text squishing on zoomed-out scales (Month, Quarter, Year)
 * by only rendering legible boundary dates where tasks start or finish.
 * Day cells are interactive and clickable to filter tasks active on that date,
 * and column borders have draggable resize handles for continuous timeline zooming.
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

    // Draggable resize handle for month tier
    if (options?.onColumnResize) {
      const mResizeHandle = document.createElement("div");
      mResizeHandle.className = "jantt-col-resize-handle";
      mResizeHandle.title = "Drag to zoom timeline";
      mResizeHandle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        try { mResizeHandle.setPointerCapture(e.pointerId); } catch {}

        const startX = e.clientX;
        const currentDayW = options.dayWidth || 7;
        const approxDaysInMonth = Math.max(1, Math.round(m.width / currentDayW));

        const onPointerMove = (moveEvt: PointerEvent) => {
          const deltaX = moveEvt.clientX - startX;
          const newTotalMonthWidth = Math.max(20, m.width + deltaX);
          const newDayWidth = Math.max(1.2, Math.min(100, Math.round((newTotalMonthWidth / approxDaysInMonth) * 10) / 10));
          options.onColumnResize?.(newDayWidth);
        };

        const onPointerUp = (upEvt: PointerEvent) => {
          try { mResizeHandle.releasePointerCapture(upEvt.pointerId); } catch {}
          mResizeHandle.removeEventListener("pointermove", onPointerMove);
          mResizeHandle.removeEventListener("pointerup", onPointerUp);
          mResizeHandle.removeEventListener("pointercancel", onPointerUp);
        };

        mResizeHandle.addEventListener("pointermove", onPointerMove);
        mResizeHandle.addEventListener("pointerup", onPointerUp);
        mResizeHandle.addEventListener("pointercancel", onPointerUp);
      });
      mCell.appendChild(mResizeHandle);
    }

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
        // Prevent click when dragging resize handle
        if ((e.target as HTMLElement).classList.contains("jantt-col-resize-handle")) return;
        e.stopPropagation();
        options.onDateClick!(d.dateStr);
      });
    }

    if (isZoomedOut) {
      // On Month/Quarter/Year scales: show legible markers on task start/finish boundary dates, today, or active selected date
      if (isSelected || isBoundary || d.isToday || d.dayOfMonth === 1) {
        dCell.innerHTML = `<span class="jantt-boundary-marker ${d.isToday ? "is-today-marker" : ""} ${isSelected ? "is-selected-marker" : ""}" title="${d.dateStr}">${d.dayOfMonth}</span>`;
      } else {
        dCell.innerHTML = "";
      }
    } else if (isCompactWeek && d.width < 22) {
      // On compact Week scale: show day numbers on task boundaries, Mondays, 1st of month, today, or active selected date
      if (isSelected || isBoundary || d.isToday || d.dayOfWeek === 1 || d.dayOfMonth === 1) {
        dCell.innerHTML = `<span class="jantt-day-num ${isBoundary || isSelected ? "is-boundary-num" : ""}">${d.label}</span>`;
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

    // Draggable resize handle for day tier
    if (options?.onColumnResize && d.width >= 10) {
      const dResizeHandle = document.createElement("div");
      dResizeHandle.className = "jantt-col-resize-handle";
      dResizeHandle.title = "Drag to resize column width / zoom timeline";
      dResizeHandle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        try { dResizeHandle.setPointerCapture(e.pointerId); } catch {}

        const startX = e.clientX;
        const initialWidth = d.width;

        const onPointerMove = (moveEvt: PointerEvent) => {
          const deltaX = moveEvt.clientX - startX;
          const newDayWidth = Math.max(1.2, Math.min(100, Math.round((initialWidth + deltaX) * 10) / 10));
          options.onColumnResize?.(newDayWidth);
        };

        const onPointerUp = (upEvt: PointerEvent) => {
          try { dResizeHandle.releasePointerCapture(upEvt.pointerId); } catch {}
          dResizeHandle.removeEventListener("pointermove", onPointerMove);
          dResizeHandle.removeEventListener("pointerup", onPointerUp);
          dResizeHandle.removeEventListener("pointercancel", onPointerUp);
        };

        dResizeHandle.addEventListener("pointermove", onPointerMove);
        dResizeHandle.addEventListener("pointerup", onPointerUp);
        dResizeHandle.addEventListener("pointercancel", onPointerUp);
      });
      dCell.appendChild(dResizeHandle);
    }

    daysRow.appendChild(dCell);
  });

  timelineHeader.appendChild(daysRow);
  return timelineHeader;
}
