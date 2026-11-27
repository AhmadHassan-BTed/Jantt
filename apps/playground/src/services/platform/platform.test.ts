// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectIsIosSafari,
  detectIsTwa,
  resolveAppSurface,
  syncDocumentPlatformAttributes,
  syncThemeColorMeta,
  shouldBypassServiceWorker,
  isImmutableAssetPath,
  triggerHaptic,
  APP_PROMO_TTL_MS,
  isPromoSuppressed,
  markPromoSeen
} from "./index";

const playgroundRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const publicDir = resolve(playgroundRoot, "public");

describe("platform detection", () => {
  it("resolves every surface", () => {
    expect(resolveAppSurface({ isMobile: false, isStandalone: false, isTwa: false })).toBe("web-desktop");
    expect(resolveAppSurface({ isMobile: true, isStandalone: false, isTwa: false })).toBe("web-mobile");
    expect(resolveAppSurface({ isMobile: false, isStandalone: true, isTwa: false })).toBe("pwa-desktop");
    expect(resolveAppSurface({ isMobile: true, isStandalone: true, isTwa: false })).toBe("pwa-mobile");
    expect(resolveAppSurface({ isMobile: true, isStandalone: true, isTwa: true })).toBe("twa-android");
  });

  it("persists TWA detection across internal navigations", () => {
    const storage = new Map<string, string>();
    const store = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    };
    expect(detectIsTwa("android-app://io.github.ahmadhassan_bted.jantt", store)).toBe(true);
    expect(detectIsTwa("https://ahmadhassan-bted.github.io/Jantt/", store)).toBe(true);
    expect(storage.get("jantt_twa_android_session")).toBe("1");

    const queryStorage = new Map<string, string>();
    const queryStore = {
      getItem: (key: string) => queryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        queryStorage.set(key, value);
      }
    };
    expect(detectIsTwa("", queryStore, "?source=twa")).toBe(true);
    expect(detectIsTwa("", queryStore, "")).toBe(true);
    expect(queryStorage.get("jantt_twa_android_session")).toBe("1");
  });

  it("persists promo suppression for 30 days and expires afterward", () => {
    const key = "jantt_test_promo_key";
    localStorage.removeItem(key);
    document.cookie = `${key}=; path=/; max-age=0`;
    const t0 = 1_700_000_000_000;
    expect(isPromoSuppressed(key, APP_PROMO_TTL_MS, t0)).toBe(false);
    markPromoSeen(key, APP_PROMO_TTL_MS, t0);
    expect(isPromoSuppressed(key, APP_PROMO_TTL_MS, t0 + 1000)).toBe(true);
    expect(isPromoSuppressed(key, APP_PROMO_TTL_MS, t0 + APP_PROMO_TTL_MS + 1000)).toBe(false);
    localStorage.removeItem(key);
    document.cookie = `${key}=; path=/; max-age=0`;
  });

  it("detects iOS Safari but not Chrome on iOS", () => {
    expect(detectIsIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", 5)).toBe(true);
    expect(detectIsIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1", 5)).toBe(false);
    expect(detectIsIosSafari("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36", 0)).toBe(false);
  });

  it("syncs document attributes", () => {
    syncDocumentPlatformAttributes({ surface: "pwa-mobile", isStandalone: true, isOnline: false });
    expect(document.documentElement.getAttribute("data-surface")).toBe("pwa-mobile");
    expect(document.documentElement.getAttribute("data-standalone")).toBe("true");
    expect(document.documentElement.getAttribute("data-offline")).toBe("true");
  });
});

describe("service worker policy", () => {
  const origin = "https://example.test";

  it("bypasses non-GET, cross-origin, protocol and sw.js requests", () => {
    expect(shouldBypassServiceWorker(`${origin}/index.html`, "POST", origin)).toBe(true);
    expect(shouldBypassServiceWorker("data:text/plain,hello", "GET", origin)).toBe(true);
    expect(shouldBypassServiceWorker("https://firebaseio.com/x", "GET", origin)).toBe(true);
    expect(shouldBypassServiceWorker(`${origin}/sw.js`, "GET", origin)).toBe(true);
    expect(shouldBypassServiceWorker(`${origin}/index.html`, "GET", origin)).toBe(false);
  });

  it("never touches known remote providers", () => {
    const urls = [
      "https://firebase.googleapis.com/v1/projects",
      "https://identitytoolkit.googleapis.com/v1/accounts",
      "https://api.github.com/repos",
      "https://api.openai.com/v1/chat/completions",
      "https://generativelanguage.googleapis.com/v1beta/models",
      "https://api.anthropic.com/v1/messages",
      "https://api.groq.com/openai/v1/chat/completions",
      "https://api.deepseek.com/v1/chat/completions",
      "https://openrouter.ai/api/v1/chat/completions",
      "https://api.mistral.ai/v1/chat/completions",
      "https://api.x.ai/v1/chat/completions",
      "http://localhost:11434/api/generate",
      "http://127.0.0.1:11434/api/generate",
      "https://example.firebaseio.com/.json"
    ];
    urls.forEach((url) => {
      expect(shouldBypassServiceWorker(url, "GET", origin)).toBe(true);
    });
  });

  it("classifies hashed assets", () => {
    expect(isImmutableAssetPath("/assets/index-abc123.js")).toBe(true);
    expect(isImmutableAssetPath("/assets/vendor-react-XYZ_123.css")).toBe(true);
    expect(isImmutableAssetPath("/assets/font-abc123.woff2")).toBe(true);
    expect(isImmutableAssetPath("/assets/index.js")).toBe(false);
    expect(isImmutableAssetPath("/index.html")).toBe(false);
  });
});

describe("theme color and haptics", () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((node) => node.remove());
  });

  it("updates the theme-color meta element", () => {
    syncThemeColorMeta("dark", "#000000");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#000000");
    syncThemeColorMeta("light", "rgb(255, 255, 255)");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#FFFFFF");
  });

  it("vibrates when supported and allowed", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({ matches: false }),
      configurable: true
    });
    triggerHaptic("light");
    expect(vibrate).toHaveBeenCalledWith([10]);
  });

  it("never vibrates under reduced motion", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({ matches: true }),
      configurable: true
    });
    triggerHaptic("success");
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe("manifest and png integrity", () => {
  it("uses relative URLs and separate purposes", () => {
    const manifest = JSON.parse(readFileSync(`${publicDir}/manifest.webmanifest`, "utf8"));
    expect(manifest.id).toBe("./");
    expect(manifest.start_url).toBe("./?source=pwa");
    expect(manifest.scope).toBe("./");
    expect(manifest.icons.every((icon: { src: string }) => icon.src.startsWith("./"))).toBe(true);
    const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    expect(purposes).not.toContain("any maskable");
  });

  it("references existing PNGs with correct dimensions", () => {
    const manifest = JSON.parse(readFileSync(`${publicDir}/manifest.webmanifest`, "utf8"));
    for (const icon of manifest.icons) {
      const file = readFileSync(`${publicDir}/${icon.src.replace("./", "")}`);
      const magic = Array.from(file.subarray(0, 8)).join(",");
      expect(magic).toBe("137,80,78,71,13,10,26,10");
      const width = file.readUInt32BE(16);
      const height = file.readUInt32BE(20);
      const size = Number(icon.sizes.split("x")[0]);
      expect(width).toBe(size);
      expect(height).toBe(size);
    }
  });
});

describe("boot splash and privacy policy", () => {
  it("has a splash with no inline executable scripts", () => {
    const html = readFileSync(`${playgroundRoot}/index.html`, "utf8");
    expect(html).toContain('id="jantt-boot-splash"');
    const scripts = html.match(/<script\b[^>]*>/gi) || [];
    scripts.forEach((tag) => {
      const isModule = /type="module"/i.test(tag) && /src=/.test(tag);
      const isJsonLd = /type="application\/ld\+json"/i.test(tag);
      expect(isModule || isJsonLd).toBe(true);
    });
  });

  it("ships a script-free privacy page", () => {
    const privacy = readFileSync(`${publicDir}/privacy.html`, "utf8");
    expect(privacy).not.toMatch(/<script\b/i);
  });
});

describe("csp parity", () => {
  it("keeps main.tsx and _headers in sync", () => {
    const main = readFileSync(resolve(playgroundRoot, "src/main.tsx"), "utf8");
    const headers = readFileSync(`${publicDir}/_headers`, "utf8");
    expect(main).toContain("manifest-src 'self'");
    expect(headers).toContain("manifest-src 'self'");
    expect(main).toContain("worker-src 'self' blob:");
    expect(headers).toContain("worker-src 'self' blob:");
  });
});
describe("additional platform hardening", () => {
  it("ships a valid 180x180 Apple touch icon", () => {
    const file = readFileSync(resolve(publicDir, "icons", "apple-touch-icon-180.png"));
    const magic = Array.from(file.subarray(0, 8)).join(",");
    expect(magic).toBe("137,80,78,71,13,10,26,10");
    expect(file.readUInt32BE(16)).toBe(180);
    expect(file.readUInt32BE(20)).toBe(180);
  });

  it("keeps connect-src parity for localhost providers", () => {
    const main = readFileSync(resolve(playgroundRoot, "src", "main.tsx"), "utf8");
    const headers = readFileSync(resolve(publicDir, "_headers"), "utf8");
    for (const token of ["https:", "http://localhost:*", "http://127.0.0.1:*"]) {
      expect(main).toContain(token);
      expect(headers).toContain(token);
    }
  });


});

