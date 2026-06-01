# 05 - Workflow Canvas Runtime Event Stream

This document records how the workflow canvas uses the runtime event
WebSocket alongside the Yjs collaboration channel. The two channels are
intentionally separate: Yjs owns collaborative document state, while the
runtime event stream owns notifications about backend execution facts.

## Purpose

The runtime event stream exists to notify open canvas clients that
backend state changed and that local projections or React Query caches
should be updated.

It is used for:

- Node task lifecycle updates, such as `queued`, `running`, `succeeded`,
  `failed`, and `cancelled`.
- Workflow run lifecycle updates.
- Media object readiness.
- Cache invalidation for task details, node task history, run lists, and
  media object details.
- Seeding or advancing the client-side runtime facts layer so unpinned
  media nodes can follow the latest generated task.

It is not used for collaborative canvas edits. Node positions, graph
structure, task configuration, media slots, and explicit media view pins
flow through Yjs.

## Channel Split

The canvas uses two WebSocket-backed channels:

| Channel | Endpoint | Owns | Persistence model |
|---------|----------|------|-------------------|
| Yjs collaboration | `/api/workflows/:id/collab/:room` | Collaborative canvas document state | Yjs updates and snapshots |
| Runtime events | `/api/workflows/:id/events` | Execution notifications and cache refresh triggers | In-memory pub/sub, with query refetch catch-up |

The page mounts both channels:

```ts
useWorkflowYjsSync(workflowId)
useWorkflowEventStream(workflowId)
```

This is a deliberate separation of concerns. A user-selected media view
pin is collaborative state and is stored in `node.data.mediaView` through
Yjs. A latest task id or live task status is runtime state and is
projected into a local facts store from events and workflow detail
responses.

## Backend Event Bus

The backend runtime stream is built around a small workflow-scoped
publish/subscribe interface:

```ts
interface WorkflowEventBus {
  publish(event: WorkflowEvent): void
  subscribe(workflowId: string, listener: (event: WorkflowEvent) => void): () => void
}
```

The current implementation is in-memory. Events are grouped by
`workflowId`; publishing an event synchronously invokes all listeners
currently subscribed for that workflow.

The WebSocket route upgrades `GET /api/workflows/:id/events`, subscribes
the socket to that workflow id on open, and sends each event as JSON:

```ts
workflowEventBus.subscribe(workflowId, (event) => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(event))
  }
})
```

Because the bus is in-memory, it is a live notification channel rather
than a durable event log. Clients must be able to recover from missed
events by refetching authoritative data.

## Event Contract

Runtime events are shared through `@mina/contracts` and are validated on
the client before use.

Important event types include:

- `workflow.node.task.updated`
  - Payload: `nodeId`, `taskId`, `status`, optional
    `taskCreatedAt`, optional `taskUpdatedAt`.
  - Meaning: a node-associated task changed lifecycle state.
- `workflow.run.updated`
  - Payload: `runId`, `status`.
  - Meaning: the workflow run list or active run status may have changed.
- `workflow.mediaObject.ready`
  - Payload: `mediaObjectId`.
  - Meaning: cached media object details may now resolve to usable media.
- `workflow.definition.updated`, `workflow.node.mediaView.updated`,
  `workflow.remote.conflict`
  - These exist in the shared event contract, but canvas document changes
    are still resolved through Yjs.

Task events include task timestamps so clients can merge late messages
and server snapshots deterministically. A late event for an older task
must not move a node away from a newer latest task.

## Backend Publishing Points

Workflow execution code publishes runtime events at the points where
backend facts actually change:

- `WorkflowRunEventPublisher.publishNodeTaskStatus(...)`
  emits `workflow.node.task.updated`.
- `WorkflowRunEventPublisher.publishRunStatus(...)`
  emits `workflow.run.updated`.
- Node execution publishes task status when a node task is queued,
  running, succeeded, or failed.
- The background scheduler publishes task status updates returned by
  task startup and async polling, so `queued -> running` transitions are
  visible to other clients.
- Workflow run reconciliation publishes terminal run statuses.
- Cancelling a workflow run publishes `workflow.run.updated(cancelled)`.

The publisher is created at the application composition root and injected
behind the `WorkflowRunEventPublisher` interface. Services depend on the
interface rather than directly constructing the bus implementation.

## Frontend Event Processing

The frontend creates the event URL with the same workflow id:

```ts
const url = new URL(`/api/workflows/${workflowId}/events`, base)
url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
```

`useWorkflowEventStream(workflowId)` owns the socket lifecycle:

1. Open the WebSocket.
2. Parse and contract-validate every JSON message.
3. Ignore events for other workflows.
4. Ignore events from the same `sourceClientId`, when present.
5. Deduplicate by event id.
6. Project accepted events through `applyWorkflowEvent`.
7. Reconnect with exponential backoff.
8. On reconnect, perform snapshot catch-up by refetching active workflow
   detail queries and invalidating run and node task history caches.

`applyWorkflowEvent` is the single reducer for translating runtime events
into frontend side effects:

- `workflow.node.task.updated`
  - Updates the node runtime facts store.
  - Invalidates `taskKeys.detail(taskId)` so previews can pick up new
    output or errors.
  - Invalidates `workflowKeys.nodeTasks(workflowId, nodeId)` so the
    history rail can refresh.
- `workflow.run.updated`
  - Invalidates `workflowKeys.runs(workflowId)`.
- `workflow.mediaObject.ready`
  - Invalidates `mediaKeys.detail(mediaObjectId)`.
- Yjs-owned definition and media view events are ignored by this reducer.

This keeps transport code, event semantics, and cache side effects
separate enough to test independently.

## Runtime Facts Layer

The event stream projects node task events into an ephemeral Zustand
store:

```ts
interface NodeRuntimeFacts {
  latestTaskId?: string
  latestTaskCreatedAt?: string
  status?: TaskStatus
  statusUpdatedAt?: string
  taskStatuses: Record<string, TaskStatus>
}
```

This store is not collaborative state. It is a per-client read model
derived from:

- Live runtime events.
- `WorkflowResponse.nodeRuntime` returned by `GET /api/workflows/:id`.
- Immediate local projection after creating a workflow run.

Media nodes resolve the task they should display with one rule:

```ts
node.data.mediaView?.taskId ?? runtime.latestTaskId
```

That means:

- If a user explicitly pins a historical output, the Yjs media view pin
  wins and all collaborators see the same choice.
- If no pin exists, the node follows the latest task from runtime facts.

The runtime store uses task timestamps to prevent stale server snapshots
or late events from moving a node back to an older task.

## Reconnect And Catch-Up

The event stream is not durable. A client can disconnect while another
client runs tasks. On reconnect, the client must recover by refetching
authoritative data.

The reconnect path therefore:

- Refetches active `workflowKeys.detail(workflowId)` queries. This
  refreshes `nodeRuntime`, which updates the runtime facts store.
- Invalidates `workflowKeys.nodeTasksRoot(workflowId)`, so any cached
  per-node task history is considered stale.
- Invalidates `workflowKeys.runs(workflowId)`, so run lists refresh.

This is snapshot catch-up, not event replay. It is the correct tradeoff
for the current stage: lower complexity while still recovering the
latest observable state after a missed event window.

## Interaction With Yjs Collaboration

Yjs remains the source of truth for the collaborative document. Store
actions for canvas edits call Yjs commands, not the runtime event bus.

Examples of Yjs-owned state:

- Node and edge creation/removal.
- Node frame changes.
- Task configuration and prompt text.
- Media slot changes.
- Explicit `node.data.mediaView` pins selected from history.

Examples of runtime-event-owned facts:

- Which task a node most recently ran.
- Whether a task is queued, running, succeeded, failed, or cancelled.
- Whether task detail or history should be refetched.
- Whether run lists should be refreshed.

The runtime event stream should never write latest task ids into
`node.data.mediaView`. Doing so would mix system facts with user
collaborative intent and would make history selection, undo semantics,
and multi-client behavior harder to reason about.

## Design Rules

1. Treat Yjs as the source of truth for collaborative canvas state.
2. Treat the runtime event stream as a notification and cache-refresh
   channel.
3. Keep latest task facts out of `node.data.mediaView`.
4. Include timestamps on task runtime events so clients can merge
   events and snapshots deterministically.
5. Make event consumers idempotent; duplicate events should not change
   the final state.
6. Use query refetch or invalidation as the recovery mechanism for
   missed events.
7. Do not rely on the in-memory event bus for durable audit history.
8. Keep event projection centralized in `applyWorkflowEvent`.

## Common Debugging Flow

When a canvas does not update after a task changes:

1. Check that the backend published `workflow.node.task.updated` or
   `workflow.run.updated` for the expected workflow id.
2. Check that `/api/workflows/:id/events` is connected in the browser.
3. Check that `parseWorkflowEvent` accepts the payload schema.
4. Check that `applyWorkflowEvent` invalidates the expected query key.
5. Check that `node-runtime-store` accepted the event and did not reject
   it as older than the current latest task.
6. Check that the UI resolves display through
   `mediaView.taskId ?? runtime.latestTaskId`.
7. If the issue appears after reconnect, verify that workflow detail,
   node task history, and run list caches were caught up or invalidated.
