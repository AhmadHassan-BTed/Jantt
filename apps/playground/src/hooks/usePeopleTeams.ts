import { useState, useMemo, useEffect, useCallback } from "react";
import type { Person, Team, JanttData } from "@jantt/core";
import { getEffectivePeople } from "../utils";
import { PERSON_COLORS, STORAGE_KEYS } from "../constants";

interface UsePeopleTeamsOptions {
  initialPeople: Person[];
  initialTeams: Team[];
  initialPersonFilter: string;
  parsedData: JanttData | null;
  handleChartCommit: (data: JanttData) => void;
  showToast: (msg: string, isErr?: boolean) => void;
}

export function usePeopleTeams({
  initialPeople,
  initialTeams,
  initialPersonFilter,
  parsedData,
  handleChartCommit,
  showToast
}: UsePeopleTeamsOptions) {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
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

  const handleAddPerson = useCallback(() => {
    if (!newPersonName.trim() || !parsedData) return;
    const newPerson: Person = {
      id: `person-${Date.now().toString(36)}`,
      name: newPersonName.trim(),
      role: newPersonRole.trim() || undefined,
      teamId: newPersonTeamId || undefined,
      color: PERSON_COLORS[effectivePeople.length % PERSON_COLORS.length]
    };
    const updated = [...people, newPerson];
    setPeople(updated);
    const updatedData = { ...parsedData, people: updated };
    handleChartCommit(updatedData);
    setNewPersonName("");
    setNewPersonRole("");
    setNewPersonTeamId("");
  }, [newPersonName, newPersonRole, newPersonTeamId, parsedData, people, effectivePeople.length, handleChartCommit]);

  const handleAddRealTeammate = useCallback(
    (targetUser: { username: string; displayName?: string; photoURL?: string }) => {
      if (!parsedData || !targetUser.username) return;
      const mentionHandle = `@${targetUser.username.replace(/^@+/, "")}`;

      if (people.some((p) => p.username === mentionHandle || p.id === mentionHandle)) {
        showToast(`${mentionHandle} is already in the project.`, true);
        return;
      }

      const realPerson: Person = {
        id: mentionHandle,
        name: targetUser.displayName || mentionHandle,
        username: mentionHandle,
        avatar: targetUser.photoURL,
        role: "Collaborator",
        color: PERSON_COLORS[effectivePeople.length % PERSON_COLORS.length]
      };

      const updated = [...people, realPerson];
      setPeople(updated);
      const updatedData = { ...parsedData, people: updated };
      handleChartCommit(updatedData);
      showToast(`Added ${mentionHandle} to project!`);
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
      const updated = [...people, cleanPerson];
      setPeople(updated);
      const updatedData = { ...parsedData, people: updated };
      handleChartCommit(updatedData);
      showToast(`Saved ${personToPersist.name} to project JSON!`);
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
    setPeople(cleanPeople);
    const updatedData = { ...parsedData, people: cleanPeople };
    handleChartCommit(updatedData);
    showToast(`Saved all ${cleanPeople.length} members to project JSON!`);
  }, [parsedData, effectivePeople, handleChartCommit, showToast]);

  const handleRemovePerson = useCallback(
    (personId: string) => {
      if (!parsedData) return;
      const updated = people.filter((p) => p.id !== personId);
      setPeople(updated);
      const updatedData = { ...parsedData, people: updated };
      handleChartCommit(updatedData);
    },
    [parsedData, people, handleChartCommit]
  );

  const handleAddTeam = useCallback(() => {
    if (!newTeamName.trim() || !parsedData) return;
    const newTeam: Team = {
      id: `team-${Date.now().toString(36)}`,
      name: newTeamName.trim(),
      color: newTeamColor || "#38BDF8",
      description: newTeamDesc.trim() || undefined
    };
    const updated = [...teams, newTeam];
    setTeams(updated);
    const updatedData = { ...parsedData, teams: updated };
    handleChartCommit(updatedData);
    setNewTeamName("");
    setNewTeamDesc("");
  }, [newTeamName, newTeamColor, newTeamDesc, parsedData, teams, handleChartCommit]);

  const handleRemoveTeam = useCallback(
    (teamId: string) => {
      if (!parsedData) return;
      const updatedTeams = teams.filter((t) => t.id !== teamId);
      const updatedPeople = people.map((p) => (p.teamId === teamId ? { ...p, teamId: undefined } : p));
      setTeams(updatedTeams);
      setPeople(updatedPeople);
      const updatedData = { ...parsedData, teams: updatedTeams, people: updatedPeople };
      handleChartCommit(updatedData);
    },
    [parsedData, teams, people, handleChartCommit]
  );

  return {
    people,
    setPeople,
    teams,
    setTeams,
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
