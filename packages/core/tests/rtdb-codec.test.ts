import { describe, it, expect } from "vitest";
import {
  encodeRtdbKey,
  decodeRtdbKey,
  encodePlanForRtdb,
  decodePlanFromRtdb
} from "../src/firebase-sync";
import { calculatePlanHash } from "../src/reconciler";
import type { JanttData } from "../src/types";

describe("Firebase Realtime Database Key Codec", () => {
  it("encodes and decodes $schema reliably", () => {
    const encoded = encodeRtdbKey("$schema");
    expect(encoded).toBe("__schema");
    expect(decodeRtdbKey(encoded)).toBe("$schema");
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

    // Verify $schema is replaced
    expect((encoded as any).$schema).toBeUndefined();
    expect((encoded as any).__schema).toBe("https://jantt.dev/schema/v1.json");

    // Recursively check all keys in encoded object
    function verifyNoForbiddenKeys(obj: any) {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach(verifyNoForbiddenKeys);
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        expect(k).not.toMatch(/[.#$/\[\]]/);
        verifyNoForbiddenKeys(v);
      }
    }
    verifyNoForbiddenKeys(encoded);

    // Verify exact roundtrip decoding restores all original keys
    const decoded = decodePlanFromRtdb(encoded);
    expect(decoded).toEqual(samplePlan);
    expect(decoded.$schema).toBe("https://jantt.dev/schema/v1.json");
    expect((decoded.meta as any).customFields["security.level"]).toBe("high");
    expect(decoded.categories!["dev.ops"].name).toBe("DevOps");

    // Verify content hash is 100% identical after roundtrip
    expect(calculatePlanHash(decoded)).toBe(calculatePlanHash(samplePlan));
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
