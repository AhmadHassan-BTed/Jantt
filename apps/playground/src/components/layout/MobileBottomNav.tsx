import React from "react";
import { Layers, Kanban, CheckSquare, Activity, StickyNote } from "lucide-react";
import type { ActiveView } from "../../types";
import { triggerHaptic } from "../../services/platform";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n";

interface MobileBottomNavProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  notesCount?: number;
}

/** Five primary mobile destinations; Canvas stays one tap away in the Tools & Settings sheet. */
const PRIMARY_TABS: Array<{
  id: ActiveView;
  labelKey: MessageKey;
  ariaKey: MessageKey;
  icon: React.ReactNode;
}> = [
  { id: "gantt", labelKey: "view.timeline", ariaKey: "view.timeline", icon: <Layers size={20} /> },
  { id: "kanban", labelKey: "view.board", ariaKey: "view.board", icon: <Kanban size={20} /> },
  { id: "tasks", labelKey: "view.tasks", ariaKey: "view.tasks", icon: <CheckSquare size={20} /> },
  { id: "summary", labelKey: "view.health", ariaKey: "view.projectHealthAria", icon: <Activity size={20} /> },
  { id: "notes", labelKey: "view.notes", ariaKey: "view.notes", icon: <StickyNote size={20} /> }
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  setActiveView,
  notesCount = 0
}) => {
  const { t } = useI18n();
  return (
    <nav className="mobile-bottom-nav" aria-label={t("mobile.mainNav")}>
      <div className="mobile-bottom-nav-inner">
        {PRIMARY_TABS.map((tab) => {
          // Canvas is a renderer of the timeline, so the Timeline tab stays lit and names it.
          const isCanvasOnTimeline = tab.id === "gantt" && activeView === "canvas";
          const isActive = activeView === tab.id || isCanvasOnTimeline;
          const label = isCanvasOnTimeline ? t("view.canvas") : t(tab.labelKey);
          const showNotesCount = tab.id === "notes" && notesCount > 0;
          const accessibleName = showNotesCount ? `${notesCount} ${t(tab.ariaKey)}` : t(tab.ariaKey);
          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-nav-tab-btn ${isActive ? "is-active" : ""}`}
              onClick={() => {
                triggerHaptic("light");
                setActiveView(tab.id);
              }}
              aria-current={isActive ? "page" : undefined}
              aria-label={isCanvasOnTimeline ? t("mobile.canvasOnTimeline") : accessibleName}
            >
              <div className="mobile-nav-tab-icon-wrap">
                {tab.icon}
                {showNotesCount && (
                  <span className="mobile-nav-badge" aria-hidden="true">{notesCount}</span>
                )}
              </div>
              {" "}
              <span className="mobile-nav-tab-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
