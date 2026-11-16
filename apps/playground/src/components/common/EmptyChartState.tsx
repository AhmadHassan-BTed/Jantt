import React from "react";
import { AlertTriangle, FileJson } from "lucide-react";

/**
 * Window event asking the app shell to reveal and focus the JSON editor.
 * Lets this state offer a fix even when it is rendered without an `onOpenEditor` callback.
 */
export const OPEN_JSON_EDITOR_EVENT = "jantt:open-json-editor";

export function requestOpenJsonEditor() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_JSON_EDITOR_EVENT));
  }
}

interface EmptyChartStateProps {
  onOpenEditor?: () => void;
}

export const EmptyChartState: React.FC<EmptyChartStateProps> = ({ onOpenEditor = requestOpenJsonEditor }) => {
  return (
    <div className="empty-chart-state" role="status">
      <AlertTriangle size={36} color="#F43F5E" aria-hidden="true" />
      <h3>Cannot render this plan</h3>
      <p>
        The plan JSON is invalid or does not match the Jantt schema. Open the JSON editor to see each issue
        and how to fix it.
      </p>
      <button type="button" className="btn btn-primary" onClick={onOpenEditor}>
        <FileJson size={14} aria-hidden="true" />
        <span>Open JSON editor</span>
      </button>
    </div>
  );
};
