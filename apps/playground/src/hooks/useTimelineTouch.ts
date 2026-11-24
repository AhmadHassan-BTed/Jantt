import { useEffect, useRef, type RefObject } from "react";

interface Point { x: number; y: number; span: number }
export interface TimelinePinch {
  start: Point;
  current: Point;
  ratio: number;
}

interface TouchActions {
  /** Only gestures starting on the chart surface belong to it. */
  accepts: (target: EventTarget | null) => boolean;
  start: () => void;
  move: (pinch: TimelinePinch) => void;
  finish: (pinch: TimelinePinch, cancelled: boolean) => void;
  pan: (dx: number, dy: number) => void;
}

function midpoint(touches: TouchList): Point {
  const [a, b] = [touches[0], touches[1]];
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2,
    span: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) };
}

/** A two-contact gesture gets one visual update per frame. Single-finger native scroll and taps stay available. */
export function useTimelineTouch(ref: RefObject<HTMLElement>, actions: TouchActions, enabled = true) {
  const latest = useRef(actions);
  latest.current = actions;
  const pinching = useRef(false);
  useEffect(() => {
    const host = ref.current;
    if (!host || !enabled) return;
    let sample: TimelinePinch | null = null;
    let frame = 0;
    let lastTime = 0;
    let vx = 0, vy = 0;
    const stopMotion = () => { cancelAnimationFrame(frame); frame = 0; };
    const onStart = (e: TouchEvent) => {
      stopMotion();
      if (sample && e.touches.length > 2) {
        e.preventDefault();
        latest.current.finish(sample, true);
        sample = null;
        vx = vy = 0;
        return;
      }
      if (e.touches.length !== 2 || pinching.current || !Array.from(e.touches).every(t => latest.current.accepts(t.target))) return;
      e.preventDefault();
      const point = midpoint(e.touches);
      sample = { start: point, current: point, ratio: 1 };
      pinching.current = true;
      vx = vy = 0;
      lastTime = e.timeStamp;
      latest.current.start();
    };
    const onMove = (e: TouchEvent) => {
      if (!sample) return;
      e.preventDefault();
      if (e.touches.length !== 2) return;
      const point = midpoint(e.touches);
      if (point.x === sample.current.x && point.y === sample.current.y && point.span === sample.current.span) return;
      const dt = Math.max(4, e.timeStamp - lastTime);
      vx = .45 * vx + .55 * (sample.current.x - point.x) / dt;
      vy = .45 * vy + .55 * (sample.current.y - point.y) / dt;
      sample = { start: sample.start, current: point, ratio: point.span / sample.start.span };
      lastTime = e.timeStamp;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (sample) latest.current.move(sample); });
    };
    const onEnd = (e: TouchEvent) => {
      if (!pinching.current) return;
      const cancelled = e.type === "touchcancel";
      if (e.touches.length >= 2 && !cancelled) return;
      stopMotion();
      if (sample) latest.current.finish(sample, cancelled);
      sample = null;
      pinching.current = e.touches.length > 0;
      if (cancelled) { vx = vy = 0; return; }
      if (pinching.current || Math.hypot(vx, vy) < .035 || e.timeStamp - lastTime > 90 ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      let previous = performance.now();
      const coast = (now: number) => {
        const dt = Math.min(32, now - previous);
        previous = now;
        const decay = Math.exp(-dt / 180);
        vx *= decay; vy *= decay;
        if (Math.hypot(vx, vy) < .035) { frame = 0; return; }
        latest.current.pan(vx * dt, vy * dt);
        frame = requestAnimationFrame(coast);
      };
      frame = requestAnimationFrame(coast);
    };
    const options = { passive: false, capture: true };
    host.addEventListener("touchstart", onStart, options);
    host.addEventListener("touchmove", onMove, options);
    host.addEventListener("touchend", onEnd, options);
    host.addEventListener("touchcancel", onEnd, options);
    return () => {
      stopMotion();
      if (sample) latest.current.finish(sample, true);
      pinching.current = false;
      host.removeEventListener("touchstart", onStart, true);
      host.removeEventListener("touchmove", onMove, true);
      host.removeEventListener("touchend", onEnd, true);
      host.removeEventListener("touchcancel", onEnd, true);
    };
  }, [ref, enabled]);
  return pinching;
}
