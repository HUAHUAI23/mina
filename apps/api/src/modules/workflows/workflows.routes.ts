import { sValidator } from '@hono/standard-validator'
import {
  CreateWorkflowRunSchema,
  CreateWorkflowSchema,
  DeleteWorkflowResponseSchema,
  UpdateNodeMediaViewSchema,
  UpdateWorkflowSchema,
  WorkflowNodeTaskHistoryResponseSchema,
  WorkflowParamsSchema,
} from '@mina/contracts/modules/workflows'
import { Hono } from 'hono'

import { requireAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import type { WorkflowsService } from './workflows.service'

export const createWorkflowsRoutes = (workflowsService: WorkflowsService, accountsService: AccountsService): Hono =>
  new Hono()
    .get('/', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json({ items: await workflowsService.listWorkflows(actor.accountId) })
    })
    .post('/', sValidator('json', CreateWorkflowSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json({ item: await workflowsService.createWorkflow(payload, actor.accountId) }, 201)
    })
    .get('/:id', sValidator('param', WorkflowParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json({ item: await workflowsService.getWorkflow(id, actor.accountId) })
    })
    .put(
      '/:id',
      sValidator('param', WorkflowParamsSchema),
      sValidator('json', UpdateWorkflowSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        return c.json({ item: await workflowsService.updateWorkflow(id, payload, actor.accountId) })
      },
    )
    .delete('/:id', sValidator('param', WorkflowParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      await workflowsService.deleteWorkflow(id, actor.accountId)
      return c.json(DeleteWorkflowResponseSchema.parse({ success: true }))
    })
    .patch(
      '/:id/nodes/:nodeId/media-view',
      sValidator('json', UpdateNodeMediaViewSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const id = c.req.param('id')
        const nodeId = c.req.param('nodeId')
        const payload = c.req.valid('json')
        return c.json({ item: await workflowsService.updateNodeMediaView(id, nodeId, payload, actor.accountId) })
      },
    )
    .get('/:id/nodes/:nodeId/tasks', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const id = c.req.param('id')
      const nodeId = c.req.param('nodeId')
      return c.json(WorkflowNodeTaskHistoryResponseSchema.parse({ items: await workflowsService.getNodeTasks(id, nodeId, actor.accountId) }))
    })
    .post(
      '/:id/runs',
      sValidator('param', WorkflowParamsSchema),
      sValidator('json', CreateWorkflowRunSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        return c.json({ item: await workflowsService.createRun(id, payload, actor.accountId) }, 201)
      },
    )
    .get('/:id/runs', sValidator('param', WorkflowParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json({ items: await workflowsService.listRuns(id, actor.accountId) })
    })
