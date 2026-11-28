import {
  assertAdmin,
  authenticateApiKey,
  authenticateFirebaseUser,
  createUserApiKey,
  getAccountAccessPayload,
  listAdminEntitlements,
  listUserKeys,
  revokeAdminEntitlement,
  revokeUserApiKey,
  searchAdminUsers,
  setAdminEntitlement,
  type AuthDeps
} from "./auth";
import { getServiceAccountAccessToken } from "./crypto";
import {
  getAgentSystemPrompt,
  getHelpMarkdown,
  getHelpPayload,
  getJanttCheatsheet,
  getJanttSchema,
  getMasterTemplate,
  getStarterTemplate,
  type PromptMode
} from "./guides";
import { handleMcpPayload } from "./mcp";
import { buildOpenApiSpec } from "./openapi";
import {
  addPlanTask,
  auditAccountPlan,
  createAccountPlan,
  deleteAccountPlan,
  deletePlanTask,
  exportAccountPlanCsv,
  getAccountPlan,
  inspectAccountPlan,
  listAccountPlans,
  listPlanTasks,
  patchAccountPlan,
  replaceAccountPlan,
  updatePlanTask,
  validatePlanPayload
} from "./plans";
import { FirebaseRtdbClient, type RtdbClient } from "./rtdb";
import { HttpError, type Env, type ExecutionContextLike, type FetchLike } from "./types";

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const DEV_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const DEFAULT_ALLOWED_ORIGINS = ["https://ahmadhassan-bted.github.io"];

const BASE_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store"
};

function parseAllowedOrigins(env: Env): string[] {
  if (!env.ALLOWED_ORIGINS) return DEFAULT_ALLOWED_ORIGINS;
  return env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedUiOrigin(origin: string, env: Env): boolean {
  if (!origin) return true; // Non-browser clients (curl/tests)
  const lower = origin.toLowerCase();
  if (parseAllowedOrigins(env).includes(lower)) return true;
  return env.ALLOW_DEV_ORIGINS === "true" && DEV_ORIGIN_PATTERN.test(origin);
}

function buildCorsHeaders(request: Request, env: Env, isUiRoute: boolean): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
  const allowHeaders = "Authorization, Content-Type, X-API-Key, Mcp-Session-Id, MCP-Protocol-Version";

  if (isUiRoute) {
    const headers: Record<string, string> = { Vary: "Origin" };
    if (origin && isAllowedUiOrigin(origin, env)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Methods"] = allowMethods;
      headers["Access-Control-Allow-Headers"] = allowHeaders;
      headers["Access-Control-Max-Age"] = "86400";
    }
    return headers;
  }

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": allowMethods,
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...BASE_SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function markdownResponse(
  status: number,
  markdown: string,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(markdown, {
    status,
    headers: {
      ...corsHeaders,
      ...BASE_SECURITY_HEADERS,
      "Content-Type": "text/markdown; charset=utf-8",
      ...extraHeaders
    }
  });
}

function emptyResponse(status: number, corsHeaders: Record<string, string>): Response {
  return new Response(null, {
    status,
    headers: {
      ...corsHeaders,
      ...BASE_SECURITY_HEADERS
    }
  });
}

function wantsJsonFormat(request: Request, url: URL): boolean {
  const fmt = (url.searchParams.get("format") || "").trim().toLowerCase();
  if (fmt === "json") return true;
  if (fmt === "markdown" || fmt === "md" || fmt === "text") return false;
  const accept = (request.headers.get("Accept") || "").toLowerCase();
  return accept.includes("application/json") && !accept.includes("text/markdown");
}

function wantsMarkdownFormat(request: Request, url: URL): boolean {
  const fmt = (url.searchParams.get("format") || "").trim().toLowerCase();
  if (fmt === "markdown" || fmt === "md" || fmt === "text") return true;
  if (fmt === "json") return false;
  const accept = (request.headers.get("Accept") || "").toLowerCase();
  return accept.includes("text/markdown");
}

function parsePromptModeParam(raw: string | null): PromptMode {
  if (raw === "create" || raw === "modify") return raw;
  return "all";
}

/** Reads and parses a JSON body with a strict streaming byte cap (prevents memory exhaustion). */
async function readCappedJson(request: Request, maxBytes: number = MAX_REQUEST_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await request.body?.cancel?.();
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes / (1024 * 1024)} MB limit.`);
  }

  let text = "";
  if (!request.body || typeof request.body.getReader !== "function") {
    text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes / (1024 * 1024)} MB limit.`);
    }
  } else {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes / (1024 * 1024)} MB limit.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }

  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new HttpError(400, "INVALID_JSON", `Request body is not valid JSON: ${(err as Error).message}`);
  }
}

function asObjectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "INVALID_BODY", "Expected a JSON object request body.");
  }
  return body as Record<string, unknown>;
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new HttpError(400, "INVALID_PATH", "Malformed URL path encoding.");
  }
}

export interface HandlerDeps extends AuthDeps {
  createRtdb?: (env: Env) => RtdbClient;
  fetchFn?: FetchLike;
}

export function createCloudApiHandler(deps: HandlerDeps = {}) {
  const getRtdb = (env: Env): RtdbClient => {
    if (deps.createRtdb) return deps.createRtdb(env);
    const dbUrl = env.FIREBASE_DATABASE_URL || "https://jantt-cloud-default-rtdb.firebaseio.com";
    const fetchFn: FetchLike = deps.fetchFn ?? ((input, init) => fetch(input, init));
    return new FirebaseRtdbClient(
      dbUrl,
      () => getServiceAccountAccessToken(env, fetchFn, deps.nowMs?.() ?? Date.now()),
      fetchFn
    );
  };

  return async function handleRequest(
    request: Request,
    env: Env,
    ctx?: ExecutionContextLike
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const isUiRoute =
      pathname.startsWith("/v1/account") || pathname.startsWith("/v1/keys") || pathname.startsWith("/v1/admin");
    const cors = buildCorsHeaders(request, env, isUiRoute);
    const nowMs = deps.nowMs?.() ?? Date.now();

    if (request.method === "OPTIONS") {
      if (isUiRoute && !isAllowedUiOrigin(request.headers.get("Origin") || "", env)) {
        return jsonResponse(403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } }, cors);
      }
      return emptyResponse(204, cors);
    }

    if (isUiRoute) {
      const origin = request.headers.get("Origin") || "";
      if (origin && !isAllowedUiOrigin(origin, env)) {
        return jsonResponse(403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } }, cors);
      }
    }

    try {
      // Optional rate limit binding
      if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === "function") {
        const rateKey = request.headers.get("CF-Connecting-IP") || request.headers.get("Origin") || "global";
        const { success } = await env.RATE_LIMITER.limit({ key: rateKey });
        if (!success) {
          return jsonResponse(
            429,
            { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and retry." } },
            { ...cors, "Retry-After": "60" }
          );
        }
      }

      // ------------------------------------------------------------------
      // 0. Public Discovery, Guides, Schema, Templates & Dry-Run Validator
      // ------------------------------------------------------------------
      if (request.method === "GET" && (pathname === "/" || pathname === "/health")) {
        return jsonResponse(
          200,
          {
            service: "jantt-cloud-api",
            version: "1.2.0",
            status: "ok",
            endpoints: {
              help: `${url.origin}/v1/help`,
              cheatsheet: `${url.origin}/v1/cheatsheet`,
              prompt: `${url.origin}/v1/prompt`,
              schema: `${url.origin}/v1/schema`,
              template: `${url.origin}/v1/template`,
              validate: `${url.origin}/v1/validate`,
              openapi: `${url.origin}/v1/openapi.json`,
              plans: `${url.origin}/v1/plans`,
              mcp: `${url.origin}/v1/mcp`
            }
          },
          cors
        );
      }

      if (request.method === "GET" && pathname === "/v1/openapi.json") {
        return jsonResponse(200, buildOpenApiSpec(url.origin), cors);
      }

      if (request.method === "GET" && pathname === "/v1/help") {
        if (wantsMarkdownFormat(request, url)) {
          return markdownResponse(200, getHelpMarkdown(url.origin), cors, { "Cache-Control": "public, max-age=300" });
        }
        return jsonResponse(200, getHelpPayload(url.origin), cors, { "Cache-Control": "public, max-age=300" });
      }

      if (request.method === "GET" && pathname === "/v1/cheatsheet") {
        const content = getJanttCheatsheet(url.origin);
        if (wantsJsonFormat(request, url)) {
          return jsonResponse(
            200,
            { format: "markdown", title: "Jantt JSON Cheatsheet & Gotchas", content },
            cors,
            { "Cache-Control": "public, max-age=300" }
          );
        }
        return markdownResponse(200, content, cors, { "Cache-Control": "public, max-age=300" });
      }

      if (request.method === "GET" && pathname === "/v1/prompt") {
        const mode = parsePromptModeParam(url.searchParams.get("mode"));
        const content = getAgentSystemPrompt(url.origin, mode);
        if (wantsJsonFormat(request, url)) {
          return jsonResponse(
            200,
            { format: "markdown", mode, title: "Jantt Cloud Editing System Prompt", content },
            cors,
            { "Cache-Control": "public, max-age=300" }
          );
        }
        return markdownResponse(200, content, cors, { "Cache-Control": "public, max-age=300" });
      }

      if (request.method === "GET" && pathname === "/v1/schema") {
        return jsonResponse(200, getJanttSchema(), cors, {
          "Content-Type": "application/schema+json; charset=utf-8",
          "Cache-Control": "public, max-age=300"
        });
      }

      if (request.method === "GET" && pathname === "/v1/template") {
        const kind = (url.searchParams.get("kind") || "starter").trim().toLowerCase();
        const template = kind === "master" ? getMasterTemplate() : getStarterTemplate();
        return jsonResponse(200, template, cors, { "Cache-Control": "public, max-age=300" });
      }

      if (pathname === "/v1/validate") {
        if (request.method !== "POST") {
          throw new HttpError(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
        }
        const body = await readCappedJson(request);
        const strictFromQuery = url.searchParams.get("strict") === "true";
        const strictFromBody =
          Boolean(body && typeof body === "object" && !Array.isArray(body) && (body as { strict?: unknown }).strict === true);
        const report = validatePlanPayload(body, { strict: strictFromQuery || strictFromBody });
        return jsonResponse(200, report, cors);
      }

      const rtdb = getRtdb(env);

      // ------------------------------------------------------------------
      // 1. Account & API Key Management (Firebase Auth ID Token)
      // ------------------------------------------------------------------
      if (pathname === "/v1/account/access" && request.method === "GET") {
        const user = await authenticateFirebaseUser(request, env, rtdb, deps);
        return jsonResponse(200, await getAccountAccessPayload(user, rtdb), cors);
      }

      if (pathname === "/v1/keys" && request.method === "GET") {
        const user = await authenticateFirebaseUser(request, env, rtdb, deps);
        return jsonResponse(200, { keys: await listUserKeys(user.uid, rtdb) }, cors);
      }

      if (pathname === "/v1/keys" && request.method === "POST") {
        const user = await authenticateFirebaseUser(request, env, rtdb, deps);
        const body = asObjectBody(await readCappedJson(request));
        const created = await createUserApiKey(user, body.label, env, rtdb, nowMs);
        return jsonResponse(201, created, cors);
      }

      const keyMatch = pathname.match(/^\/v1\/keys\/([^/]+)$/);
      if (keyMatch && request.method === "DELETE") {
        const user = await authenticateFirebaseUser(request, env, rtdb, deps);
        const keyId = decodePathSegment(keyMatch[1]);
        return jsonResponse(200, await revokeUserApiKey(user.uid, keyId, rtdb, nowMs), cors);
      }

      // ------------------------------------------------------------------
      // 2. Admin Access Control (Firebase Auth ID Token + Admin UID)
      // ------------------------------------------------------------------
      if (pathname === "/v1/admin/entitlements" && request.method === "GET") {
        const user = await authenticateFirebaseUser(request, env, rtdb, deps);
        assertAdmin(user);
        return jsonResponse(200, { users: await listAdminEntitlements(rtdb, env) }, cors);
      }

      if (pathname === "/v1/admin/users" && request.method === "GET") {
        const user = await authenticateFirebaseUser(request, env, rtdb, deps);
        assertAdmin(user);
        const q = url.searchParams.get("q") || "";
        return jsonResponse(200, { users: await searchAdminUsers(rtdb, env, q) }, cors);
      }

      const adminEntitlementMatch = pathname.match(/^\/v1\/admin\/entitlements\/([^/]+)$/);
      if (adminEntitlementMatch) {
        const user = await authenticateFirebaseUser(request, env, rtdb, deps);
        assertAdmin(user);
        const targetUid = decodePathSegment(adminEntitlementMatch[1]);

        if (request.method === "PUT") {
          const body = asObjectBody(await readCappedJson(request));
          const saved = await setAdminEntitlement(user.uid, targetUid, body, rtdb, nowMs);
          return jsonResponse(200, { entitlement: saved }, cors);
        }
        if (request.method === "DELETE") {
          const revokeKeys = url.searchParams.get("revokeKeys") !== "false";
          const result = await revokeAdminEntitlement(user.uid, targetUid, revokeKeys, rtdb, nowMs);
          return jsonResponse(200, result, cors);
        }
        throw new HttpError(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
      }

      // ------------------------------------------------------------------
      // 3. Remote Streamable HTTP MCP Endpoint (Account API Key)
      // ------------------------------------------------------------------
      if (pathname === "/v1/mcp") {
        if (request.method === "GET") {
          return jsonResponse(
            405,
            {
              error: {
                code: "METHOD_NOT_ALLOWED",
                message: "Send MCP JSON-RPC 2.0 requests via POST /v1/mcp with Authorization: Bearer jnt_live_..."
              }
            },
            { ...cors, Allow: "POST, OPTIONS" }
          );
        }
        if (request.method !== "POST") {
          throw new HttpError(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
        }
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        const payload = await readCappedJson(request);
        const result = await handleMcpPayload(payload, account, rtdb, nowMs, url.origin);
        if (result.body === null) {
          return emptyResponse(result.status, cors);
        }
        return jsonResponse(result.status, result.body, cors);
      }

      // ------------------------------------------------------------------
      // 4. Account-Scoped Cloud Plans REST API (Account API Key)
      // ------------------------------------------------------------------
      if (pathname === "/v1/plans") {
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        if (request.method === "GET") {
          return jsonResponse(200, { plans: await listAccountPlans(account.uid, rtdb) }, cors);
        }
        if (request.method === "POST") {
          const body = asObjectBody(await readCappedJson(request));
          const strict = url.searchParams.get("strict") === "true" || body.strict === true;
          const created = await createAccountPlan(account.uid, { ...body, strict }, rtdb, nowMs);
          return jsonResponse(201, created, cors);
        }
        throw new HttpError(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
      }

      const planMatch = pathname.match(/^\/v1\/plans\/([^/]+)$/);
      if (planMatch) {
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        const roomId = decodePathSegment(planMatch[1]);
        if (request.method === "GET") {
          const includeDeleted = url.searchParams.get("includeDeleted") === "true";
          return jsonResponse(200, await getAccountPlan(account.uid, roomId, rtdb, { includeDeleted }), cors);
        }
        if (request.method === "PUT") {
          const body = asObjectBody(await readCappedJson(request));
          const strict = url.searchParams.get("strict") === "true" || body.strict === true;
          return jsonResponse(200, await replaceAccountPlan(account.uid, roomId, { ...body, strict }, rtdb, nowMs), cors);
        }
        if (request.method === "PATCH") {
          const body = asObjectBody(await readCappedJson(request));
          const strict = url.searchParams.get("strict") === "true" || body.strict === true;
          return jsonResponse(200, await patchAccountPlan(account.uid, roomId, { ...body, strict }, rtdb, nowMs), cors);
        }
        if (request.method === "DELETE") {
          return jsonResponse(200, await deleteAccountPlan(account.uid, roomId, rtdb), cors);
        }
        throw new HttpError(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
      }

      const tasksMatch = pathname.match(/^\/v1\/plans\/([^/]+)\/tasks$/);
      if (tasksMatch) {
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        const roomId = decodePathSegment(tasksMatch[1]);
        if (request.method === "GET") {
          return jsonResponse(
            200,
            await listPlanTasks(
              account.uid,
              roomId,
              {
                category: url.searchParams.get("category") || undefined,
                assignee: url.searchParams.get("assignee") || undefined,
                status: url.searchParams.get("status") || undefined
              },
              rtdb
            ),
            cors
          );
        }
        if (request.method === "POST") {
          const body = asObjectBody(await readCappedJson(request));
          const taskPayload = "task" in body && body.task && typeof body.task === "object" ? body.task : body;
          const resolveCascade = body.resolveCascade !== false;
          return jsonResponse(
            201,
            await addPlanTask(account.uid, roomId, taskPayload, rtdb, { resolveCascade }, nowMs),
            cors
          );
        }
        throw new HttpError(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
      }

      const taskItemMatch = pathname.match(/^\/v1\/plans\/([^/]+)\/tasks\/([^/]+)$/);
      if (taskItemMatch) {
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        const roomId = decodePathSegment(taskItemMatch[1]);
        const taskId = decodePathSegment(taskItemMatch[2]);
        if (request.method === "PATCH") {
          const body = asObjectBody(await readCappedJson(request));
          const resolveCascade = body.resolveCascade !== false;
          return jsonResponse(
            200,
            await updatePlanTask(account.uid, roomId, taskId, body, rtdb, { resolveCascade }, nowMs),
            cors
          );
        }
        if (request.method === "DELETE") {
          const cleanupDependencies = url.searchParams.get("cleanupDependencies") !== "false";
          return jsonResponse(
            200,
            await deletePlanTask(account.uid, roomId, taskId, rtdb, { cleanupDependencies }, nowMs),
            cors
          );
        }
        throw new HttpError(405, "METHOD_NOT_ALLOWED", `Method ${request.method} not allowed.`);
      }

      const inspectMatch = pathname.match(/^\/v1\/plans\/([^/]+)\/inspect$/);
      if (inspectMatch && request.method === "GET") {
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        const roomId = decodePathSegment(inspectMatch[1]);
        return jsonResponse(
          200,
          await inspectAccountPlan(account.uid, roomId, url.searchParams.get("targetDate") || undefined, rtdb),
          cors
        );
      }

      const auditMatch = pathname.match(/^\/v1\/plans\/([^/]+)\/audit$/);
      if (auditMatch && request.method === "GET") {
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        const roomId = decodePathSegment(auditMatch[1]);
        return jsonResponse(
          200,
          await auditAccountPlan(account.uid, roomId, url.searchParams.get("targetDate") || undefined, rtdb),
          cors
        );
      }

      const csvMatch = pathname.match(/^\/v1\/plans\/([^/]+)\/export\.csv$/);
      if (csvMatch && request.method === "GET") {
        const account = await authenticateApiKey(request, env, rtdb, ctx, nowMs);
        const roomId = decodePathSegment(csvMatch[1]);
        const csv = await exportAccountPlanCsv(account.uid, roomId, rtdb);
        return new Response(csv, {
          status: 200,
          headers: {
            ...cors,
            ...BASE_SECURITY_HEADERS,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${roomId}.csv"`
          }
        });
      }

      throw new HttpError(404, "NOT_FOUND", `Route ${request.method} ${pathname} not found.`);
    } catch (err) {
      if (err instanceof HttpError) {
        return jsonResponse(
          err.status,
          {
            error: {
              code: err.code,
              message: err.message,
              ...(err.details !== undefined ? { details: err.details } : {})
            }
          },
          cors
        );
      }
      console.error(
        JSON.stringify({
          level: "error",
          event: "unhandled_cloud_api_error",
          method: request.method,
          pathname,
          message: err instanceof Error ? err.message : String(err)
        })
      );
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: "Internal server error." } }, cors);
    }
  };
}

const defaultHandler = createCloudApiHandler();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    return defaultHandler(request, env, ctx);
  }
};
