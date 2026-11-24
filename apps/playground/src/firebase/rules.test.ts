import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import rulesJson from "../../../../database.rules.json";
import { getTrustedAvatarUrl } from "../room-storage";
import {
  toPublicProfile,
  validateRoomMetadata,
  validateUsername,
  type PublicProfile,
  type RoomMember,
  type RoomMemberRole,
  type RoomMetadata,
  type RoomPresence,
  type RoomTeam,
  type UserProfile,
  type UserRoomPointer
} from "./dtos";

/**
 * Security tests for database.rules.json, run against a small in-process model of the
 * Realtime Database rules engine (no emulator needed):
 * - `.read` / `.write` cascade: a grant at a path or any ancestor allows the operation.
 * - `.validate` runs on every non-null node of the written subtree and on its ancestors,
 *   against the merged result of a multi-path update, and never on deletions.
 * - `val()` on a non-leaf returns one shared sentinel, the pessimistic reading of RTDB's
 *   "special sentinel value", so equality checks on whole objects look satisfiable here.
 * - Evaluation errors count as false.
 * Every write below mirrors a real client write path (roomService, authService,
 * presenceService); the emulator procedure in database.rules.test.md covers the rest.
 * The lockstep block at the end keeps the rules, the DTOs and the docs/security.md matrix
 * describing the same contract.
 */

type Json = null | boolean | number | string | { [key: string]: Json };
type RuleValue = string | boolean | string[] | RuleNode;
interface RuleNode {
  [key: string]: RuleValue;
}
interface Auth {
  uid: string;
  token: { firebase: { sign_in_provider: string } };
}
interface QueryParams {
  orderByChild?: string;
  limitToFirst?: number;
}
type RuleFn = (...args: unknown[]) => unknown;

const RULES = (rulesJson as unknown as { rules: RuleNode }).rules;
const SENTINEL = Object.freeze({ rtdbNonLeafSentinel: true });

const isObject = (value: Json): value is { [key: string]: Json } => typeof value === "object" && value !== null;
const splitPath = (path: string): string[] => String(path).split("/").filter(Boolean);

function getAt(root: Json, segments: string[]): Json {
  let current = root;
  for (const segment of segments) {
    if (!isObject(current) || !(segment in current)) return null;
    current = current[segment];
  }
  return current;
}

/** RTDB storage normalization: arrays become index-keyed objects, null and empty values vanish. */
function normalize(value: unknown): Json {
  if (value === undefined) throw new Error("RTDB rejects undefined values");
  if (value === null) return null;
  if (Array.isArray(value)) return normalize(Object.fromEntries(value.map((item, i) => [String(i), item])));
  if (typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalize(item);
      if (normalized !== null) out[key] = normalized;
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return value as Json;
}

function setAt(root: Json, segments: string[], value: Json): Json {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;
  const copy: { [key: string]: Json } = isObject(root) ? { ...root } : {};
  const next = setAt(copy[head] ?? null, rest, value);
  if (next === null) delete copy[head];
  else copy[head] = next;
  return Object.keys(copy).length > 0 ? copy : null;
}

class RuleSnapshot {
  constructor(private readonly root: Json, private readonly segments: string[]) {}
  private get node(): Json {
    return getAt(this.root, this.segments);
  }
  val(): unknown {
    const node = this.node;
    return isObject(node) ? SENTINEL : node;
  }
  child(path: unknown): RuleSnapshot {
    return new RuleSnapshot(this.root, [...this.segments, ...splitPath(String(path))]);
  }
  parent(): RuleSnapshot {
    return new RuleSnapshot(this.root, this.segments.slice(0, -1));
  }
  exists(): boolean {
    return this.node !== null;
  }
  hasChild(path: unknown): boolean {
    return this.child(path).exists();
  }
  hasChildren(keys?: string[]): boolean {
    return isObject(this.node) && (!keys || keys.every((key) => this.hasChild(key)));
  }
  isString(): boolean {
    return typeof this.node === "string";
  }
  isNumber(): boolean {
    return typeof this.node === "number";
  }
  isBoolean(): boolean {
    return typeof this.node === "boolean";
  }
}

const RTDB_STRING_METHODS: Record<string, (this: string, arg: unknown) => boolean> = {
  matches(this: string, regex: unknown) {
    return (regex as RegExp).test(this);
  },
  beginsWith(this: string, prefix: unknown) {
    return this.startsWith(String(prefix));
  },
  contains(this: string, part: unknown) {
    return this.includes(String(part));
  }
};

const compiledRules = new Map<string, RuleFn>();

interface EvalContext {
  auth: Auth | null;
  root: RuleSnapshot;
  data: RuleSnapshot;
  newData: RuleSnapshot;
  query: Record<string, unknown>;
  vars: Record<string, string>;
}

function evaluate(rule: RuleValue, ctx: EvalContext): boolean {
  if (typeof rule === "boolean") return rule;
  if (typeof rule !== "string") throw new Error(`Unexpected rule value: ${JSON.stringify(rule)}`);
  const names = Object.keys(ctx.vars);
  const cacheKey = `${names.join(",")}|${rule}`;
  let fn = compiledRules.get(cacheKey);
  if (!fn) {
    fn = new Function("auth", "root", "data", "newData", "query", "now", ...names, `"use strict"; return (${rule});`) as RuleFn;
    compiledRules.set(cacheKey, fn);
  }
  try {
    return fn(ctx.auth, ctx.root, ctx.data, ctx.newData, ctx.query, Date.now(), ...names.map((n) => ctx.vars[n])) === true;
  } catch {
    return false;
  }
}

interface RuleStep {
  node: RuleNode | undefined;
  vars: Record<string, string>;
}

function ruleChild(step: RuleStep, key: string): RuleStep {
  const node = step.node;
  if (!node) return step;
  if (!key.startsWith("$") && key in node) return { node: node[key] as RuleNode, vars: step.vars };
  const wildcard = Object.keys(node).find((k) => k.startsWith("$"));
  if (wildcard) return { node: node[wildcard] as RuleNode, vars: { ...step.vars, [wildcard]: key } };
  return { node: undefined, vars: step.vars };
}

class RulesDb {
  private state: Json = null;

  /** Writes without rules, for legacy-data fixtures. */
  seed(path: string, value: unknown): void {
    this.state = setAt(this.state, splitPath(path), normalize(value));
  }

  get(path: string): Json {
    return JSON.parse(JSON.stringify(getAt(this.state, splitPath(path))));
  }

  /** `update(ref(rtdb), updates)` semantics: all paths succeed or none is applied. */
  update(auth: Auth | null, updates: Record<string, unknown>): boolean {
    let next = this.state;
    for (const [path, value] of Object.entries(updates)) {
      next = setAt(next, splitPath(path), normalize(value));
    }
    const allowed = Object.keys(updates).every((path) => this.canWrite(auth, splitPath(path), next));
    if (allowed) this.state = next;
    return allowed;
  }

  /** `set()`, `remove()`, `onDisconnect()` and a committed `runTransaction()` at one path. */
  set(auth: Auth | null, path: string, value: unknown): boolean {
    return this.update(auth, { [path]: value });
  }

  read(auth: Auth | null, path: string, query: QueryParams = {}): boolean {
    const segments = splitPath(path);
    const queryCtx = { orderByChild: query.orderByChild ?? null, limitToFirst: query.limitToFirst ?? null };
    let step: RuleStep = { node: RULES, vars: {} };
    for (let depth = 0; ; depth++) {
      const prefix = segments.slice(0, depth);
      const snapshot = new RuleSnapshot(this.state, prefix);
      const rule = step.node?.[".read"];
      if (
        rule !== undefined &&
        evaluate(rule, { auth, root: new RuleSnapshot(this.state, []), data: snapshot, newData: snapshot, query: queryCtx, vars: step.vars })
      ) {
        return true;
      }
      if (depth === segments.length) return false;
      step = ruleChild(step, segments[depth]);
      if (!step.node) return false;
    }
  }

  private canWrite(auth: Auth | null, segments: string[], next: Json): boolean {
    const ctxFor = (prefix: string[], vars: Record<string, string>): EvalContext => ({
      auth,
      root: new RuleSnapshot(this.state, []),
      data: new RuleSnapshot(this.state, prefix),
      newData: new RuleSnapshot(next, prefix),
      query: {},
      vars
    });

    let step: RuleStep = { node: RULES, vars: {} };
    let granted = false;
    for (let depth = 0; depth <= segments.length; depth++) {
      const rule = step.node?.[".write"];
      if (rule !== undefined && evaluate(rule, ctxFor(segments.slice(0, depth), step.vars))) {
        granted = true;
        break;
      }
      if (depth === segments.length) break;
      step = ruleChild(step, segments[depth]);
      if (!step.node) break;
    }
    if (!granted) return false;

    const validateAt = (node: RuleNode | undefined, vars: Record<string, string>, prefix: string[]): boolean => {
      const rule = node?.[".validate"];
      if (rule === undefined || getAt(next, prefix) === null) return true;
      return evaluate(rule, ctxFor(prefix, vars));
    };
    const validateTree = (node: RuleNode | undefined, vars: Record<string, string>, prefix: string[]): boolean => {
      if (!node) return true;
      if (!validateAt(node, vars, prefix)) return false;
      const value = getAt(next, prefix);
      if (!isObject(value)) return true;
      return Object.keys(value).every((key) => {
        const child = ruleChild({ node, vars }, key);
        return validateTree(child.node, child.vars, [...prefix, key]);
      });
    };

    step = { node: RULES, vars: {} };
    for (let depth = 0; depth < segments.length; depth++) {
      if (!validateAt(step.node, step.vars, segments.slice(0, depth))) return false;
      step = ruleChild(step, segments[depth]);
      if (!step.node) return true;
    }
    return validateTree(step.node, step.vars, segments);
  }
}

// ---------------------------------------------------------------------------------------
// Fixtures mirroring the client's write paths
// ---------------------------------------------------------------------------------------

const NOW = "2026-11-16T10:00:00.000Z";
/** The only avatar host the rules accept on records other users read (and the client renders). */
const TRUSTED_AVATAR_URL_PREFIX = "https://avatars.githubusercontent.com/";
const AVATAR = `${TRUSTED_AVATAR_URL_PREFIX}u/1?v=4`;
const ROOM = "room_0a1b2c3d4e";
const PLAN = {
  __schema: "https://jantt.dev/schema/v1.json",
  meta: { title: "Roadmap" },
  tasks: [{ id: "t1", name: "Spec", start: "2026-09-01", end: "2026-09-05" }]
};

interface Persona {
  uid: string;
  username: string;
  auth: Auth;
}

const githubAuth = (uid: string, provider = "github.com"): Auth => ({ uid, token: { firebase: { sign_in_provider: provider } } });
const persona = (username: string): Persona => ({ uid: `uid-${username}`, username, auth: githubAuth(`uid-${username}`) });
const alice = persona("alice"); // room owner
const bob = persona("bob"); // editor
const carol = persona("carol"); // viewer
const dave = persona("dave"); // signed-in outsider
const mallory = persona("mallory"); // signed-in attacker

/** What `users/{uid}` may hold: the profile minus the session-only email. */
type StoredUserProfile = Omit<UserProfile, "email">;

function storedProfile(p: Persona): Required<StoredUserProfile> {
  return {
    uid: p.uid,
    displayName: p.username.toUpperCase(),
    photoURL: AVATAR,
    username: p.username,
    displayUsername: p.username,
    createdAt: NOW,
    updatedAt: NOW,
    githubUsername: p.username,
    githubVerified: true,
    isFollowingCreator: true,
    missingReposCount: 0,
    lastVerifiedAt: NOW
  };
}

function publicProfile(p: Persona): Required<PublicProfile> {
  return { uid: p.uid, username: p.username, displayUsername: p.username, displayName: p.username.toUpperCase(), photoURL: AVATAR, updatedAt: NOW };
}

/** authService.signInWithGitHub (new account), plus the public directory entry. */
function signInWrites(p: Persona, withPublicProfile = true): Record<string, unknown> {
  const profile = storedProfile(p);
  return {
    [`usernames/${p.username}`]: p.uid,
    [`users/${p.uid}`]: profile,
    ...(withPublicProfile ? { [`public_profiles/${p.uid}`]: toPublicProfile(profile) } : {})
  };
}

function roomMeta(overrides: Partial<RoomMetadata> = {}): Required<Omit<RoomMetadata, "secretKey">> {
  return {
    roomId: ROOM,
    title: "Roadmap",
    ownerUid: alice.uid,
    ownerUsername: alice.username,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    contentHash: "00ff00ff00ff00ff",
    taskCount: 1,
    noteCount: 0,
    theme: "noir",
    allowViewerForks: true,
    ...overrides
  };
}

function member(p: Persona, role: RoomMemberRole, overrides: Partial<RoomMember> = {}): RoomMember {
  return { uid: p.uid, username: p.username, displayName: p.username.toUpperCase(), photoURL: AVATAR, role, joinedAt: NOW, ...overrides };
}

const TEAM: Required<RoomTeam> = {
  id: "team-core",
  name: "Core",
  color: "#3B82F6",
  memberUids: [],
  memberUsernames: [],
  role: "viewer",
  addedAt: NOW
};

function teamMember(p: Persona): Required<RoomMember> {
  return { ...member(p, TEAM.role), photoURL: AVATAR, teamId: TEAM.id, teamName: TEAM.name };
}

function pointer(role: RoomMemberRole, overrides: Partial<UserRoomPointer> = {}): Required<UserRoomPointer> {
  return {
    roomId: ROOM,
    title: "Roadmap",
    ownerUid: alice.uid,
    ownerUsername: alice.username,
    role,
    createdAt: NOW,
    updatedAt: NOW,
    taskCount: 1,
    noteCount: 0,
    ...overrides
  } as Required<UserRoomPointer>;
}

/** roomService.createRoom */
function createRoomWrites(owner: Persona = alice, metaOverrides: Partial<RoomMetadata> = {}, roomId = ROOM): Record<string, unknown> {
  return {
    [`rooms/${roomId}/meta`]: roomMeta({ ownerUid: owner.uid, ownerUsername: owner.username, roomId, ...metaOverrides }),
    [`rooms/${roomId}/members/${owner.uid}`]: member(owner, "owner"),
    [`rooms/${roomId}/data`]: PLAN,
    [`user_rooms/${owner.uid}/owned/${roomId}`]: pointer("owner", { roomId, ownerUid: owner.uid, ownerUsername: owner.username })
  };
}

/** roomService.shareRoomWithUser (re-sharing lifts an earlier ban) */
function shareWrites(target: Persona, role: "editor" | "viewer"): Record<string, unknown> {
  return {
    [`rooms/${ROOM}/members/${target.uid}`]: member(target, role),
    [`rooms/${ROOM}/banned/${target.uid}`]: null,
    [`user_rooms/${target.uid}/shared/${ROOM}`]: pointer(role)
  };
}

/** presenceService.trackRoomPresence */
function presence(p: Persona, overrides: Partial<RoomPresence> = {}): Required<RoomPresence> {
  return { uid: p.uid, username: p.username, displayName: p.username, photoURL: AVATAR, inspectedTaskId: "plan-task", status: "online", lastSeen: NOW, joinedAt: NOW, ...overrides };
}

let db: RulesDb;

beforeAll(() => {
  for (const [name, fn] of Object.entries(RTDB_STRING_METHODS)) {
    Object.defineProperty(String.prototype, name, { value: fn, configurable: true, writable: true });
  }
});

afterAll(() => {
  for (const name of Object.keys(RTDB_STRING_METHODS)) {
    delete (String.prototype as unknown as Record<string, unknown>)[name];
  }
});

beforeEach(() => {
  db = new RulesDb();
  for (const p of [alice, bob, carol, dave, mallory]) {
    expect(db.update(p.auth, signInWrites(p))).toBe(true);
  }
  expect(db.update(alice.auth, createRoomWrites())).toBe(true);
  expect(db.update(alice.auth, shareWrites(bob, "editor"))).toBe(true);
  expect(db.update(alice.auth, shareWrites(carol, "viewer"))).toBe(true);
});

// ---------------------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------------------

describe("identity: users, public_profiles, usernames", () => {
  it("accepts the sign-in write (handle claim + whole private profile) and a later public profile", () => {
    const fresh = persona("fresh");
    expect(db.update(fresh.auth, signInWrites(fresh, false))).toBe(true);
    expect(db.set(fresh.auth, `public_profiles/${fresh.uid}`, toPublicProfile(storedProfile(fresh)))).toBe(true);
  });

  it("accepts first-sign-in provisioning written field by field with the public profile", () => {
    const fresh = persona("fresh");
    const { githubVerified: _v, isFollowingCreator: _f, missingReposCount: _m, lastVerifiedAt: _l, ...stored } = storedProfile(fresh);
    const writes: Record<string, unknown> = {
      [`usernames/${fresh.username}`]: fresh.uid,
      [`public_profiles/${fresh.uid}`]: toPublicProfile(stored)
    };
    for (const [key, value] of Object.entries(stored)) writes[`users/${fresh.uid}/${key}`] = value;
    expect(db.update(fresh.auth, writes)).toBe(true);
  });

  it("never stores email or unknown fields on profiles, but lets users delete legacy copies", () => {
    expect(db.set(alice.auth, `users/${alice.uid}/email`, "alice@example.com")).toBe(false);
    expect(db.set(alice.auth, `users/${alice.uid}`, { ...storedProfile(alice), email: "alice@example.com" })).toBe(false);
    expect(db.set(alice.auth, `users/${alice.uid}/isDevBypass`, true)).toBe(false);
    expect(db.set(alice.auth, `users/${alice.uid}/isAdmin`, true)).toBe(false);
    // Profiles written by older builds still carry email and isDevBypass: both can be deleted.
    db.seed(`users/${alice.uid}/email`, "alice@example.com");
    db.seed(`users/${alice.uid}/isDevBypass`, true);
    expect(db.update(alice.auth, { [`users/${alice.uid}/email`]: null, [`users/${alice.uid}/isDevBypass`]: null })).toBe(true);
    expect(db.get(`users/${alice.uid}`)).not.toHaveProperty("email");
    // Writing other fields never re-validates a legacy one that is still stored.
    db.seed(`users/${alice.uid}/email`, "alice@example.com");
    expect(db.update(alice.auth, { [`users/${alice.uid}/githubUsername`]: "Alice", [`users/${alice.uid}/updatedAt`]: NOW })).toBe(true);
    expect(db.set(alice.auth, `public_profiles/${alice.uid}`, toPublicProfile({ ...storedProfile(alice), displayName: "Alice A." }))).toBe(true);
  });

  it("keeps private profiles (email, verification flags) readable by their owner only", () => {
    expect(db.read(alice.auth, `users/${alice.uid}`)).toBe(true);
    expect(db.read(bob.auth, `users/${alice.uid}`)).toBe(false);
    expect(db.read(null, `users/${alice.uid}`)).toBe(false);
    expect(db.read(alice.auth, "users")).toBe(false);
    expect(db.read(null, "usernames")).toBe(false);
    expect(db.read(null, `usernames/${alice.username}`)).toBe(false);
    expect(db.read(bob.auth, `usernames/${alice.username}`)).toBe(true);
  });

  it("allows bounded username search on public profiles only", () => {
    expect(db.read(bob.auth, "public_profiles", { orderByChild: "username", limitToFirst: 8 })).toBe(true);
    expect(db.read(bob.auth, "public_profiles", { orderByChild: "username" })).toBe(false);
    expect(db.read(bob.auth, "public_profiles", { orderByChild: "username", limitToFirst: 500 })).toBe(false);
    expect(db.read(bob.auth, "public_profiles", { orderByChild: "displayName", limitToFirst: 8 })).toBe(false);
    expect(db.read(null, "public_profiles", { orderByChild: "username", limitToFirst: 8 })).toBe(false);
    expect(db.read(bob.auth, `public_profiles/${alice.uid}`)).toBe(true);
    expect(db.read(null, `public_profiles/${alice.uid}`)).toBe(false);
  });

  it("keeps private fields and foreign avatars out of public profiles", () => {
    const leaked = { ...toPublicProfile(storedProfile(mallory)), email: "mallory@example.com" };
    expect(db.set(mallory.auth, `public_profiles/${mallory.uid}`, leaked)).toBe(false);
    expect(db.get(`public_profiles/${alice.uid}`)).not.toHaveProperty("email");
    // An avatar that every searcher's browser would fetch from a host the user controls.
    expect(db.set(mallory.auth, `public_profiles/${mallory.uid}/photoURL`, "https://tracker.example/p.gif")).toBe(false);
    expect(db.set(mallory.auth, `public_profiles/${mallory.uid}/photoURL`, `https://tracker.example/?${TRUSTED_AVATAR_URL_PREFIX}`)).toBe(false);
    expect(db.set(mallory.auth, `public_profiles/${mallory.uid}/photoURL`, `${AVATAR}&s=40`)).toBe(true);
  });

  it("rejects impersonation through profile fields", () => {
    expect(db.set(mallory.auth, `users/${mallory.uid}/username`, alice.username)).toBe(false);
    expect(db.set(mallory.auth, `public_profiles/${mallory.uid}/username`, alice.username)).toBe(false);
    expect(db.set(mallory.auth, `users/${mallory.uid}/uid`, alice.uid)).toBe(false);
    expect(db.set(mallory.auth, `public_profiles/${mallory.uid}/uid`, alice.uid)).toBe(false);
    expect(db.set(mallory.auth, `users/${alice.uid}/displayName`, "Alice")).toBe(false);
  });

  it("accepts the verification-flag update shape and rejects mistyped or bypass flags", () => {
    const flags = { githubVerified: true, isFollowingCreator: true, missingReposCount: 0, lastVerifiedAt: NOW, updatedAt: NOW };
    expect(db.update(alice.auth, Object.fromEntries(Object.entries(flags).map(([k, v]) => [`users/${alice.uid}/${k}`, v])))).toBe(true);
    expect(db.set(alice.auth, `users/${alice.uid}/githubVerified`, "yes")).toBe(false);
    expect(db.update(alice.auth, { [`users/${alice.uid}/isDevBypass`]: false, [`users/${alice.uid}/updatedAt`]: NOW })).toBe(false);
  });

  it("binds handles: no theft, one active handle per account, release only when unused", () => {
    // Theft of a claimed handle.
    expect(db.set(mallory.auth, `usernames/${alice.username}`, mallory.uid)).toBe(false);
    // Squatting a second handle without switching the profile to it.
    expect(db.set(mallory.auth, "usernames/squatted", mallory.uid)).toBe(false);
    // Switching the profile while keeping the old handle claimed.
    expect(
      db.update(mallory.auth, { "usernames/renamed": mallory.uid, [`users/${mallory.uid}/username`]: "renamed" })
    ).toBe(false);
    // Releasing the handle the profile still uses.
    expect(db.set(mallory.auth, `usernames/${mallory.username}`, null)).toBe(false);
    // A proper rename releases the old handle in the same update.
    expect(
      db.update(mallory.auth, {
        "usernames/renamed": mallory.uid,
        [`usernames/${mallory.username}`]: null,
        [`users/${mallory.uid}/username`]: "renamed",
        [`public_profiles/${mallory.uid}/username`]: "renamed"
      })
    ).toBe(true);
    expect(db.get(`usernames/${mallory.username}`)).toBeNull();
  });

  it("keeps one handle per account when the profile username is dropped, and no stale public handle", () => {
    // Dropping the username (or the whole profile) while still holding the handle would let the
    // next claim pass the one-handle check, so the account could squat any number of handles.
    expect(db.set(mallory.auth, `users/${mallory.uid}/username`, null)).toBe(false);
    expect(db.set(mallory.auth, `users/${mallory.uid}`, null)).toBe(false);
    // Releasing a handle the public directory still lists would leave an entry that duplicates
    // the next claimant's profile in search.
    expect(
      db.update(mallory.auth, {
        "usernames/renamed": mallory.uid,
        [`usernames/${mallory.username}`]: null,
        [`users/${mallory.uid}/username`]: "renamed"
      })
    ).toBe(false);
    // Giving the handle up releases it together with every record that shows it.
    expect(
      db.update(mallory.auth, {
        [`usernames/${mallory.username}`]: null,
        [`users/${mallory.uid}/username`]: null,
        [`public_profiles/${mallory.uid}`]: null
      })
    ).toBe(true);
    expect(db.update(mallory.auth, { "usernames/second": mallory.uid, [`users/${mallory.uid}/username`]: "second" })).toBe(true);
    expect(db.set(mallory.auth, "usernames/third", mallory.uid)).toBe(false);
  });

  it("rejects malformed handles", () => {
    const fresh = persona("fresh");
    for (const handle of ["Fresh", "fresh name", "x".repeat(40)]) {
      const writes = { [`usernames/${handle}`]: fresh.uid, [`users/${fresh.uid}`]: { ...storedProfile(fresh), username: handle } };
      expect(db.update(fresh.auth, writes)).toBe(false);
    }
  });

  it("rejects every write from non-GitHub sign-in providers", () => {
    const intruder = persona("intruder");
    expect(db.update(githubAuth(intruder.uid, "password"), signInWrites(intruder))).toBe(false);
    expect(db.update(githubAuth(intruder.uid, "anonymous"), signInWrites(intruder))).toBe(false);
  });
});

describe("default deny", () => {
  it("denies the retired REST room tree (/plans) and every path without a rule", () => {
    for (const auth of [null, alice.auth]) {
      for (const path of ["plans", `plans/${ROOM}`, "rooms", "users", "user_rooms", "config", "junk/x"]) {
        expect(db.read(auth, path), path).toBe(false);
      }
      expect(db.set(auth, `plans/${ROOM}`, { secret: "sec_0123", data: PLAN })).toBe(false);
      expect(db.set(auth, "junk/x", 1)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------------------

describe("rooms: creation, reads, saves", () => {
  it("rejects creating rooms for someone else, with a mismatched roomId, or over an existing room", () => {
    expect(db.update(mallory.auth, createRoomWrites(mallory, { ownerUid: alice.uid }, "room_other"))).toBe(false);
    expect(db.update(alice.auth, createRoomWrites(alice, { roomId: ROOM }, "room_other"))).toBe(false);
    expect(db.update(mallory.auth, createRoomWrites(mallory))).toBe(false);
    expect(db.update(mallory.auth, createRoomWrites(mallory, {}, "room_mallory"))).toBe(true);
  });

  it("never stores an edit key: meta.secretKey can only be deleted, by the owner", () => {
    const writes = createRoomWrites(alice, {}, "room_keyed");
    const meta = { ...roomMeta({ roomId: "room_keyed" }), secretKey: "key_0123456789" };
    expect(db.update(alice.auth, { ...writes, "rooms/room_keyed/meta": meta })).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/meta/secretKey`, "key_0123456789")).toBe(false);
    // Legacy rooms still hold a world-readable key. It grants nothing, and only the owner removes it.
    db.seed(`rooms/${ROOM}/meta/secretKey`, "key_0123456789");
    expect(db.set(bob.auth, `rooms/${ROOM}/meta/secretKey`, null)).toBe(false);
    expect(db.set(dave.auth, `rooms/${ROOM}/members/${dave.uid}`, member(dave, "editor"))).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/meta/secretKey`, null)).toBe(true);
    expect(db.get(`rooms/${ROOM}/meta`)).not.toHaveProperty("secretKey");
  });

  it("lets anyone with the link read the room but never write anonymously", () => {
    expect(db.read(null, `rooms/${ROOM}`)).toBe(true);
    expect(db.read(null, "rooms")).toBe(false);
    expect(db.set(null, `rooms/${ROOM}/data`, PLAN)).toBe(false);
  });

  it("accepts the owner's whole-room transaction with members and presence present", () => {
    expect(db.set(carol.auth, `rooms/${ROOM}/presence/${carol.uid}`, presence(carol))).toBe(true);
    const room = db.get(`rooms/${ROOM}`) as { [key: string]: Json };
    const meta = room.meta as { [key: string]: Json };
    const next = { ...room, meta: { ...meta, revision: 2, contentHash: "1111", updatedAt: NOW }, data: { ...PLAN, meta: { title: "v2" } } };
    expect(db.set(alice.auth, `rooms/${ROOM}`, next)).toBe(true);
  });

  it("lets editors save through the data node and the editable meta leaves only", () => {
    expect(db.set(bob.auth, `rooms/${ROOM}/data`, { ...PLAN, meta: { title: "edited" } })).toBe(true);
    // `increment(1)` reaches the rules as the resolved value: current revision + 1.
    const revision = (db.get(`rooms/${ROOM}/meta/revision`) as number) + 1;
    expect(
      db.update(bob.auth, {
        [`rooms/${ROOM}/meta/revision`]: revision,
        [`rooms/${ROOM}/meta/contentHash`]: "2222",
        [`rooms/${ROOM}/meta/updatedAt`]: NOW,
        [`rooms/${ROOM}/meta/taskCount`]: 1,
        [`rooms/${ROOM}/meta/noteCount`]: 0,
        [`rooms/${ROOM}/meta/title`]: "Renamed"
      })
    ).toBe(true);
    expect(db.set(bob.auth, `rooms/${ROOM}/meta/revision`, 1)).toBe(false);
    // One step per stamp: a jump would pin every client's revision (they keep the maximum seen).
    expect(db.set(bob.auth, `rooms/${ROOM}/meta/revision`, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/meta/ownerUid`, bob.uid)).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/meta/secretKey`, null)).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/meta`, roomMeta({ ownerUid: alice.uid, revision: 9 }))).toBe(false);
    // Editors replace the plan; they cannot delete it (only the owner deletes the whole room).
    expect(db.set(bob.auth, `rooms/${ROOM}/data`, null)).toBe(false);
    expect(db.get(`rooms/${ROOM}/data`)).not.toBeNull();
  });

  it("denies editors the whole-room write that could rewrite roster, teams or bans", () => {
    const room = db.get(`rooms/${ROOM}`) as { [key: string]: Json };
    expect(db.set(bob.auth, `rooms/${ROOM}`, room)).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/members/${bob.uid}/role`, "owner")).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/members/${carol.uid}/role`, "editor")).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/members/${carol.uid}`, null)).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/teams/t1`, { id: "t1", name: "Core", role: "editor", addedAt: NOW })).toBe(false);
    expect(db.set(bob.auth, `rooms/${ROOM}/banned/${carol.uid}`, true)).toBe(false);
  });

  it("denies viewers, outsiders and stray member roles any plan or meta write", () => {
    for (const p of [carol, dave, mallory]) {
      expect(db.set(p.auth, `rooms/${ROOM}/data`, PLAN)).toBe(false);
      expect(db.set(p.auth, `rooms/${ROOM}/meta/revision`, 5)).toBe(false);
    }
    // A legacy member record claiming "owner" grants nothing: only meta.ownerUid owns the room.
    db.seed(`rooms/${ROOM}/members/${mallory.uid}`, member(mallory, "owner"));
    expect(db.set(mallory.auth, `rooms/${ROOM}/data`, PLAN)).toBe(false);
    expect(db.set(mallory.auth, `user_rooms/${dave.uid}/shared/${ROOM}`, pointer("viewer"))).toBe(false);
  });

  it("requires plan data to be an object and rejects unknown room children", () => {
    expect(db.set(alice.auth, `rooms/${ROOM}/data`, "not a plan")).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/junk`, { a: 1 })).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/meta/isAdmin`, true)).toBe(false);
  });

  it("lets only the owner delete the room together with every pointer", () => {
    const deleteWrites = {
      [`rooms/${ROOM}`]: null,
      [`user_rooms/${alice.uid}/owned/${ROOM}`]: null,
      [`user_rooms/${alice.uid}/shared/${ROOM}`]: null,
      [`user_rooms/${bob.uid}/shared/${ROOM}`]: null,
      [`user_rooms/${carol.uid}/shared/${ROOM}`]: null,
      // Stale team uids are cleaned up too (no-op deletes).
      [`user_rooms/user-p-1/shared/${ROOM}`]: null
    };
    expect(db.update(bob.auth, deleteWrites)).toBe(false);
    expect(db.update(alice.auth, deleteWrites)).toBe(true);
    expect(db.get(`rooms/${ROOM}`)).toBeNull();
  });
});

describe("rooms: members, invites and bans", () => {
  it("rejects phantom, forged and mis-labelled member records", () => {
    const phantom = { uid: "user-p-1", username: "teammate", displayName: "Teammate", role: "editor", joinedAt: NOW };
    expect(db.set(alice.auth, `rooms/${ROOM}/members/user-p-1`, phantom)).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/members/${dave.uid}`, member(dave, "viewer", { photoURL: "https://tracker.example/p.gif" }))).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/members/${dave.uid}`, member(dave, "viewer", { uid: alice.uid }))).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/members/${dave.uid}`, member(dave, "viewer", { username: alice.username }))).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/members/${bob.uid}/role`, "owner")).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/members/${dave.uid}/role`, "viewer")).toBe(false);
  });

  it("keeps the owner's own member record", () => {
    expect(db.set(alice.auth, `rooms/${ROOM}/members/${alice.uid}`, null)).toBe(false);
  });

  it("supports updateMemberRole (role leaf or full pointer) and removeMemberFromRoom for the owner", () => {
    expect(
      db.update(alice.auth, {
        [`rooms/${ROOM}/members/${carol.uid}/role`]: "editor",
        [`user_rooms/${carol.uid}/shared/${ROOM}/role`]: "editor"
      })
    ).toBe(true);
    expect(db.get(`rooms/${ROOM}/members/${carol.uid}/role`)).toBe("editor");
    expect(db.set(alice.auth, `user_rooms/${carol.uid}/shared/${ROOM}/role`, "viewer")).toBe(false);
    expect(
      db.update(alice.auth, {
        [`rooms/${ROOM}/members/${carol.uid}/role`]: "viewer",
        [`user_rooms/${carol.uid}/shared/${ROOM}`]: pointer("viewer")
      })
    ).toBe(true);
    expect(
      db.update(alice.auth, { [`rooms/${ROOM}/members/${carol.uid}`]: null, [`user_rooms/${carol.uid}/shared/${ROOM}`]: null })
    ).toBe(true);
  });

  it("allows self-join only as a viewer and self-removal, never self-promotion", () => {
    const join = (role: "editor" | "viewer") => ({
      [`rooms/${ROOM}/members/${dave.uid}`]: member(dave, role),
      [`user_rooms/${dave.uid}/shared/${ROOM}`]: pointer(role)
    });
    expect(db.update(dave.auth, join("editor"))).toBe(false);
    expect(db.update(dave.auth, join("viewer"))).toBe(true);
    expect(db.set(carol.auth, `rooms/${ROOM}/members/${carol.uid}/role`, "editor")).toBe(false);
    expect(db.set(carol.auth, `rooms/${ROOM}/members/${carol.uid}/displayName`, "Room Owner")).toBe(false);
    expect(db.set(carol.auth, `user_rooms/${carol.uid}/shared/${ROOM}/role`, "editor")).toBe(false);
    expect(
      db.update(carol.auth, { [`rooms/${ROOM}/members/${carol.uid}`]: null, [`user_rooms/${carol.uid}/shared/${ROOM}`]: null })
    ).toBe(true);
  });

  it("rejects self-joins to rooms that do not exist", () => {
    expect(db.set(dave.auth, `rooms/room_missing/members/${dave.uid}`, member(dave, "viewer"))).toBe(false);
  });

  it("keeps banned users from rejoining", () => {
    expect(
      db.update(alice.auth, {
        [`rooms/${ROOM}/members/${carol.uid}`]: null,
        [`user_rooms/${carol.uid}/shared/${ROOM}`]: null,
        [`rooms/${ROOM}/banned/${carol.uid}`]: true
      })
    ).toBe(true);
    expect(db.set(carol.auth, `rooms/${ROOM}/members/${carol.uid}`, member(carol, "viewer"))).toBe(false);
    expect(db.set(alice.auth, `rooms/${ROOM}/banned/${carol.uid}`, "yes")).toBe(false);
  });

  it("supports team sharing for real accounts only", () => {
    const team: Required<RoomTeam> = { ...TEAM, memberUids: [dave.uid], memberUsernames: [dave.username] };
    const writes = {
      [`rooms/${ROOM}/teams/${team.id}`]: team,
      [`rooms/${ROOM}/members/${dave.uid}`]: teamMember(dave),
      [`user_rooms/${dave.uid}/shared/${ROOM}`]: pointer("viewer")
    };
    expect(db.update(bob.auth, writes)).toBe(false);
    expect(db.update(alice.auth, { ...writes, [`rooms/${ROOM}/teams/${team.id}`]: { ...team, id: "other" } })).toBe(false);
    expect(db.update(alice.auth, writes)).toBe(true);
    expect(
      db.update(alice.auth, {
        [`rooms/${ROOM}/teams/${team.id}`]: null,
        [`rooms/${ROOM}/members/${dave.uid}`]: null,
        [`user_rooms/${dave.uid}/shared/${ROOM}`]: null
      })
    ).toBe(true);
  });
});

describe("rooms: presence and pointers", () => {
  it("reserves the viewer copy setting for the owner", () => {
    const path = `rooms/${ROOM}/meta/allowViewerForks`;
    expect(db.set(alice.auth, path, false)).toBe(true);
    expect(db.set(carol.auth, path, true)).toBe(false);
    expect(db.set(bob.auth, path, true)).toBe(false);
    expect(db.set(alice.auth, path, "false")).toBe(false);
  });

  it("lets members publish and clear only their own presence", () => {
    expect(db.set(carol.auth, `rooms/${ROOM}/presence/${carol.uid}`, presence(carol))).toBe(true);
    expect(db.set(carol.auth, `rooms/${ROOM}/presence/${carol.uid}`, null)).toBe(true);
    expect(db.set(carol.auth, `rooms/${ROOM}/presence/${bob.uid}`, presence(bob))).toBe(false);
    expect(db.set(carol.auth, `rooms/${ROOM}/presence/${carol.uid}`, presence(carol, { username: alice.username }))).toBe(false);
  });

  it("rejects spoofed presence: owner badges, foreign avatars, non-string timestamps, partial records", () => {
    const path = `rooms/${ROOM}/presence/${carol.uid}`;
    const { photoURL: _photoURL, ...withoutAvatar } = presence(carol);
    expect(db.set(carol.auth, path, withoutAvatar)).toBe(true);
    expect(db.set(carol.auth, path, { ...presence(carol), isOwner: true })).toBe(false);
    expect(db.set(carol.auth, path, presence(carol, { photoURL: "https://tracker.example/p.gif" }))).toBe(false);
    expect(db.set(carol.auth, path, presence(carol, { inspectedTaskId: "x".repeat(257) }))).toBe(false);
    expect(db.set(carol.auth, path, { ...presence(carol), inspectedTaskId: 123 })).toBe(false);
    // A numeric timestamp would break every viewer's presence sort (string comparison).
    expect(db.set(carol.auth, path, { ...presence(carol), joinedAt: Date.now() })).toBe(false);
    expect(db.set(carol.auth, path, { ...presence(carol), lastSeen: Date.now() })).toBe(false);
    expect(db.set(carol.auth, path, { uid: carol.uid, username: carol.username, status: "online" })).toBe(false);
    expect(db.set(carol.auth, `${path}/status`, "away")).toBe(false);
  });

  it("rejects presence from non-members and for rooms that do not exist", () => {
    expect(db.set(dave.auth, `rooms/${ROOM}/presence/${dave.uid}`, presence(dave))).toBe(false);
    expect(db.set(dave.auth, `rooms/room_unused/presence/${dave.uid}`, presence(dave))).toBe(false);
    expect(db.get("rooms/room_unused")).toBeNull();
  });

  it("rejects pointer injection, misdirection and spoofed owner names", () => {
    expect(db.set(alice.auth, `user_rooms/${dave.uid}/shared/${ROOM}`, pointer("viewer"))).toBe(false);
    expect(db.set(mallory.auth, `user_rooms/${mallory.uid}/shared/${ROOM}`, pointer("viewer"))).toBe(false);
    expect(db.set(bob.auth, `user_rooms/${bob.uid}/shared/${ROOM}`, pointer("editor", { roomId: "room_elsewhere" }))).toBe(false);
    expect(db.set(bob.auth, `user_rooms/${bob.uid}/shared/${ROOM}`, pointer("editor", { ownerUsername: "github-support" }))).toBe(false);
    expect(db.set(bob.auth, `user_rooms/${bob.uid}/shared/${ROOM}`, pointer("editor", { title: "Updated" }))).toBe(true);
    expect(db.set(mallory.auth, `user_rooms/${mallory.uid}/owned/${ROOM}`, pointer("owner"))).toBe(false);
  });

  it("keeps each user's room index private", () => {
    expect(db.read(bob.auth, `user_rooms/${bob.uid}`)).toBe(true);
    expect(db.read(alice.auth, `user_rooms/${bob.uid}`)).toBe(false);
  });

  it("keeps legacy records writable by the owner's whole-room transaction", () => {
    // A member whose handle has since been released, a legacy forged uid field and avatar.
    db.seed(`usernames/${bob.username}`, null);
    db.seed(`rooms/${ROOM}/members/${carol.uid}/uid`, alice.uid);
    db.seed(`rooms/${ROOM}/members/${carol.uid}/photoURL`, "https://legacy.example/carol.png");
    const room = db.get(`rooms/${ROOM}`) as { [key: string]: Json };
    const meta = room.meta as { [key: string]: Json };
    expect(db.set(alice.auth, `rooms/${ROOM}`, { ...room, meta: { ...meta, revision: 2 } })).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// DTO validators mirror the rules
// ---------------------------------------------------------------------------------------

describe("DTO contracts", () => {
  it("accepts every GitHub-length handle the rules accept", () => {
    for (const handle of ["a", "ab", "user_abc123", "x".repeat(39)]) {
      expect(validateUsername(handle).valid).toBe(true);
      const p = persona(handle);
      expect(db.update(p.auth, signInWrites(p))).toBe(true);
    }
    expect(validateUsername("x".repeat(40)).valid).toBe(false);
    expect(validateUsername("@@@").valid).toBe(false);
  });

  it("projects public profiles without private fields or undefined values", () => {
    const profile: UserProfile = { ...storedProfile(alice), email: "alice@example.com", photoURL: undefined };
    const projected = toPublicProfile(profile);
    expect(projected).toEqual({ uid: alice.uid, username: "alice", displayName: "ALICE", displayUsername: "alice", updatedAt: NOW });
    expect(Object.values(projected)).not.toContain(undefined);
  });

  it("validates metadata revisions like the rules", () => {
    expect(validateRoomMetadata(roomMeta()).valid).toBe(true);
    expect(validateRoomMetadata(roomMeta({ revision: 1.5 })).valid).toBe(false);
    expect(validateRoomMetadata(roomMeta({ title: "x".repeat(201) })).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// Lockstep: rules <-> DTOs <-> docs/security.md
// ---------------------------------------------------------------------------------------

/** Rule paths are written doc-style: `{name}` stands for the node's `$wildcard`. */
function ruleNodeAt(path: string): RuleNode {
  let node = RULES;
  for (const segment of splitPath(path)) {
    const key = segment.startsWith("{") ? Object.keys(node).find((k) => k.startsWith("$")) : segment;
    const next = key === undefined ? undefined : node[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error(`No rule node at ${path}`);
    node = next;
  }
  return node;
}

/** Writable fields of a fixed-shape node; delete-only legacy fields carry `.validate: false`. */
function ruleFields(path: string): string[] {
  const node = ruleNodeAt(path);
  return Object.keys(node)
    .filter((key) => !key.startsWith(".") && !key.startsWith("$") && (node[key] as RuleNode)[".validate"] !== false)
    .sort();
}

/** Every rule node that grants `.read` or `.write`, as a doc-style path pattern. */
function accessRulePaths(node: RuleNode = RULES, prefix: string[] = []): { path: string; isLeaf: boolean }[] {
  const children = Object.keys(node).filter((key) => !key.startsWith("."));
  const own = ".read" in node || ".write" in node ? [{ path: prefix.join("/"), isLeaf: children.length === 0 }] : [];
  return own.concat(
    children.flatMap((key) => accessRulePaths(node[key] as RuleNode, [...prefix, key.startsWith("$") ? "{*}" : key]))
  );
}

/** Paths in the first column of the rules matrix (section 7) of docs/security.md. */
function documentedRulePaths(): string[] {
  const doc = readFileSync(new URL("../../../../docs/security.md", import.meta.url), "utf8");
  const section = doc.split(/^### /m).find((part) => part.startsWith("7. "));
  if (!section) throw new Error("docs/security.md has no section 7");
  return [...section.matchAll(/^\| `\/([^`]+)` \|/gm)].map((match) => match[1].replace(/\{[^}]+\}/g, "{*}"));
}

describe("lockstep", () => {
  it("rules accept exactly the DTO fields of every fixed-shape record", () => {
    const shapes: [string, object][] = [
      ["users/{uid}", storedProfile(alice)],
      ["public_profiles/{uid}", publicProfile(alice)],
      ["user_rooms/{uid}/owned/{roomId}", pointer("owner")],
      ["user_rooms/{uid}/shared/{roomId}", pointer("viewer")],
      ["rooms/{roomId}/meta", roomMeta()],
      ["rooms/{roomId}/members/{uid}", teamMember(dave)],
      ["rooms/{roomId}/teams/{teamId}", TEAM],
      ["rooms/{roomId}/presence/{uid}", presence(carol)]
    ];
    for (const [path, dto] of shapes) {
      expect(ruleFields(path), path).toEqual(Object.keys(dto).sort());
      expect(ruleNodeAt(path).$other, path).toEqual({ ".validate": false });
    }
  });

  it("rules and the client's avatar filter accept the same avatar host on records other users read", () => {
    for (const path of ["public_profiles/{uid}", "rooms/{roomId}/members/{uid}", "rooms/{roomId}/presence/{uid}"]) {
      expect(String(ruleNodeAt(`${path}/photoURL`)[".validate"]), path).toContain(`beginsWith('${TRUSTED_AVATAR_URL_PREFIX}')`);
    }
    // The client strips any avatar the rules would reject before writing (members, presence, public profiles).
    expect(getTrustedAvatarUrl(AVATAR)).toBe(AVATAR);
    for (const url of ["http://avatars.githubusercontent.com/u/1", "https://avatars.githubusercontent.com.evil.example/u/1", "https://tracker.example/p.gif"]) {
      expect(getTrustedAvatarUrl(url), url).toBeNull();
      expect(db.set(mallory.auth, `public_profiles/${mallory.uid}/photoURL`, url), url).toBe(false);
    }
  });

  it("the docs/security.md matrix lists exactly the rule paths", () => {
    const documented = documentedRulePaths();
    expect(documented.length).toBeGreaterThan(0);
    expect(new Set(documented).size).toBe(documented.length);
    for (const path of documented) expect(() => ruleNodeAt(path), path).not.toThrow();
    const known = new Set(documented);
    const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
    // A leaf rule (e.g. an editor-writable meta field) is described in its parent's row.
    const undocumented = accessRulePaths()
      .filter(({ path, isLeaf }) => !known.has(path) && !(isLeaf && known.has(parentOf(path))))
      .map(({ path }) => path);
    expect(undocumented).toEqual([]);
  });
});
