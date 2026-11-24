import { useEffect, useRef } from "react";
import { CheckSquare, Diamond, Plus } from "lucide-react";
import type { ActiveView } from "../../types";
import { triggerHaptic } from "../../services/platform";

interface Props {
  activeView: ActiveView;
  expanded: boolean;
  onToggle: () => void;
  onCapture: (milestone: boolean) => void;
}

export function MobileQuickFab({ activeView, expanded, onToggle, onCapture }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const taskAction = useRef<HTMLButtonElement>(null);
  const close = () => { onToggle(); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (expanded) taskAction.current?.focus({ preventScroll: true });
  }, [expanded]);
  if (activeView === "notes" || activeView === "summary") return null;
  return <>
    {expanded && <>
      <button type="button" aria-label="Close capture menu" className="capture-scrim" tabIndex={-1} onClick={close} />
      <div className="capture-actions" role="group" aria-label="Create" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
      }}>
        <button type="button" onClick={() => onCapture(true)}><Diamond size={18} />Milestone</button>
        <button ref={taskAction} type="button" onClick={() => onCapture(false)}><CheckSquare size={18} />Task</button>
      </div>
    </>}
    <button ref={trigger} type="button" className="mobile-quick-fab" aria-label="Quick capture" aria-expanded={expanded}
      onClick={() => { triggerHaptic("light"); onToggle(); }}><Plus size={22} /></button>
  </>;
}
