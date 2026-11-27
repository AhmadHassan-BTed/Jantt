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
  const [startDate, setStartDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const noun = milestone ? "milestone" : "task";
  const dirty = Boolean(title.trim()) || startDate !== initialDate || Boolean(startTime);
  const combinedStart = startDate && startTime ? `${startDate}T${startTime}` : startDate;
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };
  return <><Modal onClose={requestClose} maxWidth={420} swipeToClose dismissOnBackdrop={!dirty}>
    <ModalHeader title={`New ${noun}`} icon={milestone ? <Diamond size={18} /> : <CheckSquare size={18} />} />
    <form className="quick-capture-form" onSubmit={event => {
      event.preventDefault();
      if (title.trim() && combinedStart) { onCreate({ title: title.trim(), start: combinedStart, milestone }); onClose(); }
    }}>
      <label>Title<input data-autofocus required value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>{milestone ? "Due date & time" : "Start date & time"}
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} style={{ flex: 1 }} />
          <input type="time" step="60" aria-label="Time (optional)" value={startTime} onChange={event => setStartTime(event.target.value)} style={{ width: 120 }} />
        </div>
      </label>
      <button type="submit" className="btn-nav is-primary" disabled={!title.trim() || !startDate}>Create {noun}</button>
    </form>
  </Modal>
    {confirmDiscard && <ConfirmDialog title={`Discard this ${noun}?`} message="Your draft has unsaved changes."
      confirmLabel="Discard draft" cancelLabel="Keep editing" tone="danger"
      onCancel={() => setConfirmDiscard(false)} onConfirm={onClose} />}
  </>;
}
