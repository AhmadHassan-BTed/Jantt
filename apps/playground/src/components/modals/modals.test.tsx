// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { JanttData } from "@jantt/core";
import type { SavedProject } from "../../types";
import type { UserProfile, UserRoomPointer } from "../../firebase";
import { ConfirmDialog, Modal, ModalHeader, buildExportFilename } from "./ModalHost";
import {
  PlanManagerModal,
  buildPlanLists,
  getDropTransfer,
  getTransferOptions,
  type PlanItemKind,
  type PlanListId,
  type PlanManagerModalProps
} from "./PlanManagerModal";
import { ShareModal, buildEmbedSnippet, isShareableWebUrl, stripShareSecrets } from "./ShareModal";
import { AddPlanModal, type PlanDestination } from "./AddPlanModal";

const { getRoomMock } = vi.hoisted(() => ({
  getRoomMock: vi.fn(async (roomId: string) => ({
    meta: { roomId, title: "remote" },
    data: { meta: { title: "remote" }, tasks: [{ id: "r1", label: "Remote task", start: "2026-01-01", end: "2026-01-02" }] }
  }))
}));

// Lets a test make the MS Project exporter throw; otherwise the real exporter runs.
const interopFailure = vi.hoisted(() => ({ msProject: null as Error | null }));
vi.mock("@jantt/interop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@jantt/interop")>();
  return {
    ...actual,
    exportMsProjectXml: (...args: Parameters<typeof actual.exportMsProjectXml>) => {
      if (interopFailure.msProject) throw interopFailure.msProject;
      return actual.exportMsProjectXml(...args);
    }
  };
});

// The dialogs only need these two from the Firebase layer; nothing touches the network.
vi.mock("../../firebase", () => ({
  ENABLE_GITHUB_VERIFICATION_GATE: true,
  getRoom: (roomId: string) => getRoomMock(roomId)
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // jsdom has no layout: report every element as rendered so focus management sees it.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  getRoomMock.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const render = (ui: React.ReactElement) => act(() => root.render(ui));
const key = (el: Element, k: string, extra: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
  });
const click = (el: Element) => act(() => (el as HTMLElement).click());
const clickAsync = (el: Element) =>
  act(async () => {
    (el as HTMLElement).click();
  });
const setInput = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const byText = (text: string, selector = "button") =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.textContent?.includes(text));

/* ------------------------------------------------------------------ */
describe("pure helpers", () => {
  it("stripShareSecrets removes editor secrets but keeps everything else byte-for-byte", () => {
    expect(stripShareSecrets("https://x.test/app/?room=abc&view=gantt&theme=noir#key=S3CR3T")).toBe(
      "https://x.test/app/?room=abc&view=gantt&theme=noir"
    );
    expect(stripShareSecrets("https://x.test/?view=gantt#data=AbC-_123%3D")).toBe("https://x.test/?view=gantt#data=AbC-_123%3D");
    expect(stripShareSecrets("https://x.test/?key=1&room=a#edit=2&data=x")).toBe("https://x.test/?room=a#data=x");
    expect(stripShareSecrets("https://x.test/?room=a#%6Bey=encoded")).toBe("https://x.test/?room=a");
    expect(stripShareSecrets("null/path?room=a#key=zz")).toBe("null/path?room=a");
    expect(stripShareSecrets("")).toBe("");
  });

  it("buildEmbedSnippet escapes every interpolated value for an HTML attribute", () => {
    const snippet = buildEmbedSnippet('https://x.test/?a=1&b="2"', `A "b" <c> 'd'`);
    expect(snippet).toContain('src="https://x.test/?a=1&amp;b=&quot;2&quot;"');
    expect(snippet).toContain('title="Jantt plan: A &quot;b&quot; &lt;c&gt; &#39;d&#39;"');
    expect(snippet.match(/"/g)?.length).toBe(snippet.match(/="[^"]*"/g)!.length * 2);
  });

  it("isShareableWebUrl accepts only absolute http(s) links", () => {
    expect(isShareableWebUrl("https://x.test/?room=a")).toBe(true);
    expect(isShareableWebUrl("http://localhost:5173/")).toBe(true);
    expect(isShareableWebUrl("javascript:alert(1)")).toBe(false);
    expect(isShareableWebUrl("data:text/html,<b>x</b>")).toBe(false);
    expect(isShareableWebUrl("/relative/path")).toBe(false);
    expect(isShareableWebUrl("")).toBe(false);
  });

  it("buildExportFilename slugs names and uses the local date", () => {
    const now = new Date();
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
      .join("-");
    expect(buildExportFilename("Q4 Plan / Release!", "csv")).toBe(`q4-plan-release-${today}.csv`);
    expect(buildExportFilename("", "json")).toBe(`jantt-plan-${today}.json`);
    expect(buildExportFilename("Été 2026 ✨", "json")).toBe(`été-2026-${today}.json`);
  });

  it("buildPlanLists makes exactly three lists, including cached rooms in no pointer list", () => {
    const lists = buildPlanLists({
      customProjects: [
        { id: "p1", name: "Alpha", updatedAt: "2026-01-01T00:00:00Z", data: { tasks: [{}, {}] } as JanttData, source: "local" },
        { id: "room-r1", name: "Room One cache", updatedAt: "2026-05-01T00:00:00Z", data: { tasks: [{}] } as JanttData, source: "room", roomId: "r1" },
        { id: "room-r9", name: "Link room", updatedAt: "2026-02-01T00:00:00Z", data: { tasks: [] } as unknown as JanttData, source: "room", roomId: "r9", role: "viewer" }
      ],
      ownedRooms: [room({ roomId: "r1", title: "Room One", role: "owner", updatedAt: "2025-01-01T00:00:00Z", taskCount: 7 })],
      sharedRooms: [
        room({ roomId: "r2", title: "Shared", ownerUid: "o", ownerUsername: "bob", role: "editor", updatedAt: "2025-01-01T00:00:00Z" }),
        room({ roomId: "r1", title: "dup", role: "editor" })
      ],
      activeProjectId: "room-r1",
      isLoggedIn: true
    });
    expect(Object.keys(lists)).toEqual(["device", "cloud", "shared"]);
    expect(lists.device.map((i) => i.id)).toEqual(["p1", "default"]);
    expect(lists.cloud).toHaveLength(1);
    expect(lists.cloud[0]).toMatchObject({ id: "room-r1", kind: "owned_room", taskCount: 1, isActive: true, updatedAt: "2026-05-01T00:00:00Z" });
    expect(lists.shared.map((i) => [i.id, i.kind])).toEqual([
      ["room-r2", "shared_room"],
      ["room-r9", "cached_room"]
    ]);
    expect(lists.shared[0].taskCount).toBeNull();
    expect(lists.shared[1].badge).toBe("Opened via link");
  });

  it("transfer rules: drops only copy, rooms are never moved, blocked cloud is explained", () => {
    expect(getTransferOptions("local").map((o) => o.kind)).toEqual(["copy_to_cloud", "move_to_cloud", undefined]);
    expect(getTransferOptions("owned_room").map((o) => o.kind)).toEqual(["copy_to_device", undefined]);
    const blocked = getTransferOptions("local", "sign in with GitHub first");
    expect(blocked.filter((o) => o.kind)).toEqual([]);
    expect(blocked.every((o) => Boolean(o.disabledReason))).toBe(true);
    expect(getDropTransfer("local", "cloud")).toBe("copy_to_cloud");
    expect(getDropTransfer("template", "cloud")).toBe("copy_to_cloud");
    expect(getDropTransfer("owned_room", "device")).toBe("copy_to_device");
    expect(getDropTransfer("owned_room", "shared")).toBeNull();
    expect(getDropTransfer("shared_room", "cloud")).toBe("copy_to_cloud");
    expect(getDropTransfer("local", "cloud", "verify first")).toBeNull();
    const kinds: PlanItemKind[] = ["template", "local", "owned_room", "shared_room", "cached_room"];
    const lists: PlanListId[] = ["device", "cloud", "shared"];
    for (const kind of kinds) {
      for (const list of lists) {
        expect(getDropTransfer(kind, list)).not.toBe("move_to_cloud");
      }
    }
  });
});

function room(overrides: Partial<UserRoomPointer> & { roomId: string }): UserRoomPointer {
  return {
    title: overrides.roomId,
    ownerUid: "u",
    ownerUsername: "me",
    role: "owner",
    updatedAt: "",
    createdAt: "",
    ...overrides
  } as UserRoomPointer;
}

/* ------------------------------------------------------------------ */
describe("Modal shell", () => {
  const Dialog = ({ onClose, label = "A", dismissOnBackdrop }: { onClose: () => void; label?: string; dismissOnBackdrop?: boolean }) => (
    <Modal onClose={onClose} dismissOnBackdrop={dismissOnBackdrop}>
      <ModalHeader title={`Title ${label}`} />
      <div className="prompt-modal-body">
        <input aria-label={`first-${label}`} data-autofocus />
        <button type="button">last-{label}</button>
      </div>
    </Modal>
  );

  it("has dialog semantics, locks scroll, keeps keys from the app, closes on Escape and returns focus", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const titleId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)?.textContent).toBe("Title A");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("first-A");
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialog.querySelector('[aria-label="Close dialog"]')).not.toBeNull();

    const windowKeys = vi.fn();
    window.addEventListener("keydown", windowKeys);
    key(document.activeElement!, "c");
    expect(windowKeys).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowKeys);

    key(document.activeElement!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    render(<></>);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("traps Tab inside the card", () => {
    render(<Dialog onClose={() => {}} />);
    const last = byText("last-A")!;
    last.focus();
    key(last, "Tab");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close dialog");
    key(document.activeElement!, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("ignores Escape during IME composition and when a child handled it", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <ModalHeader title="X" />
        <input aria-label="ime" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()} />
      </Modal>
    );
    key(document.querySelector('[aria-label="ime"]')!, "Escape");
    key(document.querySelector('[aria-label="Close dialog"]')!, "Escape", { isComposing: true });
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
    expect(overlays[1].style.zIndex).not.toBe("");
    key(document.querySelector('[aria-label="first-A"]')!, "Escape");
    expect(closeA).not.toHaveBeenCalled();
    key(document.querySelector('[aria-label="first-B"]')!, "Escape");
    expect(closeB).toHaveBeenCalledTimes(1);
  });

  it("Escape with focus on <body> closes the top dialog", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    key(document.body, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it("dismissOnBackdrop=false keeps the dialog open", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} dismissOnBackdrop={false} />);
    const overlay = document.querySelector<HTMLElement>(".prompt-modal-backdrop")!;
    act(() => {
      overlay.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
describe("ConfirmDialog", () => {
  it("requires the typed phrase before confirming", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="Delete?" message="gone" confirmLabel="Delete" tone="danger" confirmPhrase="Room One" onConfirm={onConfirm} onCancel={() => {}} />
    );
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog).not.toBeNull();
    const confirmBtn = byText("Delete", 'button[type="submit"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    const input = dialog.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    setInput(input, "Room On");
    expect(confirmBtn.disabled).toBe(true);
    setInput(input, "Room One");
    expect(confirmBtn.disabled).toBe(false);
    click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a danger confirmation focuses Cancel, never the destructive button", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Leave?" message="x" confirmLabel="Leave room" tone="danger" onConfirm={() => {}} onCancel={onCancel} />);
    expect(document.activeElement?.textContent).toBe("Cancel");
    key(document.activeElement!, "Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
describe("AddPlanModal", () => {
  type CreatePlan = (title?: string, templateType?: "blank" | "master" | "clone", destination?: PlanDestination) => boolean | void | Promise<boolean | void>;

  const Harness = (props: {
    initialTitle: string;
    handle: CreatePlan;
    destination?: PlanDestination;
    isLoggedIn?: boolean;
    isSigningIn?: boolean;
    onLogin?: () => void;
  }) => {
    const [title, setTitle] = useState(props.initialTitle);
    const [template, setTemplate] = useState<"blank" | "master" | "clone">("blank");
    return (
      <AddPlanModal
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
        isSigningIn={props.isSigningIn}
        onLogin={props.onLogin}
      />
    );
  };

  it("Enter with an empty name never creates a plan; there is no existing-room option", async () => {
    const handle = vi.fn();
    render(<Harness initialTitle="" handle={handle} />);
    const form = document.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(handle).not.toHaveBeenCalled();
    expect((byText("Create plan", 'button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelectorAll('input[name="planDestination"]')).toHaveLength(2);
  });

  it("creates locally with the chosen template", async () => {
    const handle = vi.fn();
    render(<Harness initialTitle="My plan" handle={handle} />);
    await clickAsync(byText("Create plan", 'button[type="submit"]')!);
    expect(handle).toHaveBeenCalledWith("My plan", "blank", "local");
  });

  it("stays open with a message when the plan was not created", async () => {
    const handle = vi.fn(async () => false);
    render(<Harness initialTitle="Room plan" handle={handle} destination="new_room" />);
    await clickAsync(byText("Create cloud room", 'button[type="submit"]')!);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("The cloud room was not created");
  });

  it("opens preselected on a new room and asks signed-out users to sign in, once", async () => {
    const handle = vi.fn();
    const onLogin = vi.fn();
    render(<Harness initialTitle="Room plan" handle={handle} destination="new_room" isLoggedIn={false} onLogin={onLogin} />);
    expect((document.querySelector('input[value="new_room"]') as HTMLInputElement).checked).toBe(true);
    await clickAsync(byText("Sign in with GitHub", 'button[type="submit"]')!);
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(handle).not.toHaveBeenCalled();

    render(<Harness initialTitle="Room plan" handle={handle} destination="new_room" isLoggedIn={false} onLogin={onLogin} isSigningIn />);
    const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toContain("Signing in");
  });
});

/* ------------------------------------------------------------------ */
describe("PlanManagerModal", () => {
  const alphaData = { meta: { title: "Alpha" }, tasks: [{ id: "a" }] } as unknown as JanttData;
  const alpha: SavedProject = { id: "p1", name: "Alpha", updatedAt: "2026-01-01T00:00:00Z", data: alphaData, source: "local" };
  const owned = [room({ roomId: "r1", title: "Room One", updatedAt: "2026-01-01T00:00:00Z" })];

  const baseProps = () => ({
    show: true,
    setShow: vi.fn(),
    activeProjectId: "default",
    customProjects: [alpha],
    ownedRooms: owned,
    sharedRooms: [] as UserRoomPointer[],
    userProfile: { username: "me" } as UserProfile,
    isLoggedIn: true,
    isCloudVerified: true,
    onSelectProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDuplicateProject: vi.fn(),
    onRenameProject: vi.fn(),
    onCreateLocalCopy: vi.fn(),
    onPublishToCloud: vi.fn(async (): Promise<string | null> => "newroom"),
    onDeleteCloudRoom: vi.fn(async () => {}),
    onLeaveCloudRoom: vi.fn(async () => {}),
    onOpenShareRoom: vi.fn(),
    onOpenAddPlanModal: vi.fn(),
    onCreateNewRoom: vi.fn(),
    onImportFile: vi.fn(),
    showToast: vi.fn()
  });

  const renderManager = (props: PlanManagerModalProps) => render(<PlanManagerModal {...props} />);
  const transferTrigger = (name: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label='Move or copy "${name}" to another list']`)!;
  const actionsTrigger = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label='More actions for "${name}"']`)!;
  const menuItem = (text: string) => byText(text, '[role="menuitem"]');
  const chooseTransfer = async (name: string, entry: string) => {
    click(transferTrigger(name));
    await clickAsync(menuItem(entry)!);
  };
  const card = (name: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(".plan-card")).find((el) => el.querySelector(`[title="${name}"]`))!;

  it("shows exactly three lists and explains targets that are not possible", () => {
    renderManager(baseProps());
    const titles = Array.from(document.querySelectorAll("section h3")).map((h) => h.childNodes[0].textContent);
    expect(titles).toEqual(["This device", "My cloud", "Shared with me"]);
    click(transferTrigger("Alpha"));
    const menu = document.querySelector('[role="menu"]')!;
    const groups = Array.from(menu.querySelectorAll('[role="group"]')).map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["To My cloud", "To Shared with me"]);
    const blocked = Array.from(menu.querySelectorAll('[aria-disabled="true"]')).map((el) => el.textContent);
    expect(blocked).toEqual(["Not possibleOnly rooms other people share with you appear there"]);
    expect(menuItem("Copy to My cloud (keeps it on this device)")).toBeDefined();
    expect(menuItem("Move to My cloud (removes it from this device)")).toBeDefined();
  });

  it("ArrowDown on the Move / copy control opens the menu and never starts a transfer", () => {
    const props = baseProps();
    renderManager(props);
    const trigger = transferTrigger("Alpha");
    trigger.focus();
    key(trigger, "ArrowDown");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    key(document.activeElement!, "ArrowDown");
    key(document.activeElement!, "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(props.onPublishToCloud).not.toHaveBeenCalled();
    expect(props.setShow).not.toHaveBeenCalled();
  });

  it("copy to cloud publishes once, keeps the device plan, and stays single-flight across reopening", async () => {
    const props = baseProps();
    let resolve!: (value: string | null) => void;
    props.onPublishToCloud = vi.fn(() => new Promise<string | null>((r) => (resolve = r)));
    renderManager(props);
    await chooseTransfer("Alpha", "Copy to My cloud");
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    expect(props.onPublishToCloud).toHaveBeenCalledWith("Alpha", alphaData);
    expect(transferTrigger("Alpha").disabled).toBe(true);

    // Closing and reopening while the publish runs must not allow a second one.
    renderManager({ ...props, show: false });
    renderManager(props);
    await chooseTransfer("Alpha", "Copy to My cloud");
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining("still running"), true);

    await act(async () => resolve("newroom"));
    await flush();
    expect(props.onDeleteProject).not.toHaveBeenCalled();
  });

  it("move to cloud is confirmed in-app and removes the device copy only once the room is listed", async () => {
    const props = baseProps();
    renderManager(props);
    await chooseTransfer("Alpha", "Move to My cloud");
    expect(props.onPublishToCloud).not.toHaveBeenCalled();
    const confirmBtn = byText("Move to My cloud", '[role="alertdialog"] button[type="submit"]')!;
    await clickAsync(confirmBtn);
    await flush();
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    expect(props.onDeleteProject).not.toHaveBeenCalled();
    // App closes the manager on success and adds the room project afterwards.
    const roomProject: SavedProject = { id: "room-newroom", name: "Alpha", updatedAt: "", data: alphaData, source: "room", roomId: "newroom" };
    renderManager({ ...props, show: false, customProjects: [roomProject, alpha], activeProjectId: "room-newroom" });
    expect(props.onDeleteProject).toHaveBeenCalledTimes(1);
    expect(props.onDeleteProject).toHaveBeenCalledWith("p1", { confirm: false });
    expect(props.showToast).toHaveBeenCalledWith('Moved "Alpha" to My cloud.');
  });

  it("a move whose room never shows up keeps the device copy", async () => {
    vi.useFakeTimers();
    const props = baseProps();
    renderManager(props);
    await chooseTransfer("Alpha", "Move to My cloud");
    await clickAsync(byText("Move to My cloud", '[role="alertdialog"] button[type="submit"]')!);
    await act(async () => {});
    expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(props.onDeleteProject).not.toHaveBeenCalled();
    expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining("was also kept on this device"), true);
  });

  it("a failed move removes nothing", async () => {
    const props = baseProps();
    props.onPublishToCloud = vi.fn(async () => null);
    renderManager(props);
    await chooseTransfer("Alpha", "Move to My cloud");
    await clickAsync(byText("Move to My cloud", '[role="alertdialog"] button[type="submit"]')!);
    await flush();
    renderManager({ ...props, customProjects: [alpha] });
    expect(props.onDeleteProject).not.toHaveBeenCalled();
  });

  it("saving a room to the device copies fresh cloud data and never deletes the room", async () => {
    const props = baseProps();
    renderManager(props);
    click(transferTrigger("Room One"));
    const blocked = Array.from(document.querySelectorAll('[role="menu"] [aria-disabled="true"]')).map((el) => el.textContent);
    expect(blocked).toEqual(["Not possibleYou own this room"]);
    await clickAsync(menuItem("Save a copy to this device")!);
    await flush();
    expect(getRoomMock).toHaveBeenCalledWith("r1");
    expect(props.onCreateLocalCopy).toHaveBeenCalledWith("Room One", expect.objectContaining({ tasks: expect.any(Array) }));
    expect(props.onDeleteCloudRoom).not.toHaveBeenCalled();
    expect(props.onLeaveCloudRoom).not.toHaveBeenCalled();
  });

  it("the open plan is copied with the live editor data", async () => {
    const live = { meta: { title: "live" }, tasks: [] } as unknown as JanttData;
    const props = { ...baseProps(), activeProjectId: "p1", activePlanData: live };
    renderManager(props);
    await chooseTransfer("Alpha", "Copy to My cloud");
    await flush();
    expect(props.onPublishToCloud).toHaveBeenCalledWith("Alpha", live);
  });

  it("deleting a room needs the typed room name; the card menu is a real menu", async () => {
    const props = baseProps();
    renderManager(props);
    const more = actionsTrigger("Room One");
    click(more);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toContain("Export as JSON");
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement?.textContent).toContain("Export as CSV");
    key(document.activeElement!, "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(props.setShow).not.toHaveBeenCalled(); // Escape closed only the menu

    click(more);
    click(menuItem("Delete room for everyone")!);
    const dialog = document.querySelector('[role="alertdialog"]')!;
    const confirmBtn = byText("Delete room permanently", 'button[type="submit"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    setInput(dialog.querySelector("input")!, "Room One");
    await clickAsync(confirmBtn);
    await flush();
    expect(props.onDeleteCloudRoom).toHaveBeenCalledTimes(1);
    expect(props.onDeleteCloudRoom).toHaveBeenCalledWith("r1");
  });

  it("deleting a local plan asks once in-app, then deletes without a second prompt", async () => {
    const props = baseProps();
    renderManager(props);
    click(actionsTrigger("Alpha"));
    click(menuItem("Delete plan")!);
    expect(props.onDeleteProject).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    click(byText("Cancel", '[role="alertdialog"] button')!);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(props.onDeleteProject).not.toHaveBeenCalled();

    click(actionsTrigger("Alpha"));
    click(menuItem("Delete plan")!);
    await clickAsync(byText("Delete plan", '[role="alertdialog"] button[type="submit"]')!);
    expect(props.onDeleteProject).toHaveBeenCalledTimes(1);
    expect(props.onDeleteProject).toHaveBeenCalledWith("p1", { confirm: false });
  });

  it("signed out: the cloud list asks to sign in and cloud targets are disabled with the reason", () => {
    const onLogin = vi.fn();
    const props = { ...baseProps(), isLoggedIn: false, userProfile: null, ownedRooms: [], onLogin };
    renderManager(props);
    expect(document.body.textContent).toContain("Sign in to use cloud rooms");
    click(transferTrigger("Alpha"));
    const entries = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]'));
    expect(entries.every((el) => el.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(entries[0].textContent).toContain("Sign in with GitHub first");
    click(entries[0]);
    expect(props.onPublishToCloud).not.toHaveBeenCalled();

    renderManager({ ...props, isSigningIn: true });
    const signInButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
      b.textContent?.includes("Signing in")
    );
    expect(signInButtons).toHaveLength(2); // header and the cloud list
    expect(signInButtons.every((b) => b.disabled)).toBe(true);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("Join by link hands over to the room dialog", () => {
    const props = { ...baseProps(), onJoinRoomLink: vi.fn() };
    renderManager(props);
    click(byText("Join by link")!);
    expect(props.setShow).toHaveBeenCalledWith(false);
    expect(props.onJoinRoomLink).toHaveBeenCalledTimes(1);
  });

  describe("drag & drop", () => {
    const fakeDataTransfer = () => {
      const data: Record<string, string> = {};
      return {
        types: [] as string[],
        effectAllowed: "uninitialized",
        dropEffect: "none",
        setData(type: string, value: string) {
          if (!this.types.includes(type)) this.types.push(type);
          data[type] = value;
        },
        getData: (type: string) => data[type] ?? ""
      };
    };
    const fire = (target: Element, type: string, dataTransfer: ReturnType<typeof fakeDataTransfer>) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      act(() => {
        target.dispatchEvent(event);
      });
      return event;
    };
    const panel = (list: PlanListId) => document.getElementById(`plan-list-panel-${list}`)!;

    it("dropping a device plan on My cloud copies it and never removes anything", async () => {
      const props = baseProps();
      renderManager(props);
      const dt = fakeDataTransfer();
      fire(card("Alpha"), "dragstart", dt);
      expect(dt.effectAllowed).toBe("copy");
      const over = fire(panel("cloud"), "dragover", dt);
      expect(over.defaultPrevented).toBe(true);
      expect(document.body.textContent).toContain("Drop to copy into a new cloud room");
      fire(panel("cloud"), "drop", dt);
      await flush();
      expect(props.onPublishToCloud).toHaveBeenCalledTimes(1);
      expect(props.onPublishToCloud).toHaveBeenCalledWith("Alpha", alphaData);
      expect(props.onDeleteProject).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain("Drop to copy");
    });

    it("an invalid target refuses the drop and says why", async () => {
      const props = baseProps();
      renderManager(props);
      const dt = fakeDataTransfer();
      fire(card("Room One"), "dragstart", dt);
      const over = fire(panel("shared"), "dragover", dt);
      expect(over.defaultPrevented).toBe(false);
      expect(document.body.textContent).toContain("Can't drop here: you own this room");
      fire(panel("shared"), "drop", dt);
      fire(card("Room One"), "dragend", dt);
      await flush();
      expect(props.onCreateLocalCopy).not.toHaveBeenCalled();
      expect(props.onDeleteCloudRoom).not.toHaveBeenCalled();
      expect(props.onLeaveCloudRoom).not.toHaveBeenCalled();
    });

    it("drags that did not start on a plan card are ignored", async () => {
      const props = baseProps();
      renderManager(props);
      const dt = fakeDataTransfer();
      dt.setData("text/plain", "hello");
      const over = fire(panel("cloud"), "dragover", dt);
      expect(over.defaultPrevented).toBe(false);
      fire(panel("cloud"), "drop", dt);
      await flush();
      expect(props.onPublishToCloud).not.toHaveBeenCalled();
    });
  });
});

/* ------------------------------------------------------------------ */
describe("ShareModal", () => {
  type ShareProps = React.ComponentProps<typeof ShareModal>;
  const baseProps = (overrides: Partial<ShareProps> = {}): ShareProps => ({
    showShareModal: true,
    setShowShareModal: vi.fn(),
    currentProjectName: "Room plan",
    parsedData: { tasks: [] } as unknown as JanttData,
    activeView: "gantt",
    activeTheme: { label: "Noir", mode: "dark" } as ShareProps["activeTheme"],
    activeProject: { id: "room-abc", name: "Room plan", updatedAt: "", data: { tasks: [] } as unknown as JanttData, source: "room", roomId: "abc", role: "collaborator" },
    activeProjectId: "room-abc",
    shareUrl: "https://x.test/?room=abc&view=gantt#key=SECRET",
    setIsSidebarCollapsed: vi.fn(),
    handleDownloadJson: vi.fn(),
    isLoggedIn: true,
    isCloudVerified: true,
    showToast: vi.fn(),
    ...overrides
  });

  const mockClipboard = () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return writeText;
  };

  it("never shows, copies, opens or embeds the editor key", async () => {
    const writeText = mockClipboard();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ShareModal {...baseProps({ roomRole: "owner" })} />);
    expect(document.body.innerHTML).not.toContain("SECRET");
    expect((document.getElementById("share-link-input") as HTMLInputElement).value).toBe("https://x.test/?room=abc&view=gantt");
    expect(document.querySelector("a[href]")?.getAttribute("href")).toBe("https://x.test/?room=abc&view=gantt");
    await clickAsync(byText("Copy embed code")!);
    expect(writeText).toHaveBeenLastCalledWith(expect.not.stringContaining("key="));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('src="https://x.test/?room=abc&amp;view=gantt"'));
    await clickAsync(byText("Copy link")!);
    expect(writeText).toHaveBeenLastCalledWith("https://x.test/?room=abc&view=gantt");
    click(byText("WhatsApp")!);
    expect(open).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).not.toContain("key=");
    expect(document.body.textContent).toContain("Your role: Owner");
    expect(document.body.textContent).toContain("Manage teammates & invites");
  });

  it("reports a failed copy instead of claiming success", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true
    });
    const originalExecCommand = document.execCommand;
    document.execCommand = vi.fn(() => false);
    try {
      const props = baseProps({ roomRole: "owner" });
      render(<ShareModal {...props} />);
      await clickAsync(byText("Copy link")!);
      expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining("Could not copy"), true);
      expect(byText("Copied!")).toBeUndefined();
    } finally {
      document.execCommand = originalExecCommand;
    }
  });

  it("does not open, embed or hand out a link that is not http(s)", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ShareModal {...baseProps({ roomRole: "owner", shareUrl: "javascript:alert(1)" })} />);
    expect(document.querySelector("a[href]")).toBeNull();
    expect((byText("Copy embed code") as HTMLButtonElement).disabled).toBe(true);
    const whatsApp = byText("WhatsApp") as HTMLButtonElement;
    expect(whatsApp.disabled).toBe(true);
    click(whatsApp);
    expect(open).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain("iframe");
  });

  it("viewers get no manage action but can make a local copy", () => {
    const onMakeLocalCopy = vi.fn();
    const props = baseProps({ roomRole: "viewer", onMakeLocalCopy });
    render(<ShareModal {...props} />);
    expect(document.body.textContent).toContain("Your role: Viewer");
    expect(byText("Manage teammates")).toBeUndefined();
    click(byText("Make an editable copy")!);
    expect(onMakeLocalCopy).toHaveBeenCalledTimes(1);
    expect(props.setShowShareModal).toHaveBeenCalledWith(false);
  });

  it("signed out: the start-room button signs in, and is disabled while a sign-in runs", () => {
    const onLogin = vi.fn();
    const local = { id: "p1", name: "Plan", updatedAt: "", data: { tasks: [] } as unknown as JanttData, source: "local" as const };
    const props = baseProps({ activeProject: local, activeProjectId: "p1", isLoggedIn: false, onLogin, shareUrl: "https://x.test/#data=abc" });
    render(<ShareModal {...props} />);
    click(byText("Sign in with GitHub to start a room")!);
    expect(onLogin).toHaveBeenCalledTimes(1);

    render(<ShareModal {...props} isSigningIn />);
    const busy = byText("Signing in with GitHub") as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
  });

  it("export failures are reported instead of failing silently", () => {
    const props = baseProps({ roomRole: "owner" });
    interopFailure.msProject = new Error("boom");
    try {
      render(<ShareModal {...props} />);
      click(byText("MS Project")!);
    } finally {
      interopFailure.msProject = null;
    }
    expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining("MS Project export failed: boom"), true);
  });
});
