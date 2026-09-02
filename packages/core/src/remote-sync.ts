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
  // - https://drive.google.com/file/d/{FILE_ID}
  // - https://drive.google.com/open?id={FILE_ID}
  // - https://drive.google.com/uc?id={FILE_ID}
  // - https://docs.google.com/file/d/{FILE_ID}
  const driveFileRegex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i;
  const driveOpenRegex = /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i;
  const driveUcRegex = /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/i;
  const docsFileRegex = /docs\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i;

  let driveMatch = trimmed.match(driveFileRegex) ||
    trimmed.match(driveOpenRegex) ||
    trimmed.match(driveUcRegex) ||
    trimmed.match(docsFileRegex);

  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    // Google Drive direct export download endpoint
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
    return {
      originalUrl: trimmed,
      provider: "google-drive",
      downloadUrl,
      fileId,
      label: "Google Drive"
    };
  }

  // 2. GitHub URLs (convert blob URL to raw.githubusercontent.com)
  // Format: https://github.com/{user}/{repo}/blob/{branch}/{path}
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

  // 3. Dropbox URLs (convert ?dl=0 to ?dl=1 or ?raw=1)
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

export interface RemoteFetchResult {
  data: JanttData;
  info: CloudUrlInfo;
  fetchedAt: string;
  title: string;
  taskCount: number;
}

/**
 * Fetches, parses, and validates a remote Jantt plan from a shared URL.
 */
export async function fetchRemotePlan(url: string): Promise<RemoteFetchResult> {
  const info = parseCloudUrl(url);

  let response: Response;
  try {
    response = await fetch(info.downloadUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*"
      }
    });
  } catch (netErr: any) {
    // If it's a Google Drive link, provide targeted guidance
    if (info.provider === "google-drive") {
      throw new Error(
        `Unable to fetch Google Drive file. Please ensure the file is shared with "Anyone with the link can view". (${netErr.message || "Network Error"})`
      );
    }
    throw new Error(`Failed to connect to remote server: ${netErr.message || "Network Error"}`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found (404). Please verify the link exists and is public.`);
    }
    if (response.status === 403 || response.status === 401) {
      throw new Error(`Access denied (${response.status}). Ensure the file sharing permissions are set to "Anyone with the link".`);
    }
    throw new Error(`Server returned error ${response.status}: ${response.statusText}`);
  }

  const rawText = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (jsonErr: any) {
    // Check if the response was an HTML error page (common with private Drive links)
    if (rawText.includes("<!DOCTYPE html") || rawText.includes("<html")) {
      throw new Error(
        `The URL returned an HTML page instead of JSON. If using Google Drive, make sure the file permissions are set to "Anyone with the link can view".`
      );
    }
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
