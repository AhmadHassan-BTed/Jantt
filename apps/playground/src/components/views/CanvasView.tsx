import React, { useEffect, useRef, useState, useCallback } from "react";
import type { JanttData, Task, ThemeDefinition } from "@jantt/core";
import { CanvasTimelineRenderer, type ViewportState } from "@jantt/render-canvas";
import {
  Zap,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Gauge,
  Activity,
  Layers
} from "lucide-react";

export interface CanvasViewProps {
  parsedData: JanttData;
  onCommit: (updated: JanttData) => void;
  onTaskClick?: (task: Task) => void;
  activeTheme?: ThemeDefinition;
}

export const CanvasView: React.FC<CanvasViewProps> = ({
  parsedData,
  onCommit,
  onTaskClick,
  activeTheme
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasTimelineRenderer | null>(null);

  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [dayWidth, setDayWidth] = useState(36);
  const [showCritical, setShowCritical] = useState(true);
  const [fps, setFps] = useState(60);
  const [lastRenderTime, setLastRenderTime] = useState(0);
  const [hoveredTask, setHoveredTask] = useState<{ task: Task; x: number; y: number } | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });

  // Initialize or update renderer instance
  useEffect(() => {
    const isDark = activeTheme?.mode === "dark";
    const colors = isDark
      ? {
          background: "#080D18",
          rowAlt: "rgba(255, 255, 255, 0.02)",
          border: "#1E293B",
          text: "#F8FAFC",
          textMuted: "#64748B",
          primary: "#38BDF8",
          critical: "#EF4444",
          gridLine: "rgba(255, 255, 255, 0.05)"
        }
      : {
          background: "#FFFFFF",
          rowAlt: "rgba(0, 0, 0, 0.02)",
          border: "#E2E8F0",
          text: "#0F172A",
          textMuted: "#64748B",
          primary: "#2563EB",
          critical: "#EF4444",
          gridLine: "rgba(0, 0, 0, 0.05)"
        };

    if (!rendererRef.current) {
      rendererRef.current = new CanvasTimelineRenderer(parsedData, {
        dayWidth,
        rowHeight: 34,
        headerHeight: 44,
        showCriticalPath: showCritical,
        colors
      });
    } else {
      rendererRef.current.setPlan(parsedData);
      rendererRef.current.updateOptions({
        dayWidth,
        showCriticalPath: showCritical,
        colors
      });
    }
  }, [parsedData, dayWidth, showCritical, activeTheme]);

  // Main 60 FPS Render Loop
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !container || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const t0 = performance.now();

    const viewport: ViewportState = {
      scrollX,
      scrollY,
      width,
      height,
      devicePixelRatio: dpr
    };

    renderer.render(ctx, viewport);

    const t1 = performance.now();
    setLastRenderTime(Number((t1 - t0).toFixed(2)));
  }, [scrollX, scrollY]);

  // RequestAnimationFrame trigger
  useEffect(() => {
    let animId: number;
    let frameCount = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      frameCount++;
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      renderFrame();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [renderFrame]);

  // Mouse drag panning & hit testing
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollX,
      scrollY
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!container || !renderer) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setScrollX(Math.max(0, dragStartRef.current.scrollX - dx));
      setScrollY(Math.max(0, dragStartRef.current.scrollY - dy));
      setHoveredTask(null);
    } else {
      // Hit testing for hover tooltip
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const dpr = window.devicePixelRatio || 1;
      const viewport: ViewportState = {
        scrollX,
        scrollY,
        width: container.clientWidth,
        height: container.clientHeight,
        devicePixelRatio: dpr
      };

      const hit = renderer.hitTest(clientX, clientY, viewport);
      if (hit && hit.hitType !== "none") {
        setHoveredTask({ task: hit.task, x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setHoveredTask(null);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDragging = Math.abs(e.clientX - dragStartRef.current.x) > 3 || Math.abs(e.clientY - dragStartRef.current.y) > 3;
    isDraggingRef.current = false;

    if (!wasDragging) {
      // Click selection
      const container = containerRef.current;
      const renderer = rendererRef.current;
      if (!container || !renderer) return;

      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const dpr = window.devicePixelRatio || 1;
      const viewport: ViewportState = {
        scrollX,
        scrollY,
        width: container.clientWidth,
        height: container.clientHeight,
        devicePixelRatio: dpr
      };

      const hit = renderer.hitTest(clientX, clientY, viewport);
      if (hit && hit.hitType !== "none" && onTaskClick) {
        onTaskClick(hit.task);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const delta = e.deltaY < 0 ? 4 : -4;
      setDayWidth((prev) => Math.min(Math.max(prev + delta, 12), 120));
    } else {
      // Pan
      setScrollX((prev) => Math.max(0, prev + e.deltaX));
      setScrollY((prev) => Math.max(0, prev + e.deltaY));
    }
  };

  // 10,000 Tasks Benchmark Generator
  const handleGenerateBenchmark = (count: number) => {
    const categories = ["Engineering", "Infrastructure", "AI Model", "Testing", "Security", "Deployment"];
    const generatedTasks: Task[] = [];
    const baseDate = new Date("2026-03-01");

    for (let i = 1; i <= count; i++) {
      const dayOffset = Math.floor(i / 15);
      const duration = (i % 7) + 1;
      const startDate = new Date(baseDate.getTime() + dayOffset * 86400000);
      const endDate = new Date(startDate.getTime() + duration * 86400000);

      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];

      const deps = i > 1 && i % 4 === 0 ? [`BENCH-${i - 1}`] : [];

      generatedTasks.push({
        id: `BENCH-${i}`,
        name: `Hyper-Scale Task #${i} [${categories[i % categories.length]}]`,
        start: startStr,
        end: endStr,
        progress: (i % 10) * 0.1,
        category: categories[i % categories.length],
        dependsOn: deps
      });
    }

    onCommit({
      ...parsedData,
      tasks: generatedTasks
    });
  };

  const taskCount = parsedData.tasks?.filter((t) => !t._deleted).length || 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
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
          flexWrap: "wrap",
          gap: "8px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "4px",
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38BDF8",
              fontSize: "11px",
              fontWeight: 700
            }}
          >
            <Zap size={13} />
            <span>CANVAS 60 FPS ENGINE</span>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11.5px",
              color: "var(--jantt-text-muted, #94A3B8)",
              fontFamily: "monospace"
            }}
          >
            <Gauge size={13} style={{ color: fps >= 55 ? "#10B981" : "#F59E0B" }} />
            <span><strong>{fps} FPS</strong></span>
            <span>&bull;</span>
            <span>{lastRenderTime}ms draw</span>
            <span>&bull;</span>
            <span>{taskCount.toLocaleString()} tasks</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            className="btn-nav"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => setDayWidth((prev) => Math.min(prev + 6, 120))}
            title="Zoom In (Scale Day Width)"
          >
            <ZoomIn size={12} />
            <span>Zoom In</span>
          </button>
          <button
            className="btn-nav"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => setDayWidth((prev) => Math.max(prev - 6, 12))}
            title="Zoom Out"
          >
            <ZoomOut size={12} />
            <span>Zoom Out</span>
          </button>
          <button
            className="btn-nav"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => {
              setScrollX(0);
              setScrollY(0);
              setDayWidth(36);
            }}
            title="Reset Pan & Zoom"
          >
            <RotateCcw size={12} />
            <span>Reset View</span>
          </button>
          <button
            className={`btn-nav ${showCritical ? "btn-nav-primary" : ""}`}
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => setShowCritical((prev) => !prev)}
            title="Toggle Critical Path Visualization"
          >
            <Activity size={12} />
            <span>Critical Path</span>
          </button>

          {/* Benchmark Preset Buttons */}
          <button
            className="btn-nav"
            style={{
              fontSize: "11px",
              padding: "4px 10px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#10B981",
              borderColor: "rgba(16, 185, 129, 0.3)"
            }}
            onClick={() => handleGenerateBenchmark(10000)}
            title="Stress-test the canvas renderer with 10,000 synthetic tasks"
          >
            <Layers size={12} />
            <span>Benchmark 10,000 Tasks</span>
          </button>
        </div>
      </div>

      {/* Canvas Viewport Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          cursor: isDraggingRef.current ? "grabbing" : "grab",
          overflow: "hidden"
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          style={{
            display: "block",
            width: "100%",
            height: "100%"
          }}
        />

        {/* Hover Tooltip */}
        {hoveredTask && (
          <div
            style={{
              position: "absolute",
              left: hoveredTask.x + 14,
              top: hoveredTask.y + 14,
              background: "rgba(15, 23, 42, 0.95)",
              color: "#F8FAFC",
              border: "1px solid #334155",
              borderRadius: "6px",
              padding: "8px 12px",
              fontSize: "11px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
              pointerEvents: "none",
              zIndex: 20,
              maxWidth: "280px"
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "12px", marginBottom: "3px" }}>
              {hoveredTask.task.label || hoveredTask.task.name || hoveredTask.task.id}
            </div>
            <div style={{ color: "#94A3B8" }}>
              Dates: {hoveredTask.task.start} &rarr; {hoveredTask.task.end}
            </div>
            <div style={{ color: "#94A3B8" }}>
              Progress: {Math.round((hoveredTask.task.progress || 0) * 100)}%
            </div>
            {hoveredTask.task.category && (
              <div style={{ color: "#38BDF8", marginTop: "2px" }}>
                Category: {hoveredTask.task.category}
              </div>
            )}
            <div style={{ fontSize: "10px", color: "#64748B", marginTop: "4px" }}>
              Click to open activity details
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
