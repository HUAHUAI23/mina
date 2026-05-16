import { z } from 'zod'

import {
  NodeMediaSlotsSchema,
  WorkflowMediaLinkConnectionSchema,
} from '../media/media.schemas'
import {
  ResourceKindSchema,
  ResourceRefSchema,
  ResourceRoleSchema,
  TaskDraftConfigSchema,
} from '../tasks/task.schemas'

export const WorkflowNodeTypeSchema = z.enum([
  'image_generation',
  'video_generation',
  'flow_group',
  'node_group',
  'text',
])

export const NodeMediaViewStateSchema = z.object({
  taskId: z.string().min(1).optional(),
  outputResourceId: z.string().min(1).optional(),
  outputIndex: z.number().int().min(0).optional(),
})

export const ImageGenerationNodeConfigSchema = z.object({
  task: TaskDraftConfigSchema.optional(),
})

export const VideoGenerationNodeConfigSchema = z.object({
  task: TaskDraftConfigSchema.optional(),
})

export const FlowGroupNodeConfigSchema = z.object({
  note: z.string().optional(),
})

export const NodeGroupNodeConfigSchema = z.object({
  note: z.string().optional(),
})

export const TextNodeConfigSchema = z.object({
  text: z.string().default(''),
})

export const WorkflowNodeDataSchema = z.discriminatedUnion('nodeType', [
  z.object({
    nodeType: z.literal('image_generation'),
    title: z.string().min(1),
    config: ImageGenerationNodeConfigSchema,
    mediaView: NodeMediaViewStateSchema.optional(),
    mediaSlots: NodeMediaSlotsSchema.optional(),
  }),
  z.object({
    nodeType: z.literal('video_generation'),
    title: z.string().min(1),
    config: VideoGenerationNodeConfigSchema,
    mediaView: NodeMediaViewStateSchema.optional(),
    mediaSlots: NodeMediaSlotsSchema.optional(),
  }),
  z.object({
    nodeType: z.literal('flow_group'),
    title: z.string().min(1),
    config: FlowGroupNodeConfigSchema,
  }),
  z.object({
    nodeType: z.literal('node_group'),
    title: z.string().min(1),
    config: NodeGroupNodeConfigSchema,
  }),
  z.object({
    nodeType: z.literal('text'),
    title: z.string().min(1),
    config: TextNodeConfigSchema,
  }),
])

export const WorkflowCanvasNodeSchema = z.object({
  id: z.string().min(1),
  type: WorkflowNodeTypeSchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  parentId: z.string().min(1).optional(),
  extent: z.literal('parent').optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  data: WorkflowNodeDataSchema,
})

export const MediaSlotConnectionSchema = z.object({
  kind: z.literal('media_slot'),
  targetSlot: z.enum([
    'inputImages',
    'firstFrame',
    'lastFrame',
    'referenceImages',
    'referenceAudios',
    'referenceVideos',
    'prompt',
  ]),
  required: z.boolean().default(true),
  sourceSelector: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('current_media') }),
    z.object({
      mode: z.literal('run_output'),
      resourceKind: ResourceKindSchema,
      role: ResourceRoleSchema,
      index: z.number().int().min(0),
    }),
    z.object({
      mode: z.literal('asset'),
      resource: ResourceRefSchema,
    }),
    z.object({
      mode: z.literal('empty'),
    }),
  ]),
})

export const WorkflowEdgeDataSchema = z.object({
  connection: z.union([WorkflowMediaLinkConnectionSchema, MediaSlotConnectionSchema]),
})

export const WorkflowCanvasEdgeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('media').default('media'),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().min(1).optional(),
  targetHandle: z.string().min(1).optional(),
  data: WorkflowEdgeDataSchema,
})

export type FlowGroupNodeConfig = z.infer<typeof FlowGroupNodeConfigSchema>
export type ImageGenerationNodeConfig = z.infer<typeof ImageGenerationNodeConfigSchema>
export type MediaSlotConnection = z.infer<typeof MediaSlotConnectionSchema>
export type NodeGroupNodeConfig = z.infer<typeof NodeGroupNodeConfigSchema>
export type NodeMediaViewState = z.infer<typeof NodeMediaViewStateSchema>
export type TextNodeConfig = z.infer<typeof TextNodeConfigSchema>
export type VideoGenerationNodeConfig = z.infer<typeof VideoGenerationNodeConfigSchema>
export type WorkflowCanvasEdge = z.infer<typeof WorkflowCanvasEdgeSchema>
export type WorkflowCanvasNode = z.infer<typeof WorkflowCanvasNodeSchema>
export type WorkflowEdgeData = z.infer<typeof WorkflowEdgeDataSchema>
export type WorkflowNodeData = z.infer<typeof WorkflowNodeDataSchema>
export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeSchema>
