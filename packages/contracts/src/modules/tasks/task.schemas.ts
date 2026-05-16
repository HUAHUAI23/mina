import { z } from 'zod'

import { MediaSlotNameSchema } from '../media/slot.schemas'

export const IsoDateTimeSchema = z.string().datetime()

export const ResourceKindSchema = z.enum(['image', 'video', 'audio'])
export const ResourceRoleSchema = z.enum([
  'generated_image',
  'generated_video',
  'video_cover',
  'last_frame',
  'first_frame',
  'reference_image',
  'reference_audio',
  'reference_video',
])

export const TaskKindSchema = z.enum(['image_generation', 'video_generation'])
export const TaskModeSchema = z.enum(['sync', 'async'])
export const TaskStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const BillingMetricSchema = z.enum(['token', 'image', 'duration_second'])

export const ResourceMetadataSchema = z.record(z.string(), z.unknown())

export const ResourceRefSchema = z.object({
  id: z.string().min(1).optional(),
  kind: ResourceKindSchema,
  url: z.string().min(1),
  role: ResourceRoleSchema.optional(),
  index: z.number().int().min(0).optional(),
  metadata: ResourceMetadataSchema.optional(),
})

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

export const NodeOutputResourceSchema = z.object({
  id: z.string().min(1),
  kind: ResourceKindSchema,
  role: ResourceRoleSchema,
  index: z.number().int().min(0),
  url: z.string().min(1),
  mediaObjectId: z.string().min(1).optional(),
  metadata: ResourceMetadataSchema.optional(),
})

export const TaskResourceSourceSchema = MediaInputSourceSchema

export const NodeExecutionOutputSchema = z.object({
  resources: z.array(NodeOutputResourceSchema),
  variables: z
    .object({
      imageUrls: z.array(z.string()).optional(),
      videoUrls: z.array(z.string()).optional(),
      videoCoverUrls: z.array(z.string()).optional(),
      audioUrls: z.array(z.string()).optional(),
      firstFrameUrls: z.array(z.string()).optional(),
      lastFrameUrls: z.array(z.string()).optional(),
      actualCost: z.number().nonnegative().optional(),
    })
    .default({}),
})

export const TaskMediaConfigSchema = z
  .object({
    inputImages: z.array(MediaInputSchema).default([]),
    firstFrame: MediaInputSchema.optional(),
    lastFrame: MediaInputSchema.optional(),
    referenceImages: z.array(MediaInputSchema).default([]),
    referenceAudios: z.array(MediaInputSchema).default([]),
    referenceVideos: z.array(MediaInputSchema).default([]),
  })
  .default({
    inputImages: [],
    referenceImages: [],
    referenceAudios: [],
    referenceVideos: [],
  })

export const TaskDraftConfigSchema = z.object({
  kind: TaskKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
})

export const TaskConfigSchema = TaskDraftConfigSchema.extend({
  media: TaskMediaConfigSchema,
})

export const TaskUsageSchema = z.object({
  metric: BillingMetricSchema,
  amount: z.number().nonnegative(),
})

export const TaskCostSchema = z.object({
  estimatedCost: z.number().nonnegative(),
  actualCost: z.number().nonnegative().optional(),
  usage: TaskUsageSchema,
})

export const TaskResourceSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  taskId: z.string().min(1),
  direction: z.enum(['input', 'output']),
  kind: ResourceKindSchema,
  url: z.string().min(1),
  role: ResourceRoleSchema.optional(),
  outputIndex: z.number().int().min(0).optional(),
  mediaObjectId: z.string().min(1).optional(),
  slot: MediaSlotNameSchema.optional(),
  slotItemId: z.string().min(1).optional(),
  slotOrder: z.number().int().nonnegative().optional(),
  source: TaskResourceSourceSchema.optional(),
  metadata: ResourceMetadataSchema.optional(),
})

export const TaskSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  kind: TaskKindSchema,
  mode: TaskModeSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  status: TaskStatusSchema,
  config: TaskConfigSchema,
  externalTaskId: z.string().min(1).optional(),
  providerStatus: z.string().min(1).optional(),
  providerMetadata: ResourceMetadataSchema.optional(),
  cost: TaskCostSchema,
  output: NodeExecutionOutputSchema.optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  submittedAt: IsoDateTimeSchema.optional(),
  startedAt: IsoDateTimeSchema.optional(),
  lastPolledAt: IsoDateTimeSchema.optional(),
  nextRetryAt: IsoDateTimeSchema.optional(),
  expiresAt: IsoDateTimeSchema.optional(),
  completedAt: IsoDateTimeSchema.optional(),
  retryCount: z.number().int().nonnegative().optional(),
})

export const TaskParamsSchema = z.object({
  id: z.string().min(1),
})

export const CreateTaskSchema = z.object({
  config: TaskConfigSchema,
})

export const TaskListResponseSchema = z.object({
  items: z.array(TaskSchema),
})

export const TaskResponseSchema = z.object({
  item: TaskSchema,
})

export const TaskResourceListResponseSchema = z.object({
  items: z.array(TaskResourceSchema),
})

export const CancelTaskResponseSchema = z.object({
  success: z.literal(true),
})

export type BillingMetric = z.infer<typeof BillingMetricSchema>
export type CancelTaskResponse = z.infer<typeof CancelTaskResponseSchema>
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type MediaInput = z.infer<typeof MediaInputSchema>
export type MediaInputSource = z.infer<typeof MediaInputSourceSchema>
export type NodeExecutionOutput = z.infer<typeof NodeExecutionOutputSchema>
export type NodeOutputResource = z.infer<typeof NodeOutputResourceSchema>
export type ResourceKind = z.infer<typeof ResourceKindSchema>
export type ResourceRef = z.infer<typeof ResourceRefSchema>
export type ResourceRole = z.infer<typeof ResourceRoleSchema>
export type Task = z.infer<typeof TaskSchema>
export type TaskConfig = z.infer<typeof TaskConfigSchema>
export type TaskDraftConfig = z.infer<typeof TaskDraftConfigSchema>
export type TaskMediaConfig = z.infer<typeof TaskMediaConfigSchema>
export type TaskKind = z.infer<typeof TaskKindSchema>
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>
export type TaskMode = z.infer<typeof TaskModeSchema>
export type TaskParams = z.infer<typeof TaskParamsSchema>
export type TaskResource = z.infer<typeof TaskResourceSchema>
export type TaskResourceSource = z.infer<typeof TaskResourceSourceSchema>
export type TaskResourceListResponse = z.infer<typeof TaskResourceListResponseSchema>
export type TaskResponse = z.infer<typeof TaskResponseSchema>
export type TaskStatus = z.infer<typeof TaskStatusSchema>
export type TaskUsage = z.infer<typeof TaskUsageSchema>
