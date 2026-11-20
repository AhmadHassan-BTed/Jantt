import React from "react";
import { Check, X, PlusCircle, Edit3, Trash2, RotateCcw } from "lucide-react";
import type { PlanDiff } from "../../services/ai/types";

interface CopilotDiffPreviewProps {
  diff: PlanDiff;
  onAccept?: () => void;
  onReject?: () => void;
  onRevert?: () => void;
  applied?: boolean;
}

export const CopilotDiffPreview: React.FC<CopilotDiffPreviewProps> = ({
  diff,
  onAccept,
  onReject,
  onRevert,
  applied
}) => {
  return (
    <div className="copilot-diff-card">
      <div className="copilot-diff-header">
        <span className="copilot-diff-title">Plan Changes Summary</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {applied === true && (
            <span className="copilot-diff-badge is-applied">
              <Check size={10} />
              <span>Applied to Plan</span>
            </span>
          )}
          {applied === true && onRevert && (
            <button type="button" className="copilot-btn-revert" onClick={onRevert} title="Revert to previous plan state">
              <RotateCcw size={11} />
              <span>Revert</span>
            </button>
          )}
          {applied === false && (
            <span className="copilot-diff-badge is-rejected">
              <X size={10} />
              <span>Dismissed</span>
            </span>
          )}
        </div>
      </div>

      <p className="copilot-diff-summary-text">{diff.summary}</p>

      <div className="copilot-diff-details">
        {diff.tasksAdded.length > 0 && (
          <div className="copilot-diff-group is-add">
            <div className="copilot-diff-group-label">
              <PlusCircle size={12} />
              <span>Added ({diff.tasksAdded.length})</span>
            </div>
            <ul className="copilot-diff-list">
              {diff.tasksAdded.map((label, idx) => (
                <li key={idx} className="copilot-diff-item">
                  + {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {diff.tasksModified.length > 0 && (
          <div className="copilot-diff-group is-mod">
            <div className="copilot-diff-group-label">
              <Edit3 size={12} />
              <span>Modified ({diff.tasksModified.length})</span>
            </div>
            <ul className="copilot-diff-list">
              {diff.tasksModified.map((item, idx) => (
                <li key={idx} className="copilot-diff-item">
                  ~ {item.label} <span className="copilot-diff-fields">({item.changedFields.join(", ")})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {diff.tasksRemoved.length > 0 && (
          <div className="copilot-diff-group is-del">
            <div className="copilot-diff-group-label">
              <Trash2 size={12} />
              <span>Removed ({diff.tasksRemoved.length})</span>
            </div>
            <ul className="copilot-diff-list">
              {diff.tasksRemoved.map((label, idx) => (
                <li key={idx} className="copilot-diff-item">
                  - {label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {applied === undefined && onAccept && onReject && (
        <div className="copilot-diff-actions">
          <button type="button" className="copilot-btn-accept" onClick={onAccept}>
            <Check size={13} />
            <span>Apply Changes</span>
          </button>
          <button type="button" className="copilot-btn-reject" onClick={onReject}>
            <X size={13} />
            <span>Dismiss</span>
          </button>
        </div>
      )}
    </div>
  );
};
