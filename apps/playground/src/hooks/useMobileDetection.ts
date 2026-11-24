import { useState, useEffect } from "react";

export type DeviceOrientation = "portrait" | "landscape";

export interface MobileDetectionState {
  isMobile: boolean;
  isTablet: boolean;
  orientation: DeviceOrientation;
  isLandscape: boolean;
  isPortrait: boolean;
  isImmersiveLandscape: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Breakpoints shared with index.css. Keep the CSS `@media` rules for the mobile layout in sync:
 * narrow screens, plus landscape phones (short, touch-first) that are wider than 768px.
 */
export const MOBILE_MEDIA_QUERY =
  "(max-width: 840px), (max-height: 519px) and (max-width: 950px) and (pointer: coarse)";
const TABLET_MEDIA_QUERY = "(max-width: 1024px)";
const LANDSCAPE_MEDIA_QUERY = "(orientation: landscape)";
/** Full-bleed chart without chrome: only for touch phones held sideways, never for small desktop windows. */
const IMMERSIVE_MEDIA_QUERY = "(orientation: landscape) and (max-height: 519px) and (pointer: coarse)";

const SSR_STATE: MobileDetectionState = {
  isMobile: false,
  isTablet: false,
  orientation: "landscape",
  isLandscape: true,
  isPortrait: false,
  isImmersiveLandscape: false,
  viewportWidth: 1280,
  viewportHeight: 800
};

function canMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function readState(): MobileDetectionState {
  if (!canMatchMedia()) return SSR_STATE;
  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const isLandscape = window.matchMedia(LANDSCAPE_MEDIA_QUERY).matches;
  return {
    isMobile,
    isTablet: !isMobile && window.matchMedia(TABLET_MEDIA_QUERY).matches,
    orientation: isLandscape ? "landscape" : "portrait",
    isLandscape,
    isPortrait: !isLandscape,
    isImmersiveLandscape: isMobile && window.matchMedia(IMMERSIVE_MEDIA_QUERY).matches,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
}

/** Compares only the layout-driving flags, so pure size changes do not re-render the app. */
function sameLayout(a: MobileDetectionState, b: MobileDetectionState): boolean {
  return (
    a.isMobile === b.isMobile &&
    a.isTablet === b.isTablet &&
    a.isLandscape === b.isLandscape &&
    a.isImmersiveLandscape === b.isImmersiveLandscape
  );
}

/**
 * Device-class detection driven by `matchMedia`, so JS layout decisions and CSS breakpoints agree.
 * Updates only when a breakpoint flips; `viewportWidth`/`viewportHeight` are a snapshot from that moment.
 */
export function useMobileDetection(): MobileDetectionState {
  const [state, setState] = useState<MobileDetectionState>(readState);

  useEffect(() => {
    if (!canMatchMedia()) return;
    const update = () => {
      setState((prev) => {
        const next = readState();
        return sameLayout(prev, next) ? prev : next;
      });
    };
    const queries = [MOBILE_MEDIA_QUERY, TABLET_MEDIA_QUERY, LANDSCAPE_MEDIA_QUERY, IMMERSIVE_MEDIA_QUERY].map(
      (q) => window.matchMedia(q)
    );
    queries.forEach((mql) => {
      if (typeof mql.addEventListener === "function") mql.addEventListener("change", update);
      else mql.addListener(update);
    });
    update();
    return () => {
      queries.forEach((mql) => {
        if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", update);
        else mql.removeListener(update);
      });
    };
  }, []);

  return state;
}
