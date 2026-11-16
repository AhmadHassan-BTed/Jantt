// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_TARGET_REPOS,
  checkIsFollowingCreator,
  ENABLE_GITHUB_VERIFICATION_GATE,
  getDeveloperRepos,
  getUserStarredRepos,
  isCreatorAccount,
  openRepoOnGitHub,
  starAllMissingRepositories,
  verifyAllGitHubRequirements
} from "./githubVerificationService";

function response(status: number, body: unknown = null, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("creator bypass", () => {
  it("matches the exact GitHub login only", () => {
    expect(isCreatorAccount("AhmadHassan-BTed")).toBe(true);
    expect(isCreatorAccount("@ahmadhassan-bted")).toBe(true);
    expect(isCreatorAccount("Ahmad-Hassan")).toBe(false);
    expect(isCreatorAccount("ahmadhassan")).toBe(false);
    expect(isCreatorAccount("ahmadhassan_bted")).toBe(false);
  });
});

describe("GitHub requests", () => {
  it("avoids the Cache-Control request header that breaks the CORS preflight", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response(204));
    vi.stubGlobal("fetch", fetchMock);
    await checkIsFollowingCreator("octocat");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe("no-store");
    expect(init.headers).not.toHaveProperty("Cache-Control");
  });

  it("checks the token owner rather than a self-chosen name when a token exists", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response(204));
    vi.stubGlobal("fetch", fetchMock);
    await checkIsFollowingCreator("someone-else", "gho_token");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/user/following/AhmadHassan-BTed");
  });

  it("surfaces rate limiting instead of reporting 'not starred'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(403, { message: "rate limit" }, { "x-ratelimit-remaining": "0" })));
    await expect(getUserStarredRepos("octocat")).rejects.toThrow(/rate limit/i);
  });

  it("treats a rejected token as a failed check, never as 'not following'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(401, { message: "Bad credentials" })));
    await expect(checkIsFollowingCreator("octocat", "gho_revoked")).rejects.toThrow(/expired/);
  });

  it("ignores forks and archived repositories in the requirement", async () => {
    const repos = Array.from({ length: 10 }, (_, i) => ({ full_name: `AhmadHassan-BTed/R${i}`, name: `R${i}`, html_url: "" }));
    repos.push({ full_name: "AhmadHassan-BTed/Fork", name: "Fork", html_url: "", fork: true } as never);
    repos.push({ full_name: "AhmadHassan-BTed/Old", name: "Old", html_url: "", archived: true } as never);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(200, url.includes("/users/") ? repos : [])));
    const result = await getDeveloperRepos();
    expect(result.map((r) => r.name)).not.toContain("Fork");
    expect(result.map((r) => r.name)).not.toContain("Old");
    expect(result).toHaveLength(10);
  });

  it("reports an unreachable GitHub as a failed check, never as 'not following'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(checkIsFollowingCreator("octocat")).rejects.toThrow(/Couldn't reach GitHub/);
    await expect(getUserStarredRepos("octocat")).rejects.toThrow(/Couldn't reach GitHub/);
  });
});

describe("links", () => {
  it("only ever links to github.com repository pages", () => {
    expect(ALL_TARGET_REPOS.every((r) => r.url === `https://github.com/${r.fullName}`)).toBe(true);
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    expect(openRepoOnGitHub("https://github.com/octo/repo")).toBe(true);
    expect(openRepoOnGitHub("octo/repo")).toBe(true);
    expect(openRepoOnGitHub("https://evil.example/octo/repo")).toBe(false);
    expect(openRepoOnGitHub("javascript:alert(1)")).toBe(false);
    expect(open.mock.calls.map((call) => call[0])).toEqual(["https://github.com/octo/repo", "https://github.com/octo/repo"]);
  });

  it("builds repository links from the name, not from the API's URL field", async () => {
    const repos = Array.from({ length: 10 }, (_, i) => ({ full_name: `octo/r${i}`, name: `r${i}`, html_url: "javascript:alert(1)" }));
    repos.push({ full_name: "../../evil", name: "evil", html_url: "" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(200, url.includes("/orgs/") ? repos : [])));
    vi.resetModules(); // a fresh repository cache
    const fresh = await import("./githubVerificationService");
    const result = await fresh.getDeveloperRepos();
    expect(result).toHaveLength(10);
    expect(result.every((r) => r.url.startsWith("https://github.com/octo/r"))).toBe(true);
  });
});

describe("manual starring", () => {
  it("opens one tab per click and reports a blocked popup", async () => {
    const open = vi.spyOn(window, "open").mockReturnValueOnce({} as Window).mockReturnValueOnce(null);
    expect(await starAllMissingRepositories(ALL_TARGET_REPOS)).toEqual({ success: 1, failed: 0 });
    expect(await starAllMissingRepositories(ALL_TARGET_REPOS)).toEqual({ success: 0, failed: 1 });
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe("verifyAllGitHubRequirements", () => {
  it("is off unless the build enables it", () => {
    expect(ENABLE_GITHUB_VERIFICATION_GATE).toBe(false);
  });

  it("is a network-free bypass while the gate is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const status = await verifyAllGitHubRequirements("");
    expect(status.isVerified).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
