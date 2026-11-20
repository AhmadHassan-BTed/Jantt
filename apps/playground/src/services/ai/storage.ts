import type { ProviderAccount, ProviderId } from "./types";

const STORAGE_PREFIX = "jantt_copilot_";

const KEYS = {
  ACTIVE_PROVIDER: `${STORAGE_PREFIX}provider`,
  ACTIVE_ACCOUNT_ID: `${STORAGE_PREFIX}active_account_id`,
  ACCOUNTS: `${STORAGE_PREFIX}accounts`,
  ACTIVE_MODEL_PREFIX: `${STORAGE_PREFIX}model_`,
  CUSTOM_MODELS_PREFIX: `${STORAGE_PREFIX}custom_models_`,
  API_KEY_PREFIX: `${STORAGE_PREFIX}key_`,
  BASE_URL_PREFIX: `${STORAGE_PREFIX}base_url_`,
  PROXY_URL_PREFIX: `${STORAGE_PREFIX}proxy_url_`,
  TEMPERATURE: `${STORAGE_PREFIX}temperature`,
  AUTO_APPLY: `${STORAGE_PREFIX}auto_apply`
} as const;

export const VALID_PROVIDERS: readonly ProviderId[] = [
  "gemini",
  "openai",
  "anthropic",
  "groq",
  "deepseek",
  "openrouter",
  "mistral",
  "xai",
  "ollama",
  "openai-compatible"
];

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

export function getActiveProvider(): ProviderId {
  const storage = getStorage();
  if (!storage) return "gemini";
  const stored = storage.getItem(KEYS.ACTIVE_PROVIDER) as ProviderId | null;
  if (stored && VALID_PROVIDERS.includes(stored)) {
    return stored;
  }
  return "gemini";
}

export function setActiveProvider(provider: ProviderId): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(KEYS.ACTIVE_PROVIDER, provider);
}

export function getApiKey(provider: ProviderId): string {
  const storage = getStorage();
  if (!storage) return "";
  return storage.getItem(`${KEYS.API_KEY_PREFIX}${provider}`) || "";
}

export function setApiKey(provider: ProviderId, key: string): void {
  const storage = getStorage();
  if (!storage) return;
  if (!key.trim()) {
    storage.removeItem(`${KEYS.API_KEY_PREFIX}${provider}`);
  } else {
    storage.setItem(`${KEYS.API_KEY_PREFIX}${provider}`, key.trim());
  }
}

export function getModelForProvider(provider: ProviderId, defaultModel: string): string {
  const storage = getStorage();
  if (!storage) return defaultModel;
  return storage.getItem(`${KEYS.ACTIVE_MODEL_PREFIX}${provider}`) || defaultModel;
}

export function setModelForProvider(provider: ProviderId, modelId: string): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(`${KEYS.ACTIVE_MODEL_PREFIX}${provider}`, modelId);
}

export function getCustomBaseUrl(provider: ProviderId): string {
  const storage = getStorage();
  if (!storage) return "";
  return storage.getItem(`${KEYS.BASE_URL_PREFIX}${provider}`) || "";
}

export function setCustomBaseUrl(provider: ProviderId, url: string): void {
  const storage = getStorage();
  if (!storage) return;
  if (!url.trim()) {
    storage.removeItem(`${KEYS.BASE_URL_PREFIX}${provider}`);
  } else {
    storage.setItem(`${KEYS.BASE_URL_PREFIX}${provider}`, url.trim());
  }
}

export function getProxyUrl(provider: ProviderId): string {
  const storage = getStorage();
  if (!storage) return "";
  return storage.getItem(`${KEYS.PROXY_URL_PREFIX}${provider}`) || "";
}

export function setProxyUrl(provider: ProviderId, url: string): void {
  const storage = getStorage();
  if (!storage) return;
  if (!url.trim()) {
    storage.removeItem(`${KEYS.PROXY_URL_PREFIX}${provider}`);
  } else {
    storage.setItem(`${KEYS.PROXY_URL_PREFIX}${provider}`, url.trim());
  }
}

export function getTemperature(): number {
  const storage = getStorage();
  if (!storage) return 0.2;
  const stored = storage.getItem(KEYS.TEMPERATURE);
  if (!stored) return 0.2;
  const val = parseFloat(stored);
  return isNaN(val) ? 0.2 : Math.max(0, Math.min(1, val));
}

export function setTemperature(val: number): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(KEYS.TEMPERATURE, String(val));
}

export function getAutoApply(): boolean {
  const storage = getStorage();
  if (!storage) return true;
  const stored = storage.getItem(KEYS.AUTO_APPLY);
  if (stored === null) return true; // Default ON for seamless live editing
  return stored === "true";
}

export function setAutoApply(val: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(KEYS.AUTO_APPLY, String(val));
}

export function getCustomModels(provider: ProviderId): string[] {
  const storage = getStorage();
  if (!storage) return [];
  const stored = storage.getItem(`${KEYS.CUSTOM_MODELS_PREFIX}${provider}`);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addCustomModel(provider: ProviderId, modelId: string): void {
  const storage = getStorage();
  if (!storage) return;
  const clean = modelId.trim();
  if (!clean) return;
  const existing = getCustomModels(provider);
  if (!existing.includes(clean)) {
    existing.push(clean);
    storage.setItem(`${KEYS.CUSTOM_MODELS_PREFIX}${provider}`, JSON.stringify(existing));
  }
}

export function isAccountConfigured(account: ProviderAccount): boolean {
  if (!account) return false;
  if (account.providerId === "ollama") {
    return Boolean(account.isExplicit || account.customBaseUrl || (account.apiKey && account.apiKey.trim().length > 0));
  }
  return Boolean(account.apiKey && account.apiKey.trim().length > 0);
}

export function getProviderAccounts(): ProviderAccount[] {
  const storage = getStorage();
  if (!storage) return [];
  const stored = storage.getItem(KEYS.ACCOUNTS);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out phantom unconfigured accounts
        const valid = parsed.filter((a: ProviderAccount) => isAccountConfigured(a));
        if (valid.length > 0) {
          if (valid.length !== parsed.length) {
            storage.setItem(KEYS.ACCOUNTS, JSON.stringify(valid));
          }
          return valid;
        }
        storage.removeItem(KEYS.ACCOUNTS);
      }
    } catch {
      // ignore
    }
  }

  // Only migrate if user ACTUALLY entered a real non-empty API key previously
  const migrated: ProviderAccount[] = [];
  for (const p of VALID_PROVIDERS) {
    if (p === "ollama") continue; // Never auto-migrate ollama without explicit configuration
    const key = getApiKey(p);
    if (key && key.trim().length > 0) {
      migrated.push({
        id: `acc_${p}_migrated`,
        providerId: p,
        label: `${p.charAt(0).toUpperCase() + p.slice(1)} Account`,
        apiKey: key.trim(),
        customBaseUrl: getCustomBaseUrl(p),
        proxyUrl: getProxyUrl(p),
        selectedModelId: getModelForProvider(p, ""),
        isExplicit: true,
        createdAt: Date.now()
      });
    }
  }

  if (migrated.length > 0) {
    storage?.setItem(KEYS.ACCOUNTS, JSON.stringify(migrated));
    return migrated;
  }

  return [];
}

export function saveProviderAccounts(accounts: ProviderAccount[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(KEYS.ACCOUNTS, JSON.stringify(accounts));
}

export function addProviderAccount(data: Omit<ProviderAccount, "id" | "createdAt">): ProviderAccount {
  const accounts = getProviderAccounts();
  const newAccount: ProviderAccount = {
    ...data,
    id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    isExplicit: true,
    createdAt: Date.now()
  };
  accounts.push(newAccount);
  saveProviderAccounts(accounts);
  setActiveAccountId(newAccount.id);
  return newAccount;
}

export function updateProviderAccount(id: string, partial: Partial<ProviderAccount>): void {
  const accounts = getProviderAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], ...partial };
    saveProviderAccounts(accounts);
  }
}

export function deleteProviderAccount(id: string): void {
  const accounts = getProviderAccounts();
  const filtered = accounts.filter((a) => a.id !== id);
  saveProviderAccounts(filtered);
  const activeId = getActiveAccountId();
  if (activeId === id) {
    if (filtered.length > 0) {
      setActiveAccountId(filtered[0].id);
    } else {
      const storage = getStorage();
      storage?.removeItem(KEYS.ACTIVE_ACCOUNT_ID);
    }
  }
}

export function getActiveAccountId(): string {
  const storage = getStorage();
  if (!storage) return "";
  const stored = storage.getItem(KEYS.ACTIVE_ACCOUNT_ID);
  if (stored) return stored;
  const accounts = getProviderAccounts();
  if (accounts.length > 0) {
    return accounts[0].id;
  }
  return "";
}

export function setActiveAccountId(id: string): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(KEYS.ACTIVE_ACCOUNT_ID, id);
}

export function getConfiguredAccounts(): ProviderAccount[] {
  return getProviderAccounts().filter(isAccountConfigured);
}

export function hasAnyApiKey(): boolean {
  return getConfiguredAccounts().length > 0;
}

export function clearAllCopilotStorage(): void {
  const storage = getStorage();
  if (!storage) return;
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => storage.removeItem(k));
}

