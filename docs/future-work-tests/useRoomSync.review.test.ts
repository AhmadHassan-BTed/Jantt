// Reviewer regression checks for useRoomSync (scratch, not part of the repo).
import * as React from "D:/Repos/Jantt/node_modules/react/index.js";
import { createRoot, type Root } from "D:/Repos/Jantt/node_modules/react-dom/client.js";
import { calculatePlanHash, type JanttData } from "@jantt/core";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (room: unknown) => void>();
  return {
    listeners,
    connected: { cb: null as null | ((snap: { val: () => unknown }) => void) },
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

vi.mock("D:/Repos/Jantt/apps/playground/src/firebase/roomService", () => ({
  createRoom: mocks.createRoom,
  joinRoomViaInvite: mocks.joinRoomViaInvite,
  getRoom: mocks.getRoom,
  saveRoomDataAtomic: mocks.saveRoomDataAtomic,
  listenToRoom: mocks.listenToRoom
}));
vi.mock("D:/Repos/Jantt/apps/playground/src/firebase/presenceService", () => ({
  trackRoomPresence: () => () => {},
  listenToRoomPresence: () => () => {}
}));
vi.mock("D:/Repos/Jantt/apps/playground/src/firebase/githubVerificationService", () => ({
  ENABLE_GITHUB_VERIFICATION_GATE: false
}));
vi.mock("D:/Repos/Jantt/apps/playground/src/firebase/firebaseConfig", () => ({
  rtdb: {},
  isPermissionDeniedError: (err: unknown) => /permission/i.test(String((err as Error)?.message))
}));
import { useRoomSync } from "D:/Repos/Jantt/apps/playground/src/hooks/useRoomSync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as unknown as { act: (fn: () => unknown) => Promise<void> }).act;

const ROOM_ID = "room_abc123def0";
const PROJECT_ID = `room-${ROOM_ID}`;
const alice = { uid: "uid-alice", username: "alice", displayUsername: "alice", displayName: "Alice", createdAt: "", updatedAt: "" };

function plan(tasks: Array<Record<string, unknown>>): JanttData {
  return {
    meta: { title: "Plan" },
    tasks: tasks.map((t, i) => ({ id: `t${i + 1}`, label: `Task ${i + 1}`, start: "2026-01-05", end: "2026-01-09", ...t }))
  } as JanttData;
}

function roomPayload(data: JanttData, role: "editor" | "viewer" | null = "editor", revision = 2) {
  const members: Record<string, unknown> = {
    "uid-owner": { uid: "uid-owner", username: "owner", displayName: "Owner", role: "owner", joinedAt: "" }
  };
  if (role) members[alice.uid] = { uid: alice.uid, username: "alice", displayName: "Alice", role, joinedAt: "" };
  return {
    meta: { roomId: ROOM_ID, title: "Shared room", ownerUid: "uid-owner", ownerUsername: "owner", createdAt: "", updatedAt: "", revision, contentHash: calculatePlanHash(data) },
    members,
    data
  };
}

function roomProject(data: JanttData, role: "collaborator" | "viewer" = "collaborator") {
  return { id: PROJECT_ID, name: "Shared room", updatedAt: "", data, source: "room" as const, roomId: ROOM_ID, role, revision: 2, etag: calculatePlanHash(data) };
}

let latest: any;
let root: Root | null = null;
const toasts: string[] = [];
const snapshots: string[] = [];
const noop = () => {};

function Harness(props: { projects: any[]; activeId: string; user: any }) {
  const [projects, setProjects] = React.useState(props.projects);
  const [activeId, setActiveId] = React.useState(props.activeId);
  const [parsed, setParsed] = React.useState<JanttData | null>(() => props.projects.find((p) => p.id === props.activeId)?.data ?? plan([{}]));
  // Emulates useAutoSave: the active plan's edits are written to its project.
  const activeRef = React.useRef(activeId);
  React.useEffect(() => {
    if (activeRef.current !== activeId) {
      activeRef.current = activeId;
      return;
    }
    setProjects((list: any[]) => list.map((p) => (p.id === activeId && parsed ? { ...p, data: parsed } : p)));
  }, [parsed, activeId]);
  const sync = useRoomSync({
    customProjects: projects,
    setCustomProjects: setProjects as any,
    activeProjectId: activeId,
    setActiveProjectId: setActiveId,
    parsedData: parsed,
    setParsedData: setParsed,
    setJsonText: noop,
    setPeople: noop,
    setTeams: noop,
    setValidationResult: noop,
    showToast: (msg: string) => toasts.push(msg),
    captureSnapshot: (_id: string, _data: JanttData, reason: string) => snapshots.push(reason),
    userProfile: props.user
  });
  latest = { sync, projects, activeId, parsed, setActiveId, setParsed };
  return null;
}

async function mount(projects: any[], activeId: string, user: any) {
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root!.render(React.createElement(Harness, { projects, activeId, user }));
  });
}
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function emitRoom(room: unknown) {
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
  for (const fn of [mocks.createRoom, mocks.joinRoomViaInvite, mocks.getRoom, mocks.saveRoomDataAtomic]) fn.mockReset();
  mocks.saveRoomDataAtomic.mockImplementation(async (_r: string, data: JanttData) => ({ success: true, revision: 3, data }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
});

describe("review: useRoomSync races", () => {
  it("edits flushed while a save is in flight reach the room and are not overwritten by the older ack", async () => {
    const base = plan([{}]);
    await mount([roomProject(base)], PROJECT_ID, alice);
    await emitRoom(roomPayload(base));

    let resolveFirst!: (v: unknown) => void;
    mocks.saveRoomDataAtomic.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));

    const e1 = plan([{ label: "E1" }]);
    await act(async () => latest.setParsed(e1));
    await settle(1300);
    expect(mocks.saveRoomDataAtomic).toHaveBeenCalledTimes(1);

    const e2 = plan([{ label: "E2" }]);
    await act(async () => latest.setParsed(e2));
    await settle(100);
    await act(async () => latest.setActiveId("default"));
    await settle();

    await act(async () => resolveFirst({ success: true, revision: 3, data: e1 }));
    await settle();

    expect(mocks.saveRoomDataAtomic).toHaveBeenCalledTimes(2);
    const [roomId, sent, , sentBase] = mocks.saveRoomDataAtomic.mock.calls[1];
    expect(roomId).toBe(ROOM_ID);
    expect(sent.tasks[0].label).toBe("E2");
    expect(sentBase.tasks[0].label).toBe("E1");
    await settle();
    expect(latest.projects.find((p: any) => p.id === PROJECT_ID).data.tasks[0].label).toBe("E2");
  });

  it("a demotion arriving with a teammate change replaces unsaved edits instead of merging them", async () => {
    const base = plan([{}]);
    await mount([roomProject(base)], PROJECT_ID, alice);
    await emitRoom(roomPayload(base));

    await act(async () => latest.setParsed(plan([{ label: "Mine" }])));
    await emitRoom(roomPayload(plan([{}, { label: "Theirs" }]), "viewer", 4));

    expect(latest.sync.activeRoomRole).toBe("viewer");
    expect(latest.parsed.tasks.map((t: any) => t.label)).toEqual(["Task 1", "Theirs"]);
    expect(snapshots.length).toBeGreaterThan(0);
    await settle(1500);
    expect(mocks.saveRoomDataAtomic).not.toHaveBeenCalled();
  });

  it("a viewer goes back to a non-offline status on reconnect", async () => {
    const base = plan([{}]);
    await mount([roomProject(base, "viewer")], PROJECT_ID, alice);
    await emitRoom(roomPayload(base, "viewer"));
    await act(async () => (globalThis as any).__fbdb.connected({ val: () => false }));
    expect(latest.sync.syncStatus).toBe("offline");
    await act(async () => (globalThis as any).__fbdb.connected({ val: () => true }));
    expect(latest.sync.syncStatus).not.toBe("offline");
  });

  it("'Save to my rooms' reports a refused self-enrollment", async () => {
    const base = plan([{}]);
    await mount([roomProject(base, "viewer")], PROJECT_ID, alice);
    await emitRoom(roomPayload(base, null));
    mocks.joinRoomViaInvite.mockResolvedValue(roomPayload(base, null));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await latest.sync.saveActiveRoomToMyRooms();
    });
    expect(ok).toBe(false);
    expect(toasts.some((t) => /doesn't accept/i.test(t))).toBe(true);
  });

  it("joining the room that is already open does not reload it", async () => {
    const base = plan([{}]);
    await mount([roomProject(base)], PROJECT_ID, alice);
    await emitRoom(roomPayload(base));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await latest.sync.handleJoinRoom(ROOM_ID);
    });
    expect(ok).toBe(true);
    expect(mocks.getRoom).not.toHaveBeenCalled();
  });
  it("a cached copy without a stored hash keeps unpushed edits across a reload", async () => {
    const base = plan([{}]);
    const legacy = { ...roomProject(base), etag: undefined };
    await mount([legacy], PROJECT_ID, alice);
    await emitRoom(roomPayload(base));
    mocks.saveRoomDataAtomic.mockImplementation(() => new Promise(() => {})); // never reaches the room
    await act(async () => latest.setParsed(plan([{ label: "Unpushed" }])));
    await settle(10);
    const stored = latest.projects.map((p: any) => ({ ...p }));
    await act(async () => root?.unmount());
    mocks.saveRoomDataAtomic.mockReset();
    mocks.saveRoomDataAtomic.mockImplementation(async (_r: string, data: JanttData) => ({ success: true, revision: 3, data }));

    await mount(stored, PROJECT_ID, alice);
    await emitRoom(roomPayload(base));
    expect(latest.parsed.tasks[0].label).toBe("Unpushed");
    await settle(1300);
    expect(mocks.saveRoomDataAtomic).toHaveBeenCalled();
    expect(mocks.saveRoomDataAtomic.mock.calls[0][1].tasks[0].label).toBe("Unpushed");
  });
});
