# Workflow Canvas Collaboration: Problem Analysis & Solution

This directory contains a complete post-mortem and design record for the
real-time collaboration subsystem under
`apps/web/src/features/workflow-canvas` and
`apps/api/src/modules/workflows/collaboration`.

The original implementation suffered from a class of intermittent
synchronization bugs that only appeared when **two or more clients on the
same account** edited the same canvas concurrently — moved nodes that
reverted after save, edits silently overwriting each other, and short
windows where one peer's canvas became entirely empty until the page was
refreshed.

This documentation captures:

1. The exact root cause of those symptoms in the **pre-refactor** code.
2. The architectural model a CRDT-based collaboration layer **should**
   follow for `N` clients (here illustrated with three: A / B / C),
   including how to prevent the recursive broadcast loops that the old
   code had.
3. An **audit of the current refactor** against that ideal model — what
   the refactor accomplished and where it deviated.
4. The **remaining issues** that remain after the resolved guardrails,
   with concrete fix directions.
5. The **runtime event stream** that runs beside Yjs, including how task
   and run events refresh client runtime facts and React Query caches.
6. The **undo/redo model** for collaborative canvas edits, including why
   history must be based on `Y.UndoManager` rather than React Flow graph
   snapshots.
7. The workflow canvas **media runtime** rules live in
   [`../workflow-canvas-media-runtime.md`](../workflow-canvas-media-runtime.md):
   image multi-output generation, video poster selection, active video
   lifecycle, history thumbnails, and the boundary between collaborative
   media pins and local playback state.

## Reading order

| # | File | Audience | Why |
|---|------|----------|-----|
| 1 | [`01-problem-analysis.md`](./01-problem-analysis.md) | Anyone debugging collab regressions | What was wrong with the original architecture, expressed as **symptom → root cause → architectural reason** |
| 2 | [`02-ideal-sync-model.md`](./02-ideal-sync-model.md) | Engineers extending collab features | The CRDT model for A/B/C clients, the three invariants, and the six hard rules that prevent broadcast loops |
| 3 | [`03-refactor-audit.md`](./03-refactor-audit.md) | Reviewers of the recent refactor | Checklist of what changed, where the code now matches the ideal model, where it still diverges |
| 4 | [`04-remaining-issues.md`](./04-remaining-issues.md) | Engineers checking collaboration regressions | Resolved guardrails that must not regress after the Yjs refactor |
| 5 | [`05-runtime-event-stream.md`](./05-runtime-event-stream.md) | Engineers working on task status, media previews, history rail, or run state | How the workflow event WebSocket, runtime facts store, and React Query invalidation cooperate with Yjs without becoming collaborative document state |
| 6 | [`06-undo-redo.md`](./06-undo-redo.md) | Engineers implementing or reviewing canvas undo/redo | The Yjs UndoManager-based undo model, capture boundaries, UI hooks, keyboard shortcuts, and tests required for collaborative correctness |
| - | [`../workflow-canvas-media-runtime.md`](../workflow-canvas-media-runtime.md) | Engineers working on media task outputs or previews | Media output count semantics, partial image success, video posters, active video lifecycle, history thumbnails, and media selection boundaries |

## TL;DR

- **Root cause of the original bugs**: the canvas was running with **two
  sources of truth** — a Zustand store and a shadow Yjs ydoc — wired
  together by a save path that did `nodes.clear() + re-import` on every
  REST checkpoint. That clear-and-reimport was broadcast as a regular
  Yjs update to every other peer, which (a) overwrote their concurrent
  in-flight edits and (b) created a feedback loop with the local
  `documentTransactions` queue that left ydoc and store permanently
  desynced.
- **Ideal model**: pick **one** source of truth (Yjs ydoc), let every
  UI action mutate it directly, and never read-then-write the same doc
  on the same client. Servers act as passthrough broadcasters that
  **exclude the sender**, so a single op crosses the wire exactly once.
- **Refactor status**: the destructive paths (`importWorkflowSnapshotToYjs`
  on save, `documentTransactions`, `appliedTransactionRevisions`,
  `draftRevision`/`savedRevision`/`remoteVersion` counters) have been
  removed and UI commands now write to ydoc directly. The new server
  WebSocket hot path is `persist → apply → broadcast original update
  (except sender)`, while full graph validation runs on import,
  replacement, and checkpoint compaction.
- **Resolved guardrail**: first-mount empty Yjs projection no longer
  wipes the REST-hydrated store. The client skips empty pre-sync
  projection and `applyRemoteSnapshot` rejects empty snapshots unless
  the caller explicitly allows them; see
  [`04-remaining-issues.md`](./04-remaining-issues.md).
- **Current residuals**: hot-path per-update validation,
  cross-instance checkpoint races, invalid append-log recovery, and
  nested CRDT ownership for current high-churn node fields are resolved.
  Future node-internal fields should follow the same nested Yjs pattern.
- **Undo/redo**: canvas history is now specified as a per-runtime
  `Y.UndoManager` that tracks only local `'mina-local'` transactions and
  emits ordinary Yjs updates. Do not add React Flow snapshot history or a
  REST undo channel; see [`06-undo-redo.md`](./06-undo-redo.md).
