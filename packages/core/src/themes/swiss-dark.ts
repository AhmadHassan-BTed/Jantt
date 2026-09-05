import { ThemeDefinition } from "./types";

export const swissDarkTheme: ThemeDefinition = {
  id: "swiss-dark",
  name: "Swiss Noir",
  label: "Swiss Noir",
  mode: "dark",
  className: "jantt-theme-dark",
  description: "True OLED pitch-black minimalism with titanium-silver lines, ultra-high contrast typography, and pure monochrome elegance.",
  vars: {
    "--jantt-bg": "#000000",
    "--jantt-surface": "rgba(16, 16, 18, 0.95)",
    "--jantt-surface-hover": "rgba(28, 28, 32, 0.95)",
    "--jantt-surface-solid": "#101012",
    "--jantt-border": "rgba(255, 255, 255, 0.14)",
    "--jantt-border-subtle": "rgba(255, 255, 255, 0.07)",
    "--jantt-border-strong": "rgba(255, 255, 255, 0.28)",
    "--jantt-text": "#FFFFFF",
    "--jantt-text-muted": "#A1A1AA",
    "--jantt-text-dim": "#71717A",
    "--jantt-accent": "#FFFFFF",
    "--jantt-accent-glow": "rgba(255, 255, 255, 0.30)",
    "--jantt-accent-contrast": "#000000",
    "--jantt-today": "#EF4444",
    "--jantt-critical": "#F43F5E",
    "--jantt-critical-glow": "rgba(244, 63, 94, 0.40)",
    "--jantt-weekend-bg": "transparent",
    "--jantt-grid-line": "rgba(255, 255, 255, 0.08)",
    "--jantt-grid-row-line": "rgba(255, 255, 255, 0.05)",
    "--jantt-dep-line": "#52525B",
    "--jantt-dep-line-active": "#FFFFFF",
    "--jantt-shadow": "0 25px 50px -12px rgba(0, 0, 0, 0.95)"
  }
};
