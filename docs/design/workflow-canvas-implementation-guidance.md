# Mina Workflow Canvas Implementation Guidance

## Status

Date: 2026-05-18

This document is the implementation guide for the Mina workflow canvas. It turns the prior media object, workflow storage, task provider, and backend refactor designs into a concrete frontend and backend delivery plan.

The core decision is:

```text
Use Mina-native mediaSlots as the workflow input source of truth.
Do not copy Lumina's edge binding model.
Keep React Flow for canvas interaction and projection only.
```

## 1. Goal

Build Mina's first production-grade workflow canvas with:

1. React Flow based graph editing in `apps/web`.
2. Image generation, video generation, text, flow group, and node group nodes.
3. First-class MediaView nodes, including multi-output selection for image and video tasks.
4. Node-owned `data.mediaSlots` for media inputs.
5. URL-free edges that only project visual links and flow dependencies.
6. Backend APIs for workflow CRUD, node media view updates, run creation, node task history, model catalog, and media object upload.
7. A WebSocket notification base for same-account, multi-client freshness.
8. A maintainable provider/model form architecture based on TanStack Form and backend `ModelSpec`.
9. Performance rules for large canvases.

## 2. Non-Goals

This iteration must not:

1. Implement real multiplayer collaborative editing.
2. Introduce CRDT/OT, Redis, Kafka, Temporal, or a separate workflow engine.
3. Move provider-specific business rules into `packages/contracts`.
4. Persist React Flow transient fields such as `selected`, `dragging`, `measured`, or absolute positions.
5. Store media URLs in edges or copy upstream URLs into target node form config.
6. Treat "latest task output" as an implicit input source.
7. Replace the current API framework or storage architecture.

## 3. Current Repository Baseline

The current Mina codebase already has important backend pieces:

```text
packages/contracts/src/modules/canvas/canvas.schemas.ts
packages/contracts/src/modules/media/media.schemas.ts
packages/contracts/src/modules/workflows/workflow.schemas.ts
apps/api/src/modules/workflows/media/workflow-media-resolver.ts
apps/api/src/modules/workflows/group-conversion.ts
apps/api/src/modules/workflows/workflows.routes.ts
apps/api/src/modules/workflows/workflow-runs.service.ts
apps/api/src/modules/tasks/models/model-spec.ts
apps/api/src/modules/tasks/config/task-config-assembler.ts
apps/api/src/modules/media/media-object.service.ts
```

Current facts to preserve:

1. `WorkflowCanvasNode.data.mediaSlots` already exists for `image_generation` and `video_generation`.
2. `WorkflowCanvasNode.data.mediaView` already exists and supports `{ taskId, outputResourceId, outputIndex }`.
3. `WorkflowCanvasEdge.data.connection` already stores only `{ kind, targetSlot, targetSlotItemId }`.
4. `NodeMediaSlotItem.source` already supports `media_object`, `external_url`, `node_output/current_media`, and `node_output/run_output`.
5. `WorkflowMediaResolver` already resolves ordinary canvas `current_media` and flow-group `run_output`.
6. `WorkflowRunsService.preflightIsolatedNode` already blocks ordinary node execution when required upstream MediaView output is missing.
7. `downgradeFlowGroupToNodeGroup` already downgrades `run_output` to `current_media`.
8. Editable workflow graph data is stored in Yjs update logs and compacted snapshots; `workflows` stores metadata and run creation copies the current Yjs graph into immutable `workflow_run_nodes` / `workflow_run_edges`.
9. The current web app is Vite + React + TanStack Router, not Next.js. Lumina's Next.js detail is not a Mina baseline.

Current gaps to address:

1. `apps/web` only has a placeholder canvas list page. It does not yet have React Flow editor routes or node panels.
2. `apps/web/package.json` does not yet include `@xyflow/react`, `zustand`, `immer`, `@tanstack/react-form`, or a sortable list utility.
3. `GET /api/workflows/:id/nodes/:nodeId/tasks` currently returns node-task links from the service but the typed client declares `TaskListResponse`. This must be fixed before building `TaskHistoryCard`.
4. Public media object DTOs and media upload routes are not yet in `packages/contracts` and `apps/api`.
5. Workflow event schemas and WebSocket routes are not yet implemented.
6. MediaView selection is now a Yjs document mutation in the primary canvas flow; do not add a REST media-view patch for editable graph state.
7. Flow group run target selection should be refined so running a `flow_group` node and running an inner executable node have clear, separate semantics.

## 4. Reference Basis

Use these external references as constraints:

1. React Flow performance guidance recommends stable `nodeTypes`/`edgeTypes`, memoized node components, avoiding broad `nodes`/`edges` subscriptions, and reducing visible node work: <https://reactflow.dev/learn/advanced-use/performance>
2. React Flow sub-flow guidance uses `parentId`, parent-before-child ordering, and child positions relative to parent nodes: <https://reactflow.dev/learn/layouting/sub-flows>
3. React Flow save and restore examples show persisting stable graph state outside React Flow internals: <https://reactflow.dev/examples/interaction/save-and-restore>
4. TanStack Form supports dynamic validation and field composition suitable for provider/model-specific forms: <https://tanstack.com/form/latest/docs/framework/react/guides/dynamic-validation>
5. TanStack Query invalidation is the correct default response to WebSocket freshness events: <https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation>
6. Hono supports composed routes with `route()` and `basePath()`: <https://hono.dev/docs/api/routing>
7. Hono WebSocket helper supports WebSocket upgrades for Hono apps, including Bun-specific setup: <https://hono.dev/docs/helpers/websocket>

Also keep the existing project design documents as local source of truth:

```text
docs/design/media-object-workflow-input-architecture.md
docs/design/workflow-storage-and-concurrency-refactor.md
docs/design/task-provider-model-config-architecture.md
docs/design/backend-refactor-guidance.md
apps/web/DESIGN.md
```

## 5. Core Architecture

Use this shape:

```text
apps/web
  Vite + React + TanStack Router
  React Flow canvas
  Zustand + immer local draft state
  TanStack Query server state
  TanStack Form node configuration forms

packages/contracts
  WorkflowCanvasNode / WorkflowCanvasEdge
  NodeMediaSlots / NodeMediaSlotItem
  NodeMediaViewState
  TaskDraftConfig / TaskConfig
  MediaObject API DTOs
  Task model catalog DTOs
  Workflow WS event schemas

apps/api
  workflows: definitions, versioning, mediaView patch, runs, node task history
  tasks: provider/model specs, task lifecycle, task output resources
  media: media_objects, uploads, ready object lookup
  workflow-events: event publishing and WebSocket fanout
```

The guiding rule:

```text
mediaView = current output truth
mediaSlots = target input truth
edge = visual projection and flow dependency projection
```

## 6. Terms

### MediaView Node

An image or video generation node whose body displays a selected output resource.

For image nodes, the node preview displays the selected image directly. For video nodes, the node preview displays a cover or first frame by default and mounts video playback only on explicit user action.

### mediaView

The selected output of a node.

```ts
mediaView?: {
  taskId?: string
  outputResourceId?: string
  outputIndex?: number
}
```

For a task that generates multiple images, `mediaView` must identify the selected output as precisely as possible:

```ts
{
  taskId: 'task_xxx',
  outputResourceId: 'task_xxx:image:1',
  outputIndex: 1,
}
```

Downstream ordinary canvas links always resolve this explicit mediaView. They never infer from the newest task.

### mediaSlots

The ordered media input state on the target node.

```ts
B.data.mediaSlots.referenceImages = [
  {
    id: 'slot_item_a',
    slot: 'referenceImages',
    order: 0,
    required: true,
    source: {
      type: 'node_output',
      nodeId: 'A',
      resolve: 'current_media',
    },
  },
]
```

### Edge Projection

The React Flow edge is only a projection:

```ts
{
  source: 'A',
  target: 'B',
  data: {
    connection: {
      kind: 'media_link',
      targetSlot: 'referenceImages',
      targetSlotItemId: 'slot_item_a',
    },
  },
}
```

The edge must not store media URLs, media object IDs, task IDs, provider output payloads, or copied input values.

### Ordinary Canvas

Nodes outside a `flow_group`. Running B runs B only. Upstream A is not automatically run.

### flow_group

A group node where node-output media slots also define execution dependencies. Running the group or a node inside the group runs a DAG.

### node_group

An organizational group. It keeps media links but has no execution dependency semantics.

## 7. Data Invariants

These invariants must be enforced in contracts, validation, backend services, and frontend store helpers.

1. `node.type === node.data.nodeType`.
2. Parent nodes appear before child nodes in the persisted `nodes` array.
3. Child node `position` is relative to the parent when `parentId` is present.
4. Only `image_generation` and `video_generation` nodes may have `mediaView`.
5. Only executable media nodes may own `mediaSlots` in this iteration.
6. Every `node_output` slot item must have one matching edge.
7. Every media edge must point to one matching target slot item.
8. Edges must not contain URLs or task output resource payloads.
9. `firstFrame` and `lastFrame` accept at most one ready item.
10. Slot item ordering is owned by `NodeMediaSlotItem.order`, not by edge order.
11. Ordinary canvas `node_output` sources use `resolve: 'current_media'`.
12. Flow-group internal executable dependencies use `resolve: 'run_output'` plus a selector.
13. Converting `flow_group` to `node_group` must downgrade descendant `run_output` sources to `current_media`.
14. Missing required upstream media blocks execution with a 422 error and a user-visible warning.
15. Provider-specific fields stay in `TaskDraftConfig.params` and final `TaskConfig.params`.

## 8. Contracts Implementation

### 8.1 Keep Existing Canvas Contracts

Keep the current files as the core shared model:

```text
packages/contracts/src/modules/canvas/canvas.schemas.ts
packages/contracts/src/modules/media/media.schemas.ts
packages/contracts/src/modules/media/slot.schemas.ts
packages/contracts/src/modules/tasks/task.schemas.ts
packages/contracts/src/modules/workflows/workflow.schemas.ts
```

Do not introduce a second canvas node type system in `apps/web`.

### 8.2 MediaView Persistence

This section is superseded by
`docs/design/workflow-yjs-ssot-storage-refactor.md`.

MediaView selection is now persisted by mutating the live Yjs workflow
document. Do not reintroduce a version-sensitive REST
`PATCH /api/workflows/:id/nodes/:nodeId/media-view` path for the primary
canvas flow. If exact client-rendered-state execution becomes a product
requirement later, add a Yjs state-vector-based contract instead of an
editable SQL read-model version check.

### 8.3 Add Public Media Object Contracts

Move public media object DTOs into contracts:

```text
packages/contracts/src/modules/media/media-object.schemas.ts
```

Required schemas:

```ts
MediaObjectSchema
CreateMediaObjectSchema
CreateMediaObjectResponseSchema
GetMediaObjectResponseSchema
CreatePresignedMediaUploadSchema
CreatePresignedMediaUploadResponseSchema
CompletePresignedMediaUploadSchema
```

Direct upload payload:

```text
multipart/form-data
  file: File
  kind?: image | video | audio
  purpose: workflow_slot | task_input | temporary
  retention: temporary | task_scoped | project_scoped | library
```

Presigned upload payload:

```ts
{
  kind: 'image' | 'video' | 'audio'
  mimeType: string
  byteSize?: number
  purpose: 'workflow_slot' | 'task_input' | 'temporary'
  retention: 'temporary' | 'task_scoped' | 'project_scoped' | 'library'
}
```

Implementation rule:

1. Direct upload is required for paste and small files.
2. Presigned upload is the target path for larger video files.
3. Both flows must create `media_objects` and return a `MediaObject`.

### 8.4 Add Task Model Catalog Contracts

The frontend needs model capabilities and form descriptors without importing backend providers.

Add:

```text
packages/contracts/src/modules/tasks/model-catalog.schemas.ts
```

Suggested public shape:

```ts
export const TaskModelFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['select', 'number', 'integer', 'boolean', 'slider', 'text']),
  section: z.enum(['basic', 'advanced']).default('advanced'),
  defaultValue: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
})

export const TaskModelDescriptorSchema = z.object({
  kind: TaskKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.unknown(),
  defaults: z.record(z.string(), z.unknown()).default({}),
  fields: z.array(TaskModelFieldSchema).default([]),
})
```

Backend `ModelSpec` may expose a public descriptor method or metadata object. Do not expose raw provider SDK details or raw Zod internals over HTTP.

### 8.5 Workflow Event Contracts

The active runtime event contract lives in:

```text
packages/contracts/src/modules/workflows/workflow-event.schemas.ts
```

Event union:

```ts
workflow.run.updated
workflow.node.task.updated
```

Common event fields:

```ts
{
  id: string
  workflowId: string
  accountId: string
  type: string
  version?: number
  sourceClientId?: string
  createdAt: string
}
```

Payload rules:

1. `workflow.run.updated` includes `runId`, status, and the workflow version.
2. `workflow.node.task.updated` includes `nodeId`, `taskId`, task status, and task timestamps when available.

Editable graph definition, MediaView changes, media object readiness, and generic remote-conflict notices are not runtime event stream messages. Do not add event types for them unless there is a concrete publisher, consumer, and recovery contract.

## 9. Backend API Implementation

### 9.1 Route Style

Keep feature routes beside feature modules:

```text
apps/api/src/modules/media/media.routes.ts
apps/api/src/modules/tasks/tasks.routes.ts
apps/api/src/modules/workflows/workflows.routes.ts
apps/api/src/app/api-router.ts
```

Do not create a top-level `apps/api/src/routes` directory for feature logic.

### 9.2 Workflow Routes

Keep and harden these routes:

```text
GET    /api/workflows
POST   /api/workflows
GET    /api/workflows/:id
PUT    /api/workflows/:id
DELETE /api/workflows/:id
PATCH  /api/workflows/:id/nodes/:nodeId/media-view
GET    /api/workflows/:id/nodes/:nodeId/tasks
POST   /api/workflows/:id/runs
GET    /api/workflows/:id/runs
WS     /api/workflows/:id/events
```

Required changes:

1. MediaView writes must go through the live Yjs workflow document.
2. `GET node tasks` must return task history items, not just node-task links.
3. `POST runs` must support running a `flow_group` target and an executable target inside a flow group.
4. Mutations must publish workflow events after commit.

### 9.3 Node Task History API

`TaskHistoryCard` needs richer data than a link table.

Add a response schema:

```ts
export const WorkflowNodeTaskHistoryItemSchema = z.object({
  workflowRunId: z.string().min(1),
  nodeId: z.string().min(1),
  task: TaskSchema,
})

export const WorkflowNodeTaskHistoryResponseSchema = z.object({
  items: z.array(WorkflowNodeTaskHistoryItemSchema),
})
```

Backend implementation:

1. `WorkflowNodeTaskRepository.listNodeTaskLinks` may stay as a repository helper.
2. `WorkflowsService.getNodeTasks` must return joined or hydrated task rows.
3. Sort newest first by task creation time.
4. Include `task.output.resources`, cost, status, started/completed timestamps, and error.
5. Add pagination parameters before the list can become large.

### 9.4 Media Object API

Add:

```text
POST /api/media-objects
GET  /api/media-objects/:id
POST /api/media-objects/presigned-upload
POST /api/media-objects/:id/complete-upload
```

First delivery must implement direct `POST /api/media-objects`. Presigned upload should be added if large video upload is in the same milestone.

Direct upload route:

```ts
const form = await c.req.formData()
const file = form.get('file')
```

Rules:

1. Validate file presence and type.
2. Infer kind from MIME type if `kind` is omitted.
3. Enforce max upload size by environment config.
4. Store through `MediaObjectService.createFromBuffer`.
5. Use `origin: 'user_upload'`.
6. Use `purpose: 'workflow_slot'` for canvas media slot files.
7. Return `MediaObjectResponse`.
8. Do not publish workflow WS events for media object readiness. Components observe media objects through their normal query refresh flows.

Presigned route rules:

1. Create a `media_objects` row with `status: 'uploading'`.
2. Return `mediaObjectId`, `uploadUrl`, `storageKey`, `expiresAt`.
3. Completion validates account ownership and marks `status: 'ready'`.
4. Expired uploading objects are cleaned by the existing cleanup path.

### 9.5 Task Model Catalog API

Add:

```text
GET /api/tasks/models
```

Implementation:

1. `ModelRegistry.list()` returns registered specs.
2. Each spec exposes a public descriptor or is mapped by a `TaskModelCatalogService`.
3. The endpoint returns model descriptors grouped by `kind`.
4. Frontend forms use descriptors for provider/model selection and advanced field rendering.
5. Backend remains authoritative. Every run still goes through `ModelSpec.prepareConfig`.

Do not let frontend descriptors become the validation source of truth.

### 9.6 Ordinary Canvas Execution

For A connected to B outside a `flow_group`:

1. Creating the connection inserts a slot item in `B.data.mediaSlots`.
2. The slot item source is `node_output/current_media`.
3. The edge points to the slot item.
4. Running B resolves A's current `mediaView`.
5. If A has no current `mediaView`, required slots block the run.
6. If A has a `mediaView` but the resource kind does not match the target slot, block the run.
7. The backend injects the resolved media into `TaskConfig.media` only for the task being created.

The backend must never do:

```text
targetNode.config.task.media = sourceNode.latestTask.output.url
```

### 9.7 Flow Group Execution

For A connected to B inside the same `flow_group`:

1. The slot item source is `node_output/run_output`.
2. The slot item includes a selector:

   ```ts
   selector: {
     resourceKind: 'image',
     role: 'generated_image',
     index: 1,
   }
   ```

3. The DAG is derived from `mediaSlots`, not from edges alone.
4. Multiple start nodes are supported by selecting all nodes in the execution subgraph with no in-scope dependencies.
5. B resolves A from the current workflow run's node state output.

Target semantics:

1. Running a `flow_group` node executes all executable descendants in dependency order.
2. Running an executable node inside a `flow_group` executes the upstream closure required to produce that node.
3. Running an executable node outside a `flow_group` is ordinary isolated execution.

This means `WorkflowRunsService.createRun` needs a target resolver:

```text
selected flow_group
  -> runMode = flow_group
  -> scopeGroupNodeId = selectedNodeId
  -> executableNodeIds = all executable descendants

selected executable inside flow_group
  -> runMode = flow_group
  -> scopeGroupNodeId = nearest flow_group
  -> executableNodeIds = upstream closure ending at selected node

selected executable outside flow_group
  -> runMode = isolated_node
  -> executableNodeIds = [selectedNodeId]
```

Default selectors:

1. Image slots default to `{ resourceKind: 'image', role: 'generated_image', index: 0 }`.
2. Video slots default to `{ resourceKind: 'video', role: 'generated_video', index: 0 }`.
3. `firstFrame` defaults to `{ resourceKind: 'image', role: 'first_frame', index: 0 }` if the source model can output it, otherwise generated image index 0.
4. `lastFrame` defaults to `{ resourceKind: 'image', role: 'last_frame', index: 0 }`.

The UI must let users override the selector inside the upstream media slot.

### 9.8 flow_group to node_group Conversion

When converting a flow group to a node group:

1. Change the group node type and data to `node_group`.
2. Preserve child nodes.
3. Preserve media slot items.
4. Convert every descendant `node_output/run_output` source to `node_output/current_media`.
5. Preserve edges as visual media links.
6. Remove execution dependency semantics.

After conversion:

1. Running B does not run A.
2. B reads A's current `mediaView`.
3. Missing required upstream media blocks B.

The existing `downgradeFlowGroupToNodeGroup` helper is the correct backend starting point.

### 9.9 Auto-Selecting New Outputs

New task output must become `mediaView` only through an explicit update.

Recommended UX rule:

1. When the user runs a node, the client records the initiated `runId` and target node id.
2. When the task succeeds, if the node's `mediaView` has not changed since run start, the initiating client patches `mediaView` to the first selectable output.
3. If the user selected another output while the task was running, do not overwrite it.
4. If multiple outputs exist, select index 0 by default and show the thumbnail strip.
5. The user can then select any output from the node strip or `TaskHistoryCard`.

This keeps downstream behavior explicit. A new task is not "latest output" until the system or user patches `mediaView`.

## 10. WebSocket Freshness Base

### 10.1 Scope

This iteration only supports same-account, multi-client freshness:

1. A user opens the same workflow in two browser tabs or devices.
2. One client saves, runs, uploads, or changes `mediaView`.
3. Other clients receive an event and refresh or show conflict state.

No collaborative cursor, simultaneous editing merge, CRDT, or remote patch replay is required.

### 10.2 Backend Shape

Add:

```text
apps/api/src/modules/workflows/workflow-event-bus.ts
apps/api/src/modules/workflows/workflow-events.routes.ts
```

In-process event bus:

```ts
interface WorkflowEventBus {
  publish(event: WorkflowEvent): void
  subscribe(workflowId: string, listener: (event: WorkflowEvent) => void): () => void
}
```

Rules:

1. Publish only after the database mutation commits.
2. Include `sourceClientId` when supplied by the request.
3. The publisher should not depend on Hono response objects.
4. In-process fanout is enough for the first delivery.
5. Future multi-replica support should use PostgreSQL `LISTEN/NOTIFY` or a message broker behind the same bus interface.

Hono and Bun setup:

1. Use Hono's WebSocket helper for Bun.
2. Route should be `GET /api/workflows/:id/events`.
3. `apps/api/src/index.ts` must export both `fetch` and `websocket` when using Bun's WebSocket integration.

### 10.3 Client Behavior

Client creates a stable `clientId` per tab:

```text
crypto.randomUUID() -> sessionStorage['mina.workflow.clientId']
```

On event:

1. Ignore own event if `sourceClientId` matches the current client id.
2. If event targets another workflow, ignore.
3. Invalidate the exact TanStack Query key for metadata, runs, tasks, or media payloads.
4. Do not import REST workflow snapshots over an existing client ydoc.
5. MediaView changes arrive through the Yjs document and are projected into the canvas stores.
6. For `workflow.node.task.updated`, invalidate node task history only if the selected node matches.

Query key examples:

```ts
workflowKeys.list()
workflowKeys.detail(workflowId)
workflowKeys.nodeTasks(workflowId, nodeId)
workflowKeys.runs(workflowId)
taskKeys.detail(taskId)
mediaKeys.detail(mediaObjectId)
```

## 11. Frontend Module Structure

Create the canvas editor under a dedicated feature folder. Keep the existing `features/canvas` page as the workflow navigation/list surface.

```text
apps/web/src/features/canvas/
  api/
    workflow-list.client.ts
  components/
    canvas-page.tsx
    workflow-card.tsx
    new-workflow-card.tsx

apps/web/src/features/workflow-canvas/
  api/
    media-mutations.ts
    model-catalog-queries.ts
    workflow-queries.ts
    workflow-ws.ts
  components/
    WorkflowCanvasPage.tsx
    WorkflowCanvas.tsx
    CanvasToolbar.tsx
    SaveStatusPill.tsx
    RemoteUpdateBanner.tsx
    nodes/
      MediaGenerationNode/
        MediaGenerationNode.tsx
        MediaOutputStrip.tsx
        ImagePreview.tsx
        VideoPosterPreview.tsx
      TextNode.tsx
      FlowGroupNode.tsx
      NodeGroupNode.tsx
    edges/
      MediaEdge.tsx
    panels/
      BottomNodeDock.tsx
      NodeConfigCard.tsx
      TaskHistoryCard.tsx
      RunControls.tsx
    media-slots/
      MediaSlotList.tsx
      MediaSlotItem.tsx
      UpstreamMediaSlot.tsx
      LocalMediaUploader.tsx
      SlotOutputSelector.tsx
  forms/
    shared/
      MediaInputSection.tsx
      PromptField.tsx
      ProviderModelSection.tsx
      AdvancedSettingsPanel.tsx
    provider-renderers/
      image.tsx
      video.tsx
  store/
    canvas-store.ts
    selectors.ts
    graph-actions.ts
  utils/
    media-view.ts
    media-slots.ts
    flow-scope.ts
    react-flow-persistence.ts
```

Add routes:

```text
apps/web/src/routes/canvas.tsx
apps/web/src/routes/canvas.$workflowId.tsx
```

Navigation behavior:

1. `/canvas` lists workflows from `GET /api/workflows`.
2. Clicking a workflow card navigates to `/canvas/$workflowId`.
3. Creating a new workflow calls `POST /api/workflows`, then navigates to `/canvas/$workflowId`.

## 12. Frontend Dependencies

Add these dependencies to `apps/web/package.json`:

```text
@xyflow/react
zustand
immer
@tanstack/react-form
```

For media slot reordering, prefer one of:

1. `@dnd-kit/sortable` for accessible drag sorting.
2. A small local reorder control if dependency count must stay minimal.

Do not add a large UI framework. Continue using `@mina/ui`, Radix-backed components, lucide icons, and local CSS/Tailwind utilities.

## 13. Canvas State Model

### 13.1 Server State

TanStack Query owns fetched server state:

1. Workflow list.
2. Workflow detail.
3. Node task history.
4. Runs.
5. Task details.
6. Model catalog.
7. Media object details.

### 13.2 Canvas Projection State

Zustand owns the canvas projection and UI state. The editable graph
source is the live Yjs document:

```ts
interface CanvasProjectionState {
  workflowId: string
  version: number
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
  selectedNodeIds: string[]
  yjsConnectionStatus: 'connecting' | 'connected' | 'synced' | 'disconnected'
}
```

Rules:

1. Initialize draft from `workflowKeys.detail(workflowId)`.
2. Do not keep an unrelated copy of server task history in Zustand.
3. Node movement, node config changes, slot edits, edge edits, group edits, text edits, and MediaView selection mutate the live Yjs document.
4. Remote Yjs updates project one-way into Zustand/render stores.
5. Do not maintain frontend `dirty` / `saving` state for the editable graph.
6. Do not call a REST full-save or media-view patch from primary canvas editing.
7. Display Yjs sync state instead of save state.

### 13.3 Store Subscription Rules

1. Nodes must subscribe by `nodeId`, not to the whole `nodes` array.
2. Selected node ids should be stored separately for toolbar and dock rendering.
3. Avoid derived heavy arrays inside React components; use memoized selectors.
4. React Flow `nodes` and `edges` are passed from the draft store to `<ReactFlow />`, but node internals read only their own data.
5. Keep `nodeTypes` and `edgeTypes` outside the component or inside stable `useMemo`.

## 14. React Flow Canvas Implementation

Canvas shell:

```tsx
<ReactFlowProvider>
  <ReactFlow
    nodes={nodes}
    edges={edges}
    nodeTypes={nodeTypes}
    edgeTypes={edgeTypes}
    onNodesChange={actions.onNodesChange}
    onEdgesChange={actions.onEdgesChange}
    onConnect={actions.onConnect}
    onlyRenderVisibleElements
    fitView
  />
</ReactFlowProvider>
```

Rules:

1. `nodeTypes` and `edgeTypes` are module-level constants unless they need injected callbacks.
2. Use `React.memo` for all node and edge components.
3. Do not render task history inside every node.
4. Do not mount `<video>` in canvas nodes by default.
5. Do not render heavy thumbnails for off-screen nodes.
6. Keep node dimensions stable with CSS `width`, `min-height`, and `aspect-ratio`.
7. Use `parentId` for grouped nodes. Do not use old `parentNode`.
8. Parent nodes must be sorted before child nodes before save.
9. Do not persist React Flow internal transient fields.

## 15. Node UX

### 15.1 MediaGenerationNode

Use one component for both image and video generation nodes:

```text
MediaGenerationNode
  ImagePreview | VideoPosterPreview
  MediaOutputStrip
  StatusBadge
  Handles
```

Image node:

1. Displays the selected `mediaView` image.
2. If the current selected task has multiple image outputs, displays a compact thumbnail strip at the bottom of the node.
3. Clicking a thumbnail patches `mediaView`.
4. Empty state shows a quiet placeholder, not a marketing explanation.

Video node:

1. Displays `video_cover` or first frame as poster.
2. Does not mount `<video>` until the user opens playback.
3. If multiple video outputs exist, uses the same selector strip model.
4. Shows generated video and derived cover/last-frame resources as selectable outputs only when useful for downstream selection.

The node body is not the configuration form. It is the current output preview.

### 15.2 TextNode

Text node is a lightweight canvas note/prompt source for this iteration.

Rules:

1. It stores text in `data.config.text`.
2. It is not executable in the first canvas delivery.
3. It can later become a prompt source, but that must be a separate typed slot/reference design.

### 15.3 FlowGroupNode

Flow group is a parent container and executable scope.

Rules:

1. It can be selected and run as a group.
2. It visually communicates flow execution scope.
3. It accepts child nodes through React Flow sub-flow behavior.
4. It prevents cross-scope flow execution dependencies.

### 15.4 NodeGroupNode

Node group is only an organizational parent.

Rules:

1. It has no run button as an execution scope.
2. It preserves visual grouping and current-media links.
3. It does not convert media links into DAG dependencies.

## 16. Panel UX

Do not use a node-near "floating inspector" for the first implementation. It is easy to obscure edges and becomes unstable with zoom and pan.

Use a bottom floating dock when a node is selected:

```text
Desktop wide

┌───────────────────────────────────────────────────────────────┐
│ Canvas                                                        │
│                                                               │
│        selected MediaView node                                │
│                                                               │
│      ┌──────────────────────────────┐ ┌─────────────────────┐ │
│      │ NodeConfigCard               │ │ TaskHistoryCard     │ │
│      └──────────────────────────────┘ └─────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

Responsive rules:

1. Desktop wide: config card and history sidecar appear side by side.
2. Desktop narrow: history collapses behind a segmented control or an icon button in the dock.
3. Mobile/tablet: use a bottom drawer with `Config` and `History` tabs.
4. The dock is anchored to the viewport, not the selected node.
5. Closing selection closes the dock.

Design rules from `apps/web/DESIGN.md`:

1. Use floating UI islands with soft surfaces.
2. Avoid heavy sidebars and dense bordered panels.
3. Avoid 1px solid borders. Use tonal surface shifts and ghost outlines only when accessibility needs a boundary.
4. Use lucide icons for commands.
5. Keep cards focused. Do not place cards inside cards.
6. Keep operational UI quiet, scannable, and predictable.

## 17. NodeConfigCard

`NodeConfigCard` is the main operation area. It has exactly three sections:

```text
NodeConfigCard
  1. Media input section
  2. Prompt section
  3. Model and run section
```

### 17.1 Media Input Section

Renders `node.data.mediaSlots`.

Slot item states:

1. Local media object: thumbnail, file metadata, replace button, remove button, reorder handle.
2. Upstream current media: "From A", thumbnail if A has a selected mediaView, missing state if not.
3. Upstream run output inside flow group: "From A: generated_image #2", with selector control.
4. Empty slot: paste, upload, or connect prompt.
5. Invalid kind: warning state and blocked run.

User actions:

1. Paste file into section.
2. Upload file.
3. Replace a local media slot item.
4. Reorder multi-item slots.
5. Change target slot for an item when the model supports it.
6. Change flow-group output selector.
7. Remove slot item. If it is a `node_output` item, remove the matching edge too.

Local upload flow:

```text
file/paste -> POST /api/media-objects -> create media_object slot item -> save workflow draft
```

Upstream flow:

```text
connect A -> B -> create node_output slot item -> create matching edge -> save workflow draft
```

### 17.2 Prompt Section

Shared across all image/video providers.

Rules:

1. Stored in `node.data.config.task.prompt`.
2. Must not reset when provider/model changes.
3. Uses TanStack Form field state.
4. Supports future slash commands and asset mentions, but this iteration only needs robust text input.

### 17.3 Model and Run Section

Contains:

1. Provider selector.
2. Model selector.
3. Basic shared params such as aspect ratio, count, duration, or resolution when present in the model descriptor.
4. Advanced settings collapsible.
5. Run button and run status.

The Run button lives here, not in a separate inspector.

Rules:

1. Model switch changes provider/model-specific params only.
2. Media inputs and prompt remain unchanged on model switch.
3. Unsupported params from the previous model should be dropped or marked before save.
4. Run sends the selected node id only.
5. The API compacts the current server Yjs document before creating the run snapshot.
6. If Yjs is disconnected, show offline/sync state and let the server run use the latest persisted server document.

## 18. TaskHistoryCard

`TaskHistoryCard` is a sidecar for choosing current output. It is not part of the input form.

It displays:

1. Task status.
2. Created time.
3. Duration.
4. Cost or usage when available.
5. Error message for failed tasks.
6. Output resource thumbnails grouped by task.
7. Current `mediaView` selection marker.

Clicking an output:

1. Mutates the node `mediaView` in the live Yjs document.
2. Updates the node preview.
3. Updates downstream ordinary current-media slot previews.
4. Does not modify `mediaSlots`.
5. Does not modify edges.
6. Does not copy URLs into the target node config.

History query rules:

1. Query only when the node is selected and the history sidecar is open or recently opened.
2. Paginate before the list can grow unbounded.
3. Keep thumbnails small and fixed size.
4. Use the task output `resources` array as the source for selectable outputs.

## 19. MediaView Multi-Output Design

MediaView selection is a first-class workflow operation.

Task output example:

```ts
resources: [
  { id: 'r1', kind: 'image', role: 'generated_image', index: 0 },
  { id: 'r2', kind: 'image', role: 'generated_image', index: 1 },
  { id: 'r3', kind: 'image', role: 'generated_image', index: 2 },
]
```

Selecting the second output:

```ts
node.data.mediaView = {
  taskId: 'task_xxx',
  outputResourceId: 'r2',
  outputIndex: 1,
}
```

Required behavior:

1. Node preview switches immediately after the Yjs command is accepted locally.
2. Thumbnail strip active state follows `mediaView.outputResourceId` first, then `outputIndex`.
3. Downstream ordinary media slots project from the selected output.
4. Other clients receive the MediaView change through Yjs sync.
5. If the selected output no longer exists, show missing output state and ask the user to choose another history output.

Frontend helper:

```ts
resolveMediaViewResource(output, mediaView) {
  if (mediaView.outputResourceId) return by id
  if (mediaView.outputIndex !== undefined) return by index
  return first resource
}
```

Backend already has the equivalent `findOutputByMediaView` helper. Keep frontend and backend behavior aligned.

## 20. Connection Behavior

### 20.1 Ordinary Canvas Connection

When connecting A to B outside a shared flow group:

```text
onConnect
  -> decide targetSlot
  -> create NodeMediaSlotItem on B
  -> source = { type: 'node_output', nodeId: A, resolve: 'current_media' }
  -> create media edge with targetSlotItemId
  -> commit one Yjs graph transaction
```

Default target slots:

1. Image generation target defaults to `inputImages`.
2. Video generation target defaults to `firstFrame`.
3. If the user connects to a slot-specific handle, use that slot.
4. If multiple slots are plausible, open a lightweight slot picker in the bottom dock.

### 20.2 Flow Group Connection

When A and B are executable descendants of the same `flow_group`:

```text
onConnect
  -> create NodeMediaSlotItem on B
  -> source = { type: 'node_output', nodeId: A, resolve: 'run_output', selector }
  -> create media edge with targetSlotItemId
  -> commit one Yjs graph transaction
```

The slot UI must expose selector editing:

```text
From A: generated_image #2
```

### 20.3 Disconnect Behavior

When deleting a media edge:

1. Find `edge.data.connection.targetSlotItemId`.
2. Remove the matching item from the target node `mediaSlots`.
3. Re-normalize slot order.
4. Commit one Yjs graph transaction.

When deleting a `node_output` slot item:

1. Remove matching edge.
2. Remove slot item.
3. Re-normalize slot order.
4. Commit one Yjs graph transaction.

When deleting a local media object slot item:

1. Remove the slot item.
2. Do not delete the underlying media object by default.
3. Future media cleanup can handle unused temporary objects.

## 21. Provider Form Architecture

Use TanStack Form with a stable envelope:

```text
TaskDraftConfig
  kind
  provider
  model
  prompt
  params
```

Form composition:

```text
NodeTaskForm
  SharedMediaSection
  SharedPromptSection
  ProviderModelSection
  AdvancedSettingsRenderer
  RunControls
```

Rules:

1. Media section reads/writes `mediaSlots`, not `TaskDraftConfig.media`.
2. Prompt section reads/writes `TaskDraftConfig.prompt`.
3. Provider/model section reads/writes `kind`, `provider`, `model`, and `params`.
4. Advanced settings are generated from model descriptors or a frontend renderer registry.
5. Backend `ModelSpec.prepareConfig` remains authoritative for defaults, validation, and final config assembly.

Suggested frontend registry:

```ts
interface ModelFormRenderer {
  canRender(model: TaskModelDescriptor): boolean
  renderBasic(form, model): ReactNode
  renderAdvanced(form, model): ReactNode
}
```

Fallback renderer:

1. Uses `TaskModelDescriptor.fields`.
2. Renders unknown advanced fields safely.
3. Never invents provider-specific fields not returned by the catalog or local registry.

## 22. Visual Design Guidance

The canvas is a work surface, not a landing page.

Use:

1. Full-screen canvas workspace.
2. Floating toolbar island for create node, save, undo/redo later, zoom controls.
3. Bottom node dock for selected node configuration.
4. Compact node cards with fixed dimensions.
5. Quiet status pills for running/succeeded/failed states.
6. Icon buttons with tooltips for common commands.

Avoid:

1. Heavy sidebars that push the canvas.
2. Marketing hero sections.
3. Decorative orbs, bokeh blobs, or unnecessary gradients.
4. Long explanatory in-app text.
5. Large videos mounted in every node.
6. Card nesting.
7. Borders as the primary layout separator.

Recommended panel proportions:

```text
NodeConfigCard: 560-720px wide
TaskHistoryCard: 300-360px wide
Bottom dock max width: min(1120px, calc(100vw - 48px))
Node preview card: stable aspect ratio, no layout shift
```

## 23. Performance Requirements

React Flow:

1. Use `onlyRenderVisibleElements`.
2. Keep `nodeTypes` and `edgeTypes` stable.
3. Memoize node and edge components.
4. Avoid accessing the full `nodes` or `edges` arrays inside node components.
5. Keep selected node ids in store separately.
6. Do not calculate expensive graph selectors on every render.
7. Throttle or batch high-frequency node position updates before save.

Media:

1. Use thumbnails or covers in nodes and slot items.
2. Do not mount video players by default.
3. Lazy-query history.
4. Use fixed preview dimensions.
5. Avoid full-resolution images in small thumbnails.

Store:

1. Use per-node selectors.
2. Keep server data in Query, local draft in Zustand.
3. Avoid duplicating task history in Zustand.
4. Use immutable updates through immer helpers.

Persistence:

1. Save only stable React Flow fields.
2. Parent nodes before child nodes.
3. Normalize slot order before save.
4. Validate graph in frontend before calling `PUT`, but rely on backend validation for truth.

## 24. Error and Warning UX

Required user-visible warnings:

1. Required upstream MediaView output missing.
2. Upstream output kind does not match target slot.
3. Flow-group selector points to a missing run output.
4. Workflow version conflict.
5. Media upload failed.
6. Provider/model does not support current media combination.
7. Task failed or was cancelled.

API error mapping:

```text
409 WORKFLOW_VERSION_CONFLICT
422 WORKFLOW_UPSTREAM_OUTPUT_MISSING
422 WORKFLOW_UPSTREAM_OUTPUT_KIND_MISMATCH
422 WORKFLOW_ISOLATED_RUN_OUTPUT_SELECTOR
422 WORKFLOW_MEDIA_SLOT_EDGE_MISSING
422 WORKFLOW_MEDIA_EDGE_SLOT_MISSING
422 TASK_MODEL_UNSUPPORTED
422 TASK_CONFIG_INVALID
413 MEDIA_UPLOAD_TOO_LARGE
415 MEDIA_TYPE_UNSUPPORTED
```

Frontend display rules:

1. Blocking errors appear in the bottom dock near the Run button.
2. Slot-specific missing media appears directly inside the slot item.
3. Remote update conflicts appear as a top or bottom floating banner.
4. Avoid modal dialogs for routine validation errors.

## 25. Testing Strategy

### 25.1 Contracts

Run:

```text
bun --filter @mina/contracts typecheck
```

Test or typecheck:

1. Media slot source discriminated union.
2. Workflow event union.
3. Media object DTOs.
4. Model catalog descriptors.
5. `UpdateNodeMediaViewSchema` with expected version.

### 25.2 API Tests

Add or update tests under:

```text
apps/api/src/modules/workflows/*.test.ts
apps/api/src/modules/media/*.test.ts
apps/api/src/modules/tasks/*.test.ts
```

Required workflow cases:

1. Ordinary A -> B stores current-media slot and no URL in edge.
2. Running B blocks when A has no mediaView.
3. Running B resolves A's selected output, not latest task output.
4. Multi-output mediaView selection resolves by resource id.
5. Flow-group A -> B resolves run output by selector.
6. Flow-group execution supports multiple start nodes.
7. Running an inner flow node executes its upstream closure.
8. Flow-group cycle is rejected.
9. Converting flow group to node group downgrades `run_output` to `current_media`.
10. MediaView selection converges across tabs through Yjs sync.
11. `GET node tasks` returns hydrated task history.

Required media cases:

1. Direct upload creates ready media object.
2. Unsupported MIME is rejected.
3. Large upload is rejected.
4. Account ownership is enforced.
5. Presigned uploading objects can be completed if implemented.

Required WS cases:

1. Run lifecycle publishing emits `workflow.run.updated`.
2. Node task lifecycle publishing emits `workflow.node.task.updated`.
3. Subscribers for another workflow do not receive the event.

### 25.3 Web Verification

Run:

```text
bun --filter @mina/web typecheck
bun --filter @mina/web build
```

Manual browser scenarios:

1. Create workflow from `/canvas`.
2. Open workflow editor.
3. Add image node and run text-to-image.
4. Select a different generated image from node thumbnail strip.
5. Connect image node to another image node and verify slot preview follows mediaView.
6. Disconnect edge and verify slot item disappears.
7. Upload local image into a media slot.
8. Run video node and verify only poster renders in canvas.
9. Open same workflow in two tabs and verify mediaView change updates the other tab.
10. Edit in two tabs and verify Yjs converges without a save loop or overwrite banner.

If Playwright is added later, cover desktop and mobile screenshots for:

1. Canvas editor empty state.
2. Selected image node with config/history dock.
3. Flow group with two start nodes.
4. Mobile bottom drawer.

## 26. Implementation Sequence

### Phase 1 - Contracts

Files:

```text
packages/contracts/src/modules/media/media-object.schemas.ts
packages/contracts/src/modules/tasks/model-catalog.schemas.ts
packages/contracts/src/modules/workflows/workflow-event.schemas.ts
packages/contracts/src/modules/workflows/workflow.schemas.ts
packages/contracts/src/index.ts
packages/contracts/package.json
```

Tasks:

1. Add media object DTOs.
2. Add model catalog DTOs.
3. Add workflow event DTOs.
4. Keep MediaView writes on the live Yjs document in the primary canvas flow.
5. Fix typed client expectations for node task history.
6. Typecheck contracts.

### Phase 2 - Media and Model APIs

Files:

```text
apps/api/src/modules/media/media.routes.ts
apps/api/src/modules/media/media-object.service.ts
apps/api/src/modules/tasks/tasks.routes.ts
apps/api/src/modules/tasks/models/model-spec.ts
apps/api/src/modules/tasks/models/model-registry.ts
apps/api/src/app/api-router.ts
apps/api/src/client.ts
```

Tasks:

1. Add direct media upload route.
2. Add media object get route.
3. Add presigned upload route if large upload is included.
4. Add task model catalog endpoint.
5. Add tests.

### Phase 3 - Workflow API Hardening

Files:

```text
apps/api/src/modules/workflows/workflows.routes.ts
apps/api/src/modules/workflows/workflows.service.ts
apps/api/src/modules/workflows/workflow-runs.service.ts
apps/api/src/modules/workflows/repositories/*
apps/api/src/modules/workflows/validation.ts
```

Tasks:

1. Keep MediaView writes on the live Yjs workflow document.
2. Hydrate node task history response.
3. Add flow group target resolver.
4. Add upstream closure execution for selected inner flow node.
5. Confirm `validateCanvas` and `validateFlowGroup` enforce slot-edge consistency.
6. Add tests for ordinary canvas and flow group execution.

### Phase 4 - WebSocket Base

Files:

```text
apps/api/src/modules/workflows/workflow-event-bus.ts
apps/api/src/modules/workflows/workflow-events.routes.ts
apps/api/src/app/dependencies.ts
apps/api/src/app/api-router.ts
apps/api/src/index.ts
apps/web/src/features/workflow-canvas/api/workflow-ws.ts
```

Tasks:

1. Add event bus.
2. Add WS route.
3. Publish workflow definition, mediaView, run, task, and media events.
4. Add frontend WS client.
5. Invalidate exact Query keys.
6. Keep REST events out of live ydoc replacement; Yjs remains the graph sync channel.

### Phase 5 - Canvas Navigation

Files:

```text
apps/web/src/features/canvas/api/workflow-list.client.ts
apps/web/src/features/canvas/components/canvas-page.tsx
apps/web/src/routes/canvas.tsx
apps/web/src/routes/canvas.$workflowId.tsx
```

Tasks:

1. Replace placeholder canvas list with workflow list query.
2. Implement new workflow creation.
3. Navigate to workflow editor.
4. Keep visual style aligned with current Mina app shell.

### Phase 6 - React Flow Editor Shell

Files:

```text
apps/web/src/features/workflow-canvas/components/WorkflowCanvasPage.tsx
apps/web/src/features/workflow-canvas/components/WorkflowCanvas.tsx
apps/web/src/features/workflow-canvas/store/canvas-store.ts
apps/web/src/features/workflow-canvas/store/graph-actions.ts
apps/web/src/features/workflow-canvas/utils/react-flow-persistence.ts
```

Tasks:

1. Add React Flow provider and editor shell.
2. Load workflow detail into draft store.
3. Implement save.
4. Implement node and edge changes.
5. Implement selection and bottom dock visibility.
6. Validate persistence shape before save.

### Phase 7 - Nodes and Media Slots

Files:

```text
apps/web/src/features/workflow-canvas/components/nodes/*
apps/web/src/features/workflow-canvas/components/media-slots/*
apps/web/src/features/workflow-canvas/utils/media-view.ts
apps/web/src/features/workflow-canvas/utils/media-slots.ts
apps/web/src/features/workflow-canvas/utils/flow-scope.ts
```

Tasks:

1. Implement image/video MediaView nodes.
2. Implement multi-output thumbnail strip.
3. Implement text node.
4. Implement flow group and node group containers.
5. Implement media slot list and local uploader.
6. Implement upstream slot preview and missing-output state.
7. Implement flow-group selector UI.
8. Implement connect/disconnect slot item behavior.

### Phase 8 - Config and History Panels

Files:

```text
apps/web/src/features/workflow-canvas/components/panels/*
apps/web/src/features/workflow-canvas/forms/*
apps/web/src/features/workflow-canvas/api/model-catalog-queries.ts
apps/web/src/features/workflow-canvas/api/workflow-queries.ts
```

Tasks:

1. Implement `BottomNodeDock`.
2. Implement `NodeConfigCard`.
3. Implement `TaskHistoryCard`.
4. Wire TanStack Form.
5. Wire provider/model catalog.
6. Wire Run controls with save-before-run.
7. Wire mediaView patch from node strip and history outputs.

### Phase 9 - Execution, Polling, and Freshness

Files:

```text
apps/web/src/features/workflow-canvas/api/workflow-queries.ts
apps/web/src/features/workflow-canvas/api/workflow-ws.ts
apps/web/src/features/workflow-canvas/components/panels/RunControls.tsx
```

Tasks:

1. Run selected node or flow group.
2. Poll active runs/tasks with Query only when needed.
3. Auto-select first output after task success if safe.
4. Refresh history and MediaView after task completion.
5. Handle WS events and Yjs sync/offline state.

### Phase 10 - Verification and Performance Pass

Tasks:

1. Run API tests.
2. Run contracts typecheck.
3. Run web typecheck and build.
4. Test the manual scenarios in section 25.3.
5. Inspect React render behavior on a canvas with 100+ nodes.
6. Confirm videos are not mounted by default.
7. Confirm no edge stores URL-like fields.

## 27. Acceptance Criteria

The implementation is acceptable when:

1. A user can create a canvas from `/canvas` and open it.
2. A user can add image, video, text, flow group, and node group nodes.
3. Image node supports text-to-image when no image slot is present.
4. Image node supports image-to-image when image slots are present and model supports it.
5. Video node previews a poster without mounting video by default.
6. Generated multi-image outputs are selectable from the node strip and history card.
7. Selecting an output patches `mediaView` and downstream ordinary slots follow it.
8. A -> B ordinary connection creates a media slot item and edge without URL copying.
9. Missing required upstream current media blocks B with a warning.
10. Flow-group connections can select specific upstream outputs.
11. Flow-group run derives dependencies from mediaSlots and supports multiple start nodes.
12. Flow-group to node-group conversion removes execution dependency semantics but keeps media links.
13. Media upload creates Mina-managed `media_objects`.
14. Provider/model-specific form settings are pluggable and validated by backend specs.
15. Same-account second client receives freshness events.
16. Dirty local drafts are not overwritten by remote events.
17. `bun run typecheck` and relevant API tests pass.

## 28. Important Do Not Rules

1. Do not put upstream media URLs into target node config.
2. Do not put URLs into edge data.
3. Do not resolve ordinary canvas inputs from latest task output.
4. Do not make flow-group dependency decisions from edges alone.
5. Do not let frontend provider forms bypass `ModelSpec.prepareConfig`.
6. Do not persist React Flow transient fields.
7. Do not mount large videos in canvas nodes by default.
8. Do not import REST workflow snapshots over an active client ydoc.
9. Do not make node panels into a permanent heavy sidebar.
10. Do not implement collaboration semantics until the freshness base is stable.
