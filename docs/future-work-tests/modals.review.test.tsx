import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = "D:/Repos/Jantt/apps/playground/src";

const getRoomMock = vi.fn(async (roomId: string) => ({
  meta: { roomId, title: "remote" },
  data: { meta: { title: "remote" }, tasks: [{ id: "r1", label: "Remote task", start: "2026-01-01", end: "2026-01-02" }] }
}));

vi.mock("D:/Repos/Jantt/apps/playground/src/firebase/index.ts", () => ({
  ENABLE_GITHUB_VERIFICATION_GATE: true,
  getRoom: (roomId: string) => getRoomMock(roomId)
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: give every element one rect so the focus trap sees focusable elements.
Element.prototype.getClientRects = function () {
  return [{ width: 1, height: 1 }] as unknown as DOMRectList;
};

let host: any;
let pm: any;
let share: any;
let addPlan: any;

beforeAll(async () => {
  host = await import(`${SRC}/components/modals/ModalHost.tsx`);
  pm = await import(`${SRC}/components/modals/PlanManagerModal.tsx`);
  share = await import(`${SRC}/components/modals/ShareModal.tsx`);
  addPlan = await import(`${SRC}/components/modals/AddPlanModal.tsx`);
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  vi.useRealTimers();
});

const render = (ui: React.ReactElement) => act(() => root.render(ui));
const key = (el: Element, k: string, extra: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
  });
const click = (el: Element) => act(() => (el as HTMLElement).click());
const setInput = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const byText = (text: string, selector = "button") =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.textContent?.includes(text));

/* ------------------------------------------------------------------ */
describe("pure helpers", () => {
  it("stripShareSecrets removes editor secrets but keeps everything else byte-for-byte", () => {
    const { stripShareSecrets } = share;
    expect(stripShareSecrets("https://x.test/app/?room=abc&view=gantt&theme=noir#key=S3CR3T")).toBe(
      "https://x.test/app/?room=abc&view=gantt&theme=noir"
    );
    expect(stripShareSecrets("https://x.test/?view=gantt#data=AbC-_123%3D")).toBe("https://x.test/?view=gantt#data=AbC-_123%3D");
    expect(stripShareSecrets("https://x.test/?key=1&room=a#edit=2&data=x")).toBe("https://x.test/?room=a#data=x");
    expect(stripShareSecrets("https://x.test/?room=r#%6Bey=k&data=p")).toBe("https://x.test/?room=r#data=p");
    expect(stripShareSecrets("null/path?room=a#key=zz")).toBe("null/path?room=a");
    expect(stripShareSecrets("")).toBe("");
  });

  it("buildEmbedSnippet escapes the URL and title so the snippet is exactly one iframe", () => {
    const url = 'https://x.test/?theme=a"><script>alert(1)</script>&view=gantt';
    const snippet = share.buildEmbedSnippet(url, `Q4 "launch" <b>`);
    const doc = new DOMParser().parseFromString(snippet, "text/html");
    const frames = doc.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(frames[0].getAttribute("src")).toBe(url);
    expect(frames[0].getAttribute("title")).toBe(`Jantt plan: Q4 "launch" <b>`);
  });

  it("buildExportFilename slugs names of any script with the local date", () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(host.buildExportFilename("Q4 Plan / Release!", "csv")).toBe(`q4-plan-release-${today}.csv`);
    expect(host.buildExportFilename("", "json")).toBe(`jantt-plan-${today}.json`);
    expect(host.buildExportFilename("خطة المشروع", "json")).toBe(`خطة-المشروع-${today}.json`);
    expect(host.buildExportFilename("Café: Überblick?", "csv")).toBe(`café-überblick-${today}.csv`);
    expect(host.buildExportFilename(`${"a".repeat(79)} b`, "csv")).toBe(`${"a".repeat(79)}-${today}.csv`);
  });

  it("buildPlanLists makes exactly three lists, including cached rooms in no pointer list", () => {
    const lists = pm.buildPlanLists({
      customProjects: [
        { id: "p1", name: "Alpha", updatedAt: "2026-01-01T00:00:00Z", data: { tasks: [{}, {}] }, source: "local" },
        { id: "room-r1", name: "Room One cache", updatedAt: "2026-05-01T00:00:00Z", data: { tasks: [] }, source: "room", roomId: "r1" },
        { id: "room-r9", name: "Link room", updatedAt: "2026-02-01T00:00:00Z", data: { tasks: [] }, source: "room", roomId: "r9", role: "viewer" }
      ],
      ownedRooms: [{ roomId: "r1", title: "Room One", ownerUid: "u", ownerUsername: "me", role: "owner", updatedAt: "2025-01-01T00:00:00Z", createdAt: "", taskCount: 7 }],
      sharedRooms: [
        { roomId: "r2", title: "Shared", ownerUid: "o", ownerUsername: "bob", role: "editor", updatedAt: "2025-01-01T00:00:00Z", createdAt: "" },
        { roomId: "r1", title: "dup", ownerUid: "u", ownerUsername: "me", role: "editor", updatedAt: "", createdAt: "" }
      ],
      activeProjectId: "room-r1",
      isLoggedIn: true
    });
    expect(Object.keys(lists)).toEqual(["device", "cloud", "shared"]);
    expect(lists.device.map((i: any) => i.id)).toEqual(["p1", "default"]);
    expect(lists.cloud).toHaveLength(1);
    // A cached 0-task room shows 0, not the stale pointer count.
    expect(lists.cloud[0]).toMatchObject({ id: "room-r1", kind: "owned_room", taskCount: 0, isActive: true, updatedAt: "2026-05-01T00:00:00Z" });
    expect(lists.shared.map((i: any) => [i.id, i.kind])).toEqual([
      ["room-r2", "shared_room"],
      ["room-r9", "cached_room"]
    ]);
    expect(lists.shared[0].taskCount).toBeNull();
    expect(lists.shared[1].badge).toBe("Opened via link");
  });

  it("transfer rules: drops only copy, rooms are never moved, blocked cloud explained", () => {
    const { getTransferOptions, getDropTransfer } = pm;
    expect(getTransferOptions("local").map((o: any) => o.kind)).toEqual(["copy_to_cloud", "move_to_cloud", undefined]);
    expect(getTransferOptions("owned_room").map((o: any) => o.kind)).toEqual(["copy_to_device", undefined]);
    for (const kind of ["owned_room", "shared_room", "cached_room"]) {
      expect(getTransferOptions(kind).some((o: any) => o.kind === "move_to_cloud")).toBe(false);
    }
    expect(getTransferOptions("local", "sign in with GitHub first").filter((o: any) => o.kind)).toEqual([]);
    expect(getDropTransfer("local", "cloud")).toBe("copy_to_cloud");
    expect(getDropTransfer("owned_room", "device")).toBe("copy_to_device");
    expect(getDropTransfer("owned_room", "shared")).toBeNull();
    expect(getDropTransfer("local", "cloud", "verify first")).toBeNull();
    for (const kind of ["template", "local", "owned_room", "shared_room", "cached_room"]) {
      for (const list of ["device", "cloud", "shared"]) {
        expect(getDropTransfer(kind, list)).not.toBe("move_to_cloud");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
describe("Modal shell", () => {
  const Dialog = ({ onClose, label = "A", dismissOnBackdrop }: { onClose: () => void; label?: string; dismissOnBackdrop?: boolean }) => (
    <host.Modal onClose={onClose} dismissOnBackdrop={dismissOnBackdrop}>
      <host.ModalHeader title={`Title ${label}`} />
      <div className="prompt-modal-body">
        <input aria-label={`first-${label}`} />
        <button type="button">last-{label}</button>
      </div>
    </host.Modal>
  );

  it("has dialog semantics, traps Tab, locks scroll, closes on Escape and returns focus", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    expect(host.isAnyModalOpen()).toBe(true);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Title A");
    expect(document.body.style.overflow).toBe("hidden");

    const last = byText("last-A")!;
    last.focus();
    key(last, "Tab");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close dialog");
    key(document.activeElement!, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);

    const windowKeys = vi.fn();
    window.addEventListener("keydown", windowKeys);
    key(document.activeElement!, "c");
    expect(windowKeys).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowKeys);

    key(document.activeElement!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    render(<></>);
    expect(host.isAnyModalOpen()).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("renders into the themed app root when it exists", () => {
    const app = document.createElement("div");
    app.className = "playground-app";
    document.body.appendChild(app);
    render(<Dialog onClose={() => {}} />);
    expect(app.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("ignores Escape during IME composition and when a child handled it", () => {
    const onClose = vi.fn();
    render(
      <host.Modal onClose={onClose}>
        <host.ModalHeader title="X" />
        <input aria-label="ime" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()} />
      </host.Modal>
    );
    key(document.querySelector('[aria-label="ime"]')!, "Escape");
    key(document.querySelector('[aria-label="Close dialog"]')!, "Escape", { isComposing: true } as any);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape closes only the top-most dialog, which is stacked higher", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    render(
      <>
        <Dialog onClose={closeA} label="A" />
        <Dialog onClose={closeB} label="B" />
      </>
    );
    const overlays = Array.from(document.querySelectorAll<HTMLElement>(".prompt-modal-backdrop"));
    expect(overlays[0].style.zIndex).toBe("");
    expect(overlays[1].style.zIndex).toBe("calc(var(--z-modal, 1000) + 1)");
    key(document.querySelector('[aria-label="first-A"]')!, "Escape");
    expect(closeA).not.toHaveBeenCalled();
    key(document.querySelector('[aria-label="first-B"]')!, "Escape");
    expect(closeB).toHaveBeenCalledTimes(1);
  });

  it("with a detached opener, focus lands on the dialog still open; a lower dialog closing keeps focus above", () => {
    const Harness = ({ showA, showB, showC }: { showA: boolean; showB: boolean; showC: boolean }) => (
      <>
        {showA && <Dialog onClose={() => {}} label="A" />}
        {showB && <Dialog onClose={() => {}} label="B" />}
        {showC && <Dialog onClose={() => {}} label="C" />}
      </>
    );
    render(<Harness showA showB={false} showC={false} />);
    // B is opened from a control inside A that disappears with B's opening flow.
    const transient = document.createElement("button");
    document.querySelector('[role="dialog"]')!.appendChild(transient);
    transient.focus();
    render(<Harness showA showB showC={false} />);
    transient.remove();
    render(<Harness showA showB={false} showC={false} />);
    const cardA = document.querySelector('[role="dialog"]')!;
    expect(document.activeElement).toBe(cardA);

    render(<Harness showA showB={false} showC />);
    const inputC = document.querySelector<HTMLElement>('[aria-label="first-C"]')!;
    inputC.focus();
    render(<Harness showA={false} showB={false} showC />);
    expect(document.activeElement).toBe(inputC);
  });

  it("backdrop closes only when the press started on the backdrop", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    const overlay = document.querySelector<HTMLElement>(".prompt-modal-backdrop")!;
    const card = document.querySelector<HTMLElement>('[role="dialog"]')!;
    act(() => {
      card.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      overlay.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
describe("ConfirmDialog", () => {
  it("requires the typed phrase before confirming", () => {
    const onConfirm = vi.fn();
    render(
      <host.ConfirmDialog title="Delete?" message="gone" confirmLabel="Delete" tone="danger" confirmPhrase="Room One" onConfirm={onConfirm} onCancel={() => {}} />
    );
    const dialog = document.querySelector('[role="alertdialog"]')!;
    const confirmBtn = byText("Delete", 'button[type="submit"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    const input = dialog.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    setInput(input, "Room One");
    expect(confirmBtn.disabled).toBe(false);
    click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
describe("AddPlanModal", () => {
  const Harness = (props: { initialTitle: string; handle: any; destination?: "local" | "new_room"; isLoggedIn?: boolean; onLogin?: any }) => {
    const [title, setTitle] = useState(props.initialTitle);
    const [template, setTemplate] = useState<"blank" | "master" | "clone">("blank");
    return (
      <addPlan.AddPlanModal
        showAddPlanModal
        setShowAddPlanModal={() => {}}
        newPlanTitle={title}
        setNewPlanTitle={setTitle}
        newPlanTemplateType={template}
        setNewPlanTemplateType={setTemplate}
        handleCreateNewPlan={props.handle}
        initialDestination={props.destination}
        isLoggedIn={props.isLoggedIn ?? true}
        isGitHubVerified
        onLogin={props.onLogin}
      />
    );
  };
  const submit = () =>
    act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

  it("Enter with an empty name never creates a plan; exactly two destinations", async () => {
    const handle = vi.fn();
    render(<Harness initialTitle="" handle={handle} />);
    await submit();
    expect(handle).not.toHaveBeenCalled();
    expect((byText("Create plan", 'button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelectorAll('input[name="planDestination"]')).toHaveLength(2);
  });

  it("two quick submits create once", async () => {
    let resolve!: () => void;
    const handle = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<Harness initialTitle="My plan" handle={handle} destination="new_room" />);
    await submit();
    await submit();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith("My plan", "blank", "new_room");
    await act(async () => resolve());
  });

  it("a handler resolving false keeps the dialog open with an alert", async () => {
    const handle = vi.fn(async () => false);
    render(<Harness initialTitle="Room plan" handle={handle} destination="new_room" />);
    await submit();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("The cloud room was not created");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("opens preselected on a new room and asks signed-out users to sign in", async () => {
    const handle = vi.fn();
    const onLogin = vi.fn();
    render(<Harness initialTitle="Room plan" handle={handle} destination="new_room" isLoggedIn={false} onLogin={onLogin} />);
    expect((document.querySelector('input[value="new_room"]') as HTMLInputElement).checked).toBe(true);
    await submit();
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(handle).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
describe("PlanManagerModal", () => {
  const alpha = { id: "p1", name: "Alpha", updatedAt: "2026-01-01T00:00:00Z", data: { meta: { title: "Alpha" }, tasks: [{ id: "a" }] }, source: "local" as const };
  const owned = [{ roomId: "r1", title: "Room One", ownerUid: "u", ownerUsername: "me", role: "owner" as const, updatedAt: "2026-01-01T00:00:00Z", createdAt: "" }];
  const cached = { id: "room-r9", name: "Link room", updatedAt: "2026-02-01T00:00:00Z", data: { tasks: [] }, source: "room" as const, roomId: "r9", role: "viewer" as const };

  const baseProps = () => ({
    show: true,
    setShow: vi.fn(),
    activeProjectId: "default",
    customProjects: [alpha, cached] as any[],
    ownedRooms: owned,
    sharedRooms: [],
    userProfile: { username: "me" } as any,
    isLoggedIn: true,
    isCloudVerified: true,
    onSelectProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDuplicateProject: vi.fn(),
    onRenameProject: vi.fn(),
    onCreateLocalCopy: vi.fn(),
    onPublishToCloud: vi.fn(async () => "newroom" as string | null),
    onDeleteCloudRoom: vi.fn(async () => {}),
    onLeaveCloudRoom: vi.fn(async () => {}),
    onOpenShareRoom: vi.fn(),
    onOpenAddPlanModal: vi.fn(),
    onCreateNewRoom: vi.fn(),
    onImportFile: vi.fn(),
    showToast: vi.fn()
  });

  const transferButton = (name: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label='Move or copy "${name}" to another list']`)!;
  const moreButton = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label='More actions for "${name}"']`)!;
  const menuItem = (text: string) => byText(text, '[role="menuitem"]')!;
  const chooseTransfer = async (name: string, label: string) => {
    click(transferButton(name));
    await act(async () => menuItem(label).click());
  };
  const confirmButton = (label: string) => byText(label, '[role="alertdialog"] button[type="submit"]') as HTMLButtonElement;

  it("shows exactly three lists and explains disabled targets in the transfer menu", () => {
    render(<pm.PlanManagerModal {...baseProps()} />);
    const titles = Array.from(document.querySelectorAll("section h3")).map((h) => h.childNodes[0].textContent);
    expect(titles).toEqual(["This device", "My cloud", "Shared with me"]);
    expect(document.querySelector("select")).toBeNull();
    click(transferButton("Alpha"));
    const groups = Array.from(document.querySelectorAll('[role="menu"] [role="group"]')).map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["To My cloud", "To Shared with me"]);
    const disabled = Array.from(document.querySelectorAll('[role="menuitem"][aria-disabled="true"]')).map((o) => o.textContent);
    expect(disabled).toEqual(["Not possibleOnly rooms other people share with you appear there"]);
  });

  it("ArrowDown on the transfer button opens the menu and runs nothing; disabled entries are inert", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    key(transferButton("Alpha"), "ArrowDown");
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(props.onPublishToCloud).not.toHaveBeenCalled();
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement?.textContent).toContain("Move to My cloud");
    click(menuItem("Not possible"));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(props.onPublishToCloud).not.toHaveBeenCalled();
    key(document.activeElement!, "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(transferButton("Alpha"));
    expect(props.setShow).not.toHaveBeenCalled();
  });

  it("copy to cloud publishes once and keeps the device plan; busy guard blocks duplicates across reopen", async () => {
    const props = baseProps();
    let resolve!: (v: string | null) => void;
    props.onPublishToCloud = vi.fn(() => new Promise<string | null>((r) => (resolve = r)));
    render(<pm.PlanManagerModal {...props} />);
    await chooseTransfer("Alpha", "Copy to My cloud");
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    expect(props.onPublishToCloud).toHaveBeenCalledWith("Alpha", alpha.data);
    // Close and reopen while the publish is still pending: still blocked.
    render(<pm.PlanManagerModal {...props} show={false} />);
    render(<pm.PlanManagerModal {...props} show />);
    await chooseTransfer("Alpha", "Copy to My cloud");
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining("Another plan action"), true);
    await act(async () => resolve("newroom"));
    await flush();
    expect(props.onDeleteProject).not.toHaveBeenCalled();
  });

  it("move asks first; Cancel publishes nothing", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    await chooseTransfer("Alpha", "Move to My cloud");
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Move to My cloud?");
    expect(props.onPublishToCloud).not.toHaveBeenCalled();
    click(byText("Cancel", '[role="alertdialog"] button')!);
    await flush();
    expect(props.onPublishToCloud).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("confirmed move removes the device copy once the room is listed, without a second prompt", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    await chooseTransfer("Alpha", "Move to My cloud");
    await act(async () => confirmButton("Move to My cloud").click());
    await flush();
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    expect(props.onDeleteProject).not.toHaveBeenCalled();
    const roomProject = { id: "room-newroom", name: "Alpha", updatedAt: "", data: alpha.data, source: "room" as const, roomId: "newroom" };
    render(<pm.PlanManagerModal {...props} show={false} customProjects={[roomProject, alpha]} activeProjectId="room-newroom" />);
    expect(props.onDeleteProject).toHaveBeenCalledTimes(1);
    expect(props.onDeleteProject).toHaveBeenCalledWith("p1", { confirm: false });
    expect(props.showToast).toHaveBeenLastCalledWith('Moved "Alpha" to My cloud.');
    render(<pm.PlanManagerModal {...props} show={false} customProjects={[roomProject]} activeProjectId="room-newroom" />);
    expect(props.onDeleteProject).toHaveBeenCalledTimes(1);
  });

  it("a move whose room never appears expires after 60 s and keeps the device copy", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    click(transferButton("Alpha"));
    click(menuItem("Move to My cloud"));
    await act(async () => {
      confirmButton("Move to My cloud").click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(30_000));
    // An autosave re-render must not postpone the deadline.
    render(<pm.PlanManagerModal {...props} customProjects={[{ ...alpha, updatedAt: "2026-03-01T00:00:00Z" }, cached]} />);
    await act(async () => vi.advanceTimersByTime(30_001));
    expect(props.showToast).toHaveBeenLastCalledWith(expect.stringContaining("was also kept on this device"), true);
    const roomProject = { id: "room-newroom", name: "Alpha", updatedAt: "", data: alpha.data, source: "room" as const, roomId: "newroom" };
    render(<pm.PlanManagerModal {...props} customProjects={[roomProject, alpha]} />);
    expect(props.onDeleteProject).not.toHaveBeenCalled();
  });

  it("failed move removes nothing", async () => {
    const props = baseProps();
    props.onPublishToCloud = vi.fn(async () => null);
    render(<pm.PlanManagerModal {...props} />);
    await chooseTransfer("Alpha", "Move to My cloud");
    await act(async () => confirmButton("Move to My cloud").click());
    await flush();
    render(<pm.PlanManagerModal {...props} customProjects={[alpha]} />);
    expect(props.onDeleteProject).not.toHaveBeenCalled();
  });

  it("saving a room to the device copies fresh cloud data and never deletes the room", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    await chooseTransfer("Room One", "Save a copy to this device");
    await flush();
    expect(getRoomMock).toHaveBeenCalledWith("r1");
    expect(props.onCreateLocalCopy).toHaveBeenCalledWith("Room One", expect.objectContaining({ tasks: expect.any(Array) }));
    expect(props.onDeleteCloudRoom).not.toHaveBeenCalled();
    expect(props.onLeaveCloudRoom).not.toHaveBeenCalled();
  });

  const dragEvent = (type: string, types: string[]) => {
    const event = new Event(type, { bubbles: true, cancelable: true }) as any;
    const store: Record<string, string> = {};
    event.dataTransfer = {
      types,
      effectAllowed: "all",
      dropEffect: "none",
      setData: (t: string, v: string) => (store[t] = v),
      getData: (t: string) => store[t] ?? ""
    };
    return event;
  };

  it("drag & drop copies with the private type and ignores foreign drags", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    const card = transferButton("Room One").closest(".plan-card")!;
    const deviceColumn = document.getElementById("plan-list-panel-device")!;
    act(() => {
      card.dispatchEvent(dragEvent("dragstart", ["application/x-jantt-plan", "text/plain"]));
    });
    // A foreign text drag while a card drag is in flight is not accepted.
    const foreign = dragEvent("dragover", ["text/plain"]);
    act(() => {
      deviceColumn.dispatchEvent(foreign);
    });
    expect(foreign.defaultPrevented).toBe(false);
    const over = dragEvent("dragover", ["application/x-jantt-plan"]);
    act(() => {
      deviceColumn.dispatchEvent(over);
    });
    expect(over.defaultPrevented).toBe(true);
    await act(async () => {
      deviceColumn.dispatchEvent(dragEvent("drop", ["application/x-jantt-plan"]));
    });
    await flush();
    expect(props.onCreateLocalCopy).toHaveBeenCalledTimes(1);
    expect(props.onDeleteCloudRoom).not.toHaveBeenCalled();
    expect(props.onLeaveCloudRoom).not.toHaveBeenCalled();
  });

  it("a file dropped on the dialog never navigates away", () => {
    render(<pm.PlanManagerModal {...baseProps()} />);
    const over = dragEvent("dragover", ["Files"]);
    const drop = dragEvent("drop", ["Files"]);
    act(() => {
      document.querySelector(".plan-board-container")!.dispatchEvent(over);
      document.querySelector(".plan-board-container")!.dispatchEvent(drop);
    });
    expect(over.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
  });

  it("deleting a room needs the typed room name; the actions menu is a real menu", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    const more = moreButton("Room One");
    click(more);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement?.textContent).toContain("Export as CSV");
    key(document.activeElement!, "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);

    click(more);
    click(menuItem("Delete room for everyone"));
    const dialog = document.querySelector('[role="alertdialog"]')!;
    const confirmBtn = confirmButton("Delete room permanently");
    expect(confirmBtn.disabled).toBe(true);
    setInput(dialog.querySelector("input")!, "Room One");
    await act(async () => confirmBtn.click());
    await flush();
    expect(props.onDeleteCloudRoom).toHaveBeenCalledWith("r1");
  });

  it("local delete shows exactly one in-app confirmation; Cancel deletes nothing", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    click(moreButton("Alpha"));
    click(menuItem("Delete plan"));
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(props.onDeleteProject).not.toHaveBeenCalled();
    click(byText("Cancel", '[role="alertdialog"] button')!);
    expect(props.onDeleteProject).not.toHaveBeenCalled();

    click(moreButton("Alpha"));
    click(menuItem("Delete plan"));
    await act(async () => confirmButton("Delete plan").click());
    await flush();
    expect(props.onDeleteProject).toHaveBeenCalledTimes(1);
    expect(props.onDeleteProject).toHaveBeenCalledWith("p1", { confirm: false });
  });

  it("removing a cached room asks in-app and only removes the local cache", async () => {
    const props = baseProps();
    render(<pm.PlanManagerModal {...props} />);
    click(moreButton("Link room"));
    click(menuItem("Remove from this device"));
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("are not affected");
    await act(async () => confirmButton("Remove from this device").click());
    await flush();
    expect(props.onDeleteProject).toHaveBeenCalledWith("room-r9", { confirm: false });
    expect(props.onDeleteCloudRoom).not.toHaveBeenCalled();
    expect(props.onLeaveCloudRoom).not.toHaveBeenCalled();
  });

  it("signed out: cloud list becomes a sign-in panel and cloud targets are disabled", () => {
    const props = { ...baseProps(), isLoggedIn: false, userProfile: null, ownedRooms: [], onLogin: vi.fn() };
    render(<pm.PlanManagerModal {...props} />);
    expect(document.body.textContent).toContain("Sign in to use cloud rooms");
    click(transferButton("Alpha"));
    const enabled = Array.from(document.querySelectorAll('[role="menuitem"]:not([aria-disabled])'));
    expect(enabled).toHaveLength(0);
    expect(document.querySelector('[role="menu"]')!.textContent).toContain("Sign in with GitHub first");
  });
});

/* ------------------------------------------------------------------ */
describe("ShareModal", () => {
  const baseProps = (overrides: any = {}) => ({
    showShareModal: true,
    setShowShareModal: vi.fn(),
    currentProjectName: "Room plan",
    parsedData: { tasks: [] },
    activeView: "gantt",
    activeTheme: { label: "Noir", mode: "dark" },
    activeProject: { id: "room-abc", name: "Room plan", updatedAt: "", data: { tasks: [] }, source: "room", roomId: "abc", role: "collaborator" },
    activeProjectId: "room-abc",
    shareUrl: "https://x.test/?room=abc&view=gantt#key=SECRET",
    setIsSidebarCollapsed: vi.fn(),
    handleDownloadJson: vi.fn(),
    isLoggedIn: true,
    isCloudVerified: true,
    showToast: vi.fn(),
    ...overrides
  });

  it("never shows, copies, opens or embeds the editor key", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const shareFn = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: shareFn, configurable: true });
    render(<share.ShareModal {...baseProps({ roomRole: "owner" })} />);
    expect(document.body.innerHTML).not.toContain("SECRET");
    expect((document.getElementById("share-link-input") as HTMLInputElement).value).toBe("https://x.test/?room=abc&view=gantt");
    await act(async () => byText("Copy embed code")!.click());
    expect(writeText).toHaveBeenLastCalledWith(expect.not.stringContaining("key="));
    await act(async () => byText("Copy link")!.click());
    expect(writeText).toHaveBeenLastCalledWith("https://x.test/?room=abc&view=gantt");
    click(byText("WhatsApp")!);
    expect(open.mock.calls[0][0]).not.toContain("SECRET");
    await act(async () => byText("More...")!.click());
    expect(JSON.stringify(shareFn.mock.calls[0])).not.toContain("SECRET");
    expect((document.querySelector('a[href]') as HTMLAnchorElement).href).not.toContain("SECRET");
    expect(document.body.textContent).toContain("Your role: Owner");
    expect(document.body.textContent).toContain("Manage teammates & invites");
    open.mockRestore();
  });

  it("measures the shared (stripped) link for the WhatsApp warning", () => {
    const longUrl = `https://x.test/?view=gantt#data=${"a".repeat(2000)}`;
    render(<share.ShareModal {...baseProps({ activeProject: undefined, activeProjectId: "p1", shareUrl: longUrl, isWhatsAppSafe: true })} />);
    expect(document.body.textContent).toContain("This link may be cut off in WhatsApp");
  });

  it("viewers get no manage action but can make a local copy", () => {
    const onMakeLocalCopy = vi.fn();
    const props = baseProps({ roomRole: "viewer", onMakeLocalCopy });
    render(<share.ShareModal {...props} />);
    expect(document.body.textContent).toContain("Your role: Viewer");
    expect(byText("Manage teammates")).toBeUndefined();
    click(byText("Make an editable copy")!);
    expect(onMakeLocalCopy).toHaveBeenCalledTimes(1);
  });

  it("signed-out room visitors are asked to sign in instead of managing teammates", () => {
    const onLogin = vi.fn();
    render(<share.ShareModal {...baseProps({ roomRole: "editor", isLoggedIn: false, onLogin })} />);
    expect(byText("Teammates & invite links")).toBeUndefined();
    click(byText("Sign in with GitHub to edit and invite")!);
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("export failures are reported instead of failing silently", () => {
    const props = baseProps({ parsedData: { tasks: null } as any, roomRole: "owner" });
    render(<share.ShareModal {...props} />);
    click(byText("MS Project")!);
    expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining("MS Project export failed"), true);
  });
});
