import React, { useEffect, useRef } from "react";
import { Sparkles, AlertTriangle, AlertCircle, Bot, User } from "lucide-react";
import type { CopilotMessage, PendingPlanChange } from "../../services/ai/types";
import { CopilotDiffPreview } from "./CopilotDiffPreview";

interface CopilotMessagesProps {
  messages: CopilotMessage[];
  pendingDiff: PendingPlanChange | null;
  readOnly: boolean;
  stale: boolean;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
  onRevertDiff: (messageId: string) => void;
}

export const CopilotMessages: React.FC<CopilotMessagesProps> = ({
  messages,
  pendingDiff,
  readOnly,
  stale,
  onAcceptDiff,
  onRejectDiff,
  onRevertDiff
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingDiff]);

  if (messages.length === 0) {
    return (
      <div className="copilot-empty-state">
        <div className="copilot-empty-icon">
          <Sparkles size={28} />
        </div>
        <h3>Chat with Jantt Copilot</h3>
        <p>
          Ask questions, modify dates, assign team members, and generate or edit tasks in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="copilot-messages-container">
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        return (
          <div key={msg.id} className={`copilot-message ${isUser ? "is-user" : "is-assistant"}`}>
            <div className="copilot-msg-avatar">
              {isUser ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div className="copilot-msg-content">
              {msg.error ? (
                <div className="copilot-error-banner">
                  <AlertCircle size={14} />
                  <span>{msg.error}</span>
                </div>
              ) : (
                <>
                  <div className="copilot-text-body">
                    {msg.content}
                    {msg.isStreaming && <span className="copilot-stream-cursor" />}
                  </div>

                  {msg.validationErrors && msg.validationErrors.length > 0 && (
                    <div className="copilot-validation-warning">
                      <div className="copilot-val-header">
                        <AlertTriangle size={13} />
                        <span>Plan Validation Errors:</span>
                      </div>
                      <ul>
                        {msg.validationErrors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.diff && (
                    <CopilotDiffPreview
                      diff={msg.diff}
                      applied={msg.applied}
                      blockedReason={readOnly ? "This room is view-only." : stale ? "The plan changed. Ask for an updated proposal." : undefined}
                      onAccept={pendingDiff?.messageId === msg.id ? onAcceptDiff : undefined}
                      onReject={pendingDiff?.messageId === msg.id ? onRejectDiff : undefined}
                      onRevert={!readOnly && msg.previousPlan ? () => onRevertDiff(msg.id) : undefined}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
};
