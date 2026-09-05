import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSecureToken,
  generateRoomId,
  sanitizeRoomId,
  getFirebaseUrl,
  createCloudRoom,
  fetchCloudRoom,
  saveCloudRoom
} from "../src/firebase-sync";
import type { JanttData } from "../src/types";

describe("firebase-sync", () => {
  const samplePlan: JanttData = {
    meta: { title: "Firebase Collab Test" },
    categories: {
      dev: { label: "Development", color: "#38BDF8" }
    },
    tasks: [
      {
        id: "t1",
        label: "Initial Task",
        start: "2026-09-01",
        end: "2026-09-05",
        progress: 0.2,
        category: "dev"
      }
    ]
  };

  describe("utility functions", () => {
    it("generates distinct secure tokens with default and custom prefix", () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      expect(token1).not.toBe(token2);
      expect(token1.startsWith("sec_")).toBe(true);

      const customToken = generateSecureToken("key");
      expect(customToken.startsWith("key_")).toBe(true);
    });

    it("generates and sanitizes room IDs", () => {
      const roomId = generateRoomId();
      expect(roomId.startsWith("room-")).toBe(true);

      expect(sanitizeRoomId("  My Room #123! ")).toBe("my-room-123");
      expect(sanitizeRoomId("TEAM_Alpha__Sprint")).toBe("team-alpha-sprint");
      expect(sanitizeRoomId("---room---")).toBe("room");
    });

    it("normalizes Firebase database URLs without trailing slash", () => {
      expect(getFirebaseUrl("https://my-db.firebaseio.com/")).toBe("https://my-db.firebaseio.com");
      expect(getFirebaseUrl("https://my-db.firebaseio.com")).toBe("https://my-db.firebaseio.com");
      expect(getFirebaseUrl()).toBe("https://jantt-cloud-default-rtdb.firebaseio.com");
    });
  });

  describe("REST client operations with mocked fetch", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("creates a cloud room and returns room metadata with secret key", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: '"etag-123"' }),
        json: async () => ({})
      } as Response);

      const result = await createCloudRoom(samplePlan, {
        roomId: "test-room-1",
        title: "Test Room Title"
      });

      expect(result.roomId).toBe("test-room-1");
      expect(result.title).toBe("Test Room Title");
      expect(result.secretKey.startsWith("sec_")).toBe(true);
      expect(result.revision).toBe(1);
      expect(result.etag).toBe('"etag-123"');
    });

    it("fetches an existing room and validates content", async () => {
      const mockPayload = {
        roomId: "test-room-1",
        title: "Test Room Title",
        secret: "sec_abc",
        revision: 3,
        contentHash: "hash-xyz",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-02T00:00:00Z",
        data: samplePlan
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: '"etag-rev-3"' }),
        json: async () => mockPayload
      } as Response);

      const room = await fetchCloudRoom("test-room-1");
      expect(room.roomId).toBe("test-room-1");
      expect(room.revision).toBe(3);
      expect(room.data.tasks.length).toBe(1);
      expect(room.etag).toBe('"etag-rev-3"');
    });

    it("handles ETag concurrency conflicts (HTTP 412) on save", async () => {
      const updatedPlan: JanttData = {
        ...samplePlan,
        tasks: [
          ...samplePlan.tasks,
          { id: "t2", label: "Concurrent Task", start: "2026-09-06", end: "2026-09-10", category: "dev" }
        ]
      };

      // Mock save returning 412 (conflict), then mock the subsequent fetchCloudRoom call returning latest
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Save call with mismatched etag
          return {
            ok: false,
            status: 412,
            headers: new Headers(),
            text: async () => "Precondition Failed"
          } as Response;
        }
        // Subsequent fetch call
        return {
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"etag-latest"' }),
          json: async () => ({
            roomId: "test-room-1",
            title: "Latest Room",
            revision: 5,
            contentHash: "hash-remote",
            data: samplePlan
          })
        } as Response;
      });

      const saveResult = await saveCloudRoom({
        roomId: "test-room-1",
        secretKey: "sec_test",
        data: updatedPlan,
        etag: '"old-etag"',
        baseRevision: 4
      });

      expect(saveResult.success).toBe(false);
      expect(saveResult.conflict).toBe(true);
      expect(saveResult.latestRemoteData).toBeDefined();
    });

    it("rejects saving if secret key is missing or unauthorized", async () => {
      const resultNoKey = await saveCloudRoom({
        roomId: "test-room-1",
        secretKey: "",
        data: samplePlan
      });
      expect(resultNoKey.success).toBe(false);
      expect(resultNoKey.error).toContain("Missing edit key");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => "Permission denied"
      } as Response);

      const resultUnauthorized = await saveCloudRoom({
        roomId: "test-room-1",
        secretKey: "wrong-key",
        data: samplePlan
      });
      expect(resultUnauthorized.success).toBe(false);
      expect(resultUnauthorized.error).toContain("Permission denied");
    });
  });
});
