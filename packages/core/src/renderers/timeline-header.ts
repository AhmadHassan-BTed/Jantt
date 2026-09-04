import { GridHeader } from "../types";
import { clampDayWidth } from "../utils";

export interface TimelineHeaderOptions {
  selectedDate?: string | null;
  dayWidth?: number;
  onDateClick?: (dateStr: string) => void;
  onColumnResize?: (newDayWidth: number, clientX?: number) => void;
  onColumnResizeStart?: () => void;
  onColumnResizeEnd?: () => void;
}

/**
 * Starts a smooth, cursor-anchored timeline column drag session.
 * Attaches pointer events to window so DOM re-rendering never interrupts active dragging.
 */
function startColumnDragSession(
  initialPointerEvt: PointerEvent,
  startDayWidth: number,
  mode: "handle" | "cell",
  onResize?: (newDayWidth: number, clientX?: number) => void,
  onDragStateChange?: (didMove: boolean) => void,
  onDragStart?: () => void,
  onDragEnd?: () => void
) {
  // Only trigger on primary left click
  if (initialPointerEvt.button !== 0) return;

  initialPointerEvt.preventDefault();
  initialPointerEvt.stopPropagation();

  const startX = initialPointerEvt.clientX;
  const startY = initialPointerEvt.clientY;
  const initialWidth = startDayWidth;
  let hasMoved = false;
  let rafPending = false;

  const prevCursor = document.body.style.cursor;
  const prevUserSelect = document.body.style.userSelect;

  const onPointerMove = (e: PointerEvent) => {
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (!hasMoved) {
      const threshold = mode === "handle" ? 2 : 4;
      if (Math.abs(deltaX) >= threshold || (mode === "handle" && Math.abs(deltaY) >= threshold)) {
        hasMoved = true;
        onDragStart?.();
        onDragStateChange?.(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }
    }

    if (hasMoved && onResize) {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          let newWidth: number;
          if (mode === "handle") {
            // Direct width delta from border handle with calibrated, gentle damping:
            // Since dayWidth spans only ~79px (from 1.2px to 80px), raw 1:1 mouse movement
            // caused a tiny 30px drag to blow through 40% of the entire zoom spectrum.
            // Damping deltaX by 0.18 makes border resizing smooth, steady, and finely controllable.
            newWidth = clampDayWidth(initialWidth + deltaX * 0.18);
          } else {
            // Continuous zoom curve when holding the column body:
            // Dragging right stretches columns (zooms in), dragging left compresses (zooms out).
            // Calibrated with a generous 650px mouse travel divisor so horizontal scrubbing
            // feels smooth, gradual, and natural without sudden sensitivity jumps.
            const factor = Math.exp(deltaX / 650);
            newWidth = clampDayWidth(initialWidth * factor);
          }
          onResize(newWidth, startX);
        });
      }
    }
  };

  const onPointerUp = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    if (hasMoved) {
      onDragEnd?.();
    }

    document.body.style.cursor = prevCursor;
    document.body.style.userSelect = prevUserSelect;
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

/**
 * Renders the multi-tier sticky timeline header (Years, Months, Weekdays, Dates).
 * Dynamically adapts the days tier to prevent text squishing on zoomed-out scales (Month, Quarter, Year)
 * by only rendering legible boundary dates where tasks start or finish.
 *
 * Supports dual-mode smooth column resizing:
 * 1. Grabbing visible col-resize handles on column borders.
 * 2. Holding and dragging horizontally anywhere on column headers to smoothly stretch/compress timeline zoom.
 * Clicking a date without dragging filters tasks active on that date.
 */
export function renderTimelineHeader(header: GridHeader, options?: TimelineHeaderOptions): HTMLElement {
  const timelineHeader = document.createElement("div");
  timelineHeader.className = "jantt-timeline-header";
  timelineHeader.style.height = `${header.totalHeight}px`;

  const currentDayW = options?.dayWidth || header.days[0]?.width || 36;

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
    mCell.title = "Drag to smoothly zoom timeline";

    // Allow holding the month cell itself to stretch / zoom
    if (options?.onColumnResize) {
      mCell.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).classList.contains("jantt-col-resize-handle")) return;
        startColumnDragSession(
          e,
          currentDayW,
          "cell",
          options.onColumnResize,
          undefined,
          options.onColumnResizeStart,
          options.onColumnResizeEnd
        );
      });

      // Draggable resize handle for month tier
      const mResizeHandle = document.createElement("div");
      mResizeHandle.className = "jantt-col-resize-handle";
      mResizeHandle.title = "Drag to resize column width / zoom timeline";
      mResizeHandle.addEventListener("pointerdown", (e) => {
        startColumnDragSession(
          e,
          currentDayW,
          "handle",
          options.onColumnResize,
          undefined,
          options.onColumnResizeStart,
          options.onColumnResizeEnd
        );
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
      ? `${d.dateStr} (Active filter — click to clear, or drag to zoom)`
      : isBoundary
      ? `${d.dateStr} (Task boundary date — click to show tasks, or drag to zoom)`
      : `${d.dateStr} (Click to show tasks, or drag to zoom)`;
    dCell.setAttribute("data-date", d.dateStr);

    let cellDragMoved = false;

    // Support holding the column to zoom
    if (options?.onColumnResize) {
      dCell.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).classList.contains("jantt-col-resize-handle")) return;
        cellDragMoved = false;
        startColumnDragSession(
          e,
          currentDayW,
          "cell",
          options.onColumnResize,
          (didMove) => {
            cellDragMoved = didMove;
          },
          options.onColumnResizeStart,
          options.onColumnResizeEnd
        );
      });
    }

    // Support standard click to filter date (suppressed if a drag actually moved)
    if (options?.onDateClick) {
      dCell.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("jantt-col-resize-handle")) return;
        if (cellDragMoved) {
          cellDragMoved = false;
          return;
        }
        e.stopPropagation();
        options.onDateClick!(d.dateStr);
      });
    }

    if (isZoomedOut) {
      // On Month/Quarter/Year scales: show legible markers on task boundary dates, today, or active selected date
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

    // Draggable resize handle for day tier (available on all scales where cell is at least 6px)
    if (options?.onColumnResize && d.width >= 6) {
      const dResizeHandle = document.createElement("div");
      dResizeHandle.className = "jantt-col-resize-handle";
      dResizeHandle.title = "Drag to resize column width / zoom timeline";
      dResizeHandle.addEventListener("pointerdown", (e) => {
        startColumnDragSession(
          e,
          currentDayW,
          "handle",
          options.onColumnResize,
          undefined,
          options.onColumnResizeStart,
          options.onColumnResizeEnd
        );
      });
      dCell.appendChild(dResizeHandle);
    }

    daysRow.appendChild(dCell);
  });

  timelineHeader.appendChild(daysRow);
  return timelineHeader;
}
