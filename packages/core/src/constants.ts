import { Category, TimeScale } from "./types";

export const DAY_WIDTH_MIN = 1.2;
export const DAY_WIDTH_MAX = 80;

export const DEFAULT_ROW_HEIGHT = 46;
export const MIN_ROW_HEIGHT = 26;
export const MAX_ROW_HEIGHT = 140;

export const DEFAULT_LABEL_WIDTH = 340;
export const MIN_LABEL_WIDTH = 180;
export const MAX_LABEL_WIDTH = 600;

export const DEFAULT_HEADER_HEIGHT = 58;
export const MULTI_YEAR_HEADER_HEIGHT = 78;
export const TOOLBAR_HEIGHT = 50;
export const ADD_ROW_HEIGHT = 38;

export const DEFAULT_GAP_DAYS = 2;

export const DEFAULT_CATEGORY: Category = {
  label: "General",
  color: "#3B82F6",
  soft: "#1E293B"
};

export const SCALE_DAY_WIDTHS: Record<TimeScale, number> = {
  day: 52,
  week: 24,
  month: 10,
  quarter: 4.5,
  year: 2.2
};
