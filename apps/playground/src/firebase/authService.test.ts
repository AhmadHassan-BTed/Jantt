// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal Realtime Database fake: multi-path updates (atomic), reads, prefix queries, denials. */
const db = vi.hoisted(() => {
  type Json = any;
  const split = (p: string) => p.split("/").filter(Boolean);
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const state = {
    root: {} as Json,
    updates: [] as Array<Record<string, unknown>>,
    /** Returns true to reject a multi-path update (as the rules would). */
    rejectUpdate: null as null | ((paths: string[]) => boolean),
    unreadable: [] as string[]
  };
  const getAt = (path: string): Json => {
    let cur = state.root;
    for (const seg of split(path)) {
      if (cur === null || typeof cur !== "object" || !(seg in cur)) return null;
      cur = cur[seg];
    }
    return cur ?? null;
  };
  const setAt = (path: string, value: Json) => {
    const segs = split(path);
    let cur = state.root;
    for (const seg of segs.slice(0, -1)) {
      if (cur[seg] === null || typeof cur[seg] !== "object") cur[seg] = {};
      cur = cur[seg];
    }
    const last = segs[segs.length - 1];
    if (value === null || value === undefined) delete cur[last];
    else cur[last] = clone(value);
  };
  const snapshot = (path: string, value: Json) => ({
    key: split(path).pop() ?? null,
    exists: () => value !== null && value !== undefined,
    val: () => (value === null || value === undefined ? null : clone(value)),
    forEach(fn: (child: unknown) => void) {
      for (const [k, v] of Object.entries(value || {})) fn(snapshot(`${path}/${k}`, v));
    }
  });
  const denied = () => Object.assign(new Error("PERMISSION_DENIED: Permission denied"), { code: "PERMISSION_DENIED" });
  return {
    state,
    getAt,
    setAt,
    reset() {
      state.root = {};
      state.updates = [];
      state.rejectUpdate = null;
      state.unreadable = [];
    },
    sdk: {
      ref: (_db: unknown, path = "") => ({ path }),
      query: (r: { path: string }, ...constraints: Array<{ type: string; value?: unknown }>) => ({ path: r.path, constraints }),
      orderByChild: (value: string) => ({ type: "orderByChild", value }),
      startAt: (value: string) => ({ type: "startAt", value }),
      endAt: (value: string) => ({ type: "endAt", value }),
      limitToFirst: (value: number) => ({ type: "limitToFirst", value }),
      get: async (r: { path: string; constraints?: Array<{ type: string; value?: unknown }> }) => {
        if (state.unreadable.includes(r.path)) throw denied();
        const value = getAt(r.path);
        if (!r.constraints) return snapshot(r.path, value);
        const start = String(r.constraints.find((c) => c.type === "startAt")?.value ?? "");
        const limit = Number(r.constraints.find((c) => c.type === "limitToFirst")?.value ?? 100);
        const matches = Object.entries(value || {})
          .filter(([, v]: [string, any]) => typeof v?.username === "string" && v.username.startsWith(start))
          .slice(0, limit);
        return snapshot(r.path, matches.length ? Object.fromEntries(matches) : null);
      },
      update: async (r: { path: string }, values: Record<string, unknown>) => {
        const paths = Object.keys(values).map((k) => (r.path ? `${r.path}/${k}` : k));
        if (state.rejectUpdate?.(paths)) throw denied();
        state.updates.push(Object.fromEntries(paths.map((p, i) => [p, Object.values(values)[i]])));
        paths.forEach((p, i) => setAt(p, Object.values(values)[i]));
      },
      set: async (r: { path: string }, value: unknown) => {
        if (state.rejectUpdate?.([r.path])) throw denied();
        setAt(r.path, value);
      }
    }
  };
});

// Copies of the GitHub token persisted by older builds, present before the module loads.
vi.hoisted(() => {
  localStorage.setItem("jantt_gh_access_token", "gho_legacy");
  sessionStorage.setItem("jantt_gh_access_token", JSON.stringify({ uid: "u1", token: "gho_legacy" }));
});

const authMock = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signOut: vi.fn(async () => {}),
  getAdditionalUserInfo: vi.fn(),
  GithubAuthProvider: { credentialFromResult: vi.fn(() => ({ accessToken: "gho_token" })) }
}));

vi.mock("firebase/database", () => db.sdk);
vi.mock("firebase/auth", () => authMock);
vi.mock("./firebaseConfig", () => ({
  rtdb: {},
  auth: { currentUser: null as null | { uid: string } },
  githubProvider: {},
  isPermissionDeniedError: (e: any) => /permission[_ ]denied/i.test(`${e?.code ?? ""} ${e?.message ?? e}`)
}));
vi.mock("./presenceService", () => ({ releaseAllRoomPresence: vi.fn(async () => {}) }));

import { auth } from "./firebaseConfig";
import { releaseAllRoomPresence } from "./presenceService";
import {
  checkUsernameAvailable,
  claimUsername,
  describeAuthError,
  getStoredGitHubToken,
  isRedirectSignInPending,
  searchUsersByUsername,
  signInWithGitHub,
  signOutUser,
  storeGitHubToken,
  updateUserTimeFormat
} from "./authService";

const NOW = "2026-01-01T00:00:00.000Z";
const legacyTokenCopies = [localStorage.getItem("jantt_gh_access_token"), sessionStorage.getItem("jantt_gh_access_token")];

function firebaseUser(uid: string, extra: Record<string, unknown> = {}) {
  return { uid, email: `${uid}@example.com`, displayName: uid.toUpperCase(), photoURL: `https://avatars.example/${uid}.png`, ...extra } as any;
}

function popupResult(uid: string, login: string | null) {
  authMock.signInWithPopup.mockResolvedValueOnce({ user: firebaseUser(uid) });
  authMock.getAdditionalUserInfo.mockReturnValueOnce(login ? { username: login } : null);
}

beforeEach(() => {
  db.reset();
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  (auth as { currentUser: { uid: string } | null }).currentUser = { uid: "u1" };
});

describe("GitHub token storage", () => {
  it("keeps the token in memory only, bound to the uid that obtained it", () => {
    storeGitHubToken("gho_secret", "u1");
    expect(getStoredGitHubToken("u1")).toBe("gho_secret");
    expect(getStoredGitHubToken("u2")).toBeNull();
    expect(getStoredGitHubToken()).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("deletes the copies older builds persisted", () => {
    expect(legacyTokenCopies).toEqual([null, null]);
  });
});

describe("describeAuthError", () => {
  it("stays silent for popups the user closed and explains real failures", () => {
    expect(describeAuthError({ code: "auth/popup-closed-by-user" })).toBeNull();
    expect(describeAuthError({ code: "auth/cancelled-popup-request" })).toBeNull();
    expect(describeAuthError({ code: "auth/network-request-failed" })).toMatch(/Network error/);
    expect(describeAuthError(new Error("boom"))).toMatch(/sign-in failed/);
  });
});

describe("signInWithGitHub", () => {
  it("claims the GitHub login and publishes a public profile without email or gate flags", async () => {
    popupResult("u1", "Octo_Cat");
    const { profile, githubToken } = await signInWithGitHub();
    expect(profile).toMatchObject({ uid: "u1", username: "octo_cat", githubUsername: "Octo_Cat", email: "u1@example.com" });
    expect(githubToken).toBeNull(); // the verification gate is off: no token is kept
    expect(db.getAt("usernames/octo_cat")).toBe("u1");
    const stored = db.getAt("users/u1");
    expect(stored).not.toHaveProperty("email");
    expect(stored).not.toHaveProperty("githubVerified");
    expect(db.getAt("public_profiles/u1")).toMatchObject({ uid: "u1", username: "octo_cat" });
    expect(db.getAt("public_profiles/u1")).not.toHaveProperty("email");
  });

  it("routes to onboarding when the handle belongs to someone else or is unusable", async () => {
    db.setAt("usernames/taken", "someone-else");
    popupResult("u1", "taken");
    expect((await signInWithGitHub()).profile).toBeNull();

    popupResult("u1", "admin");
    expect((await signInWithGitHub()).profile).toBeNull();

    popupResult("u1", null);
    expect((await signInWithGitHub()).profile).toBeNull();
    expect(db.state.updates).toHaveLength(0);
  });

  it("falls back to the profile records when the rules predate public profiles", async () => {
    db.state.rejectUpdate = (paths) => paths.some((p) => p.startsWith("public_profiles/"));
    popupResult("u1", "octocat");
    const { profile } = await signInWithGitHub();
    expect(profile?.username).toBe("octocat");
    expect(db.getAt("users/u1/username")).toBe("octocat");
  });

  it("falls back to a redirect when popups are blocked", async () => {
    authMock.signInWithPopup.mockRejectedValueOnce({ code: "auth/popup-blocked" });
    authMock.signInWithRedirect.mockResolvedValueOnce(undefined);
    await signInWithGitHub();
    expect(authMock.signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(isRedirectSignInPending()).toBe(true);
  });

  it("does not report a failed sign-in when only the profile could not be loaded", async () => {
    db.state.unreadable = ["users/u1"];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    popupResult("u1", "octocat");
    const { user, profile } = await signInWithGitHub();
    expect(user.uid).toBe("u1");
    expect(profile).toBeNull();
    warn.mockRestore();
  });

  it("refreshes only the GitHub login on an existing profile", async () => {
    db.setAt("users/u1", { uid: "u1", username: "octo", displayUsername: "octo", displayName: "Octo", createdAt: NOW, updatedAt: NOW, githubVerified: true });
    popupResult("u1", "octo-renamed");
    const { profile } = await signInWithGitHub();
    expect(profile?.username).toBe("octo");
    expect(Object.keys(db.state.updates[0]).sort()).toEqual(["users/u1/githubUsername", "users/u1/updatedAt"]);
  });
});

describe("usernames", () => {
  it("rejects reserved and malformed handles before touching the database", async () => {
    expect(await checkUsernameAvailable("Admin")).toMatchObject({ available: false, error: expect.stringMatching(/reserved/) });
    expect((await checkUsernameAvailable("   ")).available).toBe(false);
  });

  it("explains lookup failures in user terms", async () => {
    db.state.unreadable = ["usernames/octo"];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await checkUsernameAvailable("octo");
    expect(result.available).toBe(false);
    expect(result.error).not.toMatch(/database\.rules/);
    warn.mockRestore();
  });

  it("claims field by field, keeps the GitHub link and releases the previous handle", async () => {
    db.setAt("usernames/old_name", "u1");
    db.setAt("users/u1", {
      uid: "u1",
      username: "old_name",
      displayUsername: "old_name",
      displayName: "Octo",
      createdAt: NOW,
      updatedAt: NOW,
      githubUsername: "Octo",
      email: "legacy@example.com"
    });
    const profile = await claimUsername(firebaseUser("u1"), "@New_Name");
    expect(profile).toMatchObject({ username: "new_name", displayUsername: "New_Name", githubUsername: "Octo" });
    const write = db.state.updates[0];
    expect(write).not.toHaveProperty("users/u1");
    expect(write).not.toHaveProperty("users/u1/githubUsername");
    expect(write["usernames/old_name"]).toBeNull();
    expect(db.getAt("users/u1/githubUsername")).toBe("Octo");
    expect(db.getAt("usernames/new_name")).toBe("u1");
  });

  it("reports a lost race as a taken username", async () => {
    db.state.rejectUpdate = () => {
      db.setAt("usernames/race", "someone-else");
      return true;
    };
    await expect(claimUsername(firebaseUser("u1"), "race")).rejects.toThrow(/just taken/);
  });

  it("explains other rule rejections without database jargon", async () => {
    db.state.rejectUpdate = () => true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(claimUsername(firebaseUser("u1"), "octo")).rejects.toThrow(/can't be claimed right now/);
    warn.mockRestore();
  });
});

describe("searchUsersByUsername", () => {
  it("returns public fields only, keyed by the record key", async () => {
    db.setAt("public_profiles", {
      u2: { uid: "u2", username: "octavia", displayName: "Octavia", photoURL: "https://a/x.png" },
      u3: { uid: "u3", username: "bob", displayName: "Bob" }
    });
    const results = await searchUsersByUsername("Oct", "u1");
    expect(results).toEqual([
      expect.objectContaining({ uid: "u2", username: "octavia", displayName: "Octavia", photoURL: "https://a/x.png" })
    ]);
    expect(results[0]).not.toHaveProperty("email");
  });

  it("does not query legacy profiles when public profiles simply have no match", async () => {
    db.setAt("public_profiles", { u3: { uid: "u3", username: "bob", displayName: "Bob" } });
    db.setAt("users", { u2: { uid: "u2", username: "octavia", displayName: "Octavia" } });
    expect(await searchUsersByUsername("oct")).toEqual([]);
  });

  it("falls back to legacy profiles and strips private fields", async () => {
    db.state.unreadable = ["public_profiles"];
    db.setAt("users", { u2: { uid: "u2", username: "octavia", displayName: "Octavia", email: "o@example.com", githubVerified: true } });
    const [result] = await searchUsersByUsername("oct");
    expect(result).toMatchObject({ uid: "u2", username: "octavia" });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("githubVerified");
  });

  it("reports an unavailable search instead of 'no matches'", async () => {
    db.state.unreadable = ["public_profiles", "users"];
    await expect(searchUsersByUsername("oct")).rejects.toThrow(/PERMISSION_DENIED/);
  });
});

describe("public profile", () => {
  it("leaves out avatars the rules reject instead of failing the write", async () => {
    popupResult("u1", "octocat"); // the fake account's avatar is not hosted by GitHub
    await signInWithGitHub();
    expect(db.getAt("public_profiles/u1")).toMatchObject({ uid: "u1", username: "octocat" });
    expect(db.getAt("public_profiles/u1")).not.toHaveProperty("photoURL");

    authMock.signInWithPopup.mockResolvedValueOnce({
      user: firebaseUser("u2", { photoURL: "https://avatars.githubusercontent.com/u/2?v=4" })
    });
    authMock.getAdditionalUserInfo.mockReturnValueOnce({ username: "hubber" });
    await signInWithGitHub();
    expect(db.getAt("public_profiles/u2/photoURL")).toBe("https://avatars.githubusercontent.com/u/2?v=4");
  });
});

describe("signOutUser", () => {
  it("removes room presence before signing out and clears the token", async () => {
    storeGitHubToken("gho_secret", "u1");
    const order: string[] = [];
    vi.mocked(releaseAllRoomPresence).mockImplementationOnce(async () => {
      order.push("presence");
    });
    authMock.signOut.mockImplementationOnce(async () => {
      order.push("signOut");
    });
    await signOutUser();
    expect(order).toEqual(["presence", "signOut"]);
    expect(getStoredGitHubToken("u1")).toBeNull();
  });
});

describe("updateUserTimeFormat", () => {
  it("persists the user's 12h or 24h preference on users/{uid}", async () => {
    await updateUserTimeFormat("u1", "24h");
    expect(db.state.updates[0]["users/u1/timeFormat"]).toBe("24h");
    await updateUserTimeFormat("u1", "12h");
    expect(db.state.updates[1]["users/u1/timeFormat"]).toBe("12h");
  });
});
