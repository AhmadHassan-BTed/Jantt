/**
 * Abstract key-value storage contract for client-side persistence.
 * Shields application and domain layers from direct browser localStorage coupling.
 */
export interface IStorageService {
  getItem<T = string>(key: string): T | null;
  setItem<T = unknown>(key: string, value: T): void;
  removeItem(key: string): void;
  clear(): void;
  hasItem(key: string): boolean;
}
