import { describe, it, expect } from "vitest";
import { deflateSync, inflateSync, strToU8 } from "fflate";
import {
  cleanPlanForSharing,
  compressPlanToUrlPayload,
  decompressPlanFromUrlPayload,
  sanitizePlanForJson,
  uint8ToBase64Url,
  base64UrlToUint8,
  MAX_SHARE_PAYLOAD_LENGTH,
  MAX_SHARE_INFLATED_BYTES,
  MAX_SHARE_TASKS
} from "../src/share-coder";
import { calculatePlanHash } from "../src/reconciliation";
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
        status: "not-started",
        gapDays: 0,
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
    // A zero gap differs from "use the project default gap", so it is kept
    expect(t3.gapDays).toBe(0);

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

  it("round-trips a compressed payload", () => {
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

  it("rejects decompression bombs and oversized payloads quickly", () => {
    // 50 MB of zeros (ten times the 5 MB cap) deflates to about 50 KB
    const bomb = `z~${uint8ToBase64Url(deflateSync(new Uint8Array(50 * 1024 * 1024)))}`;
    const started = Date.now();
    expect(decompressPlanFromUrlPayload(bomb)).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);

    // Just over the cap is rejected as well
    const justOver = `z~${uint8ToBase64Url(deflateSync(new Uint8Array(MAX_SHARE_INFLATED_BYTES + 1)))}`;
    expect(decompressPlanFromUrlPayload(justOver)).toBeNull();

    expect(decompressPlanFromUrlPayload("A".repeat(MAX_SHARE_PAYLOAD_LENGTH + 1))).toBeNull();
  });

  it(`rejects shared plans with more than ${MAX_SHARE_TASKS} tasks`, () => {
    const tasks = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `t${i}`, label: "T", category: "c", start: "2026-09-01", end: "2026-09-02" }));
    const link = (count: number) =>
      `z~${uint8ToBase64Url(deflateSync(strToU8(JSON.stringify({ meta: { title: "Big" }, tasks: tasks(count) }))))}`;
    expect(decompressPlanFromUrlPayload(link(MAX_SHARE_TASKS))?.tasks).toHaveLength(MAX_SHARE_TASKS);
    expect(decompressPlanFromUrlPayload(link(MAX_SHARE_TASKS + 1))).toBeNull();
  });

  it("drops '__proto__' keys at every depth of a decoded link", () => {
    const json =
      '{"__proto__":{"polluted":true},"meta":{"title":"P","__proto__":{"locked":true}},' +
      '"tasks":[{"id":"t1","label":"T","category":"c","start":"2026-09-01","end":"2026-09-02",' +
      '"__proto__":{"color":"red"},"fields":{"__proto__":{"x":1},"risk":"high"}}]}';
    const decoded: any = decompressPlanFromUrlPayload(`z~${uint8ToBase64Url(deflateSync(strToU8(json)))}`);

    expect(decoded).not.toBeNull();
    for (const value of [decoded, decoded.meta, decoded.tasks[0], decoded.tasks[0].fields]) {
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(value, "__proto__")).toBe(false);
    }
    expect(decoded.tasks[0].fields).toEqual({ risk: "high" });
    // A later copy by assignment cannot pick up a planted prototype
    const copy: any = Object.assign({}, decoded.tasks[0]);
    expect(copy.color).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });

  it("never puts account ids, secrets or sync bookkeeping into a link", () => {
    const withIds: any = {
      uid: "root-uid",
      meta: { title: "P", ownerUid: "owner", secretKey: "sec_x", revision: 9, contentHash: "abc", updatedAt: "2026-09-05T00:00:00Z" },
      tasks: [{ id: "t1", label: "T", category: "c", start: "2026-09-01", end: "2026-09-02", firebaseUid: "f" }],
      notes: [{ id: "n1", title: "N", content: "C", peerId: "p" }],
      people: [{ id: "p1", name: "Ana", uid: "ana-uid" }]
    };
    const cleaned: any = cleanPlanForSharing(withIds);
    expect(cleaned.uid).toBeUndefined();
    expect(cleaned.meta).toEqual({ title: "P" });
    expect(cleaned.tasks[0].firebaseUid).toBeUndefined();
    expect(cleaned.notes[0].peerId).toBeUndefined();
    expect(cleaned.people[0]).toEqual({ id: "p1", name: "Ana" });

    const link = compressPlanToUrlPayload(withIds);
    const text = new TextDecoder().decode(inflateSync(base64UrlToUint8(link.slice(2))));
    for (const secret of ["root-uid", "owner", "sec_x", "ana-uid"]) expect(text).not.toContain(secret);
  });

  it("strips sync metadata from inbound links so they cannot poison merges", () => {
    const crafted = {
      meta: {
        title: "Crafted",
        tombstones: { t9: { deletedAt: "9999-12-31T00:00:00.000Z", entityType: "task" } },
        sync: { revision: 1, contentHash: "x", updatedAt: "9999-12-31T00:00:00.000Z" }
      },
      tasks: [
        {
          id: "t1",
          label: "Task",
          category: "general",
          start: "2026-09-01",
          end: "2026-09-02",
          fieldTimestamps: { label: "9999-12-31T00:00:00.000Z#evil" },
          updatedAt: "9999-12-31T00:00:00.000Z"
        },
        { id: "t2", label: "Gone", category: "general", start: "2026-09-01", end: "2026-09-02", _deleted: true }
      ],
      notes: [{ id: "n1", title: "N", content: "C", fieldTimestamps: { title: "9999-01-01T00:00:00Z" } }]
    };
    const link = `z~${uint8ToBase64Url(deflateSync(strToU8(JSON.stringify(crafted))))}`;
    const decoded = decompressPlanFromUrlPayload(link)!;

    expect(decoded.meta?.tombstones).toBeUndefined();
    expect(decoded.meta?.sync).toBeUndefined();
    expect(decoded.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(decoded.tasks[0].fieldTimestamps).toBeUndefined();
    expect(decoded.tasks[0].updatedAt).toBeUndefined();
    expect(decoded.notes?.[0].fieldTimestamps).toBeUndefined();
  });

  it("decodes to a plan with the same content hash as the shared original", () => {
    const decoded = decompressPlanFromUrlPayload(compressPlanToUrlPayload(mockPlan));
    expect(calculatePlanHash(decoded)).toBe(calculatePlanHash(mockPlan));
  });
});

describe("sanitizePlanForJson", () => {
  it("strips internal ids at record level only and tolerates malformed people", () => {
    const plan: any = {
      uid: "root-uid",
      meta: { title: "P", ownerUid: "o", sync: { revision: 1, contentHash: "", updatedAt: "", clientId: "alex", peerId: "x" } },
      tasks: [
        {
          id: "t1",
          label: "T",
          category: "c",
          start: "2026-09-01",
          end: "2026-09-02",
          secret: "s",
          updatedBy: "sam",
          fields: { uid: "customer-uid-field", peerId: "user value" }
        }
      ],
      people: [
        { id: "p1", name: "Ana", username: 42, uid: "firebase" },
        { id: "p2", name: "Bo", username: "bo" }
      ]
    };

    let sanitized: any;
    expect(() => (sanitized = sanitizePlanForJson(plan))).not.toThrow();
    expect(sanitized.uid).toBeUndefined();
    expect(sanitized.meta.ownerUid).toBeUndefined();
    expect(sanitized.meta.sync.peerId).toBeUndefined();
    expect(sanitized.meta.sync.clientId).toBe("@alex");
    expect(sanitized.tasks[0].secret).toBeUndefined();
    expect(sanitized.tasks[0].updatedBy).toBe("@sam");
    expect(sanitized.tasks[0].fields).toEqual({ uid: "customer-uid-field", peerId: "user value" });
    expect(sanitized.people[0].uid).toBeUndefined();
    expect(sanitized.people[0].username).toBe(42);
    expect(sanitized.people[1].username).toBe("@bo");
  });

  it("never turns a '__proto__' key into a prototype", () => {
    const plan = JSON.parse(
      '{"__proto__":{"polluted":true},"meta":{"title":"P"},"tasks":[{"id":"t1","label":"T","category":"c","start":"2026-09-01","end":"2026-09-02","__proto__":{"label":"hidden"}}]}'
    );
    const sanitized: any = sanitizePlanForJson(plan);
    expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
    expect(sanitized.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(sanitized.tasks[0])).toBe(Object.prototype);
    expect(sanitized.tasks[0].label).toBe("T");
  });
});
