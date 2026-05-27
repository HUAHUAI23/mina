import {
  AddWorkflowToProjectSchema,
  CreateProjectFromWorkflowsSchema,
  CreateProjectSchema,
  DeleteProjectResponseSchema,
  ProjectParamsSchema,
  ProjectWorkflowParamsSchema,
  ProjectsOverviewResponseSchema,
  ProjectResponseSchema,
  RemoveWorkflowFromProjectResponseSchema,
  UpdateProjectSchema,
} from '@mina/contracts/modules/projects'
import { Hono } from 'hono'

import { apiValidator } from '../../lib/http/validation'
import { requireAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import type { ProjectsService } from './projects.service'

export const createProjectsRoutes = (
  projectsService: ProjectsService,
  accountsService: AccountsService,
): Hono =>
  new Hono()
    .get('/overview', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(ProjectsOverviewResponseSchema.parse(await projectsService.listOverview(actor.accountId)))
    })
    .post('/', apiValidator('json', CreateProjectSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json(ProjectResponseSchema.parse({ item: await projectsService.createProject(actor.accountId, payload) }), 201)
    })
    .post('/from-workflows', apiValidator('json', CreateProjectFromWorkflowsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json(
        ProjectResponseSchema.parse({ item: await projectsService.createProjectFromWorkflows(actor.accountId, payload) }),
        201,
      )
    })
    .get('/:id', apiValidator('param', ProjectParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json(ProjectResponseSchema.parse({ item: await projectsService.getProject(actor.accountId, id) }))
    })
    .patch(
      '/:id',
      apiValidator('param', ProjectParamsSchema),
      apiValidator('json', UpdateProjectSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        return c.json(ProjectResponseSchema.parse({ item: await projectsService.updateProject(actor.accountId, id, payload) }))
      },
    )
    .delete('/:id', apiValidator('param', ProjectParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      await projectsService.deleteProject(actor.accountId, id)
      return c.json(DeleteProjectResponseSchema.parse({ success: true }))
    })
    .post(
      '/:id/workflows',
      apiValidator('param', ProjectParamsSchema),
      apiValidator('json', AddWorkflowToProjectSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        return c.json(ProjectResponseSchema.parse({ item: await projectsService.addWorkflow(actor.accountId, id, payload.workflowId) }))
      },
    )
    .delete('/:id/workflows/:workflowId', apiValidator('param', ProjectWorkflowParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id, workflowId } = c.req.valid('param')
      await projectsService.removeWorkflow(actor.accountId, id, workflowId)
      return c.json(RemoveWorkflowFromProjectResponseSchema.parse({ success: true }))
    })
