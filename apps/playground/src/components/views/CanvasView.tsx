import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { calculateCriticalPath, type JanttData, type Task, type ThemeDefinition } from "@jantt/core";
import { CanvasTimelineRenderer, type CanvasColorConfig, type ViewportState } from "@jantt/render-canvas";
import {
  Zap,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Activity,
  Layers,
  Compass,
  Maximize2
} from "lucide-react";

export interface CanvasViewProps {
  parsedData: JanttData;
  onTaskClick?: (task: Task) => void;
  activeTheme?: ThemeDefinition;
  /** Read-only room viewers get no mutating controls. */
  isViewer?: boolean;
  /**
   * Opens `data` as a new local plan. The debug benchmark only ever uses this, so it can never
   * overwrite (or sync into) the active plan or room. Without it the benchmark is not offered.
   */
  onOpenScratchPlan?: (title: string, data: JanttData) => void;
}

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 44;
const MIN_DAY_WIDTH = 12;
const MAX_DAY_WIDTH = 140;
const DEFAULT_DAY_WIDTH = 36;
const ZOOM_STEP = 6;
const MINIMAP_WIDTH = 220;
const MINIMAP_HEIGHT = 110;
const DRAG_THRESHOLD_PX = 3;
const KEYBOARD_PAN_PX = 60;
const TOOLTIP_WIDTH = 280;
const TOOLTIP_HEIGHT = 110;

/** The synthetic 10k-task stress test is a developer tool: only offered with `?debug` in the URL. */
const BENCHMARK_ENABLED =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

const BENCHMARK_COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4"];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const DARK_COLORS: CanvasColorConfig = {
  background: "#080D18",
  rowAlt: "rgba(255, 255, 255, 0.02)",
  border: "#1E293B",
  text: "#F8FAFC",
  textMuted: "#64748B",
  primary: "#38BDF8",
  critical: "#EF4444",
  gridLine: "rgba(255, 255, 255, 0.05)"
};

const LIGHT_COLORS: CanvasColorConfig = {
  background: "#FFFFFF",
  rowAlt: "rgba(0, 0, 0, 0.02)",
  border: "#E2E8F0",
  text: "#0F172A",
  textMuted: "#64748B",
  primary: "#2563EB",
  critical: "#EF4444",
  gridLine: "rgba(0, 0, 0, 0.05)"
};

/** Canvas palette from the active theme's CSS variables, falling back per color mode. */
function resolveCanvasColors(theme?: ThemeDefinition): CanvasColorConfig {
  const base = theme?.mode === "dark" ? DARK_COLORS : LIGHT_COLORS;
  const vars = theme?.vars || {};
  const pick = (name: string, fallback: string) => {
    const v = vars[name];
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
  };
  return {
    ...base,
    background: pick("--jantt-bg", base.background),
    border: pick("--jantt-border", base.border),
    text: pick("--jantt-text", base.text),
    textMuted: pick("--jantt-text-muted", base.textMuted),
    critical: pick("--jantt-critical", base.critical),
    gridLine: pick("--jantt-grid-line", base.gridLine)
  };
}

export const CanvasView: React.FC<CanvasViewProps> = ({
  parsedData,
  onTaskClick,
  activeTheme,
  isViewer = false,
  onOpenScratchPlan
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasTimelineRenderer | null>(null);

  // Pan/zoom live in refs: panning repaints the canvas without re-rendering React.
  const viewRef = useRef({ scrollX: 0, scrollY: 0, dayWidth: DEFAULT_DAY_WIDTH });
  /** Day width the renderer was last given; zooming only updates `viewRef` until it is needed. */
  const appliedDayWidthRef = useRef(DEFAULT_DAY_WIDTH);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; scrollX: number; scrollY: number; moved: boolean } | null>(null);
  const minimapDragRef = useRef<number | null>(null);

  const [showCritical, setShowCritical] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredTask, setHoveredTask] = useState<{ task: Task; x: number; y: number } | null>(null);

  const showMinimapRef = useRef(showMinimap);
  showMinimapRef.current = showMinimap;
  const onTaskClickRef = useRef(onTaskClick);
  onTaskClickRef.current = onTaskClick;

  const liveTasks = useMemo(() => (parsedData.tasks || []).filter((t) => !t._deleted), [parsedData.tasks]);
  const targetDate = typeof parsedData.meta?.targetDate === "string" ? parsedData.meta.targetDate : undefined;
  const defaultGapDays = parsedData.meta?.defaultGapDays;

  // Real CPM (same engine as the Gantt and Budget views), never a priority heuristic.
  const criticalTaskIds = useMemo(
    () => calculateCriticalPath(liveTasks, { targetDate, defaultGapDays }).criticalTaskIds,
    [liveTasks, targetDate, defaultGapDays]
  );

  const renderPlan = useMemo<JanttData>(
    () => ({
      ...parsedData,
      tasks: liveTasks.map((t) => {
        const critical = criticalTaskIds.has(t.id);
        return Boolean(t.critical) === critical ? t : { ...t, critical };
      })
    }),
    [parsedData, liveTasks, criticalTaskIds]
  );

  const colors = useMemo(() => resolveCanvasColors(activeTheme), [activeTheme]);

  const getViewport = useCallback((): ViewportState | null => {
    const container = containerRef.current;
    if (!container) return null;
    return {
      scrollX: viewRef.current.scrollX,
      scrollY: viewRef.current.scrollY,
      width: container.clientWidth,
      height: container.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }, []);

  /**
   * Hands a pending zoom to the renderer. Changing the day width rebuilds its spatial index,
   * so a burst of wheel / pinch events costs one rebuild per frame instead of one per event.
   */
  const syncDayWidth = useCallback(() => {
    const renderer = rendererRef.current;
    const dayWidth = viewRef.current.dayWidth;
    if (renderer && appliedDayWidthRef.current !== dayWidth) {
      renderer.updateOptions({ dayWidth });
      appliedDayWidthRef.current = dayWidth;
    }
  }, []);

  /** Keeps the viewport inside the plan so users cannot pan into endless empty space. */
  const clampScroll = useCallback(() => {
    const renderer = rendererRef.current;
    const container = containerRef.current;
    if (!renderer || !container) return;
    syncDayWidth();
    const bounds = renderer.getWorldBounds();
    const maxX = Math.max(0, bounds.totalWorldWidth - container.clientWidth);
    const maxY = Math.max(0, bounds.totalWorldHeight - Math.max(0, container.clientHeight - HEADER_HEIGHT));
    viewRef.current.scrollX = clamp(viewRef.current.scrollX, 0, maxX);
    viewRef.current.scrollY = clamp(viewRef.current.scrollY, 0, maxY);
  }, [syncDayWidth]);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    clampScroll();
    const viewport = getViewport();
    if (!viewport || viewport.width === 0 || viewport.height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // HiDPI: the view only sizes the backing stores in device pixels (rounded, and only when they
    // change). The renderer owns the transform: render() scales by viewport.devicePixelRatio and
    // renderMinimap() by the minimap's backing/CSS ratio, so both draw in CSS pixels.
    const dpr = viewport.devicePixelRatio || 1;
    const backingWidth = Math.round(viewport.width * dpr);
    const backingHeight = Math.round(viewport.height * dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    renderer.render(ctx, viewport);

    const minimap = minimapCanvasRef.current;
    if (minimap && showMinimapRef.current) {
      const mmWidth = Math.round(MINIMAP_WIDTH * dpr);
      const mmHeight = Math.round(MINIMAP_HEIGHT * dpr);
      if (minimap.width !== mmWidth || minimap.height !== mmHeight) {
        minimap.width = mmWidth;
        minimap.height = mmHeight;
      }
      const mmCtx = minimap.getContext("2d");
      if (mmCtx) renderer.renderMinimap(mmCtx, MINIMAP_WIDTH, MINIMAP_HEIGHT, viewport);
    }
  }, [clampScroll, getViewport]);

  /** Coalesces any number of change notifications into one paint on the next frame. */
  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      renderFrame();
    });
  }, [renderFrame]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    },
    []
  );

  // Plan changes (also creates the renderer on first mount)
  useEffect(() => {
    if (!rendererRef.current) {
      appliedDayWidthRef.current = viewRef.current.dayWidth;
      rendererRef.current = new CanvasTimelineRenderer(renderPlan, {
        dayWidth: viewRef.current.dayWidth,
        rowHeight: ROW_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        showCriticalPath: showCritical,
        colors
      });
    } else {
      rendererRef.current.setPlan(renderPlan);
    }
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderPlan, scheduleRender]);

  // Visual option changes
  useEffect(() => {
    rendererRef.current?.updateOptions({ showCriticalPath: showCritical, colors });
    scheduleRender();
  }, [showCritical, colors, scheduleRender]);

  useEffect(() => {
    if (showMinimap) scheduleRender();
  }, [showMinimap, scheduleRender]);

  // Repaint on container resize (layout changes, browser zoom / DPR changes)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => scheduleRender());
    observer.observe(container);
    return () => observer.disconnect();
  }, [scheduleRender]);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      viewRef.current.scrollX += dx;
      viewRef.current.scrollY += dy;
      scheduleRender();
    },
    [scheduleRender]
  );

  /** Zooms while keeping the timeline point under `anchorX` (CSS px) fixed on screen. */
  const zoomTo = useCallback(
    (nextDayWidth: number, anchorX?: number) => {
      const container = containerRef.current;
      if (!rendererRef.current || !container) return;
      const view = viewRef.current;
      const next = Math.round(clamp(nextDayWidth, MIN_DAY_WIDTH, MAX_DAY_WIDTH) * 100) / 100;
      if (next === view.dayWidth) return;
      const anchor = anchorX ?? container.clientWidth / 2;
      view.scrollX = (view.scrollX + anchor) * (next / view.dayWidth) - anchor;
      view.dayWidth = next; // applied to the renderer by the next frame (syncDayWidth)
      setHoveredTask(null);
      scheduleRender();
    },
    [scheduleRender]
  );

  const resetView = useCallback(() => {
    viewRef.current.scrollX = 0;
    viewRef.current.scrollY = 0;
    zoomTo(DEFAULT_DAY_WIDTH, 0);
    scheduleRender();
  }, [zoomTo, scheduleRender]);

  const hitTestAt = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const viewport = getViewport();
    if (!container || !renderer || !viewport) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // The sticky date header covers rows scrolled beneath it.
    if (y < HEADER_HEIGHT) return null;
    syncDayWidth();
    const hit = renderer.hitTest(x, y, viewport);
    return hit && hit.hitType !== "none" ? { task: hit.task, x, y } : null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scrollX: viewRef.current.scrollX,
      scrollY: viewRef.current.scrollY,
      moved: false
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
        setIsPanning(true);
        setHoveredTask(null);
      }
      if (drag.moved) {
        viewRef.current.scrollX = drag.scrollX - dx;
        viewRef.current.scrollY = drag.scrollY - dy;
        scheduleRender();
      }
      return;
    }
    if (e.pointerType !== "mouse") return;
    const hit = hitTestAt(e.clientX, e.clientY);
    setHoveredTask((prev) => {
      if (!hit) return prev ? null : prev;
      if (prev && prev.task.id === hit.task.id && prev.x === hit.x && prev.y === hit.y) return prev;
      return hit;
    });
  };

  const endPointerDrag = (e: React.PointerEvent<HTMLCanvasElement>, isClick: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setIsPanning(false);
    if (isClick && !drag.moved) {
      const hit = hitTestAt(e.clientX, e.clientY);
      if (hit) onTaskClickRef.current?.(hit.task);
    }
  };

  // Native, non-passive wheel: plain wheel scrolls (Shift = horizontal), Ctrl/Cmd (+ pinch) zooms.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect();
        zoomTo(viewRef.current.dayWidth * Math.exp(-dy * 0.002), e.clientX - rect.left);
      } else if (e.shiftKey) {
        panBy(Math.abs(dx) > Math.abs(dy) ? dx : dy, 0);
      } else {
        panBy(dx, dy);
      }
      setHoveredTask(null);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [panBy, zoomTo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    const page = e.shiftKey && container ? container.clientWidth * 0.8 : KEYBOARD_PAN_PX;
    const handled = (() => {
      switch (e.key) {
        case "ArrowLeft":
          panBy(-page, 0);
          return true;
        case "ArrowRight":
          panBy(page, 0);
          return true;
        case "ArrowUp":
          panBy(0, -KEYBOARD_PAN_PX);
          return true;
        case "ArrowDown":
          panBy(0, KEYBOARD_PAN_PX);
          return true;
        case "+":
        case "=":
          zoomTo(viewRef.current.dayWidth + ZOOM_STEP);
          return true;
        case "-":
        case "_":
          zoomTo(viewRef.current.dayWidth - ZOOM_STEP);
          return true;
        case "0":
          resetView();
          return true;
        default:
          return false;
      }
    })();
    if (handled) e.preventDefault();
  };

  // Fit Entire Project to Viewport Width
  const handleFitToScreen = () => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!container || !renderer) return;
    const bounds = renderer.getWorldBounds();
    const availableWidth = container.clientWidth - 40;
    viewRef.current.scrollX = 0;
    viewRef.current.scrollY = 0;
    zoomTo(Math.floor(availableWidth / Math.max(1, bounds.totalDays)), 0);
    scheduleRender();
  };

  const navigateViaMinimap = (clientX: number, clientY: number) => {
    const minimap = minimapCanvasRef.current;
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!minimap || !container || !renderer) return;

    const rect = minimap.getBoundingClientRect();
    const ratioX = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const ratioY = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    syncDayWidth();
    const bounds = renderer.getWorldBounds();
    viewRef.current.scrollX = ratioX * bounds.totalWorldWidth - container.clientWidth / 2;
    viewRef.current.scrollY = ratioY * bounds.totalWorldHeight - (container.clientHeight - HEADER_HEIGHT) / 2;
    scheduleRender();
  };

  // Synthetic stress test (`?debug` only). It opens as a separate local scratch plan, so the active
  // plan and room are never touched and no confirmation is needed.
  const handleGenerateBenchmark = (count: number) => {
    if (isViewer || !onOpenScratchPlan) return;
    const categories = ["Engineering", "Infrastructure", "AI Model", "Testing", "Security", "Deployment"];
    const generatedTasks: Task[] = [];
    const baseDate = new Date("2026-03-01");

    for (let i = 1; i <= count; i++) {
      const dayOffset = Math.floor(i / 15);
      const duration = (i % 7) + 1;
      const startDate = new Date(baseDate.getTime() + dayOffset * 86400000);
      const endDate = new Date(startDate.getTime() + duration * 86400000);

      generatedTasks.push({
        id: `BENCH-${i}`,
        name: `Hyper-Scale Task #${i} [${categories[i % categories.length]}]`,
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
        progress: (i % 10) * 0.1,
        category: categories[i % categories.length],
        dependsOn: i > 1 && i % 4 === 0 ? [`BENCH-${i - 1}`] : []
      });
    }

    const title = `Canvas benchmark (${count.toLocaleString()} tasks)`;
    onOpenScratchPlan(title, {
      meta: { title },
      categories: Object.fromEntries(
        categories.map((name, i) => [name, { label: name, color: BENCHMARK_COLORS[i % BENCHMARK_COLORS.length] }])
      ),
      tasks: generatedTasks
    });
  };

  const taskCount = liveTasks.length;
  const { rangeStart, rangeEnd } = useMemo(() => {
    let start = "";
    let end = "";
    for (const t of liveTasks) {
      if (t.start && (!start || t.start < start)) start = t.start;
      if (t.end && (!end || t.end > end)) end = t.end;
    }
    return { rangeStart: start, rangeEnd: end };
  }, [liveTasks]);
  const canvasLabel =
    taskCount === 0
      ? "Canvas timeline: no tasks"
      : `Canvas timeline of ${taskCount.toLocaleString()} tasks from ${rangeStart} to ${rangeEnd}. Arrow keys pan, plus and minus zoom, 0 resets.`;

  const containerWidth = containerRef.current?.clientWidth ?? 0;
  const containerHeight = containerRef.current?.clientHeight ?? 0;
  const tooltipLeft = hoveredTask ? Math.max(8, Math.min(hoveredTask.x + 14, containerWidth - TOOLTIP_WIDTH - 8)) : 0;
  const tooltipTop = hoveredTask
    ? hoveredTask.y + 14 + TOOLTIP_HEIGHT > containerHeight
      ? Math.max(8, hoveredTask.y - TOOLTIP_HEIGHT - 14)
      : hoveredTask.y + 14
    : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0%",
        minHeight: 0,
        width: "100%",
        position: "relative",
        background: "var(--jantt-bg, #080D18)",
        overflow: "hidden",
        userSelect: "none"
      }}
    >
      {/* Top Controls Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid var(--jantt-border, #1E293B)",
          background: "var(--jantt-surface, #0E1626)",
          zIndex: 10,
          flexShrink: 0,
          flexWrap: "wrap",
          gap: "8px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "4px",
              background: "rgba(168, 85, 247, 0.15)",
              color: "#C084FC",
              fontSize: "11px",
              fontWeight: 700
            }}
          >
            <Zap size={13} style={{ color: "#A855F7" }} />
            <span>CANVAS ENGINE</span>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11.5px",
              color: "var(--jantt-text-muted, #94A3B8)",
              fontFamily: "monospace",
              flexWrap: "wrap"
            }}
          >
            <Layers size={13} style={{ color: "#38BDF8" }} />
            <span>{taskCount.toLocaleString()} tasks</span>
            <span>&bull;</span>
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted, #64748B)" }}>
              Drag or scroll to pan &bull; Ctrl+scroll to zoom
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-nav"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => zoomTo(viewRef.current.dayWidth + ZOOM_STEP)}
            title="Zoom In (Scale Day Width)"
          >
            <ZoomIn size={12} style={{ color: "#38BDF8" }} />
            <span>Zoom In</span>
          </button>
          <button
            type="button"
            className="btn-nav"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => zoomTo(viewRef.current.dayWidth - ZOOM_STEP)}
            title="Zoom Out"
          >
            <ZoomOut size={12} style={{ color: "#818CF8" }} />
            <span>Zoom Out</span>
          </button>
          <button
            type="button"
            className="btn-nav"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={handleFitToScreen}
            title="Fit Entire Project Horizon to Screen"
          >
            <Maximize2 size={12} style={{ color: "#38BDF8" }} />
            <span>Fit Horizon</span>
          </button>
          <button
            type="button"
            className={`toolbar-btn ${showMinimap ? "is-active" : ""}`}
            style={{ fontSize: "11px", padding: "0 9px", height: "28px" }}
            onClick={() => setShowMinimap((prev) => !prev)}
            aria-pressed={showMinimap}
            title="Toggle Radar Minimap Navigator"
          >
            <Compass size={12} style={{ color: "#A855F7" }} />
            <span>Radar</span>
          </button>
          <button
            type="button"
            className="btn-nav"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={resetView}
            title="Reset Pan & Zoom"
          >
            <RotateCcw size={12} style={{ color: "#F59E0B" }} />
            <span>Reset View</span>
          </button>
          <button
            type="button"
            className={`toolbar-critical-btn ${showCritical ? "is-active" : ""}`}
            style={{ fontSize: "11px", padding: "0 9px", height: "28px" }}
            onClick={() => setShowCritical((prev) => !prev)}
            aria-pressed={showCritical}
            title={`Highlight the critical path (${criticalTaskIds.size} task${criticalTaskIds.size === 1 ? "" : "s"} with no float)`}
          >
            <Activity size={12} style={{ color: "#EF4444" }} />
            <span>Critical Path</span>
          </button>

          {BENCHMARK_ENABLED && !isViewer && onOpenScratchPlan && (
            <button
              type="button"
              className="btn-nav"
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#10B981",
                borderColor: "rgba(16, 185, 129, 0.3)"
              }}
              onClick={() => handleGenerateBenchmark(10000)}
              title="Debug: open a new local plan with 10,000 synthetic tasks to stress-test the renderer (this plan is not changed)"
            >
              <Layers size={12} style={{ color: "#10B981" }} />
              <span>Benchmark 10,000 Tasks</span>
            </button>
          )}
        </div>
      </div>

      {/* Canvas Viewport Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          position: "relative",
          cursor: isPanning ? "grabbing" : "grab",
          overflow: "hidden"
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={canvasLabel}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => endPointerDrag(e, true)}
          onPointerCancel={(e) => endPointerDrag(e, false)}
          onPointerLeave={() => {
            if (!dragRef.current) setHoveredTask(null);
          }}
          onKeyDown={handleKeyDown}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            touchAction: "none"
          }}
        >
          {canvasLabel}
        </canvas>

        {/* Hover Tooltip */}
        {hoveredTask && (
          <div
            style={{
              position: "absolute",
              left: tooltipLeft,
              top: tooltipTop,
              background: "var(--jantt-surface-solid, #101012)",
              color: "var(--jantt-text, #F8FAFC)",
              border: "1px solid var(--jantt-border-strong, #334155)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "11px",
              boxShadow: "var(--jantt-shadow, 0 10px 15px -3px rgba(0, 0, 0, 0.5))",
              pointerEvents: "none",
              zIndex: 20,
              maxWidth: `${TOOLTIP_WIDTH}px`
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "12px", marginBottom: "3px" }}>
              {hoveredTask.task.label || hoveredTask.task.name || hoveredTask.task.id}
            </div>
            <div style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>
              Dates: {hoveredTask.task.start} &rarr; {hoveredTask.task.end}
            </div>
            <div style={{ color: "var(--jantt-text-muted, #94A3B8)" }}>
              Progress: {Math.round(clamp(Number(hoveredTask.task.progress) || 0, 0, 1) * 100)}%
            </div>
            {criticalTaskIds.has(hoveredTask.task.id) && (
              <div style={{ color: "#F87171", marginTop: "2px" }}>On the critical path</div>
            )}
            {hoveredTask.task.category && (
              <div style={{ color: "#38BDF8", marginTop: "2px" }}>
                Category: {hoveredTask.task.category}
              </div>
            )}
            <div style={{ fontSize: "10px", color: "var(--jantt-text-dim, #64748B)", marginTop: "4px" }}>
              Click to open activity details
            </div>
          </div>
        )}

        {/* Radar Minimap Navigator */}
        {showMinimap && (
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: 16,
              width: MINIMAP_WIDTH,
              height: MINIMAP_HEIGHT,
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid var(--jantt-border, #1E293B)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6)",
              background: "var(--jantt-surface, rgba(11, 19, 43, 0.9))",
              backdropFilter: "blur(4px)",
              zIndex: 25,
              cursor: "crosshair"
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 6,
                fontSize: "9px",
                fontWeight: 700,
                color: "#64748B",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                userSelect: "none"
              }}
            >
              <Compass size={10} style={{ color: "#38BDF8" }} />
              <span>RADAR MINIMAP</span>
            </div>
            <canvas
              ref={minimapCanvasRef}
              width={MINIMAP_WIDTH}
              height={MINIMAP_HEIGHT}
              aria-hidden="true"
              onPointerDown={(e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                minimapDragRef.current = e.pointerId;
                navigateViaMinimap(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (minimapDragRef.current === e.pointerId) navigateViaMinimap(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                minimapDragRef.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                minimapDragRef.current = null;
              }}
              style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
