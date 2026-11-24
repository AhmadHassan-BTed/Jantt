import type { AppSurface } from "./types";

const TWA_SESSION_KEY = "jantt_twa_android_session";
const STANDALONE_DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

/** Session storage shape used by detection functions (a Storage in the browser). */
export type SessionStore = Pick<Storage, "getItem" | "setItem">;

/**
 * Trusted Web Activity detection. The first page sees an `android-app://` referrer; later in-app
 * navigations do not, so the result is kept for the browser session.
 */
export function detectIsTwa(referrer: string, sessionStorage: SessionStore | null | undefined): boolean {
  if (!sessionStorage) return referrer.startsWith("android-app://");
  try {
    if (referrer.startsWith("android-app://")) {
      sessionStorage.setItem(TWA_SESSION_KEY, "1");
      return true;
    }
    return sessionStorage.getItem(TWA_SESSION_KEY) === "1";
  } catch {
    return referrer.startsWith("android-app://");
  }
}

/** Installed app: display-mode standalone/fullscreen, iOS `navigator.standalone`, or Android TWA. */
export function detectIsStandalone(win: Window): boolean {
  if (typeof win.matchMedia === "function") {
    const isDisplayModeStandalone = STANDALONE_DISPLAY_MODES.some(
      (mode) => win.matchMedia(`(display-mode: ${mode})`).matches
    );
    if (isDisplayModeStandalone) return true;
  }
  if ((win.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return detectIsTwa(win.document?.referrer || "", win.sessionStorage);
}

/** iOS/iPadOS Safari, where install instructions must be shown instead of a native prompt. */
export function detectIsIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const isIosDevice = /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (!isIosDevice) return false;
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(userAgent);
  return /Safari/i.test(userAgent) && !isOtherBrowser;
}

export function resolveAppSurface({
  isMobile,
  isStandalone,
  isTwa
}: {
  isMobile: boolean;
  isStandalone: boolean;
  isTwa: boolean;
}): AppSurface {
  if (isTwa) return "twa-android";
  if (isStandalone) return isMobile ? "pwa-mobile" : "pwa-desktop";
  return isMobile ? "web-mobile" : "web-desktop";
}

/** Declarative CSS hooks for every surface, installed app and connectivity state. */
export function syncDocumentPlatformAttributes({
  surface,
  isStandalone,
  isOnline
}: {
  surface: AppSurface;
  isStandalone: boolean;
  isOnline: boolean;
}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-surface", surface);
  root.setAttribute("data-standalone", isStandalone ? "true" : "false");
  root.setAttribute("data-offline", isOnline ? "false" : "true");
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Keeps Android's status bar and gesture navigation bar in step with the selected Jantt theme.
 * Falls back to the brand backdrop when a theme supplies a non-hex background value.
 */
export function syncThemeColorMeta(mode: "dark" | "light", bgColor?: string | null): void {
  if (typeof document === "undefined") return;
  const content = bgColor && HEX_COLOR.test(bgColor) ? bgColor : mode === "light" ? "#FFFFFF" : "#000000";
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  if (meta.content !== content) meta.content = content;
}
