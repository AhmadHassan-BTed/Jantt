import { beforeEach, describe, expect, it } from "vitest";
import { clearAuthCaches } from "../src/auth";
import { createCloudApiHandler } from "../src/index";
import type { RtdbClient, RtdbEtagResult, RtdbPutResult } from "../src/rtdb";
import { HttpError, type Env, type ExecutionContextLike } from "../src/types";

type JsonRecord = Record<string, unknown>;

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

class MockRtdbClient implements RtdbClient {
  private root: JsonRecord = {};
  private etagCounter = 1;
  private pathEtags = new Map<string, string>();
  public forceNextPut412Path: string | null = null;

  seed(path: string, value: unknown): void {
    this.writeAt(path, value);
  }

  rawGet(path: string): unknown {
    return this.readAt(path);
  }

  private readAt(path: string): unknown {
    const segments = splitPath(path);
    let current: unknown = this.root;
    for (const seg of segments) {
      if (!current || typeof current !== "object" || !(seg in (current as JsonRecord))) {
        return null;
      }
      current = (current as JsonRecord)[seg];
    }
    return current === undefined ? null : clone(current);
  }

  private writeAt(path: string, value: unknown): void {
    const segments = splitPath(path);
    if (segments.length === 0) {
      this.root = (value && typeof value === "object" ? clone(value) : {}) as JsonRecord;
      return;
    }
    let current: JsonRecord = this.root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!current[seg] || typeof current[seg] !== "object") {
        current[seg] = {};
      }
      current = current[seg] as JsonRecord;
    }
    const leaf = segments[segments.length - 1];
    if (value === null || value === undefined) {
      delete current[leaf];
    } else {
      current[leaf] = clone(value);
    }
    this.bumpEtag(path);
  }

  private bumpEtag(path: string): string {
    const tag = `etag-${++this.etagCounter}`;
    this.pathEtags.set(splitPath(path).join("/"), tag);
    return tag;
  }

  private currentEtag(path: string): string {
    const key = splitPath(path).join("/");
    let tag = this.pathEtags.get(key);
    if (!tag) {
      tag = `etag-${++this.etagCounter}`;
      this.pathEtags.set(key, tag);
    }
    return tag;
  }

  async get<T>(path: string): Promise<T | null> {
    return (this.readAt(path) as T | null) ?? null;
  }

  async getWithEtag<T>(path: string): Promise<RtdbEtagResult<T>> {
    return {
      value: (this.readAt(path) as T | null) ?? null,
      etag: this.currentEtag(path)
    };
  }

  async put<T>(path: string, value: T, ifMatchEtag?: string | null): Promise<RtdbPutResult> {
    const normalized = splitPath(path).join("/");
    if (this.forceNextPut412Path === normalized) {
      this.forceNextPut412Path = null;
      this.bumpEtag(path);
      return { ok: false, status: 412, etag: this.currentEtag(path) };
    }
    if (ifMatchEtag && ifMatchEtag !== this.currentEtag(path)) {
      return { ok: false, status: 412, etag: this.currentEtag(path) };
    }
    this.writeAt(path, value);
    return { ok: true, status: 200, etag: this.currentEtag(path) };
  }

  async patch(path: string, updates: Record<string, unknown>): Promise<void> {
    const base = splitPath(path).join("/");
    for (const [subPath, value] of Object.entries(updates)) {
      const fullPath = base ? `${base}/${subPath}` : subPath;
      this.writeAt(fullPath, value);
    }
  }

  async delete(path: string): Promise<void> {
    this.writeAt(path, null);
  }
}

const ADMIN_UID = "uid-admin";
const BOB_UID = "uid-bob";
const CAROL_UID = "uid-carol";
const NOW_MS = Date.parse("2026-11-28T10:00:00.000Z");

describe("Jantt Cloud API Worker", () => {
  let rtdb: MockRtdbClient;
  let env: Env;
  let handler: ReturnType<typeof createCloudApiHandler>;
  let backgroundTasks: Promise<unknown>[];
  let ctx: ExecutionContextLike;

  beforeEach(() => {
    clearAuthCaches();
    rtdb = new MockRtdbClient();
    backgroundTasks = [];
    ctx = {
      waitUntil(promise) {
        backgroundTasks.push(promise);
      }
    };
    env = {
      FIREBASE_PROJECT_ID: "jantt-cloud",
      FIREBASE_DATABASE_URL: "https://jantt-cloud-default-rtdb.firebaseio.com",
      ADMIN_UIDS: ADMIN_UID,
      ALLOWED_ORIGINS: "https://ahmadhassan-bted.github.io",
      ALLOW_DEV_ORIGINS: "false",
      MAX_KEYS_PER_USER: "5"
    };

    // Seed user profiles
    rtdb.seed(`users/${ADMIN_UID}`, {
      uid: ADMIN_UID,
      username: "ahmad",
      displayUsername: "Ahmad",
      displayName: "Ahmad Hassan",
      photoURL: "https://avatars.githubusercontent.com/u/1?v=4"
    });
    rtdb.seed(`public_profiles/${ADMIN_UID}`, {
      uid: ADMIN_UID,
      username: "ahmad",
      displayUsername: "Ahmad",
      displayName: "Ahmad Hassan",
      photoURL: "https://avatars.githubusercontent.com/u/1?v=4"
    });
    rtdb.seed(`users/${BOB_UID}`, {
      uid: BOB_UID,
      username: "bob",
      displayUsername: "Bob",
      displayName: "Bob Builder"
    });
    rtdb.seed(`public_profiles/${BOB_UID}`, {
      uid: BOB_UID,
      username: "bob",
      displayUsername: "Bob",
      displayName: "Bob Builder"
    });
    rtdb.seed(`users/${CAROL_UID}`, {
      uid: CAROL_UID,
      username: "carol",
      displayUsername: "Carol",
      displayName: "Carol Viewer"
    });
    rtdb.seed(`public_profiles/${CAROL_UID}`, {
      uid: CAROL_UID,
      username: "carol",
      displayUsername: "Carol",
      displayName: "Carol Viewer"
    });

    handler = createCloudApiHandler({
      createRtdb: () => rtdb,
      nowMs: () => NOW_MS,
      verifyIdToken: async (token) => {
        if (token === "fb-admin") return { uid: ADMIN_UID, provider: "github.com" };
        if (token === "fb-bob") return { uid: BOB_UID, provider: "github.com" };
        if (token === "fb-carol") return { uid: CAROL_UID, provider: "github.com" };
        throw new HttpError(401, "INVALID_ID_TOKEN", "Invalid mock Firebase token.");
      }
    });
  });

  async function call(
    method: string,
    path: string,
    options: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
  ) {
    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const req = new Request(`https://jantt-cloud-api.example.workers.dev${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    const res = await handler(req, env, ctx);
    await Promise.all(backgroundTasks.splice(0));
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  it("serves health and OpenAPI spec publicly", async () => {
    const health = await call("GET", "/health");
    expect(health.status).toBe(200);
    expect(health.json.service).toBe("jantt-cloud-api");

    const spec = await call("GET", "/v1/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.json.openapi).toBe("3.1.0");
    expect(spec.json.paths["/v1/plans"]).toBeDefined();
    expect(spec.json.paths["/v1/mcp"]).toBeDefined();
  });

  it("blocks disallowed browser origins on UI routes", async () => {
    const blocked = await call("GET", "/v1/account/access", {
      token: "fb-admin",
      headers: { Origin: "https://evil.example.com" }
    });
    expect(blocked.status).toBe(403);

    const allowed = await call("GET", "/v1/account/access", {
      token: "fb-admin",
      headers: { Origin: "https://ahmadhassan-bted.github.io" }
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://ahmadhassan-bted.github.io");
  });

  it("gives config admin free unlimited access and enforces admin-granted entitlements for other users", async () => {
    // Admin is auto-enabled without any RTDB entitlement row
    const adminAccess = await call("GET", "/v1/account/access", { token: "fb-admin" });
    expect(adminAccess.status).toBe(200);
    expect(adminAccess.json.enabled).toBe(true);
    expect(adminAccess.json.isAdmin).toBe(true);
    expect(adminAccess.json.tier).toBe("admin");

    // Bob starts locked out and cannot create keys or access admin routes
    const bobAccessBefore = await call("GET", "/v1/account/access", { token: "fb-bob" });
    expect(bobAccessBefore.status).toBe(200);
    expect(bobAccessBefore.json.enabled).toBe(false);
    expect(bobAccessBefore.json.isAdmin).toBe(false);

    const bobKeyDenied = await call("POST", "/v1/keys", { token: "fb-bob", body: { label: "Cursor" } });
    expect(bobKeyDenied.status).toBe(403);
    expect(bobKeyDenied.json.error.code).toBe("API_ACCESS_NOT_GRANTED");

    const bobAdminDenied = await call("GET", "/v1/admin/entitlements", { token: "fb-bob" });
    expect(bobAdminDenied.status).toBe(403);
    expect(bobAdminDenied.json.error.code).toBe("ADMIN_REQUIRED");

    // Admin searches Bob and grants access
    const search = await call("GET", "/v1/admin/users?q=bob", { token: "fb-admin" });
    expect(search.status).toBe(200);
    expect(search.json.users).toHaveLength(1);
    expect(search.json.users[0].uid).toBe(BOB_UID);

    const grant = await call("PUT", `/v1/admin/entitlements/${BOB_UID}`, {
      token: "fb-admin",
      body: { enabled: true, tier: "granted", note: "Beta user" }
    });
    expect(grant.status).toBe(200);
    expect(grant.json.entitlement.enabled).toBe(true);

    // Bob generates an API key; raw key is NEVER stored in RTDB
    const createdKey = await call("POST", "/v1/keys", { token: "fb-bob", body: { label: "Claude Desktop" } });
    expect(createdKey.status).toBe(201);
    expect(createdKey.json.apiKey).toMatch(/^jnt_live_/);
    const rawKey: string = createdKey.json.apiKey;
    expect(JSON.stringify(rtdb.rawGet(""))).not.toContain(rawKey);

    // Bob's key works on /v1/plans
    const plansRes = await call("GET", "/v1/plans", { token: rawKey });
    expect(plansRes.status).toBe(200);
    expect(plansRes.json.plans).toEqual([]);

    // Admin revokes Bob's entitlement + keys -> key immediately stops working
    const revoke = await call("DELETE", `/v1/admin/entitlements/${BOB_UID}?revokeKeys=true`, { token: "fb-admin" });
    expect(revoke.status).toBe(200);
    expect(revoke.json.revokedKeysCount).toBe(1);

    const afterRevoke = await call("GET", "/v1/plans", { token: rawKey });
    expect(afterRevoke.status).toBe(401);
  });

  it("runs full account-scoped REST plan & task lifecycle with cascades, tombstones, roles, and CAS retry", async () => {
    // Admin creates own API key
    const adminKeyRes = await call("POST", "/v1/keys", { token: "fb-admin", body: { label: "Admin CLI" } });
    const adminKey: string = adminKeyRes.json.apiKey;

    // Grant Carol and create her key too (she will be a viewer / non-member)
    await call("PUT", `/v1/admin/entitlements/${CAROL_UID}`, {
      token: "fb-admin",
      body: { enabled: true, tier: "granted" }
    });
    const carolKeyRes = await call("POST", "/v1/keys", { token: "fb-carol", body: { label: "Carol Agent" } });
    const carolKey: string = carolKeyRes.json.apiKey;

    // 1. Admin creates a cloud plan via API
    const createRes = await call("POST", "/v1/plans", {
      token: adminKey,
      body: {
        title: "Q4 Launch",
        plan: {
          meta: { title: "Q4 Launch", defaultGapDays: 0 },
          categories: {
            eng: { label: "Engineering", color: "#38BDF8" },
            ops: { label: "Ops", color: "#22C55E" }
          },
          tasks: [
            { id: "t1", label: "Design API", category: "eng", start: "2026-12-01", end: "2026-12-05", assignee: "@ahmad" }
          ]
        }
      }
    });
    expect(createRes.status).toBe(201);
    const roomId: string = createRes.json.roomId;
    expect(roomId).toBeTruthy();

    // Carol cannot read a room she isn't a member of
    const carolOutsider = await call("GET", `/v1/plans/${roomId}`, { token: carolKey });
    expect(carolOutsider.status).toBe(403);

    // Share room with Carol as viewer
    rtdb.seed(`rooms/${roomId}/members/${CAROL_UID}`, {
      uid: CAROL_UID,
      username: "carol",
      displayName: "Carol Viewer",
      role: "viewer",
      joinedAt: new Date(NOW_MS).toISOString()
    });
    rtdb.seed(`user_rooms/${CAROL_UID}/shared/${roomId}`, {
      roomId,
      title: "Q4 Launch",
      ownerUid: ADMIN_UID,
      ownerUsername: "ahmad",
      role: "viewer",
      createdAt: new Date(NOW_MS).toISOString(),
      updatedAt: new Date(NOW_MS).toISOString()
    });

    // Carol can list and read, but cannot add/edit/delete
    const carolList = await call("GET", "/v1/plans", { token: carolKey });
    expect(carolList.status).toBe(200);
    expect(carolList.json.plans).toHaveLength(1);
    expect(carolList.json.plans[0].role).toBe("viewer");
    expect(carolList.json.plans[0].canEdit).toBe(false);

    const carolWriteDenied = await call("POST", `/v1/plans/${roomId}/tasks`, {
      token: carolKey,
      body: { id: "t2", label: "Hack", category: "eng", start: "2026-12-06", end: "2026-12-08" }
    });
    expect(carolWriteDenied.status).toBe(403);
    expect(carolWriteDenied.json.error.code).toBe("READ_ONLY");

    // 2. Admin adds dependent task (dates overlap predecessor -> dependency cascade pushes it!)
    // Also simulate one 412 ETag conflict to verify CAS retry succeeds transparently!
    rtdb.forceNextPut412Path = `rooms/${roomId}/data`;
    const addTaskRes = await call("POST", `/v1/plans/${roomId}/tasks`, {
      token: adminKey,
      body: {
        id: "t2",
        label: "Build Worker",
        category: "eng",
        start: "2026-12-02",
        end: "2026-12-04",
        dependsOn: "t1",
        assignee: "@ahmad"
      }
    });
    expect(addTaskRes.status).toBe(201);
    expect(addTaskRes.json.revision).toBe(2);
    expect(addTaskRes.json.adjustedByDependencies).toBe(true);
    expect(addTaskRes.json.task.start).toBe("2026-12-05");

    // 3. Admin reschedules t1 later -> t2 cascades automatically
    const patchTaskRes = await call("PATCH", `/v1/plans/${roomId}/tasks/t1`, {
      token: adminKey,
      body: { start: "2026-12-05", end: "2026-12-10", progress: 0.5 }
    });
    expect(patchTaskRes.status).toBe(200);
    expect(patchTaskRes.json.movedTaskIds).toContain("t2");
    expect(patchTaskRes.json.task.progress).toBe(0.5);

    // 4. Inspect, audit, and export CSV
    const inspectRes = await call("GET", `/v1/plans/${roomId}/inspect`, { token: adminKey });
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.json.summary.totalTasks).toBe(2);
    expect(inspectRes.json.summary.criticalTaskIds).toEqual(expect.arrayContaining(["t1", "t2"]));

    const auditRes = await call("GET", `/v1/plans/${roomId}/audit`, { token: adminKey });
    expect(auditRes.status).toBe(200);
    expect(typeof auditRes.json.integrityScore).toBe("number");

    const csvRes = await call("GET", `/v1/plans/${roomId}/export.csv`, { token: adminKey });
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain("Design API");
    expect(csvRes.text).toContain("Build Worker");

    // 5. Delete t1 -> soft-delete tombstone saved in RTDB, hidden from live tasks, t2's dependsOn cleaned!
    const deleteTaskRes = await call("DELETE", `/v1/plans/${roomId}/tasks/t1`, { token: adminKey });
    expect(deleteTaskRes.status).toBe(200);
    expect(deleteTaskRes.json.deletedTaskId).toBe("t1");

    const liveTasksRes = await call("GET", `/v1/plans/${roomId}/tasks`, { token: adminKey });
    expect(liveTasksRes.status).toBe(200);
    expect(liveTasksRes.json.tasks).toHaveLength(1);
    expect(liveTasksRes.json.tasks[0].id).toBe("t2");
    expect(liveTasksRes.json.tasks[0].dependsOn).toBeUndefined();

    // Tombstone is preserved when reading with includeDeleted=true
    const withTombstones = await call("GET", `/v1/plans/${roomId}?includeDeleted=true`, { token: adminKey });
    expect(withTombstones.json.plan.tasks.some((t: any) => t.id === "t1" && t._deleted === true)).toBe(true);

    // 6. Delete room cascades removal of Carol's shared pointer too
    const deleteRoomRes = await call("DELETE", `/v1/plans/${roomId}`, { token: adminKey });
    expect(deleteRoomRes.status).toBe(200);
    expect(rtdb.rawGet(`rooms/${roomId}`)).toBeNull();
    expect(rtdb.rawGet(`user_rooms/${CAROL_UID}/shared/${roomId}`)).toBeNull();
  });

  it("handles Streamable HTTP MCP JSON-RPC 2.0 end-to-end across cloud plan tools", async () => {
    const keyRes = await call("POST", "/v1/keys", { token: "fb-admin", body: { label: "MCP Agent" } });
    const apiKey: string = keyRes.json.apiKey;

    const init = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }
    });
    expect(init.status).toBe(200);
    expect(init.json.result.serverInfo.name).toBe("jantt-cloud-mcp");
    expect(init.json.result.protocolVersion).toBe("2025-06-18");

    // Notification returns 202 with empty body
    const notif = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: { jsonrpc: "2.0", method: "notifications/initialized" }
    });
    expect(notif.status).toBe(202);

    // tools/list returns all 11 cloud tools
    const listTools = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: { jsonrpc: "2.0", id: 2, method: "tools/list" }
    });
    expect(listTools.status).toBe(200);
    expect(listTools.json.result.tools).toHaveLength(11);

    // Create a cloud plan via MCP
    const create = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "jantt_cloud_create_plan",
          arguments: { title: "AI Roadmap" }
        }
      }
    });
    expect(create.status).toBe(200);
    expect(create.json.result.isError).toBeUndefined();
    const created = JSON.parse(create.json.result.content[0].text);
    const roomId: string = created.roomId;

    // Add a task via MCP
    const addTask = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "jantt_cloud_add_task",
          arguments: {
            roomId,
            task: { id: "ai-1", label: "Ship MCP", category: "general", start: "2026-12-01", end: "2026-12-03" }
          }
        }
      }
    });
    expect(addTask.status).toBe(200);
    expect(addTask.json.result.isError).toBeUndefined();

    // Update task via MCP
    const updTask = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "jantt_cloud_update_task",
          arguments: { roomId, taskId: "ai-1", patch: { progress: 1, status: "done" } }
        }
      }
    });
    expect(updTask.status).toBe(200);
    expect(JSON.parse(updTask.json.result.content[0].text).task.progress).toBe(1);

    // List plans via MCP shows the new plan
    const listPlans = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "jantt_cloud_list_plans", arguments: {} }
      }
    });
    const plansPayload = JSON.parse(listPlans.json.result.content[0].text);
    expect(plansPayload.plans).toHaveLength(1);
    expect(plansPayload.plans[0].roomId).toBe(roomId);
    expect(plansPayload.plans[0].taskCount).toBe(1);

    // Invalid tool call surfaces as isError: true for model self-correction
    const badCall = await call("POST", "/v1/mcp", {
      token: apiKey,
      body: {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "jantt_cloud_delete_task", arguments: { roomId, taskId: "nonexistent" } }
      }
    });
    expect(badCall.status).toBe(200);
    expect(badCall.json.result.isError).toBe(true);
    expect(badCall.json.result.content[0].text).toContain("nonexistent");
  });
});
