# 01 — Problem Analysis (Pre-Refactor Architecture)

This document explains, with file/line references, why the original
workflow-canvas collaboration implementation produced the following
user-visible symptoms:

- **Symptom 1**: Client A moves a node, autosave completes, then the
  node "snaps back" to its old position.
- **Symptom 2**: Client B edits a node; client A's canvas briefly shows
  no nodes at all. Reloading the page brings everything back.
- **Symptom 3**: A sometimes saves a node successfully and B updates in
  response; other times A's edit is silently swallowed.

All three are different manifestations of the **same** root architecture
problem, presented below as: **symptom → root cause → architectural
reason**.

---

## 1. Core defect: dual source of truth, lossy bidirectional sync

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Zustand canvas-store    │        │   Yjs ydoc (shadow)      │
│  - nodes[] / edges[]     │  ←──→  │  - y.nodes / y.edges     │
│  - draftRevision         │        │  - updateRevision        │
│  - documentTransactions  │        │  - appliedTxRevisions    │
└──────────────────────────┘        └──────────────────────────┘
            ↑                                   ↕  y-websocket
            │                          ┌──────────────────────────┐
            │  REST /collab/checkpoint │   Server room ydoc       │
            │  (full encodeStateAsUpdate)  │   + DB snapshot          │
            └──────────────────────────┘
```

- UI rendering reads from Zustand `state.nodes/edges` (see
  `store/selectors.ts` + `render/flow-render-store.ts`).
- Yjs ydoc is only a *shadow* — used as a transport / merge engine,
  **not** as the canonical state.
- The server treats Yjs as the merge authority, exports plain
  `nodes`/`edges` from it, and writes them to the workflow DB row.

Every write therefore has to be *translated* between the two
representations. Any translation that loses information (or is applied
out of order, or in a feedback loop) produces a bug.

### How the two stores were kept in sync

- Local UI action → Zustand action → push entry into
  `state.documentTransactions` → `queueMicrotask(() => applyToYjs(entry))`
  via `commitDocumentTransaction` in `store/store-helpers.ts:25-42`.
- Remote Yjs update → `useWorkflowYjsShadowSync` `onUpdate` → export
  the *whole* ydoc back into a plain `WorkflowYSnapshot` → call
  `applyRemoteSnapshot({source:'yjs', ...})` to replace the store's
  arrays.
- REST autosave → `flushPendingLocalTransactionsToYjs` →
  `encodeWorkflowYjsStateUpdate` (encode full ydoc) →
  `POST /collab/checkpoint` → server applies the update onto its room
  ydoc, exports a plain snapshot, persists it as the workflow row,
  returns the plain snapshot to the caller → caller calls
  `reconcileLiveWorkflowYjsSnapshot` which executes
  `importWorkflowSnapshotToYjs(y, returnedSnapshot)` — and that import
  does `y.nodes.clear() + y.nodeFrames.clear() + re-set` inside a
  single ydoc transaction.

That last step is what makes the system fundamentally unsafe — explained
in §2 below.

---

## 2. Symptom 1: A moves a node, save reverts it

**Files involved**
- `sync/yjs/yjs-live-document.ts:122` `reconcileLiveWorkflowYjsSnapshot`
- `sync/yjs/yjs-document.ts:74` `importWorkflowSnapshotToYjs` —
  `y.nodes.clear() + y.nodeFrames.clear() + re-set`
- `hooks/use-workflow-autosave.ts:100-119` save mutation `onSuccess`

The save flow looked like:

```ts
// use-workflow-autosave.ts:100-119
const snapshotAccepted =
  applyResponse &&
  (webEnv.workflowCanvasSyncMode !== 'primary' ||
    reconcileLiveWorkflowYjsSnapshot(
      workflowId,
      { edges: response.item.edges, nodes: response.item.nodes },
      yjsUpdateRevision,
    ))
if (snapshotAccepted) {
  acknowledgeSaved({ edges, name, nodes, revision, version })
} else {
  acknowledgePersistedVersion({ version })
}
```

Two independent bugs lived in this branch:

### 2.1 `appliedTransactionRevisions` not cleared after reconcile

`use-workflow-autosave.ts:100-119` decided whether to update the store
using **two different revision counters**:

- `applyResponse` was computed from `yjsUpdateRevision` (a Yjs-side
  counter incremented on every ydoc update, local or remote).
- `acknowledgeSaved` only mutated the store when
  `state.draftRevision === revision` (a Zustand-side counter
  incremented only on local edits).

Consider the race where the user drags a node again **while the save
HTTP request is still in flight**:

1. User moves node. `draftRevision: 5 → 6`. The new entry is pushed to
   `state.documentTransactions`. A microtask applies it to ydoc and
   adds `6` to `liveDocument.appliedTransactionRevisions`.
2. The server response, computed from revision 5, returns the *old*
   position.
3. `reconcileLiveWorkflowYjsSnapshot` invokes
   `importWorkflowSnapshotToYjs`, which does `y.nodes.clear() +
   y.nodeFrames.clear() + re-set`. **The revision-6 effects are erased
   from ydoc but `appliedTransactionRevisions` still contains `6`.**
4. `acknowledgeSaved` checks `state.draftRevision === 5`. It's `6`. The
   block does not run. Store keeps the new position.
5. Later, *any* remote update triggers `reconcileDocumentFromYjs`
   (`sync/yjs/yjs-shadow-sync.ts:107-127`). That exports ydoc → store.
   Ydoc no longer has the revision-6 change. `applyRemoteSnapshot`
   replaces store nodes with the older positions. **The node visibly
   reverts.**

`documentTransactions` also still contains the now-unsynced revision-6
entry, so the next autosave tick triggers immediately, and the loop
repeats.

### 2.2 `clear()` was broadcast to every other client

`importWorkflowSnapshotToYjs` ran inside `y.ydoc.transact(...)`, which
means the resulting "delete every key, then set them again" was a normal
Yjs update broadcast over the `/collab/:room` WebSocket to all other
peers.

When B was concurrently editing the same node:

- B's local `Y.Map.set(nodeId, newPos)` is in flight.
- A's reconcile produces a `clear()` followed by a `set(nodeId, oldPos)`
  in the same transaction.
- Yjs Map convergence is last-writer-wins per key. A's `set` (issued
  *after* the clear, all within one ydoc transaction with later logical
  clocks than B's) typically wins.

So "A saved" effectively meant "A broadcasts A's view of the world,
overwriting concurrent B edits." That is why concurrent edits sometimes
appeared to merge correctly (A's reconcile happened to broadcast B's
state too) and sometimes silently swallowed one side (whoever lost the
clock race).

---

## 3. Symptom 2: B updates and A's canvas is briefly empty

DB rows are intact (refresh restores the canvas), so the data loss is
purely **client-side**. Two paths can produce it:

### 3.1 Server room idle cleanup + reconnect synced an empty state

`apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts:23`
defined `roomIdleCleanupMs = 30_000`. After 30s with no connections the
server destroys the room. On the next connect it rebuilds the room from
the DB snapshot + update log.

If A is connected during that 30s window:

- A's browser y-websocket is still attached to an A-side ydoc that has
  full content.
- If A's ydoc gets transiently emptied by an incoming reconcile
  `clear()` (the path in §2.2 above), and at that moment a reconnect /
  sync exchange happens, A's empty state can be pushed up to the server
  through `Y.sync.step2`, then appended to the update log.
- A later checkpoint persists the resulting near-empty snapshot.

### 3.2 `reconcileDocumentFromYjs` emptied A's store

`sync/yjs/yjs-shadow-sync.ts:107-127` handled remote ydoc updates:

```ts
const onUpdate = (_update, origin) => {
  liveDocument.updateRevision += 1
  if (origin === 'mina-local' || ...) {...; return}
  const current = getCanvasSnapshot()
  if (current.dirty) {
    applyPendingLocalTransactionsToYjs(workflowId, liveDocument, 'mina-local-replay')
  }
  reconcileDocumentFromYjs()   // ← exports ydoc to the store, wholesale
}
```

When B's checkpoint reconcile produced its `clear + re-set` and that
arrived at A as one Yjs update, `reconcileDocumentFromYjs` exported the
ydoc into a fresh `WorkflowYSnapshot` and passed it to
`applyRemoteSnapshot`. In `store/slices/hydration-slice.ts:16-41` the
remote path simply replaced `state.edges` and `state.nodes` with the
arrays from the snapshot.

If the export was observed in a state where the deletes had landed and
the re-adds had not (which can happen across update packets even though
a single ydoc transaction is atomic), or if the round-trip dropped some
ops, A's store became `{nodes: [], edges: []}`. The canvas rendered
empty for as long as it took the next ydoc event to repair things.

---

## 4. Symptom 3: "Sometimes it works, sometimes it doesn't"

The system used **three independent counters** that all had to remain
mutually consistent for save/sync logic to make sense:

| Counter | Source | Increments on |
|---|---|---|
| `draftRevision` / `savedRevision` | Zustand store | every local mutation |
| `liveDocument.updateRevision` | Yjs subsystem | every ydoc update (local **or** remote) |
| `workflow.version` | DB | every server-side `replaceDefinition` |

Without concurrency they tracked each other naturally. Under the
slightest network jitter — even just one remote update arriving during
a save round-trip — they de-aligned. Different alignment patterns
produced different bugs:

- `draftRevision > yjsUpdateRevision`: a local op was queued but not yet
  flushed; reconcile erased it from ydoc but it sat in
  `documentTransactions` forever.
- `yjsUpdateRevision > draftRevision`: an unrelated remote update
  arrived during save; `applyResponse` became false; retry logic looped.
- `workflow.version > version-in-store && !dirty`: workflow-detail query
  refetched (e.g. triggered by a `task.updated` event also invalidating
  the detail key); `hydrateFromServer` reset `draftRevision = 0` while
  the ydoc kept its content, leaving the two stores out of sync.

---

## 5. Other architectural issues that amplified the above

Listed in roughly descending blast radius.

### 5.1 No optimistic locking on the checkpoint write

`workflows.service.ts:203 checkpointWorkflow` did
`version: current.version + 1` unconditionally — unlike `updateWorkflow`
which validated `current.version !== input.version`. Two concurrent
checkpoints from different clients would both bump version, with the
second silently overwriting the first.

### 5.2 Two sync channels writing to the same server ydoc

- The Yjs WebSocket (`/collab/:room`) accepted incremental ydoc updates
  and broadcast them.
- The REST `/collab/checkpoint` accepted a full
  `Y.encodeStateAsUpdate(client.ydoc)` blob, called
  `Y.applyUpdate(room.y.ydoc, ...)`, and then **exported a plain
  snapshot back to the client**, which the client immediately re-imported
  into its own ydoc (the destructive path in §2.2).

The REST path therefore acted as a giant **echo amplifier**: a single
local edit became a full-state broadcast that fanned out to every peer.

### 5.3 Node objects stored as scalar values in `Y.Map`

`sync/yjs/yjs-transactions.ts:75-95` always did
`y.nodes.set(id, fullNode)` — the entire node (with `data`,
`mediaSlots`, `label`, etc.) was a single scalar in the map. There were
no nested CRDTs. Concurrent edits to different fields of the same node
collapsed to last-writer-wins on the whole node, so the CRDT bought us
almost nothing beyond JSON last-write-wins.

### 5.4 `nodeFrames` and `nodes` could disagree

Position was stored in both `y.nodes.get(id).position` and
`y.nodeFrames.get(id).position`. `move_nodes` updated only `nodeFrames`;
`upsert_node` rewrote the full node including a possibly stale
position. The export merged them with `applyNodeFrame`, but any code
path that read `y.nodes` directly could see stale positions.

### 5.5 Hydrate path conflicted with shadow-sync

When the workflow-detail query was invalidated by an unrelated event
(task / run), `WorkflowCanvasPage` ran `hydrateFromServer` which reset
`draftRevision = 0`. Shadow-sync's first effect contained
`if (draftRevision === 0 && hasWorkflowYjsDocumentContent(y)) return`,
so it skipped re-importing into ydoc. Result: store had new content,
ydoc kept old content, and the next user action operated on a state
where the two diverged.

### 5.6 `applyRemoteSnapshot` mixed dirty preservation badly

`store/slices/hydration-slice.ts:21-41` preserved
`documentTransactions` (which still referenced old node ids / old
baselines) while replacing the whole `nodes`/`edges` arrays. The next
autosave would replay these stale transactions against a different
underlying state and produce server-side errors or silent loss.

### 5.7 `queueMicrotask` between store update and ydoc apply

`store/store-helpers.ts:25-42` updated the store synchronously but
applied to ydoc through a microtask. Between those two points other
React work could observe a state where the store had a mutation that
the ydoc did not. Several tests
(`document-transactions.spec.ts`,
`remote-drag-reconciliation.spec.ts`) existed specifically to paper
over this scheduling fragility.

---

## 6. Summary diagnosis

> **Every observable bug was a symptom of one underlying problem: the
> same logical edit was being translated multiple times across two
> representations, and then broadcast back to its origin.**

The fix has to either eliminate one representation entirely or make the
sync direction strictly one-way. The next document explains what a
correct multi-client model looks like and why it doesn't have these
classes of bugs.
