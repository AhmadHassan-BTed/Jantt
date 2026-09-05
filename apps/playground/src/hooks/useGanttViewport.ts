import { useState, useEffect, useCallback } from "react";
import {
  type TimeScale,
  type LinkRoutingStyle,
  type RowHeightMode,
  type ThemeDefinition,
  themeManager
} from "@jantt/core";
import type { ActiveView } from "../types";
import { STORAGE_KEYS, AVAILABLE_THEMES } from "../constants";

interface UseGanttViewportOptions {
  initialTheme: string;
  initialScale: TimeScale;
  initialRouting: LinkRoutingStyle;
  initialRowHeightMode: RowHeightMode;
  initialRowHeight: number;
  initialCritical: boolean;
  initialBaselines: boolean;
  initialAutoCascade: boolean;
  initialView: ActiveView;
}

export function useGanttViewport(options: UseGanttViewportOptions) {
  const [selectedThemeId, setSelectedThemeId] = useState(options.initialTheme);
  const activeTheme: ThemeDefinition = themeManager.getTheme(selectedThemeId) || AVAILABLE_THEMES[0];
  const [currentScale, setCurrentScale] = useState<TimeScale>(options.initialScale);
  const [currentDayWidth, setCurrentDayWidth] = useState<number | undefined>(undefined);
  const [linkRouting, setLinkRouting] = useState<LinkRoutingStyle>(options.initialRouting);
  const [rowHeightMode, setRowHeightMode] = useState<RowHeightMode>(options.initialRowHeightMode);
  const [rowHeight, setRowHeight] = useState<number>(options.initialRowHeight);
  const [showCriticalPath, setShowCriticalPath] = useState(options.initialCritical);
  const [showBaselines, setShowBaselines] = useState(options.initialBaselines);
  const [autoCascade, setAutoCascade] = useState<boolean>(options.initialAutoCascade);
  const [activeView, setActiveViewState] = useState<ActiveView>(options.initialView);

  const setActiveView = useCallback((newView: ActiveView) => {
    setActiveViewState(newView);
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW, newView);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("view", newView);
        window.history.replaceState(null, "", url.toString());
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, selectedThemeId);
      localStorage.setItem(STORAGE_KEYS.SCALE, currentScale);
      localStorage.setItem(STORAGE_KEYS.ROUTING, linkRouting);
      localStorage.setItem(STORAGE_KEYS.ROW_HEIGHT_MODE, rowHeightMode);
      localStorage.setItem(STORAGE_KEYS.ROW_HEIGHT, String(rowHeight));
      localStorage.setItem(STORAGE_KEYS.CRITICAL, String(showCriticalPath));
      localStorage.setItem(STORAGE_KEYS.BASELINES, String(showBaselines));
      localStorage.setItem(STORAGE_KEYS.AUTO_CASCADE, String(autoCascade));
      localStorage.setItem(STORAGE_KEYS.VIEW, activeView);
    } catch {}
  }, [
    selectedThemeId,
    currentScale,
    linkRouting,
    rowHeightMode,
    rowHeight,
    showCriticalPath,
    showBaselines,
    autoCascade,
    activeView
  ]);

  return {
    selectedThemeId,
    setSelectedThemeId,
    activeTheme,
    currentScale,
    setCurrentScale,
    currentDayWidth,
    setCurrentDayWidth,
    linkRouting,
    setLinkRouting,
    rowHeightMode,
    setRowHeightMode,
    rowHeight,
    setRowHeight,
    showCriticalPath,
    setShowCriticalPath,
    showBaselines,
    setShowBaselines,
    autoCascade,
    setAutoCascade,
    activeView,
    setActiveView
  };
}
