import React from "react";
import { AlertTriangle, FileJson } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";

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
  const { t } = useI18n();
  return (
    <div className="empty-chart-state" role="status">
      <AlertTriangle size={36} color="#F43F5E" aria-hidden="true" />
      <h3>{t("app.cannotRenderPlan")}</h3>
      <p>
        {t("app.invalidPlanBody")}
      </p>
      <button type="button" className="btn btn-primary" onClick={onOpenEditor}>
        <FileJson size={14} aria-hidden="true" />
        <span>{t("app.openJsonEditor")}</span>
      </button>
    </div>
  );
};
