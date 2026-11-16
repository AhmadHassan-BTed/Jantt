import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JanttData } from "@jantt/core";
import type { RoomMember, UserProfile } from "./dtos";

/**
 * In-memory stand-in for the Realtime Database client SDK: multi-path updates, transactions,
 * listeners (notified synchronously per write, like one SDK event batch) and rule-style
 * denials for chosen paths. Rejects `undefined` values exactly like the real SDK.
 */
const fake = vi.hoisted(() => {
  type Json = any;
  type Listener = { path: string; cb: (snap: unknown) => void; cancel?: (err: Error) => void };
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const split = (p: string) => p.split("/").filter(Boolean);
  const state = {
    root: {} as Json,
    updates: [] as Array<{ path: string; values: Record<string, unknown> }>,
    transactions: [] as string[],
    gets: [] as string[],
    listeners: new Set<Listener>(),
    denyWrites: [] as RegExp[]
  };

  const getAt = (path: string): Json => {
    let cur = state.root;
    for (const seg of split(path)) {
      if (cur === null || typeof cur !== "object" || !(seg in cur)) return null;
      cur = cur[seg];
    }
    return cur ?? null;
  };
  const prune = (value: Json): Json => {
    if (value === null || typeof value !== "object") return value;
    const out: Json = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
      const pv = prune(v);
      if (pv !== null && !(typeof pv === "object" && Object.keys(pv).length === 0)) out[k] = pv;
    }
    return out;
  };
  const setAt = (path: string, value: Json) => {
    const segs = split(path);
    if (segs.length === 0) {
      state.root = value ?? {};
      return;
    }
    let cur = state.root;
    for (const seg of segs.slice(0, -1)) {
      if (cur[seg] === null || typeof cur[seg] !== "object") cur[seg] = {};
      cur = cur[seg];
    }
    const last = segs[segs.length - 1];
    if (value === null || value === undefined) delete cur[last];
    else cur[last] = prune(clone(value));
  };
  const snapshot = (path: string, value: Json) => ({
    key: split(path).pop() ?? null,
    exists: () => value !== null && value !== undefined,
    val: () => (value === null || value === undefined ? null : clone(value)),
    forEach(fn: (child: unknown) => void) {
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) fn(snapshot(`${path}/${k}`, v));
      }
    }
  });
  const assertNoUndefined = (value: Json, path: string) => {
    if (value === undefined) throw new Error(`update failed: values argument contains undefined in property '${path}'`);
    if (value && typeof value === "object" && !("__increment" in value)) {
      for (const [k, v] of Object.entries(value)) assertNoUndefined(v, `${path}/${k}`);
    }
  };
  const permissionDenied = () => Object.assign(new Error("PERMISSION_DENIED: Permission denied"), { code: "PERMISSION_DENIED" });
  const isDenied = (path: string) => state.denyWrites.some((re) => re.test(path));
  const notify = (changed: string[]) => {
    for (const l of [...state.listeners]) {
      if (changed.some((p) => p.startsWith(l.path) || l.path.startsWith(p))) l.cb(snapshot(l.path, getAt(l.path)));
    }
  };

  return {
    state,
    getAt,
    setAt,
    seed(path: string, value: Json) {
      setAt(path, value);
    },
    reset() {
      state.root = {};
      state.updates = [];
      state.transactions = [];
      state.gets = [];
      state.listeners.clear();
      state.denyWrites = [];
    },
    sdk: {
      ref: (_db: unknown, path = "") => ({ path }),
      increment: (n: number) => ({ __increment: n }),
      get: async (r: { path: string }) => {
        state.gets.push(r.path);
        return snapshot(r.path, getAt(r.path));
      },
      update: async (r: { path: string }, values: Record<string, unknown>) => {
        const entries = Object.entries(values).map(([k, v]) => [r.path ? `${r.path}/${k}` : k, v] as const);
        for (const [p, v] of entries) assertNoUndefined(v, p);
        if (entries.some(([p]) => isDenied(p))) throw permissionDenied();
        state.updates.push({ path: r.path, values: clone(values) });
        for (const [p, v] of entries) {
          const inc = v && typeof v === "object" && "__increment" in (v as object) ? (v as { __increment: number }).__increment : null;
          setAt(p, inc === null ? v : (Number(getAt(p)) || 0) + inc);
        }
        notify(entries.map(([p]) => p));
      },
      set: async (r: { path: string }, value: unknown) => {
        if (isDenied(r.path)) throw permissionDenied();
        setAt(r.path, value);
        notify([r.path]);
      },
      runTransaction: async (r: { path: string }, fn: (v: unknown) => unknown) => {
        state.transactions.push(r.path);
        const current = getAt(r.path);
        const next = fn(current === null ? null : clone(current));
        if (next === undefined) return { committed: false, snapshot: snapshot(r.path, current) };
        if (isDenied(r.path)) throw new Error("permission_denied");
        setAt(r.path, next);
        notify([r.path]);
        return { committed: true, snapshot: snapshot(r.path, getAt(r.path)) };
      },
      onValue: (r: { path: string }, cb: (snap: unknown) => void, cancel?: (err: Error) => void) => {
        const listener = { path: r.path, cb, cancel };
        state.listeners.add(listener);
        cb(snapshot(r.path, getAt(r.path)));
        return () => {
          state.listeners.delete(listener);
        };
      }
    }
  };
});

vi.mock("firebase/database", () => fake.sdk);
vi.mock("./firebaseConfig", () => ({
  rtdb: {},
  auth: { currentUser: null as null | { uid: string } },
  isPermissionDeniedError: (e: any) => /permission[_ ]denied/i.test(`${e?.code ?? ""} ${e?.message ?? e}`)
}));

import { auth } from "./firebaseConfig";
import {
  createRoom,
  deleteRoom,
  getRoom,
  joinRoomViaInvite,
  listenToRoom,
  listenToUserRooms,
  removeMemberFromRoom,
  removeTeamFromRoom,
  renameRoom,
  saveRoomDataAtomic,
  shareRoomWithTeam,
  shareRoomWithUser,
  updateMemberRole
} from "./roomService";

const ROOM = "room_test01";
const NOW = "2026-01-01T00:00:00.000Z";

function profile(uid: string, extra: Partial<UserProfile> = {}): UserProfile {
  return { uid, username: uid, displayUsername: uid, displayName: uid.toUpperCase(), createdAt: NOW, updatedAt: NOW, ...extra };
}

const alice = profile("alice", { photoURL: "https://avatars.example/alice.png" });
const bob = profile("bob");
const carol = profile("carol");
const dave = profile("dave");

function plan(taskOverrides: Record<string, unknown> = {}): JanttData {
  return {
    meta: { title: "Roadmap" },
    tasks: [{ id: "t1", label: "Design", category: "dev", start: "2026-01-05", end: "2026-01-09", ...taskOverrides }]
  } as unknown as JanttData;
}

function member(p: UserProfile, role: RoomMember["role"], extra: Partial<RoomMember> = {}): RoomMember {
  return { uid: p.uid, username: p.username, displayName: p.displayName, role, joinedAt: NOW, ...extra };
}

function seedRoom(data: JanttData = plan()) {
  fake.seed(`rooms/${ROOM}`, {
    meta: { roomId: ROOM, title: "Roadmap", ownerUid: "alice", ownerUsername: "alice", createdAt: NOW, updatedAt: NOW, revision: 3, contentHash: "x" },
    members: { alice: member(alice, "owner"), bob: member(bob, "editor"), carol: member(carol, "viewer") },
    presence: { carol: { uid: "carol", username: "carol", status: "online" } },
    data
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fake.reset();
  (auth as { currentUser: { uid: string } | null }).currentUser = { uid: "alice" };
});

describe("createRoom", () => {
  it("writes no shared secret and no undefined fields", async () => {
    const room = await createRoom(bob, "  ", plan());
    expect(room.meta.secretKey).toBeUndefined();
    const stored = fake.getAt(`rooms/${room.meta.roomId}`);
    expect(stored.meta).not.toHaveProperty("secretKey");
    expect(stored.members.bob).not.toHaveProperty("photoURL");
    expect(stored.meta.title).toBe("Roadmap");
    expect(fake.getAt(`user_rooms/bob/owned/${room.meta.roomId}/role`)).toBe("owner");
  });

  it("uses the canonical room id format, which every other call accepts", async () => {
    const room = await createRoom(bob, "Plan", plan());
    // 128-bit unguessable suffix: link-readable rooms are protected only by their id.
    expect(room.meta.roomId).toMatch(/^room-[0-9a-f]{32}$/);
    await expect(getRoom(room.meta.roomId)).resolves.not.toBeNull();
  });

  it("stores GitHub avatars only, as the rules require", async () => {
    const room = await createRoom(alice, "Plan", plan());
    expect(fake.getAt(`rooms/${room.meta.roomId}/members/alice`)).not.toHaveProperty("photoURL");

    const octo = profile("octo", { photoURL: "https://avatars.githubusercontent.com/u/1?v=4" });
    await shareRoomWithUser(room.meta.roomId, octo, "viewer");
    expect(fake.getAt(`rooms/${room.meta.roomId}/members/octo/photoURL`)).toBe("https://avatars.githubusercontent.com/u/1?v=4");
  });
});

describe("legacy edit keys", () => {
  function seedLegacyRoom(roomId: string) {
    fake.seed(`rooms/${roomId}`, {
      meta: { roomId, title: "Old", ownerUid: "alice", ownerUsername: "alice", createdAt: NOW, updatedAt: NOW, revision: 1, contentHash: "x", secretKey: "key_0123456789" },
      members: { alice: member(alice, "owner") },
      data: plan()
    });
  }

  it("never returns the key and lets the owner's client delete it", async () => {
    seedLegacyRoom("room_legacy1");
    const room = await getRoom("room_legacy1");
    expect(room?.meta).not.toHaveProperty("secretKey");
    await flush();
    expect(fake.getAt("rooms/room_legacy1/meta/secretKey")).toBeNull();
    expect(fake.getAt("rooms/room_legacy1/meta/title")).toBe("Old");
  });

  it("does not attempt the owner-only cleanup for other users", async () => {
    seedLegacyRoom("room_legacy2");
    (auth as { currentUser: { uid: string } | null }).currentUser = { uid: "bob" };
    const events: unknown[] = [];
    listenToRoom("room_legacy2", (room) => events.push(room?.meta));
    await flush();
    expect(events[0]).not.toHaveProperty("secretKey");
    expect(fake.getAt("rooms/room_legacy2/meta/secretKey")).toBe("key_0123456789");
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe("renameRoom", () => {
  it("renames the room and the owner's pointer", async () => {
    seedRoom();
    fake.seed(`user_rooms/alice/owned/${ROOM}`, { roomId: ROOM, title: "Roadmap", role: "owner" });
    await expect(renameRoom(ROOM, "  Launch plan  ", alice)).resolves.toBe("Launch plan");
    expect(fake.getAt(`rooms/${ROOM}/meta/title`)).toBe("Launch plan");
    expect(fake.getAt(`user_rooms/alice/owned/${ROOM}/title`)).toBe("Launch plan");
  });

  it("never creates a partial pointer and refuses non-owners and empty names", async () => {
    seedRoom();
    await renameRoom(ROOM, "Launch", alice);
    expect(fake.getAt(`user_rooms/alice/owned/${ROOM}`)).toBeNull();
    await expect(renameRoom(ROOM, "Mine now", bob)).rejects.toThrow(/Only the room owner/);
    await expect(renameRoom(ROOM, "   ", alice)).rejects.toThrow(/cannot be empty/);
    await expect(renameRoom("room_missing", "x", alice)).rejects.toThrow(/no longer exists/);
    expect(fake.getAt(`rooms/${ROOM}/meta/title`)).toBe("Launch");
  });
});

describe("saveRoomDataAtomic", () => {
  it("keeps edits to fields the display hash ignores", async () => {
    seedRoom();
    const edited = plan({ milestone: true, priority: "high" });
    const result = await saveRoomDataAtomic(ROOM, edited, bob, plan());
    expect(result.data.tasks[0]).toMatchObject({ milestone: true, priority: "high" });
    expect(fake.getAt(`rooms/${ROOM}/data/tasks/0/milestone`)).toBe(true);
  });

  it("transacts on the data node only and stamps the meta leaves", async () => {
    seedRoom();
    const result = await saveRoomDataAtomic(ROOM, plan({ label: "Build" }), bob, plan());
    expect(fake.state.transactions).toEqual([`rooms/${ROOM}/data`]);
    const metaWrite = fake.state.updates.find((u) => u.path === `rooms/${ROOM}/meta`);
    expect(Object.keys(metaWrite?.values || {}).sort()).toEqual(["contentHash", "noteCount", "revision", "taskCount", "updatedAt"]);
    expect(result.revision).toBe(4);
    expect(fake.getAt(`rooms/${ROOM}/presence/carol/status`)).toBe("online");
  });

  it("writes nothing when the plan already matches the server", async () => {
    seedRoom();
    const result = await saveRoomDataAtomic(ROOM, plan(), bob, plan({ label: "Old" }));
    expect(result).toMatchObject({ success: true, revision: 3 });
    expect(fake.state.updates).toHaveLength(0);
  });

  it("merges against concurrent remote edits instead of overwriting them", async () => {
    const base = { meta: { title: "Roadmap" }, tasks: [plan().tasks[0], { id: "t2", label: "Ship", category: "dev", start: "2026-02-01", end: "2026-02-02" }] } as unknown as JanttData;
    seedRoom({ ...base, tasks: [base.tasks[0], { ...base.tasks[1], label: "Ship it" }] } as JanttData);
    const local = { ...base, tasks: [{ ...base.tasks[0], label: "Design v2" }, base.tasks[1]] } as JanttData;
    const result = await saveRoomDataAtomic(ROOM, local, bob, base);
    const labels = Object.fromEntries(result.data.tasks.map((t) => [t.id, t.label]));
    expect(labels).toEqual({ t1: "Design v2", t2: "Ship it" });
  });

  it("refuses viewers and outsiders before writing", async () => {
    seedRoom();
    await expect(saveRoomDataAtomic(ROOM, plan({ label: "x" }), carol)).rejects.toThrow(/Permission denied/);
    await expect(saveRoomDataAtomic(ROOM, plan({ label: "x" }), dave)).rejects.toThrow(/Permission denied/);
    expect(fake.state.transactions).toHaveLength(0);
  });

  it("maps a rules rejection to a readable error", async () => {
    seedRoom();
    fake.state.denyWrites = [/\/data$/];
    await expect(saveRoomDataAtomic(ROOM, plan({ label: "x" }), bob)).rejects.toThrow(
      "Permission denied: You do not have edit access to this room."
    );
  });

  it("reports deleted rooms", async () => {
    await expect(saveRoomDataAtomic(ROOM, plan(), bob)).rejects.toThrow(/no longer exists/);
  });

  it("rejects ids that would address other database paths", async () => {
    await expect(saveRoomDataAtomic("x/members/bob", plan(), bob)).rejects.toThrow("Invalid room ID.");
    await expect(getRoom("Room_Test01")).rejects.toThrow("Invalid room ID.");
    await expect(joinRoomViaInvite("room.test", dave)).rejects.toThrow("Invalid room ID.");
    expect(fake.state.gets).toHaveLength(0);
  });
});

describe("joinRoomViaInvite", () => {
  it("self-joins as viewer even when an invite key is supplied", async () => {
    seedRoom();
    const room = await joinRoomViaInvite(ROOM, dave, "key_anything");
    expect(room.members.dave.role).toBe("viewer");
    expect(fake.getAt(`rooms/${ROOM}/members/dave/role`)).toBe("viewer");
    expect(fake.getAt(`user_rooms/dave/shared/${ROOM}/role`)).toBe("viewer");
    expect(room).not.toHaveProperty("presence");
  });

  it("opens the room read-only when self-enrollment is refused", async () => {
    seedRoom();
    fake.state.denyWrites = [/\/members\/dave$/];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const room = await joinRoomViaInvite(ROOM, dave);
    expect(room.members.dave).toBeUndefined();
    expect(room.data.tasks).toHaveLength(1);
    warn.mockRestore();
  });

  it("treats a node without meta (e.g. a stray presence write) as missing", async () => {
    fake.seed("rooms/room_ghost/presence/dave", { uid: "dave", status: "online" });
    await expect(joinRoomViaInvite("room_ghost", dave)).rejects.toThrow(/was not found/);
    expect(await getRoom("room_ghost")).toBeNull();
  });
});

describe("member management", () => {
  it("only enrolls team members whose uid owns their username", async () => {
    seedRoom();
    fake.seed("usernames/dave", "dave");
    const phantom = profile("user-p1", { username: "teammate" });
    const result = await shareRoomWithTeam(ROOM, { id: "team-core", name: "Core" }, [dave, phantom, bob], "viewer");
    expect(result).toEqual({ added: ["dave"], skipped: ["teammate"] });
    expect(fake.getAt(`rooms/${ROOM}/members/dave`)).toMatchObject({ role: "viewer", teamId: "team-core" });
    expect(fake.getAt(`rooms/${ROOM}/members/user-p1`)).toBeNull();
    expect(fake.getAt(`rooms/${ROOM}/members/bob/teamId`)).toBeNull();
    expect(fake.getAt(`rooms/${ROOM}/teams/team-core/id`)).toBe("team-core");
  });

  it("keeps people another team still covers when a team is removed", async () => {
    seedRoom();
    fake.seed("usernames/dave", "dave");
    await shareRoomWithTeam(ROOM, { id: "team-a", name: "A" }, [dave, bob], "editor");
    await shareRoomWithTeam(ROOM, { id: "team-b", name: "B" }, [dave], "viewer");
    expect(fake.getAt(`rooms/${ROOM}/teams/team-a/memberUsernames`)).toEqual(["bob", "dave"]);

    await removeTeamFromRoom(ROOM, "team-a");
    expect(fake.getAt(`rooms/${ROOM}/members/dave`)).toMatchObject({ teamId: "team-b", teamName: "B", role: "viewer" });
    expect(fake.getAt(`user_rooms/dave/shared/${ROOM}`)).toMatchObject({ roomId: ROOM, role: "viewer", ownerUid: "alice" });
    expect(fake.getAt(`rooms/${ROOM}/members/bob/role`)).toBe("editor");

    await removeTeamFromRoom(ROOM, "team-b");
    expect(fake.getAt(`rooms/${ROOM}/members/dave`)).toBeNull();
    expect(fake.getAt(`user_rooms/dave/shared/${ROOM}`)).toBeNull();
  });

  it("refuses a team share that would add nobody real", async () => {
    seedRoom();
    await expect(shareRoomWithTeam(ROOM, { id: "t", name: "Ghosts" }, [profile("user-x")])).rejects.toThrow(/Jantt account/);
    expect(fake.state.updates).toHaveLength(0);
  });

  it("bans members the owner removes, but not members who leave", async () => {
    seedRoom();
    await removeMemberFromRoom(ROOM, "carol");
    expect(fake.getAt(`rooms/${ROOM}/banned/carol`)).toBe(true);

    (auth as { currentUser: { uid: string } | null }).currentUser = { uid: "bob" };
    await removeMemberFromRoom(ROOM, "bob");
    expect(fake.getAt(`rooms/${ROOM}/banned/bob`)).toBeNull();
    await expect(removeMemberFromRoom(ROOM, "alice")).rejects.toThrow(/owner cannot be removed/);
  });

  it("does not resurrect a member who already left when changing roles", async () => {
    seedRoom();
    await expect(updateMemberRole(ROOM, "dave", "editor")).rejects.toThrow(/no longer a member/);
    await updateMemberRole(ROOM, "carol", "editor");
    expect(fake.getAt(`user_rooms/carol/shared/${ROOM}`)).toMatchObject({ roomId: ROOM, role: "editor", ownerUid: "alice" });
  });

  it("prunes the owner's stale pointers when the room is already gone", async () => {
    fake.seed(`user_rooms/alice/owned/${ROOM}`, { roomId: ROOM, title: "Old" });
    await deleteRoom(ROOM, "alice");
    expect(fake.getAt(`user_rooms/alice/owned/${ROOM}`)).toBeNull();
  });

  it("removes every member pointer on delete without downloading the plan", async () => {
    seedRoom();
    fake.seed(`user_rooms/bob/shared/${ROOM}`, { roomId: ROOM, title: "Roadmap", role: "editor" });
    await deleteRoom(ROOM, "alice");
    expect(fake.getAt(`rooms/${ROOM}`)).toBeNull();
    expect(fake.getAt(`user_rooms/bob/shared/${ROOM}`)).toBeNull();
    expect(fake.state.gets).not.toContain(`rooms/${ROOM}`);
    expect(fake.state.gets).not.toContain(`rooms/${ROOM}/data`);
  });
});

describe("listenToRoom", () => {
  it("ignores presence churn and reports deletion exactly once", async () => {
    seedRoom();
    const events: unknown[] = [];
    const stop = listenToRoom(ROOM, (room) => events.push(room));
    await flush();
    expect(events).toHaveLength(1);
    expect(fake.state.listeners.size).toBe(3);

    await fake.sdk.set({ path: `rooms/${ROOM}/presence/bob` }, { uid: "bob", status: "online" });
    await flush();
    expect(events).toHaveLength(1);

    await fake.sdk.update({ path: "" }, { [`rooms/${ROOM}`]: null });
    await flush();
    expect(events.slice(1)).toEqual([null]);
    stop();
    expect(fake.state.listeners.size).toBe(0);
  });

  it("describes the emitted data in meta.contentHash even before meta is stamped", async () => {
    seedRoom();
    const hashes: string[] = [];
    listenToRoom(ROOM, (room) => room && hashes.push(room.meta.contentHash));
    await flush();
    await fake.sdk.set({ path: `rooms/${ROOM}/data` }, plan({ label: "Changed" }));
    await flush();
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});

describe("listenToUserRooms", () => {
  it("shows live room titles and hides rooms that no longer exist", async () => {
    seedRoom();
    fake.seed("user_rooms/bob/shared", {
      [ROOM]: { roomId: ROOM, title: "Stale title", role: "editor", updatedAt: "2025-01-01" },
      room_gone: { roomId: "room_gone", title: "Deleted", role: "viewer", updatedAt: "2025-01-02" },
      "bad.key": { title: "Injected" }
    });
    const lists: Array<{ owned: unknown[]; shared: Array<{ roomId: string; title: string }> }> = [];
    listenToUserRooms("bob", (owned, shared) => lists.push({ owned, shared }));
    await flush();
    const last = lists[lists.length - 1];
    expect(last.shared).toEqual([expect.objectContaining({ roomId: ROOM, title: "Roadmap", role: "editor" })]);

    await fake.sdk.update({ path: `rooms/${ROOM}/meta` }, { title: "Renamed" });
    await flush();
    expect(lists[lists.length - 1].shared[0].title).toBe("Renamed");
  });
});
