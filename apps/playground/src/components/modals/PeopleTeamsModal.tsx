import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Layers,
  Plus,
  Lightbulb,
  Trash2,
  Check,
  Search,
  UserCheck,
  AlertTriangle,
  Eye
} from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { ConfirmDialog, Modal, ModalHeader } from "./ModalHost";
import {
  type Person,
  type Team,
  type JanttData,
  resolvePersonById,
  resolveTeamById,
  sanitizeCssColor
} from "@jantt/core";
import type { EffectivePerson } from "../../types";
import { auth, searchUsersByUsername, type UserProfile } from "../../firebase";
import { getTrustedAvatarUrl } from "../../room-storage";

interface PeopleTeamsModalProps {
  /** View-only room (viewer, or an editor who has not signed in): every add/remove control is disabled. */
  readOnly?: boolean;
  showPeopleModal: boolean;
  setShowPeopleModal: (show: boolean) => void;
  peopleModalTab: "people" | "teams";
  setPeopleModalTab: (tab: "people" | "teams") => void;
  effectivePeople: EffectivePerson[];
  people: Person[];
  teams: Team[];
  parsedData: JanttData | null;
  newPersonName: string;
  setNewPersonName: (val: string) => void;
  newPersonRole: string;
  setNewPersonRole: (val: string) => void;
  newPersonTeamId: string;
  setNewPersonTeamId: (val: string) => void;
  handleAddPerson: () => void;
  onAddRealTeammate?: (user: UserProfile) => void;
  handlePersistAllPeople: () => void;
  handlePersistPerson: (p: Person) => void;
  handleRemovePerson: (id: string) => void;
  newTeamName: string;
  setNewTeamName: (val: string) => void;
  newTeamColor: string;
  setNewTeamColor: (val: string) => void;
  newTeamDesc: string;
  setNewTeamDesc: (val: string) => void;
  handleAddTeam: () => void;
  handleRemoveTeam: (id: string) => void;
}

const MIN_SEARCH_CHARS = 2;

const ACCENT = "var(--jantt-accent)";

/** Plan colors come from shared rooms and links: only plain CSS colors may reach a style (no url() beacons). */
const safeColor = (value: unknown) => sanitizeCssColor(value, ACCENT);

/** Plan text fields are untrusted JSON; anything but a non-empty string renders as absent. */
const textOf = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "?";

/** Only GitHub-hosted avatars load (any other URL would leak each viewer's IP); otherwise initials. */
const Avatar: React.FC<{ src?: unknown; name: string; size: number; background: string }> = ({ src, name, size, background }) => {
  const safeSrc = getTrustedAvatarUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (safeSrc && failedSrc !== safeSrc) {
    return (
      <img
        src={safeSrc}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(safeSrc)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid var(--jantt-border)"
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: safeColor(background),
        color: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size >= 30 ? "12px" : "11px",
        fontWeight: 700,
        flexShrink: 0
      }}
    >
      {getInitials(name)}
    </div>
  );
};

const fieldStyle: React.CSSProperties = {
  height: "38px",
  padding: "8px 12px",
  fontSize: "13px",
  fontFamily: "var(--jantt-font-sans)",
  borderRadius: "8px",
  border: "1px solid var(--jantt-border)",
  boxSizing: "border-box"
};

const sectionLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  margin: 0,
  color: "var(--jantt-text-muted)"
};

const segmentButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "4px 9px",
  fontSize: "11px",
  fontWeight: 600,
  borderRadius: "4px",
  border: "none",
  cursor: "pointer",
  background: active ? "var(--jantt-surface)" : "transparent",
  color: active ? "var(--jantt-accent)" : "var(--jantt-text-muted)",
  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
  transition: "all 0.15s ease"
});

const iconButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--jantt-text-muted)",
  cursor: "pointer",
  padding: "4px",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center"
};

/** `.btn-nav` has no disabled styling of its own. */
const disabledLook = (disabled: boolean): React.CSSProperties => (disabled ? { opacity: 0.5, cursor: "not-allowed" } : {});

const normalizeKey = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

type PendingRemoval = { kind: "person"; person: EffectivePerson } | { kind: "team"; team: Team } | null;

export const PeopleTeamsModal: React.FC<PeopleTeamsModalProps> = ({
  readOnly = false,
  showPeopleModal,
  setShowPeopleModal,
  peopleModalTab,
  setPeopleModalTab,
  effectivePeople,
  people,
  teams,
  parsedData,
  newPersonName,
  setNewPersonName,
  newPersonRole,
  setNewPersonRole,
  newPersonTeamId,
  setNewPersonTeamId,
  handleAddPerson,
  onAddRealTeammate,
  handlePersistAllPeople,
  handlePersistPerson,
  handleRemovePerson,
  newTeamName,
  setNewTeamName,
  newTeamColor,
  setNewTeamColor,
  newTeamDesc,
  setNewTeamDesc,
  handleAddTeam,
  handleRemoveTeam
}) => {
  const { t } = useI18n();
  const pluralTasks = (n: number) =>
    n === 1 ? t("people.tasksOne", { count: n }) : t("people.tasksMany", { count: n });
  const pluralMembers = (n: number) =>
    n === 1 ? t("people.membersOne", { count: n }) : t("people.membersMany", { count: n });
  const pluralDocuments = (n: number) =>
    n === 1 ? t("people.documentsOne", { count: n }) : t("people.documentsMany", { count: n });
  const pluralAssignees = (n: number) =>
    n === 1 ? t("people.assigneesOne", { count: n }) : t("people.assigneesMany", { count: n });
  /** "a", "a and b", "a, b and c". */
  const joinList = (items: string[]) =>
    items.length <= 1
      ? items.join("")
      : `${items.slice(0, -1).join(t("people.listSeparator"))}${t("people.and")}${items[items.length - 1]}`;
  const [memberMode, setMemberMode] = useState<"search" | "custom">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval>(null);
  const searchSeqRef = useRef(0);

  const searchTerm = searchQuery.trim().replace(/^@+/, "");

  useEffect(() => {
    // Every query change (including clearing it) invalidates any in-flight request.
    const seq = ++searchSeqRef.current;
    setSearchError(false);
    if (searchTerm.length < MIN_SEARCH_CHARS) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchUsersByUsername(searchTerm, auth.currentUser?.uid);
        if (seq === searchSeqRef.current) setSearchResults(results);
      } catch (err) {
        console.error("Teammate search failed:", err);
        if (seq === searchSeqRef.current) {
          setSearchResults([]);
          setSearchError(true);
        }
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm, searchAttempt]);

  // Closing the dialog discards transient search and confirmation state.
  useEffect(() => {
    if (!showPeopleModal) {
      setSearchQuery("");
      setPendingRemoval(null);
    }
  }, [showPeopleModal]);

  // Assignee text -> member id, resolved like the chart does (saved members first: id, then
  // '@'-insensitive username, then case-insensitive name), then members detected from the plan.
  const resolveMemberId = useMemo(() => {
    const cache = new Map<string, string | undefined>();
    return (value: unknown): string | undefined => {
      const raw = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
      if (!raw.trim()) return undefined;
      if (!cache.has(raw)) {
        cache.set(raw, (resolvePersonById(people, raw) ?? resolvePersonById(effectivePeople, raw))?.id);
      }
      return cache.get(raw);
    };
  }, [people, effectivePeople]);

  // Member id -> live task count, so each member row is an O(1) lookup.
  const assignedCountById = useMemo(() => {
    const counts = new Map<string, number>();
    if (!showPeopleModal) return counts;
    for (const t of parsedData?.tasks || []) {
      if (!t || t._deleted) continue;
      const id = resolveMemberId(t.assignee);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [showPeopleModal, parsedData, resolveMemberId]);

  const existingHandles = useMemo(
    () => new Set(people.flatMap((p) => [normalizeKey(p.username), normalizeKey(p.id)]).filter(Boolean)),
    [people]
  );

  if (!showPeopleModal) return null;

  const close = () => setShowPeopleModal(false);

  const countAssignedTasks = (p: Person) => assignedCountById.get(p.id) || 0;

  const describeOtherReferences = (p: Person) => {
    const parts: string[] = [];
    if (resolveMemberId(parsedData?.meta?.person) === p.id) parts.push(t("people.projectLead"));
    const docCount = (parsedData?.documents || []).filter((d) => d && resolveMemberId(d.owner) === p.id).length;
    if (docCount > 0) parts.push(t("people.docOwner", { documents: pluralDocuments(docCount) }));
    return parts;
  };

  const trimmedPersonName = newPersonName.trim();
  const personNameTaken =
    trimmedPersonName.length > 0 &&
    effectivePeople.some((p) => normalizeKey(p.name) === trimmedPersonName.toLowerCase());
  const canAddPerson = !readOnly && trimmedPersonName.length > 0 && !personNameTaken;
  const submitPerson = () => {
    if (canAddPerson) handleAddPerson();
  };

  const trimmedTeamName = newTeamName.trim();
  const teamNameTaken =
    trimmedTeamName.length > 0 && teams.some((tm) => normalizeKey(tm.name) === trimmedTeamName.toLowerCase());
  const canAddTeam = !readOnly && trimmedTeamName.length > 0 && !teamNameTaken;
  const submitTeam = () => {
    if (canAddTeam) handleAddTeam();
  };

  const readOnlyNotice = readOnly && (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "10px 12px",
        background: "rgba(245, 158, 11, 0.08)",
        border: "1px solid rgba(245, 158, 11, 0.3)",
        borderRadius: "8px",
        fontSize: "12px",
        lineHeight: 1.45,
        color: "var(--jantt-text)"
      }}
    >
      <Eye size={14} aria-hidden="true" style={{ color: "#F59E0B", flexShrink: 0, marginTop: "2px" }} />
      <span>
        <strong>{t("people.viewOnlyTitle")}</strong> {t("people.viewOnlyBody")}
      </span>
    </div>
  );

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = peopleModalTab === "people" ? "teams" : "people";
    setPeopleModalTab(next);
    document.getElementById(`people-tab-${next}`)?.focus();
  };

  const removalConfirm = (() => {
    // A role downgrade while the confirmation is open must not let the removal through.
    if (readOnly) return null;
    if (pendingRemoval?.kind === "person") {
      const { person } = pendingRemoval;
      const assignedCount = countAssignedTasks(person);
      // handleRemovePerson unassigns the person's tasks in the same commit; other references stay.
      const otherRefs = describeOtherReferences(person);
      return {
        title: t("people.removePersonTitle", { name: person.name }),
        message: (
          <>
            <strong>{person.name}</strong>{" "}
            {assignedCount > 0
              ? t("people.removePersonUnassigned", { tasks: pluralTasks(assignedCount) })
              : t("people.removePersonSimple")}
            {otherRefs.length > 0 && ` ${t("people.removePersonRefs", { refs: joinList(otherRefs) })}`}
          </>
        ),
        confirmLabel:
          assignedCount > 0
            ? t("people.unassignAndRemove", { tasks: pluralTasks(assignedCount) })
            : t("people.removeMember"),
        onConfirm: () => handleRemovePerson(person.id)
      };
    }
    if (pendingRemoval?.kind === "team") {
      const { team } = pendingRemoval;
      const memberCount = effectivePeople.filter((p) => p.teamId === team.id).length;
      const taskCount = (parsedData?.tasks || []).filter((t) => t && !t._deleted && t.teamId === team.id).length;
      const detached = [
        ...(memberCount > 0 ? [pluralMembers(memberCount)] : []),
        ...(taskCount > 0 ? [pluralTasks(taskCount)] : [])
      ];
      return {
        title: t("people.deleteTeamTitle", { name: team.name }),
        message: (
          <>
            {t("people.teamDeletedBefore")} <strong>{team.name}</strong> {t("people.teamDeletedAfter")}
            {detached.length > 0 ? ` ${t("people.teamDetached", { detached: joinList(detached) })}` : ""}
          </>
        ),
        confirmLabel: t("people.deleteTeam"),
        onConfirm: () => handleRemoveTeam(team.id)
      };
    }
    return null;
  })();

  const showNoMatch =
    searchTerm.length >= MIN_SEARCH_CHARS && !isSearching && !searchError && searchResults.length === 0;

  return (
    <>
      <Modal onClose={close} maxWidth={620}>
        <ModalHeader icon={<Users size={18} />} title={t("people.title")} />

        {/* Modal Tabs (Members vs Teams) */}
        <div
          className="prompt-modal-tabs"
          role="tablist"
          aria-label={t("people.tabsAria")}
          onKeyDown={handleTabKeyDown}
          style={{ overflowX: "auto" }}
        >
          <button
            type="button"
            role="tab"
            id="people-tab-people"
            aria-selected={peopleModalTab === "people"}
            aria-controls="people-tabpanel"
            tabIndex={peopleModalTab === "people" ? 0 : -1}
            className={`prompt-tab-btn ${peopleModalTab === "people" ? "is-active" : ""}`}
            onClick={() => setPeopleModalTab("people")}
          >
            <Users size={13} />
            <span>{t("people.membersTab", { count: effectivePeople.length })}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="people-tab-teams"
            aria-selected={peopleModalTab === "teams"}
            aria-controls="people-tabpanel"
            tabIndex={peopleModalTab === "teams" ? 0 : -1}
            className={`prompt-tab-btn ${peopleModalTab === "teams" ? "is-active" : ""}`}
            onClick={() => setPeopleModalTab("teams")}
          >
            <Layers size={13} />
            <span>{t("people.teamsTab", { count: teams.length })}</span>
          </button>
        </div>

        <div
          className="prompt-modal-body"
          id="people-tabpanel"
          role="tabpanel"
          aria-labelledby={`people-tab-${peopleModalTab}`}
          style={{ gap: "18px", padding: "20px" }}
        >
          {peopleModalTab === "people" ? (
            <>
              {/* Add New Member Section (Search Registered Teammates vs Offline Persona); view-only rooms get the notice instead */}
              {readOnlyNotice || (
                <div style={{ background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <span style={sectionLabelStyle}>{t("people.addMember")}</span>
                    <div
                      role="group"
                      aria-label={t("people.memberType")}
                      style={{ display: "flex", background: "var(--jantt-bg)", borderRadius: "6px", padding: "2px", border: "1px solid var(--jantt-border)" }}
                    >
                      <button
                        type="button"
                        aria-pressed={memberMode === "search"}
                        onClick={() => setMemberMode("search")}
                        style={segmentButtonStyle(memberMode === "search")}
                      >
                        {t("people.janttAccount")}
                      </button>
                      <button
                        type="button"
                        aria-pressed={memberMode === "custom"}
                        onClick={() => setMemberMode("custom")}
                        style={segmentButtonStyle(memberMode === "custom")}
                      >
                        {t("people.nameOnly")}
                      </button>
                    </div>
                  </div>

                  {memberMode === "search" ? (
                    <div>
                      <div style={{ position: "relative" }}>
                        <Search size={14} style={{ position: "absolute", left: "12px", top: "12px", color: "var(--jantt-text-muted)", pointerEvents: "none" }} />
                        <input
                          type="text"
                          inputMode="search"
                          className="code-textarea"
                          style={{ ...fieldStyle, width: "100%", padding: "8px 12px 8px 34px" }}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t("people.searchPlaceholder")}
                          aria-label={t("people.searchAria")}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>

                      <div aria-live="polite" style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "6px" }}>
                        {searchQuery.trim().length > 0 && searchTerm.length < MIN_SEARCH_CHARS && (
                          <span>{t("people.minChars", { count: MIN_SEARCH_CHARS })}</span>
                        )}
                        {isSearching && <span>{t("people.searching")}</span>}
                        {showNoMatch && (
                          <span>
                            {t("people.noAccount", { term: searchTerm })}
                          </span>
                        )}
                        {searchError && !isSearching && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#EF4444" }}>
                            <AlertTriangle size={12} />
                            <span>{t("people.searchUnavailable")}</span>
                            <button
                              type="button"
                              className="btn-nav"
                              style={{ height: "22px", padding: "0 8px", fontSize: "11px" }}
                              onClick={() => setSearchAttempt((n) => n + 1)}
                            >
                              {t("people.retry")}
                            </button>
                          </span>
                        )}
                      </div>

                      {searchResults.length > 0 && (
                        <ul
                          aria-label={t("people.matchingAccounts")}
                          style={{
                            listStyle: "none",
                            margin: "8px 0 0 0",
                            border: "1px solid var(--jantt-border)",
                            borderRadius: "8px",
                            background: "var(--jantt-bg)",
                            maxHeight: "180px",
                            overflowY: "auto",
                            padding: "6px"
                          }}
                        >
                          {searchResults.map((usr) => {
                            const alreadyAdded =
                              existingHandles.has(normalizeKey(`@${usr.username}`)) ||
                              existingHandles.has(normalizeKey(usr.username));
                            return (
                              <li
                                key={usr.uid}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "8px",
                                  padding: "7px 10px",
                                  borderRadius: "6px",
                                  background: "var(--jantt-surface)",
                                  border: "1px solid var(--jantt-border-subtle)",
                                  marginBottom: "4px"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                                  <Avatar src={usr.photoURL} name={usr.displayName || usr.username} size={26} background="var(--jantt-accent)" />
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                                    <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--jantt-text)" }}>
                                      {usr.displayName || usr.username}
                                    </span>
                                    <span style={{ fontSize: "11px", color: "var(--jantt-accent)", fontFamily: "var(--jantt-font-mono)", fontWeight: 600 }}>
                                      @{usr.username}
                                    </span>
                                  </div>
                                </div>
                                {alreadyAdded ? (
                                  <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                                    <Check size={12} />
                                    {t("people.alreadyMember")}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-nav btn-nav-primary"
                                    style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}
                                    disabled={!onAddRealTeammate}
                                    onClick={() => {
                                      if (!onAddRealTeammate) return;
                                      onAddRealTeammate({ ...usr, photoURL: getTrustedAvatarUrl(usr.photoURL) ?? undefined });
                                      setSearchQuery("");
                                    }}
                                    aria-label={t("people.addUserAria", { username: usr.username })}
                                  >
                                    <Plus size={12} />
                                    <span>{t("people.add")}</span>
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          className="code-textarea"
                          style={{ ...fieldStyle, flex: "1 1 160px" }}
                          value={newPersonName}
                          onChange={(e) => setNewPersonName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitPerson();
                          }}
                          placeholder={t("people.namePlaceholder")}
                          aria-label={t("people.nameAria")}
                          aria-invalid={personNameTaken}
                          aria-describedby={personNameTaken ? "people-name-taken" : undefined}
                        />
                        <input
                          type="text"
                          className="code-textarea"
                          style={{ ...fieldStyle, flex: "1 1 130px" }}
                          value={newPersonRole}
                          onChange={(e) => setNewPersonRole(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitPerson();
                          }}
                          placeholder={t("people.rolePlaceholder")}
                          aria-label={t("people.roleAria")}
                        />
                        {teams.length > 0 && (
                          <select
                            className="code-textarea"
                            style={{
                              ...fieldStyle,
                              flex: "1 1 120px",
                              padding: "6px 10px",
                              fontSize: "12px",
                              background: "var(--jantt-surface-solid)",
                              color: "var(--jantt-text)"
                            }}
                            value={newPersonTeamId}
                            onChange={(e) => setNewPersonTeamId(e.target.value)}
                            aria-label={t("people.teamAria")}
                          >
                            <option value="">{t("people.noTeam")}</option>
                            {teams.map((tm) => (
                              <option key={tm.id} value={tm.id}>{t("people.teamOption", { name: tm.name })}</option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          className="btn-nav btn-nav-primary"
                          style={{ height: "38px", padding: "0 14px", flexShrink: 0, opacity: canAddPerson ? 1 : 0.5 }}
                          onClick={submitPerson}
                          disabled={!canAddPerson}
                        >
                          <Plus size={14} />
                          <span>{t("people.addMember")}</span>
                        </button>
                      </div>
                      {personNameTaken && (
                        <div id="people-name-taken" style={{ fontSize: "11.5px", color: "#F59E0B", marginTop: "6px" }}>
                          {t("people.nameTaken", { name: trimmedPersonName })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* People List */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
                  <span style={sectionLabelStyle}>{t("people.currentMembers", { count: effectivePeople.length })}</span>
                  {effectivePeople.length > people.length && (
                    <button
                      type="button"
                      className="btn-nav btn-nav-primary"
                      style={{ height: "24px", padding: "0 10px", fontSize: "10.5px", ...disabledLook(readOnly) }}
                      onClick={handlePersistAllPeople}
                      disabled={readOnly}
                      title={readOnly ? t("people.viewOnlyHint") : t("people.saveAllTitle")}
                    >
                      {t("people.saveAll")}
                    </button>
                  )}
                </div>

                {effectivePeople.length > people.length && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "6px",
                      padding: "8px 12px",
                      background: "rgba(56, 189, 248, 0.08)",
                      border: "1px solid rgba(56, 189, 248, 0.2)",
                      borderRadius: "8px",
                      marginBottom: "10px",
                      fontSize: "11.5px",
                      color: "var(--jantt-text)"
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <Lightbulb size={14} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
                      <span>
                        <strong>{pluralAssignees(effectivePeople.length - people.length)}</strong> {t("people.detectedAfter")}
                      </span>
                    </span>
                    {!readOnly && (
                      <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                        {t("people.saveHint")}
                      </span>
                    )}
                  </div>
                )}

                {effectivePeople.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--jantt-surface)", border: "1px dashed var(--jantt-border)", borderRadius: "10px", color: "var(--jantt-text-muted)" }}>
                    <Users size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>{t("people.noMembers")}</p>
                    {!readOnly && (
                      <p style={{ margin: "4px 0 0 0", fontSize: "11.5px" }}>{t("people.noMembersHint")}</p>
                    )}
                  </div>
                ) : (
                  <ul style={{ display: "flex", flexDirection: "column", gap: "8px", listStyle: "none", margin: 0, padding: 0 }}>
                    {effectivePeople.map((p) => {
                      const assignedCount = countAssignedTasks(p);
                      const memberTeam = resolveTeamById(teams, p.teamId);
                      const teamColor = safeColor(memberTeam?.color);
                      const username = textOf(p.username);
                      const role = textOf(p.role);

                      return (
                        <li
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px",
                            padding: "10px 14px",
                            background: "var(--jantt-surface)",
                            border: "1px solid var(--jantt-border)",
                            borderRadius: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            <Avatar src={p.avatar} name={p.name} size={32} background={safeColor(p.color)} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)", overflowWrap: "anywhere" }}>
                                  {p.name}
                                </span>
                                {username ? (
                                  <span
                                    style={{
                                      fontSize: "10.5px",
                                      fontFamily: "var(--jantt-font-mono)",
                                      fontWeight: 600,
                                      color: "var(--jantt-accent)",
                                      background: "rgba(56, 189, 248, 0.1)",
                                      padding: "1px 6px",
                                      borderRadius: "100px",
                                      border: "1px solid rgba(56, 189, 248, 0.25)",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px"
                                    }}
                                    title={t("people.linkedAccount")}
                                  >
                                    <UserCheck size={10} />
                                    {username.startsWith("@") ? username : `@${username}`}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: "9.5px",
                                      color: "var(--jantt-text-muted)",
                                      background: "var(--jantt-border-subtle)",
                                      padding: "1px 5px",
                                      borderRadius: "4px"
                                    }}
                                    title={t("people.nameOnlyTitle")}
                                  >
                                    {t("people.noAccountBadge")}
                                  </span>
                                )}
                                {p.isInferred && (
                                  <span
                                    style={{
                                      fontSize: "9.5px",
                                      fontWeight: 600,
                                      background: "rgba(56, 189, 248, 0.12)",
                                      color: "var(--jantt-accent)",
                                      padding: "1px 6px",
                                      borderRadius: "100px",
                                      border: "1px solid rgba(56, 189, 248, 0.25)"
                                    }}
                                    title={t("people.detectedTitle")}
                                  >
                                    {t("people.detected")}
                                  </span>
                                )}
                                {memberTeam && (
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      // Works for every CSS color format, unlike appending a hex alpha.
                                      background: `color-mix(in srgb, ${teamColor} 12%, transparent)`,
                                      color: teamColor,
                                      padding: "1px 6px",
                                      borderRadius: "100px"
                                    }}
                                  >
                                    {memberTeam.name}
                                  </span>
                                )}
                              </div>
                              {role && (
                                <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                                  {role}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                background: assignedCount > 0 ? "rgba(56, 189, 248, 0.12)" : "var(--jantt-border-subtle)",
                                color: assignedCount > 0 ? "var(--jantt-accent)" : "var(--jantt-text-muted)"
                              }}
                            >
                              {pluralTasks(assignedCount)}
                            </span>
                            {p.isInferred ? (
                              <button
                                type="button"
                                onClick={() => handlePersistPerson(p)}
                                disabled={readOnly}
                                className="btn-nav"
                                style={{
                                  padding: "3px 8px",
                                  height: "26px",
                                  fontSize: "11px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  ...disabledLook(readOnly)
                                }}
                                title={readOnly ? t("people.viewOnlyHint") : t("people.saveAsMemberTitle", { name: p.name })}
                              >
                                <Plus size={11} />
                                <span>{t("people.saveAsMember")}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPendingRemoval({ kind: "person", person: p })}
                                disabled={readOnly}
                                style={{ ...iconButtonStyle, ...disabledLook(readOnly) }}
                                title={readOnly ? t("people.viewOnlyHint") : t("people.removeTitle", { name: p.name })}
                                aria-label={t("people.removeTitle", { name: p.name })}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Add New Team Box; view-only rooms get the notice instead */}
              {readOnlyNotice || (
                <div style={{ background: "var(--jantt-surface)", border: "1px solid var(--jantt-border)", borderRadius: "10px", padding: "14px" }}>
                  <span style={{ ...sectionLabelStyle, marginBottom: "8px" }}>{t("people.addTeam")}</span>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="text"
                      className="code-textarea"
                      style={{ ...fieldStyle, flex: "1 1 160px" }}
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitTeam();
                      }}
                      placeholder={t("people.teamNamePlaceholder")}
                      aria-label={t("people.teamNameAria")}
                      aria-invalid={teamNameTaken}
                      aria-describedby={teamNameTaken ? "team-name-taken" : undefined}
                    />
                    <input
                      type="color"
                      style={{
                        width: "38px",
                        height: "38px",
                        border: "1px solid var(--jantt-border)",
                        borderRadius: "8px",
                        cursor: "pointer",
                        padding: "2px",
                        background: "var(--jantt-surface-solid)"
                      }}
                      value={newTeamColor}
                      onChange={(e) => setNewTeamColor(e.target.value)}
                      title={t("people.teamColor")}
                      aria-label={t("people.teamColor")}
                    />
                    <input
                      type="text"
                      className="code-textarea"
                      style={{ ...fieldStyle, flex: "1 1 180px" }}
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitTeam();
                      }}
                      placeholder={t("people.teamDescPlaceholder")}
                      aria-label={t("people.teamDescAria")}
                    />
                    <button
                      type="button"
                      className="btn-nav btn-nav-primary"
                      style={{ height: "38px", padding: "0 14px", flexShrink: 0, opacity: canAddTeam ? 1 : 0.5 }}
                      onClick={submitTeam}
                      disabled={!canAddTeam}
                    >
                      <Plus size={14} />
                      <span>{t("people.addTeam")}</span>
                    </button>
                  </div>
                  {teamNameTaken && (
                    <div id="team-name-taken" style={{ fontSize: "11.5px", color: "#F59E0B", marginTop: "6px" }}>
                      {t("people.teamNameTaken", { name: trimmedTeamName })}
                    </div>
                  )}
                </div>
              )}

              {/* Teams List */}
              <div>
                <span style={{ ...sectionLabelStyle, marginBottom: "8px" }}>{t("people.currentTeams", { count: teams.length })}</span>
                {teams.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--jantt-surface)", border: "1px dashed var(--jantt-border)", borderRadius: "10px", color: "var(--jantt-text-muted)" }}>
                    <Layers size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>{t("people.noTeams")}</p>
                    {!readOnly && (
                      <p style={{ margin: "4px 0 0 0", fontSize: "11.5px" }}>{t("people.noTeamsHint")}</p>
                    )}
                  </div>
                ) : (
                  <ul style={{ display: "flex", flexDirection: "column", gap: "8px", listStyle: "none", margin: 0, padding: 0 }}>
                    {teams.map((tm) => {
                      const memberCount = effectivePeople.filter((p) => p.teamId === tm.id).length;
                      const description = textOf(tm.description);
                      return (
                        <li
                          key={tm.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px",
                            padding: "10px 14px",
                            background: "var(--jantt-surface)",
                            border: "1px solid var(--jantt-border)",
                            borderRadius: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: "14px",
                                height: "14px",
                                borderRadius: "50%",
                                background: safeColor(tm.color),
                                display: "inline-block",
                                flexShrink: 0
                              }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)", overflowWrap: "anywhere" }}>
                                  {tm.name}
                                </span>
                                <span style={{ fontSize: "10px", fontFamily: "var(--jantt-font-mono)", color: "var(--jantt-text-muted)" }}>
                                  #{tm.id}
                                </span>
                              </div>
                              {description && (
                                <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
                                  {description}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                background: "rgba(56, 189, 248, 0.12)",
                                color: "var(--jantt-accent)"
                              }}
                            >
                              {pluralMembers(memberCount)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPendingRemoval({ kind: "team", team: tm })}
                              disabled={readOnly}
                              style={{ ...iconButtonStyle, ...disabledLook(readOnly) }}
                              title={readOnly ? t("people.viewOnlyHint") : t("people.deleteTeamTitleAttr", { name: tm.name })}
                              aria-label={t("people.deleteTeamTitleAttr", { name: tm.name })}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <div className="prompt-modal-footer" style={{ flexWrap: "wrap" }}>
          <span style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
            {readOnly ? t("people.footerReadOnly") : t("people.footer")}
          </span>
          <button type="button" className="btn-nav btn-nav-primary" onClick={close}>
            <Check size={14} />
            <span>{t("common.done")}</span>
          </button>
        </div>
      </Modal>

      {removalConfirm && (
        <ConfirmDialog
          tone="danger"
          title={removalConfirm.title}
          message={removalConfirm.message}
          confirmLabel={removalConfirm.confirmLabel}
          onConfirm={() => {
            removalConfirm.onConfirm();
            setPendingRemoval(null);
          }}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </>
  );
};
