import { tGlobal } from "../i18n";
import type { RepoItem, VerificationStatus } from "./types";

export const TARGET_USER = "AhmadHassan-BTed";
export const TARGET_ORG = "Fractal-Compute-Orchestrations";

/**
 * Build-time flag for the GitHub verification gate (following the creator and starring repos).
 * Off unless the build sets `VITE_ENABLE_GH_GATE=true`; the bundler then drops the gated code.
 * The gate is client-side UX only: its flags are self-reported, so it never authorizes anything.
 */
export const ENABLE_GITHUB_VERIFICATION_GATE: boolean =
  // Spelled `import.meta.env.VITE_*` after type erasure, so Vite replaces it statically.
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_ENABLE_GH_GATE === "true";

const GITHUB_WEB = "https://github.com/";
/** `owner/name` as GitHub allows it; anything else is not used to build URLs. */
const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/**
 * Complete suite of public developer repositories for AhmadHassan-BTed and Fractal-Compute-Orchestrations.
 * (Excludes .github, Fractal-PrivacyPolicy, and Fractal_basics per user instruction).
 */
export const EXCLUDED_REPOS = new Set([
  "fractal-compute-orchestrations/.github",
  "fractal-compute-orchestrations/fractal-privacypolicy",
  "fractal-compute-orchestrations/fractal_basics",
  ".github",
  "fractal-privacypolicy",
  "fractal_basics"
]);

/**
 * Checks if a repository should be excluded from starring requirements.
 */
export function isRepoExcluded(fullNameOrName: string): boolean {
  if (!fullNameOrName) return true;
  const lower = fullNameOrName.toLowerCase().trim();
  const baseName = lower.includes("/") ? lower.split("/")[1] : lower;
  return (
    baseName.startsWith(".") ||
    EXCLUDED_REPOS.has(lower) ||
    EXCLUDED_REPOS.has(baseName)
  );
}

export const ALL_TARGET_REPOS: RepoItem[] = [
  // Flagship tools
  { fullName: "AhmadHassan-BTed/Jantt", name: "Jantt", url: "https://github.com/AhmadHassan-BTed/Jantt" },
  { fullName: "AhmadHassan-BTed/Attendify", name: "Attendify", url: "https://github.com/AhmadHassan-BTed/Attendify" },
  { fullName: "AhmadHassan-BTed/ScrollToPrompt", name: "ScrollToPrompt", url: "https://github.com/AhmadHassan-BTed/ScrollToPrompt" },
  { fullName: "AhmadHassan-BTed/Turnitout-Humanizer", name: "Turnitout-Humanizer", url: "https://github.com/AhmadHassan-BTed/Turnitout-Humanizer" },
  { fullName: "Fractal-Compute-Orchestrations/FractalWorkspace", name: "FractalWorkspace", url: "https://github.com/Fractal-Compute-Orchestrations/FractalWorkspace" },
  { fullName: "Fractal-Compute-Orchestrations/FractalAndroid", name: "FractalAndroid", url: "https://github.com/Fractal-Compute-Orchestrations/FractalAndroid" },
  { fullName: "Fractal-Compute-Orchestrations/FractalCore", name: "FractalCore", url: "https://github.com/Fractal-Compute-Orchestrations/FractalCore" },
  // Creator developer tools & applications
  { fullName: "AhmadHassan-BTed/AhSilence", name: "AhSilence", url: "https://github.com/AhmadHassan-BTed/AhSilence" },
  { fullName: "AhmadHassan-BTed/AuraEconomy", name: "AuraEconomy", url: "https://github.com/AhmadHassan-BTed/AuraEconomy" },
  { fullName: "AhmadHassan-BTed/B", name: "B", url: "https://github.com/AhmadHassan-BTed/B" },
  { fullName: "AhmadHassan-BTed/CoDiver", name: "CoDiver", url: "https://github.com/AhmadHassan-BTed/CoDiver" },
  { fullName: "AhmadHassan-BTed/CursedTomorrow", name: "CursedTomorrow", url: "https://github.com/AhmadHassan-BTed/CursedTomorrow" },
  { fullName: "AhmadHassan-BTed/Darkument", name: "Darkument", url: "https://github.com/AhmadHassan-BTed/Darkument" },
  { fullName: "AhmadHassan-BTed/EQAI", name: "EQAI", url: "https://github.com/AhmadHassan-BTed/EQAI" },
  { fullName: "AhmadHassan-BTed/FormFilla", name: "FormFilla", url: "https://github.com/AhmadHassan-BTed/FormFilla" },
  { fullName: "AhmadHassan-BTed/GardenPulse", name: "GardenPulse", url: "https://github.com/AhmadHassan-BTed/GardenPulse" },
  { fullName: "AhmadHassan-BTed/JinaClip", name: "JinaClip", url: "https://github.com/AhmadHassan-BTed/JinaClip" },
  { fullName: "AhmadHassan-BTed/KodeArrow", name: "KodeArrow", url: "https://github.com/AhmadHassan-BTed/KodeArrow" },
  { fullName: "AhmadHassan-BTed/LichArch", name: "LichArch", url: "https://github.com/AhmadHassan-BTed/LichArch" },
  { fullName: "AhmadHassan-BTed/MotionShot", name: "MotionShot", url: "https://github.com/AhmadHassan-BTed/MotionShot" },
  { fullName: "AhmadHassan-BTed/Noria", name: "Noria", url: "https://github.com/AhmadHassan-BTed/Noria" },
  { fullName: "AhmadHassan-BTed/OpenHeart", name: "OpenHeart", url: "https://github.com/AhmadHassan-BTed/OpenHeart" },
  { fullName: "AhmadHassan-BTed/OpenOPC", name: "OpenOPC", url: "https://github.com/AhmadHassan-BTed/OpenOPC" },
  { fullName: "AhmadHassan-BTed/OpenOPC-Shadow-Adapter", name: "OpenOPC-Shadow-Adapter", url: "https://github.com/AhmadHassan-BTed/OpenOPC-Shadow-Adapter" },
  { fullName: "AhmadHassan-BTed/Parchment", name: "Parchment", url: "https://github.com/AhmadHassan-BTed/Parchment" },
  { fullName: "AhmadHassan-BTed/PortfolioWebsite", name: "PortfolioWebsite", url: "https://github.com/AhmadHassan-BTed/PortfolioWebsite" },
  { fullName: "AhmadHassan-BTed/RoseWish", name: "RoseWish", url: "https://github.com/AhmadHassan-BTed/RoseWish" },
  { fullName: "AhmadHassan-BTed/ShopifyAutoAuth", name: "ShopifyAutoAuth", url: "https://github.com/AhmadHassan-BTed/ShopifyAutoAuth" },
  { fullName: "AhmadHassan-BTed/SilentSniffer", name: "SilentSniffer", url: "https://github.com/AhmadHassan-BTed/SilentSniffer" },
  { fullName: "AhmadHassan-BTed/SoulMatrix", name: "SoulMatrix", url: "https://github.com/AhmadHassan-BTed/SoulMatrix" },
  { fullName: "AhmadHassan-BTed/ThreadRace", name: "ThreadRace", url: "https://github.com/AhmadHassan-BTed/ThreadRace" },
  { fullName: "AhmadHassan-BTed/VisioCraft", name: "VisioCraft", url: "https://github.com/AhmadHassan-BTed/VisioCraft" },
  { fullName: "AhmadHassan-BTed/yt-channels-DS-AI-ML-CS", name: "yt-channels-DS-AI-ML-CS", url: "https://github.com/AhmadHassan-BTed/yt-channels-DS-AI-ML-CS" }
];

/**
 * Creator account, matched against the GitHub login from OAuth only (GitHub logins are unique
 * case-insensitively). Jantt usernames and display names never grant the creator bypass.
 */
export const CREATOR_USERNAMES = new Set([TARGET_USER.toLowerCase()]);

/**
 * Checks if the GitHub login belongs to the creator AhmadHassan-BTed.
 */
export function isCreatorAccount(githubLogin?: string): boolean {
  if (!githubLogin) return false;
  return CREATOR_USERNAMES.has(githubLogin.trim().toLowerCase().replace(/^@+/, ""));
}

/**
 * GitHub could not answer the check (rate limit exhausted, token revoked or expired). Never a
 * "not following / not starred" answer, so it must not be stored as a verification outcome.
 */
class GitHubCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubCheckError";
  }
}

/**
 * Builds standard GitHub REST headers.
 */
function getGitHubHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * GET against the GitHub REST API without caching. Uses `cache: "no-store"` rather than a
 * Cache-Control request header, which api.github.com's CORS preflight does not allow.
 * Throws on rate limiting and rejected tokens so callers never mistake them for
 * "not following / not starred".
 */
async function githubGet(url: string, token?: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: getGitHubHeaders(token), cache: "no-store" });
  } catch {
    // Offline or blocked: never an answer about the account.
    throw new GitHubCheckError("Couldn't reach GitHub. Check your connection, then recheck.");
  }
  if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
    throw new GitHubCheckError("GitHub rate limit reached. Please wait a few minutes, then recheck.");
  }
  if (res.status === 401 && token) {
    throw new GitHubCheckError("Your GitHub session has expired. Sign in with GitHub again, then recheck.");
  }
  return res;
}

function toRepoItems(data: unknown): RepoItem[] {
  if (!Array.isArray(data)) return [];
  const items: RepoItem[] = [];
  for (const item of data) {
    // Forks and archived repositories are not part of the requirement.
    if (!item || item.fork || item.archived) continue;
    const fullName = typeof item.full_name === "string" ? item.full_name : "";
    if (!REPO_FULL_NAME_PATTERN.test(fullName) || isRepoExcluded(fullName)) continue;
    // Rendered as links: only github.com pages, never a URL taken verbatim from the response.
    const url = `${GITHUB_WEB}${fullName}`;
    items.push({ fullName, name: typeof item.name === "string" && item.name ? item.name : fullName, url });
  }
  return items;
}

// In-memory cache for dynamically fetched repo list
let cachedDynamicRepos: RepoItem[] | null = null;
let lastDynamicFetchTime = 0;

/**
 * Fetches all public developer and organization repositories dynamically with cache.
 */
export async function getDeveloperRepos(token?: string): Promise<RepoItem[]> {
  const now = Date.now();
  if (cachedDynamicRepos && now - lastDynamicFetchTime < 300000) {
    return cachedDynamicRepos;
  }

  try {
    const responses = await Promise.allSettled([
      githubGet(`https://api.github.com/users/${TARGET_USER}/repos?per_page=100`, token),
      githubGet(`https://api.github.com/orgs/${TARGET_ORG}/repos?per_page=100`, token)
    ]);

    const collected: RepoItem[] = [];
    for (const res of responses) {
      if (res.status === "fulfilled" && res.value.ok) {
        collected.push(...toRepoItems(await res.value.json()));
      }
    }

    if (collected.length >= 10) {
      cachedDynamicRepos = collected;
      lastDynamicFetchTime = now;
      return collected;
    }
  } catch {
    // Fall back to complete static list
  }

  return ALL_TARGET_REPOS;
}

/**
 * Checks whether a GitHub user follows `target`. With a token, the token owner is checked
 * (`/user/following`), so the result belongs to the signed-in GitHub account.
 */
async function checkIsFollowing(target: string, username: string, token?: string): Promise<boolean> {
  const url = token
    ? `https://api.github.com/user/following/${target}`
    : `https://api.github.com/users/${encodeURIComponent(username)}/following/${target}`;
  // Failed checks throw (GitHubCheckError); only a real answer resolves.
  const res = await githubGet(url, token);
  return res.status === 204;
}

/**
 * Checks if the user is following the creator @AhmadHassan-BTed.
 */
export async function checkIsFollowingCreator(
  username: string,
  token?: string
): Promise<boolean> {
  if (!username && !token) return false;
  if (isCreatorAccount(username)) return true;
  return checkIsFollowing(TARGET_USER, username, token);
}

/**
 * Checks if the user is following the organization Fractal-Compute-Orchestrations.
 */
export async function checkIsFollowingOrg(
  username: string,
  token?: string
): Promise<boolean> {
  if (!username && !token) return false;
  return checkIsFollowing(TARGET_ORG, username, token);
}

/** Opens a GitHub page in a new tab; false when the browser blocked the popup. */
function openExternal(url: string): boolean {
  if (typeof window === "undefined") return false;
  return window.open(url, "_blank", "noopener,noreferrer") !== null;
}

/**
 * Opens creator GitHub profile in a new tab for manual following.
 */
export function openCreatorProfile(): boolean {
  return openExternal(`https://github.com/${TARGET_USER}`);
}

/**
 * Opens organization GitHub profile in a new tab for manual following.
 */
export function openOrgProfile(): boolean {
  return openExternal(`https://github.com/${TARGET_ORG}`);
}

/** The github.com page of a repository, given its `owner/name` or its github.com URL. */
function repoPageUrl(repoFullNameOrUrl: string): string | null {
  const value = (repoFullNameOrUrl || "").trim();
  const fullName = value.startsWith(GITHUB_WEB) ? value.slice(GITHUB_WEB.length).replace(/\/+$/, "") : value;
  return REPO_FULL_NAME_PATTERN.test(fullName) ? `${GITHUB_WEB}${fullName}` : null;
}

/**
 * Opens repository page in a new tab for manual starring on GitHub. Only github.com repository
 * pages are opened; anything else returns false.
 */
export function openRepoOnGitHub(repoFullNameOrUrl: string): boolean {
  const url = repoPageUrl(repoFullNameOrUrl);
  return url ? openExternal(url) : false;
}

/**
 * Opens missing repositories for manual starring. Browsers allow one new tab per click, so
 * only the first `maxToOpen` (default 1) is opened. Returns how many tabs actually opened.
 */
export function openMissingRepositories(repos: RepoItem[], maxToOpen = 1): number {
  let opened = 0;
  for (const repo of repos.slice(0, Math.max(0, maxToOpen))) {
    if (openRepoOnGitHub(repo.fullName)) opened++;
  }
  return opened;
}

/**
 * Manual follow creator helper: opens profile on GitHub. Returns whether the tab opened.
 * Zero automated PUT requests are made to comply with GitHub Acceptable Use Policies.
 */
export async function followCreator(_token?: string): Promise<boolean> {
  return openCreatorProfile();
}

/**
 * Manual follow organization helper: opens org profile on GitHub. Returns whether the tab opened.
 * Zero automated PUT requests are made to comply with GitHub Acceptable Use Policies.
 */
export async function followOrg(_token?: string): Promise<boolean> {
  return openOrgProfile();
}

/**
 * Retrieves the starred repositories (lowercased full names). With a token, the token owner's
 * stars are listed (`/user/starred`); otherwise the public stars of `username`.
 */
export async function getUserStarredRepos(
  username: string,
  token?: string
): Promise<Set<string>> {
  const starredSet = new Set<string>();
  if (!username && !token) return starredSet;

  const base = token
    ? "https://api.github.com/user/starred"
    : `https://api.github.com/users/${encodeURIComponent(username)}/starred`;

  try {
    for (let page = 1; page <= 5; page++) {
      const res = await githubGet(`${base}?per_page=100&page=${page}`, token);
      if (!res.ok) break;

      const pageData = await res.json();
      if (!Array.isArray(pageData) || pageData.length === 0) break;

      for (const r of pageData) {
        if (r && r.full_name) {
          starredSet.add(r.full_name.toLowerCase());
        }
      }

      if (pageData.length < 100) break;
    }
  } catch (err) {
    if (err instanceof GitHubCheckError) throw err;
    // Return whatever was collected
  }

  return starredSet;
}

/**
 * Manual star helper: opens repo page on GitHub so user can star it manually.
 * Returns whether the tab opened.
 * Zero automated PUT requests are made to comply with GitHub Acceptable Use Policies.
 */
export async function starRepository(
  repoFullName: string,
  _token?: string
): Promise<boolean> {
  return openRepoOnGitHub(repoFullName);
}

/**
 * Opens the next unstarred repository for manual starring (one tab per click).
 * `failed` counts tabs the browser blocked.
 */
export async function starAllMissingRepositories(
  missingRepos: RepoItem[],
  _token?: string
): Promise<{ success: number; failed: number }> {
  if (!missingRepos.length) return { success: 0, failed: 0 };
  const opened = openMissingRepositories(missingRepos, 1);
  return { success: opened, failed: 1 - opened };
}

/**
 * Comprehensive verification function that tests following creator, org, and starring repos.
 * `githubLogin` must be the GitHub login from OAuth (not a Jantt username). Failures (rate
 * limits, network) come back with `error` set so callers can avoid persisting them.
 */
export async function verifyAllGitHubRequirements(
  githubLogin: string,
  token?: string
): Promise<VerificationStatus> {
  if (!ENABLE_GITHUB_VERIFICATION_GATE || isCreatorAccount(githubLogin)) {
    return {
      isVerified: true,
      isFollowingCreator: true,
      isFollowingOrg: true,
      starredRepos: ALL_TARGET_REPOS.map((r) => r.fullName),
      missingRepos: [],
      totalRepos: ALL_TARGET_REPOS.length,
      isDevBypass: true
    };
  }

  try {
    if (!githubLogin && !token) {
      throw new Error(tGlobal("services.github.signInAgain"));
    }

    const [targetRepos, isFollowingUser, isFollowingOrg, starredSet] = await Promise.all([
      getDeveloperRepos(token),
      checkIsFollowingCreator(githubLogin, token),
      checkIsFollowingOrg(githubLogin, token),
      getUserStarredRepos(githubLogin, token)
    ]);

    const missingRepos: RepoItem[] = [];
    const starredList: string[] = [];

    for (const repo of targetRepos) {
      if (isRepoExcluded(repo.fullName)) continue;
      if (starredSet.has(repo.fullName.toLowerCase())) {
        starredList.push(repo.fullName);
      } else {
        missingRepos.push({ ...repo, isStarred: false });
      }
    }

    // Require following creator and all repos starred (org follow is attempted, and tracked)
    const isVerified = isFollowingUser && missingRepos.length === 0;

    return {
      isVerified,
      isFollowingCreator: isFollowingUser,
      isFollowingOrg,
      starredRepos: starredList,
      missingRepos,
      totalRepos: starredList.length + missingRepos.length,
      isDevBypass: false
    };
  } catch (err: any) {
    return {
      isVerified: false,
      isFollowingCreator: false,
      isFollowingOrg: false,
      starredRepos: [],
      missingRepos: ALL_TARGET_REPOS,
      totalRepos: ALL_TARGET_REPOS.length,
      isDevBypass: false,
      error: err?.message || tGlobal("services.github.verificationFailed")
    };
  }
}
