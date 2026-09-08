import { useState, useEffect, useCallback } from "react";

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

export function useMobileDetection(): MobileDetectionState {
  const getMetrics = useCallback((): MobileDetectionState => {
    if (typeof window === "undefined") {
      return {
        isMobile: false,
        isTablet: false,
        orientation: "landscape",
        isLandscape: true,
        isPortrait: false,
        isImmersiveLandscape: false,
        viewportWidth: 1280,
        viewportHeight: 800
      };
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const isMobile = w <= 768 || (h <= 500 && w <= 950);
    const isTablet = !isMobile && w <= 1024;
    const orientation: DeviceOrientation = h >= w ? "portrait" : "landscape";
    const isLandscape = orientation === "landscape";
    const isPortrait = orientation === "portrait";
    // Immersive landscape on phone: landscape orientation on a mobile-sized device
    const isImmersiveLandscape = isMobile && isLandscape && h < 520;

    return {
      isMobile,
      isTablet,
      orientation,
      isLandscape,
      isPortrait,
      isImmersiveLandscape,
      viewportWidth: w,
      viewportHeight: h
    };
  }, []);

  const [state, setState] = useState<MobileDetectionState>(getMetrics);

  useEffect(() => {
    let timeoutId: number | null = null;
    const handleResize = () => {
      if (timeoutId !== null) window.cancelAnimationFrame(timeoutId);
      timeoutId = window.requestAnimationFrame(() => {
        setState(getMetrics());
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    // Initial check
    setState(getMetrics());

    return () => {
      if (timeoutId !== null) window.cancelAnimationFrame(timeoutId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [getMetrics]);

  return state;
}
