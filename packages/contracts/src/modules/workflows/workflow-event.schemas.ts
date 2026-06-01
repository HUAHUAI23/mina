import { z } from 'zod'

import { NodeMediaViewStateSchema } from '../canvas/canvas.schemas'
import { TaskStatusSchema } from '../tasks/task.schemas'
import { WorkflowRunStatusSchema } from './workflow.schemas'

const WorkflowEventBaseSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  accountId: z.string().min(1),
  version: z.number().int().min(1).optional(),
  sourceClientId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
})

export const WorkflowDefinitionUpdatedEventSchema = WorkflowEventBaseSchema.extend({
  type: z.literal('workflow.definition.updated'),
  payload: z.object({
    changedEdgeIds: z.array(z.string().min(1)).default([]),
    changedNodeIds: z.array(z.string().min(1)).default([]),
  }),
})

export const WorkflowNodeMediaViewUpdatedEventSchema = WorkflowEventBaseSchema.extend({
  type: z.literal('workflow.node.mediaView.updated'),
  payload: z.object({
    nodeId: z.string().min(1),
    mediaView: NodeMediaViewStateSchema.optional(),
  }),
})

export const WorkflowRunUpdatedEventSchema = WorkflowEventBaseSchema.extend({
  type: z.literal('workflow.run.updated'),
  payload: z.object({
    runId: z.string().min(1),
    status: WorkflowRunStatusSchema,
  }),
})

export const WorkflowNodeTaskUpdatedEventSchema = WorkflowEventBaseSchema.extend({
  type: z.literal('workflow.node.task.updated'),
  payload: z.object({
    nodeId: z.string().min(1),
    taskId: z.string().min(1),
    status: TaskStatusSchema,
    taskCreatedAt: z.string().datetime().optional(),
    taskUpdatedAt: z.string().datetime().optional(),
  }),
})

export const WorkflowMediaObjectReadyEventSchema = WorkflowEventBaseSchema.extend({
  type: z.literal('workflow.mediaObject.ready'),
  payload: z.object({
    mediaObjectId: z.string().min(1),
  }),
})

export const WorkflowRemoteConflictEventSchema = WorkflowEventBaseSchema.extend({
  type: z.literal('workflow.remote.conflict'),
  payload: z.object({
    message: z.string().min(1),
  }),
})

export const WorkflowEventSchema = z.discriminatedUnion('type', [
  WorkflowDefinitionUpdatedEventSchema,
  WorkflowNodeMediaViewUpdatedEventSchema,
  WorkflowRunUpdatedEventSchema,
  WorkflowNodeTaskUpdatedEventSchema,
  WorkflowMediaObjectReadyEventSchema,
  WorkflowRemoteConflictEventSchema,
])

export type WorkflowDefinitionUpdatedEvent = z.infer<typeof WorkflowDefinitionUpdatedEventSchema>
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>
export type WorkflowMediaObjectReadyEvent = z.infer<typeof WorkflowMediaObjectReadyEventSchema>
export type WorkflowNodeMediaViewUpdatedEvent = z.infer<typeof WorkflowNodeMediaViewUpdatedEventSchema>
export type WorkflowNodeTaskUpdatedEvent = z.infer<typeof WorkflowNodeTaskUpdatedEventSchema>
export type WorkflowRemoteConflictEvent = z.infer<typeof WorkflowRemoteConflictEventSchema>
export type WorkflowRunUpdatedEvent = z.infer<typeof WorkflowRunUpdatedEventSchema>
