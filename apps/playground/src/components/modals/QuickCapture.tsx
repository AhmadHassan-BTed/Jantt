import { useState } from "react";
import { CheckSquare, Diamond } from "lucide-react";
import { getTodayISODate } from "@jantt/core";
import { ConfirmDialog, Modal, ModalHeader } from "./ModalHost";
import { useI18n } from "../../i18n/I18nProvider";

interface Props {
  milestone: boolean;
  onClose: () => void;
  onCreate: (draft: { title: string; start: string; milestone: boolean }) => void;
}

export function QuickCapture({ milestone, onClose, onCreate }: Props) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [initialDate] = useState(getTodayISODate);
  const [start, setStart] = useState(initialDate);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = Boolean(title.trim()) || start !== initialDate;
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };
  return <><Modal onClose={requestClose} maxWidth={420} swipeToClose dismissOnBackdrop={!dirty}>
    <ModalHeader
      title={milestone ? t("quickCapture.newMilestone") : t("quickCapture.newTask")}
      icon={milestone ? <Diamond size={18} /> : <CheckSquare size={18} />}
    />
    <form className="quick-capture-form" onSubmit={event => {
      event.preventDefault();
      if (title.trim() && start) { onCreate({ title: title.trim(), start, milestone }); onClose(); }
    }}>
      <label>{t("quickCapture.title")}<input data-autofocus required value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>{milestone ? t("quickCapture.dueDate") : t("quickCapture.startDate")}<input type="date" required value={start} onChange={event => setStart(event.target.value)} /></label>
      <button type="submit" className="btn-nav is-primary" disabled={!title.trim() || !start}>
        {milestone ? t("quickCapture.createMilestone") : t("quickCapture.createTask")}
      </button>
    </form>
  </Modal>
    {confirmDiscard && <ConfirmDialog
      title={milestone ? t("quickCapture.discardMilestone") : t("quickCapture.discardTask")}
      message={t("quickCapture.discardBody")}
      confirmLabel={t("quickCapture.discardDraft")} cancelLabel={t("quickCapture.keepEditing")}
      tone="danger"
      onCancel={() => setConfirmDiscard(false)} onConfirm={onClose} />}
  </>;
}
