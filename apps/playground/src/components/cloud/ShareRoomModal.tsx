import { RoomQr } from "./RoomQr";
import React, { useState, useEffect, useMemo, useRef, useId } from "react";
import {
  Users,
  X,
  Copy,
  Check,
  Search,
  UserPlus,
  Crown,
  Shield,
  Trash2,
  Loader2,
  Globe,
  Layers,
  Eye,
  Edit3
} from "lucide-react";
import { normalizeUsername, sanitizeCssColor, type Team, type Person } from "@jantt/core";
import { ref, onValue, set } from "firebase/database";
import {
  rtdb,
  decodePlanFromRtdb,
  searchUsersByUsername,
  shareRoomWithUser,
  shareRoomWithTeam,
  removeTeamFromRoom,
  removeMemberFromRoom,
  updateMemberRole,
  type UserProfile,
  type RoomMember,
  type RoomMetadata,
  type RoomTeam
} from "../../firebase";
import { buildRoomViewerUrl, getTrustedAvatarUrl, isValidRoomId } from "../../room-storage";
import { Modal, ModalHeader, ConfirmDialog } from "../modals/ModalHost";

interface ShareRoomModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  roomId: string | null;
  roomTitle: string;
  currentUserProfile: UserProfile | null;
  showToast: (msg: string, isErr?: boolean) => void;
  /** Included in the copied room link when provided. */
  activeView?: string;
  selectedThemeId?: string;
  /** @deprecated Teams and people are read from the shared room itself (the active plan may be another one). */
  planTeams?: Team[];
  /** @deprecated See `planTeams`. */
  planPeople?: Person[];
  /** @deprecated Counts are read from the room's metadata. */
  planTasksCount?: number;
  /** @deprecated See `planTasksCount`. */
  planNotesCount?: number;
}

type ShareTab = "link" | "people" | "teams" | "members";

interface PendingConfirm {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: "8px",
  background: "var(--jantt-bg, rgba(15, 23, 42, 0.7))",
  border: "1px solid var(--jantt-border)",
  color: "var(--jantt-text)",
  fontSize: "0.88rem"
};

const cardStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "10px",
  border: "1px solid var(--jantt-border)",
  background: "var(--jantt-surface)"
};

const mutedText: React.CSSProperties = { margin: 0, fontSize: "0.8rem", color: "var(--jantt-text-muted)", lineHeight: 1.45 };

const sectionLabel: React.CSSProperties = {
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "var(--jantt-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  marginBottom: "6px"
};

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err || "Unknown error");
}

function toList<T>(value: unknown, isItem: (item: unknown) => item is T): T[] {
  if (!value || typeof value !== "object") return [];
  const items = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return items.filter(isItem);
}

const isNamed = <T extends { id: string; name: string }>(v: unknown): v is T =>
  Boolean(v && typeof v === "object" && typeof (v as T).id === "string" && typeof (v as T).name === "string");

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const strList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

function snapshotEntries(value: unknown): [string, Record<string, unknown>][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, Record<string, unknown>] => Boolean(entry[0] && entry[1] && typeof entry[1] === "object")
  );
}

/**
 * Members keyed by uid. The key is the identity: a record body may carry a stale or forged `uid`,
 * so the key alone is used for list keys, role changes and removal. Bodies are display hints and
 * are type-checked before rendering.
 */
function membersFromSnapshot(value: unknown): RoomMember[] {
  return snapshotEntries(value).map(([uid, m]) => {
    const username = str(m.username) ?? "";
    return {
      uid,
      username,
      displayName: str(m.displayName)?.trim() || username || "Unknown member",
      photoURL: str(m.photoURL),
      role: m.role === "owner" || m.role === "editor" ? m.role : "viewer",
      joinedAt: str(m.joinedAt) ?? "",
      teamId: str(m.teamId),
      teamName: str(m.teamName)
    };
  });
}

/** Teams shared with the room, keyed by team id (the key is the identity, as for members). */
function teamsFromSnapshot(value: unknown): RoomTeam[] {
  return snapshotEntries(value)
    .filter(([, t]) => typeof t.name === "string")
    .map(([id, t]) => ({
      id,
      name: t.name as string,
      color: str(t.color),
      memberUids: strList(t.memberUids),
      memberUsernames: strList(t.memberUsernames),
      role: t.role === "editor" ? "editor" : "viewer",
      addedAt: str(t.addedAt) ?? ""
    }));
}

const teamColor = (color: unknown) => sanitizeCssColor(color, "var(--jantt-accent)");

/** "@handle", or the display name of a record without a username. */
const memberLabel = (member: RoomMember) => (member.username ? `@${member.username}` : member.displayName);

function teamPeople(team: Team, people: Person[]): Person[] {
  const listed = Array.isArray(team.members) ? (team.members as unknown[]) : [];
  return people.filter((p) => p.teamId === team.id || listed.includes(p.id));
}

const Avatar: React.FC<{ name?: string; photoURL?: string; size: number }> = ({ name, photoURL, size }) => {
  const avatar = getTrustedAvatarUrl(photoURL);
  return avatar ? (
    <img
      src={avatar}
      alt=""
      referrerPolicy="no-referrer"
      style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }}
    />
  ) : (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: "var(--jantt-accent)",
        color: "var(--jantt-accent-contrast, #000000)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.4
      }}
    >
      {(name?.trim()?.[0] || "?").toUpperCase()}
    </span>
  );
};

/**
 * Share & access dialog of a cloud room. Everyone sees the room link and the member list;
 * only the owner can invite people or teams and change or remove access (the database rules
 * reject those writes for anyone else).
 */
export const ShareRoomModal: React.FC<ShareRoomModalProps> = ({
  show,
  setShow,
  roomId,
  roomTitle,
  currentUserProfile,
  showToast,
  activeView,
  selectedThemeId
}) => {
  const baseId = useId();
  const [savingForkSetting, setSavingForkSetting] = useState(false);
  const [activeTab, setActiveTab] = useState<ShareTab>("link");
  const [meta, setMeta] = useState<RoomMetadata | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [roomTeams, setRoomTeams] = useState<RoomTeam[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // Individual invites
  const [searchQuery, setSearchQuery] = useState("");
  const [rawResults, setRawResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<"editor" | "viewer">("editor");
  const [isSharing, setIsSharing] = useState(false);
  const searchRequestRef = useRef(0);

  // Team invites (teams and people of the shared room's own plan)
  const [planTeams, setPlanTeams] = useState<Team[]>([]);
  const [planPeople, setPlanPeople] = useState<Person[]>([]);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [selectedTeamRole, setSelectedTeamRole] = useState<"editor" | "viewer">("editor");
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);

  const validRoomId = show && isValidRoomId(roomId) ? roomId : null;
  const currentUid = currentUserProfile?.uid ?? null;
  const isOwner = Boolean(currentUid && meta?.ownerUid === currentUid);

  // Reset per open / per room.
  useEffect(() => {
    if (!show) return;
    setActiveTab("link");
    setSearchQuery("");
    setRawResults([]);
    setSelectedUser(null);
    setTeamSearchQuery("");
    setCopiedLink(false);
    setPendingConfirm(null);
  }, [show, roomId]);

  // Room meta, members and teams.
  useEffect(() => {
    setMeta(null);
    setMembers([]);
    setRoomTeams([]);
    setLoadError(null);
    if (!validRoomId) return;
    const onError = (error: Error) => setLoadError(error.message);
    const unsubscribers = [
      onValue(
        ref(rtdb, `rooms/${validRoomId}/meta`),
        (snap) => setMeta(snap.exists() ? (snap.val() as RoomMetadata) : null),
        onError
      ),
      onValue(ref(rtdb, `rooms/${validRoomId}/members`), (snap) => setMembers(membersFromSnapshot(snap.val())), onError),
      onValue(ref(rtdb, `rooms/${validRoomId}/teams`), (snap) => setRoomTeams(teamsFromSnapshot(snap.val())), onError)
    ];
    return () => unsubscribers.forEach((stop) => stop());
  }, [validRoomId]);

  // The room's own teams and people, only while inviting teams.
  useEffect(() => {
    setPlanTeams([]);
    setPlanPeople([]);
    if (!validRoomId || activeTab !== "teams" || !isOwner) return;
    const decode = (value: unknown) => (value && typeof value === "object" ? decodePlanFromRtdb(value) : value);
    const unsubscribers = [
      onValue(
        ref(rtdb, `rooms/${validRoomId}/data/teams`),
        (snap) => setPlanTeams(toList(decode(snap.val()), isNamed<Team>)),
        () => setPlanTeams([])
      ),
      onValue(
        ref(rtdb, `rooms/${validRoomId}/data/people`),
        (snap) => setPlanPeople(toList(decode(snap.val()), isNamed<Person>)),
        () => setPlanPeople([])
      )
    ];
    return () => unsubscribers.forEach((stop) => stop());
  }, [validRoomId, activeTab, isOwner]);

  // Username autocomplete; responses to superseded queries are dropped.
  useEffect(() => {
    const query = searchQuery.trim();
    const requestId = ++searchRequestRef.current;
    setSearchError(null);
    if (!query || selectedUser || !isOwner) {
      setRawResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchUsersByUsername(query, currentUid ?? undefined);
        if (searchRequestRef.current === requestId) setRawResults(results);
      } catch (err) {
        // A failed lookup is not "no such user": say so, so the owner can retry.
        if (searchRequestRef.current === requestId) {
          setRawResults([]);
          setSearchError(errorText(err));
        }
      } finally {
        if (searchRequestRef.current === requestId) setIsSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery, selectedUser, isOwner, currentUid]);

  const memberUids = useMemo(() => new Set(members.map((m) => m.uid)), [members]);
  // The owner (meta.ownerUid, the only definition of owner) first, then editors, then viewers.
  const sortedMembers = useMemo(() => {
    const rank = (m: RoomMember) => (m.uid === meta?.ownerUid ? 0 : m.role === "editor" ? 1 : 2);
    return [...members].sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
  }, [members, meta?.ownerUid]);
  const searchResults = useMemo(
    () => rawResults.filter((u) => !memberUids.has(u.uid) && u.uid !== meta?.ownerUid),
    [rawResults, memberUids, meta?.ownerUid]
  );
  useEffect(() => setHighlighted(0), [searchResults]);

  const filteredTeams = useMemo(() => {
    const q = teamSearchQuery.toLowerCase().trim();
    if (!q) return planTeams;
    return planTeams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (typeof t.department === "string" && t.department.toLowerCase().includes(q))
    );
  }, [planTeams, teamSearchQuery]);

  useEffect(() => {
    if (!copiedLink) return;
    const timer = window.setTimeout(() => setCopiedLink(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copiedLink]);

  if (!show || !roomId) return null;

  const close = () => setShow(false);
  const viewLink = validRoomId ? buildRoomViewerUrl(validRoomId, activeView, selectedThemeId) : "";
  const ownerHandle = meta?.ownerUsername ? `@${meta.ownerUsername}` : "the owner";
  const title = meta?.title || roomTitle;

  const tabs: { id: ShareTab; label: string; icon: React.ReactNode }[] = [
    { id: "link", label: "Room link", icon: <Globe size={14} aria-hidden="true" /> },
    ...(isOwner
      ? [
          { id: "people" as const, label: "Invite people", icon: <UserPlus size={14} aria-hidden="true" /> },
          { id: "teams" as const, label: "Invite a team", icon: <Layers size={14} aria-hidden="true" /> }
        ]
      : []),
    { id: "members", label: `Members (${members.length})`, icon: <Users size={14} aria-hidden="true" /> }
  ];
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : "link";
  const tabId = (tab: ShareTab) => `${baseId}-tab-${tab}`;
  const panelId = `${baseId}-panel`;

  const focusTab = (tab: ShareTab) => {
    setActiveTab(tab);
    document.getElementById(tabId(tab))?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((t) => t.id === currentTab);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      focusTab(tabs[(index + delta + tabs.length) % tabs.length].id);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusTab(tabs[event.key === "Home" ? 0 : tabs.length - 1].id);
    }
  };

  const handleCopyLink = async () => {
    if (!viewLink) return;
    try {
      await navigator.clipboard.writeText(viewLink);
      setCopiedLink(true);
      showToast("Room link copied. Anyone with it can view the plan.");
    } catch {
      showToast("Couldn't copy the link. Select it and copy it manually.", true);
    }
  };

  const selectUser = (user: UserProfile) => {
    setSelectedUser(user);
    setSearchQuery(`@${user.username}`);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (selectedUser || searchResults.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((h) => (h + delta + searchResults.length) % searchResults.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const user = searchResults[highlighted];
      if (user) selectUser(user);
    }
  };

  const handleShareWithSelectedUser = async () => {
    if (!selectedUser || isSharing || !validRoomId) return;
    setIsSharing(true);
    try {
      await shareRoomWithUser(validRoomId, selectedUser, selectedRole);
      showToast(
        `Added @${selectedUser.username} as ${selectedRole === "editor" ? "an editor" : "a viewer"}. The room now appears in their "Shared with me" list.`
      );
      setSelectedUser(null);
      setSearchQuery("");
    } catch (err) {
      showToast(`Couldn't add @${selectedUser.username}: ${errorText(err)}`, true);
    } finally {
      setIsSharing(false);
    }
  };

  /** Invites the team's people that have a Jantt account (matched by their username). */
  const handleAddTeam = async (team: Team) => {
    if (!validRoomId || busyTeamId) return;
    const people = teamPeople(team, planPeople);
    const handles = Array.from(
      new Set(people.map((p) => (typeof p.username === "string" ? normalizeUsername(p.username) : "")).filter(Boolean))
    );
    const withoutUsername = people.length - people.filter((p) => typeof p.username === "string" && normalizeUsername(p.username)).length;
    if (handles.length === 0) {
      showToast(`Nobody in "${team.name}" has a username in this plan. Share the room link with them instead.`, true);
      return;
    }

    setBusyTeamId(team.id);
    try {
      let failedLookups = 0;
      const matches = await Promise.all(
        handles.map(async (handle) => {
          try {
            const results = await searchUsersByUsername(handle);
            return results.find((u) => u.username === handle) ?? null;
          } catch {
            failedLookups++; // Reported below, separately from people without an account.
            return null;
          }
        })
      );
      const accounts = matches.filter((u): u is UserProfile => Boolean(u));
      const unresolved = handles.length - accounts.length - failedLookups + withoutUsername;
      if (accounts.length === 0) {
        showToast(
          failedLookups > 0
            ? `Couldn't look up the people in "${team.name}". Check your connection and try again.`
            : `Nobody in "${team.name}" has a Jantt account yet. Share the room link with them instead.`,
          true
        );
        return;
      }
      const result = await shareRoomWithTeam(
        validRoomId,
        { id: team.id, name: team.name, color: sanitizeCssColor(team.color) },
        accounts,
        selectedTeamRole
      );
      const added = result?.added?.length ?? accounts.length;
      const missing = unresolved + (result?.skipped?.length ?? 0);
      // People who already had access are neither added nor missing.
      const addedText =
        added > 0
          ? `Added ${added} ${added === 1 ? "person" : "people"} from "${team.name}".`
          : `Everyone in "${team.name}" with a Jantt account already has access.`;
      const missingText =
        missing > 0
          ? ` ${missing} ${missing === 1 ? "person has" : "people have"} no Jantt account yet; share the room link with them.`
          : "";
      const failedText =
        failedLookups > 0 ? ` ${failedLookups} ${failedLookups === 1 ? "person" : "people"} couldn't be looked up; try inviting the team again.` : "";
      showToast(addedText + missingText + failedText, failedLookups > 0);
    } catch (err) {
      showToast(`Couldn't add team "${team.name}": ${errorText(err)}`, true);
    } finally {
      setBusyTeamId(null);
    }
  };

  const confirmRemoveTeam = (team: { id: string; name: string }) => {
    if (!validRoomId) return;
    setPendingConfirm({
      title: `Remove team "${team.name}"?`,
      message: "People who were added only through this team lose access to the room. People you invited individually keep their access.",
      confirmLabel: "Remove team",
      onConfirm: async () => {
        try {
          await removeTeamFromRoom(validRoomId, team.id);
          showToast(`Removed team "${team.name}".`);
        } catch (err) {
          showToast(`Couldn't remove the team: ${errorText(err)}`, true);
        }
      }
    });
  };

  const confirmRemoveMember = (member: RoomMember) => {
    if (!validRoomId) return;
    setPendingConfirm({
      title: `Remove ${memberLabel(member)}?`,
      message: `${memberLabel(member)} will lose access to this room and it disappears from their room list.`,
      confirmLabel: "Remove",
      onConfirm: async () => {
        try {
          await removeMemberFromRoom(validRoomId, member.uid);
          showToast(`Removed ${memberLabel(member)} from the room.`);
        } catch (err) {
          showToast(`Couldn't remove ${memberLabel(member)}: ${errorText(err)}`, true);
        }
      }
    });
  };

  const handleRoleChange = async (member: RoomMember, newRole: "editor" | "viewer") => {
    if (!validRoomId || member.role === newRole) return;
    try {
      await updateMemberRole(validRoomId, member.uid, newRole);
      showToast(`${memberLabel(member)} can now ${newRole === "editor" ? "edit" : "only view"} this room.`);
    } catch (err) {
      showToast(`Couldn't change the role: ${errorText(err)}`, true);
    }
  };

  const counts = [
    `${members.length} member${members.length === 1 ? "" : "s"}`,
    typeof meta?.taskCount === "number" ? `${meta.taskCount} task${meta.taskCount === 1 ? "" : "s"}` : null,
    typeof meta?.noteCount === "number" ? `${meta.noteCount} note${meta.noteCount === 1 ? "" : "s"}` : null
  ].filter(Boolean);

  const listboxId = `${baseId}-results`;
  const showResults = isOwner && !selectedUser && searchResults.length > 0;

  return (
    <>
      <Modal onClose={close} maxWidth={640}>
        <ModalHeader
          icon={<Users size={18} />}
          title={`Share "${title}"`}
          subtitle={
            <>
              Room <code style={{ color: "var(--jantt-accent)" }}>{roomId}</code> · {counts.join(" · ")}
            </>
          }
        />

        <div
          role="tablist"
          aria-label="Share options"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            margin: "12px 20px 0",
            padding: "4px",
            borderRadius: "10px",
            border: "1px solid var(--jantt-border)",
            background: "var(--jantt-surface)",
            flexShrink: 0
          }}
        >
          {tabs.map((tab) => {
            const selected = tab.id === currentTab;
            return (
              <button
                key={tab.id}
                id={tabId(tab.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={handleTabKeyDown}
                style={{
                  flex: "1 1 120px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  background: selected ? "var(--jantt-accent)" : "transparent",
                  color: selected ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)"
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(currentTab)}
          style={{ padding: "18px 20px 20px", overflowY: "auto", flex: 1, minHeight: 0 }}
        >
          {!validRoomId ? (
            <p role="alert" style={mutedText}>
              This room ID is not valid.
            </p>
          ) : (
            <>
              {loadError && (
                <p role="alert" style={{ ...mutedText, color: "#F87171", marginBottom: "12px" }}>
                  Couldn't load the room's members: {loadError}
                </p>
              )}

              {/* ROOM LINK */}
              {currentTab === "link" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Eye size={16} aria-hidden="true" style={{ color: "var(--jantt-accent)" }} />
                        <strong style={{ fontSize: "0.9rem" }}>Room link</strong>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", background: "rgba(56, 189, 248, 0.15)", color: "var(--jantt-accent)" }}>
                          View access
                        </span>
                      </div>
                      <button type="button" onClick={handleCopyLink} className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.82rem" }}>
                        {copiedLink ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        {copiedLink ? "Copied" : "Copy link"}
                      </button>
                    </div>
                    <p style={{ ...mutedText, marginBottom: "10px" }}>
                      Anyone with this link can view the plan and its live updates, without signing in. The link never
                      gives edit access.
                    </p>
                    <RoomQr url={viewLink} />
                    {isOwner && <label className="room-fork-setting">
                      <input type="checkbox" checked={meta?.allowViewerForks !== false} disabled={savingForkSetting}
                        onChange={async event => {
                          const allow = event.target.checked;
                          setSavingForkSetting(true);
                          try {
                            await set(ref(rtdb, `rooms/${validRoomId}/meta/allowViewerForks`), allow);
                          } catch (error) { showToast(`Could not save the viewer copy setting. ${errorText(error)}`, true); }
                          finally { setSavingForkSetting(false); }
                        }} />
                      <span>Offer viewers a private local copy<small>Controls the copy action in Jantt. People with the link can still read and export the plan.</small></span>
                    </label>}
                    <input
                      readOnly
                      aria-label="Room link"
                      value={viewLink}
                      onFocus={(e) => e.currentTarget.select()}
                      style={{ ...inputStyle, fontFamily: "var(--jantt-font-mono, monospace)", fontSize: "0.8rem" }}
                    />
                  </div>

                  <div style={{ ...cardStyle, display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <Shield size={16} aria-hidden="true" style={{ color: "#34D399", flexShrink: 0, marginTop: "2px" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
                      <strong style={{ fontSize: "0.88rem" }}>Who can edit</strong>
                      {isOwner ? (
                        <>
                          <p style={mutedText}>
                            Invite teammates by their Jantt username and choose <strong>Can edit</strong>. They edit
                            after signing in with GitHub; you can change or remove their access any time under Members.
                          </p>
                          <div>
                            <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={() => setActiveTab("people")}>
                              <UserPlus size={14} aria-hidden="true" /> Invite people
                            </button>
                          </div>
                        </>
                      ) : (
                        <p style={mutedText}>
                          Only {ownerHandle} can invite people or change access.
                          {currentUserProfile ? " Ask them to make you an Editor." : " Sign in with GitHub, then ask them to make you an Editor."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INVITE PEOPLE (owner) */}
              {currentTab === "people" && isOwner && (
                <div>
                  <p style={{ ...mutedText, marginBottom: "12px" }}>
                    Find a teammate by their Jantt username. They must have signed in to Jantt once.
                  </p>
                  <label htmlFor={`${baseId}-search`} style={sectionLabel}>
                    Username
                  </label>
                  <div style={{ position: "relative", marginBottom: "14px" }}>
                    <Search size={16} aria-hidden="true" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--jantt-text-muted)" }} />
                    <input
                      id={`${baseId}-search`}
                      type="text"
                      role="combobox"
                      aria-expanded={showResults}
                      aria-controls={listboxId}
                      aria-autocomplete="list"
                      aria-activedescendant={showResults ? `${listboxId}-${highlighted}` : undefined}
                      autoComplete="off"
                      spellCheck={false}
                      data-autofocus
                      placeholder="@username"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSelectedUser(null);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      style={{ ...inputStyle, padding: "10px 36px" }}
                    />
                    {isSearching && (
                      <Loader2 size={16} className="spin-sync-icon" aria-label="Searching" style={{ position: "absolute", right: "12px", top: "50%", marginTop: "-8px", color: "var(--jantt-text-muted)" }} />
                    )}
                    {showResults && (
                      <ul
                        id={listboxId}
                        role="listbox"
                        aria-label="Matching users"
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          right: 0,
                          margin: 0,
                          padding: "4px",
                          listStyle: "none",
                          background: "var(--jantt-surface-solid, #0F172A)",
                          border: "1px solid var(--jantt-border-strong, var(--jantt-border))",
                          borderRadius: "8px",
                          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.35)",
                          zIndex: 5,
                          maxHeight: "220px",
                          overflowY: "auto"
                        }}
                      >
                        {searchResults.map((user, index) => (
                          <li
                            key={user.uid}
                            id={`${listboxId}-${index}`}
                            role="option"
                            aria-selected={index === highlighted}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setHighlighted(index)}
                            onClick={() => selectUser(user)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              background: index === highlighted ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.15))" : "transparent"
                            }}
                          >
                            <Avatar name={user.displayName} photoURL={user.photoURL} size={28} />
                            <span style={{ minWidth: 0 }}>
                              <strong style={{ display: "block", fontSize: "0.86rem", color: "var(--jantt-text)" }}>{user.displayName}</strong>
                              <span style={{ fontSize: "0.78rem", color: "var(--jantt-accent)" }}>@{user.username}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {searchError && (
                    <p role="alert" style={{ ...mutedText, color: "#F87171", marginBottom: "12px" }}>
                      Couldn't search for accounts: {searchError}
                    </p>
                  )}
                  {!isSearching && !searchError && searchQuery.trim() && !selectedUser && searchResults.length === 0 && (
                    <p style={{ ...mutedText, marginBottom: "12px" }}>
                      No matching account that isn't already a member. People without a Jantt account can view with the room link.
                    </p>
                  )}

                  {selectedUser && (
                    <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <Avatar name={selectedUser.displayName} photoURL={selectedUser.photoURL} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{selectedUser.displayName}</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--jantt-accent)" }}>@{selectedUser.username}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <label htmlFor={`${baseId}-role`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                          Access for @{selectedUser.username}
                        </label>
                        <select
                          id={`${baseId}-role`}
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value as "editor" | "viewer")}
                          className="select-input"
                          style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                        >
                          <option value="editor">Can edit</option>
                          <option value="viewer">Can view</option>
                        </select>
                        <button type="button" onClick={handleShareWithSelectedUser} disabled={isSharing} className="btn btn-primary" style={{ padding: "7px 14px", fontSize: "0.85rem" }}>
                          {isSharing ? <Loader2 size={14} className="spin-sync-icon" aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />} Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* INVITE A TEAM (owner) */}
              {currentTab === "teams" && isOwner && (
                <div>
                  <p style={{ ...mutedText, marginBottom: "12px" }}>
                    Invite everyone in one of this room's teams. People are matched to Jantt accounts by the username in
                    their People &amp; Teams entry; anyone without an account can still view with the room link.
                  </p>
                  <div style={{ marginBottom: "14px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ position: "relative", flex: "1 1 220px" }}>
                      <Search size={16} aria-hidden="true" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--jantt-text-muted)" }} />
                      <input
                        type="search"
                        aria-label="Filter teams"
                        placeholder="Filter teams…"
                        value={teamSearchQuery}
                        onChange={(e) => setTeamSearchQuery(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: "36px" }}
                      />
                    </div>
                    <select
                      aria-label="Access for invited team members"
                      value={selectedTeamRole}
                      onChange={(e) => setSelectedTeamRole(e.target.value as "editor" | "viewer")}
                      className="select-input"
                      style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                    >
                      <option value="editor">Add as editors</option>
                      <option value="viewer">Add as viewers</option>
                    </select>
                  </div>

                  {filteredTeams.length === 0 ? (
                    <p style={{ ...mutedText, textAlign: "center", padding: "24px 10px" }}>
                      {planTeams.length === 0
                        ? "This room's plan has no teams yet. Create teams under People & Teams first."
                        : "No team matches the filter."}
                    </p>
                  ) : (
                    <ul style={{ display: "flex", flexDirection: "column", gap: "10px", margin: 0, padding: 0, listStyle: "none" }}>
                      {filteredTeams.map((team) => {
                        const isAdded = roomTeams.some((rt) => rt.id === team.id);
                        const memberCount = teamPeople(team, planPeople).length;
                        const isBusy = busyTeamId === team.id;
                        return (
                          <li key={team.id} style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                              <span aria-hidden="true" style={{ width: "12px", height: "12px", borderRadius: "50%", flexShrink: 0, background: teamColor(team.color) }} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <strong style={{ fontSize: "0.9rem" }}>{team.name}</strong>
                                  {isAdded && (
                                    <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "10px", background: "#10B981", color: "#FFFFFF", fontWeight: 700 }}>Added</span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.78rem", color: "var(--jantt-text-muted)" }}>
                                  {memberCount} {memberCount === 1 ? "person" : "people"}
                                  {typeof team.department === "string" && team.department ? ` · ${team.department}` : ""}
                                </div>
                              </div>
                            </div>
                            {isAdded ? (
                              <button type="button" onClick={() => confirmRemoveTeam(team)} className="btn btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 10px", color: "#EF4444" }}>
                                Remove team
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddTeam(team)}
                                disabled={Boolean(busyTeamId) || memberCount === 0}
                                className="btn btn-primary"
                                style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                              >
                                {isBusy ? <Loader2 size={13} className="spin-sync-icon" aria-hidden="true" /> : <Layers size={13} aria-hidden="true" />} Invite team
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* MEMBERS */}
              {currentTab === "members" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {!isOwner && <p style={{ ...mutedText, marginBottom: "6px" }}>Only {ownerHandle} can change access.</p>}

                  {roomTeams.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <div style={sectionLabel}>Teams ({roomTeams.length})</div>
                      <ul style={{ display: "flex", flexWrap: "wrap", gap: "8px", margin: 0, padding: 0, listStyle: "none" }}>
                        {roomTeams.map((rt) => (
                          <li key={rt.id} style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "5px 10px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.25)" }}>
                            <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", background: teamColor(rt.color) }} />
                            <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{rt.name}</span>
                            <span style={{ fontSize: "0.72rem", color: "var(--jantt-text-muted)" }}>
                              {rt.memberUids?.length || 0} {rt.memberUids?.length === 1 ? "person" : "people"}
                            </span>
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => confirmRemoveTeam(rt)}
                                aria-label={`Remove team ${rt.name}`}
                                title="Remove team"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: "0 2px", display: "inline-flex" }}
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div style={sectionLabel}>People ({members.length})</div>
                  <ul style={{ display: "flex", flexDirection: "column", gap: "8px", margin: 0, padding: 0, listStyle: "none" }}>
                    {sortedMembers.map((member) => {
                      const isRoomOwnerRow = member.uid === meta?.ownerUid;
                      const isMe = member.uid === currentUid;
                      const roleLabel = isRoomOwnerRow ? "Owner" : member.role === "editor" ? "Editor" : "Viewer";
                      return (
                        <li key={member.uid} style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: "10px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            <Avatar name={member.displayName || member.username} photoURL={member.photoURL} size={32} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <strong style={{ fontSize: "0.88rem" }}>{member.displayName || member.username}</strong>
                                {isMe && <span style={{ fontSize: "0.7rem", color: "var(--jantt-accent)", fontWeight: 700 }}>(you)</span>}
                                {member.teamName && (
                                  <span style={{ fontSize: "0.68rem", padding: "1px 5px", borderRadius: "4px", background: "rgba(99, 102, 241, 0.15)", color: "#818CF8" }}>
                                    {member.teamName}
                                  </span>
                                )}
                              </div>
                              {member.username && (
                                <div style={{ fontSize: "0.76rem", color: "var(--jantt-text-muted)" }}>@{member.username}</div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isRoomOwnerRow ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", fontWeight: 700, color: "#F59E0B", padding: "3px 8px", borderRadius: "6px", background: "rgba(245, 158, 11, 0.15)" }}>
                                <Crown size={12} aria-hidden="true" /> Owner
                              </span>
                            ) : isOwner ? (
                              <>
                                <select
                                  aria-label={`Access for ${memberLabel(member)}`}
                                  value={member.role === "editor" ? "editor" : "viewer"}
                                  onChange={(e) => handleRoleChange(member, e.target.value as "editor" | "viewer")}
                                  className="select-input"
                                  style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                                >
                                  <option value="editor">Can edit</option>
                                  <option value="viewer">Can view</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => confirmRemoveMember(member)}
                                  className="btn btn-secondary"
                                  aria-label={`Remove ${memberLabel(member)} from the room`}
                                  title="Remove from room"
                                  style={{ color: "#EF4444", padding: "6px 8px" }}
                                >
                                  <Trash2 size={13} aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  background: member.role === "editor" ? "rgba(16, 185, 129, 0.15)" : "rgba(56, 189, 248, 0.15)",
                                  color: member.role === "editor" ? "#34D399" : "var(--jantt-accent)"
                                }}
                              >
                                {member.role === "editor" ? <Edit3 size={11} aria-hidden="true" /> : <Eye size={11} aria-hidden="true" />} {roleLabel}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          tone="danger"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const action = pendingConfirm.onConfirm;
            setPendingConfirm(null);
            void action();
          }}
        />
      )}
    </>
  );
};
