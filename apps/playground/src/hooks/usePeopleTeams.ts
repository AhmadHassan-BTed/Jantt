import { useState, useMemo, useEffect, useCallback } from "react";
import type { Person, Team, JanttData, Task } from "@jantt/core";
import { getEffectivePeople, generateId, sanitizeRegistry } from "../utils";
import { PERSON_COLORS, STORAGE_KEYS } from "../constants";
import { tGlobal } from "../i18n";

interface UsePeopleTeamsOptions {
  /** @deprecated People are derived from `parsedData`; kept for API compatibility. */
  initialPeople?: Person[];
  /** @deprecated Teams are derived from `parsedData`; kept for API compatibility. */
  initialTeams?: Team[];
  initialPersonFilter: string;
  parsedData: JanttData | null;
  handleChartCommit: (data: JanttData) => void;
  showToast: (msg: string, isErr?: boolean) => void;
}

const NO_OP_SETTER = () => {};

/** Clears every reference a task holds to a removed person. Returns null when untouched. */
function unassignPerson(task: Task, person: { id: string; name?: string }): Task | null {
  const matches = (value: unknown) => value === person.id || (Boolean(person.name) && value === person.name);
  const original: unknown[] | null = Array.isArray(task.assignees) ? task.assignees : null;
  const kept = original ? original.filter((a) => !matches(a)) : null;
  const assigneeHit = matches(task.assignee);
  const personHit = matches(task.person);
  const assigneesHit = original !== null && kept !== null && kept.length !== original.length;
  if (!assigneeHit && !personHit && !assigneesHit) return null;
  const next: Task = { ...task };
  if (assigneeHit) delete next.assignee;
  if (personHit) delete next.person;
  if (assigneesHit) next.assignees = kept as Task["assignees"];
  return next;
}

export function usePeopleTeams({
  initialPersonFilter,
  parsedData,
  handleChartCommit,
  showToast
}: UsePeopleTeamsOptions) {
  // The plan is the single source of truth for people and teams (no drifting local copy)
  const rawPeople = parsedData?.people;
  const rawTeams = parsedData?.teams;
  const people = useMemo(() => sanitizeRegistry<Person>(rawPeople), [rawPeople]);
  const teams = useMemo(() => sanitizeRegistry<Team>(rawTeams), [rawTeams]);
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>(initialPersonFilter);

  const effectivePeople = useMemo(() => {
    return getEffectivePeople(parsedData, people);
  }, [parsedData, people]);

  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [peopleModalTab, setPeopleModalTab] = useState<"people" | "teams">("people");
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState("");
  const [newPersonTeamId, setNewPersonTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamColor, setNewTeamColor] = useState("#38BDF8");
  const [newTeamDesc, setNewTeamDesc] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PERSON_FILTER, selectedPersonFilter);
    } catch {}
  }, [selectedPersonFilter]);

  // A filter for a person or team that does not exist in this plan (other plan, removed
  // member) would silently hide every task: fall back to "all"
  useEffect(() => {
    if (!parsedData) return;
    const filter = selectedPersonFilter;
    if (!filter || filter === "all" || filter.startsWith("sort:")) return;
    const exists = filter.startsWith("team:")
      ? teams.some((t) => t.id === filter.slice(5))
      : effectivePeople.some((p) => p.id === filter || p.name === filter);
    if (!exists) setSelectedPersonFilter("all");
  }, [parsedData, selectedPersonFilter, teams, effectivePeople]);

  const handleAddPerson = useCallback(() => {
    if (!newPersonName.trim() || !parsedData) return;
    const newPerson: Person = {
      id: generateId("person"),
      name: newPersonName.trim(),
      role: newPersonRole.trim() || undefined,
      teamId: newPersonTeamId || undefined,
      color: PERSON_COLORS[effectivePeople.length % PERSON_COLORS.length]
    };
    handleChartCommit({ ...parsedData, people: [...people, newPerson] });
    setNewPersonName("");
    setNewPersonRole("");
    setNewPersonTeamId("");
  }, [newPersonName, newPersonRole, newPersonTeamId, parsedData, people, effectivePeople.length, handleChartCommit]);

  const handleAddRealTeammate = useCallback(
    (targetUser: { username: string; displayName?: string; photoURL?: string }) => {
      if (!parsedData || !targetUser.username) return;
      const mentionHandle = `@${targetUser.username.replace(/^@+/, "")}`;

      if (people.some((p) => p.username === mentionHandle || p.id === mentionHandle)) {
        showToast(tGlobal("hooks.people.alreadyInProject", { name: mentionHandle }), true);
        return;
      }

      const realPerson: Person = {
        id: mentionHandle,
        name: targetUser.displayName || mentionHandle,
        username: mentionHandle,
        avatar: targetUser.photoURL,
        role: tGlobal("hooks.people.collaborator"),
        color: PERSON_COLORS[effectivePeople.length % PERSON_COLORS.length]
      };

      handleChartCommit({ ...parsedData, people: [...people, realPerson] });
      showToast(tGlobal("hooks.people.addedToProject", { name: mentionHandle }));
    },
    [parsedData, people, effectivePeople.length, handleChartCommit, showToast]
  );

  const handlePersistPerson = useCallback(
    (personToPersist: Person) => {
      if (!parsedData) return;
      const cleanPerson: Person = {
        id: personToPersist.id,
        name: personToPersist.name,
        username: personToPersist.username,
        avatar: personToPersist.avatar,
        role: personToPersist.role,
        teamId: personToPersist.teamId,
        color: personToPersist.color || PERSON_COLORS[people.length % PERSON_COLORS.length]
      };
      const exists = people.some((p) => p.id === cleanPerson.id);
      const updated = exists ? people.map((p) => (p.id === cleanPerson.id ? cleanPerson : p)) : [...people, cleanPerson];
      handleChartCommit({ ...parsedData, people: updated });
      showToast(tGlobal("hooks.people.savedPerson", { name: personToPersist.name }));
    },
    [parsedData, people, handleChartCommit, showToast]
  );

  const handlePersistAllPeople = useCallback(() => {
    if (!parsedData) return;
    const cleanPeople: Person[] = effectivePeople.map((p) => ({
      id: p.id,
      name: p.name,
      username: p.username,
      avatar: p.avatar,
      role: p.role,
      teamId: p.teamId,
      color: p.color
    }));
    handleChartCommit({ ...parsedData, people: cleanPeople });
    showToast(tGlobal("hooks.people.savedAllMembers", { count: cleanPeople.length }));
  }, [parsedData, effectivePeople, handleChartCommit, showToast]);

  const handleRemovePerson = useCallback(
    (personId: string) => {
      if (!parsedData) return;
      const person = effectivePeople.find((p) => p.id === personId) || { id: personId };
      // Unassign the person everywhere, otherwise they are re-inferred from task assignees
      let unassigned = 0;
      const tasks = (parsedData.tasks || []).map((t) => {
        const next = unassignPerson(t, person);
        if (!next) return t;
        unassigned++;
        return next;
      });
      handleChartCommit({ ...parsedData, tasks, people: people.filter((p) => p.id !== personId) });
      const name = "name" in person && person.name ? person.name : personId;
      showToast(
        unassigned > 0
          ? tGlobal(
              unassigned === 1 ? "hooks.people.removedUnassignedOne" : "hooks.people.removedUnassignedMany",
              { name, count: unassigned }
            )
          : tGlobal("hooks.people.removed", { name })
      );
    },
    [parsedData, people, effectivePeople, handleChartCommit, showToast]
  );

  const handleAddTeam = useCallback(() => {
    if (!newTeamName.trim() || !parsedData) return;
    const newTeam: Team = {
      id: generateId("team"),
      name: newTeamName.trim(),
      color: newTeamColor || "#38BDF8",
      description: newTeamDesc.trim() || undefined
    };
    handleChartCommit({ ...parsedData, teams: [...teams, newTeam] });
    setNewTeamName("");
    setNewTeamDesc("");
  }, [newTeamName, newTeamColor, newTeamDesc, parsedData, teams, handleChartCommit]);

  const handleRemoveTeam = useCallback(
    (teamId: string) => {
      if (!parsedData) return;
      const updatedTeams = teams.filter((t) => t.id !== teamId);
      const updatedPeople = people.map((p) => (p.teamId === teamId ? { ...p, teamId: undefined } : p));
      const tasks = (parsedData.tasks || []).map((t) => {
        if (t.teamId !== teamId) return t;
        const next = { ...t };
        delete next.teamId;
        return next;
      });
      handleChartCommit({ ...parsedData, tasks, teams: updatedTeams, people: updatedPeople });
    },
    [parsedData, teams, people, handleChartCommit]
  );

  return {
    people,
    /** @deprecated No-op: people are derived from the plan. Commit plan changes instead. */
    setPeople: NO_OP_SETTER as (people: Person[]) => void,
    teams,
    /** @deprecated No-op: teams are derived from the plan. Commit plan changes instead. */
    setTeams: NO_OP_SETTER as (teams: Team[]) => void,
    effectivePeople,
    selectedPersonFilter,
    setSelectedPersonFilter,
    showPeopleModal,
    setShowPeopleModal,
    peopleModalTab,
    setPeopleModalTab,
    newPersonName,
    setNewPersonName,
    newPersonRole,
    setNewPersonRole,
    newPersonTeamId,
    setNewPersonTeamId,
    newTeamName,
    setNewTeamName,
    newTeamColor,
    setNewTeamColor,
    newTeamDesc,
    setNewTeamDesc,
    handleAddPerson,
    handleAddRealTeammate,
    handlePersistPerson,
    handlePersistAllPeople,
    handleRemovePerson,
    handleAddTeam,
    handleRemoveTeam
  };
}
