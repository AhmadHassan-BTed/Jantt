import { generateApiKey, sha256Hex, verifyFirebaseIdToken } from "./crypto";
import type { RtdbClient } from "./rtdb";
import {
  HttpError,
  type AccessState,
  type AdminUserAccessSummary,
  type ApiAccessTier,
  type ApiEntitlement,
  type ApiKeyHashRecord,
  type AuthenticatedApiAccount,
  type Env,
  type ExecutionContextLike,
  type FetchLike,
  type PublicProfile,
  type UserApiKeyMetadata,
  type VerifiedFirebaseToken
} from "./types";

const SAFE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_MAX_KEYS_PER_USER = 10;
const LAST_USED_STAMP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_LAST_USED_CACHE_ENTRIES = 500;

/** Isolate-local throttling cache for `lastUsedAt` stamps to avoid write amplification on hot keys. */
const lastUsedStampedAt = new Map<string, number>();

export function clearAuthCaches(): void {
  lastUsedStampedAt.clear();
}

export function isSafeRtdbKey(value: unknown): value is string {
  return typeof value === "string" && SAFE_KEY_PATTERN.test(value);
}

export function parseAdminUids(env: Env): Set<string> {
  const raw = env.ADMIN_UIDS || "";
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isValidTier(value: unknown): value is ApiAccessTier {
  return value === "admin" || value === "granted" || value === "paid";
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function extractApiKey(request: Request): string | null {
  const bearer = extractBearerToken(request);
  if (bearer && bearer.startsWith("jnt_live_")) return bearer;
  const headerKey = request.headers.get("X-API-Key")?.trim();
  if (headerKey && headerKey.startsWith("jnt_live_")) return headerKey;
  return null;
}

export async function resolveAccessState(rtdb: RtdbClient, uid: string, env: Env): Promise<AccessState> {
  if (!isSafeRtdbKey(uid)) {
    throw new HttpError(400, "INVALID_UID", "Invalid user identifier.");
  }
  const entitlement = await rtdb.get<ApiEntitlement>(`api_entitlements/${uid}`);
  const isConfigAdmin = parseAdminUids(env).has(uid);
  const isDbAdmin = entitlement?.enabled === true && entitlement.tier === "admin";
  const isAdmin = isConfigAdmin || isDbAdmin;
  const enabled = isConfigAdmin || entitlement?.enabled === true;
  const tier: ApiAccessTier | null = isConfigAdmin
    ? "admin"
    : entitlement?.enabled === true && isValidTier(entitlement.tier)
      ? entitlement.tier
      : null;

  return {
    uid,
    enabled,
    tier,
    isAdmin,
    isConfigAdmin,
    entitlement
  };
}

export interface AuthDeps {
  fetchFn?: FetchLike;
  verifyIdToken?: (token: string, projectId: string) => Promise<VerifiedFirebaseToken>;
  nowMs?: () => number;
}

export interface AuthenticatedFirebaseAccount extends AccessState {
  email?: string;
}

export async function authenticateFirebaseUser(
  request: Request,
  env: Env,
  rtdb: RtdbClient,
  deps: AuthDeps = {}
): Promise<AuthenticatedFirebaseAccount> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new HttpError(401, "MISSING_AUTH", "Missing Authorization: Bearer <firebaseIdToken> header.");
  }
  if (token.startsWith("jnt_live_")) {
    throw new HttpError(401, "FIREBASE_TOKEN_REQUIRED", "This endpoint requires a signed-in Firebase ID token, not an API key.");
  }
  const projectId = env.FIREBASE_PROJECT_ID || "jantt-cloud";
  const verified = deps.verifyIdToken
    ? await deps.verifyIdToken(token, projectId)
    : await verifyFirebaseIdToken(token, projectId, deps.fetchFn ?? fetch, deps.nowMs?.() ?? Date.now());

  const access = await resolveAccessState(rtdb, verified.uid, env);
  return {
    ...access,
    email: verified.email
  };
}

export function assertAdmin(account: AccessState): void {
  if (!account.isAdmin) {
    throw new HttpError(403, "ADMIN_REQUIRED", "Admin access is required for this endpoint.");
  }
}

export function assertEnabledAccess(account: AccessState): void {
  if (!account.enabled) {
    throw new HttpError(
      403,
      "API_ACCESS_NOT_GRANTED",
      "Cloud Agent API access has not been granted for this account. Contact the Jantt admin with your UID."
    );
  }
}

function recordLastUsedTouch(keyId: string, nowMs: number): boolean {
  const previous = lastUsedStampedAt.get(keyId);
  if (previous !== undefined && nowMs - previous < LAST_USED_STAMP_INTERVAL_MS) {
    return false;
  }
  if (lastUsedStampedAt.size >= MAX_LAST_USED_CACHE_ENTRIES) {
    const oldest = lastUsedStampedAt.keys().next().value;
    if (oldest !== undefined) lastUsedStampedAt.delete(oldest);
  }
  lastUsedStampedAt.set(keyId, nowMs);
  return true;
}

export async function authenticateApiKey(
  request: Request,
  env: Env,
  rtdb: RtdbClient,
  ctx?: ExecutionContextLike,
  nowMs: number = Date.now()
): Promise<AuthenticatedApiAccount> {
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    throw new HttpError(
      401,
      "MISSING_API_KEY",
      "Missing API key. Pass Authorization: Bearer jnt_live_... or X-API-Key: jnt_live_...."
    );
  }

  const keyHash = await sha256Hex(apiKey);
  const record = await rtdb.get<ApiKeyHashRecord>(`api_keys/hashes/${keyHash}`);
  if (!record || !record.uid || !record.keyId || record.revokedAt) {
    throw new HttpError(401, "INVALID_API_KEY", "API key is invalid or has been revoked.");
  }

  const access = await resolveAccessState(rtdb, record.uid, env);
  if (!access.enabled) {
    throw new HttpError(403, "API_ACCESS_REVOKED", "API access for this account is currently disabled.");
  }

  if (recordLastUsedTouch(record.keyId, nowMs)) {
    const stamp = new Date(nowMs).toISOString();
    const updatePromise = rtdb
      .patch(`user_api_keys/${record.uid}/${record.keyId}`, { lastUsedAt: stamp })
      .catch((err) => {
        console.warn("[cloud-api] Could not update lastUsedAt:", err);
      });
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(updatePromise);
    } else {
      await updatePromise;
    }
  }

  return {
    ...access,
    keyId: record.keyId,
    keyHash
  };
}

export async function listUserKeys(uid: string, rtdb: RtdbClient): Promise<UserApiKeyMetadata[]> {
  const map = await rtdb.get<Record<string, UserApiKeyMetadata>>(`user_api_keys/${uid}`);
  if (!map || typeof map !== "object") return [];
  return Object.values(map)
    .filter((k): k is UserApiKeyMetadata => Boolean(k && typeof k === "object" && typeof k.keyId === "string"))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getAccountAccessPayload(account: AccessState, rtdb: RtdbClient) {
  const keys = await listUserKeys(account.uid, rtdb);
  return {
    uid: account.uid,
    enabled: account.enabled,
    tier: account.tier,
    isAdmin: account.isAdmin,
    isConfigAdmin: account.isConfigAdmin,
    entitlement: account.entitlement,
    keys
  };
}

export async function createUserApiKey(
  account: AccessState,
  rawLabel: unknown,
  env: Env,
  rtdb: RtdbClient,
  nowMs: number = Date.now()
) {
  assertEnabledAccess(account);

  const label =
    typeof rawLabel === "string" && rawLabel.trim()
      ? rawLabel.trim().slice(0, 100)
      : "Default Agent Key";

  const maxKeys = Math.max(1, Number(env.MAX_KEYS_PER_USER) || DEFAULT_MAX_KEYS_PER_USER);
  const existing = await listUserKeys(account.uid, rtdb);
  const activeCount = existing.filter((k) => !k.revokedAt).length;
  if (activeCount >= maxKeys) {
    throw new HttpError(
      400,
      "KEY_LIMIT_REACHED",
      `You already have ${activeCount} active API keys (maximum ${maxKeys}). Revoke an unused key first.`
    );
  }

  const { apiKey, prefix, keyId } = generateApiKey();
  const keyHash = await sha256Hex(apiKey);
  const createdAt = new Date(nowMs).toISOString();

  const meta: UserApiKeyMetadata = {
    keyId,
    label,
    prefix,
    createdAt
  };
  const hashRecord: ApiKeyHashRecord = {
    uid: account.uid,
    keyId,
    prefix,
    createdAt
  };

  await rtdb.patch("", {
    [`api_keys/hashes/${keyHash}`]: hashRecord,
    [`api_keys/by_uid/${account.uid}/${keyId}`]: keyHash,
    [`user_api_keys/${account.uid}/${keyId}`]: meta
  });

  return {
    keyId,
    apiKey,
    label,
    prefix,
    createdAt
  };
}

export async function revokeUserApiKey(
  uid: string,
  keyId: string,
  rtdb: RtdbClient,
  nowMs: number = Date.now()
): Promise<{ keyId: string; revokedAt: string }> {
  if (!isSafeRtdbKey(keyId)) {
    throw new HttpError(400, "INVALID_KEY_ID", "Invalid API key ID.");
  }
  const [meta, keyHash] = await Promise.all([
    rtdb.get<UserApiKeyMetadata>(`user_api_keys/${uid}/${keyId}`),
    rtdb.get<string>(`api_keys/by_uid/${uid}/${keyId}`)
  ]);
  if (!meta && !keyHash) {
    throw new HttpError(404, "KEY_NOT_FOUND", `API key '${keyId}' was not found.`);
  }
  const revokedAt = meta?.revokedAt || new Date(nowMs).toISOString();
  const updates: Record<string, unknown> = {
    [`api_keys/by_uid/${uid}/${keyId}`]: null
  };
  if (meta) {
    updates[`user_api_keys/${uid}/${keyId}/revokedAt`] = revokedAt;
  }
  if (keyHash && isSafeRtdbKey(keyHash)) {
    updates[`api_keys/hashes/${keyHash}`] = null;
  }
  await rtdb.patch("", updates);
  lastUsedStampedAt.delete(keyId);
  return { keyId, revokedAt };
}

function summarizeKeysForUid(keysMap: Record<string, UserApiKeyMetadata> | undefined): {
  activeKeyCount: number;
  lastKeyUsedAt?: string;
} {
  if (!keysMap || typeof keysMap !== "object") return { activeKeyCount: 0 };
  let activeKeyCount = 0;
  let lastKeyUsedAt: string | undefined;
  for (const key of Object.values(keysMap)) {
    if (!key || typeof key !== "object") continue;
    if (!key.revokedAt) activeKeyCount += 1;
    if (key.lastUsedAt && (!lastKeyUsedAt || key.lastUsedAt > lastKeyUsedAt)) {
      lastKeyUsedAt = key.lastUsedAt;
    }
  }
  return { activeKeyCount, lastKeyUsedAt };
}

function toAdminSummary(
  uid: string,
  profile: PublicProfile | undefined,
  entitlement: ApiEntitlement | null,
  keysMap: Record<string, UserApiKeyMetadata> | undefined,
  configAdmins: Set<string>
): AdminUserAccessSummary {
  const { activeKeyCount, lastKeyUsedAt } = summarizeKeysForUid(keysMap);
  return {
    uid,
    username: profile?.username || uid,
    displayUsername: profile?.displayUsername,
    displayName: profile?.displayName || profile?.displayUsername || profile?.username || uid,
    photoURL: profile?.photoURL,
    entitlement,
    isConfigAdmin: configAdmins.has(uid),
    activeKeyCount,
    ...(lastKeyUsedAt ? { lastKeyUsedAt } : {})
  };
}

export async function listAdminEntitlements(rtdb: RtdbClient, env: Env): Promise<AdminUserAccessSummary[]> {
  const [entitlementsMap, profilesMap, allKeysMap] = await Promise.all([
    rtdb.get<Record<string, ApiEntitlement>>("api_entitlements"),
    rtdb.get<Record<string, PublicProfile>>("public_profiles"),
    rtdb.get<Record<string, Record<string, UserApiKeyMetadata>>>("user_api_keys")
  ]);

  const configAdmins = parseAdminUids(env);
  const uids = new Set<string>([...configAdmins, ...Object.keys(entitlementsMap || {})]);

  const list: AdminUserAccessSummary[] = [];
  for (const uid of uids) {
    list.push(
      toAdminSummary(
        uid,
        profilesMap?.[uid],
        entitlementsMap?.[uid] || null,
        allKeysMap?.[uid],
        configAdmins
      )
    );
  }

  return list.sort((a, b) => {
    const aActive = a.isConfigAdmin || a.entitlement?.enabled ? 1 : 0;
    const bActive = b.isConfigAdmin || b.entitlement?.enabled ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return (b.entitlement?.updatedAt || "").localeCompare(a.entitlement?.updatedAt || "") || a.username.localeCompare(b.username);
  });
}

export async function searchAdminUsers(rtdb: RtdbClient, env: Env, rawQuery: string): Promise<AdminUserAccessSummary[]> {
  const q = rawQuery.trim().toLowerCase().replace(/^@+/, "");
  const [profilesMap, entitlementsMap, allKeysMap] = await Promise.all([
    rtdb.get<Record<string, PublicProfile>>("public_profiles"),
    rtdb.get<Record<string, ApiEntitlement>>("api_entitlements"),
    rtdb.get<Record<string, Record<string, UserApiKeyMetadata>>>("user_api_keys")
  ]);

  const configAdmins = parseAdminUids(env);
  const matches: AdminUserAccessSummary[] = [];
  const seen = new Set<string>();

  for (const [uid, profile] of Object.entries(profilesMap || {})) {
    if (!profile || typeof profile !== "object") continue;
    const haystack = `${uid} ${profile.username || ""} ${profile.displayUsername || ""} ${profile.displayName || ""}`.toLowerCase();
    if (!q || haystack.includes(q)) {
      seen.add(uid);
      matches.push(toAdminSummary(uid, profile, entitlementsMap?.[uid] || null, allKeysMap?.[uid], configAdmins));
    }
  }

  if (q && isSafeRtdbKey(rawQuery.trim()) && !seen.has(rawQuery.trim())) {
    const exactUid = rawQuery.trim();
    if (entitlementsMap?.[exactUid] || configAdmins.has(exactUid)) {
      matches.push(
        toAdminSummary(exactUid, undefined, entitlementsMap?.[exactUid] || null, allKeysMap?.[exactUid], configAdmins)
      );
    }
  }

  return matches
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, 25);
}

export async function setAdminEntitlement(
  adminUid: string,
  targetUid: string,
  body: Record<string, unknown>,
  rtdb: RtdbClient,
  nowMs: number = Date.now()
): Promise<ApiEntitlement> {
  if (!isSafeRtdbKey(targetUid)) {
    throw new HttpError(400, "INVALID_UID", "Invalid target user UID.");
  }
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
  const tier = body.tier === undefined ? "granted" : body.tier;
  if (!isValidTier(tier)) {
    throw new HttpError(400, "INVALID_TIER", "Tier must be 'granted', 'paid', or 'admin'.");
  }
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : undefined;

  const existing = await rtdb.get<ApiEntitlement>(`api_entitlements/${targetUid}`);
  const now = new Date(nowMs).toISOString();
  const next: ApiEntitlement = {
    uid: targetUid,
    enabled,
    tier,
    grantedAt: existing?.grantedAt || now,
    grantedBy: adminUid,
    updatedAt: now,
    ...(note ? { note } : {})
  };

  await rtdb.put(`api_entitlements/${targetUid}`, next);
  return next;
}

export async function revokeAdminEntitlement(
  adminUid: string,
  targetUid: string,
  revokeKeys: boolean,
  rtdb: RtdbClient,
  nowMs: number = Date.now()
): Promise<{ uid: string; enabled: false; revokedKeysCount: number }> {
  if (!isSafeRtdbKey(targetUid)) {
    throw new HttpError(400, "INVALID_UID", "Invalid target user UID.");
  }
  const [existing, byUidHashes, userKeys] = await Promise.all([
    rtdb.get<ApiEntitlement>(`api_entitlements/${targetUid}`),
    revokeKeys ? rtdb.get<Record<string, string>>(`api_keys/by_uid/${targetUid}`) : Promise.resolve(null),
    revokeKeys ? rtdb.get<Record<string, UserApiKeyMetadata>>(`user_api_keys/${targetUid}`) : Promise.resolve(null)
  ]);

  const now = new Date(nowMs).toISOString();
  const updates: Record<string, unknown> = {
    [`api_entitlements/${targetUid}`]: {
      uid: targetUid,
      enabled: false,
      tier: existing?.tier || "granted",
      grantedAt: existing?.grantedAt || now,
      grantedBy: adminUid,
      updatedAt: now,
      ...(existing?.note ? { note: existing.note } : {})
    }
  };

  let revokedKeysCount = 0;
  if (revokeKeys) {
    for (const [keyId, hash] of Object.entries(byUidHashes || {})) {
      if (isSafeRtdbKey(keyId)) {
        updates[`api_keys/by_uid/${targetUid}/${keyId}`] = null;
      }
      if (typeof hash === "string" && isSafeRtdbKey(hash)) {
        updates[`api_keys/hashes/${hash}`] = null;
        revokedKeysCount += 1;
      }
      lastUsedStampedAt.delete(keyId);
    }
    for (const [keyId, meta] of Object.entries(userKeys || {})) {
      if (meta && !meta.revokedAt && isSafeRtdbKey(keyId)) {
        updates[`user_api_keys/${targetUid}/${keyId}/revokedAt`] = now;
      }
    }
  }

  await rtdb.patch("", updates);
  return { uid: targetUid, enabled: false, revokedKeysCount };
}

