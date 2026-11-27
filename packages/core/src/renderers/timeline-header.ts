import { GridHeader, HeaderDay } from "../types";
import { addDays, formatHumanDate, formatTimeOfDay, getDatePart, MINUTES_PER_DAY } from "../date-math";
import { clampDayWidth } from "../utils";

export interface TimelineHeaderOptions {
  visibleXRange?: { startX: number; endX: number };
  selectedDate?: string | null;
  dayWidth?: number;
  showToday?: boolean;
  showTodayTag?: boolean;
  onDateClick?: (dateStr: string) => void;
  onColumnResize?: (newDayWidth: number, clientX?: number) => void;
  /** Called when a drag session starts moving, with the pointer-down position (zoom anchor). */
  onColumnResizeStart?: (clientX?: number) => void;
  onColumnResizeEnd?: () => void;
  /** Aborting cancels an in-progress column drag (window listeners, body cursor), e.g. on unmount. */
  signal?: AbortSignal;
}

interface TierCell {
  label: string;
  title: string;
  x: number;
  width: number;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Starts a smooth timeline column drag session (onDragStart receives the pointer-down clientX so
 * the engine keeps the grabbed date under the pointer).
 * Attaches pointer events to window so DOM re-rendering never interrupts active dragging.
 * Width updates are coalesced to one per animation frame and always use the latest pointer
 * position; a pending frame is flushed on release so the final width is applied before onDragEnd.
 */
function startColumnDragSession(
  initialPointerEvt: PointerEvent,
  startDayWidth: number,
  mode: "handle" | "cell",
  cellDays: number,
  onResize?: (newDayWidth: number, clientX?: number) => void,
  onDragStateChange?: (didMove: boolean) => void,
  onDragStart?: (clientX?: number) => void,
  onDragEnd?: () => void,
  signal?: AbortSignal
) {
  // Only trigger on primary left click
  if (initialPointerEvt.button !== 0 || signal?.aborted) return;

  initialPointerEvt.preventDefault();
  initialPointerEvt.stopPropagation();

  const startX = initialPointerEvt.clientX;
  const startY = initialPointerEvt.clientY;
  const initialWidth = startDayWidth;
  const effectiveCellDays = Math.max(1 / 1440, Number.isFinite(cellDays) && cellDays > 0 ? cellDays : 1);
  let hasMoved = false;
  let lastClientX = startX;
  let framePending = false;
  let frameId = 0;

  const prevCursor = document.body.style.cursor;
  const prevUserSelect = document.body.style.userSelect;

  const computeWidth = (): number => {
    const deltaX = lastClientX - startX;
    if (mode === "handle") {
      // Scale border handle drag to the duration of the grabbed cell so minute, hour, day, week,
      // and month borders track the pointer smoothly across all zoom scales.
      const gain = Math.abs(effectiveCellDays - 1) < 1e-6 ? 0.35 : 0.85 / effectiveCellDays;
      if (deltaX >= 0) {
        return clampDayWidth(initialWidth + deltaX * gain);
      }
      // Smooth exponential contraction with identical slope at deltaX = 0 avoids slamming into the min clamp.
      return clampDayWidth(initialWidth * Math.exp((deltaX * gain) / Math.max(initialWidth, 1)));
    }
    // Continuous exponential zoom curve when holding the column body:
    // Dragging right stretches columns (zooms in), dragging left compresses (zooms out).
    // 300px horizontal drag doubles/halves the scale uniformly across every zoom tier.
    return clampDayWidth(initialWidth * Math.exp(deltaX / 300));
  };

  const applyResize = () => {
    framePending = false;
    onResize?.(computeWidth(), startX);
  };

  const onPointerMove = (e: PointerEvent) => {
    lastClientX = e.clientX;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (!hasMoved) {
      const threshold = mode === "handle" ? 2 : 4;
      if (Math.abs(deltaX) >= threshold || (mode === "handle" && Math.abs(deltaY) >= threshold)) {
        hasMoved = true;
        onDragStart?.(startX);
        onDragStateChange?.(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.body.classList.add("jantt-is-col-resizing");
      }
    }

    if (hasMoved && onResize && !framePending) {
      framePending = true;
      frameId = requestAnimationFrame(applyResize);
    }
  };

  const teardown = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    signal?.removeEventListener("abort", teardown);
    if (framePending) {
      cancelAnimationFrame(frameId);
      framePending = false;
    }
    document.body.style.cursor = prevCursor;
    document.body.style.userSelect = prevUserSelect;
    document.body.classList.remove("jantt-is-col-resizing");
  };

  function onPointerUp() {
    // Apply the latest pointer position before the drag anchor is released
    if (framePending) {
      cancelAnimationFrame(frameId);
      applyResize();
    }
    teardown();
    if (hasMoved) {
      onDragEnd?.();
    }
  }

  function onPointerCancel(e: PointerEvent) {
    // If mouse button is still actively held, don't drop drag session when DOM re-renders
    if (e.pointerType === "mouse" && e.buttons === 1) {
      return;
    }
    onPointerUp();
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  signal?.addEventListener("abort", teardown, { once: true });
}

function dayLabel(className: string, text: string): HTMLSpanElement {
  const label = document.createElement("span");
  label.className = className;
  label.textContent = text;
  return label;
}

function buildTierRow(
  rowClass: string,
  cellClass: string,
  cells: TierCell[],
  withResizeHandles: boolean,
  cellDays: number,
  window?: { startX: number; endX: number; totalWidth: number }
): HTMLElement {
  const row = document.createElement("div");
  row.className = rowClass;
  if (window) {
    row.classList.add("is-windowed");
    row.style.width = `${window.totalWidth}px`;
  }
  cells.forEach((c) => {
    if (window && (c.x + c.width < window.startX || c.x > window.endX)) return;
    const cell = document.createElement("div");
    cell.className = cellClass;
    if (window) cell.style.left = `${c.x}px`;
    cell.style.width = `${c.width}px`;
    cell.title = c.title;
    cell.dataset.zoomCell = "";
    cell.dataset.cellDays = String(cellDays);
    const label = document.createElement("span");
    label.className = "jantt-tier-label";
    label.textContent = c.label;
    cell.appendChild(label);
    if (withResizeHandles) {
      const handle = document.createElement("div");
      handle.className = "jantt-col-resize-handle";
      handle.title = "Drag to resize column width / zoom timeline";
      cell.appendChild(handle);
    }
    row.appendChild(cell);
  });
  return row;
}

/** Groups header days into calendar quarters (Q1..Q4) for zoomed-out tiers. */
function computeQuarters(days: HeaderDay[], withYear: boolean): TierCell[] {
  const quarters: TierCell[] = [];
  let current: TierCell | null = null;
  let currentKey = "";
  days.forEach((d) => {
    const year = d.dateStr.slice(0, 4);
    const quarter = Math.floor((parseInt(d.dateStr.slice(5, 7), 10) - 1) / 3) + 1;
    const key = `${year}-${quarter}`;
    if (key !== currentKey) {
      currentKey = key;
      current = {
        label: withYear ? `Q${quarter} ${year}` : `Q${quarter}`,
        title: `Q${quarter} ${year}`,
        x: d.x,
        width: 0
      };
      quarters.push(current);
    }
    current!.width += d.width;
  });
  return quarters;
}

function monthCells(header: GridHeader, compact: boolean): TierCell[] {
  let monthIndex = header.days.length > 0 ? parseInt(header.days[0].dateStr.slice(5, 7), 10) - 1 : 0;
  return header.months.map((m) => {
    const short = MONTH_SHORT[monthIndex % 12];
    monthIndex++;
    return { label: compact ? short : m.label, title: m.label, x: m.x, width: m.width };
  });
}

/**
 * Renders the multi-tier sticky timeline header. Tiers adapt to the zoom level so labels stay
 * legible and the node count stays bounded:
 * - day / week: [years] + months + one cell per day (click a day to filter tasks on that date)
 * - month: [years] + months + ISO weeks
 * - quarter / year: [years] + quarters + short month names
 * (on zoomed-out tiers a click filters on the day under the pointer; an active filter shows as a pin)
 *
 * Supports dual-mode smooth column resizing:
 * 1. Grabbing visible col-resize handles on column borders.
 * 2. Holding and dragging horizontally anywhere on column headers to smoothly stretch/compress timeline zoom.
 * All cell interactions are delegated to the header element (a handful of listeners in total).
 */
export function renderTimelineHeader(header: GridHeader, options?: TimelineHeaderOptions): HTMLElement {
  const timelineHeader = document.createElement("div");
  timelineHeader.className = "jantt-timeline-header";
  timelineHeader.style.height = `${header.totalHeight}px`;

  const currentDayW = options?.dayWidth || header.days[0]?.width || 36;
  const zoomable = Boolean(options?.onColumnResize);
  const scale = header.scale;
  const timeFormat = header.timeFormat || "12h";
  const showDays = scale === "day" || scale === "week";
  const isSubDay = scale === "hour" || scale === "minute";
  const isCompactWeek = scale === "week";
  const window = header.totalWidth > 5000 && options?.visibleXRange
    ? { ...options.visibleXRange, totalWidth: header.totalWidth } : undefined;

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

  if (isSubDay) {
    const subTicks = header.subTicks || [];
    const winStart = subTicks.length > 0 ? subTicks[0].x : 0;
    const winEnd =
      subTicks.length > 0 ? subTicks[subTicks.length - 1].x + subTicks[subTicks.length - 1].width : Math.min(header.totalWidth, 4800);

    // Top sub-day tier: Days (at Hour scale) or Hours (at Minute scale)
    const upperRow = document.createElement("div");
    upperRow.className = "jantt-header-months is-subday";
    upperRow.style.width = `${header.totalWidth}px`;

    if (scale === "hour") {
      header.days.forEach((d) => {
        if (d.x + d.width < winStart || d.x > winEnd) return;
        const isSelected = options?.selectedDate === d.dateStr;
        const dCell = document.createElement("div");
        dCell.className = `jantt-month-cell jantt-subday-upper is-day-header ${d.isToday ? "is-today" : ""} ${
          isSelected ? "is-date-selected" : ""
        }`.trim();
        dCell.style.left = `${d.x}px`;
        dCell.style.width = `${d.width}px`;
        dCell.title = `${d.dateStr} (Click to show only tasks on this date)`;
        dCell.setAttribute("data-date", d.dateStr);
        dCell.dataset.zoomCell = "";
        dCell.dataset.cellDays = "1";
        if (options?.onDateClick) {
          dCell.style.cursor = "pointer";
          dCell.setAttribute("role", "button");
          dCell.setAttribute("aria-pressed", String(isSelected));
          dCell.tabIndex = -1;
        }
        const mIdx = parseInt(d.dateStr.slice(5, 7), 10) - 1;
        const label = document.createElement("span");
        label.className = "jantt-tier-label";
        label.textContent = `${d.dayName}, ${MONTH_SHORT[mIdx]} ${d.dayOfMonth}${d.isToday ? " · Today" : ""}`;
        dCell.appendChild(label);
        if (zoomable) {
          const handle = document.createElement("div");
          handle.className = "jantt-col-resize-handle";
          handle.title = "Drag to resize column width / zoom timeline";
          dCell.appendChild(handle);
        }
        upperRow.appendChild(dCell);
      });
    } else {
      const hourW = currentDayW / 24;
      const pxPerMin = currentDayW / MINUTES_PER_DAY;
      const startHourIdx = Math.max(0, Math.floor(winStart / Math.max(hourW, 1)));
      const endHourIdx = Math.min(header.totalDays * 24 - 1, Math.ceil(winEnd / Math.max(hourW, 1)), startHourIdx + 120);
      for (let hIdx = startHourIdx; hIdx <= endHourIdx; hIdx++) {
        const dayIdx = Math.floor(hIdx / 24);
        const hour24 = hIdx % 24;
        const dateStr = addDays(header.startDate, dayIdx);
        const dayInfo = header.days[dayIdx];
        const mIdx = parseInt(dateStr.slice(5, 7), 10) - 1;
        const dayNum = parseInt(dateStr.slice(8, 10), 10);
        const showDatePrefix = hour24 === 0 || hIdx === startHourIdx || hourW >= 110;
        const timeText = formatTimeOfDay(hour24, 0, timeFormat, true);
        const hCell = document.createElement("div");
        hCell.className = `jantt-month-cell jantt-subday-upper is-hour-header ${hour24 === 0 ? "is-day-start" : ""} ${
          dayInfo?.isToday ? "is-today" : ""
        }`.trim();
        hCell.style.left = `${hIdx * 60 * pxPerMin}px`;
        hCell.style.width = `${hourW}px`;
        hCell.title = `${formatHumanDate(dateStr, false, timeFormat)} · ${timeText}`;
        hCell.dataset.zoomCell = "";
        hCell.dataset.cellDays = String(1 / 24);
        const label = document.createElement("span");
        label.className = "jantt-tier-label";
        label.textContent = showDatePrefix ? `${MONTH_SHORT[mIdx]} ${dayNum} · ${timeText}` : timeText;
        hCell.appendChild(label);
        if (zoomable && hourW >= 18) {
          const handle = document.createElement("div");
          handle.className = "jantt-col-resize-handle";
          handle.title = "Drag to resize column width / zoom timeline";
          hCell.appendChild(handle);
        }
        upperRow.appendChild(hCell);
      }
    }
    timelineHeader.appendChild(upperRow);

    // Lower sub-day tier: Hours (at Hour scale) or Minutes (at Minute scale)
    const lowerRow = document.createElement("div");
    lowerRow.className = "jantt-header-days is-subday";
    lowerRow.style.width = `${header.totalWidth}px`;
    const firstTickMin = subTicks.length > 1 ? Math.round((subTicks[1].x - subTicks[0].x) / (currentDayW / MINUTES_PER_DAY)) : 60;
    const cellDaysVal = Math.max(1 / 1440, firstTickMin / MINUTES_PER_DAY);
    subTicks.forEach((tick) => {
      const tCell = document.createElement("div");
      tCell.className = `jantt-subtick-cell ${tick.isDayStart ? "is-day-start" : ""} ${
        tick.isHourStart ? "is-hour-start" : ""
      } ${tick.isMajor ? "is-major" : ""}`.trim();
      tCell.style.left = `${tick.x}px`;
      tCell.style.width = `${tick.width}px`;
      tCell.title = tick.title;
      tCell.dataset.zoomCell = "";
      tCell.dataset.cellDays = String(cellDaysVal);
      const text = document.createElement("span");
      text.className = "jantt-tier-label";
      text.textContent = tick.label;
      tCell.appendChild(text);
      if (zoomable && tick.width >= 16) {
        const handle = document.createElement("div");
        handle.className = "jantt-col-resize-handle";
        handle.title = "Drag to resize column width / zoom timeline";
        tCell.appendChild(handle);
      }
      lowerRow.appendChild(tCell);
    });
    timelineHeader.appendChild(lowerRow);
  } else if (showDays) {
    // 2. Months tier (active grid granularity is days, so border drags match day-column responsiveness)
    timelineHeader.appendChild(
      buildTierRow("jantt-header-months", "jantt-month-cell", monthCells(header, false), zoomable, 1, window)
    );

    // 3. Days tier (click to filter; roving tabindex keeps the header a single tab stop)
    const daysRow = document.createElement("div");
    daysRow.className = "jantt-header-days";
    if (window) {
      daysRow.classList.add("is-windowed");
      daysRow.style.width = `${header.totalWidth}px`;
    }
    const visibleDays = window ? header.days.filter(d => d.dateStr === options?.selectedDate ||
      (d.x + d.width >= window.startX && d.x <= window.endX)) : header.days;
    const focusDate =
      visibleDays.find((d) => d.dateStr === options?.selectedDate)?.dateStr ||
      visibleDays.find((d) => d.isToday)?.dateStr ||
      visibleDays[0]?.dateStr;

    let lastRenderedLabelX = -999;
    const minLabelSpacing = 28; // Minimum pixels between labels to prevent ANY visual overlap

    visibleDays.forEach((d) => {
      const dCell = document.createElement("div");
      if (window) dCell.style.left = `${d.x}px`;
      const isBoundary = Boolean(d.isTaskBoundary);
      const isSelected = options?.selectedDate === d.dateStr;
      dCell.className = `jantt-day-cell ${d.isWeekend ? "is-weekend" : ""} ${d.isToday ? "is-today" : ""} ${
        isBoundary ? "is-task-boundary" : ""
      } ${isSelected ? "is-date-selected" : ""}`;
      dCell.style.width = `${d.width}px`;
      dCell.title = isSelected
        ? `${d.dateStr} (Active filter - click to show all dates)`
        : isBoundary
        ? `${d.dateStr} (Task boundary date - click to show only tasks on this date)`
        : `${d.dateStr} (Click to show only tasks on this date)`;
      dCell.setAttribute("data-date", d.dateStr);
      dCell.dataset.zoomCell = "";
      dCell.dataset.cellDays = "1";

      if (options?.onDateClick) {
        dCell.style.cursor = "pointer";
        dCell.setAttribute("role", "button");
        dCell.setAttribute("aria-pressed", String(isSelected));
        dCell.setAttribute("aria-label", isSelected ? `${d.dateStr}, active date filter` : `Show tasks on ${d.dateStr}`);
        dCell.tabIndex = d.dateStr === focusDate ? 0 : -1;
      }

      // Smart collision prevention: prevents labels from colliding or smushing together when column widths contract
      if (isCompactWeek || d.width < 26) {
        const wantsLabel =
          isSelected ||
          d.isToday ||
          (d.width >= 16 && (isBoundary || d.dayOfMonth === 1)) ||
          d.dayOfWeek === 1;

        if (wantsLabel && (isSelected || d.x - lastRenderedLabelX >= minLabelSpacing)) {
          dCell.appendChild(dayLabel(`jantt-day-num${isBoundary || isSelected ? " is-boundary-num" : ""}`, d.label));
          lastRenderedLabelX = d.x;
        }
      } else {
        // Standard Day scale with comfortable cell width:
        const todayCls = d.isToday ? " is-today" : "";
        if (d.width >= 96) {
          const mIdx = parseInt(d.dateStr.slice(5, 7), 10) - 1;
          dCell.append(
            dayLabel(`jantt-day-name${todayCls}`, `${d.dayName} · ${MONTH_SHORT[mIdx]}`),
            dayLabel(`jantt-day-num${todayCls}`, d.label)
          );
        } else if (d.width >= 32) {
          dCell.append(dayLabel(`jantt-day-name${todayCls}`, d.dayName), dayLabel(`jantt-day-num${todayCls}`, d.label));
        } else {
          dCell.appendChild(dayLabel(`jantt-day-num${todayCls}`, d.label));
        }
        lastRenderedLabelX = d.x;
      }

      // Draggable resize handle for day tier (where the cell is at least 6px wide)
      if (zoomable && d.width >= 6) {
        const dResizeHandle = document.createElement("div");
        dResizeHandle.className = "jantt-col-resize-handle";
        dResizeHandle.title = "Drag to resize column width / zoom timeline";
        if (d.width < 18) {
          dResizeHandle.style.width = "6px";
          dResizeHandle.style.right = "-3px";
        }
        dCell.appendChild(dResizeHandle);
      }

      daysRow.appendChild(dCell);
    });

    timelineHeader.appendChild(daysRow);
  } else if (scale === "month") {
    timelineHeader.appendChild(
      buildTierRow("jantt-header-months", "jantt-month-cell", monthCells(header, false), false, 30)
    );
    const weeks: TierCell[] = header.weeks.map((w) => ({
      label: w.label,
      title: `${w.label.replace("Wk", "Week")} (drag to zoom)`,
      x: w.x,
      width: w.width
    }));
    timelineHeader.appendChild(buildTierRow("jantt-header-days", "jantt-week-cell", weeks, zoomable, 7));
  } else {
    timelineHeader.appendChild(
      buildTierRow(
        "jantt-header-months",
        "jantt-month-cell",
        computeQuarters(header.days, !header.spansMultipleYears),
        false,
        90
      )
    );
    timelineHeader.appendChild(
      buildTierRow("jantt-header-days", "jantt-month-cell is-compact", monthCells(header, true), zoomable, 30)
    );
  }

  // Zoomed-out tiers have no per-day cells: pin the active date filter so it stays visible/clearable.
  if (!showDays && options?.selectedDate) {
    const day = header.days.find((d) => d.dateStr === options.selectedDate);
    if (day) {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "jantt-header-date-pin";
      pin.style.left = `${day.x + day.width / 2}px`;
      pin.textContent = day.dateStr;
      pin.title = `${day.dateStr} (Active filter - click to show all dates)`;
      pin.setAttribute("aria-label", `Clear date filter ${day.dateStr}`);
      if (options.onDateClick) {
        pin.addEventListener("click", (e) => {
          e.stopPropagation();
          options.onDateClick!(day.dateStr);
        });
      }
      timelineHeader.appendChild(pin);
    }
  }

  // Delegated interactions -------------------------------------------------------------------
  let didMoveDrag = false;

  if (zoomable) {
    timelineHeader.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement;
      const cellEl = target.closest<HTMLElement>("[data-zoom-cell]");
      const cellDays = Number(cellEl?.dataset.cellDays) || 1;
      if (target.closest(".jantt-col-resize-handle")) {
        startColumnDragSession(
          e,
          currentDayW,
          "handle",
          cellDays,
          options!.onColumnResize,
          undefined,
          options!.onColumnResizeStart,
          options!.onColumnResizeEnd,
          options!.signal
        );
        return;
      }
      if (!cellEl) return;
      // Allow holding a column to stretch / zoom, while preserving clean clicks to filter dates
      didMoveDrag = false;
      startColumnDragSession(
        e,
        currentDayW,
        "cell",
        cellDays,
        options!.onColumnResize,
        (moved) => {
          didMoveDrag = moved;
        },
        options!.onColumnResizeStart,
        options!.onColumnResizeEnd,
        options!.signal
      );
    });
  }

  if (options?.onDateClick) {
    const onDateClick = options.onDateClick;

    // Zoomed-out tiers have no per-day cells: a click resolves the day under the pointer instead.
    const dateAtClientX = (clientX: number): string | undefined => {
      const dayW = header.days[0]?.width || 0;
      if (dayW <= 0) return undefined;
      const index = Math.floor((clientX - timelineHeader.getBoundingClientRect().left) / dayW);
      return header.days[Math.max(0, Math.min(header.days.length - 1, index))]?.dateStr;
    };

    // Click on date column body to filter date (suppressed if user dragged to zoom)
    timelineHeader.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".jantt-col-resize-handle")) return;
      const suppress = didMoveDrag;
      didMoveDrag = false;
      if (suppress) return;
      const dateStr =
        target.closest<HTMLElement>("[data-date]")?.dataset.date ??
        (!showDays && !isSubDay && target.closest("[data-zoom-cell]") ? dateAtClientX(e.clientX) : undefined);
      if (!dateStr) return;
      e.stopPropagation();
      onDateClick(dateStr);
    });

    timelineHeader.addEventListener("keydown", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".jantt-day-cell[data-date]");
      if (!cell) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onDateClick(cell.dataset.date!);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const next = (e.key === "ArrowLeft" ? cell.previousElementSibling : cell.nextElementSibling) as HTMLElement | null;
        if (next?.dataset.date) {
          e.preventDefault();
          cell.tabIndex = -1;
          next.tabIndex = 0;
          next.focus();
        }
      }
    });
  }

  // 4. Header-Anchored Today Marker Pin (Systematic UX Alignment)
  // Positioned in the sticky timeline header so it permanently stays in view when scrolling,
  // aligns with the vertical today guide line, and never gets occluded by or obstructs task bars.
  if (header.todayX !== null && options?.showToday !== false && options?.showTodayTag) {
    const todayMarker = document.createElement("div");
    todayMarker.className = "jantt-header-today-marker";
    todayMarker.style.left = `${header.todayX}px`;

    const todayDay = header.days.find((d) => d.isToday);
    const todayDateStr = todayDay?.dateStr || getDatePart(header.startDate);

    todayMarker.setAttribute("data-today-date", todayDateStr);
    todayMarker.title = todayDateStr
      ? `Today: ${todayDateStr} (Click to filter tasks active today)`
      : "Today (Click to filter tasks active today)";

    todayMarker.innerHTML = `
      <span class="jantt-header-today-pill">Today</span>
      <span class="jantt-header-today-arrow"></span>
    `;

    if (options?.onDateClick && todayDateStr) {
      todayMarker.addEventListener("click", (e) => {
        e.stopPropagation();
        options.onDateClick!(todayDateStr);
      });
    }

    timelineHeader.appendChild(todayMarker);
  }

  return timelineHeader;
}
