import { useState, useRef, useCallback, useEffect } from "react";
import { STORAGE_KEYS } from "../constants";
import { storageService } from "../services/storage";

interface UseSidebarResizeOptions {
  initialWidth: number;
  initialCollapsed: boolean;
  isMobile?: boolean;
}

const MIN_SIDEBAR_WIDTH = 280;
/** Space always left for the chart next to the editor. */
const MIN_CHART_WIDTH = 360;

function clampSidebarWidth(width: number): number {
  const viewport = typeof window !== "undefined" ? window.innerWidth : 1280;
  const max = Math.max(MIN_SIDEBAR_WIDTH, viewport - MIN_CHART_WIDTH);
  const safe = Number.isFinite(width) ? width : MIN_SIDEBAR_WIDTH;
  return Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(max, safe)));
}

export function useSidebarResize({ initialWidth, initialCollapsed, isMobile = false }: UseSidebarResizeOptions) {
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => clampSidebarWidth(initialWidth));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(isMobile ? true : initialCollapsed);
  const [isResizing, setIsResizing] = useState(false);
  /** Removes the listeners of an in-flight drag; also used for unmount cleanup. */
  const stopDragRef = useRef<(() => void) | null>(null);
  const wasMobileRef = useRef(isMobile);

  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(clampSidebarWidth(width));
  }, []);

  // Entering mobile mode always starts with the JSON drawer closed so the visual workspace is visible first.
  useEffect(() => {
    if (isMobile && !wasMobileRef.current) {
      setIsSidebarCollapsed(true);
    }
    wasMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    storageService.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(isSidebarCollapsed));
  }, [isSidebarCollapsed, isMobile]);

  // Width is persisted once per drag (on release), not on every pointer move.
  useEffect(() => {
    if (isResizing) return;
    storageService.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(sidebarWidth));
  }, [sidebarWidth, isResizing]);

  useEffect(() => () => stopDragRef.current?.(), []);

  const startResizing = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    stopDragRef.current?.();

    const handle = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try {
      handle.setPointerCapture(pointerId);
    } catch {}

    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // One state update per animation frame at most, however fast the pointer moves.
    let frame = 0;
    let pendingX = e.clientX;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      pendingX = moveEvent.clientX;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setSidebarWidthState(clampSidebarWidth(pendingX));
      });
    };

    const stop = () => {
      if (frame) {
        // Flush the last move that was still waiting for its animation frame.
        window.cancelAnimationFrame(frame);
        frame = 0;
        setSidebarWidthState(clampSidebarWidth(pendingX));
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      handle.removeEventListener("lostpointercapture", stop);
      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {}
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      stopDragRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    handle.addEventListener("lostpointercapture", stop);
    stopDragRef.current = stop;
  }, []);

  return {
    sidebarWidth,
    setSidebarWidth,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isResizing,
    startResizing
  };
}
