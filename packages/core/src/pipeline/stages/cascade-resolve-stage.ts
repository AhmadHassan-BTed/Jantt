import { Task, WorkingCalendar } from "../../types";
import { toEpochDay, fromEpochDay } from "../../date-math";
import { getEffectiveGap } from "../../utils";
import {
  DependencyType,
  buildDependencyGraph,
  resolveRelationLag,
  relationEarliestStartDay,
  isStartAnchoredRelation,
  isFinishConstrainedRelation
} from "../../dependencies";
import { resolveTaskCalendar, addWorkingDays, diffWorkingDays } from "../../calendar";
import { IPipelineStage, PipelineContext } from "../contracts";

/** Copies a task so the cascade never mutates caller-owned objects (incl. nested ones). */
function cloneTask(t: Task): Task {
  const copy: Task = { ...t };
  if (t.baseline) copy.baseline = { ...t.baseline };
  if (t.fields) copy.fields = { ...t.fields };
  if (Array.isArray(t.dependsOn)) copy.dependsOn = [...t.dependsOn];
  return copy;
}

/**
 * CascadeResolveStage:
 * Pushes every unlocked task to the earliest start its dependencies allow, preserving duration.
 * 1. Enterprise 4-Type Dependency Relationships (FS / SS / FF / SF) with lead & lag support.
 *    Links without an explicit lag use the task/project gap for FS and 0 for SS/FF/SF.
 * 2. Multi-Calendar & Statutory Holiday awareness: skips non-working days when a working
 *    calendar is active (context.useWorkingDays, context.calendar, or a task calendar).
 * 3. Honors locked tasks (`locked: true`), reporting when they violate their dependencies.
 *
 * Runs as one pass in topological order (O(V + E)), so it is deterministic and idempotent.
 * Links inside a dependency cycle cannot be satisfied and are ignored (with a diagnostic) instead
 * of pushing the cycle further into the future on every run. Duplicate ids: only the first
 * occurrence is scheduled; later copies are returned unchanged. Milestones have zero duration.
 * `context.autoCascade === false` returns unchanged copies (Strict mode).
 */
export class CascadeResolveStage implements IPipelineStage<Task[], Task[]> {
  public readonly name = "CascadeResolveStage";

  public process(tasks: Task[], context: PipelineContext): Task[] {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return [];
    }
    const copyAll = () => tasks.map((t) => (t && typeof t === "object" ? cloneTask(t) : t));
    if (context.autoCascade === false) {
      return copyAll();
    }

    const graph = buildDependencyGraph(tasks);
    if (graph.nodes.size === 0) {
      return copyAll();
    }
    const diagnostics = context.diagnostics;
    if (graph.duplicateIds.length > 0) {
      diagnostics?.push(
        `Duplicate task id(s) ${graph.duplicateIds.map((id) => `"${id}"`).join(", ")}: only the first occurrence is scheduled; later copies are left unchanged.`
      );
    }
    for (const cycle of graph.cycles) {
      diagnostics?.push(
        `Circular dependency between tasks ${cycle.map((id) => `"${id}"`).join(", ")}: links inside the cycle are ignored when scheduling.`
      );
    }

    const working = new Map<string, Task>();
    const startDay = new Map<string, number>();
    const finishDay = new Map<string, number>();
    graph.nodes.forEach((t, id) => {
      const copy = cloneTask(t);
      working.set(id, copy);
      const s = toEpochDay(copy.start);
      const e = toEpochDay(copy.end);
      startDay.set(id, s);
      // An inverted range (end < start) has zero duration, as in the CPM and after SanitizeStage
      finishDay.set(id, copy.milestone || e < s ? s : e);
    });

    const defaultGapDays = context.defaultGapDays;
    const globalUseWorking = context.useWorkingDays ?? Boolean(context.calendar);
    const invalidIds = new Set<string>();

    for (const id of graph.order) {
      const relations = graph.predecessors.get(id)!.filter((rel) => !graph.isCyclicEdge(rel.id, id));
      if (relations.length === 0) continue;

      const t = working.get(id)!;
      const s = startDay.get(id)!;
      const f = finishDay.get(id)!;
      if (Number.isNaN(s) || Number.isNaN(f)) {
        invalidIds.add(id);
        continue;
      }

      const gap = getEffectiveGap(t, defaultGapDays);
      const calendar: WorkingCalendar | null =
        globalUseWorking || t.calendar || t.calendarId
          ? resolveTaskCalendar(t, { people: context.people, calendars: context.calendars, defaultCalendar: context.calendar })
          : null;

      let minStart = -Infinity;
      let minStartIso = "";
      const durationDays = Math.max(f - s, 0);
      const workingDuration = calendar && !t.milestone ? Math.max(diffWorkingDays(t.start, t.end, calendar), 0) : 0;

      for (const rel of relations) {
        const ps = startDay.get(rel.id)!;
        const pf = finishDay.get(rel.id)!;
        if (Number.isNaN(ps) || Number.isNaN(pf)) {
          invalidIds.add(rel.id); // a predecessor with bad dates cannot constrain its successors
          continue;
        }
        const lag = resolveRelationLag(rel, gap);
        if (calendar) {
          const pred = working.get(rel.id)!;
          // Zero-duration predecessors (milestones, inverted ranges) finish on their start day
          const anchor = isStartAnchoredRelation(rel.type) || pf <= ps ? pred.start : pred.end;
          const iso = this.workingCandidate(rel.type, anchor, workingDuration, lag, calendar);
          const day = toEpochDay(iso);
          if (day > minStart) {
            minStart = day;
            minStartIso = iso;
          }
        } else {
          const day = relationEarliestStartDay(rel.type, ps, pf, durationDays, lag);
          if (day > minStart) minStart = day;
        }
      }

      if (!(minStart > s)) continue;
      if (t.locked) {
        diagnostics?.push(
          `Locked task "${id}" starts ${t.start} but its dependencies require ${minStartIso || fromEpochDay(minStart)} or later (DEP_TIMING_CONFLICT).`
        );
        continue;
      }

      t.start = minStartIso || fromEpochDay(minStart);
      if (t.milestone) {
        t.end = t.start;
      } else if (calendar) {
        t.end = addWorkingDays(t.start, workingDuration, calendar);
      } else {
        t.end = fromEpochDay(minStart + durationDays);
      }
      startDay.set(id, minStart);
      finishDay.set(id, t.milestone ? minStart : toEpochDay(t.end));
    }

    if (invalidIds.size > 0) {
      diagnostics?.push(
        `Task(s) ${Array.from(invalidIds, (id) => `"${id}"`).join(", ")} have invalid start/end dates and were neither rescheduled nor used as constraints.`
      );
    }

    return tasks.map((orig) => {
      if (!orig || typeof orig !== "object") return orig;
      return graph.nodes.get(orig.id) === orig ? working.get(orig.id)! : cloneTask(orig);
    });
  }

  /** Earliest successor start allowed by one link (anchored at `anchor`) under a working calendar. */
  private workingCandidate(
    type: DependencyType,
    anchor: string,
    successorWorkingDuration: number,
    lag: number,
    calendar: WorkingCalendar
  ): string {
    const shifted = addWorkingDays(anchor, lag, calendar);
    return isFinishConstrainedRelation(type)
      ? addWorkingDays(shifted, -successorWorkingDuration, calendar)
      : shifted;
  }
}
