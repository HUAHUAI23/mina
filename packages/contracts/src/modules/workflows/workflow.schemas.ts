import { z } from 'zod'

import {
  WorkflowCanvasEdgeSchema,
  WorkflowCanvasNodeSchema,
} from '../canvas/canvas.schemas'
import { NodeExecutionOutputSchema, TaskSchema } from '../tasks/task.schemas'

export const WorkflowRunModeSchema = z.enum(['isolated_node', 'flow_group'])
export const WorkflowRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const WorkflowNodeRunStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped'])

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

export const CheckpointWorkflowCollaborationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
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

export const WorkflowNodeTaskHistoryItemSchema = z.object({
  workflowRunId: z.string().min(1),
  nodeId: z.string().min(1),
  task: TaskSchema,
})

export const WorkflowNodeTaskHistoryResponseSchema = z.object({
  items: z.array(WorkflowNodeTaskHistoryItemSchema),
})

export const WorkflowListResponseSchema = z.object({
  items: z.array(WorkflowSchema),
})

export const WorkflowResponseSchema = z.object({
  item: WorkflowSchema,
})

export const WorkflowCollaborationCheckpointResponseSchema = z.object({
  item: WorkflowSchema,
  yjsStateVector: z.array(z.number().int().min(0).max(255)),
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
export type CheckpointWorkflowCollaborationInput = z.infer<typeof CheckpointWorkflowCollaborationSchema>
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>
export type CreateWorkflowRunInput = z.infer<typeof CreateWorkflowRunSchema>
export type DeleteWorkflowResponse = z.infer<typeof DeleteWorkflowResponseSchema>
export type Workflow = z.infer<typeof WorkflowSchema>
export type WorkflowListResponse = z.infer<typeof WorkflowListResponseSchema>
export type WorkflowNodeTaskHistoryItem = z.infer<typeof WorkflowNodeTaskHistoryItemSchema>
export type WorkflowNodeTaskHistoryResponse = z.infer<typeof WorkflowNodeTaskHistoryResponseSchema>
export type WorkflowNodeRunStatus = z.infer<typeof WorkflowNodeRunStatusSchema>
export type WorkflowParams = z.infer<typeof WorkflowParamsSchema>
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>
export type WorkflowCollaborationCheckpointResponse = z.infer<typeof WorkflowCollaborationCheckpointResponseSchema>
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>
export type WorkflowRunListResponse = z.infer<typeof WorkflowRunListResponseSchema>
export type WorkflowRunMode = z.infer<typeof WorkflowRunModeSchema>
export type WorkflowRunParams = z.infer<typeof WorkflowRunParamsSchema>
export type WorkflowRunResponse = z.infer<typeof WorkflowRunResponseSchema>
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>
export type WorkflowRunNodeState = z.infer<typeof WorkflowRunNodeStateSchema>
