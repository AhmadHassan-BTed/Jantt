/**
 * Abstract key-value storage contract for client-side persistence.
 * Every playground read and write of browser storage goes through it, so quota failures are
 * reported in one way and tests can swap in an in-memory store.
 */
export interface IStorageService {
  getItem<T = string>(key: string): T | null;
  /**
   * Persists a value. Strings are stored as-is (a pre-serialized JSON string is read back
   * parsed); anything else is JSON-serialized.
   * Returns `false` when the value could not be written durably (quota exceeded, storage
   * blocked or unavailable). The value is then kept in memory for the current session only,
   * so callers must surface the failure instead of reporting the data as saved.
   */
  setItem<T = unknown>(key: string, value: T): boolean;
  removeItem(key: string): void;
  clear(): void;
  hasItem(key: string): boolean;
  /** Every stored key (durable and session-only), optionally limited to a prefix. */
  keys(prefix?: string): string[];
  /** Approximate storage used by keys with this prefix, in UTF-16 code units (keys + values). */
  estimateSize(prefix?: string): number;
}
