import { IStorageService } from "./storage-contracts";

/**
 * Robust browser localStorage implementation with:
 * - Silent error handling for private browsing / quota restrictions
 * - Transparent in-memory fallback cache (always newer than localStorage when present)
 * - Automatic JSON serialization and deserialization
 * - Durable-write reporting: `setItem` returns false when a value only reached memory
 */
export class LocalStorageService implements IStorageService {
  private fallbackMemory = new Map<string, string>();
  private isLocalStorageAvailable: boolean;

  constructor() {
    this.isLocalStorageAvailable = this.checkAvailability();
  }

  /**
   * Probes read access only. A write probe would fail whenever the quota is already full and
   * hide every saved plan exactly when the user most needs to see (and export or delete) them;
   * write failures are reported per call by `setItem` instead.
   */
  private checkAvailability(): boolean {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      window.localStorage.getItem("__jantt_storage_test__");
      return true;
    } catch {
      // Access itself is blocked (e.g. cookies disabled)
      return false;
    }
  }

  public getItem<T = string>(key: string): T | null {
    if (!key) return null;

    let raw: string | null = null;
    // A fallback entry only exists after a failed durable write, so it is always the
    // most recent value for this key and must win over the stale localStorage copy.
    if (this.fallbackMemory.has(key)) {
      raw = this.fallbackMemory.get(key) ?? null;
    } else if (this.isLocalStorageAvailable) {
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        raw = null;
      }
    }

    if (raw === null || raw === undefined) return null;

    try {
      // If it looks like a serialized JSON object/array/boolean/number, parse it
      if (
        (raw.startsWith("{") && raw.endsWith("}")) ||
        (raw.startsWith("[") && raw.endsWith("]")) ||
        raw === "true" ||
        raw === "false" ||
        raw === "null"
      ) {
        return JSON.parse(raw) as T;
      }
      return raw as unknown as T;
    } catch {
      return raw as unknown as T;
    }
  }

  public setItem<T = unknown>(key: string, value: T): boolean {
    if (!key) return false;

    const raw = typeof value === "string" ? value : JSON.stringify(value);

    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.setItem(key, raw);
        // The durable copy is now authoritative again
        this.fallbackMemory.delete(key);
        return true;
      } catch {
        // Quota exceeded or private browsing restricted; keep the newest value in memory
      }
    }
    this.fallbackMemory.set(key, raw);
    return false;
  }

  public removeItem(key: string): void {
    if (!key) return;
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
    this.fallbackMemory.delete(key);
  }

  public clear(): void {
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore
      }
    }
    this.fallbackMemory.clear();
  }

  public hasItem(key: string): boolean {
    return this.getItem(key) !== null;
  }

  public keys(prefix = ""): string[] {
    const found = new Set<string>();
    if (this.isLocalStorageAvailable) {
      try {
        const storage = window.localStorage;
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key !== null && key.startsWith(prefix)) found.add(key);
        }
      } catch {
        // intentionally ignored: enumeration blocked, the session-only keys below still count
      }
    }
    this.fallbackMemory.forEach((_value, key) => {
      if (key.startsWith(prefix)) found.add(key);
    });
    return [...found];
  }

  public estimateSize(prefix = ""): number {
    let total = 0;
    for (const key of this.keys(prefix)) {
      let raw: string | null | undefined = this.fallbackMemory.get(key);
      if (raw === undefined && this.isLocalStorageAvailable) {
        try {
          raw = window.localStorage.getItem(key);
        } catch {
          raw = null;
        }
      }
      total += key.length + (raw?.length || 0);
    }
    return total;
  }
}
