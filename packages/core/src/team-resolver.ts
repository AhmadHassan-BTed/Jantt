import { Person, Team, Task } from "./types";


export interface ResolvedAssignee {
  person?: Person;
  team?: Team;
  displayName: string;
  role?: string;
  avatarColor: string;
  initials: string;
}

/**
 * Resolves a Person by their unique ID or name fallback.
 */
export function resolvePersonById(
  people: Person[] | undefined,
  idOrName: string | undefined
): Person | undefined {
  if (!people || !idOrName || typeof idOrName !== "string") return undefined;
  const trimmed = idOrName.trim();
  const matchById = people.find((p) => p.id === trimmed);
  if (matchById) return matchById;
  return people.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
}

/**
 * Resolves a Team by its unique ID or name fallback.
 */
export function resolveTeamById(
  teams: Team[] | undefined,
  idOrName: string | undefined
): Team | undefined {
  if (!teams || !idOrName || typeof idOrName !== "string") return undefined;
  const trimmed = idOrName.trim();
  const matchById = teams.find((t) => t.id === trimmed);
  if (matchById) return matchById;
  return teams.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
}

/**
 * Parses and resolves complete member and team details for a task using ID relations.
 */
export function resolveTaskAssignee(
  task: Task,
  people?: Person[],
  teams?: Team[]
): ResolvedAssignee {
  const rawAssignee = (task.assignee || "").trim();
  const person = resolvePersonById(people, rawAssignee);
  const effectiveTeamId = person?.teamId || task.teamId;
  const team = resolveTeamById(teams, effectiveTeamId);

  const displayName = person?.name || rawAssignee || (team ? team.name : "");
  const avatarColor = person?.color || team?.color || "#38BDF8";
  const initials = (displayName || "?")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "?";

  return {
    person,
    team,
    displayName: displayName || "Unassigned",
    role: person?.role,
    avatarColor,
    initials
  };
}
