# 04 — Remaining Issues & Concrete Fix Directions

This document tracks collaboration guardrails after the workflow canvas
Yjs refactor. It intentionally keeps the resolved historical items that
must not regress.

---

## Resolved Guardrails

### Initial empty-ydoc wipe

**Status:** resolved.

The client now prevents an empty, not-yet-synced Yjs document from
overwriting a non-empty hydrated store:

- `useWorkflowYjsSync` skips projection while the provider is not synced
  and the exported ydoc snapshot is empty.
- `applyRemoteSnapshot` also rejects empty Yjs snapshots unless the
  caller explicitly allows empty snapshots.

These two guards cover both the source and sink of the old empty-canvas
failure mode.

### Runtime singleton

**Status:** resolved.

`workflow-yjs-store.ts` stores runtimes by workflow id. Commands look up
the runtime through `getWorkflowYjsRuntimeForWorkflow(workflowId)`, so
there is no mutable `activeWorkflowId` singleton to race during Strict
Mode remounts or future multi-canvas views.

### Autosave dirty flag

**Status:** retired with the current client path.

The workflow canvas no longer has a `use-workflow-autosave` or
canvas-level `dirty`/`acknowledgeSaved` path. The remaining durability
concern is server-side checkpoint semantics, not a client dirty boolean
inside the current feature code.

### Per-update server-side validation

**Status:** resolved for the hot WebSocket path.

`WorkflowYjsRoomService.handleMessage` no longer exports and validates
the whole graph for every Yjs update. The hot path appends the binary
update, applies it to the room ydoc, optionally attempts background
compaction, and broadcasts the original update to peers.

Full `validateCanvas` still runs during initial import, explicit
snapshot replacement, and checkpoint compaction. This keeps drag/update
traffic off the O(N) validation path while preserving persisted
snapshot validation.

### Cross-instance checkpoint races

**Status:** resolved.

Snapshot writes now carry `expectedVersion`. The Drizzle repository
updates `workflow_yjs_snapshots` only when the persisted snapshot version
still matches the room version, and explicit checkpoint compaction
returns `409 WORKFLOW_VERSION_CONFLICT` when another API instance has
already advanced the snapshot.

Compaction also reloads the persisted append log before export and
deletes only the update ids covered by the saved snapshot. Background
threshold/idle compaction treats a version conflict as a skipped
maintenance pass: it reloads the room from the latest snapshot plus
remaining updates and leaves the append log intact for a later
checkpoint.

### Bad persisted update recovery

**Status:** resolved.

Compaction and snapshot reads validate the exported graph. If a persisted
Yjs update log contains an update that makes the graph invalid, the room
is rebuilt from the last valid snapshot and updates are replayed one by
one. Updates that keep the graph valid are retained; the invalid update
ids are deleted from the append log. Threshold compaction does not
broadcast a current update that was isolated this way.

### Nested CRDTs per node

**Status:** resolved for the current workflow canvas collaboration
surface.

The server Yjs document stores nodes as nested `Y.Map` structures:
frame fields are separated from node data, text node content and
generation prompts use `Y.Text`, and media slot collections use nested
`Y.Array` values. The frontend command layer also updates text node
content and generation prompts through targeted nested `Y.Text` writes,
so ordinary high-churn edits do not rewrite whole node objects.

Future fields should follow the same nested-map rule when they become
collaboratively edited at high frequency. That is an extension guideline,
not a remaining P1/P2/P3 blocker for the current surface.

---

## Triage Summary

No open P1/P2/P3 collaboration guardrail issues remain in this document.
Future feature work should preserve the resolved guardrails above.

| # | Priority | Risk | Effort |
|---|----------|------|--------|
| - | - | No current blocker | - |
