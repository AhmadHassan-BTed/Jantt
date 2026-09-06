import React, { useState } from "react";
import {
  Star,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Heart,
  Unlock,
  AlertCircle
} from "lucide-react";
import type { VerificationStatus, RepoItem } from "../../firebase";

interface GitHubVerificationModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  verificationStatus: VerificationStatus | null;
  isVerifying: boolean;
  onVerify: () => Promise<VerificationStatus>;
  onFollowCreator: () => Promise<boolean>;
  onStarRepo: (repoFullName: string) => Promise<boolean>;
  onStarAll: () => Promise<{ success: number; failed: number }>;
  githubUsername?: string;
  hasGithubToken: boolean;
}

export const GitHubVerificationModal: React.FC<GitHubVerificationModalProps> = ({
  show,
  setShow,
  verificationStatus,
  isVerifying,
  onVerify,
  onFollowCreator,
  onStarRepo,
  onStarAll,
  hasGithubToken
}) => {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStarringAll, setIsStarringAll] = useState(false);
  const [starringRepoName, setStarringRepoName] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  if (!show) return null;

  const isVerified = Boolean(verificationStatus?.isVerified);
  const isFollowingCreator = Boolean(verificationStatus?.isFollowingCreator);
  const missingRepos = verificationStatus?.missingRepos || [];
  const totalRepos = verificationStatus?.totalRepos || 4;
  const starredCount = totalRepos - missingRepos.length;

  const handle1ClickFollow = async () => {
    setActionError(null);
    setIsFollowing(true);
    try {
      const ok = await onFollowCreator();
      if (!ok) {
        window.open("https://github.com/AhmadHassan-BTed", "_blank");
      }
    } catch {
      window.open("https://github.com/AhmadHassan-BTed", "_blank");
    } finally {
      setIsFollowing(false);
    }
  };

  const handle1ClickStar = async (repo: RepoItem) => {
    setActionError(null);
    setStarringRepoName(repo.fullName);
    try {
      const ok = await onStarRepo(repo.fullName);
      if (!ok) {
        window.open(repo.url, "_blank");
      }
    } catch {
      window.open(repo.url, "_blank");
    } finally {
      setStarringRepoName(null);
    }
  };

  const handle1ClickStarAll = async () => {
    setActionError(null);
    setIsStarringAll(true);
    try {
      await onStarAll();
    } catch (e: any) {
      setActionError(e?.message || "Failed to star all repositories automatically.");
    } finally {
      setIsStarringAll(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (isVerified) setShow(false);
      }}
      style={{
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)"
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "92%",
          maxWidth: "540px",
          background: "var(--jantt-card-bg, #161b22)",
          border: isVerified ? "1px solid #22c55e" : "1px solid var(--jantt-border, #30363d)",
          borderRadius: "14px",
          boxShadow: "0 20px 45px rgba(0,0,0,0.6)",
          padding: "24px",
          color: "var(--jantt-text, #f0f6fc)",
          maxHeight: "90vh",
          overflowY: "auto",
          fontFamily: "inherit"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px"
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              background: isVerified ? "rgba(34, 197, 94, 0.15)" : "rgba(245, 158, 11, 0.15)",
              color: isVerified ? "#22c55e" : "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            {isVerified ? <Unlock size={22} /> : <Star size={22} />}
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.2rem",
                fontWeight: 700,
                color: isVerified ? "#22c55e" : "var(--jantt-text, #f0f6fc)"
              }}
            >
              {isVerified ? "Cloud Collaboration Unlocked!" : "Support Creator to Unlock Cloud"}
            </h2>
            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "0.83rem",
                color: "var(--jantt-text-muted, #8b949e)"
              }}
            >
              {isVerified
                ? "Your GitHub account is verified. You have full access to real-time multi-user rooms."
                : "Star developer repos and follow the creator to use free real-time cloud rooms."}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: "8px",
            padding: "12px 14px",
            marginBottom: "18px",
            border: "1px solid var(--jantt-border, rgba(255,255,255,0.08))"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.82rem",
              fontWeight: 600,
              marginBottom: "8px"
            }}
          >
            <span>Verification Progress</span>
            <span style={{ color: isVerified ? "#22c55e" : "#38bdf8" }}>
              {isVerified
                ? "100% Complete"
                : `${isFollowingCreator ? 1 : 0} Follow • ${starredCount}/${totalRepos} Repos`}
            </span>
          </div>
          <div
            style={{
              height: "6px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "4px",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                height: "100%",
                width: isVerified
                  ? "100%"
                  : `${Math.round((((isFollowingCreator ? 1 : 0) + starredCount) / (1 + totalRepos)) * 100)}%`,
                background: isVerified
                  ? "#22c55e"
                  : "linear-gradient(90deg, #38bdf8, #818cf8)",
                transition: "width 0.3s ease"
              }}
            />
          </div>
        </div>

        {actionError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "8px",
              color: "#ef4444",
              fontSize: "0.82rem",
              marginBottom: "16px"
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{actionError}</span>
          </div>
        )}

        {/* Verification Checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          {/* Step 1: Follow AhmadHassan-BTed */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--jantt-border, rgba(255,255,255,0.06))",
              borderRadius: "8px",
              padding: "10px 12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {isFollowingCreator ? (
                <CheckCircle2 size={18} color="#22c55e" style={{ flexShrink: 0 }} />
              ) : (
                <XCircle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Follow Creator:{" "}
                  <a
                    href="https://github.com/AhmadHassan-BTed"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#38bdf8", textDecoration: "none" }}
                  >
                    @AhmadHassan-BTed
                  </a>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--jantt-text-muted, #8b949e)" }}>
                  {isFollowingCreator ? "You are following the creator" : "Click to follow with 1-click"}
                </div>
              </div>
            </div>

            {isFollowingCreator ? (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#22c55e",
                  background: "rgba(34, 197, 94, 0.1)",
                  padding: "3px 8px",
                  borderRadius: "6px"
                }}
              >
                Following
              </span>
            ) : (
              <button
                type="button"
                onClick={handle1ClickFollow}
                disabled={isFollowing || isVerifying}
                style={{
                  background: "#38bdf8",
                  color: "#000",
                  border: "none",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px"
                }}
              >
                {isFollowing ? (
                  <RefreshCw size={12} className="spin-sync-icon" />
                ) : (
                  <Heart size={12} />
                )}
                <span>Follow</span>
              </button>
            )}
          </div>

          {/* Step 2: Explore Organization */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--jantt-border, rgba(255,255,255,0.06))",
              borderRadius: "8px",
              padding: "10px 12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <CheckCircle2 size={18} color="#22c55e" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Explore Organization:{" "}
                  <span style={{ color: "#a78bfa" }}>Fractal-Compute-Orchestrations</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--jantt-text-muted, #8b949e)" }}>
                  Open-source compute engine
                </div>
              </div>
            </div>

            <a
              href="https://github.com/Fractal-Compute-Orchestrations"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.78rem",
                color: "#a78bfa",
                textDecoration: "none",
                background: "rgba(167, 139, 250, 0.1)",
                padding: "4px 8px",
                borderRadius: "6px"
              }}
            >
              <span>Visit</span>
              <ExternalLink size={11} />
            </a>
          </div>

          {/* Step 3: Star Repositories */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--jantt-border, rgba(255,255,255,0.06))",
              borderRadius: "8px",
              padding: "12px"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "10px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Star size={16} color={missingRepos.length === 0 ? "#22c55e" : "#f59e0b"} />
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Developer Repositories ({starredCount}/{totalRepos} Starred)
                </span>
              </div>

              {missingRepos.length > 0 && hasGithubToken && (
                <button
                  type="button"
                  onClick={handle1ClickStarAll}
                  disabled={isStarringAll || isVerifying}
                  style={{
                    background: "linear-gradient(135deg, #f59e0b, #eab308)",
                    color: "#000",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 9px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px"
                  }}
                  title="Automatically star all missing repositories in 1 click using your GitHub OAuth session"
                >
                  {isStarringAll ? (
                    <RefreshCw size={11} className="spin-sync-icon" />
                  ) : (
                    <Star size={11} />
                  )}
                  <span>Star All Remaining (1-Click)</span>
                </button>
              )}
            </div>

            {/* List of Repositories */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {missingRepos.map((repo) => (
                <div
                  key={repo.fullName}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "6px",
                    fontSize: "0.8rem"
                  }}
                >
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#38bdf8",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px"
                    }}
                  >
                    <span>{repo.fullName}</span>
                    <ExternalLink size={10} color="#8b949e" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handle1ClickStar(repo)}
                    disabled={starringRepoName === repo.fullName || isVerifying}
                    style={{
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "#f59e0b",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      borderRadius: "5px",
                      padding: "3px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    {starringRepoName === repo.fullName ? (
                      <RefreshCw size={10} className="spin-sync-icon" />
                    ) : (
                      <Star size={10} />
                    )}
                    <span>Star</span>
                  </button>
                </div>
              ))}

              {missingRepos.length === 0 && (
                <div
                  style={{
                    padding: "8px",
                    fontSize: "0.8rem",
                    color: "#22c55e",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>All required repositories are starred! Thank you for your support.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={() => onVerify()}
              disabled={isVerifying}
              style={{
                flex: 1,
                background: isVerified ? "var(--jantt-accent, #38bdf8)" : "#22c55e",
                color: "#000",
                border: "none",
                borderRadius: "8px",
                padding: "9px 14px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: isVerifying ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px"
              }}
            >
              {isVerifying ? (
                <RefreshCw size={14} className="spin-sync-icon" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              <span>{isVerified ? "Done (Cloud Unlocked)" : "Re-Check Status"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShow(false)}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "var(--jantt-text, #f0f6fc)",
                border: "1px solid var(--jantt-border, rgba(255,255,255,0.12))",
                borderRadius: "8px",
                padding: "9px 14px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {isVerified ? "Close" : "Continue in Local Mode"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
