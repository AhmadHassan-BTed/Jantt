// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { STORAGE_KEYS } from "./constants";
import { storageService } from "./services/storage";
import {
  isValidRoomId,
  normalizeRoomId,
  parseRoomLink,
  readRoomDeepLink,
  hashHasRoomSecret,
  buildRoomViewerUrl,
  getTrustedAvatarUrl,
  getStoredRoomSecret,
  removeRoomSecret,
  getTabInstanceId
} from "./room-storage";

describe("room ids", () => {
  it("accepts generated room ids", () => {
    expect(isValidRoomId("room_0a1b2c3d4e")).toBe(true);
    expect(isValidRoomId("room-0a1b2c3d4e")).toBe(true);
    expect(isValidRoomId("team-alpha")).toBe(true);
  });

  it("rejects ids that would address another database path or are malformed", () => {
    for (const id of ["room_x/members/uid", "room.x", "room#x", "room$x", "room[x]", "__proto__", "_room", "ab", "a".repeat(65), "", " room_x"]) {
      expect(isValidRoomId(id)).toBe(false);
    }
    expect(isValidRoomId(undefined)).toBe(false);
    expect(isValidRoomId(42)).toBe(false);
  });

  it("normalizes case and whitespace", () => {
    expect(normalizeRoomId("  Room_ABC123  ")).toBe("room_abc123");
    expect(normalizeRoomId("room/data")).toBeNull();
  });
});

describe("parseRoomLink", () => {
  it("reads bare ids and share links", () => {
    expect(parseRoomLink("room_ab12cd34ef")).toBe("room_ab12cd34ef");
    expect(parseRoomLink("https://jantt.dev/app/?room=room_ab12cd34ef&view=gantt")).toBe("room_ab12cd34ef");
    expect(parseRoomLink("?cloud=room-legacy01")).toBe("room-legacy01");
  });

  it("ignores legacy keys in the hash and only returns the room", () => {
    expect(parseRoomLink("https://jantt.dev/?room=room_ab12cd34ef#key=sec_123")).toBe("room_ab12cd34ef");
  });

  it("returns null instead of throwing for invalid input", () => {
    expect(parseRoomLink("")).toBeNull();
    expect(parseRoomLink("not a link")).toBeNull();
    expect(parseRoomLink("https://jantt.dev/?room=%E0%A4%A")).toBeNull();
    expect(parseRoomLink("https://jantt.dev/?room=room_ab/data")).toBeNull();
    expect(parseRoomLink("https://jantt.dev/?view=gantt")).toBeNull();
  });
});

describe("readRoomDeepLink", () => {
  it("returns null without a room parameter", () => {
    expect(readRoomDeepLink("?view=gantt")).toBeNull();
    expect(readRoomDeepLink("")).toBeNull();
  });

  it("returns the normalized id, or a null id for an invalid one", () => {
    expect(readRoomDeepLink("?room=Room_AB12CD")).toEqual({ raw: "Room_AB12CD", roomId: "room_ab12cd" });
    expect(readRoomDeepLink("?cloud=room-legacy01")).toEqual({ raw: "room-legacy01", roomId: "room-legacy01" });
    expect(readRoomDeepLink("?room=r%2Fdata")).toEqual({ raw: "r/data", roomId: null });
  });
});

describe("links", () => {
  it("detects legacy credentials in the hash", () => {
    expect(hashHasRoomSecret("#key=abc")).toBe(true);
    expect(hashHasRoomSecret("#data=xyz&edit=1")).toBe(true);
    expect(hashHasRoomSecret("#data=xyz")).toBe(false);
    expect(hashHasRoomSecret("#monkey=1")).toBe(false);
  });

  it("builds a credential-free room link with encoded, optional view and theme", () => {
    const link = new URL(buildRoomViewerUrl("room_ab12cd34ef", "kanban", "noir&url=https://evil.example"));
    expect(link.searchParams.get("room")).toBe("room_ab12cd34ef");
    expect(link.searchParams.get("view")).toBe("kanban");
    expect(link.searchParams.get("theme")).toBe("noir&url=https://evil.example");
    expect(link.searchParams.has("url")).toBe(false);
    expect(link.hash).toBe("");

    const bare = new URL(buildRoomViewerUrl("room_ab12cd34ef"));
    expect(bare.searchParams.has("view")).toBe(false);
    expect(bare.searchParams.has("theme")).toBe(false);
  });

  it("only trusts GitHub-hosted avatars", () => {
    expect(getTrustedAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe(
      "https://avatars.githubusercontent.com/u/1?v=4"
    );
    expect(getTrustedAvatarUrl("https://tracker.example/pixel.png")).toBeNull();
    expect(getTrustedAvatarUrl("http://avatars.githubusercontent.com/u/1")).toBeNull();
    expect(getTrustedAvatarUrl(undefined)).toBeNull();
  });
});

describe("legacy room secrets", () => {
  beforeEach(() => {
    storageService.removeItem(STORAGE_KEYS.ROOM_SECRET_KEYS);
  });

  it("never returns inherited object members for prototype-like ids", () => {
    expect(getStoredRoomSecret("constructor")).toBeNull();
    expect(getStoredRoomSecret("toString")).toBeNull();
    expect(getStoredRoomSecret("__proto__")).toBeNull();
  });

  it("reads and removes a stored key", () => {
    storageService.setItem(STORAGE_KEYS.ROOM_SECRET_KEYS, { room_ab12cd: "sec_1", other_room: 7 });
    expect(getStoredRoomSecret("ROOM_AB12CD")).toBe("sec_1");
    expect(getStoredRoomSecret("other_room")).toBeNull();
    removeRoomSecret("room_ab12cd");
    expect(getStoredRoomSecret("room_ab12cd")).toBeNull();
  });

  it("tolerates a corrupted store", () => {
    storageService.setItem(STORAGE_KEYS.ROOM_SECRET_KEYS, ["not", "a", "map"]);
    expect(getStoredRoomSecret("room_ab12cd")).toBeNull();
    expect(() => removeRoomSecret("room_ab12cd")).not.toThrow();
  });
});

describe("getTabInstanceId", () => {
  it("is stable within a page load", () => {
    const id = getTabInstanceId();
    expect(id).toMatch(/^tab-/);
    expect(getTabInstanceId()).toBe(id);
  });
});
