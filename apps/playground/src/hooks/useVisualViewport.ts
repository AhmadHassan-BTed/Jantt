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
    let frame = 0;
    const update = () => {
      frame = 0;
      const typing = document.activeElement?.matches("input, textarea, [contenteditable=true]");
      const keyboardOpen = Boolean(typing && viewport.scale <= 1.05 &&
        window.innerHeight - viewport.height > KEYBOARD_SHRINK_THRESHOLD_PX);
      root.style.setProperty("--jantt-vvh", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--jantt-vv-top", `${Math.round(viewport.offsetTop)}px`);
      root.setAttribute("data-keyboard-open", String(keyboardOpen));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      root.style.removeProperty("--jantt-vvh");
      root.style.removeProperty("--jantt-vv-top");
      root.removeAttribute("data-keyboard-open");
    };
  }, []);
}
