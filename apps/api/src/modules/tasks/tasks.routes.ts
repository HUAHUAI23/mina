import { sValidator } from '@hono/standard-validator'
import {
  CancelTaskResponseSchema,
  CreateTaskSchema,
  TaskParamsSchema,
  TaskResourceListResponseSchema,
} from '@mina/contracts/modules/tasks'
import { TaskModelCatalogResponseSchema } from '@mina/contracts/modules/tasks/model-catalog'
import { Hono } from 'hono'

import { requireAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import type { TaskModelCatalogService } from './models/model-catalog.service'
import type { TasksService } from './tasks.service'

export const createTasksRoutes = (
  tasksService: TasksService,
  modelCatalogService: TaskModelCatalogService,
  accountsService: AccountsService,
): Hono =>
  new Hono()
    .get('/models', async (c) => c.json(TaskModelCatalogResponseSchema.parse({ items: modelCatalogService.listDescriptors() })))
    .get('/', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json({ items: await tasksService.listTasks(actor.accountId) })
    })
    .post('/', sValidator('json', CreateTaskSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json(
        {
          item: await tasksService.createTask({
            accountId: actor.accountId,
            config: payload.config,
          }),
        },
        201,
      )
    })
    .get('/:id', sValidator('param', TaskParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json({ item: await tasksService.getTaskForAccount(actor.accountId, id) })
    })
    .get('/:id/resources', sValidator('param', TaskParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json(TaskResourceListResponseSchema.parse({ items: await tasksService.listTaskResourcesForAccount(actor.accountId, id) }))
    })
    .post('/:id/cancel', sValidator('param', TaskParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      await tasksService.cancelTask(actor.accountId, id)
      return c.json(CancelTaskResponseSchema.parse({ success: true }))
    })
