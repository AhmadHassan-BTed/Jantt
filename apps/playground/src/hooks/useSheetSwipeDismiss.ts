import React, { useCallback, useEffect, useRef, useState } from "react";
import { triggerHaptic } from "../services/platform";

interface UseSheetSwipeDismissOptions {
  onClose: () => void;
  enabled: boolean;
  thresholdPx?: number;
}

export interface SheetSwipeDismiss {
  handleProps: {
    onPointerDown: React.PointerEventHandler<HTMLElement>;
    onPointerMove: React.PointerEventHandler<HTMLElement>;
    onPointerUp: React.PointerEventHandler<HTMLElement>;
    onPointerCancel: React.PointerEventHandler<HTMLElement>;
    style: React.CSSProperties;
  };
  sheetStyle: React.CSSProperties;
  backdropStyle: React.CSSProperties;
  isDragging: boolean;
}

interface DragState {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTime: number;
  height: number;
  velocity: number;
}

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, [role='button'], [data-no-swipe]";

/**
 * Pointer-driven swipe-to-dismiss for bottom sheets: only starts on the handle or header, never
 * inside scrolling content. Dismisses on distance or downward velocity and otherwise springs back.
 */
export function useSheetSwipeDismiss({
  onClose,
  enabled,
  thresholdPx = 92
}: UseSheetSwipeDismissOptions): SheetSwipeDismiss {
  const [position, setPosition] = useState({ y: 0, height: 1 });
  const frame = useRef(0);
  const closingTimer = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const enabledRef = useRef(enabled);
  const onCloseRef = useRef(onClose);
  enabledRef.current = enabled;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (enabled) return;
    window.clearTimeout(closingTimer.current);
    closingTimer.current = 0;
    dragRef.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setPosition({ y: 0, height: 1 });
    setIsDragging(false);
  }, [enabled]);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    window.clearTimeout(closingTimer.current);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabledRef.current || closingTimer.current || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      height: event.currentTarget.closest('[role="dialog"], [role="alertdialog"]')?.getBoundingClientRect().height || 320,
      velocity: 0
    };
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an optimization; move events still arrive while the pointer is inside.
    }
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    if (!frame.current) frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const dy = drag.lastY - drag.startY;
      const y = dy < 0 ? -Math.min(18, Math.sqrt(-dy) * 2) : dy > thresholdPx
        ? thresholdPx + (dy - thresholdPx) * 0.65 : dy;
      setPosition({ y, height: drag.height });
    });
    if (deltaY > 4) event.preventDefault();
  }, [thresholdPx]);

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setIsDragging(false);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      setPosition({ y: 0, height: 1 });
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be gone after a cancelled pointer.
      }
      if (cancelled) return;

      const deltaY = Math.max(0, event.clientY - drag.startY);
      if (deltaY >= thresholdPx || (deltaY > 16 && event.timeStamp - drag.lastTime < 100 && drag.velocity >= 0.5)) {
        triggerHaptic("light");
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          onCloseRef.current();
        } else {
          setPosition({ y: drag.height, height: drag.height });
          closingTimer.current = window.setTimeout(() => {
            closingTimer.current = 0;
            setPosition({ y: 0, height: 1 });
            onCloseRef.current();
          }, 160);
        }
      }
    },
    [thresholdPx]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => finishDrag(event, false),
    [finishDrag]
  );
  const onPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => finishDrag(event, true),
    [finishDrag]
  );

  return {
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: { touchAction: "none" }
    },
    sheetStyle: {
      transform: position.y ? `translate3d(0,${position.y}px,0)` : undefined,
      transition: isDragging ? "none" : "transform 160ms cubic-bezier(.2,.95,.35,1.08)",
      willChange: isDragging ? "transform" : undefined
    },
    backdropStyle: { "--sheet-opacity": Math.max(0, 1 - Math.max(0, position.y) / position.height) } as React.CSSProperties,
    isDragging
  };
}
