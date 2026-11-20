import React, { useEffect, useRef } from "react";
import { Sparkles, AlertTriangle, AlertCircle, Bot, User } from "lucide-react";
import type { CopilotMessage, PendingPlanChange } from "../../services/ai/types";
import { CopilotDiffPreview } from "./CopilotDiffPreview";

interface CopilotMessagesProps {
  messages: CopilotMessage[];
  pendingDiff: PendingPlanChange | null;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
  onRevertDiff: (messageId: string) => void;
  onPromptClick: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
  "Add 3 tasks for the design and review phase starting next Monday",
  "Mark all tasks currently in progress as completed",
  "Shift the entire project schedule forward by 2 weeks",
  "Add a new category 'Infrastructure' and assign 2 backend tasks to it",
  "Analyze the critical path and report any scheduling bottlenecks"
];

export const CopilotMessages: React.FC<CopilotMessagesProps> = ({
  messages,
  pendingDiff,
  onAcceptDiff,
  onRejectDiff,
  onRevertDiff,
  onPromptClick
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
        <div className="copilot-example-prompts">
          <span className="copilot-prompts-label">Try asking:</span>
          {EXAMPLE_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              className="copilot-prompt-chip"
              onClick={() => onPromptClick(prompt)}
            >
              &ldquo;{prompt}&rdquo;
            </button>
          ))}
        </div>
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
                      onAccept={pendingDiff?.messageId === msg.id ? onAcceptDiff : undefined}
                      onReject={pendingDiff?.messageId === msg.id ? onRejectDiff : undefined}
                      onRevert={msg.previousPlan ? () => onRevertDiff(msg.id) : undefined}
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
