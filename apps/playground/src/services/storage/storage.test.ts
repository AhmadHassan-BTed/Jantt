import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageService } from "./memory-storage-service";
import { LocalStorageService } from "./local-storage-service";

describe("Storage Services", () => {
  describe("MemoryStorageService", () => {
    let service: MemoryStorageService;

    beforeEach(() => {
      service = new MemoryStorageService();
    });

    it("stores and retrieves primitive values", () => {
      service.setItem("foo", "bar");
      expect(service.getItem("foo")).toBe("bar");
      expect(service.hasItem("foo")).toBe(true);
    });

    it("stores and automatically deserializes JSON objects", () => {
      const payload = { a: 1, b: "two", c: [true, false] };
      service.setItem("obj", payload);
      expect(service.getItem("obj")).toEqual(payload);
    });

    it("returns null for nonexistent keys", () => {
      expect(service.getItem("nonexistent")).toBeNull();
      expect(service.hasItem("nonexistent")).toBe(false);
    });

    it("removes items and clears cleanly", () => {
      service.setItem("k1", "v1");
      service.setItem("k2", "v2");
      service.removeItem("k1");
      expect(service.getItem("k1")).toBeNull();
      expect(service.getItem("k2")).toBe("v2");
      service.clear();
      expect(service.getItem("k2")).toBeNull();
    });
  });

  describe("LocalStorageService", () => {
    it("safely falls back to in-memory store if localStorage is unavailable", () => {
      const service = new LocalStorageService();
      service.setItem("test-key", { hello: "world" });
      expect(service.getItem("test-key")).toEqual({ hello: "world" });
      service.removeItem("test-key");
      expect(service.getItem("test-key")).toBeNull();
    });
  });
});
