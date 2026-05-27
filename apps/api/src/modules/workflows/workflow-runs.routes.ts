import {
  CancelWorkflowRunResponseSchema,
  WorkflowRunParamsSchema,
} from '@mina/contracts/modules/workflows'
import { Hono } from 'hono'
import { getRequestLocale } from '@mina/i18n/server'

import { apiValidator } from '../../lib/http/validation'
import { requireAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import type { WorkflowsService } from './workflows.service'

export const createWorkflowRunsRoutes = (workflowsService: WorkflowsService, accountsService: AccountsService): Hono =>
  new Hono()
    .get('/:runId', apiValidator('param', WorkflowRunParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { runId } = c.req.valid('param')
      return c.json({ item: await workflowsService.getRun(runId, actor.accountId, getRequestLocale(c)) })
    })
    .post('/:runId/cancel', apiValidator('param', WorkflowRunParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { runId } = c.req.valid('param')
      await workflowsService.cancelRun(runId, actor.accountId)
      return c.json(CancelWorkflowRunResponseSchema.parse({ success: true }))
    })
