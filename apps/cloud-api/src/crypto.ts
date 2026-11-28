import { HttpError, type Env, type FetchLike, type VerifiedFirebaseToken } from "./types";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_DB_SCOPES = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function utf8ToBase64Url(text: string): string {
  return bytesToBase64Url(encoder.encode(text));
}

export function base64UrlToUtf8(input: string): string {
  return decoder.decode(base64UrlToBytes(input));
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/** Constant-time string equality check over UTF-8 bytes. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const maxLen = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** Generates a cryptographically strong account API key using Web Crypto CSPRNG. */
export function generateApiKey(): { apiKey: string; prefix: string; keyId: string } {
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secret = bytesToBase64Url(secretBytes);
  const apiKey = `jnt_live_${secret}`;

  const idBytes = new Uint8Array(8);
  crypto.getRandomValues(idBytes);
  const keyId = `key_${bytesToHex(idBytes)}`;
  const prefix = `${apiKey.slice(0, 17)}...`;
  return { apiKey, prefix, keyId };
}

function pemToPkcs8Buffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n");
  const stripped = normalized
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, "")
    .replace(/-----END [A-Z0-9 ]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(stripped);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function signRs256Jwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyPem: string
): Promise<string> {
  const signingInput = `${utf8ToBase64Url(JSON.stringify(header))}.${utf8ToBase64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Buffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput));
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

export function resolveServiceAccount(env: Env): ServiceAccountCredentials {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    let parsed: { client_email?: unknown; private_key?: unknown };
    try {
      parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as { client_email?: unknown; private_key?: unknown };
    } catch {
      throw new HttpError(500, "SERVER_CONFIG_ERROR", "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
      throw new HttpError(500, "SERVER_CONFIG_ERROR", "FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
    }
    return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
  }
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return { clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY };
  }
  throw new HttpError(
    500,
    "SERVER_CONFIG_ERROR",
    "Firebase service account credentials are not configured on this Worker."
  );
}

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
}

const accessTokenCache = new Map<string, CachedAccessToken>();

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/** Exchanges the Firebase Service Account key for a short-lived Google OAuth2 RTDB access token. */
export async function getServiceAccountAccessToken(
  env: Env,
  fetchFn: FetchLike = defaultFetch,
  nowMs: number = Date.now()
): Promise<string> {
  const creds = resolveServiceAccount(env);
  const cached = accessTokenCache.get(creds.clientEmail);
  if (cached && cached.expiresAtMs - 300_000 > nowMs) {
    return cached.accessToken;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const assertion = await signRs256Jwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: creds.clientEmail,
      sub: creds.clientEmail,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      scope: FIREBASE_DB_SCOPES,
      iat: nowSec,
      exp: nowSec + 3600
    },
    creds.privateKey
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetchFn(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    throw new HttpError(502, "UPSTREAM_AUTH_FAILED", `Failed to obtain Firebase OAuth2 token (${response.status}).`);
  }

  const data = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new HttpError(502, "UPSTREAM_AUTH_FAILED", "Google OAuth2 response did not include an access_token.");
  }

  const ttlSec = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
  accessTokenCache.set(creds.clientEmail, {
    accessToken: data.access_token,
    expiresAtMs: nowMs + ttlSec * 1000
  });
  return data.access_token;
}

export function clearCryptoCaches(): void {
  accessTokenCache.clear();
  cachedJwks = null;
}

interface JwkWithKid extends JsonWebKey {
  kid?: string;
}

interface CachedJwks {
  keys: Map<string, JwkWithKid>;
  expiresAtMs: number;
}

let cachedJwks: CachedJwks | null = null;

function parseMaxAgeMs(cacheControl: string | null): number {
  if (!cacheControl) return 300_000;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 300_000;
  const sec = Number(match[1]);
  return Number.isFinite(sec) && sec > 0 ? Math.min(sec * 1000, 86_400_000) : 300_000;
}

async function loadFirebaseJwks(
  fetchFn: FetchLike,
  forceRefresh: boolean,
  nowMs: number
): Promise<Map<string, JwkWithKid>> {
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAtMs > nowMs) {
    return cachedJwks.keys;
  }

  const response = await fetchFn(GOOGLE_JWKS_URL, { method: "GET" });
  if (!response.ok) {
    throw new HttpError(502, "JWKS_FETCH_FAILED", `Could not fetch Firebase Auth JWKS (${response.status}).`);
  }
  const body = (await response.json()) as { keys?: unknown };
  if (!Array.isArray(body.keys)) {
    throw new HttpError(502, "JWKS_INVALID", "Firebase Auth JWKS payload is invalid.");
  }
  const map = new Map<string, JwkWithKid>();
  for (const item of body.keys) {
    if (item && typeof item === "object" && typeof (item as JwkWithKid).kid === "string") {
      map.set((item as JwkWithKid).kid!, item as JwkWithKid);
    }
  }
  cachedJwks = {
    keys: map,
    expiresAtMs: nowMs + parseMaxAgeMs(response.headers.get("Cache-Control"))
  };
  return map;
}

interface FirebaseJwtPayload {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  auth_time?: unknown;
  email?: unknown;
  firebase?: { sign_in_provider?: unknown };
}

/**
 * Verifies a Firebase Auth ID token using RS256 and Google's published JWKS.
 * Enforces Jantt's GitHub-only provider invariant (`firebase.sign_in_provider === "github.com"`).
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  fetchFn: FetchLike = defaultFetch,
  nowMs: number = Date.now()
): Promise<VerifiedFirebaseToken> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Malformed Firebase ID token.");
  }
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: unknown; kid?: unknown };
  let payload: FirebaseJwtPayload;
  try {
    header = JSON.parse(base64UrlToUtf8(headerB64)) as { alg?: unknown; kid?: unknown };
    payload = JSON.parse(base64UrlToUtf8(payloadB64)) as FirebaseJwtPayload;
  } catch {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Could not decode Firebase ID token.");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Unsupported Firebase ID token header.");
  }

  const nowSec = Math.floor(nowMs / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.aud !== projectId || payload.iss !== expectedIssuer) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Firebase ID token audience or issuer mismatch.");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Firebase ID token subject is invalid.");
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new HttpError(401, "TOKEN_EXPIRED", "Firebase ID token has expired. Refresh your session and retry.");
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSec + 60) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Firebase ID token issued-at time is in the future.");
  }
  if (typeof payload.auth_time === "number" && payload.auth_time > nowSec + 60) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Firebase ID token auth_time is in the future.");
  }

  const provider = payload.firebase?.sign_in_provider;
  if (provider !== "github.com") {
    throw new HttpError(403, "UNSUPPORTED_AUTH_PROVIDER", "Only GitHub-authenticated Jantt accounts are supported.");
  }

  let keys = await loadFirebaseJwks(fetchFn, false, nowMs);
  let jwk = keys.get(header.kid);
  if (!jwk) {
    keys = await loadFirebaseJwks(fetchFn, true, nowMs);
    jwk = keys.get(header.kid);
  }
  if (!jwk) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Firebase ID token signing key not recognized.");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = base64UrlToBytes(sigB64);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    sigBytes,
    encoder.encode(`${headerB64}.${payloadB64}`)
  );
  if (!verified) {
    throw new HttpError(401, "INVALID_ID_TOKEN", "Firebase ID token signature verification failed.");
  }

  return {
    uid: payload.sub,
    provider,
    email: typeof payload.email === "string" ? payload.email : undefined
  };
}
