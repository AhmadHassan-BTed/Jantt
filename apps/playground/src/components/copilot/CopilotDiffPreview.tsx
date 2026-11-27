import React from "react";
import { Check, X, PlusCircle, Edit3, Trash2, RotateCcw } from "lucide-react";
import type { PlanDiff } from "../../services/ai/types";
import { useI18n } from "../../i18n/I18nProvider";

interface CopilotDiffPreviewProps {
  diff: PlanDiff;
  blockedReason?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onRevert?: () => void;
  applied?: boolean;
}

export const CopilotDiffPreview: React.FC<CopilotDiffPreviewProps> = ({
  diff,
  onAccept,
  blockedReason,
  onReject,
  onRevert,
  applied
}) => {
  const { t } = useI18n();
  return (
    <div className="copilot-diff-card">
      <div className="copilot-diff-header">
        <span className="copilot-diff-title">{t("copilot.diffSummary")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {applied === true && (
            <span className="copilot-diff-badge is-applied">
              <Check size={10} />
              <span>{t("copilot.applied")}</span>
            </span>
          )}
          {applied === true && onRevert && (
            <button type="button" className="copilot-btn-revert" onClick={onRevert} title={t("copilot.revertTitle")}>
              <RotateCcw size={11} />
              <span>{t("copilot.revert")}</span>
            </button>
          )}
          {applied === false && (
            <span className="copilot-diff-badge is-rejected">
              <X size={10} />
              <span>{t("copilot.dismissed")}</span>
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
              <span>{t("copilot.addedGroup", { count: diff.tasksAdded.length })}</span>
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
              <span>{t("copilot.modifiedGroup", { count: diff.tasksModified.length })}</span>
            </div>
            <ul className="copilot-diff-list">
              {diff.tasksModified.map((item, idx) => (
                <li key={idx} className="copilot-diff-item">
                  ~ {item.label} <span className="copilot-diff-fields">({item.changedFields.join(", ")})</span>
                  {item.dateChanges?.map(change => <div key={change} className="diff-date-change">{change}</div>)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {diff.tasksRemoved.length > 0 && (
          <div className="copilot-diff-group is-del">
            <div className="copilot-diff-group-label">
              <Trash2 size={12} />
              <span>{t("copilot.removedGroup", { count: diff.tasksRemoved.length })}</span>
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

      {applied === undefined && onAccept && blockedReason && <p role="status">{blockedReason}</p>}
      {applied === undefined && onAccept && onReject && (
        <div className="copilot-diff-actions">
          <button type="button" className="copilot-btn-accept" disabled={Boolean(blockedReason)} onClick={onAccept}>
            <Check size={13} />
            <span>{t("copilot.apply")}</span>
          </button>
          <button type="button" className="copilot-btn-reject" onClick={onReject}>
            <X size={13} />
            <span>{t("copilot.discard")}</span>
          </button>
        </div>
      )}
    </div>
  );
};
