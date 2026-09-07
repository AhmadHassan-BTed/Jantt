import { IStorageService } from "./storage-contracts";

/**
 * Robust browser localStorage implementation with:
 * - Silent error handling for private browsing / quota restrictions
 * - Transparent in-memory fallback cache
 * - Automatic JSON serialization and deserialization
 */
export class LocalStorageService implements IStorageService {
  private fallbackMemory = new Map<string, string>();
  private isLocalStorageAvailable: boolean;

  constructor() {
    this.isLocalStorageAvailable = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    try {
      const testKey = "__jantt_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  public getItem<T = string>(key: string): T | null {
    if (!key) return null;

    let raw: string | null = null;
    if (this.isLocalStorageAvailable) {
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        raw = this.fallbackMemory.get(key) || null;
      }
    } else {
      raw = this.fallbackMemory.get(key) || null;
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

  public setItem<T = unknown>(key: string, value: T): void {
    if (!key) return;

    const raw = typeof value === "string" ? value : JSON.stringify(value);

    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Quota exceeded or private browsing restricted; store in resilient in-memory fallback
        this.fallbackMemory.set(key, raw);
      }
    } else {
      this.fallbackMemory.set(key, raw);
    }
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
}
