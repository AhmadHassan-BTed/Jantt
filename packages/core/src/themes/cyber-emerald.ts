import { ThemeDefinition } from "./types";

export const cyberEmeraldTheme: ThemeDefinition = {
  id: "cyber-emerald",
  name: "Cyber Emerald",
  label: "Cyber Emerald",
  mode: "dark",
  className: "jantt-theme-cyber-emerald",
  description: "Futuristic dark neon aesthetic with glowing emerald matrix gridlines and high-contrast indicators.",
  vars: {
    "--jantt-bg": "#041410",
    "--jantt-surface": "rgba(6, 32, 25, 0.9)",
    "--jantt-surface-hover": "rgba(10, 48, 38, 0.92)",
    "--jantt-surface-solid": "#07261E",
    "--jantt-border": "rgba(16, 185, 129, 0.28)",
    "--jantt-border-subtle": "rgba(16, 185, 129, 0.14)",
    "--jantt-border-strong": "rgba(16, 185, 129, 0.45)",
    "--jantt-text": "#ECFDF5",
    "--jantt-text-muted": "#6EE7B7",
    "--jantt-text-dim": "#34D399",
    "--jantt-accent": "#10B981",
    "--jantt-accent-glow": "rgba(16, 185, 129, 0.4)",
    "--jantt-accent-contrast": "#000000",
    "--jantt-today": "#F43F5E",
    "--jantt-critical": "#FBBF24",
    "--jantt-critical-glow": "rgba(251, 191, 36, 0.4)",
    "--jantt-weekend-bg": "transparent",
    "--jantt-grid-line": "rgba(16, 185, 129, 0.15)",
    "--jantt-grid-row-line": "rgba(16, 185, 129, 0.10)",
    "--jantt-dep-line": "#059669",
    "--jantt-dep-line-active": "#34D399",
    "--jantt-shadow": "0 25px 50px -12px rgba(4, 20, 16, 0.75)"
  }
};
