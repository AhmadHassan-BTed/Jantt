import { useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { formatHumanDate, isTaskDone, type Task } from "@jantt/core";

export type InspectingUsers = ReadonlyArray<{ taskId: string; name: string }>;

export function TimelineTaskPreview({ task, inspectors, onOpen, onClose }: {
  task: Task; inspectors?: InspectingUsers; onOpen: () => void; onClose: () => void;
}) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  const progress = isTaskDone(task) ? 100 : Math.round(Math.min(1, Math.max(0, task.progress || 0)) * 100);
  const range = task.start === task.end ? formatHumanDate(task.end) : `${formatHumanDate(task.start)} – ${formatHumanDate(task.end)}`;
  const names = inspectors?.filter(user => user.taskId === task.id).map(user => user.name).join(", ");
  return <section className="timeline-task-preview" aria-label="Selected task" onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
  }} onTouchStart={e => {
    const first = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: first.clientX, y: first.clientY } : null;
  }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={e => {
    const start = touch.current, end = e.changedTouches[0];
    touch.current = null;
    if (start && start.y - end.clientY > 40 && Math.abs(start.x - end.clientX) < 35) onOpen();
  }}>
    <button type="button" className="timeline-preview-open" onClick={onOpen} aria-label={`Open details for ${task.label || task.name || task.id}`}>
      <strong>{task.label || task.name || task.id}</strong>
      <span>{range} · {progress}%</span>
      {names && <small>Inspecting · {names}</small>}
      <ArrowUpRight size={17} aria-hidden="true" />
    </button>
    <button type="button" className="timeline-preview-close" onClick={onClose} aria-label="Dismiss task preview"><X size={16} /></button>
  </section>;
}
