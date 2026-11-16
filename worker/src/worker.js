/**
 * Jantt CORS Proxy - Cloudflare Worker
 *
 * A small read-only proxy that lets the Jantt web app download public plan JSON files from hosts
 * that send no CORS headers. Every guarantee below is enforced in this file:
 *
 * - Only GET (and the OPTIONS preflight) from allow-listed browser origins; anything else gets
 *   403/405. Local dev origins are accepted only when ALLOW_DEV_ORIGINS = "true".
 * - Only https targets on the default port of allow-listed hosts (raw.githubusercontent.com,
 *   gist.githubusercontent.com and Dropbox, plus any EXTRA_ALLOWED_HOSTS). Redirects are followed
 *   manually, at most 3 hops, re-checking each hop.
 * - Upstream bodies are capped at 5 MB and must look like JSON. Responses are always served as
 *   application/json with nosniff and a sandboxing CSP, so the worker origin never renders HTML.
 * - Per-isolate cache: a bounded LRU (100 entries, 20 MB) that is fresh for 4 s, plus coalescing of
 *   identical in-flight requests. Cloudflare runs many isolates; there is no shared edge cache.
 * - Quota shield: only an upstream 429/503 or network failure may be answered with a stale copy,
 *   and only within 60 s after it went stale. 401/403/404/410 pass through and evict the copy.
 * - Optional per-client rate limiting through a RATE_LIMITER binding (see README.md).
 */

const PRODUCTION_ORIGINS = ["https://ahmadhassan-bted.github.io"];
const DEV_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
// GitHub serves user files only from these two hosts; its other *.githubusercontent.com hosts
// (avatars, camo, release objects) never hold plan files.
const ALLOWED_HOSTS = ["raw.githubusercontent.com", "gist.githubusercontent.com"];
// Dropbox share links redirect to per-file subdomains of dropboxusercontent.com.
const ALLOWED_HOST_SUFFIXES = ["dropbox.com", "dropboxusercontent.com"];

const CACHE_TTL_MS = 4000;
const STALE_WINDOW_MS = 60000;
const MAX_CACHE_ENTRIES = 100;
const MAX_CACHE_BYTES = 20 * 1024 * 1024;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const UPSTREAM_TIMEOUT_MS = 10000;

const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cache-Control": "no-store"
};

// Per-isolate state. Map iteration order doubles as LRU order (oldest first).
const responseCache = new Map();
const inFlight = new Map();
let cachedBytes = 0;

function listVar(value) {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : [];
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (listVar(env?.EXTRA_ALLOWED_ORIGINS).includes(origin.toLowerCase())) return true;
  return env?.ALLOW_DEV_ORIGINS === "true" && DEV_ORIGIN_PATTERN.test(origin);
}

function corsHeaders(origin, env) {
  const headers = { Vary: "Origin" };
  if (isAllowedOrigin(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Expose-Headers"] = "X-Jantt-Quota-Shield, X-Jantt-Cache, Retry-After, X-Proxy-Status";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function jsonResponse(status, body, headers) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { ...headers, ...SECURITY_HEADERS }
  });
}

function isAllowedHost(hostname, env) {
  const host = hostname.toLowerCase();
  if (ALLOWED_HOSTS.includes(host)) return true;
  return [...ALLOWED_HOST_SUFFIXES, ...listVar(env?.EXTRA_ALLOWED_HOSTS)].some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * Parses and validates a target URL: https on the default port, no credentials, allow-listed
 * host, not this worker.
 */
function resolveTarget(raw, env, selfHost, base) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let target;
  try {
    target = base ? new URL(raw, base) : new URL(raw.trim());
  } catch {
    return null; // ignored: an unparseable URL is simply not a valid target
  }
  // The URL parser drops an explicit ":443", so any port left is a non-default one.
  if (target.protocol !== "https:" || target.port || target.username || target.password) return null;
  if (target.hostname.toLowerCase() === selfHost.toLowerCase()) return null;
  if (!isAllowedHost(target.hostname, env)) return null;
  target.hash = "";
  return target;
}

/** Reads at most `maxBytes` of a body; returns null when it is larger. */
async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel?.();
    return null;
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    return text.length > maxBytes ? null : text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function looksLikeJson(text) {
  return /^\s*[[{]/.test(text);
}

function isCacheable(response) {
  const cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase();
  return !/\b(no-store|private)\b/.test(cacheControl);
}

function cacheGet(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS + STALE_WINDOW_MS) {
    cacheDelete(key);
    return null;
  }
  // Refresh LRU position.
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry;
}

function cacheDelete(key) {
  const entry = responseCache.get(key);
  if (!entry) return;
  cachedBytes -= entry.body.length;
  responseCache.delete(key);
}

function cacheSet(key, body) {
  if (body.length > MAX_CACHE_BYTES) return;
  cacheDelete(key);
  responseCache.set(key, { body, storedAt: Date.now() });
  cachedBytes += body.length;
  for (const oldest of responseCache.keys()) {
    if (responseCache.size <= MAX_CACHE_ENTRIES && cachedBytes <= MAX_CACHE_BYTES) break;
    cacheDelete(oldest);
  }
}

function upstreamSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    : undefined;
}

function errorResult(status, error, details) {
  return { status, body: JSON.stringify(details ? { error, details } : { error }), quotaShield: false };
}

/** Fetches the target (re-validating every redirect hop) and maps the outcome to a proxy result. */
async function fetchUpstream(target, env, selfHost, stale) {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response;
    try {
      response = await fetch(current.href, {
        method: "GET",
        headers: {
          "User-Agent": "Jantt-CORS-Proxy/3.0",
          Accept: "application/json, text/plain;q=0.9, */*;q=0.1"
        },
        redirect: "manual",
        signal: upstreamSignal()
      });
    } catch (err) {
      if (stale) return { status: 200, body: stale.body, quotaShield: true };
      return errorResult(502, "Upstream fetch failed.", String(err?.message || err));
    }

    const status = response.status;
    const location = response.headers.get("Location");
    if (status >= 300 && status < 400 && location) {
      const next = resolveTarget(location, env, selfHost, current);
      if (!next) return errorResult(502, "Upstream redirected to a host that is not allowed.");
      current = next;
      continue;
    }

    if (status === 200) {
      const body = await readCapped(response, MAX_UPSTREAM_BYTES);
      if (body === null) return errorResult(502, `Upstream file exceeds ${MAX_UPSTREAM_BYTES / (1024 * 1024)} MB.`);
      if (!looksLikeJson(body)) return errorResult(502, "Upstream did not return JSON.");
      return { status: 200, body, quotaShield: false, cacheable: isCacheable(response) };
    }

    await response.body?.cancel?.();
    if (status === 429 || status === 503) {
      if (stale) return { status: 200, body: stale.body, quotaShield: true };
      return {
        status,
        body: JSON.stringify({ error: "Upstream is rate limiting or unavailable.", quotaShieldActive: true, retryAfter: 5 }),
        quotaShield: true,
        retryAfter: response.headers.get("Retry-After") || "5"
      };
    }
    if (status === 401 || status === 403 || status === 404 || status === 410) {
      return { ...errorResult(status, `Upstream returned ${status}.`), evict: true };
    }
    // Other 2xx/3xx answers (204, 304, a redirect without Location) carry no file; 5xx is the upstream's fault.
    return errorResult(status >= 400 && status < 500 ? status : 502, `Upstream returned ${status}.`);
  }
  return errorResult(502, "Too many upstream redirects.");
}

async function handleProxy(request, env, origin, cors) {
  if (!isAllowedOrigin(origin, env)) {
    return jsonResponse(403, { error: "Origin not allowed." }, cors);
  }

  if (env?.RATE_LIMITER && typeof env.RATE_LIMITER.limit === "function") {
    const key = request.headers.get("CF-Connecting-IP") || origin;
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) {
      return jsonResponse(429, { error: "Too many requests." }, { ...cors, "Retry-After": "60" });
    }
  }

  const requestUrl = new URL(request.url);
  const selfHost = requestUrl.hostname;
  const target = resolveTarget(requestUrl.searchParams.get("url"), env, selfHost);
  if (!target) {
    return jsonResponse(400, { error: "Missing or disallowed ?url= (https links on GitHub or Dropbox only)." }, cors);
  }
  const key = target.href;

  const entry = cacheGet(key);
  if (entry && Date.now() - entry.storedAt < CACHE_TTL_MS) {
    return jsonResponse(200, entry.body, { ...cors, "X-Jantt-Cache": "HIT", "X-Proxy-Status": "200" });
  }

  let cacheState = "COALESCED";
  let pending = inFlight.get(key);
  if (!pending) {
    cacheState = "MISS";
    pending = fetchUpstream(target, env, selfHost, entry).then((result) => {
      const fresh = result.status === 200 && !result.quotaShield;
      if (fresh && result.cacheable) cacheSet(key, result.body);
      // A file now marked no-store/private, or gone, must not be served from an older copy.
      else if (fresh || result.evict) cacheDelete(key);
      return result;
    });
    inFlight.set(key, pending);
    // ignored: every caller awaits `pending` and sees its rejection; this chain only cleans up
    pending.finally(() => inFlight.delete(key)).catch(() => undefined);
  }

  const result = await pending;
  return jsonResponse(result.status, result.body, {
    ...cors,
    "X-Jantt-Cache": result.quotaShield && result.status === 200 ? "STALE-FALLBACK" : cacheState,
    "X-Proxy-Status": String(result.status),
    ...(result.quotaShield ? { "X-Jantt-Quota-Shield": "active" } : {}),
    ...(result.retryAfter ? { "Retry-After": result.retryAfter } : {})
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    try {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/api/room")) {
        return jsonResponse(410, { error: "The room API was removed. Use Jantt Cloud rooms instead." }, cors);
      }
      if (request.method === "OPTIONS") {
        return isAllowedOrigin(origin, env)
          ? new Response(null, { status: 204, headers: cors })
          : jsonResponse(403, { error: "Origin not allowed." }, cors);
      }
      if (request.method !== "GET") {
        return jsonResponse(405, { error: "Method not allowed." }, { ...cors, Allow: "GET, OPTIONS" });
      }
      return await handleProxy(request, env, origin, cors);
    } catch (err) {
      // Logged for `wrangler tail`; the client only learns that the proxy failed.
      console.error("Jantt CORS proxy error:", err);
      return jsonResponse(500, { error: "Internal proxy error." }, cors);
    }
  }
};
