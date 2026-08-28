import React, { useEffect, useRef } from "react";
import { JanttData, Task, ViewportOptions, renderJantt, JanttInstance } from "@jantt/core";

export interface JanttProps {
  data: JanttData;
  onChange?: (draft: JanttData) => void;
  onCommit?: (final: JanttData) => void;
  onTaskClick?: (task: Task) => void;
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
  className?: string;
  style?: React.CSSProperties;
  readOnly?: boolean;
}

export const Jantt: React.FC<JanttProps> = ({
  data,
  onChange,
  onCommit,
  onTaskClick,
  renderDetail,
  viewport,
  theme,
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
      readOnly,
      onChange,
      onCommit,
      onTaskClick,
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
        readOnly,
        onChange,
        onCommit,
        onTaskClick,
        renderDetail
      });
    }
  }, [data, viewport, theme, readOnly, onChange, onCommit, onTaskClick, renderDetail]);

  return (
    <div
      ref={containerRef}
      className={`jantt-react-wrapper ${className || ""}`}
      style={{ width: "100%", ...style }}
    />
  );
};

export default Jantt;
