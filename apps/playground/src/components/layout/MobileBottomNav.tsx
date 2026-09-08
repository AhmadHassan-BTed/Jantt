import React from "react";
import {
  Layers,
  Kanban,
  CheckSquare,
  Activity,
  StickyNote
} from "lucide-react";
import type { ActiveView } from "../../types";

interface MobileBottomNavProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  notesCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  setActiveView,
  notesCount = 0
}) => {
  const tabs: Array<{ id: ActiveView; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: "gantt",
      label: "Gantt",
      icon: <Layers size={18} />
    },
    {
      id: "kanban",
      label: "Kanban",
      icon: <Kanban size={18} />
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: <CheckSquare size={18} />
    },
    {
      id: "summary",
      label: "Health",
      icon: <Activity size={18} />
    },
    {
      id: "notes",
      label: "Notes",
      icon: <StickyNote size={18} />,
      badge: notesCount > 0 ? notesCount : undefined
    }
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Main View Navigation">
      <div className="mobile-bottom-nav-inner">
        {tabs.map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-nav-tab-btn ${isActive ? "is-active" : ""}`}
              onClick={() => setActiveView(tab.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="mobile-nav-tab-icon-wrap">
                {tab.icon}
                {tab.badge !== undefined && (
                  <span className="mobile-nav-badge">{tab.badge}</span>
                )}
              </div>
              <span className="mobile-nav-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
