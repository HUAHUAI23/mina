# 03 — Refactor Audit (Current Code vs. Ideal Model)

This audit walks through the refactor that has already landed on the
working branch and checks each item against the planned cleanup list
from `02-ideal-sync-model.md` §5.

Summary: **the structural changes are correct.** All the legacy code
paths that produced the destructive echo loops have been deleted. The
new server WebSocket handler is the textbook `validate → persist →
apply → broadcast(except sender)` shape. A small number of items remain
unfinished or were left in for now; they are tracked in
`04-remaining-issues.md`.

---

## 1. Checklist outcome

| # | Plan item | Status | Where to verify |
|---|-----------|--------|-----------------|
| 1 | Remove `documentTransactions` + `appliedTransactionRevisions` | ✅ | `store/store-helpers.ts` no longer pushes entries; `store-types.ts` has no `documentTransactions` field. |
| 2 | Drop the `queueMicrotask`-driven `commitDocumentTransaction` | ✅ | Replaced by `withYDoc(() => ydoc.transact(...))` in `sync/yjs/workflow-yjs-commands.ts:32-38`. Writes are now synchronous against ydoc. |
| 3 | Stop sending `encodeStateAsUpdate` in `/collab/checkpoint` | ✅ | `hooks/use-workflow-autosave.ts:36-43` now sends only `name`; no `stateUpdate` field. |
| 4 | Delete the `importWorkflowSnapshotToYjs`-on-save path | ✅ | `reconcileLiveWorkflowYjsSnapshot` no longer exists. The function `importWorkflowSnapshotToYjs` itself remains exported only for tests; production code does not call it. |
| 5 | Delete `reconcileLiveWorkflowYjsSnapshot` | ✅ | File `sync/yjs/yjs-live-document.ts` and `sync/yjs/yjs-shadow-sync.ts` are gone. |
| 6 | Convert Zustand mutation actions to thin wrappers | ✅ | `slices/graph-slice.ts`, `slices/media-slots-slice.ts`, `slices/task-config-slice.ts` are one-line delegations to `workflowYjsCommands`. |
| 7 | Drop `applyRemoteSnapshot`'s `dirty/preserveDirty` branching | ✅ | `slices/hydration-slice.ts:16-28` is now a straight replace. (But see §3.1 of `04-remaining-issues.md` — it lost a needed guard along the way.) |
| 8 | Remove `draftRevision` / `savedRevision` / `remoteVersion` | ✅ | `slices/draft-slice.ts` keeps only `dirty / saving / version / yjsConnectionStatus`. |
| 9 | Stop publishing `workflow.definition.updated` | ⚠ partial | The server still emits it (`workflows.service.ts:187-198`). The canvas client ignores it (`WorkflowCanvasPage.tsx:84-86 return`). Cheap to drop entirely but currently harmless. |
| 10 | Add optimistic locking to `checkpointWorkflow` | ❌ | Still `current.version + 1` unconditional. A per-workflow lock (`#withWorkflowLock`) serializes concurrent checkpoint requests in-process, but there is no cross-instance protection or version validation against client expectation. |
| 11 | Nest CRDT inside each node (e.g. `Y.Text` for prompts) | ❌ | Nodes are still stored whole with `y.nodes.set(id, fullNode)`. Same-node concurrent field edits remain last-writer-wins on the whole object. |
| 12 | Derive "saved" from state vectors | ❌ | UI still uses a `dirty` boolean toggled by `markDraftChanged()` and `acknowledgeSaved`. |

---

## 2. The new architecture, in one diagram

```
                  ┌────────────────────────────────────────────────┐
                  │  Server room ydoc (canonical)                  │
                  │  + workflow_yjs_updates table (append log)     │
                  │  + workflow_yjs_snapshots table (compacted)    │
                  │  + DB workflow row (read-model snapshot)       │
                  └────┬───────────────────────────────────────────┘
                       │
                       │  WebSocket /collab/:room
                       │   validate → persist → apply → broadcast (except sender)
       ┌───────────────┼────────────────┐
       │               │                │
  ┌────▼────┐     ┌────▼────┐      ┌────▼────┐
  │ A ydoc  │     │ B ydoc  │      │ C ydoc  │
  │   ↓ obs │     │   ↓ obs │      │   ↓ obs │
  │ Zustand │     │ Zustand │      │ Zustand │
  │ (read)  │     │ (read)  │      │ (read)  │
  │   ↓     │     │   ↓     │      │   ↓     │
  │ React   │     │ React   │      │ React   │
  └─────────┘     └─────────┘      └─────────┘

  POST /collab/checkpoint
  (snapshot + compaction trigger, no state in body)
```

This is structurally identical to the diagram in
`02-ideal-sync-model.md` §1, modulo the Zustand mirror that the codebase
keeps for ergonomic selectors.

---

## 3. Where each rule from §3 of the ideal model is enforced

### Rule 1 — server never modifies the op it receives

Implemented in
`apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts:188-207`:

```ts
if (messageType === messageSync) {
  encoding.writeVarUint(encoder, messageSync)
  const { syncMessageType, update } = readSyncMessage(decoder, encoder, room.y.ydoc)
  if (encoding.length(encoder) > 1) {
    sendBinary(input.connection, encoding.toUint8Array(encoder))
  }
  if (
    (syncMessageType === syncProtocol.messageYjsUpdate ||
      syncMessageType === syncProtocol.messageYjsSyncStep2) &&
    update && update.byteLength > 0
  ) {
    await this.#withWorkflowLock(room.workflowId, async () => {
      validateWorkflowYjsUpdate(room, update)
      await this.#persistUpdate(room, update)
      Y.applyUpdate(room.y.ydoc, update, input.connection)
    })
    broadcast(room, encodeSyncUpdate(update), input.connection)
  }
}
```

Validation runs on a clone (`validateWorkflowYjsUpdate`), so the
update bytes are not mutated. Broadcast excludes the sender's
connection.

### Rule 2 — client never reads its own ydoc and writes back

The only client-side write path is `withYDoc` in
`sync/yjs/workflow-yjs-commands.ts:32-38`:

```ts
const withYDoc = (mutate: (y: WorkflowYDocHandles, workflowId: string) => void): void => {
  const runtime = getWorkflowYjsRuntime()
  if (!runtime) return
  runtime.y.ydoc.transact(() => mutate(runtime.y, runtime.workflowId), 'mina-local')
}
```

All mutations originate from a UI event and call `mutate` with fresh
data (e.g. `node.position`), never from a previously exported ydoc
snapshot. The post-save reconcile that used to live in
`use-workflow-autosave.ts` is gone.

### Rule 3 — single commit point

Each UI event reaches one of the methods on `workflowYjsCommands`
(`workflow-yjs-commands.ts:111-409`) and each method ends in exactly
one `withYDoc(...)` call. Slices delegate directly:

```ts
// slices/graph-slice.ts
setNodeFrame: (input) => workflowYjsCommands.setNodeFrame(input),
```

No queue. No microtask. No fan-out.

### Rule 4 — one writer into the projection

`sync/yjs/yjs-sync.ts:53-75` defines `projectYjsToStore`, the single
function that copies ydoc state into the Zustand store. It is called
in three places (`onUpdate`, `onSync`, and once after provider mount),
all inside the same effect. Nothing else calls `applyRemoteSnapshot`
in production.

### Rule 5 — collaboration revisions removed

`store-types.ts` has no `draftRevision`, `savedRevision`,
`remoteVersion`. The remaining numbers are:

- `state.version` — mirror of `workflow.version` from the DB row,
  written only by `hydrateFromServer` and `acknowledgeSaved`.
- `Y.encodeStateVector(ydoc)` — used internally by the Yjs sync
  protocol; the application code does not read it.

The redundant counters from `01-problem-analysis.md` §4 are gone.

### Rule 6 — save is just a snapshot trigger

`use-workflow-autosave.ts:36-58`:

```ts
mutationFn: async () => ({
  response: await checkpointWorkflowCollaboration(workflowId, {
    ...(snapshot.name || fallbackName ? { name: snapshot.name || fallbackName } : {}),
  }),
}),
onSuccess: ({ response }) => {
  acknowledgeSaved({ version: response.item.version })
  queryClient.setQueryData(workflowKeys.detail(workflowId), response)
},
```

No state goes up. No state comes down (other than the workflow `version`
to refresh the read model). The endpoint's server-side handler
(`workflow-collaboration.routes.ts:24-45`,
`workflow-yjs-room.service.ts:250-276`) exports the *current* server
ydoc snapshot, persists it as the DB read-model row, and returns the
new version. The client's ydoc is never touched.

---

## 4. Validated invariants in code

These behaviours can be verified by reading the new code without
running it:

1. **No client-side ydoc round-trip.** Search confirms zero call sites
   of `importWorkflowSnapshotToYjs` outside of `yjs-document.spec.ts`.
2. **Server broadcast excludes sender.** `broadcast(room, …,
   input.connection)` in `workflow-yjs-room.service.ts:205`.
3. **All Zustand graph mutations route through ydoc.** Every action in
   `graph-slice.ts`, `media-slots-slice.ts`, `task-config-slice.ts`
   delegates to `workflowYjsCommands.*`.
4. **`applyRemoteSnapshot` has a single production caller.** That
   caller is `projectYjsToStore` inside `yjs-sync.ts`, which is the
   ydoc → store sink described by Rule 4.
5. **Per-workflow lock guarantees in-order updates and checkpoints.**
   `#withWorkflowLock` chains promises by workflow id; both the
   validate-persist-apply triple and the checkpoint compaction acquire
   it.
6. **Saved binary updates can rebuild the room on cold start.**
   `#createRoom` in `workflow-yjs-room.service.ts:288-318` applies the
   snapshot and then every appended update before publishing the room,
   so a server restart is transparent to clients.

---

## 5. Items deferred to the next iteration

The audit table at the top shows three items that did not land. None
of them are required for the new model to function safely under
typical concurrent use; they are quality improvements.

- **Optimistic locking on `checkpointWorkflow`** would protect against
  cross-instance races if the API is ever horizontally scaled.
- **Nested CRDTs per node** would give finer-grained merge semantics
  (text fields collaborable at character level).
- **State-vector-derived saved indicator** would tighten the UX
  contract for offline edits — see `04-remaining-issues.md` §2 for the
  scenario where the current `dirty` flag desynchronizes from real
  durability state.

These can be picked up independently of the residual bugs in §1 of
that document.
