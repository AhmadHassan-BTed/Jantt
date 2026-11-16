import React, { useState, useEffect, useRef, useId } from "react";
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
import { ALL_TARGET_REPOS, type VerificationStatus, type RepoItem } from "../../firebase";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** GitHub allows 60 unauthenticated / 5,000 token requests per hour; one check costs a few. */
const POLL_INTERVAL_MS = 45000;
const RECHECK_DELAY_MS = 1500;
const POPUP_BLOCKED_NOTICE = "Your browser blocked the new tab. Use the GitHub links in this list instead.";

/** Checks report failures through `verificationStatus.error`; a rejection is unexpected. */
function warnVerifyFailure(err: unknown): void {
  console.warn("[GitHubVerificationModal] GitHub check failed:", err);
}

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
  /** Resumes the action that required verification (e.g. creating a room). */
  onContinue?: () => void;
  /** @deprecated Unused; verification runs through `onVerify`. */
  onAutoVerify?: () => Promise<boolean>;
  /** GitHub login being verified, shown for context. */
  githubUsername?: string;
  /** @deprecated Unused. */
  hasGithubToken?: boolean;
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
  onContinue,
  githubUsername
}) => {
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [justOpenedRepo, setJustOpenedRepo] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const titleId = useId();
  const descriptionId = useId();
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const setShowRef = useRef(setShow);
  setShowRef.current = setShow;

  // Check on open, when the user comes back to this tab from GitHub, and on a slow poll while
  // the tab is visible. Pending re-checks are cancelled when the modal closes.
  useEffect(() => {
    if (!show) return;
    const verify = () => {
      if (document.visibilityState === "visible") onVerifyRef.current().catch(warnVerifyFailure);
    };
    verify();

    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", verify);
    const pollInterval = window.setInterval(verify, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", verify);
      document.removeEventListener("visibilitychange", verify);
      window.clearInterval(pollInterval);
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [show]);

  // Dialog behaviour: initial focus, Escape to close, focus trap, focus restored on close.
  useEffect(() => {
    if (!show) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setShowRef.current(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === card || !card.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !card.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [show]);

  if (!show) return null;

  const isUserFollowed = Boolean(verificationStatus?.isFollowingCreator);
  const isOrgFollowed = Boolean(verificationStatus?.isFollowingOrg);
  const verificationError = verificationStatus?.error || null;

  const missingRepos = verificationError ? [] : verificationStatus?.missingRepos || [];
  const totalRepos = verificationStatus?.totalRepos || ALL_TARGET_REPOS.length;
  const starredCount = Math.max(0, totalRepos - (verificationStatus?.missingRepos?.length ?? totalRepos));

  const isVerified = verificationStatus?.isVerified === true;

  const close = () => setShow(false);

  const scheduleRecheck = (then?: () => void) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      then?.();
      onVerifyRef.current().catch(warnVerifyFailure);
    }, RECHECK_DELAY_MS);
    timersRef.current.push(id);
  };

  const handleManualFollowCreator = async () => {
    const opened = await onFollowCreator();
    setActionNotice(
      opened ? "Opened @AhmadHassan-BTed on GitHub. Click Follow there, then come back here." : POPUP_BLOCKED_NOTICE
    );
    if (opened) scheduleRecheck();
  };

  const handleManualFollowOrg = async () => {
    const opened = onFollowOrg
      ? await onFollowOrg()
      : window.open("https://github.com/Fractal-Compute-Orchestrations", "_blank", "noopener,noreferrer") !== null;
    setActionNotice(
      opened
        ? "Opened Fractal-Compute-Orchestrations on GitHub. Click Follow there, then come back here."
        : POPUP_BLOCKED_NOTICE
    );
    if (opened) scheduleRecheck();
  };

  const handleManualStarRepo = async (repo: RepoItem) => {
    const opened = await onStarRepo(repo.fullName);
    if (!opened) {
      setActionNotice(POPUP_BLOCKED_NOTICE);
      return;
    }
    setJustOpenedRepo(repo.fullName);
    setActionNotice(`Opened ${repo.name || repo.fullName} on GitHub. Click Star there, then come back here.`);
    scheduleRecheck(() => setJustOpenedRepo(null));
  };

  const handleOpenNextMissingRepo = async () => {
    const next = missingRepos[0];
    if (!next) return;
    const { success } = await onStarAll();
    if (!success) {
      setActionNotice(POPUP_BLOCKED_NOTICE);
      return;
    }
    const remaining = missingRepos.length - 1;
    setActionNotice(
      `Opened ${next.name || next.fullName} on GitHub. Star it, then come back${
        remaining > 0 ? ` and open the next one (${remaining} left)` : ""
      }.`
    );
    scheduleRecheck();
  };

  const handleContinue = () => {
    close();
    onContinue?.();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(8px)",
        padding: "16px"
      }}
    >
      <div
        ref={cardRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
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
              {isVerified ? <ShieldCheck size={24} aria-hidden="true" /> : <Unlock size={22} aria-hidden="true" />}
            </div>
            <div>
              <h2 id={titleId} style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc" }}>
                {isVerified ? "Cloud Collaboration Unlocked" : "Support Creator & Unlock Cloud"}
              </h2>
              <p id={descriptionId} style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                {githubUsername
                  ? `Checking GitHub account @${githubUsername}`
                  : "Star repositories & follow creator directly on GitHub"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            title="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px"
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {verificationError && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "10px 12px",
              marginBottom: "16px",
              borderRadius: "8px",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              color: "#fbbf24",
              fontSize: "0.8rem"
            }}
          >
            <Info size={15} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
            <span>Couldn&apos;t check your GitHub status: {verificationError}</span>
          </div>
        )}

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
            role="status"
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
              aria-label="Dismiss notice"
              style={{
                background: "transparent",
                border: "none",
                color: "#38bdf8",
                cursor: "pointer",
                padding: "2px"
              }}
            >
              <X size={14} aria-hidden="true" />
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
                  onClick={handleOpenNextMissingRepo}
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
                  title="Opens the next unstarred repository on GitHub (browsers allow one new tab per click)"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                  <span>Open next unstarred ({missingRepos.length} left) ↗</span>
                </button>
              )}
            </div>

            {/* List of Repositories */}
            {verificationError ? (
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", padding: "6px 2px" }}>
                Repository status is unavailable until the check succeeds. Use &quot;Recheck Status&quot; in a moment.
              </div>
            ) : missingRepos.length === 0 ? (
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
            onClick={() => onVerify().catch(warnVerifyFailure)}
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
              onClick={handleContinue}
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
              {onContinue ? "Continue" : "Done"}
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "none",
                padding: "8px 12px",
                fontSize: "0.82rem",
                cursor: "pointer"
              }}
            >
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
