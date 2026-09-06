import { JanttData } from "./types";
import { validate } from "./validator";
import { calculatePlanHash } from "./reconciler";

export type CloudProviderType = "github" | "dropbox" | "generic";

export interface CloudUrlInfo {
  originalUrl: string;
  provider: CloudProviderType;
  downloadUrl: string;
  fileId?: string;
  label: string;
}

/**
 * Parses and normalizes various cloud storage and raw file sharing URLs
 * into direct JSON-downloadable endpoints.
 */
export function parseCloudUrl(inputUrl: string): CloudUrlInfo {
  if (!inputUrl || typeof inputUrl !== "string") {
    throw new Error("Invalid URL: URL string is required.");
  }

  const trimmed = inputUrl.trim();

  // Reject Google Drive URLs explicitly
  const driveRegex = /drive\.google\.com|docs\.google\.com/i;
  if (driveRegex.test(trimmed)) {
    throw new Error(
      "Google Drive linking is no longer supported. Please use Firebase Cloud Storage or Cloud Rooms."
    );
  }

  // 2. GitHub URLs (convert blob URL to raw.githubusercontent.com)
  const githubBlobRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i;
  const githubMatch = trimmed.match(githubBlobRegex);
  if (githubMatch) {
    const [, user, repo, branch, path] = githubMatch;
    const downloadUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
    return {
      originalUrl: trimmed,
      provider: "github",
      downloadUrl,
      label: "GitHub"
    };
  }

  // GitHub raw URL
  if (/raw\.githubusercontent\.com/i.test(trimmed) || /gist\.githubusercontent\.com/i.test(trimmed)) {
    return {
      originalUrl: trimmed,
      provider: "github",
      downloadUrl: trimmed,
      label: "GitHub Raw"
    };
  }

  // 3. Dropbox URLs (convert ?dl=0 to ?dl=1)
  if (/dropbox\.com/i.test(trimmed)) {
    let downloadUrl = trimmed;
    if (downloadUrl.includes("dl=0")) {
      downloadUrl = downloadUrl.replace("dl=0", "dl=1");
    } else if (!downloadUrl.includes("dl=1") && !downloadUrl.includes("raw=1")) {
      const separator = downloadUrl.includes("?") ? "&" : "?";
      downloadUrl = `${downloadUrl}${separator}dl=1`;
    }
    return {
      originalUrl: trimmed,
      provider: "dropbox",
      downloadUrl,
      label: "Dropbox"
    };
  }

  // 4. Generic Direct JSON URL
  return {
    originalUrl: trimmed,
    provider: "generic",
    downloadUrl: trimmed,
    label: "Direct JSON URL"
  };
}

/**
 * Compares two cloud URLs to determine if they reference the identical remote resource.
 * Intelligently recognizes GitHub files (matching repo & branch paths), Dropbox links, and normalized URLs.
 */
export function isMatchingCloudUrl(urlA?: string | null, urlB?: string | null): boolean {
  if (!urlA || !urlB) return false;
  const a = urlA.trim();
  const b = urlB.trim();
  if (a === b) return true;

  try {
    const infoA = parseCloudUrl(a);
    const infoB = parseCloudUrl(b);

    if (infoA.provider !== infoB.provider) return false;

    if (infoA.downloadUrl === infoB.downloadUrl) return true;
  } catch {
    // Fall back to clean URL comparison
  }

  // Fallback: strip query params, hash and trailing slash
  const cleanA = a.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
  const cleanB = b.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
  return cleanA === cleanB;
}

// ---------------------------------------------------------------------------

// CORS-aware fetch helper
// ---------------------------------------------------------------------------

/**
 * The project's own Cloudflare Worker CORS proxy.
 * Deploy it once with `npx wrangler deploy` from /worker — free forever.
 *
 * After deploying you'll get a URL like:
 *   https://jantt-cors-proxy.<your-cf-subdomain>.workers.dev
 *
 * Update the URL below, or set it at runtime via:
 *   (window as any).__JANTT_CORS_PROXY = "https://jantt-cors-proxy.YOUR.workers.dev";
 */
const DEFAULT_WORKER_URL = "https://jantt-cors-proxy.ahmadhassan-bted.workers.dev";

function getWorkerUrl(): string {
  // Allow runtime override from the app
  if (typeof window !== "undefined" && (window as any).__JANTT_CORS_PROXY) {
    return (window as any).__JANTT_CORS_PROXY;
  }
  return DEFAULT_WORKER_URL;
}

interface FetchRawResult {
  text: string;
  quotaShieldActive?: boolean;
  source?: string;
}

/**
 * Fetches a URL, routing through our own Cloudflare Worker proxy
 * Fetches a URL, routing through our own Cloudflare Worker proxy
 * when needed or when CORS is blocked.
 */
async function fetchWithCorsFallback(url: string, _provider?: CloudProviderType): Promise<FetchRawResult> {
  // For GitHub, generic, try direct first
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" }
    });
    if (res.ok) {
      const text = await res.text();
      return { text, quotaShieldActive: false, source: "direct" };
    }
  } catch {
    // CORS / network error — fall through to worker
  }

  // Fallback to our worker proxy
  return fetchViaWorker(url);
}

/**
 * Fetches via our Cloudflare Worker CORS proxy.
 */
async function fetchViaWorker(targetUrl: string): Promise<FetchRawResult> {
  const workerBase = getWorkerUrl();
  const proxyUrl = `${workerBase}?url=${encodeURIComponent(targetUrl)}`;

  let res: Response;
  try {
    res = await fetch(proxyUrl, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" }
    });
  } catch (e: any) {
    throw new Error(
      `Could not connect to the Jantt CORS proxy.\n\n` +
      `If the proxy hasn't been deployed yet, see the deployment guide in /worker/README.md.\n\n` +
      `(${e.message || "Network error"})`
    );
  }

  const quotaShieldActive = Boolean(res.headers?.get?.("X-Jantt-Quota-Shield") === "active");
  const source = res.headers?.get?.("X-Jantt-Cache") || undefined;

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("File not found (404). Verify the share link is correct and the file is publicly accessible.");
    }
    if (res.status === 429) {
      throw new Error(
        "Download rate limit temporarily exceeded. The serverless proxy is pacing requests."
      );
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `Access denied (${res.status}). Ensure the file is public or has appropriate access permissions.`
      );
    }
    throw new Error(`Proxy returned error ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  return { text, quotaShieldActive, source };
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

/**
 * Fetches, parses, and validates a remote Jantt plan from a shared URL.
 * Handles CORS automatically via proxy fallback.
 * Calculates deterministic content hash for high-efficiency collision and change detection.
 */
export async function fetchRemotePlan(
  url: string,
  options?: { previousHash?: string }
): Promise<RemoteFetchResult> {
  const info = parseCloudUrl(url);

  const rawResult = await fetchWithCorsFallback(info.downloadUrl, info.provider);
  const rawText = rawResult.text;

  // Detect HTML error pages (login redirects, 404 HTML pages, etc.)
  if (rawText.trimStart().startsWith("<!DOCTYPE") || rawText.trimStart().startsWith("<html")) {
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
