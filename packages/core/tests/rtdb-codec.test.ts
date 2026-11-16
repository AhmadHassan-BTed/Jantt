import { describe, it, expect } from "vitest";
import {
  encodeRtdbKey,
  decodeRtdbKey,
  encodePlanForRtdb,
  decodePlanFromRtdb
} from "../src/firebase-sync";
import { calculatePlanHash } from "../src/reconciler";
import type { JanttData } from "../src/types";

/** Firebase RTDB key constraints: non-empty, at most 768 bytes, none of . # $ / [ ] or ASCII control chars. */
function isValidRtdbKey(key: string): boolean {
  return key.length > 0 && new TextEncoder().encode(key).length <= 768 && !/[.#$/\[\]\u0000-\u001f\u007f]/.test(key);
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!Array.isArray(value)) keys.push(key);
      collectKeys(item, keys);
    }
  }
  return keys;
}

/**
 * What a value looks like after an RTDB write and read: JSON only, and null or empty
 * arrays/objects are not stored. (Arrays with holes are compacted here, a simplification.)
 */
function rtdbRoundtrip<T>(value: T): T {
  const prune = (item: unknown): unknown => {
    if (item === null || item === undefined) return null;
    if (Array.isArray(item)) {
      const kept = item.map(prune).filter((entry) => entry !== null);
      return kept.length > 0 ? kept : null;
    }
    if (typeof item === "object") {
      const kept = Object.entries(item as Record<string, unknown>)
        .map(([key, entry]) => [key, prune(entry)] as const)
        .filter(([, entry]) => entry !== null);
      return kept.length > 0 ? Object.fromEntries(kept) : null;
    }
    return item;
  };
  return prune(JSON.parse(JSON.stringify(value))) as T;
}

describe("Firebase Realtime Database Key Codec", () => {
  it("encodes $schema to a valid key and keeps decoding legacy '__schema' storage", () => {
    const encoded = encodeRtdbKey("$schema");
    expect(isValidRtdbKey(encoded)).toBe(true);
    expect(decodeRtdbKey(encoded)).toBe("$schema");
    // Rooms written by earlier releases store the schema URL under "__schema".
    expect(decodeRtdbKey("__schema")).toBe("$schema");
  });

  it("encodes all Firebase forbidden characters: . # $ / [ ]", () => {
    const complexKey = "category.sub/item#1[$tag]";
    const encoded = encodeRtdbKey(complexKey);

    // Verify none of the forbidden characters exist in the encoded key
    expect(encoded).not.toMatch(/[.#$/\[\]]/);

    // Verify exact roundtrip
    const decoded = decodeRtdbKey(encoded);
    expect(decoded).toBe(complexKey);
  });

  it("handles escape character ~ safely without collisions", () => {
    const keyWithTilde = "normal~key~0with~dchars";
    const encoded = encodeRtdbKey(keyWithTilde);
    const decoded = decodeRtdbKey(encoded);
    expect(decoded).toBe(keyWithTilde);
  });

  it("never maps two distinct keys to the same stored key", () => {
    const trickyKeys = [
      "$schema",
      "__schema",
      "$",
      "~",
      "~0",
      "~d",
      "~p",
      "~u",
      "~b1x~b2",
      "a.b",
      "a~pb",
      "[x]",
      "#",
      "/",
      "plain_key",
      "with space"
    ];
    const encodedKeys = trickyKeys.map(encodeRtdbKey);

    expect(new Set(encodedKeys).size).toBe(trickyKeys.length);
    encodedKeys.forEach((encoded, i) => {
      expect(isValidRtdbKey(encoded)).toBe(true);
      expect(decodeRtdbKey(encoded)).toBe(trickyKeys[i]);
    });
  });

  it("encodes a full JanttData plan so no object key violates Firebase rules", () => {
    const samplePlan: JanttData = {
      $schema: "https://jantt.dev/schema/v1.json",
      meta: {
        title: "Test Plan for RTDB",
        customFields: {
          "security.level": "high",
          "team/squad": "infra",
          "tag#priority": "critical"
        }
      } as any,
      categories: {
        "dev.ops": { name: "DevOps", color: "#3B82F6" },
        "front/end": { name: "Frontend", color: "#10B981" }
      },
      tasks: [
        {
          id: "T1",
          name: "Setup RTDB",
          category: "dev.ops",
          startDate: "2026-09-01",
          endDate: "2026-09-05",
          progress: 50
        }
      ]
    };

    const encoded = encodePlanForRtdb(samplePlan);

    expect((encoded as any).$schema).toBeUndefined();
    for (const key of collectKeys(encoded)) {
      expect(isValidRtdbKey(key)).toBe(true);
    }

    // Verify exact roundtrip decoding restores all original keys
    const decoded = decodePlanFromRtdb(encoded);
    expect(decoded).toEqual(samplePlan);
    expect(decoded.$schema).toBe("https://jantt.dev/schema/v1.json");
    expect((decoded.meta as any).customFields["security.level"]).toBe("high");
    expect(decoded.categories!["dev.ops"].name).toBe("DevOps");

    // Verify content hash is 100% identical after roundtrip
    expect(calculatePlanHash(decoded)).toBe(calculatePlanHash(samplePlan));
  });

  it("keeps every non-empty value through a real RTDB write/read cycle", () => {
    const plan: JanttData = {
      $schema: "https://jantt.dev/schema/v1.json",
      meta: { title: "Stored Plan", customFields: { "cost.center": "R&D" } } as any,
      categories: { "dev.ops": { name: "DevOps", color: "#3B82F6" } },
      notes: [],
      tasks: [
        { id: "T1", name: "Spec", category: "dev.ops", start: "2026-09-01", end: "2026-09-03", dependsOn: [] } as any,
        { id: "T2", name: "Build", start: "2026-09-04", end: "2026-09-10", dependsOn: ["T1"] } as any
      ]
    };

    const stored = rtdbRoundtrip(encodePlanForRtdb(plan));
    for (const key of collectKeys(stored)) {
      expect(isValidRtdbKey(key)).toBe(true);
    }

    const decoded = decodePlanFromRtdb(stored);
    expect(decoded.$schema).toBe(plan.$schema);
    expect((decoded.meta as any).customFields["cost.center"]).toBe("R&D");
    expect(decoded.categories!["dev.ops"]).toEqual({ name: "DevOps", color: "#3B82F6" });
    expect(decoded.tasks.map((t) => t.id)).toEqual(["T1", "T2"]);
    expect((decoded.tasks[1] as any).dependsOn).toEqual(["T1"]);
    // RTDB drops empty collections; readers must treat a missing list as empty.
    expect(decoded.notes ?? []).toEqual([]);
    // Saves compare hashes, so the dropped `dependsOn: []` must not change the stored plan's hash.
    expect(calculatePlanHash(decoded)).toBe(calculatePlanHash(plan));
  });

  it("restores plan collections that RTDB returns as index-keyed objects, with holes, or not at all", () => {
    const task = (id: string) => ({ id, name: id, start: "2026-09-01", end: "2026-09-02" });
    // Deleting tasks/1 leaves the other indexes in place, so RTDB returns an object.
    const sparse = decodePlanFromRtdb({ meta: { title: "Sparse" }, tasks: { "2": task("T3"), "0": task("T1") } } as any);
    expect(sparse.tasks.map((t: any) => t.id)).toEqual(["T1", "T3"]);
    const holes = decodePlanFromRtdb({ meta: { title: "Holes" }, tasks: [task("T1"), null, task("T3")] } as any);
    expect(holes.tasks.map((t: any) => t.id)).toEqual(["T1", "T3"]);
    // A plan whose tasks were all deleted is stored without `tasks`.
    expect(decodePlanFromRtdb({ meta: { title: "Empty" } } as any).tasks).toEqual([]);
    // Only plans are reshaped: a room payload keeps its own shape.
    expect(decodePlanFromRtdb({ meta: { title: "Room" }, data: { tasks: {} } } as any)).not.toHaveProperty("tasks");
  });

  it("drops __proto__ keys instead of replacing prototypes", () => {
    const hostile = JSON.parse('{"meta":{"title":"x","__proto__":{"polluted":true}},"tasks":[],"__proto__":{"polluted":true}}');
    for (const out of [encodePlanForRtdb(hostile), decodePlanFromRtdb(hostile)] as any[]) {
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(out.meta)).toBe(Object.prototype);
      expect(Object.keys(out)).not.toContain("__proto__");
      expect(out.polluted).toBeUndefined();
      expect(out.meta.polluted).toBeUndefined();
    }
    expect(({} as any).polluted).toBeUndefined();
  });

  it("handles null, undefined, and non-object inputs safely", () => {
    expect(encodePlanForRtdb(null)).toBeNull();
    expect(encodePlanForRtdb(undefined)).toBeUndefined();
    expect(encodePlanForRtdb("string" as any)).toBe("string");
    expect(encodePlanForRtdb(42 as any)).toBe(42);

    expect(decodePlanFromRtdb(null)).toBeNull();
    expect(decodePlanFromRtdb(undefined)).toBeUndefined();
  });
});
