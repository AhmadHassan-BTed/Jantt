import { useState, useMemo, useCallback, useEffect } from "react";
import type { JanttData } from "@jantt/core";
import type { SavedProject, ActiveView } from "../types";
import { DEFAULT_TEMPLATE } from "../constants";
import { encodeDataToBase64Url } from "../utils";

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

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    const pathname = window.location.pathname;

    if (activeProject && activeProject.source === "room" && activeProject.roomId) {
      const secret = activeProject.secretKey;
      if (secret) {
        return `${origin}${pathname}?room=${encodeURIComponent(activeProject.roomId)}&view=${activeView}&theme=${selectedThemeId}#key=${encodeURIComponent(secret)}`;
      }
      return `${origin}${pathname}?room=${encodeURIComponent(activeProject.roomId)}&view=${activeView}&theme=${selectedThemeId}`;
    }

    if (activeProject && activeProject.source === "linked" && activeProject.sourceUrl) {
      return `${origin}${pathname}?url=${encodeURIComponent(activeProject.sourceUrl)}&view=${activeView}&theme=${selectedThemeId}`;
    }

    if (activeProjectId === "default" && jsonText === JSON.stringify(DEFAULT_TEMPLATE.data, null, 2)) {
      return `${origin}${pathname}?plan=default&view=${activeView}&theme=${selectedThemeId}`;
    }

    // Local / custom plan or edited template
    if (parsedData) {
      const b64 = encodeDataToBase64Url(parsedData);
      const nameParam =
        currentProjectName && currentProjectName !== DEFAULT_TEMPLATE.name
          ? `&name=${encodeURIComponent(currentProjectName)}`
          : "";
      return `${origin}${pathname}?view=${activeView}&theme=${selectedThemeId}${nameParam}#data=${b64}`;
    }

    return `${origin}${pathname}`;
  }, [activeProjectId, activeProject, activeView, selectedThemeId, parsedData, jsonText, currentProjectName]);

  // Keep browser address bar clean and synchronized with view/theme/room without hash-thrashing local plans
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const currentUrl = new URL(window.location.href);
      let changed = false;

      // Handle room URL parameters
      if (activeProject?.source === "room" && activeProject.roomId) {
        if (currentUrl.searchParams.get("room") !== activeProject.roomId) {
          currentUrl.searchParams.set("room", activeProject.roomId);
          changed = true;
        }
        if (activeProject.secretKey) {
          const expectedHash = `#key=${encodeURIComponent(activeProject.secretKey)}`;
          if (window.location.hash !== expectedHash) {
            currentUrl.hash = expectedHash;
            changed = true;
          }
        }
      } else {
        if (currentUrl.searchParams.has("room")) {
          currentUrl.searchParams.delete("room");
          changed = true;
        }
        if (currentUrl.searchParams.has("cloud")) {
          currentUrl.searchParams.delete("cloud");
          changed = true;
        }
        if (currentUrl.searchParams.has("plan")) {
          currentUrl.searchParams.delete("plan");
          changed = true;
        }
        if (currentUrl.searchParams.has("data")) {
          currentUrl.searchParams.delete("data");
          changed = true;
        }
        if (currentUrl.searchParams.has("name")) {
          currentUrl.searchParams.delete("name");
          changed = true;
        }
        if (window.location.hash.startsWith("#key=") || window.location.hash.startsWith("#edit=")) {
          currentUrl.hash = "";
          changed = true;
        }
      }

      if (currentUrl.searchParams.get("view") !== activeView) {
        currentUrl.searchParams.set("view", activeView);
        changed = true;
      }
      if (currentUrl.searchParams.get("theme") !== selectedThemeId) {
        currentUrl.searchParams.set("theme", selectedThemeId);
        changed = true;
      }

      if (changed) {
        window.history.replaceState(null, "", currentUrl.toString());
      }
    } catch {}
  }, [activeProject?.source, activeProject?.roomId, activeProject?.secretKey, activeView, selectedThemeId]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.left = "-999999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedShareLink(true);
      showToast("Shareable link copied to clipboard!");
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch {
      showToast("Failed to copy link to clipboard", true);
    }
  }, [shareUrl, showToast]);

  const handleNativeShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: currentProjectName,
          text: `Check out this project plan: ${currentProjectName}`,
          url: shareUrl
        });
        showToast("Shared successfully!");
      }
    } catch {
      // User cancelled native share
    }
  }, [shareUrl, currentProjectName, showToast]);

  const isWhatsAppSafe = useMemo(() => {
    // WhatsApp GET /send query limit is 2,048 chars; keeping shareUrl under 1,900 ensures the full message sends cleanly
    return shareUrl.length <= 1900;
  }, [shareUrl]);

  const handleWhatsAppShare = useCallback(() => {
    if (!shareUrl) return;
    const msg = `Check out this project plan: ${currentProjectName}\n\n${shareUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }, [shareUrl, currentProjectName]);

  return {
    showShareModal,
    setShowShareModal,
    copiedShareLink,
    setCopiedShareLink,
    shareUrl,
    handleCopyShareLink,
    handleNativeShare,
    handleWhatsAppShare,
    isWhatsAppSafe
  };
}
