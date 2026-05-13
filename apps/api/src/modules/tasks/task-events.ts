import type { Task } from '@mina/contracts'

import type { MinaDbClient } from '../../db/client'
import { taskEvents } from '../../db/schema'

export interface TaskEventInput {
  eventType: string
  message?: string
  payload?: Record<string, unknown>
  taskId: string
}

export interface TaskEventLog {
  listEvents?(taskId: string): Promise<TaskEventInput[]>
  record(input: TaskEventInput): Promise<void>
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const cloneEvent = (event: TaskEventInput): TaskEventInput => structuredClone(event)

export const taskEventPayload = (task: Task): Record<string, unknown> => ({
  kind: task.kind,
  mode: task.mode,
  model: task.model,
  provider: task.provider,
  status: task.status,
})

export class NoopTaskEventLog implements TaskEventLog {
  async record(_input: TaskEventInput): Promise<void> {}
}

export class InMemoryTaskEventLog implements TaskEventLog {
  readonly #events: TaskEventInput[] = []

  async listEvents(taskId: string): Promise<TaskEventInput[]> {
    return this.#events.filter((event) => event.taskId === taskId).map(cloneEvent)
  }

  async record(input: TaskEventInput): Promise<void> {
    this.#events.push(cloneEvent(input))
  }
}

export class DrizzleTaskEventLog implements TaskEventLog {
  constructor(private readonly db: MinaDbClient) {}

  async record(input: TaskEventInput): Promise<void> {
    await this.db.insert(taskEvents).values({
      id: createId('task_event'),
      taskId: input.taskId,
      eventType: input.eventType,
      message: input.message ?? null,
      payload: input.payload ?? null,
    })
  }
}
