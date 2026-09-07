import { IStorageService } from "./storage-contracts";
import { LocalStorageService } from "./local-storage-service";
import { MemoryStorageService } from "./memory-storage-service";

export * from "./storage-contracts";
export * from "./local-storage-service";
export * from "./memory-storage-service";

/**
 * Factory function to create storage instances based on environment or configuration.
 */
export function createStorageService(type: "local" | "memory" = "local"): IStorageService {
  if (type === "memory" || typeof window === "undefined") {
    return new MemoryStorageService();
  }
  return new LocalStorageService();
}

/**
 * Default global composition root instance of IStorageService for the playground application.
 */
export const storageService: IStorageService = createStorageService("local");
