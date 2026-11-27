import React, { useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  mobile: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onSwipe: (status: "completed" | "in-progress") => void;
}

export function BoardCard({ title, mobile, readOnly, onOpen, onSwipe, children, ...props }: Props) {
  const { t } = useI18n();
  const start = useRef<{ id: number; x: number; y: number; dx: number } | null>(null);
  const ignoreClickUntil = useRef(0);
  function reset(element: HTMLDivElement) {
    start.current = null;
    element.style.removeProperty("--board-swipe");
    delete element.dataset.swipe;
  }

  return <div {...props} role="group" aria-label={title}
    onPointerDown={event => {
      if (!mobile || readOnly || event.pointerType !== "touch" || !event.isPrimary ||
          (event.target as HTMLElement).closest("input, select, textarea")) return;
      ignoreClickUntil.current = 0;
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0 };
    }}
    onPointerMove={event => {
      const gesture = start.current;
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = Math.abs(event.clientY - gesture.y);
      if (!gesture.dx && dy > 8 && dy >= Math.abs(dx)) { reset(event.currentTarget); return; }
      if (!gesture.dx && Math.abs(dx) < 12) return;
      if (!gesture.dx) event.currentTarget.setPointerCapture?.(gesture.id);
      gesture.dx = dx;
      event.currentTarget.dataset.swipe = dx < 0 ? t("board.complete") : t("board.inProgress");
      event.currentTarget.style.setProperty("--board-swipe", `${Math.max(-70, Math.min(70, dx * 0.6))}px`);
    }}
    onPointerUp={event => {
      const gesture = start.current;
      if (!gesture || gesture.id !== event.pointerId) return;
      const distance = gesture.dx;
      reset(event.currentTarget);
      if (distance) ignoreClickUntil.current = performance.now() + 500;
      if (Math.abs(distance) >= 60) onSwipe(distance < 0 ? "completed" : "in-progress");
    }}
    onPointerCancel={event => reset(event.currentTarget)}
    onClickCapture={event => {
      if (performance.now() < ignoreClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
    }}
    onClick={event => {
      if (!(event.target as HTMLElement).closest("button, input, select, textarea, label")) onOpen();
    }}>
    {children}
    <button type="button" className="board-open-task" aria-label={t("board.openDetails", { title })} onClick={onOpen}>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  </div>;
}

export function EditableBoardTitle({ title, readOnly, mobile, onSave }: {
  title: string; readOnly: boolean; mobile: boolean; onSave: (value: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const restoreFocus = useRef(false);
  const titleButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (draft === null && restoreFocus.current) {
      restoreFocus.current = false;
      titleButton.current?.focus({ preventScroll: true });
    }
  }, [draft]);
  const className = mobile ? "kanban-mobile-title" : "kanban-card-title";
  if (readOnly) return <span className={className}>{title}</span>;
  if (draft === null) return <button ref={titleButton} className={`${className} board-edit-title`} type="button" aria-label={t("board.editTitle", { title })}
    onClick={() => { cancelled.current = false; setDraft(title); }}>{title}</button>;
  function finish() {
    const next = draft?.trim();
    if (!cancelled.current && next && next !== title) onSave(next);
    setDraft(null);
  }
  return <input autoFocus aria-label={t("board.taskTitle")} className="board-title-input" value={draft}
    onFocus={event => event.target.select()} onChange={event => setDraft(event.target.value)} onBlur={finish}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        restoreFocus.current = true;
        cancelled.current = event.key === "Escape";
        event.currentTarget.blur();
      }
    }} />;
}

