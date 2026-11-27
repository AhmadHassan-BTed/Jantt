import { useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { isTaskDone, type Task } from "@jantt/core";
import { useI18n } from "../../i18n/I18nProvider";

export type InspectingUsers = ReadonlyArray<{ taskId: string; name: string }>;

export function TimelineTaskPreview({ task, inspectors, onOpen, onClose }: {
  task: Task; inspectors?: InspectingUsers; onOpen: () => void; onClose: () => void;
}) {
  const { t, formatDate } = useI18n();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const progress = isTaskDone(task) ? 100 : Math.round(Math.min(1, Math.max(0, task.progress || 0)) * 100);
  const start = formatDate(task.start, { dateStyle: "medium" });
  const end = formatDate(task.end, { dateStyle: "medium" });
  const range = task.start === task.end ? end : `${start} – ${end}`;
  const names = inspectors?.filter(user => user.taskId === task.id).map(user => user.name).join(", ");
  return <section className="timeline-task-preview" aria-label={t("preview.selectedTask")} onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
  }} onTouchStart={e => {
    const first = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: first.clientX, y: first.clientY } : null;
  }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={e => {
    const start = touch.current, end = e.changedTouches[0];
    touch.current = null;
    if (start && start.y - end.clientY > 40 && Math.abs(start.x - end.clientX) < 35) onOpen();
  }}>
    <button type="button" className="timeline-preview-open" onClick={onOpen} aria-label={t("preview.openDetails", { task: task.label || task.name || task.id })}>
      <strong>{task.label || task.name || task.id}</strong>
      <span>{range} · {progress}%</span>
      {names && <small>{t("preview.inspecting", { names })}</small>}
      <ArrowUpRight size={17} aria-hidden="true" />
    </button>
    <button type="button" className="timeline-preview-close" onClick={onClose} aria-label={t("preview.dismiss")}><X size={16} /></button>
  </section>;
}
