/** How often a foregrounded app asks for a fresh worker, in milliseconds. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** The worker is only useful (and only allowed) on secure production origins. */
export function canRegisterServiceWorker(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  if (!import.meta.env.PROD) return false;
  const { protocol, hostname } = window.location;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Registers `./sw.js` and reports a waiting update. The returned apply function asks the waiting
 * worker to activate and reloads the page exactly once, so a controller handoff can never loop.
 */
export function registerServiceWorker(onUpdateAvailable: (applyUpdate: () => void) => void): () => void {
  if (!canRegisterServiceWorker()) return () => {};

  let registration: ServiceWorkerRegistration | null = null;
  let isReloading = false;
  let isDisposed = false;
  let lastUpdateCheck = 0;

  const applyUpdate = () => {
    if (!registration?.waiting) return;
    isReloading = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  };

  const reportWaitingWorker = () => {
    if (!isDisposed && registration?.waiting) onUpdateAvailable(applyUpdate);
  };

  const handleControllerChange = () => {
    if (!isReloading) return;
    isReloading = false;
    window.location.reload();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastUpdateCheck = now;
    registration?.update().catch(() => undefined);
  };

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  navigator.serviceWorker
    .register("./sw.js", { scope: "./", updateViaCache: "none" })
    .then((newRegistration) => {
      if (isDisposed) return;
      registration = newRegistration;
      // A worker may already be parked from a previous visit before this page registered.
      reportWaitingWorker();

      newRegistration.addEventListener("updatefound", () => {
        const installing = newRegistration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // A first install has no controller yet and activates immediately; an update waits.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            reportWaitingWorker();
          }
        });
      });
    })
    .catch(() => undefined);

  return () => {
    isDisposed = true;
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
