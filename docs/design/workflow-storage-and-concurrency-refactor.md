# Workflow Storage and Concurrency Refactor Design

## Status

Date: 2026-05-16

This is a refactoring design document for the backend development phase. It intentionally does not preserve the current `workflow_runs.nodeStates` JSONB compatibility path. The target implementation may change database schema, contracts, repositories, and tests directly because production migration compatibility is not a constraint for this phase.

## Problem Statement

The current workflow model stores canvas definitions as JSONB arrays and stores workflow run node states as a JSONB record:

```text
workflows.nodes
workflows.edges
workflow_runs.snapshot_nodes
workflow_runs.snapshot_edges
workflow_runs.node_states
```

This is simple for early development, but it creates two hard limits:

1. `workflow_runs.node_states` is a hot field. Updating one node state rewrites the whole JSONB state object and can overwrite concurrent updates from another scheduler replica.
2. `workflows.nodes` and `workflows.edges` are large editable documents. For large canvases, moving one node or adding one edge requires reading, validating, serializing, and writing the whole graph document.

The task module already has the right distributed-worker shape: due tasks are claimed with `FOR UPDATE SKIP LOCKED` before provider work. Workflow runs need the same multi-replica safety while keeping the existing task lifecycle, polling mechanism, and state machine semantics.

## Goals

1. Preserve the current task polling and task state machine semantics.
2. Preserve the workflow run and workflow node state machine semantics.
3. Make workflow execution safe for multiple API/scheduler replicas.
4. Remove whole-JSON state overwrites from the workflow execution hot path.
5. Improve performance for large canvases, including workflows with hundreds or thousands of nodes.
6. Keep implementation simple: PostgreSQL remains the coordination system; no new queue, broker, actor runtime, or workflow engine is introduced.
7. Keep module boundaries clear and testable.

## Non-Goals

1. Do not replace the current task provider architecture.
2. Do not introduce Temporal, Kafka, Redis queues, or advisory-lock-only orchestration.
3. Do not design collaborative real-time editing.
4. Do not optimize frontend rendering in this document beyond backend API shape implications.
5. Do not preserve old `workflow_runs.nodeStates` storage for compatibility.

## Design Basis

The design uses these references as engineering constraints:

1. PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` is suitable for queue-like multi-consumer access because locked rows can be skipped by competing consumers. Reference: <https://www.postgresql.org/docs/current/sql-select.html>
2. PostgreSQL row-level locks protect rows being updated, but application read-modify-write still needs conditional updates or leases to avoid stale writes. Reference: <https://www.postgresql.org/docs/current/explicit-locking.html>
3. Large PostgreSQL row values can be TOASTed; rewriting large JSONB fields in hot paths increases write amplification and vacuum pressure. Reference: <https://www.postgresql.org/docs/current/storage-toast.html>
4. Azure's Competing Consumers pattern recommends multiple workers process work items from a shared queue while the queue coordinates distribution. Reference: <https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers>
5. AWS reliability guidance recommends idempotent mutating operations so retries and duplicate attempts do not create duplicate side effects. Reference: <https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_prevent_interaction_failure_idempotent.html>
6. React Flow performance guidance for large graphs recommends avoiding broad `nodes`/`edges` subscriptions and reducing visible node work. Backend APIs should support partial graph and partial state loading. Reference: <https://reactflow.dev/learn/advanced-use/performance>

## Current State to Preserve

Keep these state machines semantically unchanged.

Task:

```text
queued -> running -> succeeded
queued -> running -> failed
queued -> running -> cancelled
```

Workflow run:

```text
running -> succeeded
running -> failed
running -> cancelled
```

Workflow node:

```text
pending -> running -> succeeded
pending -> running -> failed
pending -> skipped
```

Current task scheduling remains:

```text
BackgroundTaskScheduler tick
  -> tasksService.startQueuedTasks()
  -> tasksService.pollAsyncTasks()
  -> workflowsService.reconcileRunningRuns()
```

The task module remains the canonical execution system. Workflow execution creates tasks and observes their terminal state.

## Target Data Model

### `workflows`

Workflow row stores only workflow-level metadata.

```ts
export const workflows = pgTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('workflows_account_updated_idx').on(table.accountId, table.updatedAt),
  ],
)
```

### `workflow_nodes`

Each canvas node is one row. Stable React Flow fields are columns. Node-specific business payload remains JSONB in `data`.

```ts
export const workflowNodes = pgTable(
  'workflow_nodes',
  {
    workflowId: text('workflow_id').notNull().references(() => workflows.id),
    nodeId: text('node_id').notNull(),
    type: text('type').$type<WorkflowNodeType>().notNull(),
    positionX: numeric('position_x', { precision: 14, scale: 3 }).notNull(),
    positionY: numeric('position_y', { precision: 14, scale: 3 }).notNull(),
    parentId: text('parent_id'),
    extent: text('extent').$type<'parent'>(),
    width: numeric('width', { precision: 14, scale: 3 }),
    height: numeric('height', { precision: 14, scale: 3 }),
    data: jsonb('data').$type<WorkflowNodeData>().notNull(),
    sortOrder: integer('sort_order').notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowId, table.nodeId] }),
    index('workflow_nodes_workflow_sort_idx').on(table.workflowId, table.sortOrder),
    index('workflow_nodes_workflow_parent_idx').on(table.workflowId, table.parentId),
    index('workflow_nodes_workflow_type_idx').on(table.workflowId, table.type),
  ],
)
```

Rules:

1. Persist only stable React Flow fields: id, type, position, parent, dimensions, data.
2. Do not persist selected, dragging, measured, absolute position, or UI-only transient state.
3. Keep `data.mediaSlots`, `data.mediaView`, and `data.config.task` in `data`.
4. Keep parent-before-child order through `sortOrder` and validation.

### `workflow_edges`

Each canvas edge is one row.

```ts
export const workflowEdges = pgTable(
  'workflow_edges',
  {
    workflowId: text('workflow_id').notNull().references(() => workflows.id),
    edgeId: text('edge_id').notNull(),
    type: text('type').notNull().default('media'),
    sourceNodeId: text('source_node_id').notNull(),
    targetNodeId: text('target_node_id').notNull(),
    sourceHandle: text('source_handle'),
    targetHandle: text('target_handle'),
    data: jsonb('data').$type<WorkflowEdgeData>().notNull(),
    sortOrder: integer('sort_order').notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowId, table.edgeId] }),
    index('workflow_edges_workflow_sort_idx').on(table.workflowId, table.sortOrder),
    index('workflow_edges_source_idx').on(table.workflowId, table.sourceNodeId),
    index('workflow_edges_target_idx').on(table.workflowId, table.targetNodeId),
  ],
)
```

Rules:

1. Edges are visual links and consistency projections for node-output media slot items.
2. Ordered media slot ownership remains in target node `data.mediaSlots`.
3. Edge validation must confirm node-output media slot sources have matching edges.

### `workflow_runs`

Run row stores run metadata, immutable snapshot identity, status, and distributed lease.

```ts
export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull().references(() => workflows.id),
    accountId: text('account_id').notNull().references(() => accounts.id),
    workflowVersion: integer('workflow_version').notNull(),
    runMode: text('run_mode').$type<WorkflowRunMode>().notNull(),
    selectedNodeId: text('selected_node_id').notNull(),
    scopeGroupNodeId: text('scope_group_node_id'),
    status: text('status').$type<WorkflowRunStatus>().notNull(),
    error: text('error'),
    nextReconcileAt: timestamp('next_reconcile_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    leasedBy: text('leased_by'),
    leaseToken: text('lease_token'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('workflow_runs_claim_idx').on(table.status, table.nextReconcileAt, table.leaseUntil, table.updatedAt),
    index('workflow_runs_account_created_idx').on(table.accountId, table.createdAt),
    index('workflow_runs_workflow_created_idx').on(table.workflowId, table.createdAt),
  ],
)
```

Rules:

1. `leaseUntil`, `leasedBy`, and `leaseToken` are only for scheduler ownership.
2. A lease is not part of business state.
3. A run with expired lease may be claimed by another replica.

### `workflow_run_nodes`

This table is the immutable node snapshot for a run. It prevents active run behavior from changing if the workflow is edited after run creation.

```ts
export const workflowRunNodes = pgTable(
  'workflow_run_nodes',
  {
    workflowRunId: text('workflow_run_id').notNull().references(() => workflowRuns.id),
    nodeId: text('node_id').notNull(),
    type: text('type').$type<WorkflowNodeType>().notNull(),
    positionX: numeric('position_x', { precision: 14, scale: 3 }).notNull(),
    positionY: numeric('position_y', { precision: 14, scale: 3 }).notNull(),
    parentId: text('parent_id'),
    extent: text('extent').$type<'parent'>(),
    width: numeric('width', { precision: 14, scale: 3 }),
    height: numeric('height', { precision: 14, scale: 3 }),
    data: jsonb('data').$type<WorkflowNodeData>().notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.nodeId] }),
    index('workflow_run_nodes_run_sort_idx').on(table.workflowRunId, table.sortOrder),
    index('workflow_run_nodes_run_parent_idx').on(table.workflowRunId, table.parentId),
  ],
)
```

### `workflow_run_edges`

This table is the immutable edge snapshot for a run.

```ts
export const workflowRunEdges = pgTable(
  'workflow_run_edges',
  {
    workflowRunId: text('workflow_run_id').notNull().references(() => workflowRuns.id),
    edgeId: text('edge_id').notNull(),
    type: text('type').notNull().default('media'),
    sourceNodeId: text('source_node_id').notNull(),
    targetNodeId: text('target_node_id').notNull(),
    sourceHandle: text('source_handle'),
    targetHandle: text('target_handle'),
    data: jsonb('data').$type<WorkflowEdgeData>().notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.edgeId] }),
    index('workflow_run_edges_run_source_idx').on(table.workflowRunId, table.sourceNodeId),
    index('workflow_run_edges_run_target_idx').on(table.workflowRunId, table.targetNodeId),
  ],
)
```

### `workflow_run_node_states`

This is the hot workflow execution table. It replaces `workflow_runs.nodeStates`.

```ts
export const workflowRunNodeStates = pgTable(
  'workflow_run_node_states',
  {
    workflowRunId: text('workflow_run_id').notNull().references(() => workflowRuns.id),
    nodeId: text('node_id').notNull(),
    status: text('status').$type<WorkflowNodeRunStatus>().notNull(),
    taskId: text('task_id').references(() => tasks.id),
    output: jsonb('output').$type<NodeExecutionOutput>(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.nodeId] }),
    index('workflow_run_node_states_run_status_idx').on(table.workflowRunId, table.status),
    index('workflow_run_node_states_task_idx').on(table.taskId),
  ],
)
```

Rules:

1. All node state transitions are conditional updates.
2. Never read a state row, mutate in memory, then overwrite without a status predicate.
3. Output can remain JSONB because it is written once at terminal success, not repeatedly.

### `workflow_run_node_dependencies`

Dependencies are derived at run creation from executable node media slot sources.

```ts
export const workflowRunNodeDependencies = pgTable(
  'workflow_run_node_dependencies',
  {
    workflowRunId: text('workflow_run_id').notNull().references(() => workflowRuns.id),
    nodeId: text('node_id').notNull(),
    dependsOnNodeId: text('depends_on_node_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.nodeId, table.dependsOnNodeId] }),
    index('workflow_run_node_dependencies_node_idx').on(table.workflowRunId, table.nodeId),
    index('workflow_run_node_dependencies_predecessor_idx').on(table.workflowRunId, table.dependsOnNodeId),
  ],
)
```

Rules:

1. Dependencies are a snapshot. Do not recalculate from current workflow definitions during a run.
2. Dependencies only matter between executable nodes inside the current flow-group scope.
3. `media_object` and `external_url` sources do not create executable-node dependencies.

### `workflow_run_node_tasks`

Keep this table, but enforce it as the idempotency boundary for node task creation.

```ts
workflow_run_node_tasks
  id
  workflow_run_id
  node_id
  task_id
  created_at

unique(workflow_run_id, node_id)
index(task_id)
```

Rules:

1. Insert the node-task link in the same transaction that creates the task and marks node state running.
2. Treat `unique(workflow_run_id, node_id)` as a correctness invariant, not just a lookup helper.

## Contract Shape

Public API responses may still expose the ergonomic array/object shape expected by clients:

```ts
Workflow {
  id
  accountId
  name
  version
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
  createdAt
  updatedAt
}

WorkflowRun {
  id
  workflowId
  accountId
  workflowVersion
  runMode
  selectedNodeId
  scopeGroupNodeId?
  snapshotNodes: WorkflowCanvasNode[]
  snapshotEdges: WorkflowCanvasEdge[]
  nodeStates: Record<string, WorkflowRunNodeState>
  status
  error?
  createdAt
  updatedAt
  startedAt?
  completedAt?
}
```

The repository assembles this DTO from normalized tables. This is not a storage compatibility path; it is just an API DTO mapping. Internally, executor code must use normalized query methods.

For large canvases, add lighter endpoints:

```text
GET /api/workflows
  -> workflow summaries only

GET /api/workflows/:id
  -> full workflow definition

GET /api/workflows/:id/nodes
  -> nodes with optional parentId/type/viewport filters

GET /api/workflows/:id/edges
  -> edges with optional source/target filters

GET /api/workflow-runs/:runId/node-states
  -> node states, filterable by status or updatedSince
```

Do not block the storage refactor on frontend endpoint changes. The first implementation can still assemble full response DTOs.

## Repository Ports

Split workflow persistence by responsibility. Avoid one repository class with every method.

```text
apps/api/src/modules/workflows/repositories/
  workflow-definition.repository.ts
  workflow-run.repository.ts
  workflow-run-node-state.repository.ts
  workflow-run-dependency.repository.ts
```

Suggested ports:

```ts
export interface WorkflowDefinitionRepository {
  create(input: WorkflowDefinitionCreate): Promise<Workflow>
  findById(id: string): Promise<Workflow | undefined>
  list(accountId?: string): Promise<WorkflowSummary[]>
  replaceDefinition(input: ReplaceWorkflowDefinitionInput): Promise<Workflow>
  updateNodeMediaView(input: UpdateNodeMediaViewPersistenceInput): Promise<Workflow>
  delete(id: string): Promise<boolean>
}
```

```ts
export interface WorkflowRunRepository {
  createRunWithSnapshot(input: CreateRunWithSnapshotInput): Promise<WorkflowRun>
  findRunById(id: string): Promise<WorkflowRun | undefined>
  claimRunningRuns(input: ClaimWorkflowRunsInput): Promise<ClaimedWorkflowRun[]>
  releaseRunLease(input: ReleaseWorkflowRunLeaseInput): Promise<void>
  markRunSucceeded(input: MarkRunTerminalInput): Promise<WorkflowRun>
  markRunFailed(input: MarkRunFailedInput): Promise<WorkflowRun>
  markRunCancelled(input: MarkRunTerminalInput): Promise<WorkflowRun>
}
```

```ts
export interface WorkflowRunNodeStateRepository {
  listRunnableNodes(input: ListRunnableNodesInput): Promise<WorkflowRunNodeExecutionItem[]>
  listRunningNodes(input: ListRunningNodesInput): Promise<WorkflowRunNodeExecutionItem[]>
  tryMarkNodeStarting(input: TryMarkNodeStartingInput): Promise<boolean>
  markNodeRunning(input: MarkNodeRunningInput): Promise<void>
  markNodeSucceeded(input: MarkNodeSucceededInput): Promise<void>
  markNodeFailed(input: MarkNodeFailedInput): Promise<void>
  summarizeRunStates(workflowRunId: string): Promise<WorkflowRunStateSummary>
}
```

`tryMarkNodeStarting` may either use a transient `starting` status or use a transaction-level row lock with `pending -> running` after task creation. To preserve the public state machine exactly, prefer no public `starting` status. Use row locking inside a transaction:

```sql
select *
from workflow_run_node_states
where workflow_run_id = $runId
  and node_id = $nodeId
  and status = 'pending'
for update
```

If no row is returned, another worker already claimed or completed the node.

## Module Structure

Target layout:

```text
apps/api/src/modules/workflows/
  workflows.routes.ts
  workflows.service.ts
  workflow-runs.service.ts
  validation.ts
  graph.ts
  task-config.ts
  run-state.ts
  repositories/
    workflow-definition.repository.ts
    workflow-run.repository.ts
    workflow-run-node-state.repository.ts
    workflow-run-dependency.repository.ts
    drizzle-workflow-definition.repository.ts
    drizzle-workflow-run.repository.ts
    drizzle-workflow-run-node-state.repository.ts
    drizzle-workflow-run-dependency.repository.ts
    in-memory-workflow-definition.repository.ts
    in-memory-workflow-run.repository.ts
  execution/
    workflow-run-claimer.ts
    workflow-run-reconciler.ts
    workflow-node-reconciler.ts
    workflow-node-task-starter.ts
    ready-node-selector.ts
  media/
    workflow-media-resolver.ts
    media-input-builder.ts
    node-media-slots.ts
```

Responsibility rules:

1. `workflows.service.ts` owns workflow definition CRUD only.
2. `workflow-runs.service.ts` owns run creation, lookup, cancellation, and scheduling entrypoints.
3. `execution/*` owns orchestration; it must not import Drizzle schema directly.
4. `repositories/*drizzle*` own SQL details, row locks, and conditional updates.
5. `media/*` owns media input resolution and must not know scheduler lease details.
6. `tasks` module remains responsible for task lifecycle and provider calls.

## Workflow Definition Write Path

### Create Workflow

1. Validate canvas DTO with current `validateCanvas`.
2. Insert `workflows`.
3. Bulk insert `workflow_nodes`.
4. Bulk insert `workflow_edges`.

All steps must run in one transaction.

### Replace Workflow Definition

Because this is development phase, use simple replace semantics:

1. Read workflow row by id.
2. Check version equals request version.
3. Validate full incoming canvas DTO.
4. In one transaction:
   1. Update workflow name/version/updatedAt.
   2. Delete old `workflow_edges`.
   3. Delete old `workflow_nodes`.
   4. Insert new `workflow_nodes`.
   5. Insert new `workflow_edges`.

This is simpler and safer than node-level patch diffing for the first refactor. It also keeps existing API behavior.

### Patch Node MediaView

Use targeted row update:

```sql
update workflow_nodes
set data = jsonb_set(data, '{mediaView}', $mediaViewJson::jsonb, true),
    updated_at = now()
where workflow_id = $workflowId
  and node_id = $nodeId
  and type in ('image_generation', 'video_generation')
```

Then increment `workflows.version`. If clearing mediaView, remove the key with `data - 'mediaView'` or write `null` consistently with contracts. Prefer removing the key to match optional schema semantics.

## Workflow Run Creation

`createRun(workflowId, selectedNodeId, expectedWorkflowVersion)`:

1. Load workflow definition from normalized nodes/edges.
2. Check version.
3. Validate selected node is executable.
4. Determine `scopeGroupNodeId`.
5. If isolated node:
   1. Preflight required `current_media` upstream sources using current workflow node `mediaView`.
   2. Initial executable snapshot contains selected node only for state rows, but run node/edge snapshots may include all nodes and edges if API responses need full context.
6. If flow group:
   1. Validate group scope and no cycles.
   2. Determine executable descendant nodes.
   3. Derive dependency rows from node-output media slot sources inside the group.
7. In one transaction:
   1. Insert `workflow_runs`.
   2. Insert `workflow_run_nodes` snapshot rows.
   3. Insert `workflow_run_edges` snapshot rows.
   4. Insert `workflow_run_node_states` pending rows for nodes in the execution scope.
   5. Insert `workflow_run_node_dependencies`.
8. Record `workflow.run.created`.
9. Call `reconcileRun(run.id)` once, as today.

Do not store `snapshotNodes`, `snapshotEdges`, or `nodeStates` JSONB on `workflow_runs`.

## Multi-Replica Scheduling

### Claiming Runs

`reconcileRunningRuns()` must not call `listRunsByStatus('running')`.

It must call a claim method:

```sql
select *
from workflow_runs
where status = 'running'
  and (next_reconcile_at is null or next_reconcile_at <= now())
  and (lease_until is null or lease_until <= now())
order by updated_at asc
limit $limit
for update skip locked
```

Within the same transaction, update claimed rows:

```sql
update workflow_runs
set leased_by = $instanceId,
    lease_token = $leaseToken,
    lease_until = now() + $leaseSeconds,
    updated_at = now()
where id in (...)
```

Return claimed runs with `leaseToken`.

Every terminal or lease release update must include the lease token:

```sql
where id = $runId
  and lease_token = $leaseToken
```

If zero rows are affected, the worker lost ownership and must stop processing that run.

### Lease Duration

Use a short lease because reconciliation is quick and provider calls do not happen inside workflow reconciliation.

Suggested defaults:

```text
workflowRunClaimBatchSize = 20
workflowRunLeaseSeconds = 30
workflowNodeBatchSize = 50
```

If a process crashes, another replica can claim the run after `leaseUntil`.

## Node Reconciliation Algorithm

`WorkflowRunReconciler.reconcileClaimedRun(claimedRun)`:

1. Reconcile currently running nodes.
2. Start ready pending nodes.
3. Summarize node states.
4. Mark run terminal if all nodes settled or any node failed.
5. If still running, set `nextReconcileAt` based on whether progress was made:
   1. progress made: now
   2. no progress: now + scheduler interval
6. Release or extend lease as needed.

### Running Node Observation

For each `workflow_run_node_states.status = 'running'`:

1. Read `taskId`.
2. Fetch task through `TasksService.getTask(taskId)`.
3. If task is `succeeded` and has output:
   1. Conditional update node state:

      ```sql
      update workflow_run_node_states
      set status='succeeded',
          output=$taskOutput,
          completed_at=now(),
          updated_at=now()
      where workflow_run_id=$runId
        and node_id=$nodeId
        and task_id=$taskId
        and status='running'
      ```

   2. Record `workflow.node.succeeded`.
4. If task is `failed` or `cancelled`:
   1. Mark node failed.
   2. Mark run failed.
5. Otherwise leave node running.

### Ready Node Selection

Ready nodes are pending nodes whose dependencies are all succeeded:

```sql
select n.workflow_run_id, n.node_id
from workflow_run_node_states n
where n.workflow_run_id = $runId
  and n.status = 'pending'
  and not exists (
    select 1
    from workflow_run_node_dependencies d
    join workflow_run_node_states p
      on p.workflow_run_id = d.workflow_run_id
     and p.node_id = d.depends_on_node_id
    where d.workflow_run_id = n.workflow_run_id
      and d.node_id = n.node_id
      and p.status <> 'succeeded'
  )
order by n.updated_at asc, n.node_id asc
limit $nodeBatch
```

### Starting a Node

Node start must be one transaction:

1. Lock the node state row:

   ```sql
   select *
   from workflow_run_node_states
   where workflow_run_id=$runId
     and node_id=$nodeId
     and status='pending'
   for update
   ```

2. Re-check dependencies inside the transaction.
3. Load the run node snapshot and run edge snapshots needed for media resolution.
4. Resolve media inputs.
5. Prepare task config with the existing `TaskConfigAssembler`.
6. Create task and input resources using a repository method that accepts a transaction.
7. Insert `workflow_run_node_tasks`.
8. Update node state to running with task id.
9. Record `workflow.node.task_created` and `workflow.node.started`.

Important: `TasksService.createTask()` currently owns task creation. To keep boundaries clean, add a task creation port that can participate in a transaction:

```ts
export interface TaskCreationService {
  createTask(input: CreateTaskInput): Promise<Task>
  createTaskInTransaction(tx: MinaDbTransaction, input: CreateTaskInput): Promise<Task>
}
```

If transaction sharing across modules becomes too invasive, use an idempotency key:

```text
task.id = deterministic createId from workflowRunId + nodeId
or tasks.idempotencyKey = workflowRunId:nodeId
```

The transaction-sharing approach is stricter. The idempotency-key approach is simpler if the task module should remain isolated from workflow DB transactions.

Recommended first implementation: add `idempotencyKey` to `tasks` and make `TasksService.createTask` idempotent for workflow-created tasks. This avoids cross-module transaction coupling while still preventing duplicate task side effects.

## Task Idempotency for Workflow Nodes

Add optional idempotency to tasks:

```text
tasks.idempotency_key nullable unique
```

Workflow node task key:

```text
workflow_run:{runId}:node:{nodeId}
```

Task creation flow:

1. Build task input.
2. Insert task with idempotency key.
3. On unique conflict, return existing task.
4. Insert task resources only if task was newly inserted.
5. Link node task with unique `(workflow_run_id, node_id)`.
6. Update node state to running.

This follows the idempotent-operation principle: retrying a mutating operation returns the same logical result instead of creating duplicate work.

## Media Resolution Changes

`WorkflowMediaResolver` currently accepts a whole `WorkflowRun` DTO and node DTO. After normalization, pass a smaller execution context:

```ts
interface ResolveWorkflowNodeMediaInput {
  run: {
    id: string
    workflowId: string
    accountId: string
    runMode: WorkflowRunMode
  }
  node: WorkflowCanvasNode
  edges: WorkflowCanvasEdge[]
  getSourceNode(nodeId: string): Promise<WorkflowCanvasNode | undefined>
  getSourceNodeState(nodeId: string): Promise<WorkflowRunNodeState | undefined>
}
```

This removes the need to materialize all snapshot nodes and all node states for every node execution.

Rules remain unchanged:

1. `media_object` resolves through `MediaObjectService.getReadyMediaObject`.
2. `external_url` becomes a direct media input after kind validation.
3. `node_output/current_media` reads source node snapshot `data.mediaView` and then the referenced task output.
4. `node_output/run_output` reads source node state output from `workflow_run_node_states`.

## Validation Rules

Keep the existing validation intent, but apply it to normalized rows.

Canvas validation:

1. Node `type` must match `node.data.nodeType`.
2. Parent node must exist and must be a group node.
3. Parent node must sort before child node.
4. Edge source and target must exist.
5. Node-output media slot item must have matching edge.
6. Media edge must point to a matching media slot item.

Flow group validation:

1. No cross-scope edges.
2. Executable dependency graph must be acyclic.
3. Only executable nodes produce workflow-run dependencies.

Database constraints should support validation but not replace it:

1. Primary keys prevent duplicate nodes and edges.
2. Foreign keys prevent orphan rows.
3. Unique node-task link prevents duplicate node task links.
4. Unique task idempotency key prevents duplicate workflow-created tasks.

## Performance Design

### Write Path

Hot-path writes after refactor:

```text
node pending -> running: update one workflow_run_node_states row
node running -> succeeded: update one workflow_run_node_states row
run running -> terminal: update one workflow_runs row
```

No hot path rewrites full `nodeStates` JSONB.

### Read Path

Execution reads should be scoped:

1. Ready pending nodes only.
2. Running nodes only.
3. Source node snapshot only when resolving one node.
4. Source node output only when a slot needs it.

Avoid loading all nodes, all edges, and all node states in the reconciler loop except when assembling public full-detail responses.

### Large Canvas Editing

First implementation can keep replace-definition API for simplicity, but storage must be normalized. Later, patch APIs can be added without another schema refactor:

```text
PATCH /workflows/:id/nodes/:nodeId/position
PATCH /workflows/:id/nodes/:nodeId/data
POST /workflows/:id/edges
DELETE /workflows/:id/edges/:edgeId
```

Do not persist drag updates per animation frame. Save on drag stop or debounce on the client.

## Error Handling and Recovery

### Worker Crash

If a scheduler process crashes while holding a run lease:

1. Lease expires.
2. Another replica claims the run.
3. Running node states are observed from their task ids.
4. Pending nodes are re-evaluated.

No explicit recovery job is required.

### Task Created but Node State Not Updated

Prevent with idempotency key and node-task unique link. Recovery rule:

1. If a task exists for `workflow_run:{runId}:node:{nodeId}` and node is still pending, link it and mark node running.
2. This recovery can run inside node start or as a small consistency repair step in reconciler.

### Lease Lost During Work

Every run terminal update and lease release must include `leaseToken`. If the update affects zero rows, stop processing. Do not continue to emit terminal events for a run that this worker no longer owns.

### Duplicate Scheduler Ticks

Safe because:

1. Run claim uses `SKIP LOCKED`.
2. Node start uses row locks and status predicates.
3. Task creation is idempotent.
4. Node terminal updates use task id and current status predicates.

## Testing Requirements

### Unit Tests

1. Dependency derivation from media slot sources.
2. Ready-node selection excludes nodes with unsucceeded dependencies.
3. Isolated node preflight accepts only valid current media upstreams.
4. `media_object`, `external_url`, `current_media`, and `run_output` media resolution.
5. Node state transition builders preserve public state machine semantics.

### Repository Tests

Use PostgreSQL-backed tests for concurrency-critical behavior. In-memory tests are not enough.

Required cases:

1. Two concurrent `claimRunningRuns` calls do not return the same run.
2. Expired lease can be reclaimed.
3. Non-expired lease cannot be reclaimed.
4. Conditional node running update fails when node is no longer pending.
5. Duplicate workflow node task creation returns the existing idempotent task.
6. Two concurrent node starts for the same run/node produce one task.
7. Updating one node state does not overwrite another node state.

### Service Tests

1. Isolated run creates exactly one task.
2. Flow group run starts all root nodes.
3. Downstream node starts only after all upstream dependencies succeed.
4. Failed node task fails the workflow run.
5. Cancelled workflow run stops further reconciliation.
6. Reconcile is idempotent when called repeatedly.

### Load and Performance Tests

Create synthetic workflows:

```text
100 nodes / 150 edges
1,000 nodes / 1,500 edges
5,000 nodes / 8,000 edges
```

Measure:

1. Workflow creation time.
2. Run creation time.
3. Ready-node query time.
4. Node state update time.
5. Full workflow response size and serialization time.
6. Full run response size and serialization time.

Acceptance targets for 1,000 nodes:

```text
ready-node query p95 < 100ms
single node state update p95 < 25ms
run creation p95 < 1s
no duplicate task creation under 4 scheduler replicas
```

Targets can be adjusted after real DB hardware is known.

## Implementation Order

### Phase 1: Schema and Ports

1. Replace workflow JSONB graph columns with normalized workflow node/edge tables.
2. Replace workflow run JSONB snapshot/state columns with normalized run node/edge/state/dependency tables.
3. Add workflow run lease fields.
4. Add optional task idempotency key.
5. Define repository ports.

### Phase 2: Definition Repository

1. Implement create workflow transaction.
2. Implement replace workflow definition transaction.
3. Implement `findById` DTO assembly.
4. Implement list summaries.
5. Implement targeted mediaView update.
6. Update existing workflow CRUD tests.

### Phase 3: Run Creation

1. Implement normalized run snapshot creation.
2. Implement initial node state rows.
3. Implement dependency snapshot rows.
4. Keep public `WorkflowRun` response assembled from normalized rows.
5. Update run creation tests.

### Phase 4: Multi-Replica Reconciliation

1. Implement `claimRunningRuns`.
2. Replace `listRunsByStatus('running')` in scheduler path.
3. Implement ready-node query.
4. Implement node start with idempotent task creation.
5. Implement running-node observation.
6. Implement terminal run aggregation.

### Phase 5: Concurrency Tests

1. Add PostgreSQL integration tests for claim and duplicate node start.
2. Add task idempotency tests.
3. Add repeated reconcile tests.
4. Add lease expiry tests.

### Phase 6: Performance Pass

1. Add indexes based on query plans.
2. Add DTO summary endpoints if full responses are too heavy.
3. Add large workflow benchmark fixtures.
4. Document expected scheduler tuning values.

## Engineering Guardrails

1. Do not add a `starting` public node status unless the contracts are intentionally updated. Prefer row locks and transactions.
2. Do not update node state without a status predicate.
3. Do not create workflow node tasks without idempotency.
4. Do not load full run snapshots in the inner node execution loop.
5. Do not store UI transient React Flow fields.
6. Do not introduce new infrastructure for orchestration until PostgreSQL coordination is proven insufficient.
7. Keep provider calls only in task lifecycle. Workflow reconciliation only creates tasks and observes tasks.
8. Keep SQL concurrency behavior in repository tests, not just service mocks.

## Recommended ADR

Decision: Use normalized relational tables for workflow graph and workflow run state, with PostgreSQL row locks and leases for multi-replica reconciliation.

Rationale:

1. It preserves the current task and workflow state machines.
2. It removes the hot JSONB overwrite problem.
3. It supports multi-replica schedulers with a known queue-consumer pattern.
4. It avoids adding distributed systems infrastructure during backend development.
5. It creates a clean path for large canvas APIs and partial loading.

Rejected alternatives:

1. Keep JSONB and use `jsonb_set`: improves partial update syntax but still updates the same hot row and does not solve run-level contention cleanly.
2. Use advisory locks only: reduces duplicate processors but is easier to misuse and does not improve data model performance.
3. Use Redis locks: adds infrastructure and failure modes without eliminating database state consistency requirements.
4. Use Temporal now: strong workflow engine, but too large a shift for the current codebase and would replace rather than preserve much of the existing workflow execution design.

