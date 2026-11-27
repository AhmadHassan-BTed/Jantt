// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JanttData } from "@jantt/core";
import type { SavedProject } from "../types";

const encodeSpy = vi.hoisted(() => vi.fn(() => "PAYLOAD"));
vi.mock("../utils", () => ({ encodeDataToBase64Url: encodeSpy }));

import { useSharing } from "./useSharing";
import { preloadLocale, setActiveLocale } from "../i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = { meta: { title: "Plan" }, tasks: [] } as unknown as JanttData;
let latest: ReturnType<typeof useSharing>;
let root: Root | null = null;
const showToast = vi.fn();

function Harness({ project }: { project?: SavedProject }) {
  latest = useSharing({
    activeProjectId: project?.id ?? "local-1",
    activeProject: project,
    currentProjectName: "My plan",
    activeView: "kanban",
    selectedThemeId: "noir",
    parsedData: data,
    jsonText: "{}",
    showToast
  });
  return null;
}

async function mount(project?: SavedProject) {
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(<Harness project={project} />));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/?room=room_keepme1#key=secret");
  encodeSpy.mockClear();
  showToast.mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  setActiveLocale("en");
  vi.unstubAllGlobals();
});

describe("useSharing", () => {
  it("localizes native sharing text and its success or failure toast", async () => {
    await preloadLocale("zh-CN");
    setActiveLocale("zh-CN");
    await mount();
    const share = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Share failed"));
    vi.stubGlobal("navigator", { share });

    await act(async () => latest.handleNativeShare());
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "My plan", text: expect.stringMatching(/[\u4e00-\u9fff].*My plan/) }));
    expect(showToast).toHaveBeenLastCalledWith(expect.stringMatching(/[\u4e00-\u9fff]/));

    await act(async () => latest.handleNativeShare());
    expect(showToast).toHaveBeenLastCalledWith(expect.stringMatching(/[\u4e00-\u9fff]/), true);
  });

  it("does not compress the plan while the share dialog is closed", async () => {
    await mount();
    expect(latest.shareUrl).toBe("");
    expect(encodeSpy).not.toHaveBeenCalled();

    await act(async () => latest.setShowShareModal(true));
    expect(encodeSpy).toHaveBeenCalledTimes(1);
    const url = new URL(latest.shareUrl);
    expect(url.searchParams.get("name")).toBe("My plan");
    expect(url.hash).toBe("#data=PAYLOAD");
  });

  it("shares rooms by id only, never with a key", async () => {
    await mount({
      id: "room-room_ab12cd34ef",
      name: "Room",
      updatedAt: "",
      data,
      source: "room",
      roomId: "room_ab12cd34ef",
      secretKey: "sec_legacy"
    });
    await act(async () => latest.setShowShareModal(true));
    const url = new URL(latest.shareUrl);
    expect(url.searchParams.get("room")).toBe("room_ab12cd34ef");
    expect(url.hash).toBe("");
    expect(latest.shareUrl).not.toContain("sec_legacy");
  });

  it("only maintains view and theme in the address bar (room params belong to room sync)", async () => {
    await mount();
    const url = new URL(window.location.href);
    expect(url.searchParams.get("view")).toBe("kanban");
    expect(url.searchParams.get("theme")).toBe("noir");
    expect(url.searchParams.get("room")).toBe("room_keepme1");
  });
});
