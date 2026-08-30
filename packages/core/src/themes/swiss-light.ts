import { ThemeDefinition } from "./types";

export const swissLightTheme: ThemeDefinition = {
  id: "swiss-light",
  name: "Swiss Light",
  label: "Swiss Light",
  mode: "light",
  className: "jantt-theme-light",
  description: "True Swiss Modern 2.0: Ultra-clean porcelain canvas, razor-sharp hairline borders, ink typography, and high-precision international accents.",
  vars: {
    "--jantt-bg": "#FFFFFF",
    "--jantt-surface": "#F8FAFC",
    "--jantt-surface-hover": "#F1F5F9",
    "--jantt-surface-solid": "#FFFFFF",
    "--jantt-border": "#E2E8F0",
    "--jantt-border-subtle": "#F1F5F9",
    "--jantt-border-strong": "#CBD5E1",
    "--jantt-text": "#0F172A",
    "--jantt-text-muted": "#475569",
    "--jantt-text-dim": "#94A3B8",
    "--jantt-accent": "#0284C7",
    "--jantt-accent-glow": "rgba(2, 132, 199, 0.14)",
    "--jantt-accent-contrast": "#FFFFFF",
    "--jantt-today": "#E11D48",
    "--jantt-critical": "#D97706",
    "--jantt-critical-glow": "rgba(217, 119, 6, 0.18)",
    "--jantt-weekend-bg": "transparent",
    "--jantt-grid-line": "#F1F5F9",
    "--jantt-grid-row-line": "#F1F5F9",
    "--jantt-dep-line": "#94A3B8",
    "--jantt-dep-line-active": "#0284C7",
    "--jantt-shadow": "none"
  }
};
