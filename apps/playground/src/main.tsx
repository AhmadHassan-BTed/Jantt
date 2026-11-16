import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import "./index.css";

type BuildEnv = Record<string, string | boolean | undefined>;

/** `<scheme>//<host>` of a configured URL or bare host name, or null when unset or malformed. */
function originOf(value: unknown, scheme?: "https:" | "wss:"): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return `${scheme ?? url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Realtime Database hosts (default and regional instances). */
const RTDB_HOSTS = ["https://*.firebaseio.com", "https://*.firebasedatabase.app"];

/**
 * Content-Security-Policy for production builds (GitHub Pages cannot send response headers).
 * It blocks inline scripts, inline event handlers, javascript: URLs and scripts from unknown
 * hosts, which is what turns an HTML-injection bug into script execution. Scripts may only come
 * from this site, the Firebase Auth loader (apis.google.com) and the Realtime Database
 * long-polling fallback; connections only go to Firebase, Google APIs and the GitHub API. A
 * project configured through VITE_FIREBASE_* (or the emulators) is added automatically.
 * It is installed at runtime instead of in index.html because the Vite dev server relies on an
 * inline React Refresh preamble. Keep the default hosts in sync with public/_headers.
 */
function buildProductionCsp(env: BuildEnv): string {
  const sources = (...items: Array<string | null | undefined>) => Array.from(new Set(items.filter(Boolean))).join(" ");
  const authOrigin = originOf(env.VITE_FIREBASE_AUTH_DOMAIN);
  const dbOrigin = originOf(env.VITE_FIREBASE_DATABASE_URL);
  const dbSocket = originOf(env.VITE_FIREBASE_DATABASE_URL, "wss:");
  const emulatorHost =
    env.VITE_USE_FIREBASE_EMULATOR === "true" ? String(env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1") : null;
  // Ports match firebase.json (Auth 9099, Realtime Database 9000).
  const emulator = emulatorHost
    ? [`http://${emulatorHost}:9099`, `http://${emulatorHost}:9000`, `ws://${emulatorHost}:9000`]
    : [];

  return [
    "default-src 'self'",
    `script-src ${sources("'self'", "https://apis.google.com", "https://www.gstatic.com", ...RTDB_HOSTS, dbOrigin, ...emulator)}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${sources(
      "'self'",
      "https://*.googleapis.com",
      ...RTDB_HOSTS,
      "wss://*.firebaseio.com",
      "wss://*.firebasedatabase.app",
      dbOrigin,
      dbSocket,
      "https://api.github.com",
      "data:",
      "blob:",
      ...emulator
    )}`,
    // The Firebase Auth helper iframe lives on the project's auth domain.
    `frame-src ${sources("'self'", "https://*.firebaseapp.com", "https://*.web.app", authOrigin, ...emulator)}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
}

function installProductionCsp() {
  const env: BuildEnv = (import.meta as any).env || {};
  if (!env.PROD || typeof document === "undefined") return;
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = buildProductionCsp(env);
  document.head.prepend(meta);
}

installProductionCsp();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
