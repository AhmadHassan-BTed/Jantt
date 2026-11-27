// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { AppDistributionBanner } from "../layout/AppDistributionBanner";
import {
  AndroidTestingModal,
  JANTT_RATE_THRESHOLD,
  RateAppModal,
  WebAccessModal
} from "./AppDistributionModals";
import { APP_DISTRIBUTION_LINKS } from "../../constants";

const mountedRoots: Array<{ root: Root; host: HTMLElement }> = [];

function render(node: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  host.className = "playground-app";
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  mountedRoots.push({ root, host });
  return host;
}

afterEach(() => {
  while (mountedRoots.length > 0) {
    const entry = mountedRoots.pop()!;
    act(() => {
      entry.root.unmount();
    });
    entry.host.remove();
  }
});

describe("AppDistributionBanner", () => {
  it("shows Android early-testing CTA and Message Me link in browser mode", () => {
    const onOpenAndroidTesting = vi.fn();
    const onDismiss = vi.fn();
    const host = render(
      <AppDistributionBanner
        isAppContext={false}
        isMobile={false}
        onOpenAndroidTesting={onOpenAndroidTesting}
        onOpenWebAccess={vi.fn()}
        onOpenRateApp={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    expect(host.textContent).toContain("early testing");
    expect(host.textContent).toContain("open-source");
    const joinBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Join Early Testing")
    );
    expect(joinBtn).toBeTruthy();
    act(() => {
      joinBtn!.click();
    });
    expect(onOpenAndroidTesting).toHaveBeenCalledTimes(1);

    const waLink = host.querySelector(`a[href^="${APP_DISTRIBUTION_LINKS.WHATSAPP_URL}"]`);
    expect(waLink).toBeTruthy();
  });

  it("switches to Web Version + Rate App buttons inside the Android/standalone app", () => {
    const onOpenWebAccess = vi.fn();
    const onOpenRateApp = vi.fn();
    const host = render(
      <AppDistributionBanner
        isAppContext={true}
        isMobile={true}
        onOpenAndroidTesting={vi.fn()}
        onOpenWebAccess={onOpenWebAccess}
        onOpenRateApp={onOpenRateApp}
        onDismiss={vi.fn()}
      />
    );

    expect(host.textContent).toContain("bad rating");
    const webBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Web"));
    const rateBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Rate"));
    expect(webBtn).toBeTruthy();
    expect(rateBtn).toBeTruthy();
    act(() => {
      webBtn!.click();
      rateBtn!.click();
    });
    expect(onOpenWebAccess).toHaveBeenCalledTimes(1);
    expect(onOpenRateApp).toHaveBeenCalledTimes(1);
  });
});

describe("AppDistributionModals", () => {
  it("renders 2-step Android early testing + WhatsApp & GitHub support links", () => {
    const host = render(<AndroidTestingModal show={true} onClose={vi.fn()} />);
    expect(host.textContent).toContain("MIT");
    expect(host.textContent).toContain("bad Play Store rating");
    expect(host.querySelector(`a[href="${APP_DISTRIBUTION_LINKS.ANDROID_TESTER_GROUP_URL}"]`)).toBeTruthy();
    expect(host.querySelector(`a[href="${APP_DISTRIBUTION_LINKS.ANDROID_PLAY_TESTING_URL}"]`)).toBeTruthy();
    expect(host.querySelector(`a[href^="${APP_DISTRIBUTION_LINKS.WHATSAPP_URL}"]`)).toBeTruthy();
    expect(host.querySelector(`a[href="${APP_DISTRIBUTION_LINKS.GITHUB_ISSUES_URL}"]`)).toBeTruthy();
  });

  it("renders WebAccessModal with copy, share, and direct open link", () => {
    const host = render(<WebAccessModal show={true} onClose={vi.fn()} />);
    expect(host.textContent).toContain(APP_DISTRIBUTION_LINKS.WEB_APP_URL);
    expect(host.querySelector(`a[href="${APP_DISTRIBUTION_LINKS.WEB_APP_URL}"]`)).toBeTruthy();
    expect(host.textContent).toContain("Copy Web Link");
    expect(host.textContent).toContain("Share Link");
  });

  it("routes RateAppModal > 4.8 to Play Store and <= 4.8 to WhatsApp + GitHub", () => {
    expect(JANTT_RATE_THRESHOLD).toBe(4.8);
    const host = render(<RateAppModal show={true} onClose={vi.fn()} />);

    const star4 = host.querySelector<HTMLButtonElement>('button[aria-label="4 stars"]');
    const star5 = host.querySelector<HTMLButtonElement>('button[aria-label="5 stars"]');
    expect(star4).toBeTruthy();
    expect(star5).toBeTruthy();

    act(() => {
      star4!.click();
    });
    expect(host.querySelector(`a[href^="${APP_DISTRIBUTION_LINKS.WHATSAPP_URL}"]`)).toBeTruthy();
    expect(host.querySelector(`a[href="${APP_DISTRIBUTION_LINKS.GITHUB_ISSUES_URL}"]`)).toBeTruthy();
    expect(host.querySelector(`a[href="${APP_DISTRIBUTION_LINKS.ANDROID_PLAY_STORE_URL}"]`)).toBeNull();

    act(() => {
      star5!.click();
    });
    expect(host.querySelector(`a[href="${APP_DISTRIBUTION_LINKS.ANDROID_PLAY_STORE_URL}"]`)).toBeTruthy();
  });

  it("contains zero em dashes across app distribution UI files", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "AppDistributionModals.tsx"),
      resolve(here, "../layout/AppDistributionBanner.tsx")
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toContain("\u2014");
    }
  });
});
