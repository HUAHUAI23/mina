import { sValidator } from '@hono/standard-validator'
import {
  CreateWorkflowRunSchema,
  CreateWorkflowSchema,
  DeleteWorkflowResponseSchema,
  UpdateNodeMediaViewSchema,
  UpdateWorkflowSchema,
  WorkflowParamsSchema,
} from '@mina/contracts/modules/workflows'
import { Hono } from 'hono'

import type { WorkflowsService } from './workflows.service'

export const createWorkflowsRoutes = (workflowsService: WorkflowsService): Hono =>
  new Hono()
    .get('/', async (c) => c.json({ items: await workflowsService.listWorkflows() }))
    .post('/', sValidator('json', CreateWorkflowSchema), async (c) => {
      const payload = c.req.valid('json')
      return c.json({ item: await workflowsService.createWorkflow(payload) }, 201)
    })
    .get('/:id', sValidator('param', WorkflowParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      return c.json({ item: await workflowsService.getWorkflow(id) })
    })
    .put(
      '/:id',
      sValidator('param', WorkflowParamsSchema),
      sValidator('json', UpdateWorkflowSchema),
      async (c) => {
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        return c.json({ item: await workflowsService.updateWorkflow(id, payload) })
      },
    )
    .delete('/:id', sValidator('param', WorkflowParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      await workflowsService.deleteWorkflow(id)
      return c.json(DeleteWorkflowResponseSchema.parse({ success: true }))
    })
    .patch(
      '/:id/nodes/:nodeId/media-view',
      sValidator('json', UpdateNodeMediaViewSchema),
      async (c) => {
        const id = c.req.param('id')
        const nodeId = c.req.param('nodeId')
        const payload = c.req.valid('json')
        return c.json({ item: await workflowsService.updateNodeMediaView(id, nodeId, payload) })
      },
    )
    .get('/:id/nodes/:nodeId/tasks', async (c) => {
      const id = c.req.param('id')
      const nodeId = c.req.param('nodeId')
      return c.json({ items: await workflowsService.getNodeTasks(id, nodeId) })
    })
    .post(
      '/:id/runs',
      sValidator('param', WorkflowParamsSchema),
      sValidator('json', CreateWorkflowRunSchema),
      async (c) => {
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        return c.json({ item: await workflowsService.createRun(id, payload) }, 201)
      },
    )
    .get('/:id/runs', sValidator('param', WorkflowParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      return c.json({ items: await workflowsService.listRuns(id) })
    })
