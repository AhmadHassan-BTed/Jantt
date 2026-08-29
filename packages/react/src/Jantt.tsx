import React, { useEffect, useRef } from "react";
import { JanttData, Task, ViewportOptions, renderJantt, JanttInstance } from "@jantt/core";

export interface JanttProps {
  data: JanttData;
  onChange?: (draft: JanttData) => void;
  onCommit?: (final: JanttData) => void;
  onViewportChange?: (viewport: ViewportOptions) => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void;
  sidebarContainer?: HTMLElement | string;
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
  sidebarContainer,
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

  // Mount/unmount lifecycle
  useEffect(() => {
    if (!containerRef.current) return;

    instanceRef.current = renderJantt(containerRef.current, data, {
      viewport,
      theme,
      themeClassName,
      className,
      readOnly,
      sidebarContainer,
      onChange,
      onCommit,
      onViewportChange,
      onTaskClick,
      onTaskDelete,
      renderDetail
    });

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  // Update on data/options change
  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.update(data, {
        viewport,
        theme,
        themeClassName,
        className,
        readOnly,
        sidebarContainer,
        onChange,
        onCommit,
        onViewportChange,
        onTaskClick,
        onTaskDelete,
        renderDetail
      });
    }
  }, [data, viewport, theme, themeClassName, className, readOnly, sidebarContainer, onChange, onCommit, onViewportChange, onTaskClick, onTaskDelete, renderDetail]);

  return (
    <div
      ref={containerRef}
      className={`jantt-react-wrapper ${className || ""}`}
      style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", flex: "1 1 auto", ...style }}
    />
  );
};

export default Jantt;
