# Testing the Realtime Database Rules

`database.rules.json` is the only server-side protection of Jantt Cloud data, so every rules change is tested twice: automatically against a model of the rules engine, and manually against the Firebase emulator before deploying. The permission matrix itself lives in [docs/security.md](docs/security.md#7-realtime-database-rules-matrix-databaserulesjson).

## 1. Automated suite

```bash
cd apps/playground
npx vitest run src/firebase/rules.test.ts   # or: npm test --workspace=@jantt/playground
```

`apps/playground/src/firebase/rules.test.ts` loads `database.rules.json` and evaluates the rules in-process:

- `.read` / `.write` cascade: a grant at a path or any ancestor allows the operation.
- `.validate` runs on every non-null node of the written subtree and on its ancestors, against the merged result of a multi-path update, and never on deletions.
- `val()` on a non-leaf node returns one shared sentinel, so a rule that compares whole objects looks satisfiable. This is the pessimistic case and makes such rules fail the escalation tests.
- Evaluation errors count as false.

The fixtures mirror the client's write paths (`roomService`, `authService`, `presenceService`) and are typed with the DTOs. Several of them use `Required<...>` DTO types, so adding a DTO field fails compilation until the test, and therefore the rules, cover it.

The model does not reproduce the real engine exactly: the RTDB regex dialect, `.indexOn`, server values such as `increment()` and query semantics are approximated. Run the emulator check below for any change that touches those.

## 2. Emulator smoke test

Requires Java 11+ and `firebase-tools` (`npx firebase-tools@latest`). The ports are fixed in `firebase.json`, and the app connects to them when `VITE_USE_FIREBASE_EMULATOR=true`.

```bash
# --project must match VITE_FIREBASE_PROJECT_ID (default: jantt-cloud); emulators never touch the real project
npx firebase-tools emulators:start --only auth,database --project jantt-cloud
# in a second shell
VITE_USE_FIREBASE_EMULATOR=true npm run dev
```

With two browser profiles (owner and collaborator) check:

1. **Sign in** creates `users/{uid}`, `usernames/{handle}` and `public_profiles/{uid}`. Signed out, `users/{uid}.json` is unreadable.
2. **Teammate search** finds the other account by handle and shows no email.
3. **Create room**, then **share** with the collaborator as editor. The collaborator's save updates `data` and the meta revision, and the collaborator cannot change the member list.
4. **Change the role to viewer**: the collaborator's saves are rejected and the UI is read-only.
5. **Open the room link** with a third, signed-in account: it joins as viewer, and its presence avatar appears.
6. **Remove the member**: they cannot rejoin through the link (`banned/{uid}`).
7. **Delete the room**: the room and every member's shared pointer disappear.

The Emulator UI (http://127.0.0.1:4000) shows each rejected write with the rule that denied it.

## 3. Deploying

```bash
npx firebase-tools deploy --only database --project <project-id>
```

Deploy rules together with the client release that depends on them. A rules change must update, in the same commit, the DTOs in `apps/playground/src/firebase/dtos`, this suite, and the matrix in `docs/security.md`.
