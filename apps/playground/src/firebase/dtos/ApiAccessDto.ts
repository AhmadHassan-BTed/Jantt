/**
 * Data Transfer Objects and validators for Cloud Agent API entitlements and per-account API keys.
 *
 * Storage contract (enforced by database.rules.json):
 * - `api_entitlements/{uid}`       -> readable by owner (`auth.uid === uid`), client writes denied.
 * - `user_api_keys/{uid}/{keyId}`  -> readable by owner (`auth.uid === uid`), client writes denied.
 * - `api_keys/{keyHash}`           -> server-only lookup table, all client reads/writes denied.
 */

export type ApiAccessTier = "admin" | "granted" | "paid";

export interface ApiEntitlement {
  uid: string;
  enabled: boolean;
  tier: ApiAccessTier;
  grantedAt: string;
  grantedBy: string;
  updatedAt: string;
  note?: string;
}

export interface UserApiKeyMetadata {
  keyId: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface AccountApiAccessState {
  uid: string;
  enabled: boolean;
  tier: ApiAccessTier | null;
  isAdmin: boolean;
  isConfigAdmin: boolean;
  entitlement: ApiEntitlement | null;
  keys: UserApiKeyMetadata[];
}

export interface CreatedApiKeyResult {
  keyId: string;
  apiKey: string;
  label: string;
  prefix: string;
  createdAt: string;
}

export interface AdminUserAccessSummary {
  uid: string;
  username: string;
  displayUsername?: string;
  displayName: string;
  photoURL?: string;
  entitlement: ApiEntitlement | null;
  isConfigAdmin: boolean;
  activeKeyCount: number;
  lastKeyUsedAt?: string;
}

export function isValidApiAccessTier(tier: unknown): tier is ApiAccessTier {
  return tier === "admin" || tier === "granted" || tier === "paid";
}

export function validateApiEntitlement(value: Partial<ApiEntitlement>): { valid: boolean; error?: string } {
  if (!value.uid || typeof value.uid !== "string") {
    return { valid: false, error: "Missing entitlement UID." };
  }
  if (typeof value.enabled !== "boolean") {
    return { valid: false, error: "Entitlement enabled flag must be a boolean." };
  }
  if (!isValidApiAccessTier(value.tier)) {
    return { valid: false, error: "Invalid entitlement tier. Must be 'admin', 'granted', or 'paid'." };
  }
  if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 500)) {
    return { valid: false, error: "Entitlement note must be at most 500 characters." };
  }
  return { valid: true };
}

