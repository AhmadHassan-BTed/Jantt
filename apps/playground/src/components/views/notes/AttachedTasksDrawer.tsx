import React, { useMemo, useRef, useState } from "react";
import { Paperclip, PlusCircle, CheckSquare, X } from "lucide-react";
import { sanitizeCssColor, type Task, type Team } from "@jantt/core";
import { getTaskTitle, toText } from "./note-markdown";
import { usePopoverDismiss } from "./useNoteMentionEngine";

/** Upper bound on rendered picker rows; refine with search for larger plans. */
const MAX_PICKER_RESULTS = 50;

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
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePicker = () => {
    setShowAttachPicker(false);
    setPickerSearch("");
  };
  usePopoverDismiss(showAttachPicker, closePicker, anchorRef, triggerRef);

  const liveTasks = useMemo(() => allTasks.filter((t) => !t._deleted), [allTasks]);
  const attachedSet = useMemo(() => new Set(attachedTaskIds), [attachedTaskIds]);
  const attachedTasks = useMemo(() => liveTasks.filter((t) => attachedSet.has(t.id)), [liveTasks, attachedSet]);

  const { candidateTasks, candidateTotal } = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const matches = liveTasks.filter(
      (t) =>
        !attachedSet.has(t.id) &&
        (!q ||
          getTaskTitle(t).toLowerCase().includes(q) ||
          toText(t.id).toLowerCase().includes(q) ||
          toText(t.category).toLowerCase().includes(q))
    );
    return { candidateTasks: matches.slice(0, MAX_PICKER_RESULTS), candidateTotal: matches.length };
  }, [liveTasks, attachedSet, pickerSearch]);

  return (
    <div className="note-attached-tasks-bar">
      <div className="note-attached-header">
        <span className="note-attached-title">
          <Paperclip size={13} />
          <span>Attached Tasks ({attachedTasks.length})</span>
        </span>
        {!isViewer && (
          <div className="note-attach-picker-anchor" ref={anchorRef}>
            <button
              ref={triggerRef}
              type="button"
              className="note-attach-add-btn"
              onClick={() => (showAttachPicker ? closePicker() : setShowAttachPicker(true))}
              aria-haspopup="dialog"
              aria-expanded={showAttachPicker}
              title="Attach a roadmap task to this note"
            >
              <PlusCircle size={13} />
              <span>Attach Task</span>
            </button>

            {showAttachPicker && (
              <div className="note-attach-picker-dropdown" role="dialog" aria-label="Attach a task">
                <input
                  type="text"
                  className="note-picker-input"
                  placeholder="Search tasks to attach..."
                  aria-label="Search tasks to attach"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  autoFocus
                />
                <div className="note-picker-list">
                  {candidateTasks.length === 0 ? (
                    <div className="note-picker-empty">
                      {liveTasks.length === attachedTasks.length ? "All tasks are already attached" : "No matching tasks found"}
                    </div>
                  ) : (
                    candidateTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="note-picker-item"
                        onClick={() => {
                          onAttachTask(t.id);
                          closePicker();
                          triggerRef.current?.focus();
                        }}
                      >
                        <CheckSquare size={13} className="note-picker-icon" />
                        <div className="note-picker-text">
                          <span className="note-picker-id">{t.id}</span>
                          <span className="note-picker-name">{getTaskTitle(t)}</span>
                        </div>
                      </button>
                    ))
                  )}
                  {candidateTotal > candidateTasks.length && (
                    <div className="note-picker-empty">
                      Showing {candidateTasks.length} of {candidateTotal}. Type to narrow the list.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="note-attached-pills-list">
        {attachedTasks.length === 0 ? (
          <span className="note-attached-none">
            {isViewer ? "No tasks are attached to this note." : "No tasks attached yet. Use Attach Task to link roadmap tasks to this note."}
          </span>
        ) : (
          attachedTasks.map((task) => {
            const teamId = typeof task.team === "string" ? task.team : undefined;
            const teamObj = teamId ? teamsMap[teamId] : undefined;
            const teamColor = teamObj ? sanitizeCssColor(teamObj.color, "") : "";
            return (
              <div key={task.id} className="note-attached-task-chip">
                <CheckSquare size={12} className="note-chip-icon" />
                <span className="note-chip-id">{task.id}</span>
                <span className="note-chip-label">{getTaskTitle(task)}</span>
                {teamObj && (
                  <span
                    className="note-chip-team"
                    style={{
                      borderColor: teamColor || "var(--primary)",
                      color: "var(--jantt-text)"
                    }}
                  >
                    {toText(teamObj.name)}
                  </span>
                )}
                {!isViewer && (
                  <button
                    type="button"
                    className="note-chip-remove"
                    onClick={() => onUnlinkTask(task.id)}
                    aria-label={`Unlink task ${task.id} from this note`}
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
