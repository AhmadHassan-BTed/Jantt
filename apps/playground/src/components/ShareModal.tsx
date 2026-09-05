import React from "react";
import {
  Share2,
  X,
  Copy,
  Check,
  Cloud,
  FileJson,
  ExternalLink,
  Download,
  MessageSquare,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import type { JanttData, ThemeDefinition } from "@jantt/core";
import type { SavedProject, ActiveView } from "../types";

interface ShareModalProps {
  showShareModal: boolean;
  setShowShareModal: (show: boolean) => void;
  currentProjectName: string;
  parsedData: JanttData | null;
  activeView: ActiveView;
  activeTheme: ThemeDefinition;
  activeProject?: SavedProject;
  activeProjectId: string;
  shareUrl: string;
  handleCopyShareLink: () => void;
  copiedShareLink: boolean;
  handleNativeShare: () => void;
  handleWhatsAppShare?: () => void;
  isWhatsAppSafe?: boolean;
  handleOpenLinkCloudModal?: () => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  handleDownloadJson: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  showShareModal,
  setShowShareModal,
  currentProjectName,
  parsedData,
  activeView,
  activeTheme,
  activeProject,
  activeProjectId,
  shareUrl,
  handleCopyShareLink,
  copiedShareLink,
  handleNativeShare,
  handleWhatsAppShare,
  isWhatsAppSafe = true,
  handleOpenLinkCloudModal,
  setIsSidebarCollapsed,
  handleDownloadJson
}) => {
  if (!showShareModal) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowShareModal(false)}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "580px", width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(56, 189, 248, 0.15)",
                color: "var(--jantt-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Share2 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Share Project Plan
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                Copy a direct shareable link or open the original plan source.
              </p>
            </div>
          </div>
          <button className="prompt-modal-close-btn" onClick={() => setShowShareModal(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Plan Overview Card */}
          <div
            style={{
              background: "var(--jantt-surface, #F8FAFC)",
              border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
              borderRadius: "10px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--jantt-text)" }}>
                {currentProjectName}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                {parsedData?.tasks?.length || 0} tasks &bull; View: {activeView.toUpperCase()} &bull; Theme: {activeTheme.label}
              </div>
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: "100px",
                background: activeProject?.source === "linked" ? "rgba(16, 185, 129, 0.12)" : "rgba(56, 189, 248, 0.12)",
                color: activeProject?.source === "linked" ? "#10B981" : "var(--jantt-accent)",
                border: `1px solid ${activeProject?.source === "linked" ? "rgba(16, 185, 129, 0.3)" : "rgba(56, 189, 248, 0.3)"}`
              }}
            >
              {activeProject?.source === "linked" ? "Cloud Linked" : activeProjectId === "default" ? "Template" : "Direct Plan"}
            </span>
          </div>

          {/* Shareable Link Input Section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <label
                style={{
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "var(--jantt-text)"
                }}
              >
                Shareable Link:
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
                <span>{shareUrl.length} chars &bull; {isWhatsAppSafe ? "WhatsApp Safe" : "Long Plan"}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                readOnly
                className="prompt-input"
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  fontFamily: "var(--jantt-font-mono, monospace)",
                  fontSize: "12px",
                  flex: 1
                }}
              />
              <button
                className="btn-nav btn-nav-primary"
                onClick={handleCopyShareLink}
                style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
                title="Copy share link to clipboard"
              >
                {copiedShareLink ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedShareLink ? "Copied!" : "Copy Link"}</span>
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                Compressed &bull; Opens exact view and schedule in any browser without account.
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {handleWhatsAppShare && (
                  <button
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
                    title={isWhatsAppSafe ? "Share link directly to WhatsApp" : "Share via WhatsApp"}
                  >
                    <MessageSquare size={13} />
                    <span>WhatsApp</span>
                  </button>
                )}
                {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                  <button
                    className="btn-nav"
                    style={{ fontSize: "11.5px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                    onClick={handleNativeShare}
                    title="Open native device share dialog"
                  >
                    <Share2 size={13} />
                    <span>Device...</span>
                  </button>
                )}
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
                  <span>WhatsApp Link Recommendation</span>
                </div>
                <div style={{ color: "var(--jantt-text-muted)", lineHeight: "1.4" }}>
                  This plan is detailed ({shareUrl.length} chars). WhatsApp truncates links over 2,000 characters. For 100% reliable WhatsApp sharing:
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    className="btn-nav"
                    style={{ fontSize: "11px", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={handleDownloadJson}
                  >
                    <Download size={12} />
                    <span>Download JSON File</span>
                  </button>
                  {handleOpenLinkCloudModal && (
                    <button
                      className="btn-nav btn-nav-primary"
                      style={{ fontSize: "11px", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => {
                        setShowShareModal(false);
                        handleOpenLinkCloudModal();
                      }}
                    >
                      <Cloud size={12} />
                      <span>Link Cloud Source (~80 chars)</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Source Document Section */}
          <div
            style={{
              background: "var(--jantt-surface, #F8FAFC)",
              border: "1px solid var(--jantt-border, #E2E8F0)",
              borderRadius: "10px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {activeProject?.source === "linked" ? (
                  <Cloud size={16} style={{ color: "var(--jantt-accent)" }} />
                ) : (
                  <FileJson size={16} style={{ color: "var(--jantt-accent)" }} />
                )}
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                  {activeProject?.source === "linked" ? "Original Cloud Source" : "Plan Source"}
                </span>
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                {activeProject?.sourceUrl ? (
                  <a
                    href={activeProject.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-nav btn-nav-primary"
                    style={{ fontSize: "12px", textDecoration: "none" }}
                    title="Open the original source file URL in a new browser tab"
                  >
                    <ExternalLink size={13} />
                    <span>Open Source</span>
                  </a>
                ) : (
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-nav"
                    style={{ fontSize: "12px", textDecoration: "none" }}
                    title="Open this plan link in a new browser tab"
                  >
                    <ExternalLink size={13} />
                    <span>Open Link</span>
                  </a>
                )}
              </div>
            </div>

            {activeProject?.sourceUrl ? (
              <div
                style={{
                  fontSize: "11.5px",
                  color: "var(--jantt-text-muted)",
                  wordBreak: "break-all",
                  fontFamily: "var(--jantt-font-mono, monospace)",
                  background: "var(--jantt-bg, #FFFFFF)",
                  border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
                  borderRadius: "6px",
                  padding: "8px 10px"
                }}
              >
                {activeProject.sourceUrl}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                  Raw JSON schedule data is self-contained. You can inspect or download the JSON source.
                </span>
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button
                    className="btn-nav"
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                    onClick={() => {
                      setShowShareModal(false);
                      setIsSidebarCollapsed(false);
                    }}
                    title="Open JSON editor sidebar"
                  >
                    <FileJson size={12} />
                    <span>View JSON</span>
                  </button>
                  <button
                    className="btn-nav"
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                    onClick={handleDownloadJson}
                    title="Download JSON file"
                  >
                    <Download size={12} />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="prompt-modal-footer">
          <button className="btn-nav" onClick={() => setShowShareModal(false)}>
            Close
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            {activeProject?.sourceUrl && (
              <a
                href={activeProject.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-nav"
                style={{ textDecoration: "none" }}
              >
                <ExternalLink size={13} />
                <span>Open Source</span>
              </a>
            )}
            <button
              className="btn-nav btn-nav-primary"
              onClick={handleCopyShareLink}
            >
              {copiedShareLink ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedShareLink ? "Link Copied!" : "Copy Share Link"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
