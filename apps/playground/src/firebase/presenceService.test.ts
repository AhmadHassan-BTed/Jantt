// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Realtime Database fake with per-path listeners, a togglable connection and rule denials. */
const db = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<(snap: unknown) => void>>();
  const state = { writes: [] as Array<[string, unknown]>, deny: false };
  const snapshot = (value: unknown) => ({ exists: () => value != null, val: () => value ?? null });
  const emit = (path: string) => listeners.get(path)?.forEach((cb) => cb(snapshot(values.get(path))));
  const write = (path: string, value: unknown) => {
    state.writes.push([path, value]);
    if (value == null) values.delete(path);
    else values.set(path, value);
    emit(path);
  };
  const denied = () => Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" });
  return {
    state,
    values,
    write,
    reset() {
      values.clear();
      listeners.clear();
      state.writes = [];
      state.deny = false;
    },
    connect() {
      values.set(".info/connected", true);
      emit(".info/connected");
    },
    sdk: {
      ref: (_db: unknown, path: string) => ({ path }),
      onValue: (r: { path: string }, cb: (snap: unknown) => void) => {
        if (!listeners.has(r.path)) listeners.set(r.path, new Set());
        listeners.get(r.path)!.add(cb);
        cb(snapshot(values.get(r.path)));
        return () => listeners.get(r.path)!.delete(cb);
      },
      set: async (r: { path: string }, value: unknown) => {
        if (state.deny && value != null) {
          // Optimistic local write, then the server rejects and the SDK reverts it.
          write(r.path, value);
          write(r.path, null);
          throw denied();
        }
        write(r.path, value);
      },
      remove: async (r: { path: string }) => write(r.path, null),
      onDisconnect: () => ({ remove: async () => {}, cancel: async () => {} })
    }
  };
});

vi.mock("firebase/database", () => db.sdk);
vi.mock("./firebaseConfig", () => ({
  rtdb: {},
  isPermissionDeniedError: (e: any) => /permission[_ ]denied/i.test(`${e?.code ?? ""} ${e?.message ?? e}`)
}));

import { listenToRoomPresence, releaseAllRoomPresence, trackRoomPresence } from "./presenceService";

const user = { uid: "u1", username: "octo", displayUsername: "octo", displayName: "Octo", createdAt: "", updatedAt: "" };
const PATH = "rooms/room_1/presence/u1";
const MEMBER_PATH = "rooms/room_1/members/u1";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  db.reset();
  db.values.set(MEMBER_PATH, { uid: "u1", username: "octo", role: "viewer" });
});

describe("trackRoomPresence", () => {
  it("writes presence without undefined fields once connected", async () => {
    trackRoomPresence("room_1", user);
    db.connect();
    await flush();
    expect(db.values.get(PATH)).toMatchObject({ uid: "u1", status: "online" });
    expect(Object.values(db.values.get(PATH) as object)).not.toContain(undefined);
  });

  it("restores presence another tab of the same user removed", async () => {
    trackRoomPresence("room_1", user);
    db.connect();
    await flush();
    db.write(PATH, null); // the other tab closed
    await flush();
    expect(db.values.get(PATH)).toMatchObject({ status: "online" });
  });

  it("stops writing after the rules refuse presence", async () => {
    db.state.deny = true;
    trackRoomPresence("room_1", user);
    db.connect();
    await flush();
    db.connect();
    await flush();
    const attempts = db.state.writes.filter(([path, value]) => path === PATH && value != null);
    expect(attempts).toHaveLength(1);
  });

  it("starts once the user joins the room and stops when access is lost", async () => {
    db.values.delete(MEMBER_PATH);
    trackRoomPresence("room_1", user);
    db.connect();
    await flush();
    expect(db.state.writes.filter(([path]) => path === PATH)).toHaveLength(0);

    db.write(MEMBER_PATH, { uid: "u1", username: "octo", role: "viewer" }); // e.g. "save to my rooms"
    await flush();
    expect(db.values.get(PATH)).toMatchObject({ status: "online" });

    db.write(MEMBER_PATH, null); // removed by the owner
    await flush();
    expect(db.values.has(PATH)).toBe(false);
  });

  it("publishes GitHub avatars only, since the rules reject any other", async () => {
    trackRoomPresence("room_1", { ...user, photoURL: "https://tracker.example/pixel.png" });
    db.connect();
    await flush();
    expect(db.values.get(PATH)).not.toHaveProperty("photoURL");
  });

  it("is removed by releaseAllRoomPresence and not re-written afterwards", async () => {
    trackRoomPresence("room_1", user);
    db.connect();
    await flush();
    await releaseAllRoomPresence();
    expect(db.values.has(PATH)).toBe(false);
    db.connect();
    await flush();
    expect(db.values.has(PATH)).toBe(false);
  });
});

describe("listenToRoomPresence", () => {
  it("lists only well-formed entries with display fields, whatever other clients wrote", () => {
    db.values.set("rooms/room_1/presence", {
      late: { uid: "late", username: "late", displayName: "Late", status: "online", joinedAt: "2026-01-02T00:00:00.000Z" },
      spoof: {
        uid: "someone-else",
        username: "spoof",
        status: "online",
        isOwner: true,
        joinedAt: 1767225600000,
        photoURL: "https://tracker.example/pixel.png"
      },
      octo: { username: "octo", status: "online", photoURL: "https://avatars.githubusercontent.com/u/1?v=4" },
      away: { username: "away", status: "away" },
      junk: "not an object",
      nameless: { status: "online" }
    });
    const lists: Array<Array<Record<string, unknown>>> = [];
    listenToRoomPresence("room_1", (list) => lists.push(list as never));

    const list = lists[0];
    expect(list.map((p) => p.uid)).toEqual(["octo", "spoof", "late"]);
    const spoof = list[1];
    expect(spoof).toMatchObject({ uid: "spoof", displayName: "spoof", joinedAt: "2026-01-01T00:00:00.000Z" });
    expect(spoof).not.toHaveProperty("isOwner");
    expect(spoof).not.toHaveProperty("photoURL");
    expect(list[0].photoURL).toBe("https://avatars.githubusercontent.com/u/1?v=4");
  });
});
