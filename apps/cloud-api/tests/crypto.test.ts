import { beforeEach, describe, expect, it } from "vitest";
import {
  bytesToBase64Url,
  clearCryptoCaches,
  generateApiKey,
  getServiceAccountAccessToken,
  sha256Hex,
  signRs256Jwt,
  timingSafeEqual,
  utf8ToBase64Url,
  verifyFirebaseIdToken
} from "../src/crypto";
import { HttpError, type Env, type FetchLike } from "../src/types";

async function generateTestRsaKeyPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let binary = "";
  for (let i = 0; i < pkcs8.length; i++) binary += String.fromCharCode(pkcs8[i]);
  const b64 = btoa(binary).match(/.{1,64}/g)?.join("\n") || "";
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey & { kid?: string };
  publicJwk.kid = "test-kid-1";
  return { privateKeyPem, publicJwk };
}

describe("cloud-api crypto", () => {
  beforeEach(() => {
    clearCryptoCaches();
  });

  it("generates prefixed CSPRNG API keys and deterministic SHA-256 hashes", async () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.apiKey.startsWith("jnt_live_")).toBe(true);
    expect(a.keyId.startsWith("key_")).toBe(true);
    expect(a.prefix).toBe(`${a.apiKey.slice(0, 17)}...`);
    expect(a.apiKey).not.toBe(b.apiKey);

    const h1 = await sha256Hex(a.apiKey);
    const h2 = await sha256Hex(a.apiKey);
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
    expect(timingSafeEqual(h1, h2)).toBe(true);
    expect(timingSafeEqual(h1, "different")).toBe(false);
  });

  it("verifies RS256 Firebase ID tokens and rejects expired, tampered, or non-GitHub tokens", async () => {
    const { privateKeyPem, publicJwk } = await generateTestRsaKeyPair();
    const nowMs = 1_760_000_000_000;
    const nowSec = Math.floor(nowMs / 1000);
    const projectId = "jantt-cloud";

    const mockFetch: FetchLike = async () =>
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }
      });

    const validJwt = await signRs256Jwt(
      { alg: "RS256", typ: "JWT", kid: "test-kid-1" },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        sub: "uid-alice",
        iat: nowSec - 10,
        auth_time: nowSec - 10,
        exp: nowSec + 3600,
        email: "alice@example.com",
        firebase: { sign_in_provider: "github.com" }
      },
      privateKeyPem
    );

    const verified = await verifyFirebaseIdToken(validJwt, projectId, mockFetch, nowMs);
    expect(verified).toEqual({
      uid: "uid-alice",
      provider: "github.com",
      email: "alice@example.com"
    });

    // Expired token
    const expiredJwt = await signRs256Jwt(
      { alg: "RS256", typ: "JWT", kid: "test-kid-1" },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        sub: "uid-alice",
        iat: nowSec - 7200,
        exp: nowSec - 60,
        firebase: { sign_in_provider: "github.com" }
      },
      privateKeyPem
    );
    await expect(verifyFirebaseIdToken(expiredJwt, projectId, mockFetch, nowMs)).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED"
    });

    // Non-GitHub provider
    const passwordJwt = await signRs256Jwt(
      { alg: "RS256", typ: "JWT", kid: "test-kid-1" },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        sub: "uid-alice",
        iat: nowSec - 10,
        exp: nowSec + 3600,
        firebase: { sign_in_provider: "password" }
      },
      privateKeyPem
    );
    await expect(verifyFirebaseIdToken(passwordJwt, projectId, mockFetch, nowMs)).rejects.toMatchObject({
      status: 403,
      code: "UNSUPPORTED_AUTH_PROVIDER"
    });

    // Tampered payload
    const [h, , s] = validJwt.split(".");
    const tampered = `${h}.${utf8ToBase64Url(
      JSON.stringify({
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        sub: "uid-admin",
        iat: nowSec - 10,
        exp: nowSec + 3600,
        firebase: { sign_in_provider: "github.com" }
      })
    )}.${s}`;
    await expect(verifyFirebaseIdToken(tampered, projectId, mockFetch, nowMs)).rejects.toBeInstanceOf(HttpError);

    // Bad signature bytes
    const badSig = `${h}.${validJwt.split(".")[1]}.${bytesToBase64Url(new Uint8Array(256))}`;
    await expect(verifyFirebaseIdToken(badSig, projectId, mockFetch, nowMs)).rejects.toMatchObject({
      status: 401,
      code: "INVALID_ID_TOKEN"
    });
  });

  it("exchanges Firebase service account JWT for OAuth2 access token and caches it", async () => {
    const { privateKeyPem } = await generateTestRsaKeyPair();
    let calls = 0;
    const mockFetch: FetchLike = async (_url, init) => {
      calls += 1;
      expect(init?.method).toBe("POST");
      expect(String(init?.body || "")).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
      return new Response(JSON.stringify({ access_token: "ya29.test-token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const env: Env = {
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "firebase-adminsdk@jantt-cloud.iam.gserviceaccount.com",
        private_key: privateKeyPem
      })
    };

    const t1 = await getServiceAccountAccessToken(env, mockFetch, 1_760_000_000_000);
    const t2 = await getServiceAccountAccessToken(env, mockFetch, 1_760_000_060_000);
    expect(t1).toBe("ya29.test-token");
    expect(t2).toBe("ya29.test-token");
    expect(calls).toBe(1);
  });
});

