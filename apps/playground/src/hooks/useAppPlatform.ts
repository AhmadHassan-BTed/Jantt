import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectIsIosSafari,
  detectIsStandalone,
  detectIsTwa,
  registerServiceWorker,
  resolveAppSurface,
  syncDocumentPlatformAttributes,
  type AppSurface,
  type InstallPromptEvent
} from "../services/platform";

export interface UseAppPlatformReturn {
  surface: AppSurface;
  isStandalone: boolean;
  isTwa: boolean;
  isOnline: boolean;
  isIosSafari: boolean;
  canNativeShare: boolean;
  canInstall: boolean;
  promptInstall: () => Promise<void>;
  updateAvailable: boolean;
  applyUpdate: () => void;
}

/** One source of truth for the running surface, connectivity, installability and update lifecycle. */
export function useAppPlatform(isMobile: boolean): UseAppPlatformReturn {
  const [isTwa] = useState(
    () =>
      typeof window !== "undefined" &&
      detectIsTwa(window.document.referrer, window.sessionStorage, window.location.search)
  );
  const [isStandalone, setIsStandalone] = useState(
    () => typeof window !== "undefined" && detectIsStandalone(window)
  );
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  const [isIosSafari] = useState(
    () =>
      typeof navigator !== "undefined" &&
      detectIsIosSafari(navigator.userAgent, navigator.maxTouchPoints || 0)
  );
  const [canNativeShare] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
  const [canInstall, setCanInstall] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const installPromptRef = useRef<InstallPromptEvent | null>(null);
  const applyUpdateRef = useRef<(() => void) | null>(null);

  const surface = resolveAppSurface({ isMobile, isStandalone, isTwa });

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as InstallPromptEvent;
      setCanInstall(true);
    };
    const handleInstalled = () => {
      installPromptRef.current = null;
      setCanInstall(false);
      setIsStandalone(true);
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(
    () =>
      registerServiceWorker((applyUpdate) => {
        applyUpdateRef.current = applyUpdate;
        setUpdateAvailable(true);
      }),
    []
  );

  useEffect(() => {
    syncDocumentPlatformAttributes({ surface, isStandalone, isOnline });
  }, [surface, isStandalone, isOnline]);

  const promptInstall = useCallback(async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) return;
    installPromptRef.current = null;
    setCanInstall(false);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      // The browser may refuse a prompt that was already used; the app keeps working in web mode.
    }
  }, []);

  const applyUpdate = useCallback(() => {
    const apply = applyUpdateRef.current;
    if (!apply) return;
    setUpdateAvailable(false);
    apply();
  }, []);

  return {
    surface,
    isStandalone,
    isTwa,
    isOnline,
    isIosSafari,
    canNativeShare,
    canInstall,
    promptInstall,
    updateAvailable,
    applyUpdate
  };
}
