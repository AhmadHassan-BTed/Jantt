import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateSecureToken,
  generateRoomId,
  sanitizeRoomId,
  normalizeUsername,
  generateRoomSlug,
  getFirebaseUrl,
  createCloudRoom,
  fetchCloudRoom,
  saveCloudRoom,
  subscribeToCloudRoom,
  encodePlanForRtdb,
  decodePlanFromRtdb
} from "../src/firebase-sync";
import { calculatePlanHash } from "../src/reconciliation";
import type { JanttData } from "../src/types";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

function requestHeaders(call: unknown[]): Record<string, string> {
  return ((call[1] as RequestInit).headers || {}) as Record<string, string>;
}

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

    it("normalizes usernames to lowercase letters, digits, underscores and hyphens", () => {
      expect(normalizeUsername("@Ahmad_Hassan")).toBe("ahmad_hassan");
      expect(normalizeUsername("  @@lead.dev#123! ")).toBe("leaddev123");
      expect(normalizeUsername("Dev_Ops-2026")).toBe("dev_ops-2026");
      // GitHub logins differing only by a hyphen must not collide
      expect(normalizeUsername("foo-bar")).not.toBe(normalizeUsername("foobar"));
      expect(normalizeUsername("")).toBe("");
    });

    it("generates distinct room slugs that survive sanitizeRoomId unchanged", () => {
      const slug1 = generateRoomSlug();
      const slug2 = generateRoomSlug();
      expect(slug1).not.toBe(slug2);
      expect(slug1.startsWith("room-")).toBe(true);
      expect(sanitizeRoomId(slug1)).toBe(slug1);

      const customSlug = generateRoomSlug("project");
      expect(customSlug.startsWith("project-")).toBe(true);

      const teamRoom = generateRoomId("My Team");
      // 128 random bits: link-readable rooms are protected only by their id
      expect(teamRoom).toMatch(/^my-team-[0-9a-f]{32}$/);
      expect(sanitizeRoomId(teamRoom)).toBe(teamRoom);
    });

    it("normalizes Firebase database URLs without trailing slash", () => {
      expect(getFirebaseUrl("https://my-db.firebaseio.com/")).toBe("https://my-db.firebaseio.com");
      expect(getFirebaseUrl("https://my-db.firebaseio.com")).toBe("https://my-db.firebaseio.com");
      expect(getFirebaseUrl()).toBe("https://jantt-cloud-default-rtdb.firebaseio.com");
    });

    it("ignores window.__JANTT_FIREBASE_URL unless the caller opts in", () => {
      (window as any).__JANTT_FIREBASE_URL = "https://attacker.example/";
      try {
        expect(getFirebaseUrl()).toBe("https://jantt-cloud-default-rtdb.firebaseio.com");
        expect(getFirebaseUrl(undefined, { allowGlobalOverrides: true })).toBe("https://attacker.example");
        expect(getFirebaseUrl("https://mine.firebaseio.com", { allowGlobalOverrides: true })).toBe(
          "https://mine.firebaseio.com"
        );
      } finally {
        delete (window as any).__JANTT_FIREBASE_URL;
      }
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

  describe("REST protocol details", () => {
    const originalFetch = globalThis.fetch;
    const planWithSchema: JanttData = { ...samplePlan, $schema: "https://jantt.dev/schema/v1.json" };

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("creates rooms with a create-only conditional PUT, encoded keys and no stored secret", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}, { ETag: '"e1"' }));
      globalThis.fetch = fetchMock;

      const result = await createCloudRoom(planWithSchema, { roomId: "Team_Room", authToken: "id-token" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);

      expect(result.roomId).toBe("team-room");
      expect(url).toContain("/plans/team-room.json?auth=id-token");
      expect(requestHeaders(fetchMock.mock.calls[0])).toMatchObject({ "X-Firebase-ETag": "true", "if-match": "null_etag" });
      expect(body.secret).toBeUndefined();
      expect(body.data.$schema).toBeUndefined();
      expect(body.data.__schema).toBe("https://jantt.dev/schema/v1.json");
      expect(result.createdAt).toBe(body.createdAt);
    });

    it("refuses to overwrite a taken custom room id and retries generated ids", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(412, "Precondition Failed"));
      await expect(createCloudRoom(samplePlan, { roomId: "taken" })).rejects.toThrow(/already taken/);

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(412, "Precondition Failed"))
        .mockResolvedValueOnce(jsonResponse(200, {}, { ETag: '"e2"' }));
      globalThis.fetch = fetchMock;
      const created = await createCloudRoom(samplePlan);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(created.etag).toBe('"e2"');
    });

    it("decodes fetched rooms, recomputes the hash and does not invent createdAt", async () => {
      const stored = { roomId: "r1", title: "Room", revision: 2, contentHash: "legacy", data: encodePlanForRtdb(planWithSchema) };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, stored, { ETag: '"e3"' }));
      globalThis.fetch = fetchMock;

      const room = await fetchCloudRoom("r1");
      expect(requestHeaders(fetchMock.mock.calls[0])["X-Firebase-ETag"]).toBe("true");
      expect(room.data.$schema).toBe("https://jantt.dev/schema/v1.json");
      expect(room.contentHash).toBe(calculatePlanHash(planWithSchema));
      expect(room.createdAt).toBeUndefined();
      expect(room.etag).toBe('"e3"');
    });

    it("never writes without an ETag: reports a conflict or a no-op instead", async () => {
      const remotePlan: JanttData = { ...samplePlan, tasks: [...samplePlan.tasks, { id: "t9", label: "Remote", start: "2026-09-02", end: "2026-09-03", category: "dev" }] };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { revision: 7, data: remotePlan }, { ETag: '"e7"' }));
      globalThis.fetch = fetchMock;

      const conflict = await saveCloudRoom({ roomId: "r1", secretKey: "sec_x", data: samplePlan });
      expect(conflict).toMatchObject({ success: false, conflict: true, revision: 7, etag: '"e7"' });
      expect(conflict.latestRemoteData?.tasks).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("GET");

      const unchanged = await saveCloudRoom({ roomId: "r1", secretKey: "sec_x", data: remotePlan });
      expect(unchanged).toMatchObject({ success: true, revision: 7, etag: '"e7"' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("saves conditionally on the ETag and keeps createdAt", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}, { ETag: '"e5"' }));
      globalThis.fetch = fetchMock;

      const result = await saveCloudRoom({
        roomId: "r1",
        secretKey: "sec_x",
        data: planWithSchema,
        etag: '"e4"',
        baseRevision: 4,
        createdAt: "2026-01-01T00:00:00.000Z"
      });
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);

      expect(result).toMatchObject({ success: true, revision: 5, etag: '"e5"' });
      expect(init.method).toBe("PUT");
      expect(requestHeaders(fetchMock.mock.calls[0])).toMatchObject({ "if-match": '"e4"', "X-Firebase-ETag": "true" });
      expect(body.createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(body.secret).toBeUndefined();
      expect(body.data.__schema).toBe("https://jantt.dev/schema/v1.json");
    });

    it("times out a stalled save instead of hanging forever", async () => {
      globalThis.fetch = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          })
      ) as unknown as typeof fetch;

      const result = await saveCloudRoom({ roomId: "r1", secretKey: "sec_x", data: samplePlan, etag: '"e1"', timeoutMs: 50 });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/timed out/);
    });
  });

  describe("RTDB plan decoding", () => {
    it("restores collections the database drops or turns into index-keyed objects", () => {
      const stored = { meta: { title: "Emptied" }, notes: { "0": { id: "n1", title: "A", content: "" }, "2": { id: "n2", title: "B", content: "" } } };
      const decoded = decodePlanFromRtdb(stored as unknown as JanttData);
      expect(decoded.tasks).toEqual([]);
      expect(decoded.notes?.map((n) => n.id)).toEqual(["n1", "n2"]);

      // Removing one element leaves a null (REST) or a hole (SDK) in an array-shaped collection.
      const withHoles: any[] = [{ id: "t1" }, null, { id: "t3" }];
      withHoles[5] = { id: "t5" };
      const compacted = decodePlanFromRtdb({ meta: { title: "P" }, tasks: withHoles } as unknown as JanttData);
      expect(compacted.tasks.map((t) => t.id)).toEqual(["t1", "t3", "t5"]);
    });

    it("round-trips a literal '__schema' key and drops '__proto__' keys", () => {
      const plan = JSON.parse('{"meta":{"title":"P","__schema":"mine"},"tasks":[],"__proto__":{"polluted":true}}');
      const decoded: any = decodePlanFromRtdb(encodePlanForRtdb(plan));
      expect(decoded.meta.__schema).toBe("mine");
      expect(decoded.meta.$schema).toBeUndefined();
      expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
      expect(decoded.polluted).toBeUndefined();
    });
  });

  describe("subscribeToCloudRoom", () => {
    class FakeEventSource {
      static last: FakeEventSource | null = null;
      listeners = new Map<string, (event: { data?: string }) => void>();
      onerror: ((err: unknown) => void) | null = null;
      closed = false;
      constructor(public url: string) {
        FakeEventSource.last = this;
      }
      addEventListener(type: string, listener: (event: { data?: string }) => void) {
        this.listeners.set(type, listener);
      }
      close() {
        this.closed = true;
      }
      emit(type: string, data?: unknown) {
        this.listeners.get(type)?.({ data: data === undefined ? undefined : JSON.stringify(data) });
      }
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("applies put/patch events at their path and emits the full decoded room", () => {
      vi.stubGlobal("EventSource", FakeEventSource);
      const updates: any[] = [];
      const errors: unknown[] = [];
      const unsubscribe = subscribeToCloudRoom("r1", (room) => updates.push(room), (err) => errors.push(err));
      const source = FakeEventSource.last!;

      source.emit("put", {
        path: "/",
        data: { roomId: "r1", title: "Room", revision: 1, secret: "sec_legacy", data: encodePlanForRtdb({ ...samplePlan, $schema: "s" }) }
      });
      source.emit("put", { path: "/data/tasks/0/label", data: "Renamed" });
      source.emit("patch", { path: "/", data: { revision: 2, title: "Room v2" } });

      expect(updates).toHaveLength(3);
      expect(updates[0].data.$schema).toBe("s");
      expect(updates[0].secret).toBeUndefined(); // a legacy plaintext secret never reaches readers
      expect(updates[1].data.tasks[0].label).toBe("Renamed");
      expect(updates[2]).toMatchObject({ revision: 2, title: "Room v2" });
      expect(updates[2].data.tasks[0].label).toBe("Renamed");

      source.emit("cancel");
      expect(errors).toHaveLength(1);
      expect(source.closed).toBe(true);
      unsubscribe();
    });
  });
});
