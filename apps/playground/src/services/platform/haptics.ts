export type HapticStyle = "light" | "medium" | "success";

const HAPTIC_PATTERNS: Record<HapticStyle, number[]> = {
  light: [8],
  medium: [14],
  success: [10, 30, 10]
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Subtle native-feeling vibration on Android; a silent no-op everywhere else. */
export function triggerHaptic(style: HapticStyle): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate(HAPTIC_PATTERNS[style]);
  } catch {
    // Vibration can be rejected by policy; haptics are never allowed to break an interaction.
  }
}
