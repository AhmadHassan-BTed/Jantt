import React, { useState, useEffect } from "react";
import { UserCheck, Check, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { checkUsernameAvailable, normalizeUsername } from "../../firebase";
import type { User as FirebaseUser } from "firebase/auth";

interface UsernameOnboardingModalProps {
  show: boolean;
  currentUser: FirebaseUser | null;
  onClaimUsername: (username: string) => Promise<any>;
}

export const UsernameOnboardingModal: React.FC<UsernameOnboardingModalProps> = ({
  show,
  currentUser,
  onClaimUsername
}) => {
  const [usernameInput, setUsernameInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suggest initial username based on email or display name
  useEffect(() => {
    if (show && currentUser) {
      const emailPrefix = currentUser.email?.split("@")[0] || "";
      const suggested = normalizeUsername(currentUser.displayName || emailPrefix);
      if (suggested) {
        setUsernameInput(suggested);
      }
    }
  }, [show, currentUser]);

  // Debounced check for username availability
  useEffect(() => {
    if (!usernameInput.trim()) {
      setIsAvailable(null);
      setErrorMessage(null);
      setIsChecking(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const res = await checkUsernameAvailable(usernameInput);
        setIsAvailable(res.available);
        setErrorMessage(res.error || null);
      } catch (err: any) {
        setIsAvailable(false);
        setErrorMessage(err.message || "Failed to check availability");
      } finally {
        setIsChecking(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [usernameInput]);

  if (!show || !currentUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAvailable || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onClaimUsername(usernameInput);
    } catch (err: any) {
      setErrorMessage(err.message || "Could not claim username. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="prompt-modal-backdrop" style={{ zIndex: 9999 }}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "480px", width: "92%", textAlign: "center", padding: "28px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
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

        <h3 style={{ margin: "0 0 6px 0", fontSize: "1.3rem", fontWeight: 700, color: "var(--jantt-text)" }}>
          Choose Your Unique Username
        </h3>
        <p style={{ margin: "0 0 20px 0", fontSize: "0.86rem", color: "var(--jantt-muted)", lineHeight: 1.4 }}>
          Welcome to Jantt Cloud! Teammates will use your handle to invite you to collaboration rooms and share project plans.
        </p>

        {currentUser.photoURL && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "16px" }}>
            <img
              src={currentUser.photoURL}
              alt="Avatar"
              style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid var(--jantt-accent)" }}
            />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--jantt-text)" }}>
              {currentUser.displayName || currentUser.email}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ position: "relative", marginBottom: "10px", textAlign: "left" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--jantt-muted)",
                marginBottom: "6px"
              }}
            >
              Username Handle
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span
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
                type="text"
                autoFocus
                required
                placeholder="username"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                style={{
                  width: "100%",
                  padding: "10px 38px 10px 30px",
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.7)",
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
              <div style={{ position: "absolute", right: "12px" }}>
                {isChecking && <Loader2 size={18} className="spin" style={{ color: "var(--jantt-muted)" }} />}
                {!isChecking && isAvailable === true && <Check size={18} style={{ color: "#10B981" }} />}
                {!isChecking && isAvailable === false && <AlertCircle size={18} style={{ color: "#EF4444" }} />}
              </div>
            </div>
          </div>

          {/* Validation Status message */}
          <div style={{ minHeight: "22px", marginBottom: "16px", textAlign: "left", fontSize: "0.8rem" }}>
            {isChecking && <span style={{ color: "var(--jantt-muted)" }}>Checking availability...</span>}
            {!isChecking && isAvailable === true && (
              <span style={{ color: "#34D399", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                <Check size={14} /> @{normalizeUsername(usernameInput)} is available!
              </span>
            )}
            {!isChecking && isAvailable === false && errorMessage && (
              <span style={{ color: "#F87171", display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertCircle size={14} /> {errorMessage}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isAvailable || isChecking || isSubmitting}
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
                <Loader2 size={16} className="spin" /> Claiming Handle...
              </>
            ) : (
              <>
                <UserCheck size={16} /> Claim @{normalizeUsername(usernameInput) || "handle"} & Start
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
