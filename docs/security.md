# Security Model & Threat Assessment

This document describes the protections Jantt actually implements, where each one lives, and the risks it accepts. If the code and this document disagree, the code is wrong or this document is out of date: both are bugs worth reporting (see [SECURITY.md](../SECURITY.md)).

---

## Core Security Architecture

### 1. Declarative Data Sandbox (No Script Execution)
Jantt treats every plan strictly as declarative JSON state.
- No package calls `eval()` or the `Function()` constructor.
- Plans carry no scripts, templates or event handlers, and nothing in a plan is executed.
- Custom field payloads (`fields`) are opaque key-value data.

### 2. DOM Output
Plans are shared between users (room links, `#data=` links, file imports), so every plan string must be treated as hostile when it reaches the DOM. All rendering code must follow three rules:
- **Text**: core renderers that build markup strings pass every interpolated plan value through `escapeHtml()` (`packages/core/src/utils.ts`), which escapes `& < > " '`. Prefer `textContent` and DOM APIs over markup strings.
- **Colors**: plan colors (categories, tasks, people, teams) go through `sanitizeCssColor()` (`packages/core/src/layout.ts`) before they reach a `style`. It accepts only hex colors, CSS color functions (`rgb()`, `hsl()`, `oklch()`, ...), `var(--token)` and named colors, so `url(...)` beacons, quotes and markup break-outs fall back to a default color.
- **Images**: the playground renders room member and presence avatars only when they are served by GitHub (`https://avatars.githubusercontent.com/`), and the database rules accept no other avatar on members, presence or public profiles. An arbitrary image URL would reveal the IP address of everyone who opens the roster.

The playground UI is React, which escapes text by default; it does not use `dangerouslySetInnerHTML`. A value that reaches the DOM without one of the protections above is a vulnerability.

As defense in depth, production builds run under a Content-Security-Policy (installed by `apps/playground/src/main.tsx` on GitHub Pages and sent by `apps/playground/public/_headers` elsewhere) that blocks inline scripts, inline event handlers and `javascript:` URLs, so an HTML-injection bug does not become script execution. It still allows images from any https host, so it does not replace the avatar rule.

### 3. Supply Chain Security (Minimal Core Runtime Dependencies)
`@jantt/core` has a single small runtime dependency, `fflate` (compression for share links). This limits:
- Malicious package takeovers in transitive dependency trees.
- Prototype pollution from third-party object utilities.
- Version drift vulnerabilities.

### 4. Input Validation & Denial-of-Service Protection
- **Dependency cycles**: the scheduler resolves dependencies in one pass in topological order. Links inside a cycle are ignored with a diagnostic, so a cyclic plan cannot make scheduling loop.
- **Dates**: `validate()` checks task, meta and calendar dates as real calendar dates in strict `YYYY-MM-DD` form, so malformed dates are reported instead of turning into `NaN` date math.
- **Timeline span**: the rendered timeline is capped at about ten years, so an absurd or hostile date range cannot freeze the tab with millions of header and grid cells.

---

## Cloud Collaboration & Identity Security

Jantt Cloud stores rooms and profiles in a Firebase Realtime Database. **The database rules in [`database.rules.json`](../database.rules.json) are the only server-side enforcement layer.** Every client-side check (the role check before a save, the read-only editor mode, the GitHub verification gate) is a UX convenience that a modified client can skip.

### 5. Plan JSON Sanitization (No Internal IDs in Plan Documents)
Plan documents (exports, share links and the `data` of a room) must not carry database identities or credentials:
- **Identity key purge**: `sanitizePlanForJson()` (`packages/core/src/share-coder.ts`) removes the exact keys in `INTERNAL_IDENTITY_KEYS` (`uid`, `ownerUid`, `firebaseUid`, `secret`, `secretKey`, `authId`, `authToken`, `accessToken`, `clientUid`, `peerId`) from the plan root, `meta`, `meta.sync` and every task, note, person, team and document record. It does not recurse further: values nested deeper, such as a task's custom `fields`, belong to the user and are kept as written.
- **Public identity via canonical mentions**: users appear in plans only as `@username` mentions. The `updatedBy`/`clientId` audit fields of tasks, notes and `meta.sync`, and people's `username`, are normalized to mention form.

This is a client-side transform for plan documents. It does not hide the room roster or presence, which list member uids and handles to anyone who can open the room (see section 7).

### 6. GitHub-Only Authentication Model
- **One provider**: the app signs in with GitHub only, and the rules reject every write made with a token from any other provider (`auth.token.firebase.sign_in_provider === 'github.com'`), so enabling another provider in the console does not open write access.
- **Minimal scope**: only `read:user` is requested.
- **No email in the database**: the account email stays in Firebase Auth. Profiles reject an `email` field; copies stored by older builds can only be deleted, and the client deletes them.
- **Handle provisioning**: on first sign-in the normalized GitHub login is claimed in `/usernames/{username}` when it is valid and free; otherwise the user picks a handle during onboarding. The rules cannot see the GitHub login itself, so a handle is bound to an account, not proven to be that account's GitHub login.
- **Verification flags are advisory**: `githubVerified`, `isFollowingCreator` and the other gate flags live in the private `/users/{uid}` profile. The client writes them and only their owner can read them, so no rule and no other user relies on them.

### 7. Realtime Database Rules Matrix (`database.rules.json`)
"Signed in" below means a GitHub-provider Firebase token. Paths not listed (including the retired `/plans` REST tree, the `/rooms` and `/users` lists, and any unknown child of a room) deny all reads and writes. "No unknown fields" means the node rejects every field that is not listed in its DTO (`apps/playground/src/firebase/dtos`). `rules.test.ts` checks that this table lists exactly the paths that have rules.

| Path | Read | Write | Validation / Invariant |
|---|---|---|---|
| `/users/{uid}` | The user | The user; `username` (or the whole profile) can be dropped only while releasing the handle it names | `uid` equals the key; `username` is the handle the user holds in `/usernames`; display names, https `photoURL`, GitHub login, advisory verification flags and timestamps are typed and length-capped; no `email` and no unknown fields. |
| `/public_profiles` | Signed in, only as `orderByChild('username')` with `limitToFirst <= 20` | – | Indexed on `username`, so teammate search cannot dump the directory. |
| `/public_profiles/{uid}` | Signed in | The user | `uid`, `username` (claimed by the user), `displayUsername`, `displayName`, `photoURL` (GitHub avatar host only), `updatedAt`; no unknown fields, so no email or verification state. |
| `/usernames/{username}` | Signed in, one key at a time | Claim: a free key, value = own uid, the profile switches to it and the previous handle is released in the same update. Release: own key that neither the profile nor the public profile still uses. | Key matches `^[a-z0-9_-]{1,39}$`; one active handle per account. |
| `/user_rooms/{uid}` | The user | – | Holds only `owned` and `shared`. |
| `/user_rooms/{uid}/owned/{roomId}` | The user | The user | `role` is `owner` and the room's `meta.ownerUid` is the user; `roomId` and `ownerUsername` match the room; no unknown fields. |
| `/user_rooms/{uid}/shared/{roomId}` | The user | The user, or the room owner | `role` (`editor`/`viewer`) equals the user's member role in the same write, so pointers exist only for members; `roomId`, `ownerUid`, `ownerUsername` match the room; no unknown fields. |
| `/rooms/{roomId}` | Anyone with the room id | Create: a signed-in user naming themself `meta.ownerUid` of an unused id. Replace or delete: the owner. | `meta` must exist; the owner's member record cannot be removed; unknown children are rejected. |
| `/rooms/{roomId}/meta` | Anyone with the room id | The owner. Editors: only `revision`, `contentHash`, `updatedAt`, `taskCount`, `noteCount`, `title`. | `roomId` equals the key; `ownerUid` is immutable; `revision` advances by at most one per write (`increment(1)`); `ownerUsername` is a handle held by the owner; the legacy `secretKey` can only be deleted; no unknown fields. |
| `/rooms/{roomId}/members/{uid}` | Anyone with the room id | The owner. The user: join as `viewer` (unless banned) and leave. | `uid` equals the key; `username` is the handle held by that uid (no phantom or forged members); role `owner` only for `meta.ownerUid`; new `photoURL` values on the GitHub avatar host only; no unknown fields. |
| `/rooms/{roomId}/teams/{teamId}` | Anyone with the room id | The owner | `id` equals the key; `role` is `editor` or `viewer`; typed, length-capped fields; no unknown fields. |
| `/rooms/{roomId}/presence/{uid}` | Anyone with the room id | The member themself (removal is always allowed), and the owner | A complete record: `uid` equals the key, `username` is held by the user, `displayName`, `status` `online`, string `joinedAt` and `lastSeen`, optional `photoURL` on the GitHub avatar host; no unknown fields, so there is no owner badge (it comes from `meta.ownerUid`). |
| `/rooms/{roomId}/banned/{uid}` | Anyone with the room id | The owner | Value `true`; banned users cannot self-join again. |
| `/rooms/{roomId}/data` | Anyone with the room id | The owner; editors may replace it but not delete it | Must be an object. The plan schema is validated by the client; the rules cannot bound subtree size. |

**Write paths the rules are built for.** Owners create rooms with one multi-path update (meta, own member record, data, owned pointer). Editors save with a transaction on `rooms/{id}/data` followed by an update of the editable meta leaves; no one but the owner writes the room node as a whole. Members are added by the owner (with the matching shared pointer) or join themselves as viewers. Removing a member as owner also writes `banned/{uid}`. Members publish their own presence with `set()` and remove it on disconnect.

**Edit access comes only from the owner.** There are no edit links or edit keys: the owner makes someone an editor by sharing the room with their username (or a team), and a self-join is always a viewer join. Rooms created by older builds may still hold a world-readable `meta.secretKey`; it grants nothing, no one can write a new one, and the owner can delete it.

**Accepted risks.**
- *Rooms are readable by link.* Anyone who has a room id can read the plan, roster, teams, bans and presence. Ids are random and `/rooms` cannot be listed, but a room link is a read capability: share it accordingly.
- *Editors are trusted with the plan.* An editor can rewrite or empty the plan data, rename the room and stamp the meta leaves, but cannot delete the data or change the roster, teams, bans or ownership.
- *Identity bindings are checked at write time.* A record written before a handle was renamed keeps the old handle, and legacy member avatars stay until the record is rewritten (the client renders only GitHub-hosted avatars).

### 8. Tamper-Resistant Role Parameters & Read-Only Guard
- **No client-side privilege escalation**: URL query parameters and the `#key=` fragment never grant access. The client derives the effective role from the room record exactly as the rules do: the owner is `meta.ownerUid`, editors hold a member record with role `editor`, and any other member is a viewer.
- **Read-only mode (`isReadOnly`)**: in viewer mode, mutation hooks (task dragging, resizing, dependency linking, task creation/deletion, note editing, auto-save) are disabled. This is a UX guard; the rules reject the writes regardless.
- **Fork instead of edit (`ReadOnlyForkModal`)**: when a viewer tries to edit a shared room, they are offered two non-destructive paths:
  1. **Make a local copy**: clones the current plan into private browser storage (`localStorage`), free to edit without touching the room.
  2. **Sign in**: authenticates with GitHub so the room owner can grant editor access.

### 9. Testing and Deploying the Rules
`apps/playground/src/firebase/rules.test.ts` runs every client write path and the known attack writes against a model of the rules engine. It also checks, in lockstep, that the rules accept exactly the DTO fields of every fixed-shape record, that shared records accept only the avatar host the client renders (`getTrustedAvatarUrl`), and that the matrix in section 7 lists exactly the rule paths. [`database.rules.test.md`](../database.rules.test.md) describes how to run it, the emulator smoke test and the deployment steps. Any change to `database.rules.json` must update this matrix, the DTOs in `apps/playground/src/firebase/dtos` and the tests together.
