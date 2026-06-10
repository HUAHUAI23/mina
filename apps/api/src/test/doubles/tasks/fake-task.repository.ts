
import type { Task, TaskResource } from '@mina/contracts/modules/tasks'

import type { TaskCreateResult, TaskRepository } from '../../../modules/tasks/tasks.repository'
import { clone } from '../shared/clone'

export class FakeTaskRepository implements TaskRepository {
  readonly #resources = new Map<string, TaskResource[]>()
  readonly #tasks = new Map<string, Task>()

  async appendResources(taskId: string, resources: TaskResource[]): Promise<void> {
    const existing = this.#resources.get(taskId) ?? []
    this.#resources.set(taskId, [...existing, ...resources.map(clone)])
  }

  async claimQueuedTasksForStart(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
    const claimed = [...this.#tasks.values()]
      .filter((task) => {
        const isDue = !task.nextRetryAt || new Date(task.nextRetryAt) <= now
        return task.status === 'queued' && isDue
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
    for (const task of claimed) {
      this.#tasks.set(task.id, clone({ ...task, nextRetryAt: leaseUntil }))
    }
    return claimed.map(clone)
  }

  async claimRunningAsyncTasksForPolling(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
    const claimed = [...this.#tasks.values()]
      .filter((task) => {
        const isDue = !task.nextRetryAt || new Date(task.nextRetryAt) <= now
        return task.status === 'running' && task.mode === 'async' && task.externalTaskId && isDue
      })
      .slice(0, limit)
    for (const task of claimed) {
      this.#tasks.set(task.id, clone({ ...task, nextRetryAt: leaseUntil }))
    }
    return claimed.map(clone)
  }

  async create(task: Task, resources: TaskResource[]): Promise<TaskCreateResult> {
    if (task.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(task.idempotencyKey)
      if (existing) {
        return { created: false, task: existing }
      }
    }

    this.#tasks.set(task.id, clone(task))
    this.#resources.set(task.id, resources.map(clone))
    return { created: true, task: clone(task) }
  }

  async findById(id: string): Promise<Task | undefined> {
    const task = this.#tasks.get(id)
    return task ? clone(task) : undefined
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Task | undefined> {
    const task = [...this.#tasks.values()].find((item) => item.idempotencyKey === idempotencyKey)
    return task ? clone(task) : undefined
  }

  async list(accountId?: string): Promise<Task[]> {
    return [...this.#tasks.values()]
      .filter((task) => !accountId || task.accountId === accountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone)
  }

  async listResources(taskId: string): Promise<TaskResource[]> {
    return (this.#resources.get(taskId) ?? []).map(clone)
  }

  listAllResourcesForTest(): TaskResource[] {
    return [...this.#resources.values()].flat().map(clone)
  }

  async update(task: Task): Promise<Task> {
    this.#tasks.set(task.id, clone(task))
    return clone(task)
  }
}
