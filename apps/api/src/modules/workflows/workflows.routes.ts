import {
  CreateWorkflowRunSchema,
  CreateWorkflowSchema,
  DeleteWorkflowResponseSchema,
  UpdateWorkflowSchema,
  WorkflowNodeTaskHistoryResponseSchema,
  WorkflowParamsSchema,
} from '@mina/contracts/modules/workflows'
import { Hono } from 'hono'
import { getRequestLocale } from '@mina/i18n/server'

import { apiValidator } from '../../lib/http/validation'
import { requireAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import type { WorkflowsService } from './workflows.service'

export const createWorkflowsRoutes = (
  workflowsService: WorkflowsService,
  accountsService: AccountsService,
): Hono =>
  new Hono()
    .get('/', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json({ items: await workflowsService.listWorkflows(actor.accountId) })
    })
    .post('/', apiValidator('json', CreateWorkflowSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json({ item: await workflowsService.createWorkflow(payload, actor.accountId) }, 201)
    })
    .get('/:id', apiValidator('param', WorkflowParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      const [item, nodeRuntime] = await Promise.all([
        workflowsService.getWorkflow(id, actor.accountId),
        workflowsService.listNodeRuntime(id, actor.accountId),
      ])
      return c.json({ item, nodeRuntime })
    })
    .patch(
      '/:id',
      apiValidator('param', WorkflowParamsSchema),
      apiValidator('json', UpdateWorkflowSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        return c.json({ item: await workflowsService.updateWorkflow(id, payload, actor.accountId) })
      },
    )
    .delete('/:id', apiValidator('param', WorkflowParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      await workflowsService.deleteWorkflow(id, actor.accountId)
      return c.json(DeleteWorkflowResponseSchema.parse({ success: true }))
    })
    .get('/:id/nodes/:nodeId/tasks', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const id = c.req.param('id')
      const nodeId = c.req.param('nodeId')
      return c.json(
        WorkflowNodeTaskHistoryResponseSchema.parse({
          items: await workflowsService.getNodeTasks(id, nodeId, actor.accountId, getRequestLocale(c)),
        }),
      )
    })
    .post(
      '/:id/runs',
      apiValidator('param', WorkflowParamsSchema),
      apiValidator('json', CreateWorkflowRunSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        const run = await workflowsService.createRun(id, payload, actor.accountId, getRequestLocale(c))
        return c.json({ item: run }, 201)
      },
    )
    .get('/:id/runs', apiValidator('param', WorkflowParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json({ items: await workflowsService.listRuns(id, actor.accountId, getRequestLocale(c)) })
    })
