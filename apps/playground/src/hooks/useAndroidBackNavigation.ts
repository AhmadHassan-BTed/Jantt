import { useEffect, useRef } from "react";

export interface BackNavigationOverlay {
  id: string;
  isOpen: boolean;
  /** Return false when a draft or confirmation keeps the overlay open. */
  close: () => void | boolean;
}

/**
 * Maps Android's hardware/gesture Back button to the top-most open overlay. The open stack
 * shares a history sentinel that preserves the current URL, including room credentials.
 */
export function useAndroidBackNavigation(overlays: BackNavigationOverlay[], enabled: boolean): void {
  const overlaysRef = useRef(overlays);
  const suppressPopRef = useRef(false);
  overlaysRef.current = overlays;

  const openOverlays = overlays.filter((overlay) => overlay.isOpen);
  const topId = openOverlays.length > 0 ? openOverlays[openOverlays.length - 1].id : null;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const currentState = window.history.state;
    const baseState =
      currentState && typeof currentState === "object" ? (currentState as Record<string, unknown>) : {};
    const sentinelId = typeof baseState.janttOverlay === "string" ? baseState.janttOverlay : null;

    if (topId && sentinelId !== topId) {
      const nextState = { ...baseState, janttOverlay: topId };
      if (sentinelId) window.history.replaceState(nextState, "", window.location.href);
      else window.history.pushState(nextState, "", window.location.href);
    } else if (!topId && sentinelId) {
      suppressPopRef.current = true;
      window.history.back();
    }
  }, [enabled, topId]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const handlePopState = () => {
      if (suppressPopRef.current) {
        suppressPopRef.current = false;
        return;
      }
      const top = overlaysRef.current.filter((overlay) => overlay.isOpen).slice(-1)[0];
      if (top?.close() === false) {
        window.history.pushState({ ...window.history.state, janttOverlay: top.id }, "", window.location.href);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [enabled]);
}
