import type { RepoItem, VerificationStatus } from "./types";

export const TARGET_USER = "AhmadHassan-BTed";
export const TARGET_ORG = "Fractal-Compute-Orchestrations";

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

export const CORE_FLAGSHIP_REPOS = ALL_TARGET_REPOS;
export const FALLBACK_REPOS = ALL_TARGET_REPOS;

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
 * Retries an asynchronous operation up to maxTrials with delay.
 */
export async function retryOperation<T>(
  fn: () => Promise<T>,
  predicate: (res: T) => boolean,
  maxTrials = 3,
  delayMs = 250
): Promise<T> {
  let lastResult: T = await fn();
  if (predicate(lastResult)) return lastResult;

  for (let trial = 2; trial <= maxTrials; trial++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs * trial));
    try {
      lastResult = await fn();
      if (predicate(lastResult)) return lastResult;
    } catch {
      // Continue to next trial
    }
  }
  return lastResult;
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
    const headers = getGitHubHeaders(token);
    const [userRes, orgRes] = await Promise.allSettled([
      fetch(`https://api.github.com/users/${TARGET_USER}/repos?per_page=100`, { headers }),
      fetch(`https://api.github.com/orgs/${TARGET_ORG}/repos?per_page=100`, { headers })
    ]);

    const collected: RepoItem[] = [];

    if (userRes.status === "fulfilled" && userRes.value.ok) {
      const data = await userRes.value.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.full_name && !isRepoExcluded(item.full_name)) {
            collected.push({
              fullName: item.full_name,
              name: item.name,
              url: item.html_url || `https://github.com/${item.full_name}`
            });
          }
        }
      }
    }

    if (orgRes.status === "fulfilled" && orgRes.value.ok) {
      const data = await orgRes.value.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.full_name && !isRepoExcluded(item.full_name)) {
            collected.push({
              fullName: item.full_name,
              name: item.name,
              url: item.html_url || `https://github.com/${item.full_name}`
            });
          }
        }
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
 * Checks if the user is following the organization Fractal-Compute-Orchestrations.
 */
export async function checkIsFollowingOrg(
  username: string,
  token?: string
): Promise<boolean> {
  if (!username) return false;

  try {
    const timestamp = Date.now();
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/following/${TARGET_ORG}?_t=${timestamp}`,
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
 * 1-Click follow creator with up to 3 retry trials.
 */
export async function followCreator(token: string): Promise<boolean> {
  if (!token) return false;
  return retryOperation(
    async () => {
      try {
        const res = await fetch(`https://api.github.com/user/following/${TARGET_USER}`, {
          method: "PUT",
          headers: getGitHubHeaders(token)
        });
        return res.status === 204 || res.status === 200;
      } catch {
        return false;
      }
    },
    (ok) => ok,
    3,
    250
  );
}

/**
 * 1-Click follow organization with up to 3 retry trials.
 */
export async function followOrg(token: string): Promise<boolean> {
  if (!token) return false;
  return retryOperation(
    async () => {
      try {
        const res = await fetch(`https://api.github.com/user/following/${TARGET_ORG}`, {
          method: "PUT",
          headers: getGitHubHeaders(token)
        });
        return res.status === 204 || res.status === 200;
      } catch {
        return false;
      }
    },
    (ok) => ok,
    3,
    250
  );
}

/**
 * Checks if a specific repository is starred by the authenticated user with cache-busting.
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
    for (let page = 1; page <= 5; page++) {
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
 * 1-Click star a repository using user's GitHub OAuth token with up to 3 retry trials.
 */
export async function starRepository(
  repoFullName: string,
  token: string
): Promise<boolean> {
  if (!token || !repoFullName) return false;
  return retryOperation(
    async () => {
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
    },
    (ok) => ok,
    3,
    250
  );
}

/**
 * 1-Click star all missing repositories concurrently in manageable batches.
 */
export async function starAllMissingRepositories(
  missingRepos: RepoItem[],
  token: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  const batchSize = 6;
  for (let i = 0; i < missingRepos.length; i += batchSize) {
    const batch = missingRepos.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (repo) => {
        const ok = await starRepository(repo.fullName, token);
        if (ok) success++;
        else failed++;
      })
    );
  }

  return { success, failed };
}

/**
 * Runs transparent background auto-verification with user consent.
 * Concurrently follows creator & organization with 3 trials, stars all repos with 3 trials,
 * and accurately returns any items that could not be completed so the user can be asked.
 */
export async function runBackgroundAutoVerification(
  token: string,
  username: string
): Promise<VerificationStatus> {
  if (isCreatorAccount(username)) {
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

  const allRepos = (await getDeveloperRepos(token)).filter((r) => !isRepoExcluded(r.fullName));

  // 1. Concurrently run following of creator and org (with up to 3 trials each)
  await Promise.allSettled([
    followCreator(token),
    followOrg(token)
  ]);

  // 2. Concurrently star all repos in concurrency groups of 6 (with up to 3 trials each)
  const batchSize = 6;
  for (let i = 0; i < allRepos.length; i += batchSize) {
    const batch = allRepos.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map((repo) => starRepository(repo.fullName, token))
    );
  }

  // 3. Verify real state after automated trials
  return verifyAllGitHubRequirements(username, token);
}

/**
 * Comprehensive verification function that tests following creator, org, and starring repos.
 */
export async function verifyAllGitHubRequirements(
  username: string,
  token?: string
): Promise<VerificationStatus> {
  if (isCreatorAccount(username)) {
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
    const targetRepos = (await getDeveloperRepos(token)).filter((r) => !isRepoExcluded(r.fullName));

    // Concurrently verify follow status
    const [isFollowingUser, isFollowingOrg] = await Promise.all([
      checkIsFollowingCreator(username, token),
      checkIsFollowingOrg(username, token)
    ]);

    let starredSet: Set<string>;
    if (token) {
      // Query individual star status in concurrency groups of 8 with cache-busting
      const batchSize = 8;
      const checks: { fullName: string; isStarred: boolean }[] = [];
      for (let i = 0; i < targetRepos.length; i += batchSize) {
        const batch = targetRepos.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (repo) => {
            const isStarred = await checkIsRepoStarred(repo.fullName, token);
            return { fullName: repo.fullName, isStarred };
          })
        );
        checks.push(...batchResults);
      }
      starredSet = new Set(checks.filter((c) => c.isStarred).map((c) => c.fullName.toLowerCase()));
    } else {
      starredSet = await getUserStarredRepos(username, token);
    }

    const missingRepos: RepoItem[] = [];
    const starredList: string[] = [];

    for (const repo of targetRepos) {
      const isStarred = starredSet.has(repo.fullName.toLowerCase());
      if (isStarred) {
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
      totalRepos: targetRepos.length,
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
      error: err?.message || "Failed to verify GitHub status."
    };
  }
}
