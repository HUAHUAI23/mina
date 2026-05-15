# Mina 媒体对象与 Workflow 输入架构工程指导

## 1. 目标

本文档定义 Mina 后端下一轮媒体资源与 workflow 输入核心重构方案，覆盖：

1. 用户上传媒体、一次性表单媒体、画布媒体槽媒体、任务输出媒体的统一存储模型。
2. 对象存储 key 规范，确保用户级聚合、统计、清理和权限边界清晰。
3. `WorkflowCanvasNode.data.mediaSlots` 的稳定结构，支持本地媒体、媒体对象、上游节点输出、资产库入口，以及槽位内有序混排。
4. 普通画布运行与流程组运行的媒体解析规则。
5. 任务输入/输出资源快照与 `media_objects` 的关系。
6. 任务输出上传、视频封面、provider 输出归一化的工程位置。

本轮不设计前端交互 API 细节，不实现上传表单 API、资产库 UI API、画布表单 API。后端核心结构、运行链路、持久化模型和模块边界需要先稳定。

## 2. 当前架构分析

当前已经比较合理的部分：

1. Provider/model 架构已经拆到 `ModelSpec`、`ModelRegistry`、`ProviderRouter`。
2. `ModelSpec.prepareConfig(...)` 是 provider/model 参数与媒体能力校验的入口。
3. `TaskLifecycle` 只通过 `TaskProvider` 调用 provider，不直接依赖 Google/Volcengine。
4. `ObjectStorage` 已经抽象出 S3 与 in-memory 实现。
5. `task_resources` 已经能记录任务 input/output 资源索引。
6. 视频封面后处理已经存在 `OutputPostProcessor` 和 `VideoCoverGenerator`。

当前不足：

1. 媒体文件没有统一主表。上传媒体和任务输出无法统一做存储占用统计、生命周期管理、权限追踪。
2. 当前对象存储只提供底层能力，没有业务级媒体对象 key 规范。
3. 当前 workflow 主要从 incoming edges 解析媒体：

   ```ts
   const inputs = await this.resolveIncomingMediaInputs(run, node)
   ```

   这只能表达“边输入”，不能表达节点媒体槽里本地上传、媒体对象、上游 A、上游 B 混排的顺序。
4. `workflows.edges` 当前承担了过多媒体输入语义。edge 适合表达节点连接，不适合成为媒体槽有序列表的唯一真实来源。
5. `task_resources` 当前只记录 `url/kind/role/metadata`，不能稳定追踪输入来自哪个媒体对象、哪个槽位、哪个上游节点输出。
6. Provider 输出当前多数只是 URL 引用。除视频封面外，没有统一把 provider 输出镜像到 Mina 对象存储。

## 3. 设计依据

本方案采用以下工程设计原则。

### 3.1 Ports & Adapters

核心系统不依赖具体对象存储、provider、外部 API。应用核心通过 port 交互，S3、in-memory、Google、Volcengine 都是 adapter。

落地方式：

1. `MediaObjectService` 依赖 `ObjectStorage` port，不直接依赖 S3 SDK。
2. `TaskOutputFinalizer` 依赖 `MediaObjectService` 和 `RemoteMediaFetcher` port。
3. `WorkflowMediaResolver` 只依赖 `MediaObjectRepository`、`TasksService`、`WorkflowRun` 快照，不依赖 provider。

参考：Alistair Cockburn, Hexagonal Architecture  
https://alistair.cockburn.us/hexagonal-architecture

### 3.2 Gateway Pattern

外部系统字段不要泄露到核心模型。Provider client 和对象存储 client 都应通过 gateway 封装外部 API。

落地方式：

1. Provider 输出先由 mapper 转成 `NodeExecutionOutput`。
2. `TaskOutputFinalizer` 再统一处理“外部 URL/data URL -> Mina media_object”。
3. workflow 和 task 不处理 S3 SDK、Google 文件 API、Volcengine 原始字段。

参考：Martin Fowler, Gateway  
https://martinfowler.com/articles/gateway-pattern.html

### 3.3 Blob / Attachment 分离

Rails Active Storage 的核心思想是把文件实体和业务引用分开。Mina 不直接照搬表结构，但采用同类边界：

1. `media_objects` 是文件实体。
2. workflow media slot、task resource、未来资产库条目都是对文件实体的引用。

参考：Rails Active Storage Overview  
https://guides.rubyonrails.org/active_storage_overview.html

### 3.4 S3 Prefix 组织对象

S3 是扁平对象存储，prefix 只是 key 的前缀，不是目录。但 prefix 可以用于组织、浏览和统计。

落地方式：

1. 所有用户对象必须在 `users/{accountId}/...` 下。
2. 媒体对象按 `mediaObjectId` 聚合。
3. DB 中的 `media_objects.byteSize` 是实时统计 SSOT；S3 prefix 和 Storage Lens 是运维校验与成本分析辅助。

参考：

1. AWS S3 Organizing objects using prefixes  
   https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html
2. AWS S3 Presigned URLs  
   https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
3. AWS S3 Storage Lens prefix metrics  
   https://repost.aws/knowledge-center/s3-storage-lens-prefix-metrics

### 3.5 Discriminated Union

媒体槽来源有多种形态，必须用 discriminated union，避免一堆 optional 字段互斥导致错误状态。

落地方式：

1. `NodeMediaSlotItem.source.type` 做 discriminator。
2. `TaskResourceSource.type` 做 discriminator。
3. Zod schema 使用 `z.discriminatedUnion(...)`。

参考：

1. Zod discriminated unions  
   https://zod.dev/api?id=discriminated-unions
2. TypeScript narrowing  
   https://www.typescriptlang.org/docs/handbook/2/narrowing.html

### 3.6 React Flow v12 持久化约束

Mina contracts 要适配 React Flow v12，但只保存稳定业务字段。

落地方式：

1. 使用 `parentId`，不使用旧 `parentNode`。
2. 父节点必须排在子节点前。
3. 子节点 position 相对父节点。
4. 不持久化 `selected/dragging/measured/positionAbsolute` 等 UI 临时字段。
5. `mediaSlots` 存在 Mina node data 中，不依赖 React Flow 内部状态。

参考：

1. React Flow Sub Flows  
   https://reactflow.dev/learn/layouting/sub-flows
2. React Flow TypeScript / Types  
   https://reactflow.dev/api-reference/types
3. React Flow Save and Restore  
   https://reactflow.dev/examples/interaction/save-and-restore

## 4. 核心原则

1. 文件本体只归 `media_objects` 管。workflow 和 task 只保存引用和快照。
2. `media_objects` 不是资产库。它是 Mina 管理的媒体文件主表，一次性上传也属于它。
3. 资产库是未来可选上层表，例如 `media_library_items`，引用 `media_objects`。
4. workflow 节点的媒体槽顺序归目标节点 `data.mediaSlots` 管，不归 edge 管。
5. edge 只表达节点间连接、视觉关系和流程依赖投影。
6. 普通画布只执行 selected node，来自上游节点的媒体读 source node 当前 `mediaView`。
7. 流程组执行 DAG，来自上游节点的媒体读本次 `workflow_run.nodeStates[source].output`。
8. `TaskConfig.media` 是本次任务最终输入快照。
9. `task_resources` 是任务维度资源索引，必须能追踪 slot、order、source、mediaObjectId。
10. Provider spec 不知道 workflow，也不处理对象存储上传。
11. 任务输出上传和视频封面属于通用 output finalizer/post processor，不属于单个 provider spec。

## 5. 目标数据模型

### 5.1 `media_objects`

新增表：

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

字段说明：

1. `origin` 表示文件怎么来的。
2. `purpose` 表示当前业务用途。
3. `retention` 表示生命周期策略。
4. `parentMediaObjectId` 用于视频封面、缩略图、转码版本指向原始对象。
5. `sourceTaskId/sourceTaskResourceId` 用于任务输出回溯。

不在本轮实现但预留：

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

### 5.2 对象存储 key 规范

当前底层 key 是：

```text
users/{accountId}/{scope}/{objectName}
```

保留这个账户隔离根，但媒体对象统一使用 `media` scope：

```text
users/{accountId}/media/{mediaObjectId}/original.{ext}
users/{accountId}/media/{mediaObjectId}/preview.{ext}
users/{accountId}/media/{mediaObjectId}/cover.jpg
users/{accountId}/media/{mediaObjectId}/thumbnail.{ext}
users/{accountId}/temporary/{uploadSessionId}/original
```

规则：

1. `mediaObjectId` 必须由服务端生成，不能由用户输入。
2. 原始文件使用 `original.{ext}`。
3. 派生文件使用独立 `mediaObjectId`，并通过 `parentMediaObjectId` 指向原文件。
4. 上传未完成的对象可以直接使用最终 key，也可以先使用 temporary key。为了简单，本轮推荐直接使用最终 key，状态为 `uploading`，失败或超时由清理任务删除。
5. 不要把 taskId、workflowId 作为对象存储主路径。它们放在 DB 关系里。对象路径按用户和媒体对象聚合，便于用户级统计与清理。

用户存储占用统计以 DB 为准：

```sql
select
  account_id,
  sum(byte_size) as total_bytes
from media_objects
where status = 'ready' and deleted_at is null
group by account_id;
```

### 5.3 `MediaInput`

增强 contracts 中的 `MediaInput`：

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

兼容策略：

1. 直接把旧 optional source 迁移为 discriminated source。
2. `mediaObjectId` 是快捷外键，便于 task resource 直接关联。
3. `source` 描述“为什么这个输入会出现在本次任务里”。

### 5.4 `NodeOutputResource`

增强输出资源：

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

规则：

1. Provider mapper 可以先返回外部 URL 或 data URL。
2. `TaskOutputFinalizer` 成功镜像后必须补上 `mediaObjectId`，并把 `url` 改为 Mina 管理的 URL。
3. dev provider 的 `mina://tasks/...` 输出也应在 finalizer 中转换为可测试的 media object，或者明确由 dev finalizer 生成 deterministic media object。不要让测试依赖 provider 外部 URL。

### 5.5 `task_resources`

增强表：

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

索引：

```ts
index('task_resources_task_idx').on(table.taskId)
index('task_resources_media_object_idx').on(table.mediaObjectId)
index('task_resources_account_created_idx').on(table.accountId, table.createdAt)
```

职责：

1. 记录某次任务实际使用了哪些 input。
2. 记录某次任务实际产出了哪些 output。
3. 提供任务资源列表、任务详情、血缘追踪、调试审计。
4. 不负责文件上传，不是文件主表。

## 6. Workflow `mediaSlots` 设计

### 6.1 槽位类型

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

`prompt` 不放入 `mediaSlots`。prompt 是 task draft 的文本字段，不和媒体槽混在一起。

### 6.2 来源类型

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

说明：

1. `media_object` 覆盖一次性上传、画布上传、未来资产库选择。
2. `external_url` 只作为开发/导入/兼容入口。产品链路应尽量转成 media object。
3. `node_output/current_media` 用于普通画布。
4. `node_output/run_output` 用于流程组。

### 6.3 槽位 item

```ts
export const NodeMediaSlotItemSchema = z.object({
  id: z.string().min(1),
  slot: MediaSlotNameSchema,
  order: z.number().int().nonnegative(),
  required: z.boolean().default(true),
  source: NodeMediaSlotSourceSchema,
})

export const NodeMediaSlotsSchema = z
  .record(MediaSlotNameSchema, z.array(NodeMediaSlotItemSchema))
  .default({})
```

节点 data：

```ts
z.object({
  nodeType: z.literal('image_generation'),
  title: z.string().min(1),
  config: ImageGenerationNodeConfigSchema,
  mediaView: NodeMediaViewStateSchema.optional(),
  mediaSlots: NodeMediaSlotsSchema.optional(),
})
```

### 6.4 顺序规则

1. 同一个 slot 内按 `order` 升序。
2. `order` 相同则按 `id` 字典序兜底，保证 deterministic。
3. 单值槽位 `firstFrame/lastFrame` 最多一个 ready item。多个 item 直接校验失败，不隐式覆盖。
4. 多值槽位允许混排本地上传、媒体对象、上游节点输出。
5. 后端不依赖 edge 遍历顺序。

示例：

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

用户拖拽排序只修改 `order`，不改 edge。

### 6.5 Edge 角色

edge 仍保留，但职责收窄：

```ts
export const WorkflowEdgeDataSchema = z.object({
  connection: z.object({
    kind: z.literal('media_link'),
    targetSlot: MediaSlotNameSchema,
    targetSlotItemId: z.string().min(1),
  }),
})
```

规则：

1. edge 表达 React Flow 连接和流程组 DAG 依赖。
2. edge.source 必须等于 slot item source 的 `nodeId`。
3. edge.target 必须等于拥有该 slot item 的节点。
4. edge 不保存 URL，不保存媒体顺序。
5. workflow 保存时校验 edge 与 `mediaSlots` 一致。

兼容旧结构：

1. 旧 `MediaSlotConnection.sourceSelector.asset.resource` 迁移为 `mediaSlots[source=external_url]` 或 `media_object`。
2. 旧 `current_media/run_output` edge 迁移为目标节点的 `mediaSlots` item，并保留 edge 指向 item。

## 7. 媒体解析链路

新增 `WorkflowMediaResolver`，替代 `WorkflowNodeExecutor.resolveIncomingMediaInputs` 的职责。

目录建议：

```text
apps/api/src/modules/workflows/media/
  node-media-slots.ts
  workflow-media-resolver.ts
  workflow-media-validation.ts
  media-input-builder.ts
```

接口：

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

### 7.1 解析 `media_object`

```text
slot item
  -> mediaObjectRepository.findReadyById(accountId, mediaObjectId)
  -> kind 校验
  -> MediaInput {
       kind,
       url,
       role: slotToInputRole(slot),
       mediaObjectId,
       source: { type: 'media_object', mediaObjectId },
       metadata
     }
```

如果 `required=true` 且媒体对象不存在或未 ready，节点执行失败。

### 7.2 解析 `external_url`

只用于兼容和开发：

```text
slot item
  -> kind 校验
  -> MediaInput { kind, url, role, source: { type: 'external_url' } }
```

产品上传链路不应该长期依赖 `external_url`。

### 7.3 普通画布 `node_output/current_media`

普通画布运行 selected node 时，只执行 selected node。上游媒体来自 source node 当前 `mediaView`：

```text
B mediaSlots item source=node_output/current_media nodeId=A
  -> snapshotNodes 找 A
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

如果 source node 没有 `mediaView` 或 output 缺失：

1. `required=true`：节点失败，workflow run failed。
2. `required=false`：跳过该 item。

前端展示也应使用同一语义：B 槽位展示 A 当前 `mediaView` 指向的输出。A 切换 MediaView 后，B 槽位展示随之变化。

### 7.4 流程组 `node_output/run_output`

流程组运行时，B 不读取 A 的历史 `mediaView`，只读取本次 run 的 A 输出：

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

如果没有对应输出，流程节点失败，workflow run failed。

### 7.5 组装 `MediaEnvelope`

`WorkflowNodeExecutor.buildTaskConfigForNode` 目标形态：

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

`buildMediaEnvelopeFromResolvedItems`：

1. 按 slot 分组。
2. 每组按 `slotOrder/id` 排序。
3. 单值槽位只能一个。
4. 多值槽位输出数组。

## 8. Workflow 执行核心

### 8.1 普通画布

运行 selected executable node：

```text
WorkflowRunExecutor.reconcileRun
  -> runMode === isolated_node
  -> WorkflowNodeExecutor.executeNode(selectedNode)
  -> WorkflowMediaResolver.resolveNodeMedia
  -> TaskConfigAssembler.prepare
  -> TasksService.createTask
```

规则：

1. 只创建 selected node 的 task。
2. 不自动执行上游节点。
3. `node_output/current_media` 必须读 source node `mediaView`。
4. 多历史任务时只认 `mediaView`，不推断最新任务。

### 8.2 流程组

流程组执行 DAG 的依赖来源建议从 `mediaSlots` 推导，而不是仅从 edges 推导：

```text
dependency(A -> B)
  当 B.mediaSlots 任意 item.source.type=node_output
  且 item.source.nodeId=A
```

edge 作为 UI 投影校验：

1. 有 `node_output` item 必须有对应 edge。
2. 有 media edge 必须有对应 slot item。
3. 存储时发现不一致拒绝。

流程执行：

```text
1. 找 selectedNode 最近 flow_group。
2. 取 group 内 executable nodes。
3. 从 mediaSlots 推导 scoped dependencies。
4. 检查环。
5. 没有未成功 predecessor 的节点可以执行。
6. 节点执行前通过 WorkflowMediaResolver 解析媒体。
7. 所有 scoped node succeeded/skipped -> run succeeded。
8. 任一 node failed -> run failed。
```

### 8.3 flow_group 转 node_group

转换时：

1. `parentId` 和视觉分组保留。
2. group node type 从 `flow_group` 改为 `node_group`。
3. 对 group 内 `mediaSlots` 的 `node_output/run_output` 降级为 `node_output/current_media`。
4. edge 保留为视觉连接。
5. 后续普通画布运行不自动执行上游。

## 9. Task 创建与输入资源快照

`TasksService.createTask` 保持核心职责：

```text
parse final TaskConfig
get task mode
estimate pricing
collect input resources
insert task
insert task_resources input rows
```

需要调整的是 `collectInputResources` 返回值的信息量。

当前 `ModelSpec.collectInputResources(config): MediaInput[]` 可以保留，但 `MediaInput` 必须带：

1. `mediaObjectId`
2. `source`
3. `metadata.slot / slotItemId / slotOrder` 或通过外层 resolved item 传入

更清晰的设计是引入：

```ts
export interface TaskInputResourceDescriptor {
  input: MediaInput
  slot: MediaSlotName
  slotItemId?: string
  slotOrder?: number
}
```

但为了少改 `ModelSpec`，本轮可以先把 slot 信息放入 `MediaInput.metadata`：

```ts
metadata: {
  slot,
  slotItemId,
  slotOrder,
  ...existingMetadata
}
```

然后 `taskResourceFromInput` 写入标准列。

推荐最终形态：

```ts
taskResourceFromInput(taskId, accountId, descriptor, index, createId)
```

其中 descriptor 明确包含 slot 信息，不依赖 metadata 约定。

## 10. 任务输出上传与归一化

### 10.1 职责位置

新增：

```text
apps/api/src/modules/tasks/output/
  task-output-finalizer.ts
  output-media-mirror.ts
  video-cover-generator.ts
  output-post-processor.ts
```

职责：

1. Provider mapper 只负责把 provider response 转成标准 `NodeExecutionOutput`。
2. `TaskOutputFinalizer` 负责把输出资源转成 Mina 管理的 `media_objects`。
3. `VideoCoverGenerator` 负责从 finalized video 生成 cover media object。
4. `OutputPostProcessor` 负责补充 `video_cover` resource 和 output variables。

### 10.2 输出 finalizer 流程

```text
TaskLifecycle.completeTask(task, providerOutput)
  -> TaskOutputFinalizer.finalize(task, providerOutput)
     -> for each output resource:
        -> if resource.mediaObjectId exists and media object ready: keep
        -> if resource.url is data URL: decode and putObject
        -> if resource.url is http(s): fetch and putObject
        -> if resource.url is mina managed URL: resolve media object
        -> create media_objects(origin=task_output, purpose=task_output)
        -> return resource with mediaObjectId and Mina url
  -> OutputPostProcessor.process(task, finalizedOutput)
     -> video cover media object
  -> tasks.output = processedOutput
  -> task_resources output rows
```

### 10.3 不同 URL 类型

1. `data:*;base64,...`：直接 decode。
2. `http/https`：下载，校验 content-type、大小上限、超时。
3. `memory://`：测试环境通过 in-memory adapter 解析。
4. `mina://media/{id}`：解析已有 media object。
5. `mina://tasks/...`：dev provider 专用，finalizer 中转换成 deterministic media object 或测试资源。

不要让 provider spec 各自实现输出上传。否则 Google/Volcengine 每个模型都会重复并且容易不一致。

### 10.4 视频封面

视频封面是独立 `media_object`：

```text
origin = system_generated
purpose = preview
retention = same as parent video
parentMediaObjectId = video.mediaObjectId
storageKey = users/{accountId}/media/{coverMediaObjectId}/cover.jpg
```

输出资源：

```ts
{
  id: `${task.id}:video-cover:${video.index}`,
  kind: 'image',
  role: 'video_cover',
  index: nextIndex,
  url: coverMediaObject.url,
  mediaObjectId: coverMediaObject.id,
  metadata: {
    frameTimeSeconds: 0,
    sourceVideoResourceId: video.id,
    parentMediaObjectId: video.mediaObjectId
  }
}
```

## 11. Media 模块工程结构

新增模块：

```text
apps/api/src/modules/media/
  media-object.ts
  media-object.repository.ts
  media-object.drizzle-repository.ts
  media-object.in-memory-repository.ts
  media-object.service.ts
  media-storage-key.ts
  media-type.ts
  remote-media-fetcher.ts
  media-metadata.ts
```

### 11.1 `MediaObjectService`

核心方法：

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

本轮核心需要：

1. `createFromBuffer`：用于 data URL、视频封面。
2. `createFromRemoteUrl`：用于 provider http(s) 输出镜像。
3. `getReadyMediaObject`：用于 workflow mediaSlots 解析。

上传 placeholder / complete API 可以后续实现，但 service 结构先预留。

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

规则：

1. 统一设置超时。
2. 统一限制最大大小。
3. 统一错误类型。
4. 不在 provider mapper 中直接 fetch。

### 11.3 `media-storage-key.ts`

```ts
export const mediaOriginalObjectName = (mediaObjectId: string, extension: string): string =>
  `${mediaObjectId}/original.${extension}`

export const mediaCoverObjectName = (mediaObjectId: string): string =>
  `${mediaObjectId}/cover.jpg`
```

调用 `ObjectStorage.putObject` 时：

```ts
scope: 'media'
objectName: `${mediaObjectId}/original.${extension}`
```

因此需要把 `StorageObjectScope` 从当前：

```ts
'assets' | 'task-inputs' | 'task-outputs' | 'temporary' | 'uploads'
```

调整为至少包含：

```ts
'media' | 'temporary'
```

旧 scope 可以保留兼容，但新业务不再使用 `task-inputs/task-outputs/assets` 存主资源。

## 12. Contracts 调整清单

### 12.1 tasks

`packages/contracts/src/modules/tasks/task.schemas.ts`：

1. 增加 `MediaObjectId` 字段。
2. 修改 `MediaInputSourceSchema` 为 discriminated union。
3. `MediaInputSchema` 增加 `mediaObjectId`。
4. `NodeOutputResourceSchema` 增加 `mediaObjectId`。
5. `TaskResourceSchema` 增加：

```ts
mediaObjectId?: string
slot?: MediaSlotName
slotItemId?: string
slotOrder?: number
source?: TaskResourceSource
```

注意避免 tasks contract 反向依赖 canvas contract。`MediaSlotNameSchema` 可以放在 tasks contract 或新 `media` contract，canvas/tasks 共同引用。推荐新增：

```text
packages/contracts/src/modules/media/media.schemas.ts
```

### 12.2 canvas

`packages/contracts/src/modules/canvas/canvas.schemas.ts`：

1. 新增 `NodeMediaSlotsSchema`。
2. image/video node data 增加 `mediaSlots`。
3. edge data 从旧 `MediaSlotConnection` 迁移为 `media_link`。
4. 保留旧 schema 的迁移辅助可以放后端，不一定在 contract 暴露。

### 12.3 workflows

`WorkflowRun` snapshot nodes 会自然包含 `mediaSlots`。不需要额外字段。

## 13. 数据库调整清单

`apps/api/src/db/schema.ts`：

1. 新增 `mediaObjects` 表。
2. `taskResources` 增加：

```ts
mediaObjectId
slot
slotItemId
slotOrder
source
```

3. `tasks.output` 类型跟随 `NodeExecutionOutput` 增强。
4. `workflows.nodes` 类型跟随 `WorkflowCanvasNode` 增强。
5. `workflow_runs.snapshot_nodes` 类型跟随增强。

不建议新增专门的 workflow media slot 表。本阶段继续把画布结构存 JSONB，原因：

1. React Flow 画布天然是文档结构。
2. mediaSlots 是 node data 的一部分。
3. 查询主要按 workflow 获取整张画布，不需要高频按 slot 查询。
4. 过早拆表会增加一致性复杂度。

## 14. 运行时依赖装配

`apps/api/src/app/dependencies.ts` 目标：

```ts
const storage = createObjectStorage()
const mediaObjectRepository = createMediaObjectRepository()
const mediaObjectService = new MediaObjectService(mediaObjectRepository, storage, remoteMediaFetcher)
const workflowMediaResolver = new WorkflowMediaResolver(mediaObjectService, tasksService)
const outputFinalizer = new TaskOutputFinalizer(mediaObjectService)
const outputPostProcessor = new OutputPostProcessor(new FfmpegVideoCoverGenerator(mediaObjectService))
```

注意循环依赖：

1. `TasksService` 当前被 `WorkflowMediaResolver` 需要，用于读上游 task output。
2. `TasksService` 又需要 output finalizer/post processor。
3. 解决方式：`WorkflowMediaResolver` 注入到 `WorkflowNodeExecutor`，不要注入到 `TasksService`。
4. `OutputFinalizer` 注入到 `TaskLifecycle` 或 `TasksService` 的 lifecycle dependencies。

## 15. 推荐实施顺序

### Step 1: Contracts

1. 新增 media contract。
2. 增强 task schemas。
3. 增强 canvas node `mediaSlots`。
4. 保留旧 edge schema 的临时兼容测试，或一次性迁移测试数据。

验证：

```text
bun --filter @mina/contracts typecheck
```

### Step 2: DB 与 repository

1. 新增 `media_objects` schema。
2. 增强 `task_resources` schema。
3. 新增 in-memory 和 drizzle media object repository。
4. repository 层统一 Zod parse。

验证：

```text
media object create/get/update tests
task resources new fields roundtrip tests
```

### Step 3: MediaObjectService

1. 实现 key 生成。
2. 实现 `createFromBuffer`。
3. 实现 `createFromRemoteUrl`。
4. 实现 storage usage 聚合。

验证：

```text
object key account isolation
data URL or buffer creates ready media object
remote fetch error maps to controlled error
usage sums byteSize
```

### Step 4: WorkflowMediaResolver

1. 实现 `media_object` 解析。
2. 实现 `external_url` 解析。
3. 实现 `current_media` 解析。
4. 实现 `run_output` 解析。
5. 实现 slot 排序与单值槽校验。

验证：

```text
single node local media no edges can run
mixed media object + A + B order preserved
required missing source fails
optional missing source skips
current_media uses mediaView, not latest task
run_output uses current workflow run node state
```

### Step 5: WorkflowNodeExecutor

1. 替换 `resolveIncomingMediaInputs`。
2. 使用 `WorkflowMediaResolver.resolveNodeMedia`。
3. `buildMediaEnvelope` 改成接收 resolved slot items。
4. 保留旧 media-selection helper 中 output selector 的纯函数。

验证：

```text
普通画布 B 只运行 B
流程组 A -> B 等 A 完成再运行 B
流程组多起点汇合等待所有 predecessor succeeded
```

### Step 6: Task input resources

1. 增强 `taskResourceFromInput`。
2. 写入 `mediaObjectId/slot/slotItemId/slotOrder/source`。
3. `ModelSpec.collectInputResources` 保持简单，必要时从 `MediaInput` 提取扩展字段。

验证：

```text
task_resources input contains mediaObjectId and source
task resources list can explain input lineage
```

### Step 7: Output finalizer

1. 新增 `TaskOutputFinalizer`。
2. 支持 data URL、http(s)、已有 Mina media object。
3. 创建 output `media_objects`。
4. 增强 `taskResourceFromOutput`。
5. 视频封面改为通过 `MediaObjectService` 创建 media object。

验证：

```text
image output mirrored to media_objects
video output mirrored to media_objects
video cover creates child media object
tasks.output resources contain mediaObjectId
task_resources output contains mediaObjectId
```

### Step 8: Storage cleanup and usage

1. 添加 orphan/uploading timeout cleanup service。
2. 添加 account usage query。
3. 暂不暴露 API，但 service 测试完整。

验证：

```text
expired uploading media object soft deleted or removed
storage usage excludes deleted/failed
```

## 16. 测试计划

### Contracts

1. `NodeMediaSlotSourceSchema` discriminated union。
2. `mediaSlots` 支持 mixed ordered items。
3. 单值槽位业务校验在后端 validation 覆盖。
4. `MediaInputSourceSchema` 覆盖四种来源。
5. `NodeOutputResource.mediaObjectId` 可选。

### Media

1. object key 在 account root 下。
2. path segment 编码防止 `../`。
3. buffer 创建 media object。
4. remote URL 创建 media object。
5. usage 聚合。
6. deleted/failed 不计入 usage。

### Workflow

1. 没有 edge 但有 `media_object` slot item 的节点可运行。
2. 一个 slot 中 `media_object + node A + node B` 顺序正确。
3. 普通画布 `current_media` 使用 source node `mediaView`。
4. 普通画布 source node 没有 `mediaView` 且 required=true 时失败。
5. 流程组 `run_output` 使用本次 run output。
6. 流程组缺失 selector output 时失败。
7. flow_group 转 node_group 后 `run_output` 降级为 `current_media`。
8. edge 与 mediaSlots 不一致时 workflow 保存失败。

### Task

1. task input resources 写入 source。
2. task output resources 写入 mediaObjectId。
3. provider 输出 data URL 镜像成功。
4. provider 输出 http URL 镜像成功。
5. 输出镜像失败时任务是否失败需要明确：推荐失败，因为 Mina 需要持久化输出。

### Provider

1. provider spec 不出现 storage/media object 依赖。
2. Google/Volcengine mapper 仍只返回标准 output。
3. `TaskOutputFinalizer` 对所有 provider 统一生效。

## 17. 风险与取舍

### 17.1 为什么不用 edge 保存全部媒体输入

edge 不能自然表达：

```text
本地上传图
来自节点 A
来自节点 B
资产库选择
```

这些项在同一个槽位里的顺序属于目标节点表单状态，不属于图连接本身。强行用 edge 表达会导致：

1. 本地媒体没有 source node，只能造假 edge。
2. 排序依赖 edge 顺序，不稳定。
3. 删除/排序/替换媒体时容易破坏图结构。

因此顺序必须归 `node.data.mediaSlots`。

### 17.2 为什么任务输出要镜像到 Mina 存储

如果只保存 provider URL：

1. URL 可能过期。
2. 无法做用户级存储占用。
3. 权限不受 Mina 控制。
4. 任务历史展示不稳定。
5. 删除用户数据时无法可靠清理。

因此最终输出应统一进入 `media_objects`。

### 17.3 为什么 `media_objects` 不是资产库

很多上传是一次性的，不应自动出现在用户素材库。`media_objects` 只是文件主表；资产库是可选索引表。

```text
media_objects          所有 Mina 管理的媒体文件
media_library_items    用户明确保存/收藏/组织的素材
```

### 17.4 为什么不立即拆 workflow media slot 表

当前 workflow 主要以整张画布读写，React Flow 数据结构天然是文档模型。拆表会增加同步复杂度，但没有明显查询收益。保留 JSONB 更简单、风险更低。

## 18. 验收标准

完成本次核心重构后，应满足：

1. 用户上传媒体和任务输出媒体都能进入 `media_objects`。
2. 所有 Mina 管理媒体都在 `users/{accountId}/media/{mediaObjectId}/...` 下。
3. 用户存储占用可以从 `media_objects.byteSize` 聚合。
4. 节点没有边但有本地/媒体对象输入时可以创建任务。
5. 普通画布 A -> B 时，运行 B 只运行 B，B 读取 A 当前 `mediaView`。
6. 流程组 A -> B 时，B 读取本次 run 中 A 的输出。
7. 媒体槽内混排顺序由 `mediaSlots[slot][].order` 决定。
8. `TaskConfig.media` 存最终输入快照。
9. `task_resources` 能说明输入来自哪个 `mediaObjectId` 或哪个上游节点输出。
10. Provider spec 不依赖 media object、workflow、storage。
11. 输出上传失败时有明确失败事件和可诊断错误。
12. `bun run typecheck`、`bun run test`、`bun run build` 通过。

## 19. 最终架构摘要

```text
用户上传 / provider 输出
  -> ObjectStorage
  -> media_objects

WorkflowCanvasNode.data.mediaSlots
  -> 描述目标节点每个媒体槽的有序来源

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
  -> media_objects for outputs and covers
  -> tasks.output
  -> task_resources output snapshot
```

核心取舍：**媒体文件归 `media_objects`，媒体槽顺序归目标节点 `mediaSlots`，任务资源归 `task_resources`，provider 差异归 `ModelSpec`。** 这样边界清楚、运行链路简单，也最不容易在后续新增 provider、模型、资产库和上传入口时改坏核心执行逻辑。
