# Mina Media Object and Workflow Input Architecture Guide

## 1. Goal

This document defines the backend architecture for Mina media resources and workflow inputs. It covers:

1. A unified storage model for user uploads, one-off form uploads, canvas media slot inputs, and task output media.
2. Object storage key conventions that keep account-level aggregation, accounting, cleanup, and authorization boundaries clear.
3. A stable `WorkflowCanvasNode.data.mediaSlots` structure that supports local media, media objects, upstream node outputs, future media library references, and ordered mixed items inside a slot.
4. Media resolution rules for isolated canvas execution and flow-group execution.
5. The relationship between task input/output resource snapshots and `media_objects`.
6. The engineering location for task output mirroring, video first-frame/last-frame/cover generation, and provider output normalization.

This document does not define frontend interaction API details. Upload form APIs, media library UI APIs, and canvas form APIs can be designed later. The backend core structure, runtime flow, persistence model, and module boundaries should be stabilized first.

## 2. Current Architecture Analysis

Parts that are already in a good shape:

1. Provider and model logic has been split into `ModelSpec`, `ModelRegistry`, and `ProviderRouter`.
2. `ModelSpec.prepareConfig(...)` is the entry point for provider/model parameter validation and media capability validation.
3. `TaskLifecycle` calls providers only through `TaskProvider`; it does not depend directly on Google or Volcengine.
4. `ObjectStorage` already abstracts S3 and in-memory implementations.
5. `task_resources` can record task input/output resource indexes.
6. Video output post-processing belongs to the shared output pipeline through `OutputPostProcessor` and `VideoFrameGenerator`.

Problems this architecture must solve:

1. Media files need a unified primary table. Upload media and task outputs must support storage accounting, lifecycle management, and permission tracing through the same model.
2. Object storage needs a business-level media object key convention, not only a low-level storage adapter.
3. Workflow media inputs must not be derived only from incoming edges:

   ```ts
   const inputs = await this.resolveIncomingMediaInputs(run, node)
   ```

   Incoming edges can express "a connection feeds this node", but they cannot naturally express an ordered media slot containing a local upload, media object, upstream A, and upstream B.
4. `workflows.edges` should not own media input semantics. Edges are suitable for graph connections, visual links, and flow dependencies, not as the single source of truth for ordered media slot state.
5. `task_resources` must track where each input came from: media object, slot, slot item, slot order, or upstream node output.
6. Provider outputs should be mirrored into Mina-owned object storage instead of leaving most output resources as provider URL references.

## 3. Design Basis

This architecture uses the following engineering principles.

### 3.1 Ports & Adapters

The core system should not depend on a specific object storage, provider, or external API. The application core talks through ports; S3, in-memory storage, Google, and Volcengine are adapters.

Implementation rules:

1. `MediaObjectService` depends on the `ObjectStorage` port, not directly on the S3 SDK.
2. `TaskOutputFinalizer` depends on `MediaObjectService` and the `RemoteMediaFetcher` port.
3. `WorkflowMediaResolver` depends on media objects, tasks, and workflow-run snapshots; it does not depend on providers.

Reference: Alistair Cockburn, Hexagonal Architecture
<https://alistair.cockburn.us/hexagonal-architecture>

### 3.2 Gateway Pattern

External system fields should not leak into core models. Provider clients and object storage clients should be wrapped behind gateways that translate external API details into Mina's internal language.

Implementation rules:

1. Provider mappers convert provider responses into `NodeExecutionOutput`.
2. `TaskOutputFinalizer` then converts external URLs or data URLs into Mina `media_objects`.
3. Workflow and task code must not handle S3 SDK types, Google file API fields, or Volcengine raw response fields directly.

Reference: Martin Fowler, Gateway
<https://martinfowler.com/articles/gateway-pattern.html>

### 3.3 Blob / Attachment Separation

Rails Active Storage separates file blobs from business references. Mina should not copy the Rails schema directly, but it should use the same boundary:

1. `media_objects` is the file entity table.
2. Workflow media slots, task resources, and future media library items are references to file entities.

Reference: Rails Active Storage Overview
<https://guides.rubyonrails.org/active_storage_overview.html>

### 3.4 S3 Prefix Organization

S3 is a flat object store. Prefixes are key prefixes, not real directories, but they are useful for organization, browsing, operational inspection, and cost analysis.

Implementation rules:

1. Every user-owned object must live under `users/{accountId}/...`.
2. Media objects are grouped by `mediaObjectId`.
3. `media_objects.byteSize` is the application source of truth for live accounting. S3 prefixes and Storage Lens are operational aids, not the product source of truth.

References:

1. AWS S3 organizing objects using prefixes
   <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html>
2. AWS S3 presigned URLs
   <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html>
3. AWS S3 Storage Lens prefix metrics
   <https://repost.aws/knowledge-center/s3-storage-lens-prefix-metrics>

### 3.5 Discriminated Unions

Media slot sources have multiple shapes. They should use discriminated unions to avoid invalid states caused by many mutually exclusive optional fields.

Implementation rules:

1. `NodeMediaSlotItem.source.type` is the discriminator.
2. `TaskResourceSource.type` is the discriminator.
3. Zod schemas use `z.discriminatedUnion(...)`.

References:

1. Zod discriminated unions  
   <https://zod.dev/api?id=discriminated-unions>
2. TypeScript narrowing  
   <https://www.typescriptlang.org/docs/handbook/2/narrowing.html>

### 3.6 React Flow v12 Persistence Rules

Mina contracts should work well with React Flow v12, but Mina should persist only stable business fields.

Implementation rules:

1. Use `parentId`; do not use the old `parentNode`.
2. Parent nodes must appear before child nodes in the nodes array.
3. Child node positions are relative to the parent.
4. Do not persist UI-only temporary fields such as `selected`, `dragging`, `measured`, or `positionAbsolute`.
5. `mediaSlots` lives in Mina node data and does not depend on React Flow internal state.

References:

1. React Flow Sub Flows  
   <https://reactflow.dev/learn/layouting/sub-flows>
2. React Flow TypeScript / Types  
   <https://reactflow.dev/api-reference/types>
3. React Flow Save and Restore  
   <https://reactflow.dev/examples/interaction/save-and-restore>

## 4. Core Principles

1. File bytes are owned only by `media_objects`. Workflows and tasks store references and snapshots.
2. `media_objects` is not the media library. It is Mina's primary table for managed media files, including one-off uploads.
3. The future media library is an optional higher-level table, for example `media_library_items`, that references `media_objects`.
4. Workflow node media slot order belongs to the target node's `data.mediaSlots`, not to edges.
5. Edges express graph connections, visual relationships, and flow dependency projections.
6. Isolated canvas execution runs only the selected node. Media from upstream nodes is read from the source node's current `mediaView`.
7. Flow-group execution runs a DAG. Media from upstream nodes is read from the current `workflow_run.nodeStates[source].output`.
8. `TaskConfig.media` is the final media input snapshot for one task.
9. `task_resources` is the task-level resource index and must be able to trace slot, order, source, and `mediaObjectId`.
10. Provider specs do not know about workflow and do not perform object storage uploads.
11. Task output mirroring and video frame generation belong to shared output finalizer/post-processor services, not to individual provider specs.

## 5. Target Data Model

### 5.1 `media_objects`

Add the table:

```ts
export const mediaObjects = pgTable(
  'media_objects',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),

    kind: text('kind').$type<ResourceKind>().notNull(),
    status: text('status').$type<'uploading' | 'ready' | 'failed' | 'deleted'>().notNull(),

    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull(),
    url: text('url').notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size').notNull().default(0),
    checksum: text('checksum'),

    width: integer('width'),
    height: integer('height'),
    durationSeconds: numeric('duration_seconds', { precision: 12, scale: 3 }),

    origin: text('origin')
      .$type<'user_upload' | 'task_output' | 'external_import' | 'system_generated'>()
      .notNull(),
    purpose: text('purpose')
      .$type<'task_input' | 'task_output' | 'workflow_slot' | 'temporary' | 'preview'>()
      .notNull(),
    retention: text('retention')
      .$type<'temporary' | 'task_scoped' | 'project_scoped' | 'library'>()
      .notNull(),

    parentMediaObjectId: text('parent_media_object_id'),
    sourceTaskId: text('source_task_id').references(() => tasks.id),
    sourceTaskResourceId: text('source_task_resource_id'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('media_objects_account_created_idx').on(table.accountId, table.createdAt),
    index('media_objects_account_status_idx').on(table.accountId, table.status),
    index('media_objects_source_task_idx').on(table.sourceTaskId),
    uniqueIndex('media_objects_storage_key_uidx').on(table.storageKey),
  ],
)
```

Field meanings:

1. `origin` describes how the file entered Mina.
2. `purpose` describes the current business use.
3. `retention` describes the lifecycle policy.
4. `parentMediaObjectId` links derived media such as video frames, covers, thumbnails, and transcodes back to the source media object.
5. `sourceTaskId/sourceTaskResourceId` supports task output lineage.

Reserved for later, not required in this iteration:

```ts
media_library_items {
  id
  accountId
  mediaObjectId
  title
  tags
  collectionId
  favorite
  createdAt
  updatedAt
}
```

### 5.2 Object Storage Key Convention

The low-level key shape is:

```text
users/{accountId}/{scope}/{objectName}
```

Keep this account-isolated root. Media objects should use the `media` scope:

```text
users/{accountId}/media/{mediaObjectId}/original.{ext}
users/{accountId}/media/{mediaObjectId}/first-frame.jpg
users/{accountId}/media/{mediaObjectId}/last-frame.jpg
users/{accountId}/media/{mediaObjectId}/cover.jpg
users/{accountId}/media/{mediaObjectId}/thumbnail.{ext}
users/{accountId}/temporary/{uploadSessionId}/original
```

Rules:

1. `mediaObjectId` must be generated by the server. It must not come from user input.
2. Original files use `original.{ext}`.
3. Derived files use their own `mediaObjectId` and point to the source file through `parentMediaObjectId`.
4. Incomplete uploads can either use the final key directly or a temporary key first. For simplicity, use the final key with status `uploading`, and let cleanup jobs delete failed or expired uploads.
5. Do not put `taskId` or `workflowId` into the primary object storage path. Those relations belong in the database. Object keys are grouped by account and media object to simplify user-level accounting and cleanup.

User storage accounting should use the database as the source of truth:

```sql
select
  account_id,
  sum(byte_size) as total_bytes
from media_objects
where status = 'ready' and deleted_at is null
group by account_id;
```

### 5.3 `MediaInput`

Enhance `MediaInput` in contracts:

```ts
export const MediaInputSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('media_object'),
    mediaObjectId: z.string().min(1),
  }),
  z.object({
    type: z.literal('workflow_current_media'),
    workflowId: z.string().min(1),
    nodeId: z.string().min(1),
    taskId: z.string().min(1),
    outputResourceId: z.string().min(1).optional(),
    outputIndex: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('workflow_run_output'),
    workflowId: z.string().min(1),
    workflowRunId: z.string().min(1),
    nodeId: z.string().min(1),
    taskId: z.string().min(1).optional(),
    outputResourceId: z.string().min(1).optional(),
    outputIndex: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('external_url'),
  }),
])

export const MediaInputSchema = z.object({
  kind: ResourceKindSchema,
  url: z.string().min(1),
  role: ResourceRoleSchema,
  mediaObjectId: z.string().min(1).optional(),
  source: MediaInputSourceSchema.optional(),
  metadata: ResourceMetadataSchema.optional(),
})
```

Rules:

1. `mediaObjectId` is a fast foreign-key-style shortcut for task resources.
2. `source` describes why this input exists in this task.
3. Every workflow-derived media input should carry enough source information for lineage and debugging.

### 5.4 `NodeOutputResource`

Enhance output resources:

```ts
export const NodeOutputResourceSchema = z.object({
  id: z.string().min(1),
  kind: ResourceKindSchema,
  role: ResourceRoleSchema,
  index: z.number().int().min(0),
  url: z.string().min(1),
  mediaObjectId: z.string().min(1).optional(),
  metadata: ResourceMetadataSchema.optional(),
})
```

Rules:

1. Provider mappers may initially return external URLs or data URLs.
2. After `TaskOutputFinalizer` mirrors an output successfully, the resource must include `mediaObjectId`, and `url` must be a Mina-managed URL.
3. Dev provider `mina://tasks/...` output should be converted by the finalizer into deterministic media objects. Tests should not depend on provider external URLs.

### 5.5 `task_resources`

Enhance the table:

```ts
task_resources {
  id
  accountId
  taskId
  direction              // input | output
  kind
  url
  role
  outputIndex

  mediaObjectId
  slot                   // inputImages | firstFrame | ...
  slotItemId
  slotOrder
  source jsonb

  metadata
  createdAt
}
```

Indexes:

```ts
index('task_resources_task_idx').on(table.taskId)
index('task_resources_media_object_idx').on(table.mediaObjectId)
index('task_resources_account_created_idx').on(table.accountId, table.createdAt)
```

Responsibilities:

1. Record which inputs were actually used by one task.
2. Record which outputs were actually produced by one task.
3. Support task resource lists, task details, lineage tracing, debugging, and audit trails.
4. Do not upload files. This table is not the primary file table.

## 6. Workflow `mediaSlots` Design

### 6.1 Slot Names

```ts
export const MediaSlotNameSchema = z.enum([
  'inputImages',
  'firstFrame',
  'lastFrame',
  'referenceImages',
  'referenceAudios',
  'referenceVideos',
])
```

`prompt` does not belong in `mediaSlots`. The prompt is a text field in the task draft and should not be mixed with media slots.

### 6.2 Source Types

```ts
export const NodeOutputSelectorSchema = z.object({
  resourceKind: ResourceKindSchema,
  role: ResourceRoleSchema,
  index: z.number().int().min(0),
})

export const NodeMediaSlotSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('media_object'),
    mediaObjectId: z.string().min(1),
  }),
  z.object({
    type: z.literal('external_url'),
    kind: ResourceKindSchema,
    url: z.string().min(1),
    metadata: ResourceMetadataSchema.optional(),
  }),
  z.object({
    type: z.literal('node_output'),
    nodeId: z.string().min(1),
    resolve: z.literal('current_media'),
  }),
  z.object({
    type: z.literal('node_output'),
    nodeId: z.string().min(1),
    resolve: z.literal('run_output'),
    selector: NodeOutputSelectorSchema,
  }),
])
```

Meaning:

1. `media_object` covers one-off uploads, canvas uploads, and future media library selections.
2. `external_url` is only for development, import, or controlled integrations. Product upload flows should convert media into `media_objects`.
3. `node_output/current_media` is used by isolated canvas execution.
4. `node_output/run_output` is used by flow-group execution.

### 6.3 Slot Item

```ts
export const NodeMediaSlotItemSchema = z.object({
  id: z.string().min(1),
  slot: MediaSlotNameSchema,
  order: z.number().int().nonnegative(),
  required: z.boolean().default(true),
  source: NodeMediaSlotSourceSchema,
})

export const NodeMediaSlotsSchema = z
  .partialRecord(MediaSlotNameSchema, z.array(NodeMediaSlotItemSchema))
  .default({})
```

Node data:

```ts
z.object({
  nodeType: z.literal('image_generation'),
  title: z.string().min(1),
  config: ImageGenerationNodeConfigSchema,
  mediaView: NodeMediaViewStateSchema.optional(),
  mediaSlots: NodeMediaSlotsSchema.optional(),
})
```

### 6.4 Ordering Rules

1. Items inside the same slot are ordered by `order` ascending.
2. If `order` is equal, sort by `id` as a deterministic fallback.
3. Single-value slots such as `firstFrame` and `lastFrame` can have at most one ready item. Multiple items should fail validation instead of being implicitly overwritten.
4. Multi-value slots may mix local uploads, media objects, and upstream node outputs.
5. Backend execution must not depend on edge iteration order.

Example:

```json
{
  "referenceImages": [
    {
      "id": "slot_item_local_1",
      "slot": "referenceImages",
      "order": 0,
      "required": true,
      "source": {
        "type": "media_object",
        "mediaObjectId": "media_local_1"
      }
    },
    {
      "id": "slot_item_a",
      "slot": "referenceImages",
      "order": 1,
      "required": true,
      "source": {
        "type": "node_output",
        "nodeId": "a",
        "resolve": "current_media"
      }
    },
    {
      "id": "slot_item_b",
      "slot": "referenceImages",
      "order": 2,
      "required": true,
      "source": {
        "type": "node_output",
        "nodeId": "b",
        "resolve": "current_media"
      }
    }
  ]
}
```

Drag-and-drop reordering changes only `order`; it does not change edges.

### 6.5 Edge Role

Edges are still stored, but their responsibility is narrower:

```ts
export const WorkflowEdgeDataSchema = z.object({
  connection: z.object({
    kind: z.literal('media_link'),
    targetSlot: MediaSlotNameSchema,
    targetSlotItemId: z.string().min(1),
  }),
})
```

Rules:

1. An edge expresses a React Flow connection and a flow-group DAG dependency projection.
2. `edge.source` must equal the slot item's source `nodeId`.
3. `edge.target` must equal the node that owns the slot item.
4. The edge does not store URLs and does not store media ordering.
5. Workflow persistence validates that edges and `mediaSlots` agree.
6. Because this is a new project, legacy `media_slot` edge compatibility should not be kept in the runtime schema.

## 7. Media Resolution Flow

Add `WorkflowMediaResolver` and move media resolution out of `WorkflowNodeExecutor.resolveIncomingMediaInputs`.

Suggested directory:

```text
apps/api/src/modules/workflows/media/
  node-media-slots.ts
  workflow-media-resolver.ts
  workflow-media-validation.ts
  media-input-builder.ts
```

Interface:

```ts
export interface ResolveWorkflowNodeMediaInput {
  run: WorkflowRun
  node: WorkflowCanvasNode
}

export interface ResolvedWorkflowMediaInput {
  slot: MediaSlotName
  slotItemId: string
  slotOrder: number
  input: MediaInput
}

export class WorkflowMediaResolver {
  async resolveNodeMedia(input: ResolveWorkflowNodeMediaInput): Promise<ResolvedWorkflowMediaInput[]>
}
```

### 7.1 Resolving `media_object`

```text
slot item
  -> mediaObjectRepository.findReadyById(accountId, mediaObjectId)
  -> validate kind
  -> MediaInput {
       kind,
       url,
       role: slotToInputRole(slot),
       mediaObjectId,
       source: { type: 'media_object', mediaObjectId },
       metadata
     }
```

If `required=true` and the media object does not exist or is not ready, node execution fails.

### 7.2 Resolving `external_url`

Use only for development and controlled imports:

```text
slot item
  -> validate kind
  -> MediaInput { kind, url, role, source: { type: 'external_url' } }
```

Product upload flows should not rely on `external_url` long term.

### 7.3 Isolated Canvas `node_output/current_media`

When the selected node runs on the ordinary canvas, only that selected node executes. Upstream media comes from the source node's current `mediaView`:

```text
B mediaSlots item source=node_output/current_media nodeId=A
  -> find A in snapshotNodes
  -> A.data.mediaView.taskId
  -> tasksService.getTaskOutput(taskId)
  -> findOutputByMediaView(output, outputResourceId, outputIndex)
  -> MediaInput {
       kind: resource.kind,
       url: resource.url,
       mediaObjectId: resource.mediaObjectId,
       role: slotToInputRole(B slot),
       source: {
         type: 'workflow_current_media',
         workflowId,
         nodeId: A,
         taskId,
         outputResourceId,
         outputIndex
       }
     }
```

If the source node has no `mediaView` or the referenced output is missing:

1. `required=true`: the node fails and the workflow run fails.
2. `required=false`: skip that item.

The frontend should use the same semantics. B's media slot displays the output selected by A's current `mediaView`. If A switches MediaView, B's displayed upstream media changes accordingly.

### 7.4 Flow Group `node_output/run_output`

During flow-group execution, B does not read A's historical `mediaView`. It reads A's output from the current run:

```text
B mediaSlots item source=node_output/run_output nodeId=A selector={...}
  -> run.nodeStates[A].status must be succeeded
  -> run.nodeStates[A].output.resources
  -> findOutputBySelector(selector)
  -> MediaInput {
       kind,
       url,
       mediaObjectId,
       role: slotToInputRole(B slot),
       source: {
         type: 'workflow_run_output',
         workflowId,
         workflowRunId,
         nodeId: A,
         taskId: run.nodeStates[A].taskId,
         outputResourceId,
         outputIndex
       }
     }
```

If no matching output exists, the node fails and the workflow run fails.

### 7.5 Building `MediaEnvelope`

Target shape for `WorkflowNodeExecutor.buildTaskConfigForNode`:

```ts
private async buildTaskConfigForNode(run: WorkflowRun, node: WorkflowCanvasNode): Promise<TaskConfig> {
  assertExecutableNodeWithTaskConfig(node)

  const resolvedMedia = await this.dependencies.workflowMediaResolver.resolveNodeMedia({ run, node })
  const media = buildMediaEnvelopeFromResolvedItems(resolvedMedia)

  return this.dependencies.taskConfigAssembler.prepare({
    draft: node.data.config.task,
    media,
  })
}
```

`buildMediaEnvelopeFromResolvedItems`:

1. Group by slot.
2. Sort each group by `slotOrder/id`.
3. Allow only one item in single-value slots.
4. Output arrays for multi-value slots.

## 8. Workflow Execution Core

### 8.1 Isolated Canvas Execution

Running a selected executable node:

```text
WorkflowRunExecutor.reconcileRun
  -> runMode === isolated_node
  -> WorkflowNodeExecutor.executeNode(selectedNode)
  -> WorkflowMediaResolver.resolveNodeMedia
  -> TaskConfigAssembler.prepare
  -> TasksService.createTask
```

Rules:

1. Create a task only for the selected node.
2. Do not auto-run upstream nodes.
3. `node_output/current_media` must read the source node's `mediaView`.
4. If the source node has multiple historical tasks, only `mediaView` matters. Do not infer the latest task.

### 8.2 Flow Group Execution

Flow-group DAG dependencies should be derived from `mediaSlots`, not only from edges:

```text
dependency(A -> B)
  when any B.mediaSlots item has source.type=node_output
  and item.source.nodeId=A
```

Edges are validated as UI projections:

1. Every `node_output` item must have a matching edge.
2. Every media edge must have a matching slot item.
3. Persistence rejects inconsistent graphs.

Execution:

```text
1. Find the nearest flow_group for selectedNode.
2. Get executable nodes inside that group.
3. Derive scoped dependencies from mediaSlots.
4. Reject cycles.
5. Execute nodes whose predecessors have all succeeded.
6. Resolve media through WorkflowMediaResolver before each node executes.
7. All scoped nodes succeeded/skipped -> run succeeded.
8. Any node failed -> run failed.
```

### 8.3 Converting `flow_group` to `node_group`

Conversion rules:

1. Preserve `parentId` and visual grouping.
2. Change the group node type from `flow_group` to `node_group`.
3. Downgrade `node_output/run_output` items inside the group to `node_output/current_media`.
4. Keep edges as visual connections.
5. Later ordinary canvas execution does not auto-run upstream nodes.

## 9. Task Creation and Input Resource Snapshots

`TasksService.createTask` keeps these core responsibilities:

```text
parse final TaskConfig
get task mode
estimate pricing
collect input resources
insert task
insert task_resources input rows
```

The important change is the amount of information carried by collected input resources.

`ModelSpec.collectInputResources(config): MediaInput[]` can remain, but every `MediaInput` should carry:

1. `mediaObjectId`
2. `source`
3. `metadata.slot / slotItemId / slotOrder`, or equivalent outer resolved-item context.

A cleaner design is:

```ts
export interface TaskInputResourceDescriptor {
  input: MediaInput
  slot: MediaSlotName
  slotItemId?: string
  slotOrder?: number
}
```

To keep `ModelSpec` simple in this iteration, slot information can be placed in `MediaInput.metadata`:

```ts
metadata: {
  slot,
  slotItemId,
  slotOrder,
  ...existingMetadata
}
```

Then `taskResourceFromInput` writes the normalized columns.

Preferred final shape:

```ts
taskResourceFromInput(taskId, accountId, descriptor, index, createId)
```

In that shape, `descriptor` explicitly contains slot information and no longer relies on metadata conventions.

## 10. Task Output Mirroring and Normalization

### 10.1 Responsibility Location

Shared output services:

```text
apps/api/src/modules/tasks/output/
  task-output-finalizer.ts
  video-frame-generator.ts
  output-post-processor.ts
```

Responsibilities:

1. Provider mappers only convert provider responses into standard `NodeExecutionOutput`.
2. `TaskOutputFinalizer` converts output resources into Mina-managed `media_objects`.
3. `VideoFrameGenerator` extracts or creates video `first_frame`, `last_frame`, and `video_cover` media objects from finalized video outputs.
4. `OutputPostProcessor` adds derived frame resources and output variables.

### 10.2 Output Finalizer Flow

```text
TaskLifecycle.completeTask(task, providerOutput)
  -> TaskOutputFinalizer.finalize(task, providerOutput)
     -> for each output resource:
        -> if resource.mediaObjectId exists and media object is ready: keep
        -> if resource.url is data URL: decode and putObject
        -> if resource.url is http(s): fetch and putObject
        -> if resource.url is mina managed URL: resolve media object
        -> create media_objects(origin=task_output, purpose=task_output)
        -> return resource with mediaObjectId and Mina url
  -> OutputPostProcessor.process(task, finalizedOutput)
     -> video first_frame / last_frame / video_cover media objects
  -> tasks.output = processedOutput
  -> task_resources output rows
```

### 10.3 Supported URL Types

1. `data:*;base64,...`: decode directly.
2. `http/https`: download with content-type validation, size limits, and timeouts.
3. `memory://`: resolve through the in-memory adapter in tests.
4. `mina://media/{id}`: resolve an existing media object.
5. `mina://tasks/...`: dev provider only; finalizer converts it into a deterministic media object or test resource.

Provider specs must not implement output upload independently. If each Google/Volcengine model mirrors outputs on its own, behavior will drift and bugs will repeat.

### 10.4 Video Frames and Cover

Every successful video output should have independent image resources for:

1. `first_frame`
2. `last_frame`
3. `video_cover`

Each derived image is a separate `media_object`:

```text
origin = system_generated
purpose = preview
retention = task_scoped
parentMediaObjectId = video.mediaObjectId
storageKey = users/{accountId}/media/{frameMediaObjectId}/first-frame.jpg
storageKey = users/{accountId}/media/{frameMediaObjectId}/last-frame.jpg
storageKey = users/{accountId}/media/{frameMediaObjectId}/cover.jpg
```

Output resource example:

```ts
{
  id: `${task.id}:video-cover:${video.index}`,
  kind: 'image',
  role: 'video_cover',
  index: nextIndex,
  url: coverMediaObject.url,
  mediaObjectId: coverMediaObject.id,
  metadata: {
    frameRole: 'video_cover',
    frameTimeSeconds: 0,
    sourceVideoResourceId: video.id,
    parentMediaObjectId: video.mediaObjectId
  }
}
```

Provider-returned frames can be reused when their metadata clearly ties them to the source video. Missing roles are generated by `OutputPostProcessor`.

## 11. Media Module Structure

Module layout:

```text
apps/api/src/modules/media/
  media-object.ts
  media-object.repository.ts
  media-object.drizzle-repository.ts
  media-object.service.ts
  media-storage-key.ts
  media-type.ts
  remote-media-fetcher.ts
```

### 11.1 `MediaObjectService`

Core methods:

```ts
class MediaObjectService {
  createUploadPlaceholder(input): Promise<MediaObject>
  completeUpload(input): Promise<MediaObject>
  createFromBuffer(input): Promise<MediaObject>
  createFromRemoteUrl(input): Promise<MediaObject>
  getReadyMediaObject(accountId, mediaObjectId): Promise<MediaObject>
  softDelete(accountId, mediaObjectId): Promise<void>
  getAccountStorageUsage(accountId): Promise<StorageUsage>
}
```

Core methods needed now:

1. `createFromBuffer`: used by data URLs and generated video frames.
2. `createFromRemoteUrl`: used to mirror provider http(s) outputs.
3. `getReadyMediaObject`: used by workflow media slot resolution.

Upload placeholder and completion APIs can be added later, but the service should reserve the boundary.

### 11.2 `RemoteMediaFetcher`

```ts
interface RemoteMediaFetcher {
  fetch(input: { url: string; maxBytes: number; timeoutMs: number }): Promise<{
    body: Uint8Array
    contentType?: string
    byteSize: number
  }>
}
```

Rules:

1. Apply timeouts consistently.
2. Apply maximum size limits consistently.
3. Use controlled error types.
4. Do not fetch remote media inside provider mappers.

### 11.3 `media-storage-key.ts`

```ts
export const mediaOriginalObjectName = (mediaObjectId: string, extension: string): string =>
  `${mediaObjectId}/original.${extension}`

export type MediaDerivedObjectNameKind = 'first_frame' | 'last_frame' | 'video_cover'

export const mediaDerivedObjectName = (
  mediaObjectId: string,
  kind: MediaDerivedObjectNameKind,
): string => {
  if (kind === 'first_frame') return `${mediaObjectId}/first-frame.jpg`
  if (kind === 'last_frame') return `${mediaObjectId}/last-frame.jpg`
  return `${mediaObjectId}/cover.jpg`
}
```

When calling `ObjectStorage.putObject`:

```ts
scope: 'media'
objectName: `${mediaObjectId}/original.${extension}`
```

`StorageObjectScope` should at least include:

```ts
'media' | 'temporary'
```

Old scopes can remain if needed by existing code, but new media business flows should not store primary resources under `task-inputs`, `task-outputs`, or `assets`.

## 12. Contract Changes

### 12.1 Tasks

`packages/contracts/src/modules/tasks/task.schemas.ts`:

1. Add `mediaObjectId` fields.
2. Change `MediaInputSourceSchema` to a discriminated union.
3. Add `mediaObjectId` to `MediaInputSchema`.
4. Add `mediaObjectId` to `NodeOutputResourceSchema`.
5. Add the following fields to `TaskResourceSchema`:

```ts
mediaObjectId?: string
slot?: MediaSlotName
slotItemId?: string
slotOrder?: number
source?: TaskResourceSource
```

Avoid making the tasks contract depend on the canvas contract. Put `MediaSlotNameSchema` in either the tasks contract or a shared media contract. Prefer:

```text
packages/contracts/src/modules/media/media.schemas.ts
```

### 12.2 Canvas

`packages/contracts/src/modules/canvas/canvas.schemas.ts`:

1. Add `NodeMediaSlotsSchema`.
2. Add `mediaSlots` to image/video node data.
3. Make edge data use only `media_link`.
4. Do not expose legacy `MediaSlotConnection` in the contract for a new project.

### 12.3 Workflows

`WorkflowRun` snapshot nodes naturally include `mediaSlots`. No additional workflow-run field is required.

## 13. Database Changes

`apps/api/src/db/schema.ts`:

1. Add the `mediaObjects` table.
2. Add these fields to `taskResources`:

```ts
mediaObjectId
slot
slotItemId
slotOrder
source
```

3. Enhance `tasks.output` to follow `NodeExecutionOutput`.
4. Enhance `workflows.nodes` to follow `WorkflowCanvasNode`.
5. Enhance `workflow_runs.snapshot_nodes` accordingly.

Do not add a dedicated workflow media slot table yet. Keep the canvas structure in JSONB for this phase because:

1. A React Flow canvas is naturally a document-shaped structure.
2. `mediaSlots` is part of node data.
3. Reads usually fetch the whole workflow canvas.
4. Splitting too early would increase consistency complexity without a clear query benefit.

## 14. Runtime Dependency Assembly

Target assembly in `apps/api/src/app/dependencies.ts`:

```ts
const storage = createObjectStorage()
const mediaObjectRepository = createMediaObjectRepository()
const mediaObjectService = new MediaObjectService(mediaObjectRepository, storage, remoteMediaFetcher)
const workflowMediaResolver = new WorkflowMediaResolver(mediaObjectService, tasksService)
const outputFinalizer = new TaskOutputFinalizer(mediaObjectService)
const outputPostProcessor = new OutputPostProcessor(new FfmpegVideoFrameGenerator(mediaObjectService))
```

Circular dependency notes:

1. `WorkflowMediaResolver` needs `TasksService` to read upstream task outputs.
2. `TasksService` needs output finalizer and post-processor dependencies.
3. The solution is to inject `WorkflowMediaResolver` into workflow execution, not into `TasksService`.
4. Inject `TaskOutputFinalizer` and `OutputPostProcessor` into `TaskLifecycle` or lifecycle dependencies owned by `TasksService`.

## 15. Recommended Implementation Order

### Step 1: Contracts

1. Add the media contract.
2. Enhance task schemas.
3. Enhance canvas node `mediaSlots`.
4. Use only `media_link` for edge data.

Verification:

```text
bun --filter @mina/contracts typecheck
```

### Step 2: Database and Repositories

1. Add the `media_objects` schema.
2. Enhance the `task_resources` schema.
3. Add in-memory and Drizzle media object repositories.
4. Parse repository boundaries with Zod.

Verification:

```text
media object create/get/update tests
task resources new fields roundtrip tests
```

### Step 3: `MediaObjectService`

1. Implement key generation.
2. Implement `createFromBuffer`.
3. Implement `createFromRemoteUrl`.
4. Implement storage usage aggregation.

Verification:

```text
object key account isolation
data URL or buffer creates ready media object
remote fetch error maps to controlled error
usage sums byteSize
```

### Step 4: `WorkflowMediaResolver`

1. Resolve `media_object`.
2. Resolve `external_url`.
3. Resolve `current_media`.
4. Resolve `run_output`.
5. Implement slot sorting and single-value slot validation.

Verification:

```text
single node local media no edges can run
mixed media object + A + B order preserved
required missing source fails
optional missing source skips
current_media uses mediaView, not latest task
run_output uses current workflow run node state
```

### Step 5: `WorkflowNodeExecutor`

1. Replace `resolveIncomingMediaInputs`.
2. Use `WorkflowMediaResolver.resolveNodeMedia`.
3. Change `buildMediaEnvelope` to accept resolved slot items.
4. Keep pure output-selection helpers where useful.

Verification:

```text
ordinary canvas B only runs B
flow group A -> B waits for A before running B
flow group multi-root join waits for all predecessor nodes to succeed
```

### Step 6: Task Input Resources

1. Enhance `taskResourceFromInput`.
2. Write `mediaObjectId/slot/slotItemId/slotOrder/source`.
3. Keep `ModelSpec.collectInputResources` simple; extract extended fields from `MediaInput` when needed.

Verification:

```text
task_resources input contains mediaObjectId and source
task resources list can explain input lineage
```

### Step 7: Output Finalizer

1. Add `TaskOutputFinalizer`.
2. Support data URLs, http(s), and existing Mina media objects.
3. Create output `media_objects`.
4. Enhance `taskResourceFromOutput`.
5. Create video first-frame, last-frame, and cover resources through `MediaObjectService`.

Verification:

```text
image output mirrored to media_objects
video output mirrored to media_objects
video first_frame creates child media object
video last_frame creates child media object
video_cover creates child media object
tasks.output resources contain mediaObjectId
task_resources output contains mediaObjectId
```

### Step 8: Storage Cleanup and Usage

1. Add orphan/uploading timeout cleanup service.
2. Add account usage query.
3. Do not expose the API yet, but keep service tests complete.

Verification:

```text
expired uploading media object soft deleted or removed
storage usage excludes deleted/failed
```

## 16. Test Plan

### Contracts

1. `NodeMediaSlotSourceSchema` discriminated union.
2. `mediaSlots` supports mixed ordered items.
3. Single-value slot business validation is covered by backend validation.
4. `MediaInputSourceSchema` covers all source shapes.
5. `NodeOutputResource.mediaObjectId` is optional.

### Media

1. Object keys live under the account root.
2. Path segment encoding prevents `../`.
3. Buffers create media objects.
4. Remote URLs create media objects.
5. Usage is aggregated correctly.
6. Deleted and failed objects are excluded from usage.

### Workflow

1. A node with a `media_object` slot item and no edge can run.
2. A slot with `media_object + node A + node B` preserves order.
3. Ordinary canvas `current_media` uses the source node's `mediaView`.
4. Ordinary canvas execution fails when the source node has no `mediaView` and `required=true`.
5. Flow-group `run_output` uses output from the current run.
6. Flow-group execution fails when the selected output is missing.
7. Converting `flow_group` to `node_group` downgrades `run_output` to `current_media`.
8. Workflow persistence fails when edges and `mediaSlots` disagree.

### Task

1. Task input resources write `source`.
2. Task output resources write `mediaObjectId`.
3. Provider data URL outputs mirror successfully.
4. Provider HTTP outputs mirror successfully.
5. Output mirroring failures should fail the task, because Mina needs durable output storage.

### Provider

1. Provider specs do not depend on storage or media object services.
2. Google/Volcengine mappers still only return standard output.
3. `TaskOutputFinalizer` applies uniformly to all providers.

## 17. Risks and Tradeoffs

### 17.1 Why Edges Should Not Store All Media Input State

Edges cannot naturally express this slot state:

```text
local uploaded image
from node A
from node B
future media library selection
```

The order of these items inside one target slot is target node form state, not graph connection state. Forcing edges to own this would cause problems:

1. Local media has no source node, so it would require fake edges.
2. Ordering would depend on edge order, which is unstable.
3. Deleting, sorting, or replacing media would easily corrupt graph structure.

Therefore slot order must belong to `node.data.mediaSlots`.

### 17.2 Why Task Outputs Must Be Mirrored to Mina Storage

If Mina stores only provider URLs:

1. URLs may expire.
2. User-level storage accounting is impossible.
3. Permissions are not controlled by Mina.
4. Task history display becomes unstable.
5. User data deletion cannot reliably clean files.

Therefore final outputs should enter `media_objects`.

### 17.3 Why `media_objects` Is Not the Media Library

Many uploads are one-off resources and should not automatically appear in a user's reusable asset library. `media_objects` is only the primary file table. The media library is an optional indexing and organization table.

```text
media_objects          all Mina-managed media files
media_library_items    media explicitly saved, collected, or organized by the user
```

### 17.4 Why Not Split Workflow Media Slots Into a Table Now

The workflow is usually read and written as a full canvas. React Flow data is naturally document-shaped. Splitting media slots into a relational table would increase synchronization complexity without a clear query benefit. JSONB is simpler and lower risk at this stage.

## 18. Acceptance Criteria

After this core architecture is implemented:

1. User-uploaded media and task output media can both enter `media_objects`.
2. Every Mina-managed media file lives under `users/{accountId}/media/{mediaObjectId}/...`.
3. User storage usage can be aggregated from `media_objects.byteSize`.
4. A node can create a task when it has local/media-object input and no edge.
5. In ordinary canvas A -> B, running B only runs B, and B reads A's current `mediaView`.
6. In flow-group A -> B, B reads A's output from the current run.
7. Mixed item order inside a media slot is determined by `mediaSlots[slot][].order`.
8. `TaskConfig.media` stores the final input snapshot.
9. `task_resources` can explain whether an input came from a `mediaObjectId` or an upstream node output.
10. Provider specs do not depend on media objects, workflow, or storage.
11. Output upload failures produce clear failure events and diagnosable errors.
12. `bun run typecheck`, `bun run test`, and `bun run build` pass.

## 19. Final Architecture Summary

```text
user upload / provider output
  -> ObjectStorage
  -> media_objects

WorkflowCanvasNode.data.mediaSlots
  -> describes ordered sources for each media slot on the target node

WorkflowMediaResolver
  -> mediaSlots + workflow run snapshot + task output + media_objects
  -> ResolvedWorkflowMediaInput[]
  -> MediaEnvelope

TaskConfigAssembler
  -> ModelSpec.prepareConfig
  -> TaskConfig

TasksService
  -> task
  -> task_resources input snapshot

ProviderRouter
  -> ModelSpec.start/poll
  -> provider output

TaskOutputFinalizer / OutputPostProcessor
  -> media_objects for outputs, first frames, last frames, and covers
  -> tasks.output
  -> task_resources output snapshot
```

Core tradeoff: **media files belong to `media_objects`, media slot order belongs to the target node's `mediaSlots`, task resource lineage belongs to `task_resources`, and provider differences belong to `ModelSpec`.** This keeps boundaries clear, runtime flow simple, and future provider/model/library/upload additions less likely to break the core execution system.
