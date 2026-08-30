import { ThemeDefinition } from "./types";

export const midnightRoseTheme: ThemeDefinition = {
  id: "midnight-rose",
  name: "Midnight Rose",
  label: "Midnight Rose",
  mode: "dark",
  className: "jantt-theme-midnight-rose",
  description: "Synthwave midnight nebula with deep amethyst shadows, glowing fuchsia pink accents, and rose gridlines.",
  vars: {
    "--jantt-bg": "#12081C",
    "--jantt-surface": "rgba(30, 14, 46, 0.9)",
    "--jantt-surface-hover": "rgba(45, 20, 69, 0.92)",
    "--jantt-surface-solid": "#1E0E2E",
    "--jantt-border": "rgba(244, 63, 94, 0.22)",
    "--jantt-border-subtle": "rgba(244, 63, 94, 0.1)",
    "--jantt-border-strong": "rgba(244, 63, 94, 0.38)",
    "--jantt-text": "#FFF1F2",
    "--jantt-text-muted": "#FDA4AF",
    "--jantt-text-dim": "#FB7185",
    "--jantt-accent": "#F43F5E",
    "--jantt-accent-glow": "rgba(244, 63, 94, 0.4)",
    "--jantt-accent-contrast": "#FFFFFF",
    "--jantt-today": "#38BDF8",
    "--jantt-critical": "#FBBF24",
    "--jantt-critical-glow": "rgba(251, 191, 36, 0.4)",
    "--jantt-weekend-bg": "transparent",
    "--jantt-grid-line": "rgba(244, 63, 94, 0.08)",
    "--jantt-grid-row-line": "rgba(244, 63, 94, 0.07)",
    "--jantt-dep-line": "#BE185D",
    "--jantt-dep-line-active": "#FB7185",
    "--jantt-shadow": "0 25px 50px -12px rgba(18, 8, 28, 0.8)"
  }
};
