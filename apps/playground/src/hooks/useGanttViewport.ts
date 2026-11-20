import { useState, useEffect, useCallback, useMemo } from "react";
import {
  type TimeScale,
  type LinkRoutingStyle,
  type RowHeightMode,
  type ThemeDefinition,
  themeManager
} from "@jantt/core";
import type { ActiveView } from "../types";
import { STORAGE_KEYS, AVAILABLE_THEMES } from "../constants";
import { storageService } from "../services/storage";

/** Theme ids reach share links, embed snippets and storage: only registered themes are accepted. */
function isKnownThemeId(themeId: unknown): themeId is string {
  return typeof themeId === "string" && Boolean(themeManager.getTheme(themeId));
}

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
  /** The user's own theme choice; the only theme that is persisted. */
  const [personalThemeId, setPersonalThemeId] = useState(() =>
    isKnownThemeId(options.initialTheme) ? options.initialTheme : AVAILABLE_THEMES[0].id
  );
  /** Session-only theme imposed by the open plan (e.g. a cloud room); never persisted. */
  const [planThemeId, setPlanThemeId] = useState<string | null>(null);
  const selectedThemeId = planThemeId ?? personalThemeId;
  const activeTheme: ThemeDefinition = themeManager.getTheme(selectedThemeId) || AVAILABLE_THEMES[0];
  const [currentScale, setCurrentScale] = useState<TimeScale>(options.initialScale);
  const [currentDayWidth, setCurrentDayWidth] = useState<number | undefined>(() => {
    const raw = storageService.getItem<string>(STORAGE_KEYS.DAY_WIDTH);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  });
  const [linkRouting, setLinkRouting] = useState<LinkRoutingStyle>(options.initialRouting);
  const [rowHeightMode, setRowHeightMode] = useState<RowHeightMode>(options.initialRowHeightMode);
  const [rowHeight, setRowHeight] = useState<number>(options.initialRowHeight);
  const [showCriticalPath, setShowCriticalPath] = useState(options.initialCritical);
  const [showBaselines, setShowBaselines] = useState(options.initialBaselines);
  const [autoCascade, setAutoCascade] = useState<boolean>(options.initialAutoCascade);
  const [activeView, setActiveViewState] = useState<ActiveView>(options.initialView);

  /** Explicit user choice: becomes the personal theme and drops any plan override. Unknown ids are ignored. */
  const setSelectedThemeId = useCallback((themeId: string) => {
    if (!isKnownThemeId(themeId)) return;
    setPersonalThemeId(themeId);
    setPlanThemeId(null);
  }, []);

  /** Applies a plan-provided theme for this session only (pass null to restore the personal theme). */
  const applyPlanTheme = useCallback((themeId: string | null) => {
    setPlanThemeId(isKnownThemeId(themeId) ? themeId : null);
  }, []);

  const setActiveView = useCallback((newView: ActiveView) => {
    setActiveViewState(newView);
    storageService.setItem(STORAGE_KEYS.VIEW, newView);
    try {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("view", newView);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {}
  }, []);

  // storageService never throws and keeps the newest value in memory when storage is full.
  useEffect(() => {
    storageService.setItem(STORAGE_KEYS.THEME, personalThemeId);
    storageService.setItem(STORAGE_KEYS.SCALE, currentScale);
    if (currentDayWidth !== undefined && Number.isFinite(currentDayWidth)) {
      storageService.setItem(STORAGE_KEYS.DAY_WIDTH, String(currentDayWidth));
    } else {
      storageService.removeItem(STORAGE_KEYS.DAY_WIDTH);
    }
    storageService.setItem(STORAGE_KEYS.ROUTING, linkRouting);
    storageService.setItem(STORAGE_KEYS.ROW_HEIGHT_MODE, rowHeightMode);
    storageService.setItem(STORAGE_KEYS.ROW_HEIGHT, String(rowHeight));
    storageService.setItem(STORAGE_KEYS.CRITICAL, String(showCriticalPath));
    storageService.setItem(STORAGE_KEYS.BASELINES, String(showBaselines));
    storageService.setItem(STORAGE_KEYS.AUTO_CASCADE, String(autoCascade));
    storageService.setItem(STORAGE_KEYS.VIEW, activeView);
  }, [
    personalThemeId,
    currentScale,
    currentDayWidth,
    linkRouting,
    rowHeightMode,
    rowHeight,
    showCriticalPath,
    showBaselines,
    autoCascade,
    activeView
  ]);

  // Stable identity while nothing changed, so consumers' effects and memos do not churn.
  return useMemo(
    () => ({
      selectedThemeId,
      setSelectedThemeId,
      applyPlanTheme,
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
    }),
    [
      selectedThemeId,
      setSelectedThemeId,
      applyPlanTheme,
      activeTheme,
      currentScale,
      currentDayWidth,
      linkRouting,
      rowHeightMode,
      rowHeight,
      showCriticalPath,
      showBaselines,
      autoCascade,
      activeView,
      setActiveView
    ]
  );
}
