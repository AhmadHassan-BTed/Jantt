import React, { useEffect, useRef } from "react";
import { JanttData, Task, ViewportOptions, JanttOptions, renderJantt, JanttInstance } from "@jantt/core";

export interface JanttProps {
  /** Access the mounted renderer for input devices with their own gesture lifecycle. */
  onInstance?: (instance: JanttInstance | null) => void;
  data: JanttData;
  onChange?: (draft: JanttData) => void;
  onCommit?: (final: JanttData) => void;
  onViewportChange?: (viewport: ViewportOptions) => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void;
  onTaskAdd?: (newTask: Task) => void;
  /** Delegate the full detail sheet to a host that manages navigation and undo. */
  onOpenTaskDetails?: (task: Task) => void;
  onLinkSnap?: (taskId: string) => void;
  onLinkCreate?: (fromTaskId: string, toTaskId: string) => void;
  onLinkDelete?: (fromTaskId: string, toTaskId: string) => void;
  sidebarContainer?: HTMLElement | string;
  selectedDate?: string | null;
  showDateFilterBadge?: boolean;
  filterTasksByDate?: boolean;
  showToolbar?: boolean;
  autoCascade?: boolean;
  /** Initial toolbar search text; later changes are made by the user in the toolbar. */
  searchQuery?: string;
  onDateClick?: (dateStr: string) => void;
  onClearDateFilter?: () => void;
  onDayWidthChange?: (dayWidth: number) => void;
  renderDetail?: (
    task: Task,
    container: HTMLElement,
    api: {
      updateTask: (patch: Partial<Task>) => void;
      close: () => void;
    }
  ) => void;
  viewport?: ViewportOptions;
  theme?: Record<string, string>;
  themeClassName?: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly?: boolean;
  onOpenAutoSave?: () => void;
  onImportJson?: () => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
  onError?: (error: Error) => void;
  disableDragOnTouch?: boolean;
  isMobile?: boolean;
  /** When true (mobile), single tap selects a task and double tap opens its detail drawer. */
  mobileDoubleTapToOpen?: boolean;
  /** Hides the left Task & Category column so the timeline expands edge-to-edge with inline labels. */
  hideLabelColumn?: boolean;
  /** Increment this counter to smoothly scroll the timeline viewport to the Today line. */
  scrollToTodayTrigger?: number;
  /** Optional scroll position restored when the chart mounts (e.g. returning from another view). */
  initialScroll?: { scrollLeft: number; scrollTop: number } | null;
  /** Invoked on unmount with the final scroll position so hosts can remember viewport position across views. */
  onSaveScroll?: (pos: { scrollLeft: number; scrollTop: number }) => void;
}

/**
 * Viewport keys the engine treats as live state (the toolbar, zoom and date filter change them).
 * Forwarding one again on an unrelated update would undo the user's change.
 */
const STATEFUL_VIEWPORT_KEYS: (keyof ViewportOptions)[] = [
  "scale",
  "dayWidth",
  "linkRouting",
  "rowHeight",
  "rowHeightMode",
  "showCriticalPath",
  "showBaselines",
  "autoCascade",
  "selectedDate"
];

/** Scalar viewport props that trigger an update when they change. */
const WATCHED_VIEWPORT_KEYS: (keyof ViewportOptions)[] = [
  ...STATEFUL_VIEWPORT_KEYS,
  "labelWidth",
  "headerHeight",
  "startDate",
  "endDate",
  "showToday",
  "showTodayTag",
  "showWeekends",
  "showDateFilterBadge",
  "filterTasksByDate"
];

/**
 * Returns the viewport to forward on update, or null when no viewport prop changed. Stateful keys
 * whose prop did not change since the last forward are sent as undefined, which the engine reads
 * as "keep the current value".
 */
function viewportUpdate(
  prev: ViewportOptions | undefined,
  next: ViewportOptions | undefined,
  engineDayWidth: number,
  emittedDayWidths: Set<number>
): ViewportOptions | null {
  const changed = new Set(WATCHED_VIEWPORT_KEYS.filter((key) => prev?.[key] !== next?.[key]));
  // The engine already applied this zoom (reported through onDayWidthChange/onViewportChange).
  // Ignoring stale echoes (e.g. async React commit during rapid wheel zoom) prevents rubber-banding.
  if (
    changed.has("dayWidth") &&
    next?.dayWidth !== undefined &&
    (next.dayWidth === engineDayWidth || emittedDayWidths.has(next.dayWidth))
  ) {
    changed.delete("dayWidth");
    changed.delete("scale");
    if (next.dayWidth === engineDayWidth) emittedDayWidths.clear();
    else emittedDayWidths.delete(next.dayWidth);
  } else if (changed.has("dayWidth") && next?.dayWidth === undefined && next?.scale !== undefined) {
    // Clearing an explicit dayWidth (e.g. clicking the active scale preset) snaps back to that scale's width.
    changed.add("scale");
    emittedDayWidths.clear();
  }
  if (changed.size === 0) return null;

  const forwarded: ViewportOptions = { ...next };
  STATEFUL_VIEWPORT_KEYS.forEach((key) => {
    if (!changed.has(key)) delete forwarded[key];
  });
  return forwarded;
}

interface SyncedProps {
  data: JanttData;
  viewport?: ViewportOptions;
  selectedDate?: string | null;
  autoCascade?: boolean;
  searchQuery?: string;
  config: unknown[];
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const Jantt: React.FC<JanttProps> = ({
  data,
  onInstance,
  onChange,
  onCommit,
  onViewportChange,
  onTaskClick,
  onTaskDelete,
  onTaskAdd,
  onOpenTaskDetails,
  onLinkSnap,
  onLinkCreate,
  onLinkDelete,
  sidebarContainer,
  selectedDate,
  showDateFilterBadge,
  filterTasksByDate,
  showToolbar = true,
  autoCascade,
  searchQuery,
  onDateClick,
  onClearDateFilter,
  onDayWidthChange,
  renderDetail,
  viewport,
  theme,
  themeClassName,
  className,
  style,
  readOnly,
  onOpenAutoSave,
  onImportJson,
  onExportJson,
  onExportCsv,
  onError,
  disableDragOnTouch,
  isMobile,
  mobileDoubleTapToOpen,
  hideLabelColumn,
  scrollToTodayTrigger,
  initialScroll,
  onSaveScroll
}) => {
  const onInstanceRef = useRef(onInstance);
  onInstanceRef.current = onInstance;
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<JanttInstance | null>(null);
  /** Props as last handed to the engine; null before the first mount attempt. */
  const syncedRef = useRef<SyncedProps | null>(null);
  /**
   * Plan the engine emitted most recently: receiving it back as `data` needs no update. Cleared
   * whenever other data is applied, so returning to it later (e.g. redo) is applied again.
   */
  const lastEmittedRef = useRef<JanttData | null>(null);
  /** Zoom widths recently emitted by the engine, so delayed React commits never snap the engine backwards. */
  const emittedDayWidthsRef = useRef<Set<number>>(new Set());
  const lastTodayTriggerRef = useRef(scrollToTodayTrigger);
  const initialScrollRef = useRef(initialScroll);
  const onSaveScrollRef = useRef(onSaveScroll);
  onSaveScrollRef.current = onSaveScroll;

  // Keep latest callbacks in ref to eliminate stale closure bugs
  const callbacksRef = useRef({
    onChange,
    onCommit,
    onViewportChange,
    onTaskClick,
    onTaskDelete,
    onTaskAdd,
    onOpenTaskDetails,
    onLinkSnap,
    onLinkCreate,
    onLinkDelete,
    onDateClick,
    onClearDateFilter,
    onDayWidthChange,
    renderDetail,
    onOpenAutoSave,
    onImportJson,
    onExportJson,
    onExportCsv,
    onError
  });

  callbacksRef.current = {
    onChange,
    onCommit,
    onViewportChange,
    onTaskClick,
    onTaskDelete,
    onTaskAdd,
    onOpenTaskDetails,
    onLinkSnap,
    onLinkCreate,
    onLinkDelete,
    onDateClick,
    onClearDateFilter,
    onDayWidthChange,
    renderDetail,
    onOpenAutoSave,
    onImportJson,
    onExportJson,
    onExportCsv,
    onError
  };

  const serializedTheme = theme ? JSON.stringify(theme) : "";

  // Options that are plain configuration: re-applying an unchanged value is harmless.
  const config: unknown[] = [
    serializedTheme,
    themeClassName,
    readOnly,
    sidebarContainer,
    showDateFilterBadge,
    filterTasksByDate,
    showToolbar,
    disableDragOnTouch,
    isMobile,
    mobileDoubleTapToOpen,
    hideLabelColumn,
    Boolean(renderDetail),
    Boolean(onOpenTaskDetails),
    Boolean(onOpenAutoSave),
    Boolean(onImportJson),
    Boolean(onExportJson),
    Boolean(onExportCsv)
  ];

  const reportError = (error: unknown) => {
    const err = toError(error);
    if (callbacksRef.current.onError) callbacksRef.current.onError(err);
    else console.error("[@jantt/react] Jantt error:", err);
  };

  const getForwardingOptions = (): JanttOptions => ({
    theme,
    themeClassName,
    readOnly,
    sidebarContainer,
    showDateFilterBadge,
    filterTasksByDate,
    showToolbar,
    disableDragOnTouch,
    isMobile,
    mobileDoubleTapToOpen,
    hideLabelColumn,
    onDateClick: (dateStr: string) => callbacksRef.current.onDateClick?.(dateStr),
    onClearDateFilter: () => callbacksRef.current.onClearDateFilter?.(),
    onDayWidthChange: (w: number) => {
      emittedDayWidthsRef.current.add(w);
      callbacksRef.current.onDayWidthChange?.(w);
    },
    onChange: (draft: JanttData) => {
      lastEmittedRef.current = draft;
      callbacksRef.current.onChange?.(draft);
    },
    onCommit: (final: JanttData) => {
      lastEmittedRef.current = final;
      callbacksRef.current.onCommit?.(final);
    },
    onViewportChange: (vp: ViewportOptions) => {
      if (vp.dayWidth !== undefined) emittedDayWidthsRef.current.add(vp.dayWidth);
      callbacksRef.current.onViewportChange?.(vp);
    },
    onTaskClick: onTaskClick ? (t: Task) => callbacksRef.current.onTaskClick?.(t) : undefined,
    onTaskDelete: onTaskDelete ? (id: string) => callbacksRef.current.onTaskDelete?.(id) : undefined,
    onTaskAdd: onTaskAdd ? (newTask: Task) => callbacksRef.current.onTaskAdd?.(newTask) : undefined,
    onOpenTaskDetails: onOpenTaskDetails ? task => callbacksRef.current.onOpenTaskDetails?.(task) : undefined,
    onLinkSnap: id => callbacksRef.current.onLinkSnap?.(id),
    onLinkCreate: onLinkCreate ? (fromId: string, toId: string) => callbacksRef.current.onLinkCreate?.(fromId, toId) : undefined,
    onLinkDelete: onLinkDelete ? (fromId: string, toId: string) => callbacksRef.current.onLinkDelete?.(fromId, toId) : undefined,
    // Optional features are forwarded only when provided: the engine shows the detail renderer and
    // the toolbar's data menu entries based on their presence.
    renderDetail: renderDetail
      ? (task, container, api) => callbacksRef.current.renderDetail?.(task, container, api)
      : undefined,
    onOpenAutoSave: onOpenAutoSave ? () => callbacksRef.current.onOpenAutoSave?.() : undefined,
    onImportJson: onImportJson ? () => callbacksRef.current.onImportJson?.() : undefined,
    onExportJson: onExportJson ? () => callbacksRef.current.onExportJson?.() : undefined,
    onExportCsv: onExportCsv ? () => callbacksRef.current.onExportCsv?.() : undefined,
    onError: reportError
  });

  const mount = () => {
    const container = containerRef.current;
    if (!container) return;
    syncedRef.current = { data, viewport, selectedDate, autoCascade, searchQuery, config };
    lastEmittedRef.current = null;
    try {
      instanceRef.current = renderJantt(container, data, {
        ...getForwardingOptions(),
        viewport,
        selectedDate,
        autoCascade,
        searchQuery
      });
      onInstanceRef.current?.(instanceRef.current);
      if (initialScrollRef.current && (initialScrollRef.current.scrollLeft > 0 || initialScrollRef.current.scrollTop > 0)) {
        instanceRef.current.setScrollPosition(initialScrollRef.current.scrollLeft, initialScrollRef.current.scrollTop);
      }
    } catch (error) {
      instanceRef.current = null;
      reportError(error);
    }
  };

  // Mount/unmount lifecycle
  useEffect(() => {
    mount();
    return () => {
      if (instanceRef.current) {
        onSaveScrollRef.current?.(instanceRef.current.getScrollPosition());
      }
      onInstanceRef.current?.(null);
      instanceRef.current?.destroy();
      instanceRef.current = null;
      syncedRef.current = null;
    };
  }, []);

  // Forward prop changes. Runs after the mount effect in the same commit, where it finds nothing
  // changed, so the initial render is not repeated.
  useEffect(() => {
    const prev = syncedRef.current;
    if (!prev) return;

    const instance = instanceRef.current;
    const dataChanged = data !== prev.data && data !== lastEmittedRef.current;
    const configChanged = config.some((value, i) => value !== prev.config[i]);
    const viewportChanges = viewportUpdate(
      prev.viewport,
      viewport,
      instance ? instance.getDayWidth() : NaN,
      emittedDayWidthsRef.current
    );
    const selectedDateChanged = selectedDate !== prev.selectedDate;
    const autoCascadeChanged = autoCascade !== prev.autoCascade;
    const searchQueryChanged = searchQuery !== prev.searchQuery;
    if (
      !dataChanged &&
      !configChanged &&
      !viewportChanges &&
      !selectedDateChanged &&
      !autoCascadeChanged &&
      !searchQueryChanged
    ) {
      syncedRef.current = { ...prev, data, viewport, searchQuery };
      return;
    }

    if (!instance) {
      mount(); // the previous mount failed: retry with the new props
      return;
    }

    syncedRef.current = { data, viewport, selectedDate, autoCascade, searchQuery, config };
    const options: Partial<JanttOptions> = getForwardingOptions();
    if (viewportChanges) options.viewport = viewportChanges;
    if (selectedDateChanged) options.selectedDate = selectedDate;
    if (autoCascadeChanged) options.autoCascade = autoCascade;
    if (searchQueryChanged) options.searchQuery = searchQuery;
    if (dataChanged) lastEmittedRef.current = null;
    try {
      // Unchanged data means the engine's own plan is the newest; never revert it to the prop.
      instance.update(dataChanged ? data : instance.getData(), options);
    } catch (error) {
      reportError(error);
    }
  }, [
    data,
    ...WATCHED_VIEWPORT_KEYS.map((key) => viewport?.[key]),
    selectedDate,
    autoCascade,
    searchQuery,
    ...config
  ]);

  // Scroll to Today line when host increments scrollToTodayTrigger
  useEffect(() => {
    if (scrollToTodayTrigger !== undefined && scrollToTodayTrigger !== lastTodayTriggerRef.current) {
      lastTodayTriggerRef.current = scrollToTodayTrigger;
      instanceRef.current?.scrollToToday();
    }
  }, [scrollToTodayTrigger]);

  return (
    <div
      ref={containerRef}
      className={`jantt-react-wrapper ${className || ""}`.trim()}
      style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", flex: "1 1 auto", ...style }}
    />
  );
};

export default Jantt;
