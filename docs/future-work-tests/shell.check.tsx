import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CommandPalette } from "D:/Repos/Jantt/apps/playground/src/components/common/CommandPalette";
import { MobileActionMenuSheet } from "D:/Repos/Jantt/apps/playground/src/components/layout/MobileActionMenuSheet";
import { Toast } from "D:/Repos/Jantt/apps/playground/src/components/common/Toast";
import { useToast } from "D:/Repos/Jantt/apps/playground/src/hooks/useToast";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout; browsers all implement this.
(Element.prototype as any).scrollIntoView = function () {};

let root: Root | null = null;
let container: HTMLDivElement;

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

const noop = () => {};

function paletteProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: noop,
    parsedData: {
      tasks: [
        { id: '<img src=x onerror="window.__xss=1">', name: "Evil task", start: "2026-01-01", end: "2026-01-02", progress: 0 },
        { id: "gone", name: "Evil deleted", start: "2026-01-01", end: "2026-01-02", _deleted: true }
      ]
    } as any,
    activeView: "gantt" as const,
    setActiveView: noop,
    selectedThemeId: "noir",
    setSelectedThemeId: noop,
    showCriticalPath: false,
    onToggleCriticalPath: noop,
    showBaselines: false,
    onToggleBaselines: noop,
    ...overrides
  };
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CommandPalette", () => {
  it("renders task ids as text, never as HTML, and skips deleted tasks", async () => {
    await render(<CommandPalette {...paletteProps()} />);
    const input = document.querySelector<HTMLInputElement>(".command-palette-input")!;
    await act(async () => typeInto(input, "evil"));
    expect(document.querySelector(".command-palette-list img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="window.__xss=1">');
    expect(container.textContent).not.toContain("Evil deleted");
    expect((window as any).__xss).toBeUndefined();
  });

  it("renders nothing while closed", async () => {
    await render(<CommandPalette {...paletteProps({ isOpen: false })} />);
    expect(container.innerHTML).toBe("");
  });

  it("restores focus to the opener on close, but not over a dialog that took focus", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    await render(<CommandPalette {...paletteProps()} />);
    expect(document.activeElement?.className).toContain("command-palette-input");
    await act(async () => root!.render(<CommandPalette {...paletteProps({ isOpen: false })} />));
    expect(document.activeElement).toBe(opener);

    // A dialog that focuses itself during commit (autoFocus) keeps focus.
    await act(async () => root!.render(<CommandPalette {...paletteProps()} />));
    await act(async () =>
      root!.render(
        <>
          <CommandPalette {...paletteProps({ isOpen: false })} />
          <input autoFocus className="other-dialog-input" />
        </>
      )
    );
    expect(document.activeElement?.className).toBe("other-dialog-input");
  });

  it("Escape closes through the input handler and marks the event handled", async () => {
    const onClose = vi.fn();
    await render(<CommandPalette {...paletteProps({ onClose })} />);
    const input = document.querySelector<HTMLInputElement>(".command-palette-input")!;
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(event));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("MobileActionMenuSheet", () => {
  const sheetProps = (overrides: Record<string, unknown> = {}) => ({
    isOpen: true,
    onClose: noop,
    selectedThemeId: "noir",
    setSelectedThemeId: noop,
    saveStatus: "saved" as const,
    autoSaveLabel: "Saved",
    onOpenAutoSave: noop,
    onOpenPromptModal: noop,
    onOpenPlanManager: noop,
    onOpenPeopleModal: noop,
    onOpenJsonEditor: noop,
    ...overrides
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    await render(<MobileActionMenuSheet {...sheetProps({ onClose })} />);
    expect(document.activeElement?.classList.contains("mobile-sheet-card")).toBe(true);
    await act(async () =>
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => root!.render(<MobileActionMenuSheet {...sheetProps({ isOpen: false })} />));
    expect(document.activeElement).toBe(trigger);
  });

  it("shows the view switcher only when asked to", async () => {
    await render(<MobileActionMenuSheet {...sheetProps()} />);
    expect(container.textContent).not.toContain("Views");
    await act(async () =>
      root!.render(<MobileActionMenuSheet {...sheetProps({ activeView: "kanban", setActiveView: noop })} />)
    );
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain("Kanban");
  });
});

describe("Toast queue", () => {
  function Harness({ onReady }: { onReady: (api: ReturnType<typeof useToast>) => void }) {
    const toast = useToast();
    onReady(toast);
    return <Toast toasts={toast.toasts} onDismiss={toast.dismissToast} />;
  }

  it("keeps at most 3, collapses duplicates, uses alert for errors and can be dismissed", async () => {
    vi.useFakeTimers();
    try {
      let api!: ReturnType<typeof useToast>;
      await render(<Harness onReady={(a) => (api = a)} />);
      await act(async () => {
        api.showToast("one");
        api.showToast("two");
        api.showToast("two");
        api.showToast("three");
        api.showToast("boom", true);
      });
      const items = Array.from(container.querySelectorAll(".jantt-toast"));
      expect(items.map((i) => i.textContent)).toEqual(["two", "three", "boom"]);
      expect(items[2].getAttribute("role")).toBe("alert");
      expect(items[0].getAttribute("role")).toBe("status");
      expect(api.toastMessage).toBe("boom");

      await act(async () => (items[0].querySelector("button") as HTMLButtonElement).click());
      expect(container.querySelectorAll(".jantt-toast").length).toBe(2);

      await act(async () => vi.advanceTimersByTime(3600));
      expect(Array.from(container.querySelectorAll(".jantt-toast")).map((i) => i.textContent)).toEqual(["boom"]);
      await act(async () => vi.advanceTimersByTime(5000));
      expect(container.querySelectorAll(".jantt-toast").length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
