import { ThemeDefinition } from "./types";

export const beenieTheme: ThemeDefinition = {
  id: "beenie",
  name: "Beenie",
  label: "Beenie",
  mode: "light",
  className: "jantt-theme-beenie",
  description: "Enchanting cherry blossom aesthetic with soft petal pinks, porcelain white, floral accents, and delicate blossom glow.",
  vars: {
    "--jantt-bg": "#FFF5F8",
    "--jantt-surface": "rgba(255, 240, 245, 0.94)",
    "--jantt-surface-hover": "rgba(254, 226, 236, 0.96)",
    "--jantt-surface-solid": "#FFE4EE",
    "--jantt-border": "rgba(244, 114, 182, 0.35)",
    "--jantt-border-subtle": "rgba(244, 114, 182, 0.18)",
    "--jantt-border-strong": "rgba(236, 72, 153, 0.50)",
    "--jantt-text": "#831843",
    "--jantt-text-muted": "#9D174D",
    "--jantt-text-dim": "#DB2777",
    "--jantt-accent": "#EC4899",
    "--jantt-accent-glow": "rgba(236, 72, 153, 0.35)",
    "--jantt-accent-contrast": "#FFFFFF",
    "--jantt-today": "#F43F5E",
    "--jantt-critical": "#FB7185",
    "--jantt-critical-glow": "rgba(251, 113, 133, 0.40)",
    "--jantt-bar-done": "#D4A5B8",
    "--jantt-bar-done-subtle": "rgba(212, 165, 184, 0.25)",
    "--jantt-weekend-bg": "rgba(255, 228, 236, 0.25)",
    "--jantt-grid-line": "rgba(244, 114, 182, 0.16)",
    "--jantt-grid-row-line": "rgba(244, 114, 182, 0.12)",
    "--jantt-dep-line": "#F472B6",
    "--jantt-dep-line-active": "#BE185D",
    "--jantt-bar-radius": "14px",
    "--jantt-glass-blur": "18px",
    "--jantt-shadow": "0 20px 45px -12px rgba(236, 72, 153, 0.22)"
  }
};
