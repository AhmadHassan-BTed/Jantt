import { describe, it, expect, vi, afterEach } from "vitest";
import { parseCloudUrl, fetchRemotePlan, isMatchingCloudUrl } from "../src/remote-sync";
import { JanttData } from "../src/types";
// The CORS proxy worker lives outside the workspace packages; its policy is tested here.
import proxyWorker from "../../../worker/src/worker.js";

describe("Cloud Remote Sync & URL Parsing", () => {
  describe("parseCloudUrl", () => {
    it("rejects Google Drive share URLs with actionable deprecation message", () => {
      const urlSharing = "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y/view?usp=sharing";
      expect(() => parseCloudUrl(urlSharing)).toThrowError(/Google Drive linking is no longer supported/i);

      const urlFolder = "https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs";
      expect(() => parseCloudUrl(urlFolder)).toThrowError(/Google Drive linking is no longer supported/i);

      const urlDocs = "https://docs.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y";
      expect(() => parseCloudUrl(urlDocs)).toThrowError(/Google Drive linking is no longer supported/i);
    });

    it("parses GitHub blob URLs and transforms to raw.githubusercontent.com", () => {
      const url = "https://github.com/AhmadHassan-BTed/Jantt/blob/main/examples/master-template.json";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("github");
      expect(info.downloadUrl).toBe("https://raw.githubusercontent.com/AhmadHassan-BTed/Jantt/main/examples/master-template.json");
      expect(info.label).toBe("GitHub");
    });

    it("recognizes raw.githubusercontent.com and gists directly", () => {
      const url = "https://raw.githubusercontent.com/org/repo/main/schedule.json";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("github");
      expect(info.downloadUrl).toBe(url);
    });

    it("parses Dropbox URLs and converts ?dl=0 to ?dl=1", () => {
      const url = "https://www.dropbox.com/s/sample123/schedule.json?dl=0";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("dropbox");
      expect(info.downloadUrl).toBe("https://www.dropbox.com/s/sample123/schedule.json?dl=1");
    });

    it("handles generic JSON URLs", () => {
      const url = "https://api.mycompany.com/schedules/q3-roadmap.json";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("generic");
      expect(info.downloadUrl).toBe(url);
    });

    it("throws error for empty or invalid input", () => {
      expect(() => parseCloudUrl("")).toThrow();
      expect(() => parseCloudUrl(null as any)).toThrow();
    });
  });

  describe("fetchRemotePlan", () => {
    const validPlan: JanttData = {
      meta: { title: "Cloud Project Roadmap" },
      categories: {
        dev: { label: "Development", color: "#38BDF8" }
      },
      tasks: [
        {
          id: "t1",
          label: "Phase 1 Launch",
          category: "dev",
          start: "2026-09-01",
          end: "2026-09-10"
        }
      ]
    };

    it("successfully fetches and validates a GitHub plan (direct fetch)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(validPlan)
      });
      global.fetch = mockFetch;

      const result = await fetchRemotePlan("https://github.com/AhmadHassan-BTed/Jantt/blob/main/plan.json");
      expect(result.data.meta?.title).toBe("Cloud Project Roadmap");
      expect(result.taskCount).toBe(1);
      expect(result.title).toBe("Cloud Project Roadmap");
      expect(result.info.provider).toBe("github");
    });

    it("handles 404 file not found error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found"
      });
      global.fetch = mockFetch;

      await expect(fetchRemotePlan("https://api.example.com/missing.json")).rejects.toThrow("File not found (404)");
    });

    it("handles HTML response gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<!DOCTYPE html><html><body>Login required</body></html>"
      });
      global.fetch = mockFetch;

      await expect(fetchRemotePlan("https://api.example.com/login-redirect.json")).rejects.toThrow("HTML page instead of JSON");
    });

    it("handles invalid Jantt schema", async () => {
      const invalidPlan = {
        meta: { title: "Bad Plan" },
        tasks: [
          { id: "t1", label: "Invalid Date Task", category: "dev", start: "not-a-date", end: "2026-09-10" }
        ]
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(invalidPlan)
      });
      global.fetch = mockFetch;

      await expect(fetchRemotePlan("https://example.com/bad.json")).rejects.toThrow("not a valid Jantt plan");
    });
  });

  describe("isMatchingCloudUrl", () => {
    it("matches identical GitHub URLs across blob and raw forms", () => {
      const blob = "https://github.com/org/repo/blob/main/schedule.json";
      const raw = "https://raw.githubusercontent.com/org/repo/main/schedule.json";
      expect(isMatchingCloudUrl(blob, raw)).toBe(true);
    });

    it("handles trailing slashes, case and query differences", () => {
      expect(isMatchingCloudUrl("https://example.com/plan.json?v=1", "https://example.com/plan.json")).toBe(true);
      expect(isMatchingCloudUrl("https://example.com/plan.json/", "https://example.com/plan.json")).toBe(true);
      expect(isMatchingCloudUrl("", "https://example.com")).toBe(false);
      expect(isMatchingCloudUrl(null, "https://example.com")).toBe(false);
    });

    it("keeps resources that differ by identifying query parameters or path case apart", () => {
      expect(
        isMatchingCloudUrl("https://www.dropbox.com/scl/fi/abc/plan.json?rlkey=one&dl=0", "https://www.dropbox.com/scl/fi/abc/plan.json?rlkey=two")
      ).toBe(false);
      expect(
        isMatchingCloudUrl("https://www.dropbox.com/scl/fi/abc/plan.json?rlkey=one&dl=0", "https://WWW.dropbox.com/scl/fi/abc/plan.json?rlkey=one")
      ).toBe(true);
      expect(isMatchingCloudUrl("https://api.example.com/plans?plan=A", "https://api.example.com/plans?plan=B")).toBe(false);
      expect(isMatchingCloudUrl("https://raw.githubusercontent.com/o/r/main/Plan.json", "https://raw.githubusercontent.com/o/r/main/plan.json")).toBe(false);
    });
  });

  describe("URL hardening", () => {
    it("detects providers by host name, not by substring", () => {
      expect(parseCloudUrl("https://evil.example/x?raw.githubusercontent.com").provider).toBe("generic");
      const spoofedDropbox = parseCloudUrl("https://x.io/dropbox.com/p.json");
      expect(spoofedDropbox.provider).toBe("generic");
      expect(spoofedDropbox.downloadUrl).toBe("https://x.io/dropbox.com/p.json");
      expect(() => parseCloudUrl("https://evil.example/?q=drive.google.com")).not.toThrow();
      expect(parseCloudUrl("https://www.dropbox.com/s/a/p.json?dl=0&x=dl=0").downloadUrl).toBe(
        "https://www.dropbox.com/s/a/p.json?dl=1&x=dl%3D0"
      );
    });

    it("accepts only https links without embedded credentials", () => {
      expect(() => parseCloudUrl("http://example.com/plan.json")).toThrow(/https/);
      expect(() => parseCloudUrl("data:application/json,{}")).toThrow(/https/);
      expect(() => parseCloudUrl("https://user:pass@example.com/plan.json")).toThrow(/credentials/);
    });

    it("rejects localhost, IP literals and private network names", () => {
      for (const url of [
        "https://localhost/plan.json",
        "https://app.localhost:8443/plan.json",
        "https://127.0.0.1/plan.json",
        "https://0x7f000001/plan.json",
        "https://192.168.1.10/plan.json",
        "https://[::1]/plan.json",
        "https://intranet/plan.json"
      ]) {
        expect(() => parseCloudUrl(url)).toThrow(/private network/);
      }
      expect(parseCloudUrl("https://plans.example.com./plan.json").provider).toBe("generic");
    });
  });

  describe("fetchRemotePlan network policy", () => {
    const originalFetch = globalThis.fetch;
    const plan = { meta: { title: "P" }, tasks: [{ id: "t1", label: "T", category: "c", start: "2026-09-01", end: "2026-09-02" }] };
    const okResponse = (body: string, headers: Record<string, string> = {}) =>
      ({ ok: true, status: 200, headers: new Headers(headers), text: async () => body }) as unknown as Response;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      delete (window as any).__JANTT_CORS_PROXY;
    });

    it("never uses a proxy unless one is configured", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      globalThis.fetch = fetchMock;
      await expect(fetchRemotePlan("https://example.com/plan.json")).rejects.toThrow(/CORS/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to a configured proxy only for blocked requests without credentials", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(okResponse(JSON.stringify(plan), { "X-Jantt-Cache": "MISS" }));
      globalThis.fetch = fetchMock;
      const result = await fetchRemotePlan("https://example.com/plan.json", { proxyUrl: "https://proxy.test/" });
      expect(fetchMock.mock.calls[1][0]).toBe(`https://proxy.test/?url=${encodeURIComponent("https://example.com/plan.json")}`);
      expect(result.source).toBe("MISS");

      const tokenMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      globalThis.fetch = tokenMock;
      (window as any).__JANTT_CORS_PROXY = "https://proxy.test/";
      await expect(fetchRemotePlan("https://example.com/plan.json?token=secret")).rejects.toThrow(/CORS/);
      expect(tokenMock).toHaveBeenCalledTimes(1);
    });

    it("ignores window.__JANTT_CORS_PROXY unless the caller opts in", async () => {
      (window as any).__JANTT_CORS_PROXY = "https://proxy.test/";
      const blocked = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      globalThis.fetch = blocked;
      await expect(fetchRemotePlan("https://example.com/plan.json")).rejects.toThrow(/CORS/);
      expect(blocked).toHaveBeenCalledTimes(1);
      expect(blocked.mock.calls[0][0]).toBe("https://example.com/plan.json");

      const optedIn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(okResponse(JSON.stringify(plan)));
      globalThis.fetch = optedIn;
      await fetchRemotePlan("https://example.com/plan.json", { allowGlobalOverrides: true });
      expect(optedIn.mock.calls[1][0]).toBe(`https://proxy.test/?url=${encodeURIComponent("https://example.com/plan.json")}`);
    });

    it("does not retry HTTP errors through the proxy", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
      globalThis.fetch = fetchMock;
      await expect(fetchRemotePlan("https://example.com/plan.json", { proxyUrl: "https://proxy.test/" })).rejects.toThrow(
        /Access denied \(403\)/
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("detects lowercase HTML pages and rejects oversized files", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(okResponse("\n<!doctype html><html><body>Sign in</body></html>"));
      await expect(fetchRemotePlan("https://example.com/plan.json")).rejects.toThrow(/HTML page/);

      globalThis.fetch = vi.fn().mockResolvedValue(okResponse("{}", { "Content-Length": String(50 * 1024 * 1024) }));
      await expect(fetchRemotePlan("https://example.com/plan.json")).rejects.toThrow(/larger than/);
    });
  });
});

describe("CORS proxy worker", () => {
  const APP_ORIGIN = "https://ahmadhassan-bted.github.io";
  const originalFetch = globalThis.fetch;
  const planJson = JSON.stringify({ meta: { title: "P" }, tasks: [] });
  let counter = 0;
  const target = () => `https://raw.githubusercontent.com/o/r/main/plan-${++counter}.json`;
  const call = (url: string, init: { origin?: string | null; method?: string; env?: Record<string, string> } = {}) => {
    const headers = new Headers();
    if (init.origin !== null) headers.set("Origin", init.origin ?? APP_ORIGIN);
    return proxyWorker.fetch(
      { method: init.method ?? "GET", url, headers } as unknown as Request,
      init.env ?? {}
    ) as Promise<Response>;
  };
  const proxied = (upstream: string) => `https://proxy.workers.dev/?url=${encodeURIComponent(upstream)}`;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("rejects other origins, methods, the removed room API and disallowed targets", async () => {
    globalThis.fetch = vi.fn();
    const forbidden = await call(proxied(target()), { origin: "https://evil.example" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(forbidden.headers.get("Vary")).toBe("Origin");
    expect((await call(proxied(target()), { origin: null })).status).toBe(403);
    expect((await call(proxied(target()), { origin: "http://localhost:5173" })).status).toBe(403);
    expect((await call(proxied(target()), { method: "POST" })).status).toBe(405);
    expect((await call("https://proxy.workers.dev/api/room/abc")).status).toBe(410);
    expect((await call(proxied("https://evil.example/plan.json"))).status).toBe(400);
    expect((await call(proxied("http://raw.githubusercontent.com/o/r/main/p.json"))).status).toBe(400);
    expect((await call(proxied("https://proxy.workers.dev/?url=x"))).status).toBe(400);
    // Only GitHub's user-content hosts, only on the default port
    expect((await call(proxied("https://objects.githubusercontent.com/o/r/p.json"))).status).toBe(400);
    expect((await call(proxied("https://raw.githubusercontent.com:8443/o/r/main/p.json"))).status).toBe(400);
    expect((await call(proxied("https://127.0.0.1/p.json"))).status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("accepts gist content and an explicit default port", async () => {
    // A fresh Response per call: a body stream can only be read once.
    const fetchMock = vi.fn().mockImplementation(async () => new Response(planJson, { status: 200 }));
    globalThis.fetch = fetchMock;
    expect((await call(proxied(`https://gist.githubusercontent.com/u/abc/raw/plan-${++counter}.json`))).status).toBe(200);
    expect((await call(proxied(`https://raw.githubusercontent.com:443/o/r/main/plan-${++counter}.json`))).status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://raw.githubusercontent.com/o/r/main/plan-${counter}.json`);
  });

  it("serves allowed files as JSON with sandboxing headers and caches them briefly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(planJson, { status: 200, headers: { "Content-Type": "text/html" } }));
    globalThis.fetch = fetchMock;
    const url = proxied(target());

    const first = await call(url, { origin: "http://localhost:5173", env: { ALLOW_DEV_ORIGINS: "true" } });
    expect(first.status).toBe(200);
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(first.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(first.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(first.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(await first.text()).toBe(planJson);

    const second = await call(url);
    expect(second.headers.get("X-Jantt-Cache")).toBe("HIT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves stale copies only for 429/503 within the stale window and passes 403 through", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const url = proxied(target());
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(planJson, { status: 200 }));
    await call(url);

    vi.setSystemTime(Date.now() + 5000);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }));
    const shielded = await call(url);
    expect(shielded.status).toBe(200);
    expect(shielded.headers.get("X-Jantt-Quota-Shield")).toBe("active");

    globalThis.fetch = vi.fn().mockResolvedValue(new Response("private now", { status: 403 }));
    expect((await call(url)).status).toBe(403);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }));
    expect((await call(url)).status).toBe(429); // the 403 evicted the cached copy

    const other = proxied(target());
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(planJson, { status: 200 }));
    await call(other);
    vi.setSystemTime(Date.now() + 120000);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }));
    expect((await call(other)).status).toBe(429); // too stale to serve
  });

  it("answers bodiless upstream statuses with 502 and drops copies marked no-store", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect((await call(proxied(target()))).status).toBe(502);

    vi.useFakeTimers({ toFake: ["Date"] });
    const url = proxied(target());
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(planJson, { status: 200 }));
    await call(url);
    vi.setSystemTime(Date.now() + 5000);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(planJson, { status: 200, headers: { "Cache-Control": "no-store" } }));
    expect((await call(url)).status).toBe(200);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }));
    expect((await call(url)).status).toBe(429); // no stale copy left to serve
  });

  it("rejects non-JSON bodies and redirects to hosts outside the allow-list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("<html><script>alert(1)</script></html>", { status: 200 }));
    expect((await call(proxied(target()))).status).toBe(502);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://evil.example/p.json" } }));
    expect((await call(proxied(target()))).status).toBe(502);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://uc123.dl.dropboxusercontent.com/p.json" } }))
      .mockResolvedValueOnce(new Response(planJson, { status: 200 }));
    globalThis.fetch = fetchMock;
    const followed = await call(proxied("https://www.dropbox.com/s/abc/p.json?dl=1"));
    expect(followed.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe("https://uc123.dl.dropboxusercontent.com/p.json");
  });
});
