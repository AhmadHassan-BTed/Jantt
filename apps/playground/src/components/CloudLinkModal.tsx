import React from "react";
import {
  Cloud,
  X,
  Globe,
  Loader2,
  Link2,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import type { RemoteFetchResult } from "@jantt/core";

interface CloudLinkModalProps {
  showLinkCloudModal: boolean;
  setShowLinkCloudModal: (show: boolean) => void;
  linkCloudUrl: string;
  setLinkCloudUrl: (url: string) => void;
  linkCloudName: string;
  setLinkCloudName: (name: string) => void;
  isFetchingCloudPreview: boolean;
  cloudPreviewResult: RemoteFetchResult | null;
  cloudPreviewError: string | null;
  setCloudPreviewError: (err: string | null) => void;
  handleFetchCloudPreview: () => void;
  handleSaveLinkedCloudPlan: () => void;
}

export const CloudLinkModal: React.FC<CloudLinkModalProps> = ({
  showLinkCloudModal,
  setShowLinkCloudModal,
  linkCloudUrl,
  setLinkCloudUrl,
  linkCloudName,
  setLinkCloudName,
  isFetchingCloudPreview,
  cloudPreviewResult,
  cloudPreviewError,
  setCloudPreviewError,
  handleFetchCloudPreview,
  handleSaveLinkedCloudPlan
}) => {
  if (!showLinkCloudModal) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowLinkCloudModal(false)}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "620px", width: "90%" }}
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
              <Cloud size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Link Remote / Cloud Plan
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                Paste a link to your file from Google Drive, GitHub, Dropbox, or any direct JSON URL.
              </p>
            </div>
          </div>
          <button className="btn-modal-close" onClick={() => setShowLinkCloudModal(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Cloud Tips Banner */}
          <div
            style={{
              background: "var(--jantt-surface, #F8FAFC)",
              border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
              borderRadius: "8px",
              padding: "12px 14px",
              fontSize: "12px",
              color: "var(--jantt-text)"
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Globe size={14} style={{ color: "var(--jantt-accent)" }} />
              <span>How to get share links:</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--jantt-text-muted)", lineHeight: 1.6 }}>
              <li>
                <strong>Google Drive:</strong> Right-click file &rarr; <em>Share</em> &rarr; Set to <em>&quot;Anyone with the link can view&quot;</em> &rarr; Copy link &amp; paste here.
              </li>
              <li>
                <strong>GitHub:</strong> Paste any GitHub file URL (e.g. <code>github.com/.../blob/main/schedule.json</code>).
              </li>
              <li>
                <strong>Dropbox:</strong> Paste any shared Dropbox link (e.g. <code>dropbox.com/s/.../plan.json</code>).
              </li>
              <li>
                <strong>Direct URL:</strong> Any public HTTPS endpoint serving valid Jantt JSON.
              </li>
            </ul>
          </div>

          {/* URL Input */}
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, marginBottom: "6px", color: "var(--jantt-text)" }}>
              Cloud Share Link or JSON URL:
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                className="prompt-input"
                style={{ flex: 1 }}
                placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                value={linkCloudUrl}
                onChange={(e) => {
                  setLinkCloudUrl(e.target.value);
                  setCloudPreviewError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFetchCloudPreview();
                }}
              />
              <button
                className="btn-nav btn-nav-primary"
                onClick={handleFetchCloudPreview}
                disabled={isFetchingCloudPreview || !linkCloudUrl.trim()}
                style={{ whiteSpace: "nowrap" }}
              >
                {isFetchingCloudPreview ? (
                  <>
                    <Loader2 size={14} className="spin-sync-icon" />
                    <span>Fetching...</span>
                  </>
                ) : (
                  <>
                    <Link2 size={14} />
                    <span>Fetch &amp; Preview</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Alert */}
          {cloudPreviewError && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid #EF4444",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "12.5px",
                color: "#EF4444",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px"
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <div style={{ fontWeight: 600 }}>Unable to link remote plan:</div>
                <div style={{ marginTop: "2px", whiteSpace: "pre-wrap" }}>{cloudPreviewError}</div>
              </div>
            </div>
          )}

          {/* Preview Card */}
          {cloudPreviewResult && (
            <div
              style={{
                background: "rgba(56, 189, 248, 0.06)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "8px",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle2 size={16} style={{ color: "#10B981" }} />
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--jantt-text)" }}>
                    {cloudPreviewResult.title}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "100px",
                    background: "var(--jantt-accent)",
                    color: "var(--jantt-accent-contrast, #FFFFFF)"
                  }}
                >
                  {cloudPreviewResult.info.label}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", fontSize: "12px" }}>
                <div style={{ background: "var(--jantt-surface, #F8FAFC)", padding: "8px", borderRadius: "6px" }}>
                  <div style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>Tasks</div>
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--jantt-text)" }}>
                    {cloudPreviewResult.taskCount}
                  </div>
                </div>
                <div style={{ background: "var(--jantt-surface, #F8FAFC)", padding: "8px", borderRadius: "6px" }}>
                  <div style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>Categories</div>
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--jantt-text)" }}>
                    {Object.keys(cloudPreviewResult.data.categories || {}).length}
                  </div>
                </div>
                <div style={{ background: "var(--jantt-surface, #F8FAFC)", padding: "8px", borderRadius: "6px" }}>
                  <div style={{ color: "var(--jantt-text-muted)", fontSize: "11px" }}>Schema</div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#10B981", marginTop: "2px" }}>
                    Valid &#x2713;
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--jantt-text)" }}>
                  Display Name (in your plan selector):
                </label>
                <input
                  type="text"
                  className="prompt-input"
                  value={linkCloudName}
                  onChange={(e) => setLinkCloudName(e.target.value)}
                  placeholder="Custom display name"
                />
              </div>
            </div>
          )}
        </div>

        <div className="prompt-modal-footer">
          <button className="btn-nav" onClick={() => setShowLinkCloudModal(false)}>
            Cancel
          </button>
          <button
            className="btn-nav btn-nav-primary"
            onClick={handleSaveLinkedCloudPlan}
            disabled={!linkCloudUrl.trim() || isFetchingCloudPreview}
          >
            <Cloud size={14} />
            <span>Save &amp; Subscribe to Plan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
