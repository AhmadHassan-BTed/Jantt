import React, { useState } from "react";
import {
  Star,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Heart,
  Unlock,
  AlertCircle,
  Sparkles,
  Info
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
  onAutoVerify?: () => Promise<boolean>;
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
  onAutoVerify,
  hasGithubToken
}) => {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStarringAll, setIsStarringAll] = useState(false);
  const [starringRepoName, setStarringRepoName] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isAutoUnlocking, setIsAutoUnlocking] = useState(false);

  if (!show) return null;

  const isVerified = Boolean(verificationStatus?.isVerified);
  const isFollowingCreator = Boolean(verificationStatus?.isFollowingCreator);
  const missingRepos = verificationStatus?.missingRepos || [];
  const totalRepos = verificationStatus?.totalRepos || 5;
  const starredCount = totalRepos - missingRepos.length;

  const handle1ClickAutoUnlock = async () => {
    setActionError(null);
    setIsAutoUnlocking(true);
    try {
      if (onAutoVerify) {
        const ok = await onAutoVerify();
        if (!ok) {
          await onFollowCreator();
          await onStarAll();
        }
      } else {
        await onFollowCreator();
        await onStarAll();
      }
      await onVerify();
    } catch (e: any) {
      setActionError(e?.message || "Could not complete auto-unlock. Please try the manual buttons below.");
    } finally {
      setIsAutoUnlocking(false);
    }
  };

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
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(8px)",
        padding: "16px"
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#0f172a", // Explicit deep navy/slate container for 100% contrast in all themes
          border: isVerified ? "1px solid #22c55e" : "1px solid #334155",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
          padding: "24px",
          color: "#f8fafc", // Crisp white text
          maxHeight: "88vh",
          overflowY: "auto",
          fontFamily: "inherit"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "14px",
            marginBottom: "16px"
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: isVerified ? "rgba(34, 197, 94, 0.2)" : "rgba(245, 158, 11, 0.2)",
              color: isVerified ? "#22c55e" : "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            {isVerified ? <Unlock size={24} /> : <Star size={24} />}
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.25rem",
                fontWeight: 700,
                color: isVerified ? "#22c55e" : "#f8fafc"
              }}
            >
              {isVerified ? "Cloud Collaboration Unlocked!" : "Support Creator to Unlock Cloud"}
            </h2>
            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "0.85rem",
                color: "#94a3b8"
              }}
            >
              {isVerified
                ? "Your GitHub account is verified. You have full access to real-time cloud rooms."
                : "Support the creator with stars & follow to access free real-time cloud rooms."}
            </p>
          </div>
        </div>

        {/* Upfront Transparency & Consent Card */}
        {!isVerified && (
          <div
            style={{
              background: "rgba(56, 189, 248, 0.08)",
              border: "1px solid rgba(56, 189, 248, 0.2)",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "16px",
              display: "flex",
              gap: "10px",
              fontSize: "0.82rem",
              color: "#e2e8f0",
              lineHeight: 1.45
            }}
          >
            <Info size={18} color="#38bdf8" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ color: "#38bdf8" }}>Transparent Consent:</strong> Real-time cloud sync is 100% free and open. By connecting, you agree to auto-follow <strong>@AhmadHassan-BTed</strong> and star the core project repositories using your GitHub session.
            </div>
          </div>
        )}

        {/* 1-Click Auto-Unlock Button (If not yet verified) */}
        {!isVerified && hasGithubToken && (
          <div style={{ marginBottom: "18px" }}>
            <button
              type="button"
              onClick={handle1ClickAutoUnlock}
              disabled={isAutoUnlocking || isVerifying}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                padding: "12px 16px",
                fontSize: "0.92rem",
                fontWeight: 700,
                cursor: isAutoUnlocking ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 4px 15px rgba(99, 102, 241, 0.35)",
                transition: "all 0.2s ease"
              }}
            >
              {isAutoUnlocking ? (
                <RefreshCw size={16} className="spin-sync-icon" />
              ) : (
                <Sparkles size={16} />
              )}
              <span>{isAutoUnlocking ? "Auto-Unlocking Cloud Access..." : "1-Click Auto-Unlock (Consent Given)"}</span>
            </button>
          </div>
        )}

        {/* Progress Bar */}
        <div
          style={{
            background: "rgba(30, 41, 59, 0.7)",
            borderRadius: "10px",
            padding: "12px 14px",
            marginBottom: "18px",
            border: "1px solid #334155"
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
            <span style={{ color: "#cbd5e1" }}>Verification Progress</span>
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
              color: "#f87171",
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
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid #334155",
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
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc" }}>
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
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
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
                  background: "rgba(34, 197, 94, 0.15)",
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
                  color: "#0f172a",
                  border: "none",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
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

          {/* Step 2: Star Flagship Repositories */}
          <div
            style={{
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid #334155",
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
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc" }}>
                  Core Repositories ({starredCount}/{totalRepos} Starred)
                </span>
              </div>

              {missingRepos.length > 0 && hasGithubToken && (
                <button
                  type="button"
                  onClick={handle1ClickStarAll}
                  disabled={isStarringAll || isVerifying}
                  style={{
                    background: "linear-gradient(135deg, #f59e0b, #eab308)",
                    color: "#0f172a",
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
                  title="Automatically star all missing repositories in 1 click"
                >
                  {isStarringAll ? (
                    <RefreshCw size={11} className="spin-sync-icon" />
                  ) : (
                    <Star size={11} />
                  )}
                  <span>Star All Remaining</span>
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
                    padding: "7px 10px",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    fontSize: "0.82rem"
                  }}
                >
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#38bdf8",
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px"
                    }}
                  >
                    <span>{repo.fullName}</span>
                    <ExternalLink size={11} color="#94a3b8" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handle1ClickStar(repo)}
                    disabled={starringRepoName === repo.fullName || isVerifying}
                    style={{
                      background: "rgba(245, 158, 11, 0.2)",
                      color: "#fbbf24",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      borderRadius: "5px",
                      padding: "3px 9px",
                      fontSize: "0.75rem",
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
                    fontSize: "0.82rem",
                    color: "#22c55e",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>All required core repositories are starred! Thank you for your support.</span>
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
                background: isVerified ? "#38bdf8" : "#22c55e",
                color: "#0f172a",
                border: "none",
                borderRadius: "8px",
                padding: "10px 14px",
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
                color: "#f8fafc",
                border: "1px solid #475569",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {isVerified ? "Close" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
