import type { RepoItem, VerificationStatus } from "./types";

export const TARGET_USER = "AhmadHassan-BTed";
export const TARGET_ORG = "Fractal-Compute-Orchestrations";

export const EXCLUDED_REPO_KEYS = new Set([
  "ahmadhassan-bted/.github",
  "fractal-compute-orchestrations/.github",
  "ahmadhassan-bted/openopc",
  "ahmadhassan-bted/visiocraft",
  "ahmadhassan-bted/yt-channels-ds-ai-ml-cs",
  "fractal-compute-orchestrations/fractal-privacypolicy"
]);

export const FALLBACK_REPOS: RepoItem[] = [
  {
    fullName: "AhmadHassan-BTed/Attendify",
    name: "Attendify",
    url: "https://github.com/AhmadHassan-BTed/Attendify"
  },
  {
    fullName: "AhmadHassan-BTed/ScrollToPrompt",
    name: "ScrollToPrompt",
    url: "https://github.com/AhmadHassan-BTed/ScrollToPrompt"
  },
  {
    fullName: "AhmadHassan-BTed/Turnitout-Humanizer",
    name: "Turnitout-Humanizer",
    url: "https://github.com/AhmadHassan-BTed/Turnitout-Humanizer"
  },
  {
    fullName: "Fractal-Compute-Orchestrations/FractalWorkspace",
    name: "FractalWorkspace",
    url: "https://github.com/Fractal-Compute-Orchestrations/FractalWorkspace"
  }
];

export const CREATOR_USERNAMES = new Set([
  "ahmadhassan-bted",
  "ahmadhassan_bted",
  "ahmadhassan"
]);

/**
 * Checks if the username belongs to the creator AhmadHassan-BTed.
 */
export function isCreatorAccount(username?: string): boolean {
  if (!username) return false;
  const clean = username.trim().toLowerCase().replace(/^@+/, "");
  return CREATOR_USERNAMES.has(clean) || clean === TARGET_USER.toLowerCase();
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
 * Fetches all active public developer and organization repositories.
 */
export async function getDeveloperRepos(token?: string): Promise<RepoItem[]> {
  const reposMap = new Map<string, RepoItem>();
  const headers = getGitHubHeaders(token);

  // 1. Fetch user public repos
  try {
    const userRes = await fetch(
      `https://api.github.com/users/${TARGET_USER}/repos?per_page=100&type=public`,
      { headers }
    );
    if (userRes.ok) {
      const data = await userRes.json();
      if (Array.isArray(data)) {
        for (const r of data) {
          const fn = r.full_name;
          const fnLower = fn.toLowerCase();
          const isPrivate = r.private || r.visibility === "private";
          if (!isPrivate && !EXCLUDED_REPO_KEYS.has(fnLower)) {
            reposMap.set(fnLower, {
              fullName: fn,
              name: r.name,
              url: r.html_url
            });
          }
        }
      }
    }
  } catch {
    // Network or CORS issue; proceed to org
  }

  // 2. Fetch organization public repos
  try {
    const orgRes = await fetch(
      `https://api.github.com/orgs/${TARGET_ORG}/repos?per_page=100&type=public`,
      { headers }
    );
    if (orgRes.ok) {
      const data = await orgRes.json();
      if (Array.isArray(data)) {
        for (const r of data) {
          const fn = r.full_name;
          const fnLower = fn.toLowerCase();
          const isPrivate = r.private || r.visibility === "private";
          if (!isPrivate && !EXCLUDED_REPO_KEYS.has(fnLower)) {
            reposMap.set(fnLower, {
              fullName: fn,
              name: r.name,
              url: r.html_url
            });
          }
        }
      }
    }
  } catch {
    // Network or CORS issue
  }

  // 3. If API is empty (rate-limited without token or network blocked), use fallback repos
  if (reposMap.size === 0) {
    for (const fb of FALLBACK_REPOS) {
      reposMap.set(fb.fullName.toLowerCase(), fb);
    }
  }

  return Array.from(reposMap.values());
}

/**
 * Checks if the user is following the creator @AhmadHassan-BTed.
 */
export async function checkIsFollowingCreator(
  username: string,
  token?: string
): Promise<boolean> {
  if (!username) return false;
  if (username.toLowerCase() === TARGET_USER.toLowerCase()) return true;

  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/following/${TARGET_USER}`,
      { headers: getGitHubHeaders(token) }
    );
    return res.status === 204 || res.status === 200;
  } catch {
    return false;
  }
}

/**
 * 1-Click follow creator using user's GitHub OAuth token.
 */
export async function followCreator(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(
      `https://api.github.com/user/following/${TARGET_USER}`,
      {
        method: "PUT",
        headers: {
          ...getGitHubHeaders(token),
          "Content-Length": "0"
        }
      }
    );
    return res.status === 204 || res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Retrieves list of starred repositories for the user.
 */
export async function getUserStarredRepos(
  username: string,
  token?: string
): Promise<Set<string>> {
  const starredSet = new Set<string>();
  if (!username) return starredSet;

  const headers = getGitHubHeaders(token);

  try {
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=100&page=${page}`,
        { headers }
      );
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
  } catch {
    // Return whatever was collected
  }

  return starredSet;
}

/**
 * 1-Click star a repository using user's GitHub OAuth token.
 */
export async function starRepository(
  repoFullName: string,
  token: string
): Promise<boolean> {
  if (!token || !repoFullName) return false;
  try {
    const res = await fetch(
      `https://api.github.com/user/starred/${repoFullName}`,
      {
        method: "PUT",
        headers: {
          ...getGitHubHeaders(token),
          "Content-Length": "0"
        }
      }
    );
    return res.status === 204 || res.status === 200;
  } catch {
    return false;
  }
}

/**
 * 1-Click star all missing repositories in sequential batch.
 */
export async function starAllMissingRepositories(
  missingRepos: RepoItem[],
  token: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const repo of missingRepos) {
    const ok = await starRepository(repo.fullName, token);
    if (ok) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Comprehensive verification function that tests both following creator and starring all developer repos.
 */
export async function verifyAllGitHubRequirements(
  username: string,
  token?: string
): Promise<VerificationStatus> {
  // 1. Creator Account Auto-Bypass: Creator AhmadHassan-BTed never goes through checks
  if (isCreatorAccount(username)) {
    return {
      isVerified: true,
      isFollowingCreator: true,
      starredRepos: [],
      missingRepos: [],
      totalRepos: 0,
      isDevBypass: true
    };
  }

  try {
    // 2. Concurrently fetch dev repos, follow status, and user starred repos
    const [devRepos, isFollowing, userStarredSet] = await Promise.all([
      getDeveloperRepos(token),
      checkIsFollowingCreator(username, token),
      getUserStarredRepos(username, token)
    ]);

    const missingRepos: RepoItem[] = [];
    const starredList: string[] = [];

    for (const repo of devRepos) {
      const isStarred = userStarredSet.has(repo.fullName.toLowerCase());
      if (isStarred) {
        starredList.push(repo.fullName);
      } else {
        missingRepos.push({ ...repo, isStarred: false });
      }
    }

    const isVerified = isFollowing && missingRepos.length === 0;

    return {
      isVerified,
      isFollowingCreator: isFollowing,
      starredRepos: starredList,
      missingRepos,
      totalRepos: devRepos.length,
      isDevBypass: false
    };
  } catch (err: any) {
    return {
      isVerified: false,
      isFollowingCreator: false,
      starredRepos: [],
      missingRepos: FALLBACK_REPOS,
      totalRepos: FALLBACK_REPOS.length,
      isDevBypass: false,
      error: err?.message || "Failed to verify GitHub status."
    };
  }
}
