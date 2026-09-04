import { useState, useRef, useCallback, useEffect } from "react";
import { STORAGE_KEYS } from "../constants";

interface UseSidebarResizeOptions {
  initialWidth: number;
  initialCollapsed: boolean;
}

export function useSidebarResize({ initialWidth, initialCollapsed }: UseSidebarResizeOptions) {
  const [sidebarWidth, setSidebarWidth] = useState<number>(initialWidth);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(initialCollapsed);
  const [isResizing, setIsResizing] = useState(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(isSidebarCollapsed));
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(sidebarWidth));
    } catch {}
  }, [isSidebarCollapsed, sidebarWidth]);

  const startResizing = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const minW = 280;
      const maxW = Math.max(minW, window.innerWidth - 360);
      const newW = Math.max(minW, Math.min(maxW, moveEvent.clientX));
      setSidebarWidth(newW);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
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
