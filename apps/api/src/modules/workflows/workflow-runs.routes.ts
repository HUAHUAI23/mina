import { sValidator } from '@hono/standard-validator'
import {
  CancelWorkflowRunResponseSchema,
  WorkflowRunParamsSchema,
} from '@mina/contracts/modules/workflows'
import { Hono } from 'hono'

import type { WorkflowsService } from './workflows.service'

export const createWorkflowRunsRoutes = (workflowsService: WorkflowsService): Hono =>
  new Hono()
    .get('/:runId', sValidator('param', WorkflowRunParamsSchema), async (c) => {
      const { runId } = c.req.valid('param')
      return c.json({ item: await workflowsService.getRun(runId) })
    })
    .post('/:runId/cancel', sValidator('param', WorkflowRunParamsSchema), async (c) => {
      const { runId } = c.req.valid('param')
      await workflowsService.cancelRun(runId)
      return c.json(CancelWorkflowRunResponseSchema.parse({ success: true }))
    })
