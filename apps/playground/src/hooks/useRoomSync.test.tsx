// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { calculatePlanHash, type JanttData } from "@jantt/core";
import type { SavedProject } from "../types";
import type { FullRoomPayload, UserProfile } from "../firebase/types";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (room: unknown) => void>();
  return {
    listeners,
    roomExists: { value: true },
    createRoom: vi.fn(),
    joinRoomViaInvite: vi.fn(),
    getRoom: vi.fn(),
    saveRoomDataAtomic: vi.fn(),
    listenToRoom: vi.fn((roomId: string, callback: (room: unknown) => void) => {
      listeners.set(roomId, callback);
      return () => listeners.delete(roomId);
    })
  };
});

vi.mock("../firebase/roomService", () => ({
  createRoom: mocks.createRoom,
  joinRoomViaInvite: mocks.joinRoomViaInvite,
  getRoom: mocks.getRoom,
  saveRoomDataAtomic: mocks.saveRoomDataAtomic,
  listenToRoom: mocks.listenToRoom
}));
vi.mock("../firebase/presenceService", () => ({
  trackRoomPresence: () => () => {},
  listenToRoomPresence: () => () => {}
}));
vi.mock("../firebase/githubVerificationService", () => ({ ENABLE_GITHUB_VERIFICATION_GATE: false }));
vi.mock("../firebase/firebaseConfig", () => ({
  rtdb: {},
  isPermissionDeniedError: (err: unknown) => /permission/i.test(String((err as Error)?.message))
}));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path?: string) => ({ path }),
  get: vi.fn(async () => ({ exists: () => mocks.roomExists.value })),
  onValue: (target: { path?: string }, callback: (snap: { val: () => unknown }) => void) => {
    if (target.path === ".info/connected") callback({ val: () => true });
    return () => {};
  }
}));

import { useRoomSync } from "./useRoomSync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM_ID = "room_abc123def0";
const PROJECT_ID = `room-${ROOM_ID}`;
const alice: UserProfile = {
  uid: "uid-alice",
  username: "alice",
  displayUsername: "alice",
  displayName: "Alice",
  createdAt: "",
  updatedAt: ""
};

function plan(tasks: Array<Record<string, unknown>>): JanttData {
  return {
    meta: { title: "Plan" },
    tasks: tasks.map((t, i) => ({ id: `t${i + 1}`, label: `Task ${i + 1}`, start: "2026-01-05", end: "2026-01-09", ...t }))
  } as JanttData;
}

function roomPayload(data: JanttData, role: "editor" | "viewer" | null = "editor", revision = 2): FullRoomPayload {
  const members: FullRoomPayload["members"] = {
    "uid-owner": { uid: "uid-owner", username: "owner", displayName: "Owner", role: "owner", joinedAt: "" }
  };
  if (role) members[alice.uid] = { uid: alice.uid, username: "alice", displayName: "Alice", role, joinedAt: "" };
  return {
    meta: {
      roomId: ROOM_ID,
      title: "Shared room",
      ownerUid: "uid-owner",
      ownerUsername: "owner",
      createdAt: "",
      updatedAt: "",
      revision,
      contentHash: calculatePlanHash(data)
    },
    members,
    data
  };
}

function roomProject(data: JanttData, ackedData: JanttData = data): SavedProject {
  return {
    id: PROJECT_ID,
    name: "Shared room",
    updatedAt: "",
    data,
    source: "room",
    roomId: ROOM_ID,
    role: "collaborator",
    revision: 2,
    etag: calculatePlanHash(ackedData)
  };
}

interface HarnessState {
  sync: ReturnType<typeof useRoomSync>;
  projects: SavedProject[];
  activeId: string;
  parsed: JanttData | null;
  setActiveId: (id: string) => void;
  setParsed: (data: JanttData | null) => void;
}

let latest: HarnessState;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
const toasts: string[] = [];
const snapshots: string[] = [];
const noop = () => {};

function Harness({ projects: initialProjects, activeId: initialActiveId, user }: { projects: SavedProject[]; activeId: string; user: UserProfile | null }) {
  const [projects, setProjects] = useState(initialProjects);
  const [activeId, setActiveId] = useState(initialActiveId);
  const [parsed, setParsed] = useState<JanttData | null>(
    () => initialProjects.find((p) => p.id === initialActiveId)?.data ?? plan([{}])
  );
  const sync = useRoomSync({
    customProjects: projects,
    setCustomProjects: setProjects,
    activeProjectId: activeId,
    setActiveProjectId: setActiveId,
    parsedData: parsed,
    setParsedData: setParsed,
    setJsonText: noop,
    setPeople: noop,
    setTeams: noop,
    setValidationResult: noop,
    showToast: (msg) => toasts.push(msg),
    captureSnapshot: (_id, _data, reason) => snapshots.push(reason),
    userProfile: user
  });
  latest = { sync, projects, activeId, parsed, setActiveId, setParsed };
  return null;
}

async function mount(projects: SavedProject[], activeId: string, user: UserProfile | null) {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness projects={projects} activeId={activeId} user={user} />);
  });
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function emitRoom(room: FullRoomPayload | null) {
  await act(async () => {
    mocks.listeners.get(ROOM_ID)?.(room);
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  toasts.length = 0;
  snapshots.length = 0;
  mocks.listeners.clear();
  mocks.roomExists.value = true;
  for (const fn of [mocks.createRoom, mocks.joinRoomViaInvite, mocks.getRoom, mocks.saveRoomDataAtomic]) fn.mockReset();
  mocks.saveRoomDataAtomic.mockImplementation(async (_roomId: string, data: JanttData) => ({ success: true, revision: 3, data }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("useRoomSync", () => {
  it("opens a ?room= link on load without writing to the room's roster", async () => {
    const data = plan([{ label: "Remote" }]);
    mocks.getRoom.mockResolvedValue(roomPayload(data, null));
    window.history.replaceState(null, "", `/?room=${ROOM_ID}&view=gantt#key=legacy`);

    await mount([], "default", null);
    await settle();

    expect(mocks.getRoom).toHaveBeenCalledWith(ROOM_ID);
    expect(mocks.joinRoomViaInvite).not.toHaveBeenCalled();
    expect(latest.activeId).toBe(PROJECT_ID);
    expect(latest.sync.activeRoomRole).toBe("viewer");
    expect(latest.parsed?.tasks[0].label).toBe("Remote");
    expect(window.location.search).toContain(`room=${ROOM_ID}`);
    expect(window.location.hash).toBe("");
  });

  it("updates the viewer copy action on a metadata-only change and keeps legacy rooms copyable", async () => {
    const data = plan([{}]);
    await mount([roomProject(data)], PROJECT_ID, null);
    const payload = roomPayload(data, null);
    await emitRoom(payload);
    expect(latest.sync.allowViewerForks).toBe(true);
    await emitRoom({ ...payload, meta: { ...payload.meta, allowViewerForks: false } });
    expect(latest.sync.allowViewerForks).toBe(false);
    expect(latest.projects.find(project => project.id === PROJECT_ID)?.allowViewerForks).toBe(false);
    expect(latest.sync.activeRoomRole).toBe("viewer");
    await emitRoom(payload);
    expect(latest.sync.allowViewerForks).toBe(true);
    expect(mocks.saveRoomDataAtomic).not.toHaveBeenCalled();
  });

  it("rejects an invalid room link without touching the database", async () => {
    window.history.replaceState(null, "", "/?room=x%2Fmembers");
    await mount([], "default", null);
    await settle();
    expect(mocks.getRoom).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain("room=");
  });

  it("pushes edits to fields outside the old display hash (priority)", async () => {
    const data = plan([{}]);
    await mount([roomProject(data)], PROJECT_ID, alice);
    await emitRoom(roomPayload(data));

    const edited = plan([{ priority: "high" }]);
    await act(async () => latest.setParsed(edited));
    await settle(1300);

    expect(mocks.saveRoomDataAtomic).toHaveBeenCalledTimes(1);
    const [roomId, sent, user, base] = mocks.saveRoomDataAtomic.mock.calls[0];
    expect(roomId).toBe(ROOM_ID);
    expect(sent.tasks[0].priority).toBe("high");
    expect(user).toBe(alice);
    expect(base.tasks[0].priority).toBeUndefined();
    expect(latest.sync.syncStatus).toBe("in-sync");
  });

  it("flushes a pending save when switching to another plan", async () => {
    const data = plan([{}]);
    await mount([roomProject(data)], PROJECT_ID, alice);
    await emitRoom(roomPayload(data));

    const edited = plan([{ label: "Renamed" }]);
    await act(async () => latest.setParsed(edited));
    await settle(200);
    expect(mocks.saveRoomDataAtomic).not.toHaveBeenCalled();

    await act(async () => latest.setActiveId("default"));
    await settle();

    expect(mocks.saveRoomDataAtomic).toHaveBeenCalledTimes(1);
    expect(mocks.saveRoomDataAtomic.mock.calls[0][0]).toBe(ROOM_ID);
    expect(mocks.saveRoomDataAtomic.mock.calls[0][1].tasks[0].label).toBe("Renamed");
  });

  it("adopts a teammate's change when there are no local edits", async () => {
    const data = plan([{}]);
    await mount([roomProject(data)], PROJECT_ID, alice);
    await emitRoom(roomPayload(data));

    await emitRoom(roomPayload(plan([{}, { label: "Added by teammate" }]), "editor", 4));

    expect(latest.parsed?.tasks.map((t) => t.label)).toEqual(["Task 1", "Added by teammate"]);
    expect(mocks.saveRoomDataAtomic).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it("merges a teammate's change with unsaved local edits", async () => {
    const data = plan([{}]);
    await mount([roomProject(data)], PROJECT_ID, alice);
    await emitRoom(roomPayload(data));

    await act(async () => latest.setParsed(plan([{ label: "Mine" }])));
    await emitRoom(roomPayload(plan([{}, { label: "Theirs" }]), "editor", 4));

    const labels = latest.parsed?.tasks.map((t) => t.label);
    expect(labels).toContain("Mine");
    expect(labels).toContain("Theirs");
  });

  it("after a reload, pushes edits that never reached the room instead of adopting the room copy", async () => {
    const synced = plan([{}]);
    const unsynced = plan([{ label: "Edited offline" }]);
    await mount([roomProject(unsynced, synced)], PROJECT_ID, alice);
    await emitRoom(roomPayload(synced));

    expect(latest.parsed?.tasks[0].label).toBe("Edited offline");
    await settle(1300);
    expect(mocks.saveRoomDataAtomic).toHaveBeenCalledTimes(1);
    expect(mocks.saveRoomDataAtomic.mock.calls[0][1].tasks[0].label).toBe("Edited offline");
    expect(mocks.saveRoomDataAtomic.mock.calls[0][3].tasks[0].label).toBe("Task 1");
  });

  it("keeps a local copy when the room is deleted", async () => {
    const data = plan([{ label: "Keep me" }]);
    await mount([roomProject(data)], PROJECT_ID, alice);
    await emitRoom(roomPayload(data));

    mocks.roomExists.value = false;
    await emitRoom(null);

    const project = latest.projects.find((p) => p.id === PROJECT_ID);
    expect(project?.source).toBe("local");
    expect(project?.name).toMatch(/\(room deleted\)$/);
    expect(project?.data.tasks[0].label).toBe("Keep me");
    expect(snapshots.length).toBe(1);
    expect(latest.sync.activeRoomId).toBeNull();
  });

  it("does not drop the plan on a transient null snapshot", async () => {
    const data = plan([{}]);
    await mount([roomProject(data)], PROJECT_ID, alice);
    await emitRoom(roomPayload(data));

    mocks.roomExists.value = true;
    await emitRoom(null);

    expect(latest.projects.find((p) => p.id === PROJECT_ID)?.source).toBe("room");
  });

  it("archives a pending draft and displays the saved room after a metadata-only demotion", async () => {
    const saved = plan([{ label: "Approved" }]);
    const draft = plan([{ label: "Unsent edit" }]);
    await mount([roomProject(saved)], PROJECT_ID, alice);
    await emitRoom(roomPayload(saved, "editor"));
    await act(async () => latest.setParsed(draft));
    await emitRoom(roomPayload(saved, "viewer"));
    await settle(5000);

    expect(latest.sync.activeRoomRole).toBe("viewer");
    expect(latest.parsed?.tasks[0].label).toBe("Approved");
    expect(snapshots).toEqual(["Unsaved edits replaced by the cloud room version"]);
    expect(mocks.saveRoomDataAtomic).not.toHaveBeenCalled();
    await emitRoom(roomPayload(saved, "editor"));
    await settle(5000);
    expect(mocks.saveRoomDataAtomic).not.toHaveBeenCalled();
  });

  it("applies a role change made by the owner", async () => {
    const data = plan([{}]);
    await mount([roomProject(data)], PROJECT_ID, alice);
    await emitRoom(roomPayload(data, "editor"));
    expect(latest.sync.activeRoomRole).toBe("collaborator");

    await emitRoom(roomPayload(data, "viewer"));

    expect(latest.sync.activeRoomRole).toBe("viewer");
    expect(toasts.some((t) => /view only/i.test(t))).toBe(true);
  });
});
