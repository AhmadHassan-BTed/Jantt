import React from "react";
import { Layers, Kanban, CheckSquare, Activity, StickyNote } from "lucide-react";
import type { ActiveView } from "../../types";
import { triggerHaptic } from "../../services/platform";

interface MobileBottomNavProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  notesCount?: number;
}

/** Five primary mobile destinations; Canvas stays one tap away in the Tools & Settings sheet. */
const PRIMARY_TABS: Array<{
  id: ActiveView;
  label: string;
  ariaLabel: string;
  icon: React.ReactNode;
}> = [
  { id: "gantt", label: "Timeline", ariaLabel: "Timeline", icon: <Layers size={20} /> },
  { id: "kanban", label: "Board", ariaLabel: "Board", icon: <Kanban size={20} /> },
  { id: "tasks", label: "Tasks", ariaLabel: "Tasks", icon: <CheckSquare size={20} /> },
  { id: "summary", label: "Health", ariaLabel: "Project health", icon: <Activity size={20} /> },
  { id: "notes", label: "Notes", ariaLabel: "Notes", icon: <StickyNote size={20} /> }
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  setActiveView,
  notesCount = 0
}) => {
  return (
    <nav className="mobile-bottom-nav" aria-label="Main View Navigation">
      <div className="mobile-bottom-nav-inner">
        {PRIMARY_TABS.map((tab) => {
          // Canvas is a renderer of the timeline, so the Timeline tab stays lit and names it.
          const isCanvasOnTimeline = tab.id === "gantt" && activeView === "canvas";
          const isActive = activeView === tab.id || isCanvasOnTimeline;
          const label = isCanvasOnTimeline ? "Canvas" : tab.label;
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
              aria-label={isCanvasOnTimeline ? "Timeline view showing Canvas" : tab.ariaLabel}
            >
              <div className="mobile-nav-tab-icon-wrap">
                {tab.icon}
                {tab.id === "notes" && notesCount > 0 && (
                  <span className="mobile-nav-badge">{notesCount}</span>
                )}
              </div>
              <span className="mobile-nav-tab-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
