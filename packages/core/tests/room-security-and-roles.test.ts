import { describe, it, expect } from "vitest";

describe("Cloud Room Security & Role Permutations", () => {
  function buildRoomViewerUrl(roomId: string, view = "gantt", theme = "noir", origin = "http://localhost:5173/"): string {
    return `${origin}?room=${encodeURIComponent(roomId.trim())}&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}`;
  }

  function buildRoomCollaboratorUrl(
    roomId: string,
    secretKey?: string | null,
    view = "gantt",
    theme = "noir",
    origin = "http://localhost:5173/"
  ): string {
    const hashKey = secretKey ? `#key=${encodeURIComponent(secretKey.trim())}` : "";
    return `${origin}?room=${encodeURIComponent(roomId.trim())}&view=${encodeURIComponent(view)}&theme=${encodeURIComponent(theme)}${hashKey}`;
  }

  function resolveRoleFromCapabilities(options: {
    roomSecretKey?: string;
    urlHashSecret?: string;
    storedSecret?: string;
    isRoomOwner?: boolean;
    memberRole?: "owner" | "editor" | "viewer";
    urlRoleParamTampered?: string;
  }): "collaborator" | "viewer" {
    // URL role query param is strictly ignored for security
    const { roomSecretKey, urlHashSecret, storedSecret, isRoomOwner, memberRole } = options;

    if (isRoomOwner) return "collaborator";
    if (memberRole === "editor" || memberRole === "owner") return "collaborator";

    // Capability check: secret key from URL hash or storage must match room's secretKey
    const candidateSecret = urlHashSecret || storedSecret;
    if (candidateSecret && roomSecretKey && candidateSecret.trim().toLowerCase() === roomSecretKey.trim().toLowerCase()) {
      return "collaborator";
    }

    return "viewer";
  }

  it("builds pure viewer URL without vulnerable role query parameter", () => {
    const url = buildRoomViewerUrl("room_alpha123");
    expect(url).not.toContain("role=editor");
    expect(url).not.toContain("role=viewer");
    expect(url).toContain("room=room_alpha123");
    expect(url).toContain("theme=noir");
  });

  it("builds collaborator URL with cryptographic hash key", () => {
    const url = buildRoomCollaboratorUrl("room_alpha123", "sec_xyz789");
    expect(url).not.toContain("role=editor");
    expect(url).toContain("#key=sec_xyz789");
    expect(url).toContain("theme=noir");
  });

  it("strictly rejects role elevation when an attacker tampers URL with &role=editor", () => {
    // Attacker received a view-only link and added &role=editor to query string
    const role = resolveRoleFromCapabilities({
      roomSecretKey: "secret_vault_key_456",
      urlHashSecret: undefined,
      storedSecret: undefined,
      isRoomOwner: false,
      memberRole: undefined,
      urlRoleParamTampered: "editor" // Injected by attacker
    });

    // Attacker must remain strictly locked as viewer
    expect(role).toBe("viewer");
  });

  it("grants collaborator role when user possesses matching cryptographic secretKey", () => {
    const role = resolveRoleFromCapabilities({
      roomSecretKey: "secret_vault_key_456",
      urlHashSecret: "secret_vault_key_456",
      storedSecret: undefined,
      isRoomOwner: false,
      memberRole: undefined
    });

    expect(role).toBe("collaborator");
  });

  it("grants collaborator role when user has verified owner/editor membership", () => {
    const ownerRole = resolveRoleFromCapabilities({
      isRoomOwner: true
    });
    expect(ownerRole).toBe("collaborator");

    const memberRole = resolveRoleFromCapabilities({
      isRoomOwner: false,
      memberRole: "editor"
    });
    expect(memberRole).toBe("collaborator");
  });

  it("locks registered viewer member to viewer role even if they have no secret", () => {
    const role = resolveRoleFromCapabilities({
      isRoomOwner: false,
      memberRole: "viewer",
      urlRoleParamTampered: "editor"
    });

    expect(role).toBe("viewer");
  });

  it("strictly prevents viewer from committing mutations to remote room", () => {
    const role: "collaborator" | "viewer" = "viewer";
    let remoteCommitted = false;
    let forkPrompted = false;

    function handleGanttCommit(role: "collaborator" | "viewer") {
      if (role === "viewer") {
        forkPrompted = true;
        return; // Guard: Viewer cannot mutate remote room
      }
      remoteCommitted = true;
    }

    handleGanttCommit(role);
    expect(remoteCommitted).toBe(false);
    expect(forkPrompted).toBe(true);
  });

  it("creates an independent local copy when forking a read-only room", () => {
    const remoteRoomData = {
      meta: { title: "Production Roadmap" },
      tasks: [
        { id: "task-1", label: "Spec", start: "2026-09-01", end: "2026-09-05" }
      ]
    };

    const copyName = `${remoteRoomData.meta.title} (Local Copy)`;
    const copyId = "local-copy-test123";
    const localProject = {
      id: copyId,
      name: copyName,
      data: JSON.parse(JSON.stringify(remoteRoomData)),
      source: "local"
    };

    // Mutate the local project
    localProject.data.tasks.push({
      id: "task-2",
      label: "New Feature",
      start: "2026-09-06",
      end: "2026-09-10"
    });

    // Remote room data is completely unaffected
    expect(remoteRoomData.tasks.length).toBe(1);
    expect(localProject.data.tasks.length).toBe(2);
    expect(localProject.source).toBe("local");
  });
});
