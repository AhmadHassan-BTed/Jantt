# @jantt/yjs

Official real-time multiplayer CRDT binding for the **Jantt** JSON Gantt chart engine using [Yjs](https://yjs.dev/).

Connect Jantt charts to any Yjs provider (**y-webrtc**, **y-websocket**, **y-indexeddb**, **Liveblocks**, **Supabase**, ...) for conflict-free collaborative project scheduling.

## Installation

```bash
npm install @jantt/yjs yjs @jantt/core
```

## Usage

```typescript
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { bindJanttToYDoc } from "@jantt/yjs";
import { renderJantt } from "@jantt/core";
import "@jantt/core/theme.css";

const doc = new Y.Doc();
const provider = new WebsocketProvider("wss://demos.yjs.dev", "my-jantt-room", doc);

// 1. Bind Jantt to the Y.Doc. Remote edits arrive through onPlanChange.
const binding = bindJanttToYDoc(doc, {
  onPlanChange: (updatedPlan) => chart.update(updatedPlan)
});

// 2. Mount the chart and broadcast local commits.
const chart = renderJantt(containerElement, binding.getPlan(), {
  onCommit: (newPlan) => binding.updatePlan(newPlan)
});

// 3. Seed the room only after the provider has synced, so you never overwrite
//    a plan other users already edited.
provider.once("synced", () => {
  if (binding.seedIfEmpty(myInitialPlan)) chart.update(binding.getPlan());
});
```

`initialPlan` (seed at bind time) is still supported, but only use it for docs that are already
synced, for example a local-only doc or after `y-indexeddb`'s `whenSynced`. Seeding before a
network provider syncs races with the room's existing state.

## How edits merge

- **Field-level merging**: each task is stored as a map of fields. Two users editing different
  fields of the same task both keep their edits; edits to the same field resolve last-writer-wins.
- **Three-way commits**: `updatePlan` compares the incoming plan with the last plan the binding
  exchanged with your app (`getPlan`, `onPlanChange` or the previous `updatePlan`) and writes only
  what changed. Tasks a peer created after that snapshot are never deleted, and unchanged fields
  never overwrite a peer's newer value. Apply `onPlanChange` plans to your chart before
  committing further edits.
- **Whole plan synced**: meta, categories, tasks, task order, people, teams, calendars, notes,
  documents, `$schema` and custom top-level keys all reach peers. Removing a key removes it for
  everyone.
- **Tombstones**: deleted tasks keep a tombstone, so a peer's stale copy cannot resurrect them.
  Re-adding the same id (for example through your own undo) restores the task. Call
  `pruneTombstones(maxAgeMs)` to drop old tombstones.
- **Sanitized remote data**: entries that are not task maps, prototype-polluting keys and
  category colors containing markup characters are dropped before they reach your app.

## API

### `bindJanttToYDoc(doc, options?)`

| Option | Description |
|---|---|
| `onPlanChange(plan)` | Called once per remote transaction that touched Jantt data. Local writes and unrelated shared types in the same doc do not trigger it. |
| `initialPlan` | Plan seeded at bind time when the doc holds no Jantt data (see the warning above). |

Returns:

| Method | Description |
|---|---|
| `getPlan()` | Current plan from the doc. |
| `updatePlan(plan)` | Commits a full plan using a three-way diff. |
| `updateTask(id, patch)` | Writes individual fields; `undefined` values delete the field. Unknown ids create a task. |
| `deleteTask(id)` / `restoreTask(id)` | Tombstones a task / clears its tombstone. |
| `seedIfEmpty(plan)` | Seeds the doc when it holds no Jantt data. Returns `true` when it seeded. |
| `pruneTombstones(maxAgeMs)` | Permanently removes tombstones older than `maxAgeMs`. Returns the count. |
| `destroy()` | Stops listening to the doc. |

### `bindJanttAwareness(awareness, { user, onPeersChange?, cursorThrottleMs? })`

Shares selection, cursor and drag state. `getPeers()` and `onPeersChange` cover remote users only
(the local client is excluded), updates that change nothing are not broadcast, and `setCursor`
is throttled to one broadcast per `cursorThrottleMs` (default 50 ms) carrying the latest position.

### `createJanttUndoManager(doc, { trackedOrigins? })`

Undo/redo of local changes across every Jantt shared type.

## License

MIT © Ahmad Hassan
