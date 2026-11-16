/**
 * Jantt Enterprise Dependency Engine
 *
 * Implements ANSI/PMI Standard 4-Type Dependency Relationships:
 * 1. FS (Finish-to-Start) - Successor starts after Predecessor finishes [Default]
 * 2. SS (Start-to-Start) - Successor starts after Predecessor starts
 * 3. FF (Finish-to-Finish) - Successor finishes after Predecessor finishes
 * 4. SF (Start-to-Finish) - Successor finishes after Predecessor starts
 *
 * Supports Lead & Lag (positive and negative day offsets),
 * compact string shorthand (`t1:SS+2d`, `t1:FF-1`), and structured object syntax.
 *
 * Also hosts the single dependency-graph builder (topological order, cycles, duplicate ids)
 * shared by the cascade, the CPM, the cycle guard and the validator so they cannot drift apart.
 */

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface DependencyRelation {
  id: string;
  type: DependencyType;
  /** Lag in whole days (negative = lead). 0 when the link declares no lag. */
  lagDays: number;
  /**
   * True when the link states its lag explicitly (`A:FS+0`, `{ lag: 0 }`), which then replaces the
   * task/project gap. Links without a lag use the gap for FS and 0 for SS/FF/SF.
   */
  explicitLag?: boolean;
}

export interface DependencyObject {
  id: string;
  type?: DependencyType;
  lag?: number;
  lagDays?: number;
}

export type DependencyItem = string | DependencyObject;

/** Raw `dependsOn` shapes accepted on a task. */
export type DependsOnValue = string | DependencyItem[] | DependencyObject | null;

/** Anything that can answer "does a task with this id exist?" (a Set or a Map). */
export interface TaskIdLookup {
  has(id: string): boolean;
}

/** Largest accepted lead/lag, in days (about ten years). Larger values are clamped. */
export const MAX_DEPENDENCY_LAG_DAYS = 3650;

const DEPENDENCY_TYPES: ReadonlySet<string> = new Set(["FS", "SS", "FF", "SF"]);

// "task-1:SS", "Phase 1 : FF-2d", "t1:FS+3days" (the id may contain anything up to the last ':')
const TYPED_PATTERN = /^(.+?)\s*:\s*(FS|SS|FF|SF)(?:\s*([+-]\d+)\s*(?:d|days?)?)?$/i;
// "task-1+2d", "task-1-3days" (a unit suffix is required so "task-1" stays a plain id)
const OFFSET_DAYS_PATTERN = /^([a-zA-Z0-9_\-.]+?)([+-]\d+)(?:d|days?)$/i;
// "task-1+4"
const PLUS_PATTERN = /^([a-zA-Z0-9_\-.]+?)\+(\d+)$/;

/** Result of parsing one raw dependency item, including a description of anything malformed. */
export interface DependencyInspection {
  relation: DependencyRelation | null;
  /** Human-readable problem with the raw item (it was ignored, repaired or clamped). */
  issue?: string;
}

function makeRelation(id: string, type: DependencyType, lag: number | undefined): DependencyRelation {
  return lag === undefined ? { id, type, lagDays: 0 } : { id, type, lagDays: lag, explicitLag: true };
}

/** Rounds and clamps a lag; returns undefined (lag ignored) for non-finite input. */
function sanitizeLag(raw: number): { lag?: number; issue?: string } {
  if (!Number.isFinite(raw)) {
    return { issue: `Lag '${raw}' is not a finite number of days and was ignored.` };
  }
  const rounded = Math.round(raw);
  if (Math.abs(rounded) > MAX_DEPENDENCY_LAG_DAYS) {
    return {
      lag: Math.sign(rounded) * MAX_DEPENDENCY_LAG_DAYS,
      issue: `Lag of ${raw} days exceeds the supported range of ±${MAX_DEPENDENCY_LAG_DAYS} days.`
    };
  }
  return { lag: rounded === 0 ? 0 : rounded };
}

/**
 * Parses one raw dependency item and reports what was wrong with it, if anything.
 * When `knownIds` is given, a string that exactly matches an existing task id is always treated
 * as a plain id (so ids such as "model-3d" are not misread as "model" with a -3 day lead).
 */
export function inspectDependencyItem(item: unknown, knownIds?: TaskIdLookup): DependencyInspection {
  if (item === null || item === undefined || item === "") return { relation: null };

  if (typeof item === "string") {
    const trimmed = item.trim();
    if (!trimmed) return { relation: null };
    if (knownIds?.has(trimmed)) return { relation: makeRelation(trimmed, "FS", undefined) };

    const typed = trimmed.match(TYPED_PATTERN);
    if (typed) {
      const type = typed[2].toUpperCase() as DependencyType;
      if (!typed[3]) return { relation: makeRelation(typed[1], type, undefined) };
      const { lag, issue } = sanitizeLag(parseInt(typed[3], 10));
      return { relation: makeRelation(typed[1], type, lag), issue };
    }

    const offset = trimmed.match(OFFSET_DAYS_PATTERN) || trimmed.match(PLUS_PATTERN);
    if (offset) {
      const { lag, issue } = sanitizeLag(parseInt(offset[2], 10));
      return { relation: makeRelation(offset[1], "FS", lag), issue };
    }

    if (trimmed.includes(":")) {
      return {
        relation: makeRelation(trimmed, "FS", undefined),
        issue: `Dependency '${trimmed}' does not use a recognised type; expected '<id>:FS', ':SS', ':FF' or ':SF' with an optional lag such as '+2d'.`
      };
    }
    return { relation: makeRelation(trimmed, "FS", undefined) };
  }

  if (typeof item === "object" && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!id) return { relation: null, issue: "Dependency object is missing a non-empty string 'id'." };

    const issues: string[] = [];
    let type: DependencyType = "FS";
    if (obj.type !== undefined && obj.type !== null) {
      const upper = typeof obj.type === "string" ? obj.type.trim().toUpperCase() : "";
      if (DEPENDENCY_TYPES.has(upper)) {
        type = upper as DependencyType;
      } else {
        issues.push(`Unknown dependency type '${String(obj.type)}' on link to '${id}' (expected FS, SS, FF or SF); treated as FS.`);
      }
    }

    let lag: number | undefined;
    const rawLag = obj.lagDays !== undefined && obj.lagDays !== null ? obj.lagDays : obj.lag;
    if (rawLag !== undefined && rawLag !== null) {
      if (typeof rawLag === "number") {
        const sanitized = sanitizeLag(rawLag);
        lag = sanitized.lag;
        if (sanitized.issue) issues.push(sanitized.issue);
      } else {
        issues.push(`Lag on link to '${id}' must be a number of days; '${String(rawLag)}' was ignored.`);
      }
    }
    return { relation: makeRelation(id, type, lag), issue: issues.length ? issues.join(" ") : undefined };
  }

  return {
    relation: null,
    issue: `Dependency entries must be task id strings or { id, type, lag } objects; got ${typeof item} '${String(item)}'.`
  };
}

/**
 * Parses shorthand strings into normalized DependencyRelation:
 * - "t1" -> { id: "t1", type: "FS", lagDays: 0 }
 * - "t1:SS" -> { id: "t1", type: "SS", lagDays: 0 }
 * - "t1:FS+2d" -> { id: "t1", type: "FS", lagDays: 2, explicitLag: true }
 * - "t1:FF-3d" -> { id: "t1", type: "FF", lagDays: -3, explicitLag: true }
 * - "t1+4d" -> { id: "t1", type: "FS", lagDays: 4, explicitLag: true }
 * - "t1-2d" -> { id: "t1", type: "FS", lagDays: -2, explicitLag: true }
 */
export function parseDependencyRelation(item: unknown, knownIds?: TaskIdLookup): DependencyRelation | null {
  return inspectDependencyItem(item, knownIds).relation;
}

/**
 * Splits a raw `dependsOn` value into its individual items (comma/semicolon separated strings,
 * arrays, or a single object). Unsupported shapes are returned as a single item so that
 * {@link inspectDependencyItem} can report them.
 */
export function getDependsOnItems(raw: unknown): unknown[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    return raw.split(/[;,]/).map((s) => s.trim()).filter((s) => s.length > 0);
  }
  return [raw];
}

/**
 * Extracts and normalizes all dependency relations from a task's `dependsOn` field.
 * Pass `knownIds` (the plan's task ids) to resolve ids that look like lag shorthand.
 */
export function getTaskDependencyRelations(
  task: { dependsOn?: unknown } | null | undefined,
  knownIds?: TaskIdLookup
): DependencyRelation[] {
  if (!task) return [];
  const result: DependencyRelation[] = [];
  for (const item of getDependsOnItems(task.dependsOn)) {
    const parsed = parseDependencyRelation(item, knownIds);
    if (parsed) result.push(parsed);
  }
  return result;
}

/**
 * Effective lag of a link: an explicit lag wins; otherwise FS links use the task/project gap and
 * SS/FF/SF links default to 0 (so "A:SS" really starts together with A).
 */
export function resolveRelationLag(rel: DependencyRelation, gapDays: number): number {
  if (rel.explicitLag || rel.lagDays !== 0) return rel.lagDays;
  return rel.type === "FS" ? gapDays : 0;
}

/** True for SS/SF links, which are measured from the predecessor's start instead of its finish. */
export function isStartAnchoredRelation(type: DependencyType): boolean {
  return type === "SS" || type === "SF";
}

/** True for FF/SF links, which constrain the successor's finish instead of its start. */
export function isFinishConstrainedRelation(type: DependencyType): boolean {
  return type === "FF" || type === "SF";
}

/**
 * Earliest successor start allowed by one link, in plain calendar days (epoch-day numbers).
 * Shared by the cascade, the CPM forward pass and the validator so all three agree.
 */
export function relationEarliestStartDay(
  type: DependencyType,
  predStartDay: number,
  predFinishDay: number,
  successorDurationDays: number,
  lagDays: number
): number {
  const anchor = isStartAnchoredRelation(type) ? predStartDay : predFinishDay;
  return anchor + lagDays - (isFinishConstrainedRelation(type) ? successorDurationDays : 0);
}

/**
 * Returns `dependsOn` with only the links accepted by `keep`, preserving every kept item exactly
 * as written (types, lags, object form). Returns the original value when nothing was removed,
 * null when no link remains, the single item when one remains, and otherwise an array (or a
 * comma-separated string when the input was a string). Unparseable items are dropped.
 */
export function filterDependsOn(
  dependsOn: unknown,
  keep: (rel: DependencyRelation) => boolean,
  knownIds?: TaskIdLookup
): DependsOnValue | undefined {
  if (dependsOn === undefined || dependsOn === null) return dependsOn as null | undefined;
  const items = getDependsOnItems(dependsOn);
  const kept = items.filter((item) => {
    const rel = parseDependencyRelation(item, knownIds);
    return rel !== null && keep(rel);
  });
  if (kept.length === items.length) return dependsOn as DependsOnValue;
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0] as DependencyItem;
  if (typeof dependsOn === "string") return (kept as string[]).join(", ");
  return kept as DependencyItem[];
}

/**
 * Returns `dependsOn` with one more link appended, keeping all existing items (and their
 * types/lags) untouched.
 */
export function appendDependency(dependsOn: unknown, item: DependencyItem): DependsOnValue {
  const items = getDependsOnItems(dependsOn) as DependencyItem[];
  return items.length === 0 ? item : [...items, item];
}

/** Dependency graph of the live (non-deleted) tasks of a plan. */
export interface DependencyGraph<T extends { id: string }> {
  /** Live tasks by id, in input order. When an id is duplicated, the first occurrence wins. */
  nodes: Map<string, T>;
  /** Valid incoming links per task id: existing, non-self predecessors in declaration order. */
  predecessors: Map<string, DependencyRelation[]>;
  /** Topological order of every node. Links inside a cycle are ignored so the order is total. */
  order: string[];
  /** Strongly connected components that form a cycle (2+ members, in input order). */
  cycles: string[][];
  /** Ids of tasks that list themselves in `dependsOn`. */
  selfReferences: string[];
  /** Ids used by more than one live task (only the first occurrence is part of the graph). */
  duplicateIds: string[];
  /** True when the predecessor -> successor link lies inside a cycle (it cannot be honored). */
  isCyclicEdge(predecessorId: string, successorId: string): boolean;
}

type GraphTask = { id: string; dependsOn?: unknown; _deleted?: unknown };

/**
 * Builds the dependency graph in O(V + E): parses each task's links once, detects duplicate
 * ids and self references, finds cycles with an iterative Tarjan SCC pass (no recursion, so
 * very long chains are safe) and derives a topological order from the condensation.
 */
export function buildDependencyGraph<T extends GraphTask>(tasks: readonly T[] | null | undefined): DependencyGraph<T> {
  const nodes = new Map<string, T>();
  const duplicates = new Set<string>();
  for (const t of tasks || []) {
    if (!t || typeof t !== "object" || t._deleted || typeof t.id !== "string") continue;
    if (nodes.has(t.id)) duplicates.add(t.id);
    else nodes.set(t.id, t);
  }

  const ids = Array.from(nodes.keys());
  const n = ids.length;
  const indexOf = new Map<string, number>();
  ids.forEach((id, i) => indexOf.set(id, i));

  const predecessors = new Map<string, DependencyRelation[]>();
  const successors: number[][] = ids.map(() => []);
  const selfReferences: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    const valid: DependencyRelation[] = [];
    let selfRef = false;
    for (const rel of getTaskDependencyRelations(nodes.get(id), nodes)) {
      if (rel.id === id) {
        selfRef = true;
        continue;
      }
      const p = indexOf.get(rel.id);
      if (p === undefined) continue;
      valid.push(rel);
      successors[p].push(i);
    }
    if (selfRef) selfReferences.push(id);
    predecessors.set(id, valid);
  }

  // Iterative Tarjan: components are emitted successors-first (reverse topological order).
  const UNVISITED = -1;
  const index = new Int32Array(n).fill(UNVISITED);
  const low = new Int32Array(n);
  const component = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;

  for (let root = 0; root < n; root++) {
    if (index[root] !== UNVISITED) continue;
    const frames: number[] = [root];
    const cursors: number[] = [0];
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = 1;

    while (frames.length > 0) {
      const top = frames.length - 1;
      const v = frames[top];
      const succ = successors[v];
      if (cursors[top] < succ.length) {
        const w = succ[cursors[top]++];
        if (index[w] === UNVISITED) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = 1;
          frames.push(w);
          cursors.push(0);
        } else if (onStack[w] && index[w] < low[v]) {
          low[v] = index[w];
        }
        continue;
      }
      frames.pop();
      cursors.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1];
        if (low[v] < low[parent]) low[parent] = low[v];
      }
      if (low[v] === index[v]) {
        const members: number[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          onStack[w] = 0;
          component[w] = components.length;
          members.push(w);
        } while (w !== v);
        members.sort((a, b) => a - b);
        components.push(members);
      }
    }
  }

  const order: string[] = [];
  const cycles: string[][] = [];
  for (let c = components.length - 1; c >= 0; c--) {
    const members = components[c];
    for (const m of members) order.push(ids[m]);
    if (members.length > 1) cycles.push(members.map((m) => ids[m]));
  }
  cycles.sort((a, b) => indexOf.get(a[0])! - indexOf.get(b[0])!);

  return {
    nodes,
    predecessors,
    order,
    cycles,
    selfReferences,
    duplicateIds: Array.from(duplicates),
    isCyclicEdge(predecessorId: string, successorId: string): boolean {
      const a = indexOf.get(predecessorId);
      const b = indexOf.get(successorId);
      return a !== undefined && b !== undefined && a !== b && component[a] === component[b];
    }
  };
}
