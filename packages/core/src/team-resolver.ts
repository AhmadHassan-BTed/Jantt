import { Person, Team, Task } from "./types";
import { sanitizeCssColor } from "./utils";


export interface ResolvedAssignee {
  person?: Person;
  team?: Team;
  displayName: string;
  role?: string;
  /** Always a safe CSS color (`sanitizeCssColor` grammar), never raw plan input. */
  avatarColor: string;
  initials: string;
}

const DEFAULT_AVATAR_COLOR = "#38BDF8";

/**
 * First entry matching `predicate`. Accepts arrays (including null holes) and the object form RTDB
 * returns for arrays, without allocating for plain arrays (this runs per row and in sort comparators).
 */
function findEntity<T>(value: unknown, predicate: (item: T) => boolean): T | undefined {
  const list: unknown[] | undefined = Array.isArray(value)
    ? value
    : value && typeof value === "object"
    ? Object.values(value)
    : undefined;
  if (!list) return undefined;
  for (const item of list) {
    if (item && typeof item === "object" && predicate(item as T)) return item as T;
  }
  return undefined;
}

const normalizeHandle = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();

/** Case-insensitive name match that tolerates entries without a string name. */
function hasName(entity: { name?: unknown }, lowerName: string): boolean {
  return typeof entity.name === "string" && entity.name.trim().toLowerCase() === lowerName;
}

/**
 * Resolves a Person by id, then username (with or without '@', case-insensitive), then name
 * (case-insensitive).
 */
export function resolvePersonById(
  people: Person[] | undefined,
  idOrName: string | undefined
): Person | undefined {
  if (typeof idOrName !== "string") return undefined;
  const trimmed = idOrName.trim();
  if (!trimmed || !people) return undefined;

  const matchById = findEntity<Person>(people, (p) => p.id === trimmed);
  if (matchById) return matchById;
  const handle = normalizeHandle(trimmed);
  if (handle) {
    const matchByUsername = findEntity<Person>(
      people,
      (p) => typeof p.username === "string" && normalizeHandle(p.username) === handle
    );
    if (matchByUsername) return matchByUsername;
  }
  const lowerName = trimmed.toLowerCase();
  return findEntity<Person>(people, (p) => hasName(p, lowerName));
}

/**
 * Resolves a Team by its unique ID or name fallback.
 */
export function resolveTeamById(
  teams: Team[] | undefined,
  idOrName: string | undefined
): Team | undefined {
  if (typeof idOrName !== "string") return undefined;
  const trimmed = idOrName.trim();
  if (!trimmed || !teams) return undefined;
  const matchById = findEntity<Team>(teams, (t) => t.id === trimmed);
  if (matchById) return matchById;
  const lowerName = trimmed.toLowerCase();
  return findEntity<Team>(teams, (t) => hasName(t, lowerName));
}

/** Up to two initials from the first code point of each word ('@' handle prefixes ignored). */
function getInitials(name: string): string {
  const letters: string[] = [];
  for (const word of name.split(/\s+/)) {
    const first = Array.from(word.replace(/^@+/, ""))[0];
    if (first) letters.push(first);
    if (letters.length === 2) break;
  }
  return letters.join("").toUpperCase() || "?";
}

/**
 * Parses and resolves complete member and team details for a task using ID relations.
 */
export function resolveTaskAssignee(
  task: Task,
  people?: Person[],
  teams?: Team[]
): ResolvedAssignee {
  const assigneeValue: unknown = task?.assignee;
  const rawAssignee =
    typeof assigneeValue === "string"
      ? assigneeValue.trim()
      : typeof assigneeValue === "number" && Number.isFinite(assigneeValue)
      ? String(assigneeValue)
      : "";
  const person = resolvePersonById(people, rawAssignee);
  const effectiveTeamId = person?.teamId || task?.teamId;
  const team = resolveTeamById(teams, effectiveTeamId);

  const personName = typeof person?.name === "string" ? person.name.trim() : "";
  const teamName = typeof team?.name === "string" ? team.name.trim() : "";
  const displayName = personName || rawAssignee || teamName;
  // Person color, else team color, else the default; each plan value is checked on its own.
  const avatarColor = sanitizeCssColor(person?.color) ?? sanitizeCssColor(team?.color) ?? DEFAULT_AVATAR_COLOR;

  return {
    person,
    team,
    displayName: displayName || "Unassigned",
    role: typeof person?.role === "string" ? person.role : undefined,
    avatarColor,
    initials: getInitials(displayName)
  };
}
