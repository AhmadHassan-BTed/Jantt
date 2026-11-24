import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { buildServiceWorker } from "./vite-pwa-plugin";

function worker(scope: string, cacheNames: string[] = []) {
  const events = new Map<string, (event: unknown) => void>();
  const cache = {
    addAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    match: vi.fn(async (url: string) => new Response(url))
  };
  const caches = {
    open: vi.fn(async () => cache), delete: vi.fn(async () => true),
    has: vi.fn(async () => false), keys: vi.fn(async () => cacheNames)
  };
  const self = {
    addEventListener: (name: string, fn: (event: unknown) => void) => events.set(name, fn),
    registration: { scope, active: true }, location: new URL(scope),
    clients: { claim: vi.fn() }, skipWaiting: vi.fn()
  };
  runInNewContext(buildServiceWorker("new", ["index.html", "privacy.html", "assets/plan-123456.js"]), {
    self, caches, URL, Request
  });
  async function fire(type: string, data = {}) {
    const until = vi.fn();
    events.get(type)?.({ waitUntil: until, respondWith: until, ...data });
    return until.mock.calls[0]?.[0];
  }
  return { cache, caches, self, fire };
}

describe("generated offline worker", () => {
  const scope = "https://example.test/apps/jantt/";
  it("fails installation atomically when a required chunk is unavailable", async () => {
    const app = worker(scope);
    app.cache.addAll.mockRejectedValue(new Error("chunk unavailable"));
    await expect(app.fire("install")).rejects.toThrow("chunk unavailable");
    expect(app.caches.delete).toHaveBeenCalledWith(`jantt-shell:${scope}:new`);
    expect(app.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("cleans only this installation and retains the previous release for open tabs", async () => {
    const prefix = `jantt-shell:${scope}:`;
    const app = worker(scope, [prefix + "ancient", "jantt-shell:https://example.test/other/:v2", prefix + "previous", prefix + "new"]);
    await app.fire("activate");
    expect(app.caches.delete.mock.calls).toEqual([[prefix + "ancient"]]);
    expect(app.self.clients.claim).toHaveBeenCalled();
  });

  it("serves installed query shortcuts and pages using distinct subpath cache keys", async () => {
    const app = worker(scope);
    const navigate = (url: string) => app.fire("fetch", { request: { url, mode: "navigate", method: "GET" } });
    expect(await (await navigate(scope + "?view=tasks")).text()).toBe(scope + "index.html");
    expect(await (await navigate(scope + "privacy.html")).text()).toBe(scope + "privacy.html");
    expect(await navigate("https://example.test/other/?view=tasks")).toBeUndefined();
    expect(await navigate(scope + "api/private")).toBeUndefined();
  });
});

