export type ThemeMode = "dark" | "light";

export interface ThemeDefinition {
  /** Unique theme identifier (e.g. "swiss-dark", "swiss-light", "cyber-emerald") */
  id: string;
  /** Human-readable display label */
  label: string;
  /** Short theme name */
  name: string;
  /** Color mode scheme */
  mode: ThemeMode;
  /** CSS class name applied to container (e.g. "jantt-theme-dark", "jantt-theme-light") */
  className: string;
  /** Brief description of the design aesthetic */
  description: string;
  /** CSS custom properties map for the theme */
  vars: Record<string, string>;
  /** Optional default palette colors for common categories */
  categoryDefaults?: Record<string, { color: string; soft: string }>;
}
