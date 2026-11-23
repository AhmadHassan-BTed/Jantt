import { useEffect } from "react";

const KEYBOARD_SHRINK_THRESHOLD_PX = 140;

/**
 * Tracks the visual viewport so mobile sheets, the Copilot composer and Notes inputs stay above
 * the virtual keyboard. `--jantt-vvh` is the real usable height; `data-keyboard-open` lets CSS
 * hide the bottom navigation and quick-add button while typing.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!viewport) return;

    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--jantt-vvh", `${Math.round(viewport.height)}px`);
      const keyboardOpen = window.innerHeight - viewport.height > KEYBOARD_SHRINK_THRESHOLD_PX;
      root.setAttribute("data-keyboard-open", keyboardOpen ? "true" : "false");
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--jantt-vvh");
      root.removeAttribute("data-keyboard-open");
    };
  }, []);
}
