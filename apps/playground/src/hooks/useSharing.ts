import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { JanttData } from "@jantt/core";
import type { SavedProject, ActiveView } from "../types";
import { DEFAULT_TEMPLATE } from "../constants";
import { encodeDataToBase64Url } from "../utils";
import { tGlobal } from "../i18n";
import { buildRoomViewerUrl } from "../room-storage";

interface UseSharingOptions {
  activeProjectId: string;
  activeProject?: SavedProject;
  currentProjectName: string;
  activeView: ActiveView;
  selectedThemeId: string;
  parsedData: JanttData | null;
  jsonText: string;
  showToast: (msg: string, isErr?: boolean) => void;
}

let defaultTemplateJson: string | null = null;
function getDefaultTemplateJson(): string {
  if (defaultTemplateJson === null) defaultTemplateJson = JSON.stringify(DEFAULT_TEMPLATE.data, null, 2);
  return defaultTemplateJson;
}

function buildAppUrl(params: URLSearchParams, hash = ""): string {
  const query = params.toString();
  return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}${hash}`;
}

/** Copies text to the clipboard, with a fallback for non-secure contexts. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-999999px";
  document.body.appendChild(ta);
  try {
    ta.select();
    if (!document.execCommand("copy")) throw new Error(tGlobal("hooks.sharing.copyRejected"));
  } finally {
    document.body.removeChild(ta);
  }
}

export function useSharing({
  activeProjectId,
  activeProject,
  currentProjectName,
  activeView,
  selectedThemeId,
  parsedData,
  jsonText,
  showToast
}: UseSharingOptions) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  const roomId = activeProject?.source === "room" ? activeProject.roomId : undefined;

  /**
   * Builds the share link of the active plan. Room links only identify the room (never a key);
   * other plans embed their data in the hash, which is the expensive part (clone + deflate).
   */
  const buildShareUrl = useCallback((): string => {
    if (typeof window === "undefined") return "";

    if (roomId) return buildRoomViewerUrl(roomId, activeView, selectedThemeId);

    const params = new URLSearchParams();
    if (activeProjectId === "default" && jsonText === getDefaultTemplateJson()) {
      params.set("plan", "default");
      params.set("view", activeView);
      params.set("theme", selectedThemeId);
      return buildAppUrl(params);
    }

    params.set("view", activeView);
    params.set("theme", selectedThemeId);
    if (!parsedData) return buildAppUrl(params);
    if (currentProjectName && currentProjectName !== DEFAULT_TEMPLATE.name) {
      params.set("name", currentProjectName);
    }
    return buildAppUrl(params, `#data=${encodeDataToBase64Url(parsedData)}`);
  }, [roomId, activeProjectId, activeView, selectedThemeId, parsedData, jsonText, currentProjectName]);

  // Only computed while the share dialog is open, so editing never pays for compressing the plan.
  const shareUrl = useMemo(() => (showShareModal ? buildShareUrl() : ""), [showShareModal, buildShareUrl]);

  // Keep ?view= and ?theme= in the address bar current. Room parameters belong to useRoomSync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      let changed = false;

      if (!roomId) {
        // One-shot share parameters have been consumed at load time.
        for (const key of ["plan", "data", "name"]) {
          if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
          }
        }
      }
      if (url.searchParams.get("view") !== activeView) {
        url.searchParams.set("view", activeView);
        changed = true;
      }
      if (url.searchParams.get("theme") !== selectedThemeId) {
        url.searchParams.set("theme", selectedThemeId);
        changed = true;
      }

      if (changed) window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // intentionally ignored: the History API can be unavailable (sandboxed frames); the
      // address bar is cosmetic and share links are built from state, not from it.
    }
  }, [roomId, activeView, selectedThemeId]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    },
    []
  );

  const handleCopyShareLink = useCallback(async () => {
    const url = shareUrl || buildShareUrl();
    if (!url) return;
    try {
      await copyText(url);
      setCopiedShareLink(true);
      showToast(tGlobal("hooks.sharing.linkCopied"));
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopiedShareLink(false), 2500);
    } catch {
      showToast(tGlobal("hooks.sharing.copyFailed"), true);
    }
  }, [shareUrl, buildShareUrl, showToast]);

  const handleNativeShare = useCallback(async () => {
    const url = shareUrl || buildShareUrl();
    if (!url || !navigator.share) return;
    try {
      await navigator.share({
        title: currentProjectName,
        text: tGlobal("hooks.sharing.shareText", { name: currentProjectName }),
        url
      });
      showToast(tGlobal("hooks.sharing.shared"));
    } catch (err) {
      // Closing the share sheet rejects with AbortError: not a failure.
      if (err instanceof Error && err.name === "AbortError") return;
      showToast(tGlobal("hooks.sharing.shareSheetFailed"), true);
    }
  }, [shareUrl, buildShareUrl, currentProjectName, showToast]);

  // WhatsApp's GET /send limit is 2,048 chars; keeping the link under 1,900 leaves room for the message.
  const isWhatsAppSafe = useMemo(() => shareUrl.length <= 1900, [shareUrl]);

  const handleWhatsAppShare = useCallback(() => {
    const url = shareUrl || buildShareUrl();
    if (!url) return;
    const msg = `${tGlobal("hooks.sharing.shareText", { name: currentProjectName })}\n\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }, [shareUrl, buildShareUrl, currentProjectName]);

  return {
    showShareModal,
    setShowShareModal,
    copiedShareLink,
    setCopiedShareLink,
    shareUrl,
    buildShareUrl,
    handleCopyShareLink,
    handleNativeShare,
    handleWhatsAppShare,
    isWhatsAppSafe
  };
}
