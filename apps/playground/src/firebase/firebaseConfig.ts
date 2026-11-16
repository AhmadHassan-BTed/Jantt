import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GithubAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";

const metaEnv: Record<string, any> = typeof import.meta !== "undefined" ? (import.meta as any).env || {} : {};

/**
 * Public web configuration of the hosted Jantt Cloud project (not a secret). Override every
 * field with VITE_FIREBASE_* to point a fork or preview at its own project, or set
 * VITE_USE_FIREBASE_EMULATOR=true to develop against the local Emulator Suite.
 */
export const defaultFirebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || "AIzaSyCGDzuJVBA4DwJd1KxN8bJIqDSAvLix8Ao",
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "jantt-cloud.firebaseapp.com",
  databaseURL: metaEnv.VITE_FIREBASE_DATABASE_URL || "https://jantt-cloud-default-rtdb.firebaseio.com",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "jantt-cloud",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "jantt-cloud.firebasestorage.app",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "98959474040",
  appId: metaEnv.VITE_FIREBASE_APP_ID || "1:98959474040:web:236dca28c881d6875b9c8d"
};

const app = !getApps().length ? initializeApp(defaultFirebaseConfig) : getApp();

export const auth = getAuth(app);

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope("read:user");

export const rtdb = getDatabase(app);

if (metaEnv.VITE_USE_FIREBASE_EMULATOR === "true") {
  // Ports match the `emulators` block of firebase.json.
  const host = metaEnv.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(rtdb, host, 9000);
  } catch {
    // Already connected (hot module reload re-evaluates this module).
  }
} else if (metaEnv.DEV && metaEnv.MODE !== "test" && !metaEnv.VITE_FIREBASE_DATABASE_URL) {
  console.warn(
    "[firebase] This development build uses the production Jantt Cloud project. " +
      "Set VITE_USE_FIREBASE_EMULATOR=true to work against local emulators."
  );
}

/**
 * True when a Realtime Database operation was rejected by the security rules. Covers
 * transaction aborts ("permission_denied"), write errors (code "PERMISSION_DENIED") and reads.
 */
export function isPermissionDeniedError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: unknown; message?: unknown };
  const text = `${String(err.code ?? "")} ${String(err.message ?? error)}`;
  return /permission[_ ]denied/i.test(text);
}

export default app;
