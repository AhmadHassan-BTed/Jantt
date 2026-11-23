import type { LaunchQueue } from "./types";

function isJsonFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".json") || file.type === "application/json";
}

/**
 * Receives `.json` files opened from Android Files, Windows Explorer or macOS Finder while Jantt
 * is installed as a PWA. Calls the import path used by the file picker, so launched plans become
 * ordinary local plans with the same validation and confirmation toast.
 */
export function registerLaunchQueueHandler(onJsonFile: (file: File) => void): void {
  if (typeof window === "undefined") return;
  const launchQueue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
  if (!launchQueue || typeof launchQueue.setConsumer !== "function") return;

  launchQueue.setConsumer((params) => {
    const entry = params.files?.[0];
    if (!entry) return;

    if (entry instanceof File) {
      if (isJsonFile(entry)) onJsonFile(entry);
      return;
    }

    if (typeof entry.getFile !== "function") return;
    entry
      .getFile()
      .then((file) => {
        if (isJsonFile(file)) onJsonFile(file);
      })
      .catch(() => undefined);
  });
}
