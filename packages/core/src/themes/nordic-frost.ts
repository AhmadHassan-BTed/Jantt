import { ThemeDefinition } from "./types";

export const nordicFrostTheme: ThemeDefinition = {
  id: "nordic-frost",
  name: "Nordic Frost",
  label: "Nordic Frost",
  mode: "dark",
  className: "jantt-theme-nordic-frost",
  description: "Sub-zero Scandinavian glacial design with deep polar navy surfaces, crystal ice borders, and glowing iceberg cyan highlights.",
  vars: {
    "--jantt-bg": "#0B132B",
    "--jantt-surface": "rgba(16, 29, 66, 0.88)",
    "--jantt-surface-hover": "rgba(28, 48, 96, 0.94)",
    "--jantt-surface-solid": "#101D42",
    "--jantt-border": "rgba(56, 189, 248, 0.25)",
    "--jantt-border-subtle": "rgba(56, 189, 248, 0.12)",
    "--jantt-border-strong": "rgba(56, 189, 248, 0.45)",
    "--jantt-text": "#F0F9FF",
    "--jantt-text-muted": "#BAE6FD",
    "--jantt-text-dim": "#7DD3FC",
    "--jantt-accent": "#38BDF8",
    "--jantt-accent-glow": "rgba(56, 189, 248, 0.4)",
    "--jantt-accent-contrast": "#031326",
    "--jantt-today": "#FB7185",
    "--jantt-critical": "#FBBF24",
    "--jantt-critical-glow": "rgba(251, 191, 36, 0.4)",
    "--jantt-weekend-bg": "transparent",
    "--jantt-grid-line": "rgba(56, 189, 248, 0.15)",
    "--jantt-grid-row-line": "rgba(56, 189, 248, 0.10)",
    "--jantt-dep-line": "#0284C7",
    "--jantt-dep-line-active": "#38BDF8",
    "--jantt-shadow": "0 25px 50px -12px rgba(11, 19, 43, 0.7)"
  }
};

