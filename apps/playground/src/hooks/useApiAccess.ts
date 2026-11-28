import { useCallback, useEffect, useState } from "react";
import {
  createAccountApiKey,
  fetchAccountApiAccess,
  fetchAdminEntitlements,
  getCloudApiBaseUrl,
  grantAdminEntitlement,
  listenToApiEntitlement,
  listenToUserApiKeys,
  revokeAccountApiKey,
  revokeAdminEntitlement,
  searchAdminUsers,
  type AccountApiAccessState,
  type AdminUserAccessSummary,
  type ApiAccessTier,
  type ApiEntitlement,
  type CreatedApiKeyResult,
  type UserApiKeyMetadata
} from "../firebase";

export interface UseApiAccessReturn {
  apiBaseUrl: string;
  isConfigured: boolean;
  isLoading: boolean;
  error: string | null;
  enabled: boolean;
  isAdmin: boolean;
  isConfigAdmin: boolean;
  tier: ApiAccessTier | null;
  entitlement: ApiEntitlement | null;
  keys: UserApiKeyMetadata[];
  lastCreatedKey: CreatedApiKeyResult | null;
  clearLastCreatedKey: () => void;
  refresh: () => Promise<void>;
  generateKey: (label?: string) => Promise<CreatedApiKeyResult>;
  revokeKey: (keyId: string) => Promise<void>;
  adminUsers: AdminUserAccessSummary[];
  isLoadingAdmin: boolean;
  loadAdminEntitlements: () => Promise<void>;
  searchUsers: (query: string) => Promise<AdminUserAccessSummary[]>;
  grantUserAccess: (uid: string, payload: { enabled: boolean; tier: ApiAccessTier; note?: string }) => Promise<void>;
  revokeUserAccess: (uid: string, revokeKeys?: boolean) => Promise<{ revokedKeysCount: number }>;
}

export function useApiAccess(uid: string | null, isActive: boolean): UseApiAccessReturn {
  const apiBaseUrl = getCloudApiBaseUrl();
  const isConfigured = Boolean(apiBaseUrl);

  const [rtdbEntitlement, setRtdbEntitlement] = useState<ApiEntitlement | null>(null);
  const [rtdbKeys, setRtdbKeys] = useState<UserApiKeyMetadata[]>([]);
  const [serverState, setServerState] = useState<AccountApiAccessState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedKey, setLastCreatedKey] = useState<CreatedApiKeyResult | null>(null);

  const [adminUsers, setAdminUsers] = useState<AdminUserAccessSummary[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  // Live RTDB listeners keep unlocked state & key metadata up to date immediately on sign-in.
  useEffect(() => {
    if (!uid) {
      setRtdbEntitlement(null);
      setRtdbKeys([]);
      setServerState(null);
      setLastCreatedKey(null);
      setAdminUsers([]);
      setError(null);
      return;
    }

    const unsubEntitlement = listenToApiEntitlement(
      uid,
      (ent) => setRtdbEntitlement(ent),
      (err) => console.warn("[useApiAccess] Entitlement listener error:", err)
    );
    const unsubKeys = listenToUserApiKeys(
      uid,
      (list) => setRtdbKeys(list),
      (err) => console.warn("[useApiAccess] API keys listener error:", err)
    );

    return () => {
      unsubEntitlement();
      unsubKeys();
    };
  }, [uid]);

  const refresh = useCallback(async () => {
    if (!uid || !isConfigured) return;
    setIsLoading(true);
    setError(null);
    try {
      const state = await fetchAccountApiAccess(apiBaseUrl);
      setServerState(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach Jantt Cloud API.");
    } finally {
      setIsLoading(false);
    }
  }, [uid, isConfigured, apiBaseUrl]);

  // Fetch Worker-verified access state (needed to detect ADMIN_UIDS bootstrap admins) whenever opened or signed in.
  useEffect(() => {
    if (!uid || !isConfigured) return;
    if (isActive || serverState === null) {
      void refresh();
    }
  }, [uid, isConfigured, isActive, serverState === null, refresh]);

  const entitlement = serverState?.entitlement ?? rtdbEntitlement;
  const isConfigAdmin = Boolean(serverState?.isConfigAdmin);
  const isDbAdmin = entitlement?.enabled === true && entitlement.tier === "admin";
  const isAdmin = Boolean(serverState?.isAdmin || isConfigAdmin || isDbAdmin);
  const enabled = Boolean(serverState?.enabled || isConfigAdmin || entitlement?.enabled === true);
  const tier: ApiAccessTier | null = isConfigAdmin
    ? "admin"
    : serverState?.tier ?? (entitlement?.enabled ? entitlement.tier : null);
  const keys = rtdbKeys.length > 0 ? rtdbKeys : serverState?.keys ?? [];

  const generateKey = useCallback(
    async (label?: string): Promise<CreatedApiKeyResult> => {
      setError(null);
      const created = await createAccountApiKey(label, apiBaseUrl);
      setLastCreatedKey(created);
      await refresh();
      return created;
    },
    [apiBaseUrl, refresh]
  );

  const revokeKey = useCallback(
    async (keyId: string): Promise<void> => {
      setError(null);
      await revokeAccountApiKey(keyId, apiBaseUrl);
      setLastCreatedKey((prev) => (prev?.keyId === keyId ? null : prev));
      await refresh();
    },
    [apiBaseUrl, refresh]
  );

  const loadAdminEntitlements = useCallback(async () => {
    if (!isConfigured || !isAdmin) return;
    setIsLoadingAdmin(true);
    setError(null);
    try {
      const users = await fetchAdminEntitlements(apiBaseUrl);
      setAdminUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin access list.");
    } finally {
      setIsLoadingAdmin(false);
    }
  }, [isConfigured, isAdmin, apiBaseUrl]);

  const searchUsers = useCallback(
    async (query: string): Promise<AdminUserAccessSummary[]> => {
      setError(null);
      return searchAdminUsers(query, apiBaseUrl);
    },
    [apiBaseUrl]
  );

  const grantUserAccess = useCallback(
    async (targetUid: string, payload: { enabled: boolean; tier: ApiAccessTier; note?: string }) => {
      setError(null);
      await grantAdminEntitlement(targetUid, payload, apiBaseUrl);
      await loadAdminEntitlements();
    },
    [apiBaseUrl, loadAdminEntitlements]
  );

  const revokeUserAccess = useCallback(
    async (targetUid: string, revokeKeys = true) => {
      setError(null);
      const res = await revokeAdminEntitlement(targetUid, revokeKeys, apiBaseUrl);
      await loadAdminEntitlements();
      return { revokedKeysCount: res.revokedKeysCount };
    },
    [apiBaseUrl, loadAdminEntitlements]
  );

  return {
    apiBaseUrl,
    isConfigured,
    isLoading,
    error,
    enabled,
    isAdmin,
    isConfigAdmin,
    tier,
    entitlement,
    keys,
    lastCreatedKey,
    clearLastCreatedKey: useCallback(() => setLastCreatedKey(null), []),
    refresh,
    generateKey,
    revokeKey,
    adminUsers,
    isLoadingAdmin,
    loadAdminEntitlements,
    searchUsers,
    grantUserAccess,
    revokeUserAccess
  };
}

