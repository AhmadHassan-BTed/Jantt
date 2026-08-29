import { ThemeDefinition } from "./types";

export const sunsetCrimsonTheme: ThemeDefinition = {
  id: "sunset-crimson",
  name: "Sunset Crimson",
  label: "Sunset Crimson (Solar Flare)",
  mode: "dark",
  className: "jantt-theme-sunset-crimson",
  description: "Solar flare glow with molten amber, coral crimson highlights, and deep charcoal slate surfaces.",
  vars: {
    "--jantt-bg": "#180C08",
    "--jantt-surface": "rgba(38, 18, 12, 0.9)",
    "--jantt-surface-hover": "rgba(58, 27, 18, 0.92)",
    "--jantt-surface-solid": "#26120C",
    "--jantt-border": "rgba(249, 115, 22, 0.22)",
    "--jantt-border-subtle": "rgba(249, 115, 22, 0.1)",
    "--jantt-border-strong": "rgba(249, 115, 22, 0.38)",
    "--jantt-text": "#FFF7ED",
    "--jantt-text-muted": "#FDBA74",
    "--jantt-text-dim": "#FB923C",
    "--jantt-accent": "#F97316",
    "--jantt-accent-glow": "rgba(249, 115, 22, 0.4)",
    "--jantt-accent-contrast": "#FFFFFF",
    "--jantt-today": "#38BDF8",
    "--jantt-critical": "#E11D48",
    "--jantt-critical-glow": "rgba(225, 29, 72, 0.4)",
    "--jantt-weekend-bg": "rgba(124, 45, 18, 0.25)",
    "--jantt-grid-line": "rgba(249, 115, 22, 0.08)",
    "--jantt-grid-row-line": "rgba(249, 115, 22, 0.07)",
    "--jantt-dep-line": "#C2410C",
    "--jantt-dep-line-active": "#FB923C",
    "--jantt-shadow": "0 25px 50px -12px rgba(24, 12, 8, 0.8)"
  }
};
