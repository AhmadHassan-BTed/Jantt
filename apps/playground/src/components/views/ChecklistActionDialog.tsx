import React, { useState } from "react";
import { addDays, isValidISODate, resolveSchedule, type JanttData, type Task } from "@jantt/core";
import type { EffectivePerson } from "../../types";
import { isAutoCascadeEnabled } from "../../utils";
import { triggerHaptic } from "../../services/platform";
import { Modal, ModalHeader } from "../modals/ModalHost";
import { TASK_STATUS_OPTIONS, applyTaskStatus, getStatusValue } from "./KanbanView";

export const checklistActions = {
  status: "Set status",
  category: "Change category",
  shift: "Shift dates",
  assignee: "Assign member",
  delete: "Delete"
} as const;

export type ChecklistAction = keyof typeof checklistActions | "dates";
export interface TaskSelection {
  action: ChecklistAction;
  ids: Set<string>;
}

interface Props {
  selection: TaskSelection;
  plan: JanttData;
  people: EffectivePerson[];
  onCommit: (plan: JanttData) => void;
  onDelete: (ids: Set<string>) => void;
  onClose: () => void;
}

export function ChecklistActionDialog({ selection, plan, people, onCommit, onDelete, onClose }: Props) {
  const { action, ids } = selection;
  const tasks = plan.tasks.filter(task => !task._deleted && ids.has(task.id));
  const first = tasks[0];
  const single = tasks.length === 1;
  const title = action === "dates" ? "Edit dates" : checklistActions[action];
  const categories = [...new Set([...Object.keys(plan.categories || {}), ...plan.tasks.map(task => task.category).filter(Boolean)])];
  const [original] = useState(first);
  const [value, setValue] = useState(() => {
    if (action === "shift") return "1";
    if (action === "category") return first?.category || categories[0] || "";
    if (action === "status") return first ? getStatusValue(first) : "not-started";
    if (action === "assignee" && single) return people.find(person => person.id === first.assignee || person.name === first.assignee)?.id || first.assignee || "";
    return "";
  });
  const [start, setStart] = useState(first?.start || "");
  const [end, setEnd] = useState(first?.end || "");
  const [error, setError] = useState("");
  const affectsDates = action === "shift" || action === "dates";
  const locked = affectsDates && tasks.some(task => task.locked);
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    if (!first || locked) return;
    if (action === "delete") { onDelete(ids); onClose(); return; }
    let next: Task[];
    if (action === "status") next = applyTaskStatus(plan.tasks, ids, value);
    else {
      let invalid = false;
      next = plan.tasks.map(task => {
        if (task._deleted || !ids.has(task.id)) return task;
        if (action === "category") return { ...task, category: value };
        if (action === "assignee") return { ...task, assignee: value || undefined };
        const from = action === "shift" ? addDays(task.start, Number(value)) : start === original?.start ? task.start : start;
        const to = task.milestone ? from : action === "shift" ? addDays(task.end, Number(value)) : end === original?.end ? task.end : end;
        if (!isValidISODate(from) || !isValidISODate(to) || from > to) invalid = true;
        return { ...task, start: from, end: to };
      });
      if (invalid) { setError("Choose a valid date range with the finish on or after the start."); return; }
      if ((affectsDates || action === "assignee") && isAutoCascadeEnabled()) {
        next = resolveSchedule(next, { defaultGapDays: plan.meta?.defaultGapDays, calendar: plan.meta?.calendar,
          useWorkingDays: plan.meta?.useWorkingDays, people: plan.people, calendars: plan.calendars });
      }
    }
    triggerHaptic(action === "status" && value === "completed" && tasks.some(task => task.milestone) ? "success" : "light");
    onCommit({ ...plan, tasks: next });
    onClose();
  };

  return <Modal maxWidth={400} onClose={onClose}>
    <ModalHeader title={title} subtitle={single ? first.label || first.name || first.id : `${tasks.length} selected tasks`} />
    <form className="task-action-form" onSubmit={apply}>
      {action === "status" && <label>Status<select value={value} onChange={event => setValue(event.target.value)}>
        {!TASK_STATUS_OPTIONS.some(option => option.id === value) && <option>{value}</option>}
        {TASK_STATUS_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select></label>}
      {action === "category" && <label>Category<select required value={value} onChange={event => setValue(event.target.value)}>
        {categories.map(id => <option key={id} value={id}>{plan.categories?.[id]?.label || id}</option>)}
      </select></label>}
      {action === "assignee" && <label>Member<select value={value} onChange={event => setValue(event.target.value)}>
        <option value="">Unassigned</option>
        {value && !people.some(person => person.id === value) && <option value={value}>{value}</option>}
        {people.map(person => <option key={person.id} value={person.id}>{person.name || person.id}</option>)}
      </select></label>}
      {action === "shift" && <label>Calendar days<input type="number" step="1" required value={value} onChange={event => setValue(event.target.value)} />
        <small>Use a negative number to move tasks earlier.</small></label>}
      {action === "dates" && <>
        <label>{first?.milestone ? "Milestone date" : "Start date"}<input type="date" required value={start} onChange={event => setStart(event.target.value)} /></label>
        {!first?.milestone && <label>Finish date<input type="date" required min={start} value={end} onChange={event => setEnd(event.target.value)} /></label>}
      </>}
      {action === "delete" && <p>Delete {tasks.length} selected {single ? "task" : "tasks"} and remove dependency links to {single ? "it" : "them"}?</p>}
      {locked && <p role="status">Unlock selected tasks before changing their dates.</p>}
      {error && <p role="alert">{error}</p>}
      <button className="btn-nav is-primary" type="submit" disabled={!tasks.length || locked || (action === "shift" && (!Number.isSafeInteger(Number(value)) || Number(value) === 0))}>
        {action === "delete" ? "Delete selected tasks" : "Apply changes"}
      </button>
    </form>
  </Modal>;
}

