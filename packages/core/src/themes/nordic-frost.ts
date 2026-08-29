import { ThemeDefinition } from "./types";

export const nordicFrostTheme: ThemeDefinition = {
  id: "nordic-frost",
  name: "Nordic Frost",
  label: "Nordic Frost (Glacier Minimal)",
  mode: "light",
  className: "jantt-theme-nordic-frost",
  description: "Minimalist Scandinavian glacial design with icy porcelain surfaces, cool steel borders, and cobalt blue highlights.",
  vars: {
    "--jantt-bg": "#F0F4F8",
    "--jantt-surface": "rgba(255, 255, 255, 0.95)",
    "--jantt-surface-hover": "rgba(235, 242, 250, 0.95)",
    "--jantt-surface-solid": "#FFFFFF",
    "--jantt-border": "rgba(30, 58, 138, 0.1)",
    "--jantt-border-subtle": "rgba(30, 58, 138, 0.05)",
    "--jantt-border-strong": "rgba(30, 58, 138, 0.2)",
    "--jantt-text": "#0F172A",
    "--jantt-text-muted": "#334155",
    "--jantt-text-dim": "#64748B",
    "--jantt-accent": "#2563EB",
    "--jantt-accent-glow": "rgba(37, 99, 235, 0.25)",
    "--jantt-accent-contrast": "#FFFFFF",
    "--jantt-today": "#E11D48",
    "--jantt-critical": "#D97706",
    "--jantt-critical-glow": "rgba(217, 119, 6, 0.3)",
    "--jantt-weekend-bg": "rgba(226, 232, 240, 0.6)",
    "--jantt-grid-line": "rgba(30, 58, 138, 0.06)",
    "--jantt-grid-row-line": "rgba(30, 58, 138, 0.05)",
    "--jantt-dep-line": "#64748B",
    "--jantt-dep-line-active": "#2563EB",
    "--jantt-shadow": "0 20px 40px -10px rgba(15, 23, 42, 0.07)"
  }
};
