/**
 * Pure Service Worker routing policy.
 *
 * The generated worker mirrors these rules in plain JavaScript. Keeping the decision logic here
 * makes the security-critical part unit-testable without a browser or a build.
 */

/** Requests the worker must hand straight to the network: never intercepted, never cached. */
export function shouldBypassServiceWorker(requestUrl: string, method: string, swOrigin: string): boolean {
  if (method.toUpperCase() !== "GET") return true;

  let url: URL;
  try {
    // Relative shell paths belong to the worker origin; absolute URLs keep their own origin.
    url = new URL(requestUrl, swOrigin);
  } catch {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (url.origin !== swOrigin) return true;
  if (url.pathname.endsWith("/sw.js")) return true;
  return false;
}

/** Vite content-hashed build output: safe to serve cache-first because a change produces a new name. */
export function isImmutableAssetPath(pathname: string): boolean {
  return /\/assets\/.*-[A-Za-z0-9_-]{6,}\.(js|css|woff2?)$/i.test(pathname);
}
