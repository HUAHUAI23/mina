# 03 — Refactor Audit (Current Code vs. Ideal Model)

This audit walks through the refactor that has already landed on the
working branch and checks each item against the planned cleanup list
from `02-ideal-sync-model.md` §5.

Summary: **the structural changes are correct.** All the legacy code
paths that produced the destructive echo loops have been deleted. The
current server WebSocket handler persists, applies, and broadcasts
original Yjs updates with sender exclusion. Full graph validation and
checkpoint persistence now happen on the snapshot path, with
cross-instance snapshot conflicts guarded by persisted version checks.
Resolved collaboration guardrails are tracked in
`04-remaining-issues.md`.

---

## 1. Checklist outcome

| # | Plan item | Status | Where to verify |
|---|-----------|--------|-----------------|
| 1 | Remove `documentTransactions` + `appliedTransactionRevisions` | ✅ | `store/store-helpers.ts` no longer pushes entries; `store-types.ts` has no `documentTransactions` field. |
| 2 | Drop the `queueMicrotask`-driven `commitDocumentTransaction` | ✅ | Replaced by `withYDoc(() => ydoc.transact(...))` in `sync/yjs/workflow-yjs-commands.ts:32-38`. Writes are now synchronous against ydoc. |
| 3 | Stop sending `encodeStateAsUpdate` in `/collab/checkpoint` | ✅ | The old client autosave/checkpoint path is gone; server-side compaction exports the authoritative Yjs room state. |
| 4 | Delete the `importWorkflowSnapshotToYjs`-on-save path | ✅ | `reconcileLiveWorkflowYjsSnapshot` no longer exists. `importWorkflowSnapshotToYjs` remains for tests and initial document import paths, but production save does not round-trip exported snapshots back into the live client doc. |
| 5 | Delete `reconcileLiveWorkflowYjsSnapshot` | ✅ | File `sync/yjs/yjs-live-document.ts` and `sync/yjs/yjs-shadow-sync.ts` are gone. |
| 6 | Convert Zustand mutation actions to thin wrappers | ✅ | `slices/graph-slice.ts`, `slices/media-slots-slice.ts`, `slices/task-config-slice.ts` are one-line delegations to `workflowYjsCommands`. |
| 7 | Drop `applyRemoteSnapshot`'s `dirty/preserveDirty` branching | ✅ | `applyRemoteSnapshot` now preserves object references for unchanged graph items and rejects empty Yjs snapshots unless explicitly allowed. |
| 8 | Remove `draftRevision` / `savedRevision` / `remoteVersion` | ✅ | `store-types.ts` no longer exposes revision counters or canvas-level dirty/saving fields. |
| 9 | Stop publishing `workflow.definition.updated` | ✅ | The server no longer publishes definition-change events, the shared workflow event contract no longer exposes that type, and graph changes flow only through the Yjs sync channel. |
| 10 | Add optimistic locking to `checkpointWorkflow` | ✅ | `saveSnapshot` accepts `expectedVersion`; the Drizzle repository conditionally updates `workflow_yjs_snapshots`, explicit compaction returns `409 WORKFLOW_VERSION_CONFLICT` on stale rooms, and compaction deletes only covered update ids. |
| 11 | Nest CRDT inside each node (e.g. `Y.Text` for prompts) | ✅ | Node identity/frame/order fields, text content, generation prompts, and media slot arrays use nested Yjs structures. Text and prompt edits use targeted nested `Y.Text` writes. |
| 12 | Derive "saved" from state vectors | ✅ retired | The client no longer has a canvas-level autosave dirty path in the active workflow canvas feature. Durability is represented by server append-log persistence plus conditional checkpoint compaction. |

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
                       │   persist → apply → broadcast original update
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
`apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts`.
The WebSocket hot path persists and applies the received update bytes,
then broadcasts those same bytes with sender exclusion. Full graph
validation is reserved for initial import, snapshot replacement, and
checkpoint compaction.

### Rule 2 — client never reads its own ydoc and writes back

The client-side workflow canvas write path goes through runtime-bound
commands in `sync/yjs/workflow-yjs-commands.ts`.

All mutations originate from a UI event and call `mutate` with fresh
data (e.g. `node.position`), never from a previously exported ydoc
snapshot. The post-save reconcile that used to live in
`use-workflow-autosave.ts` is gone.

### Rule 3 — single commit point

Each UI event reaches one of the methods on `workflowYjsCommands` and
store slices delegate to those commands.

No queue. No microtask. No fan-out.

### Rule 4 — one writer into the projection

`sync/yjs/yjs-sync.ts` defines `projectYjsToStore`, the single
function that copies ydoc state into the Zustand store. It is called
in three places (`onUpdate`, `onSync`, and once after provider mount),
all inside the same effect. The sink includes an empty-snapshot guard so
pre-sync empty ydocs cannot wipe a hydrated canvas.

### Rule 5 — collaboration revisions removed

`store-types.ts` has no `draftRevision`, `savedRevision`, or
`remoteVersion`. The remaining `version` mirrors the workflow row
version, and Yjs state vectors stay inside the Yjs sync/storage layer.

The redundant counters from `01-problem-analysis.md` §4 are gone.

### Rule 6 — save is just a snapshot trigger

No client graph state goes up for checkpointing. The endpoint's
server-side handler exports the *current* server ydoc snapshot, persists
it as the DB read-model row, and returns the new version. Checkpoint
writes are conditional on the room's expected snapshot version; stale
rooms return `409 WORKFLOW_VERSION_CONFLICT` and reload from the latest
persisted snapshot plus update log. The client's ydoc is never touched by
the checkpoint response.

---

## 4. Validated invariants in code

These behaviours can be verified by reading the new code without
running it:

1. **No client-side save round-trip.** Production save/checkpoint code
   does not export a client ydoc snapshot and import it back into the
   same live doc.
2. **Server broadcast excludes sender.** `broadcast(room, …,
   input.connection)` in `workflow-yjs-room.service.ts:205`.
3. **All Zustand graph mutations route through ydoc.** Every action in
   `graph-slice.ts`, `media-slots-slice.ts`, `task-config-slice.ts`
   delegates to `workflowYjsCommands.*`.
4. **`applyRemoteSnapshot` has a single production caller.** That
   caller is `projectYjsToStore` inside `yjs-sync.ts`, which is the
   ydoc → store sink described by Rule 4.
5. **Per-workflow in-process lock plus DB version checks guard checkpoints.**
   `#withWorkflowLock` chains promises by workflow id inside one
   process, while `expectedVersion` on snapshot writes rejects
   cross-instance stale checkpoint saves.
6. **Saved binary updates can rebuild the room on cold start.**
   `#createRoom` in `workflow-yjs-room.service.ts:288-318` applies the
   snapshot and then every appended update before publishing the room,
   so a server restart is transparent to clients.
7. **Compaction does not drop concurrent append-log updates.**
   The room reloads persisted updates before export and deletes only the
   update ids included in the saved snapshot.
8. **Invalid append-log updates do not poison snapshots.**
   Snapshot reads and compaction validate the exported graph. If the
   persisted update log contains an invalid graph update, the room is
   rebuilt from the last valid snapshot, valid updates are replayed, and
   invalid update ids are deleted.

---

## 5. Deferred Work

No P1/P2/P3 collaboration guardrail from the refactor audit remains
open. Future node-internal fields should use the same nested Yjs
structure if they become collaboratively edited.
