# Security Model & Threat Assessment

Jantt is designed with a defense-in-depth security model to ensure safe parsing, rendering, and manipulation of timeline data across browser and server environments.

---

## Core Security Architecture

### 1. Declarative Data Sandbox (Zero Script Execution)
Jantt treats all inputs strictly as declarative JSON state.
- No `eval()` or `Function()` constructor invocations exist in any package.
- No script tags or executable event handlers are parsed or executed.
- Custom field payloads (`fields`) are treated as opaque key-value data.

### 2. DOM Sanitization
All user-controlled strings (task titles, notes, category names, custom field values) pass through standard HTML escaping before DOM insertion:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

### 3. Supply Chain Security (Zero Core Runtime Dependencies)
`@jantt/core` has **0 runtime dependencies**. This eliminates:
- Malicious package takeovers in transitive dependency trees.
- Prototype pollution from third-party object utilities.
- Version drift vulnerabilities.

### 4. Input Validation & Denial-of-Service (DoS) Protection
- **Cyclic Graph Protection**: Cyclic dependencies (`A -> B -> A`) are detected in constant memory and prevented from locking the iterative relaxation loop with `MAX_PASSES` caps.
- **Date Range Bounds**: Validates date formats against strict ISO-8601 regex and calendar logic to prevent `NaN` date math overflow.
- **Memory Footprint**: Pure virtual layout algorithms maintain $O(N)$ space complexity.

---

## Cloud Collaboration & Identity Security

### 5. Plan JSON Sanitization & Zero Internal Database ID Exposure
To guarantee that internal database state and infrastructure credentials never leak into exported or synchronized documents:
- **Strict Disallowed Key Purge**: `sanitizePlanForJson()` recursively scrubs internal keys: `uid`, `ownerUid`, `firebaseUid`, `secretKey`, `authId`, `authToken`, `accessToken`, `clientUid`, and `peerId`.
- **Public Identity via Canonical Mentions**: The only user identity representation permitted in the plan JSON document is canonical `@username` mentions.
- **Single Source of Truth**: All task assignments for registered users reference `@username`.
- **Audit Field Sanitization**: Reconciler metadata (`clientId`, `updatedBy`) is strictly normalized to `@username` mentions instead of database UIDs.

### 6. GitHub-Only Authentication Model
- **Zero Generic Provider Sprawl**: Google, email/password, and third-party social sign-ins are removed. Only verified GitHub OAuth 2.0 is permitted.
- **Minimal Required Scopes**: Requests only `read:user` (profile), `user:follow` (creator verification), and `public_repo` (stargazer check).
- **Auto-Identity Provisioning**: Automatically claims the normalized GitHub handle in `/usernames/{username}` without asking the user to manually type an arbitrary username.

### 7. Realtime Database Security Rules Matrix (`database.rules.json`)
The Firebase Realtime Database is governed by strict authorization and validation rules:

| Path | Read Policy | Write Policy | Validation / Invariant |
|---|---|---|---|
| `/users/{uid}` | `auth != null` | `auth.uid === $uid` | User can only modify their own profile. Indexed on `username` (`.indexOn: ["username"]`) for fast prefix search. |
| `/usernames/{username}` | `auth != null` | `newData.val() === auth.uid && (!data.exists() \|\| data.val() === auth.uid)` | First-come handle claim. Users cannot overwrite or steal existing claimed usernames. |
| `/user_rooms/{uid}/owned` | `auth.uid === $uid` | `auth.uid === $uid` | Only the owner can view or mutate their created room index. |
| `/user_rooms/{uid}/shared` | `auth.uid === $uid` | `auth != null` | Collaborator or room owner can update shared pointers during share, join, or leave. |
| `/rooms/{roomId}/meta` | `auth != null` | Room Owner or Member with role `editor` | Atomic revision tracking & content hashing (`contentHash`). |
| `/rooms/{roomId}/members` | Room Owner or Member | Room Owner or Self (on Join/Leave) | Members can join via room invite link or leave; owner manages roles (`editor` vs `viewer`). |
| `/rooms/{roomId}/data` | Room Owner or Member | Room Owner or Member with role `editor` | Full ACID concurrency control via `runTransaction` with 3-way CRDT reconciliation. |

