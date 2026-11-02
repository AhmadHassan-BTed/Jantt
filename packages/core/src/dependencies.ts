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
 */

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface DependencyRelation {
  id: string;
  type: DependencyType;
  lagDays: number;
}

export interface DependencyObject {
  id: string;
  type?: DependencyType;
  lag?: number;
  lagDays?: number;
}

export type DependencyItem = string | DependencyObject;

/**
 * Parses shorthand strings into normalized DependencyRelation:
 * - "t1" -> { id: "t1", type: "FS", lagDays: 0 }
 * - "t1:SS" -> { id: "t1", type: "SS", lagDays: 0 }
 * - "t1:FS+2d" -> { id: "t1", type: "FS", lagDays: 2 }
 * - "t1:FF-3d" -> { id: "t1", type: "FF", lagDays: -3 }
 * - "t1+4d" -> { id: "t1", type: "FS", lagDays: 4 }
 * - "t1-2d" -> { id: "t1", type: "FS", lagDays: -2 }
 */
export function parseDependencyRelation(item: unknown): DependencyRelation | null {
  if (!item) return null;

  if (typeof item === "string") {
    const trimmed = item.trim();
    if (!trimmed) return null;

    // Pattern 1: With explicit colon type: e.g. "task-1:SS", "task-1:FF-2d", "task-1:FS+3"
    const colonMatch = trimmed.match(/^([a-zA-Z0-9_\-\.]+):(FS|SS|FF|SF)(?:([+-]\d+)(?:d|days?)?)?$/i);
    if (colonMatch) {
      const id = colonMatch[1];
      const type = colonMatch[2].toUpperCase() as DependencyType;
      const lagDays = colonMatch[3] ? parseInt(colonMatch[3], 10) : 0;
      return { id, type, lagDays };
    }

    // Pattern 2: Shorthand with '+' or '-' and explicit 'd'/'days': e.g. "task-1+2d", "task-1-3d"
    const offsetDayMatch = trimmed.match(/^([a-zA-Z0-9_\-\.]+?)([+-]\d+)(?:d|days)$/i);
    if (offsetDayMatch) {
      const id = offsetDayMatch[1];
      const lagDays = parseInt(offsetDayMatch[2], 10);
      return { id, type: "FS", lagDays };
    }

    // Pattern 3: Shorthand with explicit '+': e.g. "task-1+4"
    const plusMatch = trimmed.match(/^([a-zA-Z0-9_\-\.]+?)\+(\d+)$/);
    if (plusMatch) {
      const id = plusMatch[1];
      const lagDays = parseInt(plusMatch[2], 10);
      return { id, type: "FS", lagDays };
    }

    // Pattern 4: Plain ID (may contain hyphens, numbers, dots): e.g. "task-1", "A"
    return { id: trimmed, type: "FS", lagDays: 0 };
  }

  if (typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!id) return null;

    let type: DependencyType = "FS";
    if (typeof obj.type === "string") {
      const upper = obj.type.toUpperCase();
      if (upper === "FS" || upper === "SS" || upper === "FF" || upper === "SF") {
        type = upper as DependencyType;
      }
    }

    const lag = typeof obj.lagDays === "number" ? obj.lagDays : (typeof obj.lag === "number" ? obj.lag : 0);

    return { id, type, lagDays: lag };
  }

  return null;
}

/**
 * Extracts and normalizes all dependency relations from a task's `dependsOn` field.
 */
export function getTaskDependencyRelations(task: { dependsOn?: unknown } | null | undefined): DependencyRelation[] {
  if (!task || task.dependsOn === undefined || task.dependsOn === null) {
    return [];
  }

  const result: DependencyRelation[] = [];
  const raw = task.dependsOn;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const parsed = parseDependencyRelation(item);
      if (parsed) result.push(parsed);
    }
  } else if (typeof raw === "string") {
    const tokens = raw.split(/[;,]/).map((s) => s.trim()).filter((s) => s.length > 0);
    for (const token of tokens) {
      const parsed = parseDependencyRelation(token);
      if (parsed) result.push(parsed);
    }
  } else if (typeof raw === "object") {
    const parsed = parseDependencyRelation(raw);
    if (parsed) result.push(parsed);
  }

  return result;
}
