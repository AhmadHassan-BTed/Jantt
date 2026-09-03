import React, { useEffect, useRef } from "react";
import { JanttData, Task, ViewportOptions, JanttOptions, renderJantt, JanttInstance } from "@jantt/core";

export interface JanttProps {
  data: JanttData;
  onChange?: (draft: JanttData) => void;
  onCommit?: (final: JanttData) => void;
  onViewportChange?: (viewport: ViewportOptions) => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void;
  onTaskAdd?: (newTask: Task) => void;
  sidebarContainer?: HTMLElement | string;
  selectedDate?: string | null;
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
}

export const Jantt: React.FC<JanttProps> = ({
  data,
  onChange,
  onCommit,
  onViewportChange,
  onTaskClick,
  onTaskDelete,
  onTaskAdd,
  sidebarContainer,
  selectedDate,
  onDateClick,
  onClearDateFilter,
  onDayWidthChange,
  renderDetail,
  viewport,
  theme,
  themeClassName,
  className,
  style,
  readOnly
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<JanttInstance | null>(null);

  // Keep latest callbacks in ref to eliminate stale closure bugs
  const callbacksRef = useRef({
    onChange,
    onCommit,
    onViewportChange,
    onTaskClick,
    onTaskDelete,
    onTaskAdd,
    onDateClick,
    onClearDateFilter,
    onDayWidthChange,
    renderDetail
  });

  callbacksRef.current = {
    onChange,
    onCommit,
    onViewportChange,
    onTaskClick,
    onTaskDelete,
    onTaskAdd,
    onDateClick,
    onClearDateFilter,
    onDayWidthChange,
    renderDetail
  };

  const getForwardingOptions = (): JanttOptions => ({
    viewport,
    theme,
    themeClassName,
    className,
    readOnly,
    sidebarContainer,
    selectedDate,
    onDateClick: (dateStr: string) => callbacksRef.current.onDateClick?.(dateStr),
    onClearDateFilter: () => callbacksRef.current.onClearDateFilter?.(),
    onDayWidthChange: (w: number) => callbacksRef.current.onDayWidthChange?.(w),
    onChange: (draft: JanttData) => callbacksRef.current.onChange?.(draft),
    onCommit: (final: JanttData) => callbacksRef.current.onCommit?.(final),
    onViewportChange: (vp: ViewportOptions) => callbacksRef.current.onViewportChange?.(vp),
    onTaskClick: (t: Task) => callbacksRef.current.onTaskClick?.(t),
    onTaskDelete: (id: string) => callbacksRef.current.onTaskDelete?.(id),
    onTaskAdd: (newTask: Task) => callbacksRef.current.onTaskAdd?.(newTask),
    renderDetail: callbacksRef.current.renderDetail
      ? (task, container, api) => callbacksRef.current.renderDetail?.(task, container, api)
      : undefined
  });

  // Mount/unmount lifecycle
  useEffect(() => {
    if (!containerRef.current) return;

    instanceRef.current = renderJantt(containerRef.current, data, getForwardingOptions());

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  // Update on data or configuration changes
  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.update(data, getForwardingOptions());
    }
  }, [
    data,
    viewport,
    theme,
    themeClassName,
    className,
    readOnly,
    sidebarContainer,
    selectedDate
  ]);

  return (
    <div
      ref={containerRef}
      className={`jantt-react-wrapper ${className || ""}`}
      style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", flex: "1 1 auto", ...style }}
    />
  );
};

export default Jantt;
