import { ThemeDefinition } from "./types";

export const swissDarkTheme: ThemeDefinition = {
  id: "swiss-dark",
  name: "Swiss Dark",
  label: "Swiss Dark",
  mode: "dark",
  className: "jantt-theme-dark",
  description: "Deep obsidian sapphire glassmorphism with high-contrast precision grid lines and azure accents.",
  vars: {
    "--jantt-bg": "#090E1A",
    "--jantt-surface": "rgba(18, 26, 44, 0.9)",
    "--jantt-surface-hover": "rgba(28, 40, 68, 0.92)",
    "--jantt-surface-solid": "#121A2C",
    "--jantt-border": "rgba(255, 255, 255, 0.14)",
    "--jantt-border-subtle": "rgba(255, 255, 255, 0.08)",
    "--jantt-border-strong": "rgba(255, 255, 255, 0.24)",
    "--jantt-text": "#F8FAFC",
    "--jantt-text-muted": "#94A3B8",
    "--jantt-text-dim": "#64748B",
    "--jantt-accent": "#38BDF8",
    "--jantt-accent-glow": "rgba(56, 189, 248, 0.35)",
    "--jantt-accent-contrast": "#000000",
    "--jantt-today": "#F43F5E",
    "--jantt-critical": "#F59E0B",
    "--jantt-critical-glow": "rgba(245, 158, 11, 0.35)",
    "--jantt-weekend-bg": "transparent",
    "--jantt-grid-line": "rgba(255, 255, 255, 0.12)",
    "--jantt-grid-row-line": "rgba(255, 255, 255, 0.09)",
    "--jantt-dep-line": "#475569",
    "--jantt-dep-line-active": "#38BDF8",
    "--jantt-shadow": "0 25px 50px -12px rgba(0, 0, 0, 0.55)"
  }
};
