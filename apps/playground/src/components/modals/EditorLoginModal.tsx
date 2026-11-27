import React from "react";
import { KeyRound, LogIn, Copy, ShieldCheck, RefreshCw } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { Modal, ModalHeader } from "./ModalHost";

interface EditorLoginModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  roomTitle?: string;
  /** Starts GitHub sign-in; never rejects (failures surface through the app's auth error toast). */
  onLogin: () => void;
  onMakeLocalCopy?: () => void;
  allowFork?: boolean;
  /** A GitHub sign-in is already in progress: the button waits instead of starting another one. */
  isSigningIn?: boolean;
}

export const EditorLoginModal: React.FC<EditorLoginModalProps> = ({
  show,
  setShow,
  roomTitle,
  onLogin,
  onMakeLocalCopy,
  allowFork = true,
  isSigningIn = false
}) => {
  const { t } = useI18n();
  if (!show) return null;

  const close = () => setShow(false);

  return (
    <Modal onClose={close} maxWidth={480} ariaDescribedBy="editor-login-desc">
      <ModalHeader
        icon={<KeyRound size={18} />}
        title={t("editorlogin.title")}
        subtitle={<span style={{ overflowWrap: "anywhere" }}>{roomTitle ?? t("editorlogin.defaultTitle")}</span>}
      />

      <div className="prompt-modal-body" style={{ gap: "16px" }}>
        <div
          id="editor-login-desc"
          style={{
            background: "var(--jantt-surface-hover, rgba(30, 41, 59, 0.6))",
            border: "1px solid var(--jantt-border, #334155)",
            borderRadius: "10px",
            padding: "14px",
            fontSize: "13px",
            lineHeight: 1.5,
            color: "var(--jantt-text)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--jantt-accent)", fontWeight: 600 }}>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{t("editorlogin.badge")}</span>
          </div>
          <p style={{ margin: "0 0 8px 0" }}>
            {t("editorlogin.bodyBefore")}<strong>{t("editorlogin.bodyStrong")}</strong>
            {t("editorlogin.bodyAfter")}
          </p>
          <p style={{ margin: 0, color: "var(--jantt-text-muted)", fontSize: "12.5px" }}>
            {allowFork && onMakeLocalCopy
              ? t("editorlogin.forkHint")
              : t("editorlogin.readOnlyHint")}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            className="btn btn-primary"
            // A disabled button cannot take focus; the Modal then focuses the next control.
            data-autofocus={isSigningIn ? undefined : true}
            style={{ width: "100%", padding: "11px 16px" }}
            disabled={isSigningIn}
            aria-busy={isSigningIn}
            onClick={() => {
              if (isSigningIn) return;
              close();
              onLogin();
            }}
          >
            {isSigningIn ? (
              <RefreshCw size={16} className="spin-sync-icon" aria-hidden="true" />
            ) : (
              <LogIn size={16} aria-hidden="true" />
            )}
            <span>{isSigningIn ? t("editorlogin.signingIn") : t("editorlogin.signIn")}</span>
          </button>

          {allowFork && onMakeLocalCopy && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%" }}
              onClick={() => {
                close();
                onMakeLocalCopy();
              }}
            >
              <Copy size={15} aria-hidden="true" />
              <span>{t("editorlogin.makeCopy")}</span>
            </button>
          )}

          <button
            type="button"
            className="btn"
            style={{ width: "100%", background: "transparent", color: "var(--jantt-text-muted)", fontWeight: 500 }}
            onClick={close}
          >
            {t("editorlogin.keepViewing")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
