import { z } from 'zod'

import {
  ImageGenerationConfigSchema,
  NodeExecutionOutputSchema,
  ResourceKindSchema,
  ResourceRefSchema,
  ResourceRoleSchema,
  VideoGenerationConfigSchema,
} from '../tasks/task.schemas'

export const WorkflowNodeTypeSchema = z.enum([
  'image_generation',
  'video_generation',
  'flow_group',
  'node_group',
  'text',
])

export const WorkflowRunModeSchema = z.enum(['isolated_node', 'flow_group'])
export const WorkflowRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const WorkflowNodeRunStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped'])

export const NodeMediaViewStateSchema = z.object({
  taskId: z.string().min(1).optional(),
  outputResourceId: z.string().min(1).optional(),
  outputIndex: z.number().int().min(0).optional(),
})

export const ImageGenerationNodeConfigSchema = z.object({
  task: ImageGenerationConfigSchema.optional(),
})

export const VideoGenerationNodeConfigSchema = z.object({
  task: VideoGenerationConfigSchema.optional(),
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
  }),
  z.object({
    nodeType: z.literal('video_generation'),
    title: z.string().min(1),
    config: VideoGenerationNodeConfigSchema,
    mediaView: NodeMediaViewStateSchema.optional(),
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
  connection: MediaSlotConnectionSchema,
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

export const WorkflowSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().min(1),
  nodes: z.array(WorkflowCanvasNodeSchema),
  edges: z.array(WorkflowCanvasEdgeSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const WorkflowRunNodeStateSchema = z.object({
  status: WorkflowNodeRunStatusSchema,
  taskId: z.string().min(1).optional(),
  output: NodeExecutionOutputSchema.optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
})

export const WorkflowRunSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  accountId: z.string().min(1),
  workflowVersion: z.number().int().min(1),
  runMode: WorkflowRunModeSchema,
  selectedNodeId: z.string().min(1),
  scopeGroupNodeId: z.string().min(1).optional(),
  snapshotNodes: z.array(WorkflowCanvasNodeSchema),
  snapshotEdges: z.array(WorkflowCanvasEdgeSchema),
  nodeStates: z.record(z.string(), WorkflowRunNodeStateSchema),
  status: WorkflowRunStatusSchema,
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
})

export const CreateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nodes: z.array(WorkflowCanvasNodeSchema).default([]),
  edges: z.array(WorkflowCanvasEdgeSchema).default([]),
})

export const UpdateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  version: z.number().int().min(1),
  nodes: z.array(WorkflowCanvasNodeSchema),
  edges: z.array(WorkflowCanvasEdgeSchema),
})

export const WorkflowParamsSchema = z.object({
  id: z.string().min(1),
})

export const WorkflowRunParamsSchema = z.object({
  runId: z.string().min(1),
})

export const CreateWorkflowRunSchema = z.object({
  selectedNodeId: z.string().min(1),
  expectedWorkflowVersion: z.number().int().min(1),
})

export const UpdateNodeMediaViewSchema = z.object({
  mediaView: NodeMediaViewStateSchema.optional(),
})

export const WorkflowListResponseSchema = z.object({
  items: z.array(WorkflowSchema),
})

export const WorkflowResponseSchema = z.object({
  item: WorkflowSchema,
})

export const WorkflowRunListResponseSchema = z.object({
  items: z.array(WorkflowRunSchema),
})

export const WorkflowRunResponseSchema = z.object({
  item: WorkflowRunSchema,
})

export const DeleteWorkflowResponseSchema = z.object({
  success: z.literal(true),
})

export const CancelWorkflowRunResponseSchema = z.object({
  success: z.literal(true),
})

export type CancelWorkflowRunResponse = z.infer<typeof CancelWorkflowRunResponseSchema>
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>
export type CreateWorkflowRunInput = z.infer<typeof CreateWorkflowRunSchema>
export type DeleteWorkflowResponse = z.infer<typeof DeleteWorkflowResponseSchema>
export type MediaSlotConnection = z.infer<typeof MediaSlotConnectionSchema>
export type NodeMediaViewState = z.infer<typeof NodeMediaViewStateSchema>
export type UpdateNodeMediaViewInput = z.infer<typeof UpdateNodeMediaViewSchema>
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>
export type Workflow = z.infer<typeof WorkflowSchema>
export type WorkflowCanvasEdge = z.infer<typeof WorkflowCanvasEdgeSchema>
export type WorkflowCanvasNode = z.infer<typeof WorkflowCanvasNodeSchema>
export type WorkflowEdgeData = z.infer<typeof WorkflowEdgeDataSchema>
export type WorkflowListResponse = z.infer<typeof WorkflowListResponseSchema>
export type WorkflowNodeData = z.infer<typeof WorkflowNodeDataSchema>
export type WorkflowNodeRunStatus = z.infer<typeof WorkflowNodeRunStatusSchema>
export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeSchema>
export type WorkflowParams = z.infer<typeof WorkflowParamsSchema>
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>
export type WorkflowRunListResponse = z.infer<typeof WorkflowRunListResponseSchema>
export type WorkflowRunMode = z.infer<typeof WorkflowRunModeSchema>
export type WorkflowRunParams = z.infer<typeof WorkflowRunParamsSchema>
export type WorkflowRunResponse = z.infer<typeof WorkflowRunResponseSchema>
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>
export type WorkflowRunNodeState = z.infer<typeof WorkflowRunNodeStateSchema>
