/** How the app is currently running. One React codebase, five surface identities. */
export type AppSurface = "web-desktop" | "web-mobile" | "pwa-desktop" | "pwa-mobile" | "twa-android";

/** The Chromium install prompt, which is not part of the standard DOM typings. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** A file handed over by the OS launch queue (`window.launchQueue`). */
export interface LaunchQueueFile {
  getFile(): Promise<File>;
}

export interface LaunchParams {
  readonly files?: ReadonlyArray<LaunchQueueFile | File>;
}

export interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}
