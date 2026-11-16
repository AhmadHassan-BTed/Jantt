import { IStorageService } from "./storage-contracts";

/**
 * Pure in-memory implementation of IStorageService.
 * Ideal for unit testing, server-side rendering, and sandboxed isolated environments.
 */
export class MemoryStorageService implements IStorageService {
  private store = new Map<string, string>();

  public getItem<T = string>(key: string): T | null {
    const raw = this.store.get(key);
    if (raw === undefined || raw === null) return null;

    try {
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
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    this.store.set(key, raw);
    return true;
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  public hasItem(key: string): boolean {
    return this.store.has(key);
  }

  public keys(prefix = ""): string[] {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix));
  }

  public estimateSize(prefix = ""): number {
    let total = 0;
    this.store.forEach((raw, key) => {
      if (key.startsWith(prefix)) total += key.length + raw.length;
    });
    return total;
  }
}
