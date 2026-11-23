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
  isDragging: boolean;
}

interface DragState {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTime: number;
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
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const enabledRef = useRef(enabled);
  const onCloseRef = useRef(onClose);
  enabledRef.current = enabled;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (enabled) return;
    dragRef.current = null;
    setDragY(0);
    setIsDragging(false);
  }, [enabled]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabledRef.current || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
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
    setDragY(deltaY > 0 ? deltaY : 0);
    if (deltaY > 4) event.preventDefault();
  }, []);

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setIsDragging(false);
      setDragY(0);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be gone after a cancelled pointer.
      }
      if (cancelled) return;

      const deltaY = Math.max(0, event.clientY - drag.startY);
      if (deltaY >= thresholdPx || (deltaY > 16 && drag.velocity >= 0.5)) {
        triggerHaptic("light");
        onCloseRef.current();
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
      transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
      transition: isDragging ? "none" : "transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
      willChange: "transform"
    },
    isDragging
  };
}
