import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env || {} : {};

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
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const rtdb = getDatabase(app);
export default app;
