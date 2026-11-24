import { useState } from "react";
import { CheckSquare, Diamond } from "lucide-react";
import { getTodayISODate } from "@jantt/core";
import { ConfirmDialog, Modal, ModalHeader } from "./ModalHost";

interface Props {
  milestone: boolean;
  onClose: () => void;
  onCreate: (draft: { title: string; start: string; milestone: boolean }) => void;
}

export function QuickCapture({ milestone, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [initialDate] = useState(getTodayISODate);
  const [start, setStart] = useState(initialDate);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const noun = milestone ? "milestone" : "task";
  const dirty = Boolean(title.trim()) || start !== initialDate;
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };
  return <><Modal onClose={requestClose} maxWidth={420} swipeToClose dismissOnBackdrop={!dirty}>
    <ModalHeader title={`New ${noun}`} icon={milestone ? <Diamond size={18} /> : <CheckSquare size={18} />} />
    <form className="quick-capture-form" onSubmit={event => {
      event.preventDefault();
      if (title.trim() && start) { onCreate({ title: title.trim(), start, milestone }); onClose(); }
    }}>
      <label>Title<input data-autofocus required value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>{milestone ? "Due date" : "Start date"}<input type="date" required value={start} onChange={event => setStart(event.target.value)} /></label>
      <button type="submit" className="btn-nav is-primary" disabled={!title.trim() || !start}>Create {noun}</button>
    </form>
  </Modal>
    {confirmDiscard && <ConfirmDialog title={`Discard this ${noun}?`} message="Your draft has unsaved changes."
      confirmLabel="Discard draft" cancelLabel="Keep editing" tone="danger"
      onCancel={() => setConfirmDiscard(false)} onConfirm={onClose} />}
  </>;
}
