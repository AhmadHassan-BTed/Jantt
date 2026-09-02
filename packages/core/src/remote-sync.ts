import { JanttData } from "./types";
import { validate } from "./validator";

export type CloudProviderType = "google-drive" | "github" | "dropbox" | "generic";

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

  // 1. Google Drive URLs
  // Formats:
  // - https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
  // - https://drive.google.com/file/d/{FILE_ID}/view?usp=drive_link
  // - https://drive.google.com/open?id={FILE_ID}
  // - https://drive.google.com/uc?id={FILE_ID}
  // - https://docs.google.com/file/d/{FILE_ID}
  const driveFileRegex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i;
  const driveOpenRegex = /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i;
  const driveUcRegex = /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/i;
  const docsFileRegex = /docs\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i;

  const driveMatch =
    trimmed.match(driveFileRegex) ||
    trimmed.match(driveOpenRegex) ||
    trimmed.match(driveUcRegex) ||
    trimmed.match(docsFileRegex);

  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    // Direct usercontent endpoint — works for public files but blocked by CORS
    // when fetched from browser JS. We store it and handle CORS via proxy fallback
    // inside fetchRemotePlan().
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    return {
      originalUrl: trimmed,
      provider: "google-drive",
      downloadUrl,
      fileId,
      label: "Google Drive"
    };
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

// ---------------------------------------------------------------------------
// CORS-aware fetch helper
// ---------------------------------------------------------------------------

/**
 * Attempts a direct fetch first, then falls back to the allorigins CORS proxy
 * for providers known to block cross-origin requests from browsers (Google Drive, Dropbox).
 */
async function fetchWithCorsFallback(url: string, provider: CloudProviderType): Promise<string> {
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";

  // For Google Drive we know direct browser fetch is always CORS-blocked,
  // so go straight to the proxy to save time.
  if (provider === "google-drive") {
    return fetchViaProxy(url, CORS_PROXY);
  }

  // For others, try direct first.
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" }
    });
    if (res.ok) return res.text();
  } catch {
    // Direct fetch failed (CORS / network) — fall through to proxy
  }

  // Fallback: proxy
  return fetchViaProxy(url, CORS_PROXY);
}

async function fetchViaProxy(targetUrl: string, proxy: string): Promise<string> {
  const proxyUrl = `${proxy}${encodeURIComponent(targetUrl)}`;
  let res: Response;
  try {
    res = await fetch(proxyUrl, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" }
    });
  } catch (e: any) {
    throw new Error(`Network error — could not reach remote server or proxy: ${e.message || String(e)}`);
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("File not found (404). Please verify the share link is correct and the file is publicly accessible.");
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `Access denied (${res.status}). Ensure the file sharing is set to "Anyone with the link can view".`
      );
    }
    throw new Error(`Server returned error ${res.status}: ${res.statusText}`);
  }

  return res.text();
}

// ---------------------------------------------------------------------------

export interface RemoteFetchResult {
  data: JanttData;
  info: CloudUrlInfo;
  fetchedAt: string;
  title: string;
  taskCount: number;
}

/**
 * Fetches, parses, and validates a remote Jantt plan from a shared URL.
 * Handles CORS automatically via proxy fallback for Google Drive and Dropbox links.
 */
export async function fetchRemotePlan(url: string): Promise<RemoteFetchResult> {
  const info = parseCloudUrl(url);

  let rawText: string;
  try {
    rawText = await fetchWithCorsFallback(info.downloadUrl, info.provider);
  } catch (err: any) {
    if (info.provider === "google-drive") {
      throw new Error(
        `Unable to fetch Google Drive file.\n\n` +
        `Make sure the file sharing is set to "Anyone with the link can view":\n` +
        `Right-click → Share → Change to "Anyone with the link" → Copy link.\n\n` +
        `(${err.message || "Network error"})`
      );
    }
    throw err;
  }

  // Detect HTML error pages (private Drive links, login redirects, etc.)
  if (rawText.trimStart().startsWith("<!DOCTYPE") || rawText.trimStart().startsWith("<html")) {
    if (info.provider === "google-drive") {
      throw new Error(
        `Google Drive returned an HTML page instead of JSON.\n\n` +
        `This usually means the file is not publicly shared.\n` +
        `In Google Drive: right-click the file → Share → "Anyone with the link can view".`
      );
    }
    throw new Error(
      `The URL returned an HTML page instead of JSON. ` +
      `Make sure the link points directly to a public Jantt JSON file.`
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

  return {
    data,
    info,
    fetchedAt: new Date().toISOString(),
    title,
    taskCount
  };
}
