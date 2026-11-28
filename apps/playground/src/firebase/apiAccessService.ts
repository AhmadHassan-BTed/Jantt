import { onValue, ref, type Unsubscribe } from "firebase/database";
import { auth, rtdb } from "./firebaseConfig";
import type {
  AccountApiAccessState,
  AdminUserAccessSummary,
  ApiAccessTier,
  ApiEntitlement,
  CreatedApiKeyResult,
  UserApiKeyMetadata
} from "./dtos";

const metaEnv: Record<string, string | undefined> =
  typeof import.meta !== "undefined" ? ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) : {};

/** Base URL of the deployed `@jantt/cloud-api` Cloudflare Worker (empty when unconfigured). */
export function getCloudApiBaseUrl(): string {
  const raw = metaEnv.VITE_CLOUD_API_URL || "";
  return raw.trim().replace(/\/+$/, "");
}

/** Subscribes to the signed-in user's live `/api_entitlements/{uid}` grant record. */
export function listenToApiEntitlement(
  uid: string,
  callback: (entitlement: ApiEntitlement | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onValue(
    ref(rtdb, `api_entitlements/${uid}`),
    (snapshot) => {
      callback(snapshot.exists() ? (snapshot.val() as ApiEntitlement) : null);
    },
    (err) => {
      onError?.(err);
    }
  );
}

/** Subscribes to the signed-in user's live `/user_api_keys/{uid}` display metadata list. */
export function listenToUserApiKeys(
  uid: string,
  callback: (keys: UserApiKeyMetadata[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onValue(
    ref(rtdb, `user_api_keys/${uid}`),
    (snapshot) => {
      const raw = snapshot.exists() ? (snapshot.val() as Record<string, UserApiKeyMetadata>) : null;
      if (!raw || typeof raw !== "object") {
        callback([]);
        return;
      }
      const list = Object.values(raw)
        .filter((k): k is UserApiKeyMetadata => Boolean(k && typeof k === "object" && typeof k.keyId === "string"))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      callback(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

async function callCloudApi<T>(path: string, init: RequestInit = {}, baseUrlOverride?: string): Promise<T> {
  const baseUrl = (baseUrlOverride ?? getCloudApiBaseUrl()).replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Cloud API endpoint is not configured yet (set VITE_CLOUD_API_URL).");
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Sign in with GitHub first to manage Cloud Agent API access.");
  }
  const idToken = await currentUser.getIdToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${idToken}`);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const errObj = parsed && typeof parsed === "object" ? (parsed as { error?: { message?: string } }).error : undefined;
    const message = errObj?.message || `Cloud API request failed (${response.status}).`;
    throw new Error(message);
  }
  return parsed as T;
}

export async function fetchAccountApiAccess(baseUrl?: string): Promise<AccountApiAccessState> {
  return callCloudApi<AccountApiAccessState>("/v1/account/access", { method: "GET" }, baseUrl);
}

export async function createAccountApiKey(label?: string, baseUrl?: string): Promise<CreatedApiKeyResult> {
  return callCloudApi<CreatedApiKeyResult>(
    "/v1/keys",
    {
      method: "POST",
      body: JSON.stringify(label ? { label } : {})
    },
    baseUrl
  );
}

export async function revokeAccountApiKey(
  keyId: string,
  baseUrl?: string
): Promise<{ keyId: string; revokedAt: string }> {
  return callCloudApi<{ keyId: string; revokedAt: string }>(
    `/v1/keys/${encodeURIComponent(keyId)}`,
    { method: "DELETE" },
    baseUrl
  );
}

export async function fetchAdminEntitlements(baseUrl?: string): Promise<AdminUserAccessSummary[]> {
  const res = await callCloudApi<{ users: AdminUserAccessSummary[] }>("/v1/admin/entitlements", { method: "GET" }, baseUrl);
  return Array.isArray(res?.users) ? res.users : [];
}

export async function searchAdminUsers(query: string, baseUrl?: string): Promise<AdminUserAccessSummary[]> {
  const res = await callCloudApi<{ users: AdminUserAccessSummary[] }>(
    `/v1/admin/users?q=${encodeURIComponent(query)}`,
    { method: "GET" },
    baseUrl
  );
  return Array.isArray(res?.users) ? res.users : [];
}

export async function grantAdminEntitlement(
  uid: string,
  payload: { enabled: boolean; tier: ApiAccessTier; note?: string },
  baseUrl?: string
): Promise<ApiEntitlement> {
  const res = await callCloudApi<{ entitlement: ApiEntitlement }>(
    `/v1/admin/entitlements/${encodeURIComponent(uid)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload)
    },
    baseUrl
  );
  return res.entitlement;
}

export async function revokeAdminEntitlement(
  uid: string,
  revokeKeys = true,
  baseUrl?: string
): Promise<{ uid: string; enabled: false; revokedKeysCount: number }> {
  return callCloudApi<{ uid: string; enabled: false; revokedKeysCount: number }>(
    `/v1/admin/entitlements/${encodeURIComponent(uid)}?revokeKeys=${revokeKeys ? "true" : "false"}`,
    { method: "DELETE" },
    baseUrl
  );
}

