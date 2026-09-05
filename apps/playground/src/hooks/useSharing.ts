import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

  // Keep browser address bar continuously updated with active plan's shareable link
  const prevViewRef = useRef(activeView);
  const prevProjectRef = useRef(activeProjectId);

  useEffect(() => {
    if (typeof window === "undefined" || !shareUrl) return;

    const isViewOrProjectChange =
      prevViewRef.current !== activeView || prevProjectRef.current !== activeProjectId;
    prevViewRef.current = activeView;
    prevProjectRef.current = activeProjectId;

    const syncUrl = () => {
      try {
        const currentHref = window.location.href;
        if (currentHref !== shareUrl) {
          window.history.replaceState(null, "", shareUrl);
        }
      } catch {
        // Cross-origin iframe fallback
      }
    };

    if (isViewOrProjectChange) {
      syncUrl();
      return;
    }

    const timer = setTimeout(syncUrl, 250);
    return () => clearTimeout(timer);
  }, [shareUrl, activeView, activeProjectId]);

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
