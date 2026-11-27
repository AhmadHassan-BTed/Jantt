/** 30-day persistence helper (localStorage + document.cookie) for app release promos and banners. */
export const APP_PROMO_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined" || !document.cookie) return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function writeCookieValue(name: string, value: string, ttlMs: number): void {
  if (typeof document === "undefined") return;
  try {
    const maxAgeSec = Math.max(60, Math.floor(ttlMs / 1000));
    const expires = new Date(Date.now() + maxAgeSec * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; expires=${expires}; SameSite=Lax`;
  } catch {
    // Ignore restricted cookie contexts.
  }
}

export function isPromoSuppressed(
  key: string,
  ttlMs: number = APP_PROMO_TTL_MS,
  now: number = Date.now()
): boolean {
  let raw: string | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      raw = localStorage.getItem(key);
    }
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
  if (!raw) {
    raw = readCookieValue(key);
  }
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return now - ts >= 0 && now - ts < ttlMs;
}

export function markPromoSeen(
  key: string,
  ttlMs: number = APP_PROMO_TTL_MS,
  now: number = Date.now()
): void {
  const value = String(Math.floor(now));
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage errors.
  }
  writeCookieValue(key, value, ttlMs);
}
