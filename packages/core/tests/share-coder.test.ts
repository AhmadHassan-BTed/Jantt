import { describe, it, expect } from "vitest";
import {
  cleanPlanForSharing,
  compressPlanToUrlPayload,
  decompressPlanFromUrlPayload,
  uint8ToBase64Url,
  base64UrlToUint8
} from "../src/share-coder";
import type { JanttData } from "../src/types";

describe("share-coder", () => {
  const mockPlan: JanttData = {
    meta: {
      title: "Sprint Alpha",
      revision: 4,
      sync: { revision: 4, contentHash: "abc", updatedAt: "2026-09-05T00:00:00Z" } as any,
      tombstones: { "old-task": { deletedAt: "2026-08-01T00:00:00Z" } }
    },
    categories: {
      dev: { label: "Development", color: "#38BDF8" }
    },
    tasks: [
      {
        id: "t1",
        label: "Architecture & Schema",
        start: "2026-09-01",
        end: "2026-09-05",
        progress: 0.5,
        category: "dev",
        status: "in_progress",
        fieldTimestamps: {
          label: "2026-09-05T12:00:00Z#peer-abc",
          start: "2026-09-05T12:00:00Z#peer-abc"
        },
        updatedBy: "peer-abc"
      },
      {
        id: "t2",
        label: "Deleted Task",
        start: "2026-09-06",
        end: "2026-09-07",
        progress: 0,
        category: "dev",
        _deleted: true,
        deletedAt: "2026-09-05T12:00:00Z"
      },
      {
        id: "t3",
        label: "Unstarted Task",
        start: "2026-09-08",
        end: "2026-09-12",
        progress: 0,
        category: "dev",
        status: "todo",
        dependencies: []
      }
    ],
    notes: [],
    milestones: []
  };

  it("cleans sync metadata, tombstones, and default values to minimize size", () => {
    const cleaned = cleanPlanForSharing(mockPlan);

    // Sync metadata and tombstones pruned
    expect(cleaned.meta?.sync).toBeUndefined();
    expect(cleaned.meta?.tombstones).toBeUndefined();

    // Soft-deleted task omitted
    expect(cleaned.tasks).toHaveLength(2);
    expect(cleaned.tasks.find((t) => t.id === "t2")).toBeUndefined();

    // Per-field CRDT timestamps removed
    const t1 = cleaned.tasks.find((t) => t.id === "t1")!;
    expect(t1.fieldTimestamps).toBeUndefined();
    expect((t1 as any).updatedBy).toBeUndefined();

    // Default values pruned on t3
    const t3 = cleaned.tasks.find((t) => t.id === "t3")!;
    expect(t3.progress).toBeUndefined();
    expect(t3.status).toBeUndefined();
    expect(t3.dependencies).toBeUndefined();

    // Empty collections pruned
    expect(cleaned.notes).toBeUndefined();
    expect(cleaned.milestones).toBeUndefined();
  });

  it("compresses plan into a compact 'z~' prefixed base64url payload", () => {
    const payload = compressPlanToUrlPayload(mockPlan);
    expect(payload.startsWith("z~")).toBe(true);

    // Compresses to significantly smaller than raw uncompressed JSON base64
    const rawB64 = uint8ToBase64Url(new TextEncoder().encode(JSON.stringify(mockPlan)));
    expect(payload.length).toBeLessThan(rawB64.length);
  });

  it("decompresses compressed payload with 100% round-trip fidelity", () => {
    const payload = compressPlanToUrlPayload(mockPlan);
    const restored = decompressPlanFromUrlPayload(payload);

    expect(restored).not.toBeNull();
    expect(restored?.meta?.title).toBe("Sprint Alpha");
    expect(restored?.tasks).toHaveLength(2);
    expect(restored?.tasks[0].id).toBe("t1");
    expect(restored?.tasks[0].label).toBe("Architecture & Schema");
  });

  it("supports decoding legacy uncompressed base64url links for backward compatibility", () => {
    const rawJson = JSON.stringify({
      meta: { title: "Legacy Plan" },
      tasks: [
        {
          id: "legacy-1",
          label: "Legacy Task",
          start: "2026-09-01",
          end: "2026-09-03",
          progress: 1.0,
          category: "general"
        }
      ]
    });

    const legacyPayload = uint8ToBase64Url(new TextEncoder().encode(rawJson));
    expect(legacyPayload.startsWith("z~")).toBe(false);

    const decoded = decompressPlanFromUrlPayload(legacyPayload);
    expect(decoded).not.toBeNull();
    expect(decoded?.meta?.title).toBe("Legacy Plan");
    expect(decoded?.tasks[0].id).toBe("legacy-1");
  });

  it("handles multi-byte unicode characters properly", () => {
    const unicodePlan: JanttData = {
      meta: { title: "Planificación Internacional 🚀 & 日本語 & عربي" },
      tasks: [
        {
          id: "t-uni",
          label: "Diseño & Développement & 开发",
          start: "2026-09-01",
          end: "2026-09-05",
          progress: 0.5,
          category: "design"
        }
      ]
    };

    const payload = compressPlanToUrlPayload(unicodePlan);
    const decoded = decompressPlanFromUrlPayload(payload);
    expect(decoded?.meta?.title).toBe("Planificación Internacional 🚀 & 日本語 & عربي");
    expect(decoded?.tasks[0].label).toBe("Diseño & Développement & 开发");
  });

  it("returns null on invalid or corrupted payloads without throwing", () => {
    expect(decompressPlanFromUrlPayload("")).toBeNull();
    expect(decompressPlanFromUrlPayload("not-valid-base64!!!")).toBeNull();
    expect(decompressPlanFromUrlPayload("z~corrupted_deflate_stream_bytes")).toBeNull();
  });
});
