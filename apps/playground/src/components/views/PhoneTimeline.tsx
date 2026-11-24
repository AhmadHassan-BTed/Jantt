import { useCallback, useEffect, useRef, useState } from "react";
import { Jantt, type JanttProps } from "@jantt/react";
import { clampDayWidth, type JanttInstance, type Task } from "@jantt/core";
import { useTimelineTouch } from "../../hooks/useTimelineTouch";
import { triggerHaptic } from "../../services/platform";
import { TimelineTaskPreview, type InspectingUsers } from "./TimelineTaskPreview";
import "./phone-timeline.css";

interface Props extends JanttProps {
  onToggleSplit?: () => void;
  showSplit?: boolean;
  onPreviewOpen: (task: Task) => void;
  onInspectTask?: (id: string | null) => void;
  inspectingUsers?: InspectingUsers;
}

const taskSelector = "[data-task-id], .jantt-label-row[data-row-id]";
function taskAt(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest("button,input,select,textarea")) return;
  const el = target.closest<HTMLElement>(taskSelector);
  return el?.dataset.taskId ?? el?.dataset.rowId;
}

export function PhoneTimeline({ onToggleSplit, showSplit, onPreviewOpen, onInspectTask, inspectingUsers, ...props }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<JanttInstance | null>(null);
  const onInstance = useCallback((instance: JanttInstance | null) => { engine.current = instance; }, []);
  const initialWidth = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const tapped = useRef<{ id: string; time: number } | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const current = useRef({ data: props.data, onPreviewOpen });
  current.current = { data: props.data, onPreviewOpen };
  const inspect = useRef(onInspectTask);
  inspect.current = onInspectTask;
  useEffect(() => () => inspect.current?.(null), []);
  const task = selected ? props.data.tasks.find(t => t.id === selected && !t._deleted) : undefined;
  const open = (item: Task) => {
    setSelected(null);
    tapped.current = null;
    onInspectTask?.(item.id);
    onPreviewOpen(item);
  };
  const dismiss = () => {
    setSelected(null);
    tapped.current = null;
    onInspectTask?.(null);
  };

  // The content stretches on the compositor during a pinch. Relayout and persist the final scale once on release.
  const timeline = () => root.current?.querySelector<HTMLElement>(".jantt-timeline-area");
  const scroll = () => root.current?.querySelector<HTMLElement>(".jantt-body-wrap");
  useTimelineTouch(root, {
    accepts: target => target instanceof Element && Boolean(target.closest(".jantt-body-wrap")),
    start: () => {
      initialWidth.current = engine.current?.getDayWidth() || 24;
      suppressClick.current = true;
      const area = timeline();
      if (area) area.style.willChange = "transform";
    },
    move: ({ start, current, ratio }) => {
      const area = timeline();
      const wrap = scroll();
      if (!area || !wrap) return;
      const scale = clampDayWidth(initialWidth.current * ratio) / initialWidth.current;
      // offsetLeft is layout-space and stays stable while transform is active.
      const left = wrap.getBoundingClientRect().left + (area.previousElementSibling?.getBoundingClientRect().width || 0);
      area.style.transformOrigin = `${wrap.scrollLeft + start.x - left}px 0`;
      area.style.transform = `translate3d(${current.x - start.x}px,0,0) scaleX(${scale})`;
    },
    finish: ({ start, current, ratio }, cancelled) => {
      const area = timeline();
      if (area) { area.style.transform = ""; area.style.transformOrigin = ""; area.style.willChange = ""; }
      if (cancelled) return;
      engine.current?.setDayWidth(initialWidth.current * ratio, start.x);
      scroll()?.scrollBy(start.x - current.x, start.y - current.y);
    },
    pan: (dx, dy) => scroll()?.scrollBy(dx, dy)
  });

  // Space temporarily turns the chart into a hand tool, including over editable bars.
  useEffect(() => {
    const host = root.current;
    if (!host || props.isMobile) return;
    let armed = false, moved = false;
    let focusedTask: string | undefined;
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
    const disarm = () => {
      armed = false;
      focusedTask = undefined;
      if (drag && host.hasPointerCapture(drag.id)) host.releasePointerCapture(drag.id);
      drag = null;
      host.classList.remove("is-space-pan");
    };
    const keyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey ||
          target?.closest("input,textarea,select,button,a,[contenteditable=true],[role=dialog]")) return;
      const id = taskAt(target);
      if (target?.closest("[role=button]") && !id) return;
      if (!host.matches(":hover") && !host.contains(document.activeElement)) return;
      e.preventDefault();
      if (id) e.stopPropagation(); // Release without a drag still activates the focused task.
      if (!armed) {
        moved = false; focusedTask = id;
        armed = true; host.classList.add("is-space-pan");
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !armed) return;
      const item = focusedTask && !moved ? current.current.data.tasks.find(t => t.id === focusedTask && !t._deleted) : undefined;
      disarm();
      if (item) current.current.onPreviewOpen(item);
    };
    const down = (e: PointerEvent) => {
      const wrap = scroll();
      if (!armed || !wrap || e.button !== 0 || !(e.target instanceof Node) || !wrap.contains(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
      host.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      moved ||= Math.hypot(drag.x - e.clientX, drag.y - e.clientY) > 3;
      scroll()?.scrollTo(drag.left + drag.x - e.clientX, drag.top + drag.y - e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return;
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      drag = null;
    };
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", disarm);
    host.addEventListener("pointerdown", down, true);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    return () => {
      disarm();
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", disarm);
      host.removeEventListener("pointerdown", down, true);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
    };
  }, [props.isMobile]);

  // Reapply collaborator labels when the renderer replaces the chart body after a viewport or plan change.
  useEffect(() => {
    const wrap = scroll();
    if (!wrap || !inspectingUsers?.length) return;
    const names = new Map<string, string[]>();
    const descriptions = new WeakMap<HTMLElement, string | null>();
    for (const user of inspectingUsers) names.set(user.taskId, [...(names.get(user.taskId) || []), user.name]);
    const paint = () => {
      wrap.querySelectorAll<HTMLElement>(".jantt-task-bar, .jantt-milestone").forEach(el => {
        const label = names.get(el.dataset.taskId || "")?.join(", ");
        if (label) {
          if (!descriptions.has(el)) descriptions.set(el, el.getAttribute("aria-description"));
          el.dataset.roomInspector = label;
          el.setAttribute("aria-description", [descriptions.get(el), `Being inspected by ${label}`].filter(Boolean).join(". "));
        }
      });
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(wrap, { childList: true });
    return () => {
      observer.disconnect();
      wrap.querySelectorAll<HTMLElement>("[data-room-inspector]").forEach(el => {
        delete el.dataset.roomInspector;
        const description = descriptions.get(el);
        if (description) el.setAttribute("aria-description", description);
        else el.removeAttribute("aria-description");
      });
    };
  }, [inspectingUsers]);

  useEffect(() => {
    const wrap = scroll();
    if (!wrap || !selected) return;
    const mark = () => {
      wrap.querySelectorAll<HTMLElement>(taskSelector).forEach(el => {
        el.classList.toggle("is-previewed", (el.dataset.taskId || el.dataset.rowId) === selected);
      });
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(wrap, { childList: true });
    return () => {
      observer.disconnect();
      wrap.querySelectorAll(".is-previewed").forEach(el => el.classList.remove("is-previewed"));
    };
  }, [selected]);

  return <div ref={root} className="planning-timeline"
    onPointerDownCapture={e => {
      if (!props.isMobile) {
        const id = taskAt(e.target);
        if (id && e.button === 0) { onInspectTask?.(id); press.current = { x: e.clientX, y: e.clientY }; }
        return;
      }
      if (e.isPrimary) { suppressClick.current = false; press.current = { x: e.clientX, y: e.clientY }; }
      const target = e.target as Element;
      if (target.closest(".is-previewed .jantt-resize-handle, .is-previewed .jantt-link-port")) {
        suppressClick.current = true;
        return;
      }
      if (taskAt(target)) e.stopPropagation();
    }}
    onPointerCancelCapture={() => { if (press.current && !props.isMobile) onInspectTask?.(null); press.current = null; suppressClick.current = true; }}
    onPointerUpCapture={e => {
      if (press.current) {
        const distance = Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y);
        if (!props.isMobile && distance > 3) onInspectTask?.(null);
        if (props.isMobile && distance > 9) suppressClick.current = true;
      }
      press.current = null;
    }}
    onClickCapture={e => {
      const id = taskAt(e.target);
      if (!props.isMobile) return;
      if (!id) {
        if (task && !suppressClick.current && (e.target as Element).matches(".jantt-grid-container,.jantt-grid-row")) dismiss();
        return;
      }
      e.stopPropagation();
      if (suppressClick.current && e.detail !== 0) return;
      const item = props.data.tasks.find(t => t.id === id && !t._deleted);
      if (!item) return;
      const now = performance.now();
      if (tapped.current?.id === id && now - tapped.current.time < 420) { open(item); return; }
      tapped.current = { id, time: now };
      const bar = root.current?.querySelector<HTMLElement>(`.jantt-task-bar[data-task-id="${CSS.escape(id)}"],.jantt-milestone[data-task-id="${CSS.escape(id)}"]`);
      bar?.focus({ preventScroll: true });
      setSelected(id);
      onInspectTask?.(id);
      triggerHaptic("light");
    }}
    onKeyDownCapture={e => {
      const id = taskAt(e.target);
      if (!props.isMobile || !id || (e.key !== "Enter" && e.key !== " ")) return;
      const item = props.data.tasks.find(t => t.id === id && !t._deleted);
      if (item) { e.preventDefault(); e.stopPropagation(); open(item); }
    }}>
    <Jantt
      {...props}
      hideLabelColumn={props.isMobile ? (props.hideLabelColumn ?? !showSplit) : props.hideLabelColumn}
      disableDragOnTouch={props.isMobile ? false : props.disableDragOnTouch}
      onInstance={onInstance}
      onOpenTaskDetails={onPreviewOpen}
      onLinkSnap={id => { triggerHaptic("medium"); props.onLinkSnap?.(id); }}
      onTaskClick={item => { onInspectTask?.(item.id); props.onTaskClick?.(item); }}
    />
    {props.isMobile && task && (
      <TimelineTaskPreview task={task} inspectors={inspectingUsers} onOpen={() => open(task)} onClose={dismiss} />
    )}
  </div>;
}
