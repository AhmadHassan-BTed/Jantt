import React, { useRef, useState } from "react";
import {
  FolderPlus,
  FilePlus,
  Zap,
  Copy,
  Plus,
  HardDrive,
  Cloud,
  ShieldCheck,
  Github,
  Loader2
} from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { Modal, ModalHeader } from "./ModalHost";

/**
 * Where a new plan is created. Replacing an existing room's contents is not "adding a plan", so
 * the dialog cannot reach that overwrite path.
 */
export type PlanDestination = "local" | "new_room";
type TemplateType = "blank" | "master" | "clone";

interface AddPlanModalProps {
  showAddPlanModal: boolean;
  setShowAddPlanModal: (show: boolean) => void;
  newPlanTitle: string;
  setNewPlanTitle: (title: string) => void;
  newPlanTemplateType: TemplateType;
  setNewPlanTemplateType: (type: TemplateType) => void;
  /** Resolves `false` when the plan was not created; the dialog then stays open with a message. */
  handleCreateNewPlan: (
    title?: string,
    templateType?: TemplateType,
    destination?: PlanDestination
  ) => boolean | void | Promise<boolean | void>;
  /** Destination preselected when the dialog opens (e.g. "new_room" from a "+ Room" button). */
  initialDestination?: PlanDestination;
  isLoggedIn?: boolean;
  isGitHubVerified?: boolean;
  /** A GitHub sign-in is in progress: the sign-in button is disabled so it is not started twice. */
  isSigningIn?: boolean;
  onLogin?: () => void;
  onRequireVerification?: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  margin: "0 0 8px",
  padding: 0,
  color: "var(--jantt-text-muted)"
};

const optionCardStyle = (selected: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  padding: "10px 14px",
  borderRadius: "8px",
  border: selected ? "2px solid var(--jantt-accent)" : "1px solid var(--jantt-border)",
  background: selected
    ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.08))"
    : "var(--jantt-surface, rgba(15, 23, 42, 0.6))",
  cursor: "pointer",
  transition: "border-color 0.15s ease, background 0.15s ease"
});

const badgeStyle = (background: string, color: string): React.CSSProperties => ({
  fontSize: "10px",
  fontWeight: 700,
  padding: "2px 6px",
  borderRadius: "4px",
  background,
  color,
  whiteSpace: "nowrap"
});

const noteStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  marginTop: "6px",
  fontSize: "11px",
  color: "#F59E0B"
};

const TEMPLATE_OPTIONS: { value: TemplateType; icon: React.ReactNode }[] = [
  {
    value: "blank",
    icon: <FilePlus size={15} color="var(--jantt-accent)" />
  },
  {
    value: "master",
    icon: <Zap size={15} color="var(--jantt-accent)" />
  },
  {
    value: "clone",
    icon: <Copy size={15} color="var(--jantt-accent)" />
  }
];

export const AddPlanModal: React.FC<AddPlanModalProps> = (props) => {
  if (!props.showAddPlanModal) return null;
  // Mounted per open, so the destination and dirty tracking always start fresh.
  return <AddPlanDialog {...props} />;
};

const AddPlanDialog: React.FC<AddPlanModalProps> = ({
  setShowAddPlanModal,
  newPlanTitle,
  setNewPlanTitle,
  newPlanTemplateType,
  setNewPlanTemplateType,
  handleCreateNewPlan,
  initialDestination = "local",
  isLoggedIn = false,
  isGitHubVerified = false,
  isSigningIn = false,
  onLogin,
  onRequireVerification
}) => {
  const { t } = useI18n();
  const [destination, setDestination] = useState<PlanDestination>(initialDestination);
  const [initialValues] = useState(() => ({ title: newPlanTitle, template: newPlanTemplateType }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const title = newPlanTitle.trim();
  const needsLogin = destination === "new_room" && !isLoggedIn;
  const needsVerification = destination === "new_room" && isLoggedIn && !isGitHubVerified;
  const isDirty =
    newPlanTitle !== initialValues.title ||
    newPlanTemplateType !== initialValues.template ||
    destination !== initialDestination;
  const canSubmit = needsLogin ? !isSigningIn : needsVerification || (title.length > 0 && !isSubmitting);

  const close = () => setShowAddPlanModal(false);

  // Button and Enter key share this single path, so keyboard and mouse validation cannot diverge.
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (needsLogin) {
      if (!isSigningIn) onLogin?.();
      return;
    }
    if (needsVerification) {
      onRequireVerification?.();
      return;
    }
    if (!title || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const created = await handleCreateNewPlan(title, newPlanTemplateType, destination);
      if (created === false) {
        setSubmitError(
          destination === "new_room"
            ? t("plan.error.roomNotCreated")
            : t("plan.error.notCreated")
        );
      }
    } catch (err) {
      setSubmitError(t("plan.error.notCreatedDetail", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const submitLabel = needsLogin
    ? isSigningIn
      ? t("plan.signingInGithub")
      : t("plan.signInToCreateRoom")
    : needsVerification
    ? t("plan.verifyToCreateRoom")
    : isSubmitting
    ? destination === "new_room"
      ? t("plan.creatingRoom")
      : t("plan.creating")
    : destination === "new_room"
    ? t("plan.createCloudRoom")
    : t("plan.create");
  const submitIcon = needsLogin ? (
    isSigningIn ? <Loader2 size={14} className="spin-sync-icon" /> : <Github size={14} />
  ) : needsVerification ? (
    <ShieldCheck size={14} />
  ) : isSubmitting ? (
    <Loader2 size={14} className="spin-sync-icon" />
  ) : (
    <Plus size={14} />
  );

  return (
    <Modal onClose={close} maxWidth={560} dismissOnBackdrop={!isDirty}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}
        noValidate
      >
        <ModalHeader
          icon={<FolderPlus size={18} />}
          title={t("plan.new")}
          subtitle={t("plan.add.subtitle")}
        />

        <div className="prompt-modal-body" style={{ gap: "16px", padding: "18px 20px" }}>
          <div>
            <label htmlFor="add-plan-title" style={sectionLabelStyle}>
              {t("plan.add.nameLabel")}
            </label>
            <input
              id="add-plan-title"
              type="text"
              className="code-textarea"
              style={{
                width: "100%",
                height: "40px",
                padding: "8px 12px",
                fontSize: "13px",
                fontFamily: "var(--jantt-font-sans)",
                borderRadius: "8px",
                border: "1px solid var(--jantt-border)",
                boxSizing: "border-box"
              }}
              value={newPlanTitle}
              onChange={(e) => setNewPlanTitle(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={t("plan.add.namePlaceholder")}
              maxLength={120}
              required
              aria-invalid={title.length === 0}
              data-autofocus
            />
            {title.length === 0 && (
              <div style={{ marginTop: "6px", fontSize: "11px", color: "#F59E0B" }}>{t("plan.add.nameRequired")}</div>
            )}
          </div>

          <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={sectionLabelStyle}>{t("plan.add.keepIn")}</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={optionCardStyle(destination === "local")}>
                <input
                  type="radio"
                  name="planDestination"
                  value="local"
                  checked={destination === "local"}
                  onChange={() => setDestination("local")}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "2px" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                      <HardDrive size={15} color="var(--jantt-accent)" />
                      {t("plan.list.device")}
                    </strong>
                    <span style={badgeStyle("rgba(100, 116, 139, 0.2)", "var(--jantt-text-muted)")}>{t("plan.add.privateOffline")}</span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)", lineHeight: 1.4 }}>
                    {t("plan.add.localDesc")}
                  </span>
                </div>
              </label>

              <label style={optionCardStyle(destination === "new_room")}>
                <input
                  type="radio"
                  name="planDestination"
                  value="new_room"
                  checked={destination === "new_room"}
                  onChange={() => setDestination("new_room")}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "2px" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                      <Cloud size={15} color="#38BDF8" />
                      {t("plan.add.newCloudRoom")}
                    </strong>
                    <span style={badgeStyle("rgba(56, 189, 248, 0.2)", "var(--jantt-accent, #38BDF8)")}>{t("plan.add.liveSync")}</span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)", lineHeight: 1.4 }}>
                    {t("plan.add.cloudDesc")}
                  </span>
                  {!isLoggedIn && (
                    <div style={noteStyle}>
                      <Github size={12} />
                      <span>{t("plan.add.requiresSignIn")}</span>
                    </div>
                  )}
                  {isLoggedIn && !isGitHubVerified && (
                    <div style={noteStyle}>
                      <ShieldCheck size={12} />
                      <span>{t("plan.add.requiresVerification")}</span>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </fieldset>

          <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={sectionLabelStyle}>{t("plan.add.startFrom")}</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {TEMPLATE_OPTIONS.map((option) => (
                <label key={option.value} style={{ ...optionCardStyle(newPlanTemplateType === option.value), gap: "10px" }}>
                  <input
                    type="radio"
                    name="planTemplate"
                    value={option.value}
                    checked={newPlanTemplateType === option.value}
                    onChange={() => setNewPlanTemplateType(option.value)}
                    style={{ marginTop: "3px" }}
                  />
                  <div>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--jantt-text)" }}>
                      {option.icon}
                      {t(`plan.template.${option.value}.title`)}
                    </strong>
                    <span style={{ fontSize: "12px", color: "var(--jantt-text-muted)" }}>{t(`plan.template.${option.value}.desc`)}</span>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {submitError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                lineHeight: 1.4,
                color: "var(--jantt-text)",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.35)"
              }}
            >
              {submitError}
            </div>
          )}
        </div>

        <div className="prompt-modal-footer" style={{ flexWrap: "wrap", flexShrink: 0 }}>
          <button type="button" className="btn-nav" onClick={close}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn-nav btn-nav-primary"
            disabled={!canSubmit}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {submitIcon}
            <span>{submitLabel}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
