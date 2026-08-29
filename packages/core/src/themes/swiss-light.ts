import { ThemeDefinition } from "./types";

export const swissLightTheme: ThemeDefinition = {
  id: "swiss-light",
  name: "Swiss Light 2.0",
  label: "Swiss Light 2.0 (Alpine Glass)",
  mode: "light",
  className: "jantt-theme-light",
  description: "Ultra-clean alpine aesthetic with crisp slate typography, frosted white glass, and vibrant azure accents.",
  vars: {
    "--jantt-bg": "#F8FAFC",
    "--jantt-surface": "rgba(255, 255, 255, 0.9)",
    "--jantt-surface-hover": "rgba(241, 245, 249, 0.92)",
    "--jantt-surface-solid": "#FFFFFF",
    "--jantt-border": "rgba(15, 23, 42, 0.08)",
    "--jantt-border-subtle": "rgba(15, 23, 42, 0.04)",
    "--jantt-border-strong": "rgba(15, 23, 42, 0.16)",
    "--jantt-text": "#0F172A",
    "--jantt-text-muted": "#475569",
    "--jantt-text-dim": "#94A3B8",
    "--jantt-accent": "#0284C7",
    "--jantt-accent-glow": "rgba(2, 132, 199, 0.22)",
    "--jantt-accent-contrast": "#FFFFFF",
    "--jantt-today": "#E11D48",
    "--jantt-critical": "#D97706",
    "--jantt-critical-glow": "rgba(217, 119, 6, 0.25)",
    "--jantt-weekend-bg": "rgba(241, 245, 249, 0.7)",
    "--jantt-grid-line": "rgba(15, 23, 42, 0.05)",
    "--jantt-grid-row-line": "rgba(15, 23, 42, 0.06)",
    "--jantt-dep-line": "#94A3B8",
    "--jantt-dep-line-active": "#0284C7",
    "--jantt-shadow": "0 20px 40px -10px rgba(15, 23, 42, 0.08)"
  }
};
