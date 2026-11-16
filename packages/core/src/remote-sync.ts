import { JanttData } from "./types";
import { validate } from "./validator";
import { calculatePlanHash } from "./reconciliation/crdt-hash";

export type CloudProviderType = "github" | "dropbox" | "generic";

export interface CloudUrlInfo {
  originalUrl: string;
  provider: CloudProviderType;
  downloadUrl: string;
  fileId?: string;
  label: string;
}

/** Default time budget for one network request (connect + response body), in milliseconds. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15000;
/** Largest remote plan file accepted, in bytes. */
export const MAX_REMOTE_PLAN_BYTES = 10 * 1024 * 1024;

// Query parameters that never change which file a link points to (download mode, cache busting).
const VOLATILE_QUERY_PARAMS: ReadonlySet<string> = new Set(["dl", "raw", "v", "t"]);
// Query parameters that carry credentials; such URLs are never sent to a third-party proxy.
const CREDENTIAL_QUERY_PARAMS: ReadonlySet<string> = new Set([
  "token",
  "access_token",
  "auth",
  "key",
  "apikey",
  "api_key",
  "password",
  "sig",
  "signature",
  "x-amz-signature",
  "x-goog-signature"
]);

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * IP literals, localhost and single-label (intranet) names. The URL parser has already turned
 * every IPv4 spelling (hex, octal, integer) into dotted decimal and wrapped IPv6 in brackets.
 */
function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.startsWith("[") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    !host.includes(".")
  );
}

function parseHttpsUrl(inputUrl: string): URL {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new Error("Invalid URL: enter a full https:// link to a Jantt JSON file.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only https:// links are supported for remote plans.");
  }
  if (url.username || url.password) {
    throw new Error("Links with embedded credentials (user:password@) are not supported.");
  }
  if (isLocalOrPrivateHost(url.hostname)) {
    throw new Error("Links to localhost, IP addresses or private network hosts are not supported.");
  }
  return url;
}

/**
 * Parses and normalizes cloud storage and raw file sharing URLs into direct JSON-downloadable
 * endpoints. Providers are recognized by host name; only https:// links are accepted.
 */
export function parseCloudUrl(inputUrl: string): CloudUrlInfo {
  if (!inputUrl || typeof inputUrl !== "string") {
    throw new Error("Invalid URL: URL string is required.");
  }

  const trimmed = inputUrl.trim();
  const url = parseHttpsUrl(trimmed);
  const host = url.hostname.toLowerCase();

  if (host === "drive.google.com" || host === "docs.google.com") {
    throw new Error(
      "Google Drive linking is no longer supported. Please use Firebase Cloud Storage or Cloud Rooms."
    );
  }

  // GitHub blob URL -> raw.githubusercontent.com
  if (host === "github.com" || host === "www.github.com") {
    const [user, repo, kind, branch, ...path] = url.pathname.split("/").filter(Boolean);
    if (kind === "blob" && user && repo && branch && path.length > 0) {
      return {
        originalUrl: trimmed,
        provider: "github",
        downloadUrl: `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path.join("/")}`,
        label: "GitHub"
      };
    }
  }

  if (host === "raw.githubusercontent.com" || host === "gist.githubusercontent.com") {
    return { originalUrl: trimmed, provider: "github", downloadUrl: trimmed, label: "GitHub Raw" };
  }

  // Dropbox share links download directly with dl=1 (raw=1 is kept as is)
  if (hostMatches(host, "dropbox.com") || hostMatches(host, "dropboxusercontent.com")) {
    if (url.searchParams.get("raw") !== "1") url.searchParams.set("dl", "1");
    return { originalUrl: trimmed, provider: "dropbox", downloadUrl: url.toString(), label: "Dropbox" };
  }

  return { originalUrl: trimmed, provider: "generic", downloadUrl: trimmed, label: "Direct JSON URL" };
}

/** Identity of a file URL: scheme, host and exact path, plus its non-volatile query parameters. */
function resourceKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const params = Array.from(url.searchParams.entries())
    .filter(([name]) => !VOLATILE_QUERY_PARAMS.has(name.toLowerCase()))
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  const query = new URLSearchParams(params).toString();
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ""}`;
}

/**
 * True when two cloud URLs reference the same remote file. GitHub blob and raw forms of a file
 * match; scheme and host are case-insensitive, paths are case-sensitive, trailing slashes, the
 * fragment and download/cache-busting parameters (dl, raw, v, t) are ignored, and every other
 * query parameter (for example Dropbox's rlkey) must match.
 */
export function isMatchingCloudUrl(urlA?: string | null, urlB?: string | null): boolean {
  if (!urlA || !urlB) return false;
  const a = urlA.trim();
  const b = urlB.trim();
  if (a === b) return true;

  const normalize = (raw: string): string | null => {
    try {
      return resourceKey(parseCloudUrl(raw).downloadUrl);
    } catch {
      return resourceKey(raw);
    }
  };
  const keyA = normalize(a);
  return keyA !== null && keyA === normalize(b);
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

export interface FetchTimeoutOptions {
  /** Time budget for the whole exchange, including reading the body (default 15 s; 0 disables). */
  timeoutMs?: number;
  /** Aborts the request when signalled. */
  signal?: AbortSignal | null;
}

/**
 * Runs `fetch` and then `read` on the response within one time budget, so neither a stalled
 * connection nor a stalled body can hang the caller. A timeout rejects with a "timed out" error;
 * an abort through `options.signal` rejects with the fetch AbortError.
 */
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  options: FetchTimeoutOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const external = options.signal;
  const onAbort = () => controller.abort(external?.reason);
  if (external?.aborted) controller.abort(external.reason);
  else external?.addEventListener("abort", onAbort, { once: true });

  let timedOut = false;
  const timer =
    timeoutMs > 0 && Number.isFinite(timeoutMs)
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await read(response);
  } catch (err) {
    if (timedOut) {
      const budget = timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`;
      throw new Error(`Request timed out after ${budget}.`);
    }
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

function tooLargeError(maxBytes: number): Error {
  return new Error(`Remote file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`);
}

/** Reads a response body as text, rejecting it once it exceeds `maxBytes`. */
async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers?.get?.("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLargeError(maxBytes);

  const reader = response.body && typeof response.body.getReader === "function" ? response.body.getReader() : null;
  if (!reader) {
    const text = await response.text();
    if (text.length > maxBytes) throw tooLargeError(maxBytes);
    return text;
  }

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      // ignored: a failed cancel changes nothing; the size error is what the caller needs
      await reader.cancel().catch(() => undefined);
      throw tooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function describeHttpError(status: number, statusText?: string): Error {
  if (status === 404) {
    return new Error("File not found (404). Verify the share link is correct and the file is publicly accessible.");
  }
  if (status === 401 || status === 403) {
    return new Error(`Access denied (${status}). Ensure the file is public or has appropriate access permissions.`);
  }
  if (status === 429) {
    return new Error("Download rate limit temporarily exceeded. Please try again in a few seconds.");
  }
  return new Error(`Remote server returned error ${status}${statusText ? `: ${statusText}` : ""}`);
}

/** True when a URL carries credentials and therefore must never be sent to a third party. */
function hasCredentials(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) return true;
    for (const name of url.searchParams.keys()) {
      if (CREDENTIAL_QUERY_PARAMS.has(name.toLowerCase())) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Explicitly configured CORS proxy, if any: `options.proxyUrl`, else (only with
 * `allowGlobalOverrides`) `window.__JANTT_CORS_PROXY`.
 */
function resolveProxyUrl(options: Pick<FetchRemotePlanOptions, "proxyUrl" | "allowGlobalOverrides">): string | null {
  const { proxyUrl } = options;
  if (proxyUrl === null) return null;
  const candidate =
    proxyUrl ??
    (options.allowGlobalOverrides === true && typeof window !== "undefined"
      ? (window as unknown as { __JANTT_CORS_PROXY?: unknown }).__JANTT_CORS_PROXY
      : undefined);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

interface FetchRawResult {
  text: string;
  quotaShieldActive?: boolean;
  source?: string;
}

const ACCEPT_HEADERS = { Accept: "application/json, text/plain, */*" };

/**
 * Fetches a URL directly. Only when the browser blocks the request (CORS or network failure, never
 * an HTTP error status) and a proxy was configured, retries through the proxy. URLs carrying
 * credentials are never proxied.
 */
async function fetchWithCorsFallback(url: string, options: FetchRemotePlanOptions): Promise<FetchRawResult> {
  try {
    return await fetchWithTimeout(
      url,
      { method: "GET", headers: ACCEPT_HEADERS },
      async (res) => {
        if (!res.ok) throw describeHttpError(res.status, res.statusText);
        return { text: await readTextCapped(res, MAX_REMOTE_PLAN_BYTES), quotaShieldActive: false, source: "direct" };
      },
      options
    );
  } catch (err) {
    const proxy = resolveProxyUrl(options);
    // fetch rejects with a TypeError only when the request could not be made (CORS, DNS, offline)
    if (!(err instanceof TypeError) || !proxy || hasCredentials(url)) {
      if (err instanceof TypeError) {
        throw new Error(
          "Could not download the file: the host is unreachable or blocks cross-origin requests (CORS). " +
            "Use a raw GitHub/Dropbox link or configure a CORS proxy."
        );
      }
      throw err;
    }
    return fetchViaProxy(proxy, url, options);
  }
}

/** Fetches through a Jantt CORS proxy worker (see /worker/README.md). */
async function fetchViaProxy(proxyBase: string, targetUrl: string, options: FetchTimeoutOptions): Promise<FetchRawResult> {
  const separator = proxyBase.includes("?") ? "&" : "?";
  const proxyUrl = `${proxyBase}${separator}url=${encodeURIComponent(targetUrl)}`;
  try {
    return await fetchWithTimeout(
      proxyUrl,
      { method: "GET", headers: ACCEPT_HEADERS },
      async (res) => {
        if (!res.ok) throw describeHttpError(res.status, res.statusText);
        return {
          text: await readTextCapped(res, MAX_REMOTE_PLAN_BYTES),
          quotaShieldActive: res.headers?.get?.("X-Jantt-Quota-Shield") === "active",
          source: res.headers?.get?.("X-Jantt-Cache") || "proxy"
        };
      },
      options
    );
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Could not connect to the CORS proxy. See /worker/README.md. (${err.message || "Network error"})`);
    }
    throw err;
  }
}

function looksLikeHtml(text: string): boolean {
  return /^\s*</.test(text) && /<html|<!doctype/i.test(text.slice(0, 512));
}

// ---------------------------------------------------------------------------

export interface RemoteFetchResult {
  data: JanttData;
  info: CloudUrlInfo;
  fetchedAt: string;
  title: string;
  taskCount: number;
  contentHash: string;
  notModified?: boolean;
  quotaShieldActive?: boolean;
  source?: string;
}

export interface FetchRemotePlanOptions extends FetchTimeoutOptions {
  /** Content hash of the copy already held; sets `notModified` when unchanged. */
  previousHash?: string;
  /**
   * CORS proxy base URL (see /worker/README.md), used only when the direct request is blocked.
   * There is no default proxy; pass null to never use one.
   */
  proxyUrl?: string | null;
  /**
   * @deprecated Honour a page-wide `window.__JANTT_CORS_PROXY` when `proxyUrl` is not given. Off
   * by default, so no other script on the page can route plan URLs through a proxy of its choice.
   */
  allowGlobalOverrides?: boolean;
}

/**
 * Fetches, parses, and validates a remote Jantt plan from a shared https:// URL.
 * Files larger than {@link MAX_REMOTE_PLAN_BYTES} are rejected, and every request is bounded by
 * `timeoutMs`. A CORS proxy is used only when one is configured explicitly.
 */
export async function fetchRemotePlan(url: string, options?: FetchRemotePlanOptions): Promise<RemoteFetchResult> {
  const info = parseCloudUrl(url);

  const rawResult = await fetchWithCorsFallback(info.downloadUrl, options ?? {});
  const rawText = rawResult.text;

  // Detect HTML error pages (login redirects, 404 HTML pages, etc.)
  if (looksLikeHtml(rawText)) {
    throw new Error(
      `The URL returned an HTML page instead of JSON. ` +
      `Make sure the link points directly to a public Jantt JSON file or raw GitHub URL.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (jsonErr: any) {
    throw new Error(`Remote file is not valid JSON: ${jsonErr.message}`);
  }

  const validation = validate(parsed);
  if (!validation.valid) {
    const errorDetails = validation.errors
      .slice(0, 3)
      .map((e) => `• ${e.path}: ${e.message}`)
      .join("\n");
    throw new Error(`Remote JSON is not a valid Jantt plan:\n${errorDetails}`);
  }

  const data = parsed as JanttData;
  const title = data.meta?.title || "Untitled Remote Plan";
  const taskCount = Array.isArray(data.tasks) ? data.tasks.length : 0;
  const contentHash = calculatePlanHash(data);
  const notModified = Boolean(options?.previousHash && options.previousHash === contentHash);

  return {
    data,
    info,
    fetchedAt: new Date().toISOString(),
    title,
    taskCount,
    contentHash,
    notModified,
    quotaShieldActive: rawResult.quotaShieldActive,
    source: rawResult.source
  };
}
