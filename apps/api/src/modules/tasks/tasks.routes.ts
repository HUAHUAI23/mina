import { sValidator } from '@hono/standard-validator'
import {
  CancelTaskResponseSchema,
  CreateTaskSchema,
  TaskParamsSchema,
  TaskResourceListResponseSchema,
} from '@mina/contracts'
import { Hono } from 'hono'

import { DEFAULT_ACCOUNT_ID } from '../accounts/accounts.data'
import type { TasksService } from './tasks.service'

export const createTasksRoutes = (tasksService: TasksService): Hono =>
  new Hono()
    .get('/', async (c) => c.json({ items: await tasksService.listTasks() }))
    .post('/', sValidator('json', CreateTaskSchema), async (c) => {
      const payload = c.req.valid('json')
      return c.json(
        {
          item: await tasksService.createTask({
            accountId: DEFAULT_ACCOUNT_ID,
            config: payload.config,
            inputResources: payload.inputResources,
          }),
        },
        201,
      )
    })
    .get('/:id', sValidator('param', TaskParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      return c.json({ item: await tasksService.getTask(id) })
    })
    .get('/:id/resources', sValidator('param', TaskParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      await tasksService.getTask(id)
      return c.json(TaskResourceListResponseSchema.parse({ items: await tasksService.listTaskResources(id) }))
    })
    .post('/:id/cancel', sValidator('param', TaskParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      await tasksService.cancelTask(id)
      return c.json(CancelTaskResponseSchema.parse({ success: true }))
    })
