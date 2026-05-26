# 04 — Remaining Issues & Concrete Fix Directions

The refactor surveyed in `03-refactor-audit.md` eliminated the
destructive feedback loops in the original architecture. This document
records the issues that remain, ordered by how likely each is to
reproduce a subset of the original user symptoms.

For every issue we list: where it lives, the timing that triggers it,
what the user sees, and a minimal-blast-radius fix direction. The fixes
are **not** included as code changes here — they are written so a
follow-up implementer can pick the right one for their constraints.

---

## 1. The initial-mount wipe (highest priority)

**Files**
- `apps/web/src/features/workflow-canvas/sync/yjs/yjs-sync.ts:36-102`
- `apps/web/src/features/workflow-canvas/store/slices/hydration-slice.ts:16-28`
- `apps/web/src/features/workflow-canvas/components/WorkflowCanvasPage.tsx:55-69`

### What happens

```
T0   React mounts WorkflowCanvasPage
T1   workflowQuery resolves with the persisted nodes/edges
T2   useEffect: hydrateFromServer({nodes, edges, ...})
       → store.nodes / store.edges are now populated
       → hydratedWorkflowId = workflowId
T3   React re-renders
T4   useWorkflowYjsSync effect runs (gated on hydratedWorkflowId === workflowId)
       → yRef.current already points to a freshly created, EMPTY ydoc
       → registerWorkflowYjsRuntime(workflowId, y, getCanvasSnapshot())
       → createWorkflowYjsProvider(...)
       → projectYjsToStore(false)        ← runs synchronously here
T5   projectYjsToStore exports the empty ydoc → snapshot = {nodes:[], edges:[]}
       → workflowYjsSnapshotMatches({},{REST nodes,REST edges}) === false
       → applyRemoteSnapshot({edges:[], nodes:[], source:'yjs', workflowId})
       → STORE IS NOW EMPTY
T6   WebSocket sync handshake completes (50–500 ms typically, up to seconds on bad networks)
T7   provider 'sync' or ydoc 'update' fires with full server state
       → projectYjsToStore restores the store
```

Between T5 and T7 the canvas renders as empty. This is the most likely
remaining cause of the user-reported "B updates and A's canvas
disappears, refreshing brings it back" symptom.

### Why the existing guards don't help

`projectYjsToStore` has only one short-circuit:

```ts
if (
  current.workflowId === workflowId &&
  workflowYjsSnapshotMatches(snapshot, { edges: current.edges, nodes: current.nodes })
) {
  return
}
```

When the store has REST data and the ydoc is empty, this comparison is
necessarily `false`, so the wipe runs.

### Fix directions (pick one)

**Option A — Guard against empty-overwrites in `projectYjsToStore`.**
The smallest possible change. In `yjs-sync.ts`:

```ts
const projectYjsToStore = (markDirty: boolean) => {
  const snapshot = exportWorkflowYjsSnapshot(y)
  updateWorkflowYjsRuntimeSnapshot(workflowId, snapshot)
  const current = getCanvasSnapshot()
  if (current.workflowId !== workflowId) return
  if (workflowYjsSnapshotMatches(snapshot, { edges: current.edges, nodes: current.nodes })) {
    return
  }
  // NEW: never let an empty ydoc snapshot wipe a non-empty hydrated store
  // before the initial sync handshake completes.
  if (snapshot.nodes.length === 0 && current.nodes.length > 0) {
    return
  }
  applyRemoteSnapshot({...})
}
```

Trade-off: tolerates a brief inconsistency where store has nodes that
the ydoc doesn't, but the next `onUpdate` after sync corrects it. This
is the recommended first step.

**Option B — Seed the ydoc from the REST snapshot before connecting.**
Inside the `useEffect` that mounts the provider, after `createWorkflowYDoc()`
but before `createWorkflowYjsProvider(...)`, run:

```ts
importWorkflowSnapshotToYjs(y, { nodes: snapshot.nodes, edges: snapshot.edges }, 'mina-bootstrap')
```

The y-websocket sync handshake will then deduplicate these ops against
the server state — Yjs guarantees idempotency, so duplicates do not
broadcast. **Do not** flag this update as `mina-local`, or
`markDraftChanged` will fire and the autosave timer will trip. Use a
distinct origin string and add it to the `isLocal` discriminator in
`onUpdate`.

Trade-off: this works only because each node id is generated identically
on the client and the server (already true today). If ids ever diverge,
the bootstrap will create duplicate ops.

**Option C — Defer rendering until the first sync arrives.**
Track `yjsConnectionStatus !== 'synced'` and show a loading state in
`WorkflowCanvasPage`. This is the cleanest semantic but the worst UX
because every page load shows a spinner.

Recommendation: ship Option A immediately, then Option B as a follow-up
once a distinct origin string is plumbed through.

---

## 2. `dirty` desynchronizes from durability when the WebSocket is disconnected

**Files**
- `apps/web/src/features/workflow-canvas/sync/yjs/yjs-sync.ts:77-85`
- `apps/web/src/features/workflow-canvas/hooks/use-workflow-autosave.ts`

### Scenario

1. The WebSocket drops (network blip, server restart, etc.).
2. The user makes local edits. Each `withYDoc(...)` call emits a
   `'mina-local'` ydoc update. `onUpdate` fires, calls
   `markDraftChanged()`. `dirty = true`.
3. 700 ms after the last edit, autosave fires:
   `POST /collab/checkpoint`. The REST request succeeds because the
   HTTP path is independent of the WebSocket.
4. The server exports its room ydoc — which **does not contain the
   user's offline edits**, because they haven't been transported yet —
   and persists that.
5. `acknowledgeSaved({version})` sets `dirty = false`. The "Saved"
   indicator shows.
6. When the WebSocket reconnects, the client pushes the missing ops up.
   They eventually persist via the next snapshot compaction.

Between steps 5 and 6 the UI is **lying**: it claims the edits are
saved when they are still client-local. If the user closes the tab in
that window, the edits are lost.

### Fix direction

Derive `dirty` from the comparison of two Yjs state vectors:

```ts
const local = Y.encodeStateVector(ydoc)
const remoteAcked = providers.lastConfirmedRemoteStateVector
dirty = !Y.equalStateVectors(local, remoteAcked)
```

`lastConfirmedRemoteStateVector` should be updated only when the
WebSocket round-trip confirms server receipt (the `sync` event of
y-websocket gives a reasonable approximation; for stricter guarantees,
add an application-level ack).

REST checkpoint becomes a separate "snapshot compaction" trigger that
has nothing to do with the saved indicator.

Effort: medium. Replaces `dirty` boolean throughout the slice + the
autosave trigger condition.

---

## 3. `activeWorkflowId` is a mutable module-level singleton

**Files**
- `apps/web/src/features/workflow-canvas/sync/yjs/workflow-yjs-store.ts:13`

```ts
const runtimes = new Map<string, WorkflowYjsRuntimeState>()
let activeWorkflowId = ''
```

`workflowYjsCommands.*` resolves the target ydoc through
`getWorkflowYjsRuntime()`, which reads `activeWorkflowId`. Two failure
modes:

1. **React 18 strict mode double-invoke.** During development the
   effect runs mount → cleanup → mount. The cleanup sets
   `activeWorkflowId = ''`; if a UI event fires in that microtask window
   the command no-ops silently.
2. **Multiple canvases in one tree.** If a future feature renders two
   `WorkflowCanvas` instances (e.g. preview + editor), the later
   `registerWorkflowYjsRuntime` overwrites the active id and commands
   target the wrong document.

### Fix direction

Either:

- Pass the `workflowId` explicitly into every command (commands become
  pure functions of `(workflowId, args)` and look up the runtime
  themselves), removing the singleton entirely; **or**
- Replace the singleton with a React context that provides the runtime
  to the command layer for the currently mounted canvas.

The first is mechanical and removes the issue at the root.

---

## 4. Per-update server-side validation is O(N) on every drag tick

**Files**
- `apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts:118-131,188-207`

```ts
const validateWorkflowYjsUpdate = (room, update) => {
  const y = createWorkflowYDoc()
  try {
    Y.applyUpdate(y.ydoc, Y.encodeStateAsUpdate(room.y.ydoc), ...)
    Y.applyUpdate(y.ydoc, update, ...)
    const snapshot = exportWorkflowSnapshotFromYDoc(y)
    validateCanvas(snapshot.nodes, snapshot.edges)
  } finally {
    y.ydoc.destroy()
  }
}
```

Every WebSocket message that carries an update triggers this. For a
single user dragging a node we already see one message per a few tens
of milliseconds; under multi-user load the cost is amplified
linearly. Each invocation does four `O(N)` passes (encode, apply, apply
the new bytes, export + Zod parse). At a few hundred nodes the cost
becomes meaningful CPU.

There is also a correctness concern: when validation fails the catch in
`handleMessage` closes the connection with code `1011`. The client's
ydoc has **already applied the op locally** (before sending), so on
reconnect Y.sync re-pushes the same op, which the server rejects again,
which closes the connection again. In the limit this is a hot loop
that hammers the API.

### Fix direction

Two complementary changes:

- **Cheaper validation.** Only validate the *delta* against the
  existing state — most ops touch one node frame or one map entry.
  Move structural validation (referential integrity, schema) into the
  checkpoint compaction path that runs much less frequently.
- **Idempotent rejection.** When validation fails, broadcast a "reject
  op" back to the originator carrying enough information for the
  client to roll back via an inverse op. Do **not** close the
  connection — the client should be able to recover by adjusting its
  state, not by losing the entire session.

Effort: medium-high. The first part is mechanical. The second requires
introducing a small reject protocol on top of the standard Yjs
message envelope.

---

## 5. `applyRemoteSnapshot` lost its safety guard

**Files**
- `apps/web/src/features/workflow-canvas/store/slices/hydration-slice.ts:16-28`

The reducer is now:

```ts
applyRemoteSnapshot: (input) =>
  set((state) => {
    if (state.workflowId !== input.workflowId) return state
    return {
      ...state,
      edges: input.edges,
      nodeIndexById: indexNodes(input.nodes),
      nodes: input.nodes,
      ...(input.version ? { version: input.version } : {}),
    }
  }),
```

There is no defence against any caller (existing or future) passing
`{edges: [], nodes: []}`. Issue §1 is the primary place this fires, but
even after that fix this reducer should refuse obviously wrong inputs.

### Fix direction

Add a precondition inside the reducer:

```ts
if (input.nodes.length === 0 && state.nodes.length > 0 && input.source === 'yjs') {
  return state
}
```

The guard belongs at the sink because there is only one production
caller and the sink is the last line of defence before the UI sees
the change.

---

## 6. `WorkflowCanvasPage` can re-hydrate the store from REST mid-session

**Files**
- `apps/web/src/features/workflow-canvas/components/WorkflowCanvasPage.tsx:55-69`
- `apps/web/src/features/workflow-canvas/components/WorkflowCanvasPage.tsx:84-93`

`hydrateFromServer` runs whenever `workflowQuery.data` updates **and**
the condition `!dirty && workflow.version > version` is true. The
WebSocket event handler still invalidates `workflowKeys.detail(workflowId)`
for non-`workflow.definition.updated` events (task / run updates), so a
task-status event can cause `workflow-detail` to refetch and trigger
the rehydrate branch.

In normal cases the refetched workflow row matches the current ydoc
state (both have been advanced by previous checkpoints), so the
rehydrate replaces store with what it already shows. Visually a no-op.

But the rehydrate sets `dirty = false` and resets the store snapshot.
If a local edit landed in the ydoc *after* the workflow row was read
from the DB but *before* the WebSocket update arrived, the rehydrate
overwrites the local in-store projection of that edit until the next
ydoc update arrives. A brief flicker, not data loss.

### Fix direction

Either:

- Tighten the WebSocket-event-to-refetch wiring so only events that
  *can* change the canvas state invalidate the detail key; **or**
- Remove the third condition entirely and rely on the ydoc to project
  state into the store. The REST workflow row becomes purely for
  initial bootstrap and the version etag.

The second option is structurally cleaner and aligns with Rule 6 of the
ideal model (Section §3 in `02-ideal-sync-model.md`).

---

## 7. Dead code left over from the refactor

These items have no runtime impact today but should be cleaned up
before they confuse future readers.

- `sync/yjs/yjs-document.ts:74 importWorkflowSnapshotToYjs` — exported
  but used only by `yjs-document.spec.ts`. Delete the production export
  (or replace the test fixture with a direct ydoc populate helper).
- `api/workflow-queries.ts:29 saveWorkflow` — REST `PUT /api/workflows/:id`
  client wrapper has no callers in production code. The server route
  and `workflowsService.updateWorkflow` also exist. Either expose a
  feature (e.g. rename) that uses them, or remove the entire endpoint.
- `webEnv.workflowCanvasSyncMode` — the Zod schema is now
  `z.literal('primary')`. The field can be dropped entirely.
- `store-types.ts CanvasRemoteState / CanvasRemoteActions` — empty
  interfaces and an empty slice (`slices/remote-slice.ts`). Delete.
- `workflow.definition.updated` event — server still emits, client
  ignores. Either drop the publish call or wire it to do something
  useful (e.g. invalidate the per-workflow list cache).

---

## 8. Optional improvements deferred from the original plan

These were on the "Ideal model" list but did not land in the refactor.
They are not blocking the current symptoms.

### 8.1 Optimistic locking on `checkpointWorkflow`

Currently the in-process per-workflow lock serializes checkpoint writes
on a single API instance. Once the API is horizontally scaled there is
no shared lock; two concurrent checkpoints will both `version + 1` and
the later writer wins.

Add an `expectedVersion` parameter to `checkpointWorkflow` that returns
`409 WORKFLOW_VERSION_CONFLICT` when the DB has already advanced past
that version. The client retries by re-reading the latest snapshot.

### 8.2 Nest CRDTs per node

`y.nodes.set(id, fullNode)` makes the entire node object a scalar in
`Y.Map`. Concurrent edits to disjoint fields collapse to last-writer-
wins on the whole record.

Move per-field state into nested types:

- `data.config.prompt` → `Y.Text`
- `data.mediaSlots` → `Y.Map<MediaSlotName, Y.Array<NodeMediaSlotItem>>`
- `data.config.task` → `Y.Map<string, unknown>` (or a Zod-validated `Y.Map`)
- frame fields stay in `y.nodeFrames` as scalars

Migration: write a one-time upgrade pass when a workflow is loaded for
the first time with the new schema. Keep an immutable
`schemaVersion` in `y.meta` to detect.

### 8.3 Drop `nodeFrames` and store position inside `y.nodes`

The duplication exists for legacy reasons. With nested CRDT in §8.2 the
position can live as a sub-map of the node and `nodeFrames` can be
removed. The export helper (`applyNodeFrame`) becomes unnecessary.

---

## 9. Triage summary

| # | Priority | User-visible risk | Effort |
|---|----------|------------------|--------|
| 1 | **P0** | Reproduces "empty canvas after peer edit" | Low (one-line guard) |
| 2 | P1 | Lies about saved state during WS outage; offline edits look saved | Medium |
| 3 | P2 | Silent no-op on UI actions in dev / future multi-canvas | Low |
| 4 | P2 | Server CPU under load; client reconnect loop on bad ops | Medium-high |
| 5 | P2 | Safety net for §1 and future regressions | Trivial |
| 6 | P3 | Brief flicker after task/run events | Low |
| 7 | — | Code hygiene | Trivial |
| 8 | — | Hardening / future-scale | Medium-high |

The first item is the only one that can still produce the original
user-visible symptom. The rest are correctness, performance, or
cleanliness work that can be sequenced afterwards.
