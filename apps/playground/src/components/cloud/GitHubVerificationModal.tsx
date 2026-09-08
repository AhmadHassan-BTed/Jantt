import React, { useState, useEffect } from "react";
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
  Info,
  Building2,
  X
} from "lucide-react";
import type { VerificationStatus, RepoItem } from "../../firebase";

interface GitHubVerificationModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  verificationStatus: VerificationStatus | null;
  isVerifying: boolean;
  onVerify: () => Promise<VerificationStatus>;
  onFollowCreator: () => Promise<boolean>;
  onFollowOrg?: () => Promise<boolean>;
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
  onFollowOrg,
  onStarRepo,
  onStarAll,
  onAutoVerify,
  hasGithubToken
}) => {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStarringAll, setIsStarringAll] = useState(false);
  const [starringRepoName, setStarringRepoName] = useState<string | null>(null);
  const [isFollowingCreator, setIsFollowingCreator] = useState(false);
  const [isFollowingOrg, setIsFollowingOrg] = useState(false);
  const [isAutoUnlocking, setIsAutoUnlocking] = useState(false);

  // Optimistic tracking so stars/follows react instantly without lag or getting stuck
  const [optimisticStarred, setOptimisticStarred] = useState<Set<string>>(new Set());
  const [optimisticFollowUser, setOptimisticFollowUser] = useState(false);
  const [optimisticFollowOrg, setOptimisticFollowOrg] = useState(false);

  // Auto-check on mount, on window focus (e.g. user returns from starring on GitHub), and auto-polling
  useEffect(() => {
    if (!show) return;

    // 1. Immediate check
    onVerify().catch(() => {});

    // 2. Window focus check
    const handleFocus = () => {
      onVerify().catch(() => {});
    };
    window.addEventListener("focus", handleFocus);

    // 3. Periodic background poll every 2.5s while modal is active
    const pollInterval = window.setInterval(() => {
      onVerify().catch(() => {});
    }, 2500);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(pollInterval);
    };
  }, [show, onVerify]);

  if (!show) return null;

  const isUserFollowed = Boolean(verificationStatus?.isFollowingCreator || optimisticFollowUser);
  const isOrgFollowed = Boolean(verificationStatus?.isFollowingOrg || optimisticFollowOrg);

  const rawMissingRepos = verificationStatus?.missingRepos || [];
  const activeMissingRepos = rawMissingRepos.filter(
    (r) => !optimisticStarred.has(r.fullName.toLowerCase())
  );

  const totalRepos = verificationStatus?.totalRepos || 38;
  const starredCount = totalRepos - activeMissingRepos.length;

  const isVerified = Boolean(
    verificationStatus?.isVerified || (isUserFollowed && activeMissingRepos.length === 0)
  );

  const handle1ClickAutoUnlock = async () => {
    setActionError(null);
    setIsAutoUnlocking(true);
    // Optimistic auto-check
    setOptimisticFollowUser(true);
    setOptimisticFollowOrg(true);
    setOptimisticStarred((prev) => {
      const next = new Set(prev);
      for (const r of rawMissingRepos) {
        next.add(r.fullName.toLowerCase());
      }
      return next;
    });

    try {
      if (onAutoVerify) {
        const ok = await onAutoVerify();
        if (!ok) {
          await onFollowCreator();
          if (onFollowOrg) await onFollowOrg();
          await onStarAll();
        }
      } else {
        await onFollowCreator();
        if (onFollowOrg) await onFollowOrg();
        await onStarAll();
      }
      await onVerify();
    } catch (e: any) {
      setActionError(e?.message || "Could not complete auto-unlock. Please try the manual buttons below.");
    } finally {
      setIsAutoUnlocking(false);
    }
  };

  const handle1ClickFollowUser = async () => {
    setActionError(null);
    setIsFollowingCreator(true);
    setOptimisticFollowUser(true);
    try {
      const ok = await onFollowCreator();
      if (!ok) {
        window.open("https://github.com/AhmadHassan-BTed", "_blank");
      }
      await onVerify().catch(() => {});
    } catch {
      window.open("https://github.com/AhmadHassan-BTed", "_blank");
    } finally {
      setIsFollowingCreator(false);
    }
  };

  const handle1ClickFollowOrg = async () => {
    setActionError(null);
    setIsFollowingOrg(true);
    setOptimisticFollowOrg(true);
    try {
      if (onFollowOrg) {
        const ok = await onFollowOrg();
        if (!ok) {
          window.open("https://github.com/Fractal-Compute-Orchestrations", "_blank");
        }
      } else {
        window.open("https://github.com/Fractal-Compute-Orchestrations", "_blank");
      }
      await onVerify().catch(() => {});
    } catch {
      window.open("https://github.com/Fractal-Compute-Orchestrations", "_blank");
    } finally {
      setIsFollowingOrg(false);
    }
  };

  const handle1ClickStar = async (repo: RepoItem) => {
    setActionError(null);
    setStarringRepoName(repo.fullName);
    setOptimisticStarred((prev) => new Set(prev).add(repo.fullName.toLowerCase()));
    try {
      const ok = await onStarRepo(repo.fullName);
      if (!ok) {
        window.open(repo.url, "_blank");
      }
      await onVerify().catch(() => {});
    } catch {
      window.open(repo.url, "_blank");
    } finally {
      setStarringRepoName(null);
    }
  };

  const handle1ClickStarAll = async () => {
    setActionError(null);
    setIsStarringAll(true);
    setOptimisticStarred((prev) => {
      const next = new Set(prev);
      for (const r of rawMissingRepos) {
        next.add(r.fullName.toLowerCase());
      }
      return next;
    });

    try {
      await onStarAll();
      await onVerify().catch(() => {});
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
          maxWidth: "540px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
          padding: "24px",
          color: "#f8fafc",
          fontFamily: "inherit"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Unlock size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc" }}>
                Support Creator &amp; Unlock Cloud
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                Follow creator &amp; star repos to enable real-time collaboration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShow(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Transparent Upfront Consent & Auto-Unlock Card */}
        {hasGithubToken && !isVerified && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(99, 102, 241, 0.12))",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "18px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", color: "#38bdf8", fontWeight: 600, fontSize: "0.88rem" }}>
              <Info size={16} />
              <span>Transparent 1-Click Consent</span>
            </div>
            <p style={{ margin: "0 0 10px 0", fontSize: "0.82rem", color: "#cbd5e1", lineHeight: 1.45 }}>
              Real-time cloud sync and collaborative rooms are 100% free and open source. By clicking below, you grant consent for Jantt to automatically follow the creator and star the project repositories in the background using your active GitHub session.
            </p>
            <button
              type="button"
              onClick={handle1ClickAutoUnlock}
              disabled={isAutoUnlocking || isVerifying}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #0284c7, #6366f1)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "0.86rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)"
              }}
            >
              {isAutoUnlocking ? (
                <RefreshCw size={16} className="spin-sync-icon" />
              ) : (
                <Sparkles size={16} />
              )}
              <span>{isAutoUnlocking ? "Auto-Unlocking (Retrying in Background)..." : "1-Click Auto-Unlock (Consent Given)"}</span>
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
                ? "100% Complete (Unlocked!)"
                : `${isUserFollowed ? "Creator Followed" : "Follow Pending"} • ${starredCount}/${totalRepos} Repos`}
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
                  : `${Math.round((((isUserFollowed ? 1 : 0) + starredCount) / (1 + totalRepos)) * 100)}%`,
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
              {isUserFollowed ? (
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
                  {isUserFollowed ? "You are following the creator" : "Click to follow with 1-click"}
                </div>
              </div>
            </div>

            {isUserFollowed ? (
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
                onClick={handle1ClickFollowUser}
                disabled={isFollowingCreator || isVerifying}
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
                {isFollowingCreator ? (
                  <RefreshCw size={12} className="spin-sync-icon" />
                ) : (
                  <Heart size={12} />
                )}
                <span>Follow</span>
              </button>
            )}
          </div>

          {/* Step 2: Follow Organization Fractal-Compute-Orchestrations */}
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
              {isOrgFollowed ? (
                <CheckCircle2 size={18} color="#22c55e" style={{ flexShrink: 0 }} />
              ) : (
                <Building2 size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc" }}>
                  Follow Organization:{" "}
                  <a
                    href="https://github.com/Fractal-Compute-Orchestrations"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#38bdf8", textDecoration: "none" }}
                  >
                    @Fractal-Compute-Orchestrations
                  </a>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  {isOrgFollowed ? "Organization followed" : "Click to follow organization"}
                </div>
              </div>
            </div>

            {isOrgFollowed ? (
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
                Followed
              </span>
            ) : (
              <button
                type="button"
                onClick={handle1ClickFollowOrg}
                disabled={isFollowingOrg || isVerifying}
                style={{
                  background: "rgba(56, 189, 248, 0.2)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
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
                {isFollowingOrg ? (
                  <RefreshCw size={12} className="spin-sync-icon" />
                ) : (
                  <Building2 size={12} />
                )}
                <span>Follow Org</span>
              </button>
            )}
          </div>

          {/* Step 3: Star Repositories */}
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
                <Star size={16} color={activeMissingRepos.length === 0 ? "#22c55e" : "#f59e0b"} />
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc" }}>
                  Repositories ({starredCount}/{totalRepos} Starred)
                </span>
              </div>

              {activeMissingRepos.length > 0 && hasGithubToken && (
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
                  <span>Star All Remaining ({activeMissingRepos.length})</span>
                </button>
              )}
            </div>

            {/* List of Repositories */}
            {activeMissingRepos.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px",
                  background: "rgba(34, 197, 94, 0.15)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: "6px",
                  color: "#22c55e",
                  fontSize: "0.82rem",
                  fontWeight: 600
                }}
              >
                <CheckCircle2 size={16} />
                <span>All repositories are starred! Verification complete.</span>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  maxHeight: "220px",
                  overflowY: "auto",
                  paddingRight: "4px"
                }}
              >
                {activeMissingRepos.map((repo) => (
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
                        gap: "5px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "320px"
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
                        gap: "4px",
                        flexShrink: 0
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
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <button
            type="button"
            onClick={() => onVerify().catch(() => {})}
            disabled={isVerifying}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              border: "1px solid #334155",
              borderRadius: "8px",
              padding: "8px 14px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <RefreshCw size={13} className={isVerifying ? "spin-sync-icon" : ""} />
            <span>{isVerifying ? "Checking..." : "Recheck Status"}</span>
          </button>

          {isVerified ? (
            <button
              type="button"
              onClick={() => setShow(false)}
              style={{
                background: "#22c55e",
                color: "#0f172a",
                border: "none",
                borderRadius: "8px",
                padding: "8px 18px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Continue to Cloud Room
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShow(false)}
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "none",
                padding: "8px 12px",
                fontSize: "0.82rem",
                cursor: "pointer"
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
