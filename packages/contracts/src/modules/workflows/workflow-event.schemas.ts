import { z } from 'zod'

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

export const WorkflowEventSchema = z.discriminatedUnion('type', [
  WorkflowRunUpdatedEventSchema,
  WorkflowNodeTaskUpdatedEventSchema,
])

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>
export type WorkflowNodeTaskUpdatedEvent = z.infer<typeof WorkflowNodeTaskUpdatedEventSchema>
export type WorkflowRunUpdatedEvent = z.infer<typeof WorkflowRunUpdatedEventSchema>
