import { RoomQr } from "../cloud/RoomQr";
import React, { useEffect, useRef, useState } from "react";
import {
  Share2,
  Copy,
  Check,
  Cloud,
  FileJson,
  ExternalLink,
  Download,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Users,
  Sparkles,
  LogIn,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Building2,
  FileText,
  Eye,
  HardDrive
} from "lucide-react";
import type { JanttData, ThemeDefinition } from "@jantt/core";
import { exportMsProjectXml, exportPrimaveraXer, exportSpreadsheetCsv, exportExecutiveReportHtml } from "@jantt/interop";
import type { SavedProject, ActiveView } from "../../types";
import { useI18n } from "../../i18n/I18nProvider";
import { Modal, ModalHeader, buildExportFilename, downloadTextFile } from "./ModalHost";

/** The signed-in user's role in the active cloud room. */
export type ShareRoomRole = "owner" | "editor" | "viewer";

interface ShareModalProps {
  showShareModal: boolean;
  setShowShareModal: (show: boolean) => void;
  currentProjectName: string;
  parsedData: JanttData | null;
  activeView: ActiveView;
  activeTheme: ThemeDefinition;
  activeProject?: SavedProject;
  activeProjectId: string;
  /** Link to the current plan. Any editor secret it carries is removed before it is shown or shared. */
  shareUrl: string;
  /** @deprecated Ignored: the dialog measures the link it actually shares. */
  isWhatsAppSafe?: boolean;
  /** Role in the active cloud room; omitted for plans that are not cloud rooms. */
  roomRole?: ShareRoomRole;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  handleDownloadJson: () => void;
  isLoggedIn?: boolean;
  /** Whether the user may create cloud rooms (signed in and, when the gate is on, GitHub-verified). */
  isCloudVerified?: boolean;
  /** A GitHub sign-in is in progress: sign-in buttons are disabled so it is not started twice. */
  isSigningIn?: boolean;
  onCreateRoomFromActive?: (title?: string) => Promise<string | null>;
  onOpenShareRoom?: (roomId: string) => void;
  onLogin?: () => void;
  onOpenVerificationModal?: () => void;
  /** Lets viewers fork the room into an editable plan on this device. */
  onMakeLocalCopy?: () => void;
  showToast?: (msg: string, isErr?: boolean) => void;
}

/** URL fragment / query keys that grant edit access to a room and must never leave the owner's browser. */
const SECRET_URL_KEYS = new Set(["key", "edit"]);

function removeSecretParams(part: string): string {
  return part
    .split("&")
    .filter((pair) => {
      const name = pair.split("=")[0];
      try {
        return pair !== "" && !SECRET_URL_KEYS.has(decodeURIComponent(name).toLowerCase());
      } catch {
        return pair !== "";
      }
    })
    .join("&");
}

/**
 * Removes room editor secrets (`#key=...`, `#edit=...`, `?key=...`) from a share link so snapshot
 * links, WhatsApp/native shares and public embeds can only ever grant view access. Every other
 * parameter (including a `#data=` snapshot payload) is kept byte-for-byte.
 */
export function stripShareSecrets(url: string): string {
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? removeSecretParams(url.slice(hashIndex + 1)) : "";
  const queryIndex = beforeHash.indexOf("?");
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? removeSecretParams(beforeHash.slice(queryIndex + 1)) : "";
  return `${path}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

/** WhatsApp's GET /send limit is 2,048 characters; this leaves room for the message text. */
const WHATSAPP_SAFE_URL_LENGTH = 1900;

/**
 * Only absolute http(s) links are opened, embedded or handed to other apps: attribute escaping
 * cannot stop a `javascript:` or `data:` URL from running inside an `<iframe src>` or `<a href>`.
 */
export function isShareableWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

const escapeHtmlAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Read-only `<iframe>` snippet; every interpolated value is attribute-escaped. */
export function buildEmbedSnippet(url: string, planName: string): string {
  const title = escapeHtmlAttribute(`Jantt plan: ${planName}`);
  return `<iframe src="${escapeHtmlAttribute(url)}" title="${title}" width="100%" height="600" style="border:0" loading="lazy" allowfullscreen></iframe>`;
}

/** Copies text with the async clipboard API, falling back to a hidden textarea. Resolves false on failure. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or unsupported: fall through to the legacy path.
  }
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  try {
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    previouslyFocused?.focus?.({ preventScroll: true });
  }
}

const heroButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "9px 16px",
  fontWeight: 600,
  fontSize: "13px"
};

const exportButtonStyle: React.CSSProperties = {
  fontSize: "11px",
  padding: "4px 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: "5px"
};

const panelStyle: React.CSSProperties = {
  background: "var(--jantt-surface, #F8FAFC)",
  border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
  borderRadius: "10px",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: "8px"
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const ShareModal: React.FC<ShareModalProps> = (props) => {
  if (!props.showShareModal) return null;
  // Mounted per open, so copy feedback and pending timers never leak between openings.
  return <ShareDialog {...props} />;
};

const ShareDialog: React.FC<ShareModalProps> = ({
  setShowShareModal,
  currentProjectName,
  parsedData,
  activeView,
  activeTheme,
  activeProject,
  activeProjectId,
  shareUrl,
  roomRole,
  setIsSidebarCollapsed,
  handleDownloadJson,
  isLoggedIn = false,
  isCloudVerified = true,
  isSigningIn = false,
  onCreateRoomFromActive,
  onOpenShareRoom,
  onLogin,
  onOpenVerificationModal,
  onMakeLocalCopy,
  showToast
}) => {
  const { t } = useI18n();
  const [isStartingRoom, setIsStartingRoom] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"link" | "embed" | null>(null);
  const copiedTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  const close = () => setShowShareModal(false);
  const notify = (message: string, isError = false) => {
    if (showToast) showToast(message, isError);
    else if (isError) console.error(message);
  };

  const roomId = activeProject?.source === "room" ? activeProject.roomId : undefined;
  const isRoomActive = Boolean(roomId);
  const effectiveRole: ShareRoomRole | undefined =
    roomRole ?? (isRoomActive ? (activeProject?.role === "collaborator" ? "editor" : "viewer") : undefined);
  // Managing teammates needs an account: a signed-out editor is asked to sign in instead.
  const needsSignInToManage = isRoomActive && !isLoggedIn;
  const canManageRoom = !needsSignInToManage && (effectiveRole === "owner" || effectiveRole === "editor");
  const safeUrl = stripShareSecrets(shareUrl);
  const isWebUrl = isShareableWebUrl(safeUrl);
  const isWhatsAppSafe = safeUrl.length <= WHATSAPP_SAFE_URL_LENGTH;
  const embedCode = isWebUrl ? buildEmbedSnippet(safeUrl, currentProjectName) : "";
  const linkUnavailableTitle = t("share.linkUnavailable");

  const handleCopy = async (target: "link" | "embed") => {
    if (target === "embed" && !embedCode) return;
    const ok = await copyTextToClipboard(target === "link" ? safeUrl : embedCode);
    if (!ok) {
      notify(t("share.copyFailed"), true);
      return;
    }
    setCopiedTarget(target);
    notify(target === "link" ? t("share.linkCopied") : t("share.embedCopied"));
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopiedTarget(null), 2000);
  };

  const shareText = t("share.shareText", { name: currentProjectName });

  const handleWhatsAppShare = () => {
    if (!isWebUrl) return;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n\n${safeUrl}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const canNativeShare = isWebUrl && typeof navigator !== "undefined" && typeof navigator.share === "function";
  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: currentProjectName, text: shareText, url: safeUrl });
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") notify(t("share.shareFailed", { error: errorMessage(err) }), true);
    }
  };

  const handleStartRoom = async () => {
    if (!isLoggedIn) {
      if (isSigningIn) return;
      close();
      onLogin?.();
      return;
    }
    if (!isCloudVerified) {
      close();
      onOpenVerificationModal?.();
      return;
    }
    if (!onCreateRoomFromActive || isStartingRoom) return;
    setIsStartingRoom(true);
    try {
      const newRoomId = await onCreateRoomFromActive(currentProjectName);
      if (newRoomId) {
        close();
        onOpenShareRoom?.(newRoomId);
      }
    } catch (err) {
      notify(t("share.startRoomFailed", { error: errorMessage(err) }), true);
    } finally {
      setIsStartingRoom(false);
    }
  };

  const startRoomLabel = !isLoggedIn
    ? isSigningIn
      ? t("share.signingIn")
      : t("share.signInToStart")
    : !isCloudVerified
    ? t("share.verifyToStart")
    : isStartingRoom
    ? t("share.startingRoom")
    : t("share.startRoom");
  // Signing in and starting the room both show progress; the start button is disabled meanwhile.
  const isStartBusy = isStartingRoom || (!isLoggedIn && isSigningIn);
  const startRoomIcon = !isLoggedIn ? (
    isSigningIn ? <Loader2 size={15} className="spin-sync-icon" /> : <LogIn size={15} />
  ) : !isCloudVerified ? (
    <ShieldCheck size={15} />
  ) : isStartingRoom ? (
    <Loader2 size={15} className="spin-sync-icon" />
  ) : (
    <Users size={15} />
  );

  const runExport = (label: string, build: () => { content: string; extension: string; mime: string } | null) => {
    try {
      const file = build();
      if (!file) return;
      downloadTextFile(buildExportFilename(currentProjectName, file.extension), file.content, file.mime);
    } catch (err) {
      notify(t("share.exportFailed", { label, error: errorMessage(err) }), true);
    }
  };

  const handleExportMsProject = () =>
    runExport(t("share.exportMsProject"), () =>
      parsedData
        ? { content: exportMsProjectXml(parsedData, { projectName: currentProjectName }), extension: "xml", mime: "application/xml" }
        : null
    );

  const handleExportPrimavera = () =>
    runExport(t("share.exportPrimavera"), () =>
      parsedData
        ? { content: exportPrimaveraXer(parsedData, { projectName: currentProjectName }), extension: "xer", mime: "text/plain" }
        : null
    );

  const handleExportCsv = () =>
    runExport(t("share.exportCsvLabel"), () =>
      parsedData ? { content: exportSpreadsheetCsv(parsedData), extension: "csv", mime: "text/csv;charset=utf-8" } : null
    );

  const handleExportExecutiveReport = () =>
    runExport(t("share.exportReportLabel"), () =>
      parsedData?.tasks
        ? {
            content: exportExecutiveReportHtml(parsedData.tasks, {
              title: currentProjectName || t("share.reportDefaultTitle"),
              // Internal plan ids mean nothing to report readers; rooms have a shareable id.
              projectCode: roomId,
              theme: activeTheme?.mode === "dark" ? "dark" : "corporate",
              defaultGapDays: parsedData.meta?.defaultGapDays,
              targetDate: typeof parsedData.meta?.targetDate === "string" ? parsedData.meta.targetDate : undefined,
              calendar: parsedData.meta?.calendar,
              useWorkingDays: parsedData.meta?.useWorkingDays,
              calendars: parsedData.calendars,
              people: parsedData.people
            }),
            extension: "html",
            mime: "text/html;charset=utf-8"
          }
        : null
    );

  const planBadge = isRoomActive
    ? t("share.badgeLiveRoom")
    : activeProjectId === "default"
    ? t("share.badgeSample")
    : t("share.badgeLocal");

  return (
    <Modal onClose={close} maxWidth={580}>
      <ModalHeader
        icon={<Share2 size={18} />}
        title={t("share.title")}
        subtitle={isRoomActive ? t("share.subtitleRoom") : t("share.subtitlePlan")}
      />

      <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Plan overview */}
        <div style={{ ...panelStyle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--jantt-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentProjectName}
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
              {t("share.overview", {
                count: parsedData?.tasks?.length || 0,
                view: activeView.toUpperCase(),
                theme: activeTheme.label
              })}
            </div>
          </div>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: "100px",
              flexShrink: 0,
              background: isRoomActive ? "rgba(34, 197, 94, 0.15)" : "rgba(56, 189, 248, 0.12)",
              color: isRoomActive ? "#22c55e" : "var(--jantt-accent)",
              border: `1px solid ${isRoomActive ? "rgba(34, 197, 94, 0.35)" : "rgba(56, 189, 248, 0.3)"}`
            }}
          >
            {planBadge}
          </span>
        </div>

        {/* Live collaboration */}
        {isRoomActive && roomId ? (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(129, 140, 248, 0.08) 100%)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "100px",
                    background: "rgba(34, 197, 94, 0.15)",
                    color: "#22c55e",
                    border: "1px solid rgba(34, 197, 94, 0.3)"
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  {t("share.cloudRoom")}
                </span>
                <span style={{ fontSize: "12px", fontFamily: "var(--jantt-font-mono, monospace)", color: "var(--jantt-text-muted)" }}>
                  #{roomId}
                </span>
              </div>
              {effectiveRole && (
                <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                  {t("share.yourRole")}{" "}
                  <strong style={{ color: "var(--jantt-text)" }}>
                    {effectiveRole === "owner"
                      ? t("share.roleOwner")
                      : effectiveRole === "editor"
                      ? t("share.roleEditor")
                      : t("share.roleViewer")}
                  </strong>
                </span>
              )}
            </div>

            {canManageRoom ? (
              <>
                <div style={{ fontSize: "12.5px", color: "var(--jantt-text)", lineHeight: "1.4" }}>
                  {t("share.manageDesc")}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    close();
                    onOpenShareRoom?.(roomId);
                  }}
                  style={heroButtonStyle}
                >
                  <Users size={15} />
                  <span>{effectiveRole === "owner" ? t("share.manageTeammates") : t("share.teammatesInvites")}</span>
                  <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "12.5px", color: "var(--jantt-text)", lineHeight: "1.4", display: "flex", gap: "8px" }}>
                  {needsSignInToManage ? (
                    <LogIn size={15} style={{ flexShrink: 0, marginTop: "1px", color: "var(--jantt-text-muted)" }} />
                  ) : (
                    <Eye size={15} style={{ flexShrink: 0, marginTop: "1px", color: "var(--jantt-text-muted)" }} />
                  )}
                  <span>
                    {needsSignInToManage
                      ? t("share.signedOutViewOnly")
                      : t("share.viewOnly")}
                  </span>
                </div>
                {needsSignInToManage && onLogin && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isSigningIn}
                    aria-busy={isSigningIn || undefined}
                    onClick={() => {
                      close();
                      onLogin();
                    }}
                    style={heroButtonStyle}
                  >
                    {isSigningIn ? <Loader2 size={15} className="spin-sync-icon" /> : <LogIn size={15} />}
                    <span>{isSigningIn ? t("share.signingIn") : t("share.signInToEdit")}</span>
                  </button>
                )}
                {onMakeLocalCopy && (
                  <button
                    type="button"
                    className={needsSignInToManage && onLogin ? "btn btn-secondary" : "btn btn-primary"}
                    onClick={() => {
                      close();
                      onMakeLocalCopy();
                    }}
                    style={heroButtonStyle}
                  >
                    <HardDrive size={15} />
                    <span>{t("share.makeEditableCopy")}</span>
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                aria-hidden="true"
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "8px",
                  background: "rgba(56, 189, 248, 0.18)",
                  color: "var(--jantt-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--jantt-text)" }}>{t("share.collaborateLive")}</div>
                <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                  {t("share.collaborateLiveDesc")}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isStartBusy}
              aria-busy={isStartBusy || undefined}
              onClick={handleStartRoom}
              style={heroButtonStyle}
            >
              {startRoomIcon}
              <span>{startRoomLabel}</span>
              {isLoggedIn && isCloudVerified && !isStartingRoom && <ArrowRight size={14} />}
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "2px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--jantt-border-subtle, #e2e8f0)" }} />
          <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--jantt-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {isRoomActive ? t("share.orViewLink") : t("share.orSnapshot")}
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--jantt-border-subtle, #e2e8f0)" }} />
        </div>

        {/* Read-only link */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
            <label htmlFor="share-link-input" style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--jantt-text)" }}>
              {isRoomActive ? t("share.viewOnlyLink") : t("share.snapshotLink")}
            </label>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "100px",
                background: isWhatsAppSafe ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                color: isWhatsAppSafe ? "#10B981" : "#F59E0B",
                border: `1px solid ${isWhatsAppSafe ? "rgba(16, 185, 129, 0.25)" : "rgba(245, 158, 11, 0.25)"}`
              }}
            >
              {isWhatsAppSafe ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
              <span>
                {t("share.chars", { count: safeUrl.length })} &bull;{" "}
                {isWhatsAppSafe ? t("share.whatsappSafe") : t("share.longLink")}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              id="share-link-input"
              type="text"
              readOnly
              className="prompt-input"
              value={safeUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                fontFamily: "var(--jantt-font-mono, monospace)",
                fontSize: "12px",
                flex: "1 1 220px",
                minWidth: 0
              }}
            />
            <button
              type="button"
              className="btn-nav btn-nav-primary"
              onClick={() => handleCopy("link")}
              style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {copiedTarget === "link" ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedTarget === "link" ? t("share.copied") : t("share.copyLink")}</span>
            </button>
            {canNativeShare && (
              <button
                type="button"
                className="btn-nav"
                onClick={handleNativeShare}
                style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
                title={t("share.nativeShareTitle")}
              >
                <Share2 size={14} />
                <span>{t("share.shareViaDevice")}</span>
              </button>
            )}
          </div>

          {isRoomActive && isWebUrl && <RoomQr url={safeUrl} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", flex: "1 1 220px" }}>
              {isRoomActive
                ? t("share.viewLinkHintRoom")
                : t("share.viewLinkHintSnapshot")}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="btn-nav"
                style={{
                  fontSize: "11.5px",
                  padding: "4px 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "rgba(37, 211, 102, 0.12)",
                  color: "#16a34a",
                  borderColor: "rgba(37, 211, 102, 0.3)"
                }}
                onClick={handleWhatsAppShare}
                disabled={!isWebUrl}
                title={isWebUrl ? t("share.whatsappShareTitle") : linkUnavailableTitle}
              >
                <MessageSquare size={13} />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>

          {!isWhatsAppSafe && (
            <div
              style={{
                marginTop: "10px",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "11.5px",
                color: "var(--jantt-text)"
              }}
            >
              <div style={{ fontWeight: 600, color: "#D97706", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <AlertTriangle size={13} />
                <span>{t("share.tooLongTitle")}</span>
              </div>
              <div style={{ color: "var(--jantt-text-muted)", lineHeight: "1.4" }}>
                {t("share.tooLongBody", { count: safeUrl.length })}
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-nav"
                  style={{ fontSize: "11px", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={handleDownloadJson}
                >
                  <Download size={12} />
                  <span>{t("share.downloadJsonFile")}</span>
                </button>
                {!isRoomActive && (
                  <button
                    type="button"
                    className="btn-nav btn-nav-primary"
                    style={{ fontSize: "11px", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={handleStartRoom}
                    disabled={isStartBusy}
                  >
                    <Cloud size={12} />
                    <span>{isLoggedIn && isCloudVerified ? t("share.startRoomInstead") : startRoomLabel}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Embed */}
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--jantt-text)" }}>
              {t("share.embedTitle")}
            </span>
            <button
              type="button"
              className="btn-nav"
              style={{ fontSize: "11px", padding: "3px 8px" }}
              onClick={() => handleCopy("embed")}
              disabled={!embedCode}
              title={embedCode ? undefined : linkUnavailableTitle}
            >
              {copiedTarget === "embed" ? <Check size={12} style={{ color: "#10B981" }} /> : <Copy size={12} />}
              <span>{copiedTarget === "embed" ? t("share.copied") : t("share.copyEmbed")}</span>
            </button>
          </div>
          <code
            style={{
              fontSize: "11px",
              fontFamily: "var(--jantt-font-mono, monospace)",
              background: "var(--jantt-bg, #0B132B)",
              padding: "6px 8px",
              borderRadius: "4px",
              border: "1px solid var(--jantt-border, #1E293B)",
              color: "var(--jantt-text-muted, #94A3B8)",
              overflowX: "auto",
              whiteSpace: "nowrap",
              display: "block"
            }}
          >
            {/* Snapshot links can be huge; the preview shows the ends, the copy button copies it all. */}
            {!embedCode
              ? t("share.embedUnavailable")
              : embedCode.length > 320
              ? `${embedCode.slice(0, 200)}...${embedCode.slice(-90)}`
              : embedCode}
          </code>
        </div>

        {/* Plan source */}
        <div style={{ ...panelStyle, gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileJson size={16} style={{ color: "var(--jantt-accent)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>{t("share.planSource")}</span>
            </div>
            {isWebUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-nav"
                style={{ fontSize: "12px", textDecoration: "none" }}
                title={t("share.openLinkTitle")}
              >
                <ExternalLink size={13} />
                <span>{t("share.openLink")}</span>
              </a>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", flex: "1 1 220px" }}>
              {t("share.planSourceDesc")}
            </span>
            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              <button
                type="button"
                className="btn-nav"
                style={{ fontSize: "11px", padding: "3px 8px" }}
                onClick={() => {
                  close();
                  setIsSidebarCollapsed(false);
                }}
                title={t("share.openJsonEditor")}
              >
                <FileJson size={12} />
                <span>{t("share.viewJson")}</span>
              </button>
              <button
                type="button"
                className="btn-nav"
                style={{ fontSize: "11px", padding: "3px 8px" }}
                onClick={handleDownloadJson}
                title={t("share.downloadJsonTitle")}
              >
                <Download size={12} />
                <span>{t("share.download")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Interop exports */}
        <div style={panelStyle}>
          <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--jantt-text, #1E293B)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Building2 size={13} />
            <span>{t("share.exportTitle")}</span>
          </div>
          <div style={{ color: "var(--jantt-text-muted)", fontSize: "11px", lineHeight: "1.4" }}>
            {t("share.exportDesc")}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-nav"
              style={exportButtonStyle}
              onClick={handleExportMsProject}
              disabled={!parsedData}
              title={t("share.msProjectTitle")}
            >
              <Download size={12} style={{ color: "#38BDF8" }} />
              <span>MS Project (.xml)</span>
            </button>
            <button
              type="button"
              className="btn-nav"
              style={exportButtonStyle}
              onClick={handleExportPrimavera}
              disabled={!parsedData}
              title={t("share.primaveraTitle")}
            >
              <Download size={12} style={{ color: "#F59E0B" }} />
              <span>Primavera P6 (.xer)</span>
            </button>
            <button
              type="button"
              className="btn-nav"
              style={exportButtonStyle}
              onClick={handleExportCsv}
              disabled={!parsedData}
              title={t("share.csvTitle")}
            >
              <Download size={12} style={{ color: "#10B981" }} />
              <span>{t("share.exportCsv")}</span>
            </button>
            <button
              type="button"
              className="btn-nav"
              style={{ ...exportButtonStyle, background: "rgba(168, 85, 247, 0.12)", color: "#C084FC", borderColor: "rgba(168, 85, 247, 0.35)" }}
              onClick={handleExportExecutiveReport}
              disabled={!parsedData}
              title={t("share.reportTitle")}
            >
              <FileText size={12} style={{ color: "#A855F7" }} />
              <span>{t("share.exportReport")}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="prompt-modal-footer" style={{ flexShrink: 0 }}>
        <button type="button" className="btn-nav" onClick={close}>
          {t("common.close")}
        </button>
        <button type="button" className="btn-nav btn-nav-primary" onClick={() => handleCopy("link")}>
          {copiedTarget === "link" ? <Check size={14} /> : <Copy size={14} />}
          <span>{copiedTarget === "link" ? t("share.linkCopiedShort") : t("share.copyLink")}</span>
        </button>
      </div>
    </Modal>
  );
};
