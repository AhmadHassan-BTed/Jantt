# @jantt/yjs

Official real-time multiplayer CRDT binding for the **Jantt** JSON Gantt chart engine using [Yjs](https://yjs.dev/).

Connect Jantt charts to any Yjs provider (**y-webrtc**, **y-websocket**, **Matrix**, **Supabase**, **Liveblocks**) for zero-latency, conflict-free collaborative project scheduling.

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

// 1. Create a shared Y.Doc
const doc = new Y.Doc();
const provider = new WebsocketProvider("wss://demos.yjs.dev", "my-jantt-room", doc);

// 2. Bind Jantt to the Y.Doc
const binding = bindJanttToYDoc(doc, {
  initialPlan: myInitialPlan,
  onPlanChange: (updatedPlan) => {
    // Re-render or update chart when peers make changes
    chartController.update(updatedPlan);
  }
});

// 3. Mount Jantt chart
const chartController = renderJantt(containerElement, binding.getPlan(), {
  onCommit: (newPlan) => {
    // Broadcast local edits to all peers via Yjs CRDT
    binding.updatePlan(newPlan);
  }
});
```

## Features

- **Granular delta updates**: Mutating task `t1`'s progress updates only `t1.progress` in the CRDT rather than serializing the whole plan.
- **Tombstone reconciliation**: Soft-deleted tasks preserve tombstones so concurrent updates never resurrect deleted tasks.
- **Provider agnostic**: Works seamlessly with `y-webrtc`, `y-websocket`, `y-indexeddb`, and custom synchronization protocols.

## License

MIT © Ahmad Hassan
