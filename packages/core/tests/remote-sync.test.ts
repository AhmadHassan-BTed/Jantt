import { describe, it, expect, vi } from "vitest";
import { parseCloudUrl, fetchRemotePlan } from "../src/remote-sync";
import { JanttData } from "../src/types";

describe("Cloud Remote Sync & URL Parsing", () => {
  describe("parseCloudUrl", () => {
    it("parses Google Drive standard share URLs (usp=sharing)", () => {
      const url = "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y/view?usp=sharing";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("google-drive");
      expect(info.fileId).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y");
      // New format uses /uc?export=download endpoint
      expect(info.downloadUrl).toContain("drive.google.com/uc?export=download");
      expect(info.downloadUrl).toContain("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y");
      expect(info.label).toBe("Google Drive");
    });

    it("parses Google Drive drive_link share URLs (usp=drive_link)", () => {
      const url = "https://drive.google.com/file/d/1I2xzinkooMvki_7Cm8tpK1i0hfr7nAmZ/view?usp=drive_link";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("google-drive");
      expect(info.fileId).toBe("1I2xzinkooMvki_7Cm8tpK1i0hfr7nAmZ");
      expect(info.downloadUrl).toContain("drive.google.com/uc?export=download");
      expect(info.downloadUrl).toContain("1I2xzinkooMvki_7Cm8tpK1i0hfr7nAmZ");
    });

    it("parses Google Drive multi-account URLs (/file/u/0/d/ and /file/u/1/d/)", () => {
      const url0 = "https://drive.google.com/file/u/0/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y/view";
      const info0 = parseCloudUrl(url0);
      expect(info0.provider).toBe("google-drive");
      expect(info0.fileId).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y");
      expect(info0.downloadUrl).toContain("id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y");

      const url1 = "https://drive.google.com/file/u/1/d/1I2xzinkooMvki_7Cm8tpK1i0hfr7nAmZ/view";
      const info1 = parseCloudUrl(url1);
      expect(info1.provider).toBe("google-drive");
      expect(info1.fileId).toBe("1I2xzinkooMvki_7Cm8tpK1i0hfr7nAmZ");
    });

    it("rejects Google Drive folder URLs with actionable explanation", () => {
      const folderUrl = "https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs";
      expect(() => parseCloudUrl(folderUrl)).toThrowError(/Google Drive folder/i);
    });

    it("parses Google Drive open?id= URLs", () => {
      const url = "https://drive.google.com/open?id=abc123XYZ_456";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("google-drive");
      expect(info.fileId).toBe("abc123XYZ_456");
      expect(info.downloadUrl).toContain("id=abc123XYZ_456");
    });

    it("parses GitHub blob URLs and transforms to raw.githubusercontent.com", () => {
      const url = "https://github.com/AhmadHassan-BTed/Jantt/blob/main/examples/master-template.json";
      const info = parseCloudUrl(url);
      expect(info.provider).toBe("github");
      expect(info.downloadUrl).toBe("https://raw.githubusercontent.com/AhmadHassan-BTed/Jantt/main/examples/master-template.json");
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

    it("fetches a Google Drive plan via CORS proxy", async () => {
      // Google Drive always routes through the proxy; mock should be called with proxy URL
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(validPlan)
      });
      global.fetch = mockFetch;

      const result = await fetchRemotePlan("https://drive.google.com/file/d/1I2xzinkooMvki_7Cm8tpK1i0hfr7nAmZ/view?usp=drive_link");
      expect(result.info.provider).toBe("google-drive");
      expect(result.info.fileId).toBe("1I2xzinkooMvki_7Cm8tpK1i0hfr7nAmZ");
      // Ensure fetch was called with our Cloudflare Worker proxy URL
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("jantt-cors-proxy");
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

    it("handles HTML response (private Drive link) gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<!DOCTYPE html><html><body>Login required</body></html>"
      });
      global.fetch = mockFetch;

      await expect(fetchRemotePlan("https://drive.google.com/file/d/12345/view")).rejects.toThrow("HTML page instead of JSON");
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
});
