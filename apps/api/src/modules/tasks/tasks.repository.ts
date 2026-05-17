import type { Task, TaskResource } from '@mina/contracts/modules/tasks'

export interface TaskCreateResult {
  created: boolean
  task: Task
}

export interface TaskRepository {
  appendResources?(taskId: string, resources: TaskResource[]): Promise<void>
  claimQueuedTasksForStart(limit: number, leaseSeconds: number): Promise<Task[]>
  claimRunningAsyncTasksForPolling(limit: number, leaseSeconds: number): Promise<Task[]>
  create(task: Task, resources: TaskResource[]): Promise<TaskCreateResult>
  findById(id: string): Promise<Task | undefined>
  findByIdempotencyKey(idempotencyKey: string): Promise<Task | undefined>
  list(accountId?: string): Promise<Task[]>
  listResources(taskId: string): Promise<TaskResource[]>
  update(task: Task): Promise<Task>
}

const cloneTask = (task: Task): Task => structuredClone(task)
const cloneResource = (resource: TaskResource): TaskResource => structuredClone(resource)

export class InMemoryTaskRepository implements TaskRepository {
  readonly #tasks = new Map<string, Task>()
  readonly #resources = new Map<string, TaskResource[]>()

  async create(task: Task, resources: TaskResource[]): Promise<TaskCreateResult> {
    if (task.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(task.idempotencyKey)
      if (existing) {
        return { created: false, task: existing }
      }
    }

    this.#tasks.set(task.id, cloneTask(task))
    this.#resources.set(task.id, resources.map(cloneResource))
    return { created: true, task: cloneTask(task) }
  }

  async claimQueuedTasksForStart(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
    const claimed = Array.from(this.#tasks.values())
      .filter((task) => {
        const isDue = !task.nextRetryAt || new Date(task.nextRetryAt) <= now
        return task.status === 'queued' && isDue
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
    for (const task of claimed) {
      this.#tasks.set(task.id, cloneTask({ ...task, nextRetryAt: leaseUntil }))
    }
    return claimed.map(cloneTask)
  }

  async claimRunningAsyncTasksForPolling(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
    const claimed = Array.from(this.#tasks.values())
      .filter((task) => {
        const isDue = !task.nextRetryAt || new Date(task.nextRetryAt) <= now
        return task.status === 'running' && task.mode === 'async' && task.externalTaskId && isDue
      })
      .slice(0, limit)
    for (const task of claimed) {
      this.#tasks.set(task.id, cloneTask({ ...task, nextRetryAt: leaseUntil }))
    }
    return claimed.map(cloneTask)
  }

  async findById(id: string): Promise<Task | undefined> {
    const task = this.#tasks.get(id)
    return task ? cloneTask(task) : undefined
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Task | undefined> {
    const task = Array.from(this.#tasks.values()).find((item) => item.idempotencyKey === idempotencyKey)
    return task ? cloneTask(task) : undefined
  }

  async list(accountId?: string): Promise<Task[]> {
    return Array.from(this.#tasks.values())
      .filter((task) => !accountId || task.accountId === accountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneTask)
  }

  async listResources(taskId: string): Promise<TaskResource[]> {
    return (this.#resources.get(taskId) ?? []).map(cloneResource)
  }

  async update(task: Task): Promise<Task> {
    this.#tasks.set(task.id, cloneTask(task))
    return cloneTask(task)
  }

  async appendResources(taskId: string, resources: TaskResource[]): Promise<void> {
    const existing = this.#resources.get(taskId) ?? []
    this.#resources.set(taskId, [...existing, ...resources.map(cloneResource)])
  }
}
