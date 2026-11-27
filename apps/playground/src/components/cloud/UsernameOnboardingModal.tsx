import React, { useState, useEffect, useRef, useId } from "react";
import { UserCheck, Check, AlertCircle, Loader2, Sparkles, LogOut } from "lucide-react";
import { checkUsernameAvailable, normalizeUsername, signOutUser } from "../../firebase";
import { useI18n } from "../../i18n/I18nProvider";
import type { User as FirebaseUser } from "firebase/auth";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** GitHub's login length; the validator reports anything the rules would reject. */
const MAX_INPUT_LENGTH = 39;

interface UsernameOnboardingModalProps {
  show: boolean;
  currentUser: FirebaseUser | null;
  onClaimUsername: (username: string) => Promise<any>;
  /** "Sign out" action; defaults to signing out directly (the auth listener resets the app state). */
  onSignOut?: () => Promise<void> | void;
}

/**
 * Blocking dialog shown to a signed-in account without a Jantt handle. There is no dismiss:
 * the way out without choosing a handle is "Sign out", which keeps working locally.
 */
export const UsernameOnboardingModal: React.FC<UsernameOnboardingModalProps> = ({
  show,
  currentUser,
  onClaimUsername,
  onSignOut
}) => {
  const { t } = useI18n();
  const [usernameInput, setUsernameInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestedForUidRef = useRef<string | null>(null);
  const checkIdRef = useRef(0);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const statusId = useId();

  const isOpen = show && Boolean(currentUser);

  // Suggest a handle once per account, when the dialog first opens for it (before any typing).
  // A different account never inherits the previous account's input.
  useEffect(() => {
    if (!isOpen || !currentUser || suggestedForUidRef.current === currentUser.uid) return;
    suggestedForUidRef.current = currentUser.uid;
    const emailPrefix = currentUser.email?.split("@")[0] || "";
    setUsernameInput(normalizeUsername(currentUser.displayName || emailPrefix).slice(0, MAX_INPUT_LENGTH));
  }, [isOpen, currentUser]);

  // Debounced availability check; only the latest request may update the result.
  useEffect(() => {
    const requestId = ++checkIdRef.current;
    setIsAvailable(null);
    setErrorMessage(null);
    if (!usernameInput.trim()) {
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailable(usernameInput);
        if (requestId !== checkIdRef.current) return;
        setIsAvailable(res.available);
        setErrorMessage(res.error || null);
      } catch {
        if (requestId !== checkIdRef.current) return;
        setIsAvailable(false);
        setErrorMessage(t("verify.checkFailed"));
      } finally {
        if (requestId === checkIdRef.current) setIsChecking(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [usernameInput]);

  // Dialog behaviour: initial focus, focus trap, focus restored on close.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card || e.key !== "Tab") return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !card.contains(active))) {
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
  }, [isOpen]);

  if (!isOpen || !currentUser) return null;

  const handle = normalizeUsername(usernameInput);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAvailable || isChecking || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onClaimUsername(usernameInput);
    } catch (err: any) {
      setIsAvailable(false);
      setErrorMessage(err?.message || t("verify.claimFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await (onSignOut ? onSignOut() : signOutUser());
    } catch {
      setErrorMessage(t("verify.signOutFailed"));
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="prompt-modal-backdrop">
      <div
        ref={cardRef}
        className="prompt-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{ maxWidth: "480px", width: "92%", textAlign: "center", padding: "28px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden="true"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2))",
            color: "var(--jantt-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px auto",
            border: "1px solid rgba(56, 189, 248, 0.3)"
          }}
        >
          <Sparkles size={28} />
        </div>

        <h3 id={titleId} style={{ margin: "0 0 6px 0", fontSize: "1.3rem", fontWeight: 700, color: "var(--jantt-text)" }}>
          {t("verify.chooseUsername")}
        </h3>
        <p id={descriptionId} style={{ margin: "0 0 20px 0", fontSize: "0.86rem", color: "var(--jantt-muted)", lineHeight: 1.4 }}>
          {t("verify.welcome")}
        </p>

        {currentUser.photoURL && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "16px" }}>
            <img
              src={currentUser.photoURL}
              alt=""
              style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid var(--jantt-accent)" }}
            />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--jantt-text)" }}>
              {currentUser.displayName || currentUser.email}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ position: "relative", marginBottom: "10px", textAlign: "left" }}>
            <label
              htmlFor={inputId}
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--jantt-muted)",
                marginBottom: "6px"
              }}
            >
              {t("verify.username")}
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "12px",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--jantt-muted)",
                  pointerEvents: "none"
                }}
              >
                @
              </span>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={MAX_INPUT_LENGTH}
                placeholder={t("verify.usernamePlaceholder")}
                value={usernameInput}
                aria-invalid={isAvailable === false}
                aria-describedby={statusId}
                onChange={(e) => setUsernameInput(e.target.value.replace(/\s+/g, "").replace(/^@+/, ""))}
                style={{
                  width: "100%",
                  padding: "10px 38px 10px 30px",
                  borderRadius: "8px",
                  background: "var(--jantt-surface, transparent)",
                  border: isAvailable === true
                    ? "1px solid #10B981"
                    : isAvailable === false
                    ? "1px solid #EF4444"
                    : "1px solid var(--jantt-border)",
                  color: "var(--jantt-text)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  outline: "none"
                }}
              />
              <div aria-hidden="true" style={{ position: "absolute", right: "12px" }}>
                {isChecking && <Loader2 size={18} className="spin-icon" style={{ color: "var(--jantt-muted)" }} />}
                {!isChecking && isAvailable === true && <Check size={18} style={{ color: "#10B981" }} />}
                {!isChecking && isAvailable === false && <AlertCircle size={18} style={{ color: "#EF4444" }} />}
              </div>
            </div>
          </div>

          {/* Validation status message */}
          <div
            id={statusId}
            aria-live="polite"
            style={{ minHeight: "22px", marginBottom: "16px", textAlign: "left", fontSize: "0.8rem" }}
          >
            {isChecking && <span style={{ color: "var(--jantt-muted)" }}>{t("verify.checking")}</span>}
            {!isChecking && isAvailable === true && (
              <span style={{ color: "#34D399", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                <Check size={14} aria-hidden="true" /> {t("verify.available", { handle })}
              </span>
            )}
            {!isChecking && isAvailable === false && errorMessage && (
              <span role="alert" style={{ color: "#F87171", display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertCircle size={14} aria-hidden="true" /> {errorMessage}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isAvailable || isChecking || isSubmitting || isSigningOut}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "0.95rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="spin-icon" aria-hidden="true" /> {t("verify.claiming")}
              </>
            ) : (
              <>
                <UserCheck size={16} aria-hidden="true" /> {t("verify.claim", { handle: handle || t("verify.handlePlaceholder") })}
              </>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSubmitting || isSigningOut}
          className="btn btn-secondary"
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "10px",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px"
          }}
        >
          <LogOut size={14} aria-hidden="true" /> {isSigningOut ? t("verify.signingOut") : t("verify.signOutLocally")}
        </button>
      </div>
    </div>
  );
};
