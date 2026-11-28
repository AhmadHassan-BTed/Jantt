// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgentApiModal, type AgentApiModalProps } from "./AgentApiModal";
import type { UseApiAccessReturn } from "../../hooks/useApiAccess";
import type { UserProfile, UserRoomPointer } from "../../firebase";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let appHost: HTMLDivElement;

function makeApiAccess(overrides: Partial<UseApiAccessReturn> = {}): UseApiAccessReturn {
  return {
    apiBaseUrl: "https://jantt-cloud-api.example.workers.dev",
    isConfigured: true,
    isLoading: false,
    error: null,
    enabled: false,
    isAdmin: false,
    isConfigAdmin: false,
    tier: null,
    entitlement: null,
    keys: [],
    lastCreatedKey: null,
    clearLastCreatedKey: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    generateKey: vi.fn().mockResolvedValue({
      keyId: "key_1",
      apiKey: "jnt_live_secret_demo_key_1234567890",
      label: "Claude Desktop",
      prefix: "jnt_live_secret_d...",
      createdAt: "2026-11-28T10:00:00.000Z"
    }),
    revokeKey: vi.fn().mockResolvedValue(undefined),
    adminUsers: [],
    isLoadingAdmin: false,
    loadAdminEntitlements: vi.fn().mockResolvedValue(undefined),
    searchUsers: vi.fn().mockResolvedValue([]),
    grantUserAccess: vi.fn().mockResolvedValue(undefined),
    revokeUserAccess: vi.fn().mockResolvedValue({ revokedKeysCount: 1 }),
    ...overrides
  };
}

const PROFILE: UserProfile = {
  uid: "uid-bob",
  username: "bob",
  displayUsername: "Bob",
  displayName: "Bob Builder",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z"
};

const ROOMS: UserRoomPointer[] = [
  {
    roomId: "room_ab12cd34ef",
    title: "Q4 Product Launch",
    ownerUid: "uid-bob",
    ownerUsername: "bob",
    role: "owner",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-28T00:00:00.000Z",
    taskCount: 5
  }
];

async function renderModal(props: Partial<AgentApiModalProps> = {}) {
  appHost = document.createElement("div");
  appHost.className = "playground-app";
  document.body.appendChild(appHost);
  root = createRoot(appHost);
  const fullProps: AgentApiModalProps = {
    show: true,
    setShow: vi.fn(),
    currentUserUid: PROFILE.uid,
    userProfile: PROFILE,
    ownedRooms: ROOMS,
    sharedRooms: [],
    apiAccess: makeApiAccess(),
    showToast: vi.fn(),
    ...props
  };
  await act(async () => {
    root!.render(<AgentApiModal {...fullProps} />);
  });
  return fullProps;
}

function findButton(pattern: RegExp): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => pattern.test(b.textContent || ""));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  appHost.remove();
});

describe("AgentApiModal", () => {
  it("shows locked state with $1/month WhatsApp payment instructions and copyable UID for non-approved users", async () => {
    await renderModal({ apiAccess: makeApiAccess({ enabled: false, isAdmin: false }) });

    expect(document.body.textContent).toContain("Cloud Agent API Locked");
    expect(document.body.textContent).toContain("$1/month");
    expect(document.body.textContent).toContain("payment");
    expect(document.body.textContent).toContain("@bob");
    expect(document.body.textContent).toContain("uid-bob");
    const waLink = document.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
    expect(waLink).toBeTruthy();
    expect(decodeURIComponent(waLink!.href)).toContain("@bob");
    expect(findButton(/admin access control/i)).toBeUndefined();
    expect(findButton(/generate api key/i)).toBeUndefined();
  });

  it("shows key generator, active keys, exposed cloud plans, and MCP snippet for approved users", async () => {
    const apiAccess = makeApiAccess({
      enabled: true,
      tier: "granted",
      keys: [
        {
          keyId: "key_existing",
          label: "Cursor IDE",
          prefix: "jnt_live_abc12345...",
          createdAt: "2026-11-20T00:00:00.000Z"
        }
      ],
      lastCreatedKey: {
        keyId: "key_new",
        apiKey: "jnt_live_fresh_secret_token",
        label: "Claude Desktop",
        prefix: "jnt_live_fresh_se...",
        createdAt: "2026-11-28T10:00:00.000Z"
      }
    });

    await renderModal({ apiAccess });

    expect(document.body.textContent).toContain("Cloud Agent API Enabled");
    expect(document.body.textContent).toContain("Cursor IDE");
    expect(document.body.textContent).toContain("Q4 Product Launch");
    expect(document.body.textContent).toContain("room_ab12cd34ef");
    expect(document.body.textContent).toContain("jnt_live_fresh_secret_token");
    expect(document.body.textContent).toContain("/v1/mcp");

    await act(async () => {
      findButton(/generate api key/i)!.click();
    });
    expect(apiAccess.generateKey).toHaveBeenCalledTimes(1);

    await act(async () => {
      findButton(/revoke/i)!.click();
    });
    expect(apiAccess.revokeKey).toHaveBeenCalledWith("key_existing");
  });

  it("exposes the Admin Access Control tab only to admins and wires grant/revoke actions", async () => {
    const apiAccess = makeApiAccess({
      enabled: true,
      isAdmin: true,
      isConfigAdmin: true,
      tier: "admin",
      adminUsers: [
        {
          uid: "uid-carol",
          username: "carol",
          displayName: "Carol",
          entitlement: {
            uid: "uid-carol",
            enabled: true,
            tier: "paid",
            grantedAt: "2026-11-20T00:00:00.000Z",
            grantedBy: "uid-bob",
            updatedAt: "2026-11-20T00:00:00.000Z"
          },
          isConfigAdmin: false,
          activeKeyCount: 2
        }
      ]
    });

    await renderModal({ apiAccess });

    const adminTab = findButton(/admin access control/i);
    expect(adminTab).toBeDefined();

    await act(async () => {
      adminTab!.click();
    });

    expect(apiAccess.loadAdminEntitlements).toHaveBeenCalled();
    expect(document.body.textContent).toContain("@carol");
    expect(document.body.textContent).toContain("2 active key(s)");

    await act(async () => {
      findButton(/^revoke$/i)!.click();
    });
    expect(apiAccess.revokeUserAccess).toHaveBeenCalledWith("uid-carol", true);
  });
});

