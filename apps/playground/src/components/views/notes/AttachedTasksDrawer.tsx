import React, { useState } from "react";
import { Paperclip, PlusCircle, CheckSquare, X } from "lucide-react";
import type { Task, Team } from "@jantt/core";

export interface AttachedTasksDrawerProps {
  attachedTaskIds: string[];
  allTasks: Task[];
  teamsMap: Record<string, Team>;
  onAttachTask: (taskId: string) => void;
  onUnlinkTask: (taskId: string) => void;
  isViewer?: boolean;
}

export const AttachedTasksDrawer: React.FC<AttachedTasksDrawerProps> = ({
  attachedTaskIds,
  allTasks,
  teamsMap,
  onAttachTask,
  onUnlinkTask,
  isViewer = false
}) => {
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const attachedTasks = allTasks.filter((t) => attachedTaskIds.includes(t.id));
  const candidateTasks = allTasks.filter(
    (t) =>
      !attachedTaskIds.includes(t.id) &&
      (!pickerSearch.trim() ||
        (t.label || t.name || t.id).toLowerCase().includes(pickerSearch.toLowerCase()) ||
        (t.category || "").toLowerCase().includes(pickerSearch.toLowerCase()))
  );

  return (
    <div className="note-attached-tasks-bar">
      <div className="note-attached-header">
        <span className="note-attached-title">
          <Paperclip size={13} />
          <span>Attached Tasks ({attachedTasks.length})</span>
        </span>
        {!isViewer && (
          <div className="note-attach-picker-anchor">
            <button
              type="button"
              className="note-attach-add-btn"
              onClick={() => setShowAttachPicker(!showAttachPicker)}
              title="Attach a roadmap task to this note"
            >
              <PlusCircle size={13} />
              <span>Attach Task</span>
            </button>

          {showAttachPicker && (
            <div className="note-attach-picker-dropdown">
              <input
                type="text"
                className="note-picker-input"
                placeholder="Search tasks to attach..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                autoFocus
              />
              <div className="note-picker-list">
                {candidateTasks.length === 0 ? (
                  <div className="note-picker-empty">No matching tasks found</div>
                ) : (
                  candidateTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="note-picker-item"
                      onClick={() => {
                        onAttachTask(t.id);
                        setShowAttachPicker(false);
                        setPickerSearch("");
                      }}
                    >
                      <CheckSquare size={13} className="note-picker-icon" />
                      <div className="note-picker-text">
                        <span className="note-picker-id">{t.id}</span>
                        <span className="note-picker-name">{t.label || t.name || t.id}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      <div className="note-attached-pills-list">
        {attachedTasks.length === 0 ? (
          <span className="note-attached-none">No tasks directly attached yet. Mention `/task-id` in body or attach above.</span>
        ) : (
          attachedTasks.map((task) => {
            const teamId = typeof task.team === "string" ? task.team : undefined;
            const teamObj = teamId ? teamsMap[teamId] : undefined;
            return (
              <div key={task.id} className="note-attached-task-chip">
                <CheckSquare size={12} className="note-chip-icon" />
                <span className="note-chip-id">{task.id}</span>
                <span className="note-chip-label">{task.label || task.name || task.id}</span>
                {teamObj && (
                  <span
                    className="note-chip-team"
                    style={{
                      borderColor: teamObj.color || "var(--primary)",
                      color: teamObj.color || "inherit"
                    }}
                  >
                    {teamObj.name}
                  </span>
                )}
                {!isViewer && (
                  <button
                    type="button"
                    className="note-chip-remove"
                    onClick={() => onUnlinkTask(task.id)}
                    title="Unlink task from this note"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
