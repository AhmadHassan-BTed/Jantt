import React from "react";
import { Plus } from "lucide-react";
import type { ActiveView } from "../../types";
import { triggerHaptic } from "../../services/platform";

interface MobileQuickFabProps {
  activeView: ActiveView;
  onAddTask: () => void;
}

/**
 * Contextual primary action above the bottom tabs. Notes keeps its own New Note control and the
 * health dashboard is read-only, so the FAB never duplicates an existing floating button.
 */
export const MobileQuickFab: React.FC<MobileQuickFabProps> = ({ activeView, onAddTask }) => {
  const addsTasks =
    activeView === "gantt" || activeView === "canvas" || activeView === "kanban" || activeView === "tasks";
  if (!addsTasks) return null;

  return (
    <button
      type="button"
      className="mobile-quick-fab"
      onClick={() => {
        triggerHaptic("light");
        onAddTask();
      }}
      aria-label="Add task"
      title="Add task"
    >
      <Plus size={20} aria-hidden="true" />
    </button>
  );
};
