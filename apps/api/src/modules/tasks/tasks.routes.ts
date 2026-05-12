import { sValidator } from '@hono/standard-validator'
import { CancelTaskResponseSchema, TaskParamsSchema } from '@mina/contracts'
import { Hono } from 'hono'

import type { TasksService } from './tasks.service'

export const createTasksRoutes = (tasksService: TasksService): Hono =>
  new Hono()
    .get('/', async (c) => c.json({ items: await tasksService.listTasks() }))
    .get('/:id', sValidator('param', TaskParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      return c.json({ item: await tasksService.getTask(id) })
    })
    .post('/:id/cancel', sValidator('param', TaskParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      await tasksService.cancelTask(id)
      return c.json(CancelTaskResponseSchema.parse({ success: true }))
    })
