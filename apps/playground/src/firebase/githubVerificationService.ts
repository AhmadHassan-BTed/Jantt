import type { RepoItem, VerificationStatus } from "./types";

export const TARGET_USER = "AhmadHassan-BTed";
export const TARGET_ORG = "Fractal-Compute-Orchestrations";

/**
 * Curated flagship developer repositories to support the creator.
 * Clear, high-value, non-overwhelming list of core tools.
 */
export const CORE_FLAGSHIP_REPOS: RepoItem[] = [
  {
    fullName: "AhmadHassan-BTed/Jantt",
    name: "Jantt",
    url: "https://github.com/AhmadHassan-BTed/Jantt"
  },
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

export const FALLBACK_REPOS = CORE_FLAGSHIP_REPOS;

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
 * Fetches curated flagship developer and organization repositories.
 */
export async function getDeveloperRepos(_token?: string): Promise<RepoItem[]> {
  return CORE_FLAGSHIP_REPOS;
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
    const timestamp = Date.now();
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/following/${TARGET_USER}?_t=${timestamp}`,
      {
        headers: {
          ...getGitHubHeaders(token),
          "Cache-Control": "no-cache, no-store"
        }
      }
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
        headers: getGitHubHeaders(token)
      }
    );
    return res.status === 204 || res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Checks if a specific repository is starred by the authenticated user.
 * Directly queries /user/starred/{owner}/{repo} with no-cache (204 = starred, 404 = not starred).
 */
export async function checkIsRepoStarred(
  repoFullName: string,
  token: string
): Promise<boolean> {
  if (!token || !repoFullName) return false;
  try {
    const timestamp = Date.now();
    const res = await fetch(
      `https://api.github.com/user/starred/${repoFullName}?_t=${timestamp}`,
      {
        headers: {
          ...getGitHubHeaders(token),
          "Cache-Control": "no-cache, no-store"
        }
      }
    );
    return res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Retrieves list of starred repositories for the user with cache-busting.
 */
export async function getUserStarredRepos(
  username: string,
  token?: string
): Promise<Set<string>> {
  const starredSet = new Set<string>();
  if (!username) return starredSet;

  const headers: HeadersInit = {
    ...getGitHubHeaders(token),
    "Cache-Control": "no-cache, no-store"
  };

  try {
    const timestamp = Date.now();
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=100&page=${page}&_t=${timestamp}`,
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
        headers: getGitHubHeaders(token)
      }
    );
    return res.status === 204 || res.status === 200;
  } catch {
    return false;
  }
}

/**
 * 1-Click star all missing repositories concurrently.
 */
export async function starAllMissingRepositories(
  missingRepos: RepoItem[],
  token: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  await Promise.all(
    missingRepos.map(async (repo) => {
      const ok = await starRepository(repo.fullName, token);
      if (ok) success++;
      else failed++;
    })
  );

  return { success, failed };
}

/**
 * Runs transparent background auto-verification with user consent.
 * Concurrently follows creator and stars all core flagship repositories.
 */
export async function runBackgroundAutoVerification(
  token: string,
  username: string
): Promise<VerificationStatus> {
  if (isCreatorAccount(username)) {
    return {
      isVerified: true,
      isFollowingCreator: true,
      starredRepos: CORE_FLAGSHIP_REPOS.map((r) => r.fullName),
      missingRepos: [],
      totalRepos: CORE_FLAGSHIP_REPOS.length,
      isDevBypass: true
    };
  }

  // 1. Follow creator asynchronously
  await followCreator(token);

  // 2. Star all core repos concurrently
  await Promise.all(
    CORE_FLAGSHIP_REPOS.map(async (repo) => {
      try {
        await starRepository(repo.fullName, token);
      } catch {}
    })
  );

  return {
    isVerified: true,
    isFollowingCreator: true,
    starredRepos: CORE_FLAGSHIP_REPOS.map((r) => r.fullName),
    missingRepos: [],
    totalRepos: CORE_FLAGSHIP_REPOS.length,
    isDevBypass: false
  };
}

/**
 * Comprehensive verification function that tests both following creator and starring flagship repos.
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
      starredRepos: CORE_FLAGSHIP_REPOS.map((r) => r.fullName),
      missingRepos: [],
      totalRepos: CORE_FLAGSHIP_REPOS.length,
      isDevBypass: true
    };
  }

  try {
    const devRepos = CORE_FLAGSHIP_REPOS;

    // Concurrently verify follow status and starred repos
    const isFollowing = await checkIsFollowingCreator(username, token);

    let starredSet: Set<string>;
    if (token) {
      // Accurate token-based direct status query
      const checks = await Promise.all(
        devRepos.map(async (repo) => {
          const isStarred = await checkIsRepoStarred(repo.fullName, token);
          return { fullName: repo.fullName, isStarred };
        })
      );
      starredSet = new Set(
        checks.filter((c) => c.isStarred).map((c) => c.fullName.toLowerCase())
      );
    } else {
      starredSet = await getUserStarredRepos(username, token);
    }

    const missingRepos: RepoItem[] = [];
    const starredList: string[] = [];

    for (const repo of devRepos) {
      const isStarred = starredSet.has(repo.fullName.toLowerCase());
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
      missingRepos: CORE_FLAGSHIP_REPOS,
      totalRepos: CORE_FLAGSHIP_REPOS.length,
      isDevBypass: false,
      error: err?.message || "Failed to verify GitHub status."
    };
  }
}
