import React, { useState, useEffect } from "react";
import {
  Star,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Heart,
  Unlock,
  Info,
  Building2,
  X,
  ShieldCheck,
  Check
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
  onStarAll
}) => {
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [justOpenedRepo, setJustOpenedRepo] = useState<string | null>(null);

  // Auto-check on modal open, and automatically when the user returns to this browser tab from GitHub
  useEffect(() => {
    if (!show) return;

    // 1. Immediate status check
    onVerify().catch(() => {});

    // 2. Auto-check whenever user switches back to this tab after starring/following on GitHub
    const handleFocus = () => {
      onVerify().catch(() => {});
    };
    window.addEventListener("focus", handleFocus);

    // 3. Periodic background poll every 4s while modal is open
    const pollInterval = window.setInterval(() => {
      onVerify().catch(() => {});
    }, 4000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(pollInterval);
    };
  }, [show, onVerify]);

  if (!show) return null;

  const isUserFollowed = Boolean(verificationStatus?.isFollowingCreator);
  const isOrgFollowed = Boolean(verificationStatus?.isFollowingOrg);

  const missingRepos = verificationStatus?.missingRepos || [];
  const totalRepos = verificationStatus?.totalRepos || 38;
  const starredCount = Math.max(0, totalRepos - missingRepos.length);

  const isVerified = Boolean(
    verificationStatus?.isVerified || (isUserFollowed && missingRepos.length === 0)
  );

  const handleManualFollowCreator = async () => {
    setActionNotice("Opened @AhmadHassan-BTed profile. Click Follow on GitHub, then return here!");
    await onFollowCreator();
    // Prompt a re-check shortly after opening
    setTimeout(() => {
      onVerify().catch(() => {});
    }, 1200);
  };

  const handleManualFollowOrg = async () => {
    setActionNotice("Opened Fractal-Compute-Orchestrations page. Click Follow on GitHub, then return here!");
    if (onFollowOrg) {
      await onFollowOrg();
    } else {
      window.open("https://github.com/Fractal-Compute-Orchestrations", "_blank", "noopener,noreferrer");
    }
    setTimeout(() => {
      onVerify().catch(() => {});
    }, 1200);
  };

  const handleManualStarRepo = async (repo: RepoItem) => {
    setJustOpenedRepo(repo.fullName);
    setActionNotice(`Opened ${repo.name || repo.fullName} on GitHub. Click Star on GitHub, then return here!`);
    await onStarRepo(repo.fullName);
    setTimeout(() => {
      setJustOpenedRepo(null);
      onVerify().catch(() => {});
    }, 1500);
  };

  const handleManualOpenMissingRepos = async () => {
    if (!missingRepos.length) return;
    setActionNotice(`Opened unstarred repositories in new tabs. Click Star on each GitHub tab, then return here!`);
    await onStarAll();
    setTimeout(() => {
      onVerify().catch(() => {});
    }, 1500);
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
        backgroundColor: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(8px)",
        padding: "16px"
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "560px",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
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
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: isVerified ? "rgba(34, 197, 94, 0.15)" : "rgba(56, 189, 248, 0.15)",
                color: isVerified ? "#22c55e" : "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              {isVerified ? <ShieldCheck size={24} /> : <Unlock size={22} />}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc" }}>
                {isVerified ? "Cloud Collaboration Unlocked" : "Support Creator & Unlock Cloud"}
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                Star repositories &amp; follow creator directly on GitHub
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
              padding: "4px",
              borderRadius: "6px"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Verification Success Celebration Banner */}
        {isVerified ? (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.15))",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "18px",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px"
            }}
          >
            <CheckCircle2 size={22} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "#22c55e", marginBottom: "4px" }}>
                Verification Complete!
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#cbd5e1", lineHeight: 1.45 }}>
                Thank you for supporting Jantt and the open-source suite! Your account is verified and cloud rooms are fully enabled.
              </p>
            </div>
          </div>
        ) : (
          /* Honest Manual Flow Notice */
          <div
            style={{
              background: "linear-gradient(135deg, rgba(56, 189, 248, 0.08), rgba(99, 102, 241, 0.08))",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "18px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", color: "#38bdf8", fontWeight: 600, fontSize: "0.86rem" }}>
              <Info size={16} />
              <span>Manual GitHub Star &amp; Follow Flow</span>
            </div>
            <p style={{ margin: 0, fontSize: "0.81rem", color: "#cbd5e1", lineHeight: 1.45 }}>
              To ensure 100% compliance with GitHub&apos;s policies and protect your account, all starring and following is done <strong>manually by you on GitHub</strong>. Click the buttons below to open each page, click Star / Follow on GitHub, and return here. This page updates automatically!
            </p>
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
                ? "100% Verified (Cloud Access Granted)"
                : `${isUserFollowed ? "Creator Followed" : "Follow Pending"} • ${starredCount}/${totalRepos} Repos Starred`}
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
                  : `${Math.min(100, Math.round((((isUserFollowed ? 1 : 0) + starredCount) / (1 + totalRepos)) * 100))}%`,
                background: isVerified
                  ? "#22c55e"
                  : "linear-gradient(90deg, #38bdf8, #818cf8)",
                transition: "width 0.3s ease"
              }}
            />
          </div>
        </div>

        {/* Action Notice toast */}
        {actionNotice && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "10px 12px",
              background: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "8px",
              color: "#38bdf8",
              fontSize: "0.8rem",
              marginBottom: "16px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Info size={15} style={{ flexShrink: 0 }} />
              <span>{actionNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#38bdf8",
                cursor: "pointer",
                padding: "2px"
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Requirements Checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          {/* Step 1: Follow AhmadHassan-BTed */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(30, 41, 59, 0.6)",
              border: isUserFollowed ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid #334155",
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
                <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                  {isUserFollowed ? "You are following the creator" : "Required for cloud access"}
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
                  borderRadius: "6px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <Check size={12} />
                Following
              </span>
            ) : (
              <button
                type="button"
                onClick={handleManualFollowCreator}
                style={{
                  background: "#38bdf8",
                  color: "#0f172a",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px"
                }}
              >
                <Heart size={12} />
                <span>Follow on GitHub ↗</span>
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
              border: isOrgFollowed ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid #334155",
              borderRadius: "8px",
              padding: "10px 12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {isOrgFollowed ? (
                <CheckCircle2 size={18} color="#22c55e" style={{ flexShrink: 0 }} />
              ) : (
                <Building2 size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
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
                <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                  {isOrgFollowed ? "Organization followed" : "Recommended developer ecosystem"}
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
                  borderRadius: "6px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <Check size={12} />
                Followed
              </span>
            ) : (
              <button
                type="button"
                onClick={handleManualFollowOrg}
                style={{
                  background: "rgba(56, 189, 248, 0.2)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px"
                }}
              >
                <Building2 size={12} />
                <span>Follow Org on GitHub ↗</span>
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
                <Star size={16} color={missingRepos.length === 0 ? "#22c55e" : "#f59e0b"} />
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc" }}>
                  Repositories ({starredCount}/{totalRepos} Starred)
                </span>
              </div>

              {missingRepos.length > 0 && (
                <button
                  type="button"
                  onClick={handleManualOpenMissingRepos}
                  style={{
                    background: "linear-gradient(135deg, #0284c7, #6366f1)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "5px 10px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    boxShadow: "0 2px 8px rgba(2, 132, 199, 0.3)"
                  }}
                  title="Opens remaining repositories in browser tabs for you to star on GitHub"
                >
                  <ExternalLink size={12} />
                  <span>Open Unstarred ({missingRepos.length}) ↗</span>
                </button>
              )}
            </div>

            {/* List of Repositories */}
            {missingRepos.length === 0 ? (
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
                <span>All repositories are starred on GitHub!</span>
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
                      onClick={() => handleManualStarRepo(repo)}
                      style={{
                        background: justOpenedRepo === repo.fullName ? "rgba(34, 197, 94, 0.2)" : "rgba(245, 158, 11, 0.2)",
                        color: justOpenedRepo === repo.fullName ? "#22c55e" : "#fbbf24",
                        border: justOpenedRepo === repo.fullName ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(245, 158, 11, 0.4)",
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
                      <Star size={10} />
                      <span>{justOpenedRepo === repo.fullName ? "Opened ↗" : "Star on GitHub ↗"}</span>
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
            <span>{isVerifying ? "Verifying..." : "Recheck Status"}</span>
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
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(34, 197, 94, 0.4)"
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
