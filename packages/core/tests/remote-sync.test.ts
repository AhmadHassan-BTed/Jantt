import { describe, it, expect, vi } from "vitest";
import { parseCloudUrl, fetchRemotePlan, isMatchingCloudUrl } from "../src/remote-sync";
import { JanttData } from "../src/types";

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
  });
});
