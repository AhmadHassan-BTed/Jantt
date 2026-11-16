// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CloudBar, type CloudBarProps } from "./CloudBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

async function render(props: CloudBarProps) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<CloudBar {...props} />));
}

function button(text: RegExp): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) => text.test(b.textContent || ""));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
});

describe("CloudBar panel", () => {
  it("renders as panel content without strip classes or fixed positioning", async () => {
    await render({ activeRoomId: null, onStartCloudRoom: () => {} });
    const panel = container.querySelector("section")!;
    expect(panel.className).not.toMatch(/cloud-bar/);
    expect(panel.style.position).toBe("");
    expect(panel.style.flexDirection).toBe("column");
  });

  it("offers sign-in instead of room creation when signed out", async () => {
    const onSignIn = vi.fn();
    const onRequestClose = vi.fn();
    await render({ activeRoomId: null, isSignedIn: false, onSignIn, onStartCloudRoom: () => {}, onRequestClose });
    expect(button(/start a cloud room/i)).toBeUndefined();
    await act(async () => button(/sign in/i)!.click());
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("shows role, sync status with Retry, and viewer actions for a room", async () => {
    const onRetrySync = vi.fn();
    const onPromptFork = vi.fn();
    const onOpenShareRoom = vi.fn();
    await render({
      activeRoomId: "room_ab12cd34ef",
      activeRoomTitle: "Launch plan",
      activeRoomRole: "viewer",
      syncStatus: "error",
      syncMessage: "Saving failed",
      onRetrySync,
      onPromptFork,
      onOpenShareRoom,
      onlineUsers: [
        { uid: "u1", username: "bob", displayName: "Bob", status: "online", lastSeen: "", joinedAt: "", photoURL: "https://tracker.example/p.png" }
      ]
    });
    expect(container.textContent).toContain("Launch plan");
    expect(container.textContent).toContain("View only");
    expect(container.textContent).toContain("Saving failed");
    expect(container.querySelector("img")).toBeNull();

    await act(async () => button(/retry/i)!.click());
    expect(onRetrySync).toHaveBeenCalledTimes(1);
    await act(async () => button(/local copy/i)!.click());
    expect(onPromptFork).toHaveBeenCalledTimes(1);
    await act(async () => button(/share & see members/i)!.click());
    expect(onOpenShareRoom).toHaveBeenCalledWith("room_ab12cd34ef");
  });

  it("asks for a second click before leaving a room", async () => {
    const onLeaveRoom = vi.fn();
    await render({ activeRoomId: "room_ab12cd34ef", activeRoomRole: "collaborator", isRoomMember: true, onLeaveRoom });
    await act(async () => button(/leave room/i)!.click());
    expect(onLeaveRoom).not.toHaveBeenCalled();
    await act(async () => button(/click again/i)!.click());
    expect(onLeaveRoom).toHaveBeenCalledWith("room_ab12cd34ef");
  });
});
