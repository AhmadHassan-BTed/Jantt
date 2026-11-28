import React, { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  UserCheck,
  UserX
} from "lucide-react";
import type {
  AdminUserAccessSummary,
  ApiAccessTier,
  UserProfile,
  UserRoomPointer
} from "../../firebase";
import type { UseApiAccessReturn } from "../../hooks/useApiAccess";
import { Modal, ModalHeader } from "../modals/ModalHost";

export interface AgentApiModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  currentUserUid: string | null;
  userProfile: UserProfile | null;
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  apiAccess: UseApiAccessReturn;
  onLogin?: () => void;
  showToast?: (msg: string, isErr?: boolean) => void;
}

type ModalTab = "agent" | "admin";
type SnippetTab = "mcp" | "curl" | "openapi" | "guides";

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  gap: "10px",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.12))",
  background: "var(--jantt-surface, rgba(255, 255, 255, 0.03))"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: "8px",
  background: "var(--jantt-bg, rgba(15, 23, 42, 0.7))",
  border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.14))",
  color: "var(--jantt-text)",
  fontSize: "0.85rem"
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "8px",
  background: "var(--jantt-bg, rgba(15, 23, 42, 0.85))",
  border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.12))",
  color: "var(--jantt-text, #F8FAFC)",
  fontFamily: "var(--jantt-font-mono, monospace)",
  fontSize: "11.5px",
  lineHeight: 1.5,
  overflowX: "auto",
  whiteSpace: "pre"
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

function tierBadgeLabel(tier: ApiAccessTier | null, isConfigAdmin: boolean): string {
  if (isConfigAdmin || tier === "admin") return "Admin · Unlimited Free";
  if (tier === "paid") return "Paid Plan";
  if (tier === "granted") return "Approved Access";
  return "Locked";
}

function formatShortDate(iso?: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const AgentApiModal: React.FC<AgentApiModalProps> = ({
  show,
  setShow,
  currentUserUid,
  userProfile,
  ownedRooms,
  sharedRooms,
  apiAccess,
  onLogin,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>("agent");
  const [snippetTab, setSnippetTab] = useState<SnippetTab>("mcp");
  const [keyLabel, setKeyLabel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Admin panel state
  const [adminQuery, setAdminQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUserAccessSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [directUid, setDirectUid] = useState("");
  const [grantTier, setGrantTier] = useState<ApiAccessTier>("granted");
  const [grantNote, setGrantNote] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    setActionError(null);
    if (!apiAccess.isAdmin && activeTab === "admin") {
      setActiveTab("agent");
    }
  }, [show, apiAccess.isAdmin, activeTab]);

  useEffect(() => {
    if (show && activeTab === "admin" && apiAccess.isAdmin && apiAccess.isConfigured) {
      void apiAccess.loadAdminEntitlements();
    }
  }, [show, activeTab, apiAccess.isAdmin, apiAccess.isConfigured, apiAccess.loadAdminEntitlements]);

  const allCloudRooms = useMemo(() => {
    const byId = new Map<string, UserRoomPointer>();
    for (const r of ownedRooms) byId.set(r.roomId, r);
    for (const r of sharedRooms) if (!byId.has(r.roomId)) byId.set(r.roomId, r);
    return Array.from(byId.values()).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [ownedRooms, sharedRooms]);

  if (!show) return null;

  const effectiveEndpoint = apiAccess.apiBaseUrl || "https://jantt-cloud-api.YOUR-SUBDOMAIN.workers.dev";
  const displayKey = apiAccess.lastCreatedKey?.apiKey || "jnt_live_YOUR_API_KEY";
  const sampleRoomId = allCloudRooms[0]?.roomId || "<ROOM_ID>";

  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        "jantt-cloud": {
          url: `${effectiveEndpoint}/v1/mcp`,
          headers: {
            Authorization: `Bearer ${displayKey}`
          }
        }
      }
    },
    null,
    2
  );

  const curlSnippet = `# List all cloud plans accessible by your account
curl -H "Authorization: Bearer ${displayKey}" \\
  "${effectiveEndpoint}/v1/plans"

# Add a task to a cloud plan (updates live in open browsers)
curl -X POST \\
  -H "Authorization: Bearer ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"ai-task-1","label":"Review launch plan","category":"general","start":"2026-12-01","end":"2026-12-03"}' \\
  "${effectiveEndpoint}/v1/plans/${sampleRoomId}/tasks"

# Delete a task from a cloud plan
curl -X DELETE \\
  -H "Authorization: Bearer ${displayKey}" \\
  "${effectiveEndpoint}/v1/plans/${sampleRoomId}/tasks/ai-task-1"`;

  const openApiUrl = `${effectiveEndpoint}/v1/openapi.json`;

  const handleCopy = async (id: string, text: string, label: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(id);
      showToast?.(`${label} copied to clipboard.`);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } else {
      showToast?.(`Could not copy ${label}.`, true);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsGenerating(true);
    try {
      const created = await apiAccess.generateKey(keyLabel.trim() || undefined);
      setKeyLabel("");
      showToast?.(`API key "${created.label}" generated. Copy it now!`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to generate API key.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    setActionError(null);
    setRevokingKeyId(keyId);
    try {
      await apiAccess.revokeKey(keyId);
      showToast?.("API key revoked immediately.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to revoke API key.");
    } finally {
      setRevokingKeyId(null);
    }
  };

  const handleAdminSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSearching(true);
    try {
      const users = await apiAccess.searchUsers(adminQuery);
      setSearchResults(users);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "User search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleGrant = async (targetUid: string, tier: ApiAccessTier, note?: string) => {
    const cleanUid = targetUid.trim();
    if (!cleanUid) {
      setActionError("Enter a valid Firebase UID.");
      return;
    }
    setActionError(null);
    setBusyUid(cleanUid);
    try {
      await apiAccess.grantUserAccess(cleanUid, { enabled: true, tier, note: note?.trim() || undefined });
      setDirectUid("");
      setGrantNote("");
      setSearchResults((prev) =>
        prev.map((u) =>
          u.uid === cleanUid
            ? {
                ...u,
                entitlement: {
                  uid: cleanUid,
                  enabled: true,
                  tier,
                  grantedAt: new Date().toISOString(),
                  grantedBy: currentUserUid || "admin",
                  updatedAt: new Date().toISOString(),
                  ...(note?.trim() ? { note: note.trim() } : {})
                }
              }
            : u
        )
      );
      showToast?.(`Granted ${tier} API access to ${cleanUid}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not grant access.");
    } finally {
      setBusyUid(null);
    }
  };

  const handleRevokeUser = async (targetUid: string) => {
    setActionError(null);
    setBusyUid(targetUid);
    try {
      const res = await apiAccess.revokeUserAccess(targetUid, true);
      const nowIso = new Date().toISOString();
      setSearchResults((prev) =>
        prev.map((u) =>
          u.uid === targetUid
            ? {
                ...u,
                activeKeyCount: 0,
                entitlement: u.entitlement
                  ? { ...u.entitlement, enabled: false, updatedAt: nowIso }
                  : null
              }
            : u
        )
      );
      showToast?.(
        res.revokedKeysCount > 0
          ? `Revoked access and ${res.revokedKeysCount} active API key(s).`
          : "Revoked user API access."
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not revoke access.");
    } finally {
      setBusyUid(null);
    }
  };

  const activeKeys = apiAccess.keys.filter((k) => !k.revokedAt);
  const revokedKeys = apiAccess.keys.filter((k) => Boolean(k.revokedAt));

  return (
    <Modal onClose={() => setShow(false)} maxWidth={700}>
      <ModalHeader
        title="Cloud Agent API & Remote MCP"
        subtitle="Account-scoped endpoints for accessing and editing your cloud plans from AI agents."
        icon={<Bot size={18} aria-hidden="true" />}
      />

      <div
        className="prompt-modal-body"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          padding: "16px 20px 24px",
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain"
        }}
      >
        {!currentUserUid ? (
          <div style={{ ...sectionStyle, alignItems: "flex-start" }}>
            <div style={{ fontWeight: 600 }}>Sign in to manage Cloud Agent API access</div>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--jantt-text-muted)" }}>
              API keys are tied to your GitHub-authenticated Jantt account and expose only the cloud plans you own or
              have been shared on.
            </p>
            {onLogin && (
              <button type="button" className="btn btn-primary" onClick={onLogin}>
                Sign in with GitHub
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Navigation tabs (Admin tab only appears for admins) */}
            {apiAccess.isAdmin && (
              <div role="tablist" style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "agent"}
                  className={activeTab === "agent" ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => setActiveTab("agent")}
                >
                  <KeyRound size={14} aria-hidden="true" />
                  <span>My Agent API & Keys</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "admin"}
                  className={activeTab === "admin" ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => setActiveTab("admin")}
                >
                  <Shield size={14} aria-hidden="true" />
                  <span>Admin Access Control</span>
                </button>
              </div>
            )}

            {!apiAccess.isConfigured && (
              <div
                role="status"
                style={{
                  ...sectionStyle,
                  borderColor: "rgba(245, 158, 11, 0.4)",
                  background: "rgba(245, 158, 11, 0.08)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, color: "#F59E0B" }}>
                  <ShieldAlert size={15} aria-hidden="true" />
                  <span>Cloud API Worker URL not configured</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--jantt-text-muted)", lineHeight: 1.5 }}>
                  Deploy <code>apps/cloud-api</code> to Cloudflare Workers and set <code>VITE_CLOUD_API_URL</code>{" "}
                  (or GitHub repo variable <code>CLOUD_API_URL</code>) to activate live key generation and endpoints.
                </p>
              </div>
            )}

            {(actionError || apiAccess.error) && (
              <div
                role="alert"
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(239, 68, 68, 0.45)",
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "#FCA5A5",
                  fontSize: "0.82rem"
                }}
              >
                {actionError || apiAccess.error}
              </div>
            )}

            {activeTab === "agent" ? (
              <>
                {/* Account Access Status Banner */}
                <div style={sectionStyle}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {apiAccess.enabled ? (
                        <ShieldCheck size={17} style={{ color: "#22C55E" }} aria-hidden="true" />
                      ) : (
                        <Lock size={17} style={{ color: "#F59E0B" }} aria-hidden="true" />
                      )}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                          {apiAccess.enabled ? "Cloud Agent API Enabled" : "Cloud Agent API Locked"}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--jantt-text-muted)" }}>
                          Account: @{userProfile?.username || "user"} · UID: <code>{currentUserUid}</code>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: apiAccess.enabled ? "rgba(34, 197, 94, 0.16)" : "rgba(245, 158, 11, 0.16)",
                          color: apiAccess.enabled ? "#22C55E" : "#F59E0B"
                        }}
                      >
                        {tierBadgeLabel(apiAccess.tier, apiAccess.isConfigAdmin)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleCopy("uid", currentUserUid, "Firebase UID")}
                        title="Copy your Firebase UID"
                      >
                        {copiedId === "uid" ? <Check size={13} /> : <Copy size={13} />}
                        <span>Copy UID</span>
                      </button>
                      {apiAccess.isConfigured && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void apiAccess.refresh()}
                          disabled={apiAccess.isLoading}
                          title="Refresh access status"
                          aria-label="Refresh access status"
                        >
                          <RefreshCw size={13} className={apiAccess.isLoading ? "spin-sync-icon" : undefined} />
                        </button>
                      )}
                    </div>
                  </div>

                  {!apiAccess.enabled && (
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--jantt-text-muted)", lineHeight: 1.5 }}>
                      Access to the Cloud Agent API is granted per account by the Jantt administrator. Copy your UID
                      above and share it with the admin to unlock your personal API key and Remote MCP endpoint.
                    </p>
                  )}
                </div>

                {/* Unlocked Controls */}
                {apiAccess.enabled && (
                  <>
                    {/* API Key Generator & Active Keys */}
                    <div style={sectionStyle}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                        <KeyRound size={15} aria-hidden="true" />
                        <span>Account API Keys</span>
                      </div>

                      <form onSubmit={handleGenerateKey} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          value={keyLabel}
                          onChange={(e) => setKeyLabel(e.target.value)}
                          placeholder="Key label (e.g. Claude Desktop, Cursor, Automation)"
                          maxLength={100}
                          style={{ ...inputStyle, flex: "1 1 240px" }}
                          aria-label="API key label"
                        />
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={isGenerating || !apiAccess.isConfigured}
                        >
                          {isGenerating ? <Loader2 size={14} className="spin-sync-icon" /> : <Plus size={14} />}
                          <span>Generate API Key</span>
                        </button>
                      </form>

                      {apiAccess.lastCreatedKey && (
                        <div
                          role="status"
                          style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(34, 197, 94, 0.45)",
                            background: "rgba(34, 197, 94, 0.1)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                          }}
                        >
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#4ADE80" }}>
                            Save your new API key now — it will only be shown once!
                          </div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input
                              readOnly
                              value={apiAccess.lastCreatedKey.apiKey}
                              aria-label="Newly generated API key"
                              onFocus={(e) => e.currentTarget.select()}
                              style={{ ...inputStyle, fontFamily: "var(--jantt-font-mono, monospace)", fontSize: "0.8rem" }}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleCopy("new-key", apiAccess.lastCreatedKey!.apiKey, "API key")}
                            >
                              {copiedId === "new-key" ? <Check size={14} /> : <Copy size={14} />}
                              <span>Copy</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {activeKeys.length === 0 ? (
                        <div style={{ fontSize: "0.8rem", color: "var(--jantt-text-muted)" }}>
                          No active API keys yet. Generate one above to connect Claude, Cursor, ChatGPT, or custom agents.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {activeKeys.map((k) => (
                            <div
                              key={k.keyId}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                background: "var(--jantt-bg, rgba(15, 23, 42, 0.5))",
                                border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.08))"
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>{k.label}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--jantt-text-muted)" }}>
                                  <code>{k.prefix}</code> · Created {formatShortDate(k.createdAt)} · Last used:{" "}
                                  {formatShortDate(k.lastUsedAt)}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ color: "#F87171" }}
                                disabled={revokingKeyId === k.keyId || !apiAccess.isConfigured}
                                onClick={() => void handleRevokeKey(k.keyId)}
                              >
                                {revokingKeyId === k.keyId ? (
                                  <Loader2 size={13} className="spin-sync-icon" />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                                <span>Revoke</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {revokedKeys.length > 0 && (
                        <details style={{ fontSize: "0.78rem", color: "var(--jantt-text-muted)" }}>
                          <summary style={{ cursor: "pointer" }}>
                            Revoked keys ({revokedKeys.length})
                          </summary>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
                            {revokedKeys.map((k) => (
                              <div key={k.keyId} style={{ opacity: 0.7 }}>
                                {k.label} (<code>{k.prefix}</code>) — revoked {formatShortDate(k.revokedAt)}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Connect AI Agent Snippets */}
                    <div style={sectionStyle}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Terminal size={15} aria-hidden="true" />
                          <span>Connect an AI Agent</span>
                        </div>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {(
                            [
                              ["mcp", "Remote MCP"],
                              ["curl", "REST / cURL"],
                              ["openapi", "OpenAPI Spec"],
                              ["guides", "Guides & Schema"]
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              className={snippetTab === id ? "btn btn-primary" : "btn btn-secondary"}
                              style={{ padding: "4px 9px", fontSize: "0.76rem" }}
                              onClick={() => setSnippetTab(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {snippetTab === "mcp" && (
                        <>
                          <pre style={codeBlockStyle}>{mcpSnippet}</pre>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ alignSelf: "flex-end" }}
                            onClick={() => handleCopy("mcp", mcpSnippet, "MCP config")}
                          >
                            {copiedId === "mcp" ? <Check size={13} /> : <Copy size={13} />}
                            <span>Copy MCP JSON</span>
                          </button>
                        </>
                      )}

                      {snippetTab === "curl" && (
                        <>
                          <pre style={codeBlockStyle}>{curlSnippet}</pre>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ alignSelf: "flex-end" }}
                            onClick={() => handleCopy("curl", curlSnippet, "cURL commands")}
                          >
                            {copiedId === "curl" ? <Check size={13} /> : <Copy size={13} />}
                            <span>Copy cURL Examples</span>
                          </button>
                        </>
                      )}

                      {snippetTab === "openapi" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--jantt-text-muted)" }}>
                            Import this OpenAPI 3.1 URL into ChatGPT Custom GPT Actions, LangChain, or n8n with Bearer
                            Auth set to your API key:
                          </p>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <input
                              readOnly
                              value={openApiUrl}
                              aria-label="OpenAPI Spec URL"
                              style={{ ...inputStyle, fontFamily: "var(--jantt-font-mono, monospace)", fontSize: "0.8rem" }}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleCopy("openapi", openApiUrl, "OpenAPI URL")}
                            >
                              {copiedId === "openapi" ? <Check size={13} /> : <Copy size={13} />}
                              <span>Copy</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {snippetTab === "guides" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--jantt-text-muted)" }}>
                            Public AI reference endpoints (no API key needed) for Jantt JSON syntax, editing prompts,
                            schema validation, and starter templates:
                          </p>
                          {(
                            [
                              ["guide-cheatsheet", "Cheatsheet & Gotchas", `${effectiveEndpoint}/v1/cheatsheet`],
                              ["guide-prompt", "AI Editing System Prompt", `${effectiveEndpoint}/v1/prompt`],
                              ["guide-schema", "Official JSON Schema v1", `${effectiveEndpoint}/v1/schema`],
                              ["guide-template", "Starter JSON Template", `${effectiveEndpoint}/v1/template`],
                              ["guide-validate", "Dry-Run Validator (POST)", `${effectiveEndpoint}/v1/validate`],
                              ["guide-help", "Full Help Index", `${effectiveEndpoint}/v1/help`]
                            ] as const
                          ).map(([copyId, label, urlValue]) => (
                            <div
                              key={copyId}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "6px 9px",
                                borderRadius: "8px",
                                background: "var(--jantt-bg, rgba(15, 23, 42, 0.45))",
                                border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.08))"
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "0.78rem" }}>{label}</div>
                                <div
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "var(--jantt-text-muted)",
                                    fontFamily: "var(--jantt-font-mono, monospace)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                  }}
                                >
                                  {urlValue}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "0.74rem", flexShrink: 0 }}
                                onClick={() => handleCopy(copyId, urlValue, label)}
                              >
                                {copiedId === copyId ? <Check size={12} /> : <Copy size={12} />}
                                <span>Copy</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Cloud Plans Exposed by Account */}
                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                    Your Cloud Plans Exposed ({allCloudRooms.length})
                  </div>
                  {allCloudRooms.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--jantt-text-muted)" }}>
                      No cloud rooms yet. Publish a local plan to the cloud (or create one via the API) and it will
                      appear here automatically.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                      {allCloudRooms.map((room) => {
                        const roomEndpoint = `${effectiveEndpoint}/v1/plans/${room.roomId}`;
                        const canWrite = room.role === "owner" || room.role === "editor";
                        return (
                          <div
                            key={room.roomId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              padding: "7px 10px",
                              borderRadius: "8px",
                              background: "var(--jantt-bg, rgba(15, 23, 42, 0.45))",
                              border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.08))"
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {room.title}
                              </div>
                              <div style={{ fontSize: "0.73rem", color: "var(--jantt-text-muted)" }}>
                                <code>{room.roomId}</code> · {room.role} ({canWrite ? "Read/Write" : "Read-only"})
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "4px 8px", fontSize: "0.75rem", flexShrink: 0 }}
                              onClick={() => handleCopy(`room-${room.roomId}`, roomEndpoint, "Plan endpoint URL")}
                            >
                              {copiedId === `room-${room.roomId}` ? <Check size={12} /> : <Copy size={12} />}
                              <span>Endpoint</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Admin Access Control Tab */
              <>
                <div style={sectionStyle}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                    <UserCheck size={15} aria-hidden="true" />
                    <span>Grant API Access to a User</span>
                  </div>

                  <form onSubmit={handleAdminSearch} style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      value={adminQuery}
                      onChange={(e) => setAdminQuery(e.target.value)}
                      placeholder="Search by @username, name, or UID..."
                      style={{ ...inputStyle, flex: 1 }}
                      aria-label="Search users to grant API access"
                    />
                    <button type="submit" className="btn btn-secondary" disabled={isSearching || !apiAccess.isConfigured}>
                      {isSearching ? <Loader2 size={14} className="spin-sync-icon" /> : <Search size={14} />}
                      <span>Search</span>
                    </button>
                  </form>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <select
                      value={grantTier}
                      onChange={(e) => setGrantTier(e.target.value as ApiAccessTier)}
                      style={{ ...inputStyle, width: "auto", minWidth: "140px" }}
                      aria-label="Access tier"
                    >
                      <option value="granted">Approved (Free)</option>
                      <option value="paid">Paid Plan</option>
                      <option value="admin">Admin</option>
                    </select>
                    <input
                      type="text"
                      value={grantNote}
                      onChange={(e) => setGrantNote(e.target.value)}
                      placeholder="Optional note (e.g. Paid monthly, Beta)"
                      maxLength={200}
                      style={{ ...inputStyle, flex: "1 1 200px" }}
                      aria-label="Grant note"
                    />
                  </div>

                  {searchResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "170px", overflowY: "auto" }}>
                      {searchResults.map((user) => {
                        const isGranted = user.isConfigAdmin || user.entitlement?.enabled === true;
                        return (
                          <div
                            key={user.uid}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              padding: "7px 10px",
                              borderRadius: "8px",
                              background: "var(--jantt-bg, rgba(15, 23, 42, 0.5))",
                              border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.08))"
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                                @{user.username} <span style={{ opacity: 0.7 }}>({user.displayName})</span>
                              </div>
                              <div style={{ fontSize: "0.73rem", color: "var(--jantt-text-muted)" }}>
                                <code>{user.uid}</code>
                              </div>
                            </div>
                            <button
                              type="button"
                              className={isGranted ? "btn btn-secondary" : "btn btn-primary"}
                              disabled={busyUid === user.uid}
                              onClick={() => void handleGrant(user.uid, grantTier, grantNote)}
                            >
                              {busyUid === user.uid ? <Loader2 size={13} className="spin-sync-icon" /> : <UserCheck size={13} />}
                              <span>{isGranted ? "Update Tier" : "Grant Access"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Direct UID pre-grant */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "6px", borderTop: "1px solid var(--jantt-border, rgba(255,255,255,0.08))" }}>
                    <input
                      type="text"
                      value={directUid}
                      onChange={(e) => setDirectUid(e.target.value)}
                      placeholder="Or paste Firebase UID directly..."
                      style={{ ...inputStyle, flex: "1 1 220px", fontFamily: "var(--jantt-font-mono, monospace)", fontSize: "0.8rem" }}
                      aria-label="Direct Firebase UID"
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!directUid.trim() || busyUid === directUid.trim() || !apiAccess.isConfigured}
                      onClick={() => void handleGrant(directUid, grantTier, grantNote)}
                    >
                      <Plus size={14} />
                      <span>Grant by UID</span>
                    </button>
                  </div>
                </div>

                {/* Authorized Users List */}
                <div style={sectionStyle}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                      Managed Accounts ({apiAccess.adminUsers.length})
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void apiAccess.loadAdminEntitlements()}
                      disabled={apiAccess.isLoadingAdmin}
                    >
                      <RefreshCw size={13} className={apiAccess.isLoadingAdmin ? "spin-sync-icon" : undefined} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {apiAccess.adminUsers.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--jantt-text-muted)" }}>
                      No granted accounts yet.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "230px", overflowY: "auto" }}>
                      {apiAccess.adminUsers.map((entry) => {
                        const isEnabled = entry.isConfigAdmin || entry.entitlement?.enabled === true;
                        return (
                          <div
                            key={entry.uid}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              background: "var(--jantt-bg, rgba(15, 23, 42, 0.5))",
                              border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.08))"
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>
                                @{entry.username}{" "}
                                <span
                                  style={{
                                    marginLeft: "4px",
                                    padding: "1px 7px",
                                    borderRadius: "999px",
                                    fontSize: "10.5px",
                                    background: isEnabled ? "rgba(34, 197, 94, 0.16)" : "rgba(239, 68, 68, 0.16)",
                                    color: isEnabled ? "#4ADE80" : "#F87171"
                                  }}
                                >
                                  {entry.isConfigAdmin
                                    ? "Config Admin"
                                    : isEnabled
                                      ? entry.entitlement?.tier || "granted"
                                      : "Revoked"}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.74rem", color: "var(--jantt-text-muted)" }}>
                                <code>{entry.uid}</code> · {entry.activeKeyCount} active key(s)
                                {entry.entitlement?.note ? ` · ${entry.entitlement.note}` : ""}
                              </div>
                            </div>
                            {!entry.isConfigAdmin && (
                              isEnabled ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ color: "#F87171", flexShrink: 0 }}
                                  disabled={busyUid === entry.uid}
                                  onClick={() => void handleRevokeUser(entry.uid)}
                                >
                                  {busyUid === entry.uid ? <Loader2 size={13} className="spin-sync-icon" /> : <UserX size={13} />}
                                  <span>Revoke</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ flexShrink: 0 }}
                                  disabled={busyUid === entry.uid}
                                  onClick={() => void handleGrant(entry.uid, entry.entitlement?.tier || "granted", entry.entitlement?.note)}
                                >
                                  <UserCheck size={13} />
                                  <span>Re-enable</span>
                                </button>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
