import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryStorageService } from "./memory-storage-service";
import { LocalStorageService } from "./local-storage-service";
import { storageService } from "./index";
import { STORAGE_KEYS } from "../../constants";
import { hashString, loadSavedProjects, saveCustomProjects, updateStoredProjects } from "../../utils";

/** Minimal Web Storage double with a switchable quota. */
class FakeLocalStorage {
  private data = new Map<string, string>();
  public quotaExceeded = false;
  public blocked = false;

  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.blocked) throw new Error("SecurityError");
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.blocked) throw new Error("SecurityError");
    if (this.quotaExceeded) {
      const err = new Error("The quota has been exceeded.");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}

describe("Storage Services", () => {
  describe("MemoryStorageService", () => {
    let service: MemoryStorageService;

    beforeEach(() => {
      service = new MemoryStorageService();
    });

    it("stores and retrieves primitive values", () => {
      expect(service.setItem("foo", "bar")).toBe(true);
      expect(service.getItem("foo")).toBe("bar");
      expect(service.hasItem("foo")).toBe(true);
    });

    it("stores and automatically deserializes JSON objects", () => {
      const payload = { a: 1, b: "two", c: [true, false] };
      service.setItem("obj", payload);
      expect(service.getItem("obj")).toEqual(payload);
    });

    it("returns null for nonexistent keys", () => {
      expect(service.getItem("nonexistent")).toBeNull();
      expect(service.hasItem("nonexistent")).toBe(false);
    });

    it("removes items and clears cleanly", () => {
      service.setItem("k1", "v1");
      service.setItem("k2", "v2");
      service.removeItem("k1");
      expect(service.getItem("k1")).toBeNull();
      expect(service.getItem("k2")).toBe("v2");
      service.clear();
      expect(service.getItem("k2")).toBeNull();
    });
  });

  describe("LocalStorageService", () => {
    let fake: FakeLocalStorage;

    beforeEach(() => {
      fake = new FakeLocalStorage();
      vi.stubGlobal("window", { localStorage: fake });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("persists to localStorage and reports durable writes", () => {
      const service = new LocalStorageService();
      expect(service.setItem("test-key", { hello: "world" })).toBe(true);
      expect(fake.getItem("test-key")).toBe('{"hello":"world"}');
      expect(service.getItem("test-key")).toEqual({ hello: "world" });
      service.removeItem("test-key");
      expect(service.getItem("test-key")).toBeNull();
    });

    it("reports a quota failure and reads back the newer in-memory value, not the stale stored one", () => {
      const service = new LocalStorageService();
      service.setItem("plans", ["v1"]);
      fake.quotaExceeded = true;

      expect(service.setItem("plans", ["v2"])).toBe(false);
      expect(fake.getItem("plans")).toBe('["v1"]');
      expect(service.getItem("plans")).toEqual(["v2"]);
      expect(service.hasItem("plans")).toBe(true);
    });

    it("still reads saved data when the quota is already full at startup", () => {
      fake.setItem("plans", '["saved"]');
      fake.quotaExceeded = true;
      const service = new LocalStorageService();
      expect(service.getItem("plans")).toEqual(["saved"]);
      expect(service.setItem("plans", ["newer"])).toBe(false);
      expect(service.getItem("plans")).toEqual(["newer"]);
      expect(fake.getItem("plans")).toBe('["saved"]');
    });

    it("makes localStorage authoritative again once a later write succeeds", () => {
      const service = new LocalStorageService();
      fake.quotaExceeded = true;
      service.setItem("plans", ["memory-only"]);
      fake.quotaExceeded = false;

      expect(service.setItem("plans", ["durable"])).toBe(true);
      // Another writer (e.g. a second tab) updates localStorage: it must be visible
      fake.setItem("plans", '["from-other-tab"]');
      expect(service.getItem("plans")).toEqual(["from-other-tab"]);
    });

    it("removeItem clears both the durable and the in-memory copy", () => {
      const service = new LocalStorageService();
      fake.quotaExceeded = true;
      service.setItem("k", "memory");
      service.removeItem("k");
      expect(service.getItem("k")).toBeNull();
    });

    it("falls back to memory when localStorage is unavailable and never claims durability", () => {
      fake.blocked = true;
      const service = new LocalStorageService();
      expect(service.setItem("k", { a: 1 })).toBe(false);
      expect(service.getItem("k")).toEqual({ a: 1 });
    });
  });
});

describe("Project list persistence", () => {
  const plan = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: `Plan ${id}`,
    updatedAt: "2026-01-01T00:00:00.000Z",
    data: { meta: { title: `Plan ${id}` }, tasks: [] },
    source: "local" as const,
    ...extra
  });

  const backupKey = (raw: string) => `${STORAGE_KEYS.CORRUPT_PROJECTS_PREFIX}${hashString(raw)}`;

  beforeEach(() => {
    storageService.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips plans and reports durable saves", () => {
    expect(saveCustomProjects([plan("p1")])).toBe(true);
    expect(loadSavedProjects().map((p) => p.id)).toEqual(["p1"]);
  });

  it("reports a failed save instead of pretending it worked", () => {
    vi.spyOn(storageService, "setItem").mockReturnValue(false);
    expect(saveCustomProjects([plan("p1")])).toBe(false);
  });

  it("quarantines malformed entries instead of crashing or silently dropping them", () => {
    const bad = [{ name: "no id" }, { id: "no-data", name: "x" }];
    storageService.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, [plan("ok"), ...bad]);
    const loaded = loadSavedProjects();
    expect(loaded.map((p) => p.id)).toEqual(["ok"]);
    // The bad entries are backed up and the sanitized list is written back once
    expect(storageService.getItem(backupKey(JSON.stringify(bad)))).toEqual(bad);
    expect(storageService.getItem<unknown[]>(STORAGE_KEYS.CUSTOM_PROJECTS)).toHaveLength(1);
    expect(loadSavedProjects().map((p) => p.id)).toEqual(["ok"]);
  });

  it("backs up an unreadable project blob before starting with an empty list", () => {
    storageService.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, "{not json");
    expect(loadSavedProjects()).toEqual([]);
    expect(storageService.getItem(backupKey("{not json"))).toBe("{not json");
    expect(storageService.getItem(STORAGE_KEYS.CUSTOM_PROJECTS)).toBeNull();
    // Re-reading is idempotent (no growing number of backups)
    expect(loadSavedProjects()).toEqual([]);
  });

  it("repairs missing names and migrates legacy linked feeds to local plans", () => {
    storageService.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, [
      { id: "a", data: { meta: { title: "From Meta" }, tasks: [] } },
      plan("b", { source: "linked", sourceUrl: "https://drive.google.com/x", name: "Feed (Cloud Feed + 3 tasks)" })
    ]);
    const [a, b] = loadSavedProjects();
    expect(a.name).toBe("From Meta");
    expect(b.source).toBeUndefined();
    expect((b as unknown as Record<string, unknown>).sourceUrl).toBeUndefined();
    expect(b.name).toBe("Feed");
  });

  it("read-modify-write keeps plans another tab saved in the meantime", () => {
    saveCustomProjects([plan("mine")]);
    // Another tab appends a plan after this tab last read the list
    saveCustomProjects([plan("other-tab"), plan("mine")]);
    updateStoredProjects((list) => list.map((p) => (p.id === "mine" ? { ...p, name: "Renamed" } : p)));
    const ids = loadSavedProjects().map((p) => `${p.id}:${p.name}`);
    expect(ids).toEqual(["other-tab:Plan other-tab", "mine:Renamed"]);
  });
});
