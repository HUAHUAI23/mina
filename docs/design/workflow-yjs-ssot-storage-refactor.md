# Workflow Yjs SSOT Storage Refactor

## Status

Date: 2026-05-21

Status: implemented in the development branch.

Update on 2026-06-07: the checkpoint/compaction path now uses
`expectedVersion` conditional snapshot writes. Explicit compaction
returns `409 WORKFLOW_VERSION_CONFLICT` when another API instance has
advanced the persisted snapshot, while background threshold/idle
compaction treats that conflict as a skipped maintenance pass and
reloads the room from the latest snapshot plus remaining update log.
Compaction replays persisted updates before export and deletes only the
update ids covered by the saved snapshot, so cross-instance maintenance
cannot drop concurrent append-log entries. Snapshot reads and compaction
also isolate invalid persisted updates by rebuilding from the last valid
snapshot, replaying only valid updates, and deleting invalid update ids.

This is the storage and save-path design for the current development
phase. Production data migration compatibility is not a constraint. The
goal is to remove the non-converging autosave/checkpoint loop by
removing the duplicate editable workflow graph read-model that created
the loop.

This document supersedes the editable-graph parts of:

- `docs/design/workflow-storage-and-concurrency-refactor.md`
- `docs/design/workflow-canvas-performance-collaboration-refactor-guidance.md`
- `docs/design/workflow-canvas-collaboration/04-remaining-issues.md`

The run execution tables and scheduler design from those documents still
stand.

## External Reference Basis

Use these current official docs as the engineering baseline:

1. Yjs document updates are binary document updates that can be stored,
   merged, diffed, and applied repeatedly. They are commutative,
   associative, and idempotent. Reference:
   <https://docs.yjs.dev/api/document-updates>
2. Yjs update handlers expose `(update, origin)` so providers can persist
   or forward only the updates they own. Reference:
   <https://docs.yjs.dev/api/document-updates>
3. y-websocket provides the provider, awareness transport, and cross-tab
   collaboration model for Yjs documents. Reference:
   <https://docs.yjs.dev/ecosystem/connection-provider/y-websocket>
4. React Flow performance guidance recommends memoizing components and
   callbacks, avoiding broad `nodes` / `edges` subscriptions, and
   reducing visible node work for large diagrams. Reference:
   <https://reactflow.dev/learn/advanced-use/performance>
5. React Flow collaboration examples use React Flow as the renderer and
   Yjs as the shared graph document. Reference:
   <https://reactflow.dev/examples/interaction/collaborative>
6. TanStack Query mutation scopes only serialize same-scope mutations on
   one client. They do not solve cross-tab or cross-client document
   convergence. Reference:
   <https://tanstack.com/query/latest/docs/framework/react/guides/mutations#mutation-scopes>

## Problem Statement

The observed backend logs do not show a 25 second slow request. They show
many successful checkpoint requests in the 400-700 ms range:

```text
totalMs: 383-507 ms
persistReadModelMs: 256-330 ms
lockWaitMs: 0
nodeCount: 4
edgeCount: 1-2
roomConnections: 2
workflowVersion: 1240 -> 1256 in about 70 seconds
```

The user-visible "Saving" issue is therefore not a single slow network
request. It is a non-converging autosave loop.

The loop exists because Mina currently keeps two editable workflow graph
copies:

1. Yjs document persistence:
   - `workflow_yjs_updates`
   - `workflow_yjs_snapshots`
2. SQL editable read-model:
   - `workflow_nodes`
   - `workflow_edges`

The frontend then needs `dirty`, `saving`, `/collab/checkpoint`,
`stateVectorsEqual`, and `acknowledgeSaved` only to keep the SQL
read-model synchronized with the Yjs document. When any local or remote
Yjs update arrives while the checkpoint is in flight, the client state
vector no longer equals the response state vector, so the client does
not acknowledge the save. The dirty flag stays true and schedules
another checkpoint.

With two browser tabs or hot-reload leftovers, both clients can run the
same autosave loop. TanStack Query scope serialization only serializes
mutations inside one client; it cannot elect a single global saver.

## Current Code Facts

### Frontend autosave loop

`apps/web/src/features/workflow-canvas/hooks/use-workflow-autosave.ts`
does the following:

- Calls `checkpointWorkflowCollaboration()` after a 700 ms debounce.
- Sets `saving` in the canvas store.
- Compares `getWorkflowYjsStateVector(workflowId)` with
  `response.yjsStateVector`.
- Calls `acknowledgeSaved()` only when the vectors match exactly.

That exact global vector comparison is not a stable acknowledgement
condition for collaborative documents. It treats remote updates and
local edits during the request the same way, even though only local
unsent edits should keep a client dirty.

### Backend checkpoint path

`apps/api/src/modules/workflows/workflow-collaboration.routes.ts`
implements:

```text
POST /api/workflows/:id/collab/checkpoint
  -> workflowYjsRoomService.checkpointWorkflowReadModel()
  -> workflowsService.checkpointWorkflow()
  -> definitions.replaceDefinition()
```

`checkpointWorkflowReadModel()` exports the room Yjs document, validates
it, encodes a Yjs snapshot, saves it, and then calls the read-model
callback.

`DrizzleWorkflowDefinitionRepository.replaceDefinition()` then:

```text
delete workflow_edges by workflow_id
delete workflow_nodes by workflow_id
insert all workflow_nodes
insert all workflow_edges
```

This is the source of the logged `persistReadModelMs` cost.

### Yjs is already persisted

`WorkflowYjsRoomService.handleMessage()` already persists each Yjs update
on the WebSocket path before applying and broadcasting it:

```text
persist update -> apply update to server ydoc -> broadcast except sender
```

`#persistUpdate()` appends to `workflow_yjs_updates` and periodically
saves `workflow_yjs_snapshots` after `snapshotCompactionThreshold`
updates.

This means HTTP checkpoint is not the primary collaboration durability
mechanism. Its practical role is to rebuild the SQL read-model.

### Execution uses separate immutable run snapshots

`workflow_run_nodes` and `workflow_run_edges` are separate tables. They
store the immutable graph snapshot for a run. Execution, reconciliation,
node state updates, and task linkage use those run snapshot tables after
a run is created.

Deleting the editable read-model tables does not delete run execution
state.

## Data Ownership Decision

Use Yjs as the single source of truth for the editable canvas graph.

| Data | Owner | Keep | Reason |
| --- | --- | --- | --- |
| Workflow metadata: id, account, name, timestamps, deleted flag | `workflows` | Yes | Stable metadata and list filtering |
| Editable nodes/edges | `workflow_yjs_updates` + `workflow_yjs_snapshots` | Yes | Authoritative collaborative graph document |
| Node task config, media slots, selected media view | Yjs node data | Yes | Part of editable graph document |
| Editable SQL read-model | `workflow_nodes`, `workflow_edges` | No | Duplicate graph copy with no current SQL query consumer |
| Run node/edge snapshot | `workflow_run_nodes`, `workflow_run_edges` | Yes | Immutable execution input |
| Run node state/dependencies/tasks/events | `workflow_run_*` tables | Yes | Execution state machine and audit trail |

## Node Config Location

Node configuration remains in `WorkflowCanvasNode.data`.

Typical shape:

```ts
node.data = {
  nodeType: 'image_generation' | 'video_generation' | 'flow_group' | 'node_group' | 'text',
  config: { task: { /* provider/model/prompt/settings */ } },
  mediaSlots: { /* input slots and source bindings */ },
  mediaView: { /* selected output */ },
  title: '...'
}
```

After this refactor the same payload exists in two places:

1. Editable truth: inside the Yjs workflow document, persisted through
   `workflow_yjs_updates` and `workflow_yjs_snapshots`.
2. Run truth: copied into `workflow_run_nodes.data` when a run is
   created.

It should no longer be copied into `workflow_nodes.data` because that
table should be removed.

## Target Architecture

```text
Browser UI
  -> React Flow interaction/render state
  -> Yjs document mutations for durable graph edits
  -> WebSocket sync
  -> API WorkflowYjsRoomService
  -> workflow_yjs_updates append log
  -> workflow_yjs_snapshots compacted snapshot

Run button
  -> API snapshots current server Yjs room/document
  -> validate graph and selected target
  -> copy nodes/edges into workflow_run_nodes/workflow_run_edges
  -> run executor uses immutable run snapshot
```

### Backend service shape

Split editable graph storage from workflow metadata:

```text
WorkflowMetadataRepository
  create(metadata)
  findById(id)
  list(accountId)
  touch(id, timestamp, version)
  delete(id)

WorkflowYjsRoomService
  initializeWorkflow(metadata, { nodes, edges })
  connect(metadata, websocket)
  snapshotForWorkflow(metadata)
  compactWorkflow(metadata, reason)
  getSnapshotVersion(workflowId)

WorkflowsService
  createWorkflow(input, accountId)
  getWorkflow(id, accountId)
  listWorkflows(accountId)
  createRun(workflowId, input, accountId)
```

`getWorkflow()` becomes composition:

```text
metadata = metadataRepository.findById(id)
assert account access
snapshot = workflowYjsRoomService.snapshotForWorkflow(metadata)
return Workflow { metadata + snapshot.nodes + snapshot.edges + snapshot.version }
```

`listWorkflows()` should not decode every Yjs snapshot. The current list
UI only renders `id`, `name`, and `updatedAt`, so the contract should
return workflow summaries for list endpoints:

```ts
WorkflowSummary = Pick<Workflow, 'id' | 'accountId' | 'name' | 'version' | 'createdAt' | 'updatedAt'>
```

If a future list page needs previews or graph stats, add explicit
summary fields maintained by the server, not full node arrays in the
list response.

### Create workflow

Current behavior inserts `workflows`, `workflow_nodes`, and
`workflow_edges`.

Target behavior:

```text
validate input nodes/edges
insert workflows metadata row
create a Y.Doc
import input nodes/edges into the Y.Doc
save initial workflow_yjs_snapshots row
return metadata + decoded snapshot
```

There should be no fallback path that imports from `workflow_nodes` after
the tables are dropped. Missing Yjs snapshot for a workflow is a data
integrity error in the new architecture.

### Get workflow

Target read order:

1. Check an active room in memory.
2. If no room exists, load `workflow_yjs_snapshots.snapshot_bin`.
3. Apply uncompacted `workflow_yjs_updates`.
4. Export `nodes` and `edges`.
5. Combine with `workflows` metadata.

Cold-start decode is acceptable because it happens on open, not on every
edit. Active rooms should be the hot path.

### Persist Yjs updates

Keep the WebSocket write path:

```text
append update -> apply update -> broadcast except sender
```

Strengthen compaction:

1. Save snapshot after N updates.
2. Save snapshot when the last connection leaves and the room is idle.
3. Save snapshot before critical server-side operations such as creating
   a run.
4. Prune update rows included in the saved snapshot so cold-start does
   not replay the entire edit history forever.
5. Touch `workflows.updated_at` on durable edit with throttling, so the
   canvas list reflects recent edits without rebuilding a read-model.

For single-process development, the existing in-memory per-workflow lock
is enough. Before multi-replica deployment, compaction and update pruning
must be protected by a database row lock or advisory lock.

### Create run

Current run creation reuses checkpoint:

```text
get workflow from SQL read-model
checkpoint Yjs to SQL read-model
call createRun with refreshed workflow.version
createRun reads SQL read-model again
copy nodes/edges into workflow_run_* snapshot tables
```

Target run creation:

```text
metadata = get workflow metadata and assert access
snapshot = workflowYjsRoomService.compactWorkflow(metadata, 'create_run')
validate snapshot nodes/edges
createRunFromSnapshot(metadata, snapshot, input)
copy snapshot.nodes -> workflow_run_nodes
copy snapshot.edges -> workflow_run_edges
```

`WorkflowRunsService.createRun()` should accept an already resolved
workflow snapshot instead of fetching the editable graph from the
definition repository.

`expectedWorkflowVersion` should be removed from
`CreateWorkflowRunInput` unless the product explicitly needs "run exactly
the version the client last rendered" semantics. The server already owns
the latest authoritative Yjs document at run time. If exact rendered
client state is required later, use a client state vector in the run
request and return a conflict only when the server cannot satisfy that
state vector.

Run records should continue to store `workflowVersion`, but its meaning
should become the Yjs snapshot version used for the run.

### Delete HTTP checkpoint

Remove:

```text
POST /api/workflows/:id/collab/checkpoint
CheckpointWorkflowCollaborationSchema
WorkflowCollaborationCheckpointResponseSchema
checkpointWorkflowCollaboration()
useWorkflowAutosave()
dirty/saving/acknowledgeSaved/setSaving/markDraftChanged as save-state APIs
workflowsService.checkpointWorkflow()
definitions.replaceDefinition()
```

The client should not trigger read-model materialization because there
is no read-model to materialize.

### Frontend state and UX

The frontend should display sync state, not save state:

```text
connecting -> Syncing
connected but not synced -> Syncing
synced -> Synced
disconnected -> Offline
```

Do not show `Saving`, `Unsaved`, or `Saved` for the editable graph. A
local edit mutates the Yjs document. If the WebSocket is connected, the
server persists the update through the collaboration path. If the socket
is disconnected, the UI should clearly show offline status.

Manual Save should not call a backend checkpoint. In the first cleanup,
either remove the command or leave the toolbar geometry intact while the
button is disabled/no-op behind a feature flag. The final UX should not
present a fake save command.

`selectOutput()` should only update Yjs and invalidate the relevant task
query. It should not call `saveNowAsync()`.

Offline editing is a separate feature. If offline editing is required,
add `y-indexeddb` on the client so local Yjs updates survive reloads
while the WebSocket is offline.

### React Flow performance rules

This refactor must preserve the existing canvas style and avoid adding
expensive visual effects. It should not introduce `backdrop-filter`,
`filter: blur()`, `drop-shadow()`, `mix-blend-mode`, masks, or transform
+ opacity animations on high-frequency canvas elements.

Keep the already-documented React Flow direction:

1. React Flow owns high-frequency pointer interaction and viewport
   rendering.
2. Yjs owns durable graph edits.
3. Awareness owns cursor, selection, and other non-persistent presence.
4. Broad `nodes` / `edges` subscriptions must stay out of frequently
   rerendering components.
5. Node components, callbacks, nodeTypes, edgeTypes, and static options
   should remain memoized.

This storage refactor should reduce backend and save-loop pressure. It
does not replace the separate render-state optimization work for large
canvases.

## Why Not Patch Autosave Instead?

An autosave patch is possible:

```text
replace state-vector equality with localChangeSeq acknowledgement
increase debounce
add cooldown
add leader election
add fetch timeout
throttle read-model checkpoint
```

That would stop the immediate loop, but it keeps the duplicate graph
copy and the client-owned read-model synchronization protocol. It also
adds more state to maintain:

- local dirty sequence
- in-flight sequence
- cooldown
- leader election
- soft/hard checkpoint split
- read-model throttle windows

In development, without migration constraints, that complexity is not
justified. The simpler architecture is to remove the duplicate editable
read-model and the checkpoint path that exists only for that read-model.

## SQL Querying Tradeoff

Dropping `workflow_nodes` and `workflow_edges` removes ad hoc SQL queries
over editable nodes and edges, such as "find workflows using model X".

Current code does not use those tables for any cross-workflow graph
query. They are only read and written by the workflow definition
repository.

If product requirements later need graph search, admin analytics, or
global dependency lookup, add an asynchronous projection:

```text
Yjs snapshot/update log -> server-side projector -> purpose-built index table
```

Rules for future projections:

1. They are derived data, not editable graph truth.
2. They are maintained server-side, never by frontend autosave.
3. They can be stale within a small bounded window.
4. Their schema should match the actual query need, not copy the entire
   React Flow graph by default.

## Implementation Plan

### Phase 1: Introduce metadata + Yjs document read APIs

1. Add workflow metadata repository methods that do not read nodes or
   edges.
2. Add `WorkflowYjsRoomService.snapshotForMetadata()` or equivalent.
3. Change `WorkflowsService.getWorkflow()` to compose metadata with Yjs
   snapshot data.
4. Change `listWorkflows()` and contracts to return summaries so list
   views do not decode every graph.
5. Keep old SQL read-model code temporarily only as a fallback for tests
   until snapshot initialization is covered.

Validation:

- API typecheck.
- `GET /api/workflows/:id` returns current Yjs document.
- `GET /api/workflows` does not query `workflow_nodes` or
  `workflow_edges`.

### Phase 2: Create workflow initializes Yjs directly

1. Create metadata row in `workflows`.
2. Import initial nodes/edges into a Y.Doc.
3. Save initial Yjs snapshot.
4. Return the decoded Yjs snapshot.
5. Remove create-time writes to `workflow_nodes` and `workflow_edges`.

Validation:

- New workflows open through WebSocket without SQL graph fallback.
- Missing Yjs snapshot fails loudly in tests.

### Phase 3: Run creation snapshots Yjs directly

1. Remove checkpoint usage from `POST /api/workflows/:id/runs`.
2. Add `createRunFromWorkflowSnapshot()` to `WorkflowRunsService`.
3. Validate selected node and flow group against the Yjs snapshot.
4. Copy the Yjs snapshot into `workflow_run_nodes` and
   `workflow_run_edges`.
5. Remove `expectedWorkflowVersion` from the create-run contract or
   change it to optional telemetry only.

Validation:

- Isolated-node and flow-group runs still create immutable run snapshots.
- Existing run executor tests continue to use `workflow_run_*` tables.
- Editing a workflow after creating a run does not change the active run.

### Phase 4: Remove frontend autosave/checkpoint

1. Delete `use-workflow-autosave.ts`.
2. Delete `checkpointWorkflowCollaboration()` from the web API client.
3. Remove `dirty`, `saving`, `acknowledgeSaved`, `setSaving`, and
   save-only `markDraftChanged` from the canvas store.
4. Change `SaveStatusPill` to Yjs connection/sync status only.
5. Remove `saveNowAsync()` from `selectOutput()`.
6. Remove manual Save behavior from `CanvasToolbar`.

Validation:

- Editing a graph does not POST `/collab/checkpoint`.
- Multi-tab editing no longer increments workflow version in a loop.
- The UI never gets stuck in "Saving".

### Phase 5: Drop editable read-model

1. Remove `workflow_nodes` and `workflow_edges` from schema and
   migrations.
2. Remove mapper/helper exports that exist only for those tables.
3. Remove `replaceDefinition()` from repository interfaces and fakes.
4. Remove tests that assert editable SQL read-model writes.
5. Keep all `workflow_run_*` schema and repository code.

Validation:

- `rg "workflowNodes|workflowEdges|workflow_nodes|workflow_edges"`
  only finds historical docs or dropped migration references.
- API typecheck and build pass.
- Workflow creation, open, edit, run, list, delete, and task history
  tests pass.

### Phase 6: Strengthen Yjs persistence operations

1. Add idle-room compaction before room cleanup.
2. Add critical-operation compaction before run creation.
3. Add update-log pruning for updates included in snapshots.
4. Touch workflow metadata `updatedAt` on durable edits with throttling.
5. Keep checkpoint timing logs temporarily under a new Yjs compaction log
   name until the new path is stable.

Validation:

- Cold-start room load applies a bounded number of updates.
- Logs show compaction time, snapshot bytes, update rows pruned, and
  room connection count.

## Acceptance Criteria

1. No frontend code path calls `/collab/checkpoint`.
2. No editable graph save state exists in the canvas store.
3. `workflow_nodes` and `workflow_edges` are absent from the active
   schema.
4. `workflow_run_nodes` and `workflow_run_edges` remain and are populated
   when a run is created.
5. Node configs still exist in editable Yjs node data and copied run
   node data.
6. A two-tab edit session does not loop workflow versions or show
   "Saving".
7. Creating a run uses the current server Yjs snapshot and produces an
   immutable run snapshot.
8. List workflow endpoint avoids decoding every workflow graph.
9. Cold-start room load is bounded by snapshot plus uncompacted updates,
   not the full historical update log.
10. Existing UI style remains materially unchanged except for removing
    misleading save-state text/behavior.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| A workflow exists without a Yjs snapshot | During development, fail loudly and add a one-time backfill script only if needed. New creates must always initialize Yjs. |
| List endpoint currently returns full `Workflow[]` | Introduce `WorkflowSummary` and update the list UI, which only needs metadata today. |
| `workflows.updatedAt` no longer changes on edit | Touch metadata from the Yjs durable-update path with throttling. |
| Update log grows forever | Prune included update rows during snapshot compaction. |
| Multi-replica compaction races | Before deployment, wrap compaction/prune in a DB row lock or advisory lock. |
| Need future SQL graph search | Add async server-side projections from Yjs snapshots, not frontend checkpoints. |
| Offline browser reload loses unsent updates | Add `y-indexeddb` if offline editing becomes a product requirement. |

## Architecture Decision Records

### ADR 1: Yjs is the editable graph SSOT

Accepted.

The editable workflow graph is a collaborative CRDT document. Yjs update
logs and snapshots are the correct persistence layer for that document.
The SQL read-model duplicates the same data and creates a synchronization
protocol that is currently failing to converge.

### ADR 2: Run snapshots stay relational

Accepted.

Run execution needs an immutable graph snapshot and queryable node state.
`workflow_run_nodes`, `workflow_run_edges`, node states, dependencies,
tasks, and events remain relational and are not replaced by Yjs.

### ADR 3: No frontend-maintained read-model projection

Accepted.

Frontend autosave must not be responsible for maintaining backend
projection tables. Future projections must be server-owned derived data.

### ADR 4: Remove `expectedWorkflowVersion` from create-run by default

Accepted for the development phase.

The server should snapshot the authoritative Yjs document at run creation
time. If exact client-rendered-state execution becomes a product
requirement, introduce a Yjs state-vector based contract instead of
reviving SQL read-model version checks.

## Implementation Record

Implemented code paths:

1. `packages/contracts/src/modules/workflows/workflow.schemas.ts`
   defines `WorkflowSummary`, returns summaries from workflow list, and
   removes `expectedWorkflowVersion` from create-run input.
2. `apps/api/src/modules/workflows/repositories/workflow-definition.repository.ts`
   and
   `apps/api/src/modules/workflows/repositories/drizzle-workflow-definition.repository.ts`
   are metadata-only. They no longer read or write editable nodes and
   edges.
3. `apps/api/src/db/schema.ts` no longer defines `workflow_nodes` or
   `workflow_edges`. All `workflow_run_*` tables remain.
4. `apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts`
   owns editable graph persistence through initial snapshot creation,
   update append, cold-start replay, threshold compaction, idle
   compaction, explicit run-time compaction, snapshot-version lookup,
   and update-log pruning.
5. `apps/api/src/modules/workflows/workflows.service.ts` composes
   metadata with Yjs snapshots for `getWorkflow()`, returns metadata
   summaries for `listWorkflows()`, initializes Yjs during
   `createWorkflow()`, and snapshots Yjs directly for `createRun()`.
6. `apps/api/src/modules/workflows/workflow-runs.service.ts` creates
   runs from an already resolved workflow snapshot, preserving immutable
   `workflow_run_nodes` and `workflow_run_edges`.
7. `apps/api/src/modules/workflows/workflow-collaboration.routes.ts`
   keeps WebSocket collaboration and snapshot read routes, and removes
   POST `/collab/checkpoint`.
8. `apps/web/src/features/workflow-canvas/hooks/use-workflow-autosave.ts`
   was deleted. The web API client no longer exposes checkpoint calls.
   The canvas store no longer carries editable save-state APIs.
9. `apps/web/src/features/workflow-canvas/components/SaveStatusPill.tsx`
   now reports Yjs sync state only. `CanvasToolbar` no longer exposes a
   manual save command.
10. `helloagents/wiki/*`, `helloagents/CHANGELOG.md`, and
    `helloagents/history/index.md` were updated so the project knowledge
    base no longer describes editable SQL graph storage or frontend
    checkpoint autosave as the current workflow architecture.

Important implementation details:

- WebSocket updates are persisted before being applied to the server
  Y.Doc, then broadcast after apply. If the threshold is reached, the
  same workflow lock compacts the already-applied document. This avoids
  both nested-lock deadlock and snapshots that miss the threshold update.
- Snapshot saves use an `expectedVersion` conditional repository write.
  Stale explicit compaction surfaces `WORKFLOW_VERSION_CONFLICT`; stale
  background compaction reloads from persistence and leaves the append
  log for a later successful checkpoint.
- Cold-start room load applies the persisted snapshot and then all
  uncompacted updates. The loaded update count is retained so the next
  compaction advances the snapshot version and prunes the update log.
- Compaction applies the current persisted update log before exporting
  a snapshot and deletes only the update ids covered by that snapshot.
- Snapshot reads and compaction recover from invalid append-log updates:
  the room is rebuilt from the last valid snapshot, valid updates are
  replayed, and invalid update ids are removed so bad operations cannot
  poison future snapshots.
- Snapshot saves notify workflow metadata through an injected callback.
  This keeps `WorkflowYjsRoomService` decoupled from the definition
  repository while keeping list summaries current.
- The only remaining `/collab/checkpoint` string in active source is a
  route test asserting that the removed endpoint returns `404`.

## Verification Record

Commands run on 2026-05-21:

```bash
bun --filter @mina/contracts build
bun --filter @mina/api typecheck
bun --filter @mina/web typecheck
bun test apps/api/src/modules/workflows/workflows.service.test.ts
bun test apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts
bun test apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts
bun test apps/api/src/modules/workflows/repositories/drizzle-workflow-repositories.integration.test.ts
bun test apps/api/src/index.test.ts apps/api/src/modules/workflows/workflows.service.test.ts apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts
bun test apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts apps/api/src/modules/workflows/workflows.service.test.ts apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts
bun --filter @mina/api build
bun --filter @mina/web build
git diff --check
```

Results:

- Contracts build passed.
- API typecheck passed.
- Web typecheck passed.
- API build passed.
- Web build passed.
- API index route tests passed.
- Core workflow service tests passed.
- Yjs room service tests passed.
- Collaboration route tests passed.
- Active source and current knowledge-base scans found no remaining
  `workflow_nodes` / `workflow_edges` references, and no frontend
  `Saving` / `Unsaved` / `Saved` / dirty-save-state residue.
- Drizzle workflow repository integration test was skipped because
  `MINA_POSTGRES_TEST_DATABASE_URL` was not configured.
- `git diff --check` passed.

Residual deployment note:

- The active schema removed `workflow_nodes` and `workflow_edges`.
  Because this is a development-stage refactor, no compatibility
  migration/backfill was implemented. If an existing local database has
  old workflows without Yjs snapshots, recreate the dev database or add a
  one-time local backfill before opening those workflows.
