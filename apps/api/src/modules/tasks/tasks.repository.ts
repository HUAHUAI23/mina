import type { Task, TaskResource } from '@mina/contracts'

export interface TaskRepository {
  appendResources?(taskId: string, resources: TaskResource[]): Promise<void>
  create(task: Task, resources: TaskResource[]): Promise<Task>
  findById(id: string): Promise<Task | undefined>
  list(accountId?: string): Promise<Task[]>
  listResources(taskId: string): Promise<TaskResource[]>
  update(task: Task): Promise<Task>
}

const cloneTask = (task: Task): Task => structuredClone(task)
const cloneResource = (resource: TaskResource): TaskResource => structuredClone(resource)

export class InMemoryTaskRepository implements TaskRepository {
  readonly #tasks = new Map<string, Task>()
  readonly #resources = new Map<string, TaskResource[]>()

  async create(task: Task, resources: TaskResource[]): Promise<Task> {
    this.#tasks.set(task.id, cloneTask(task))
    this.#resources.set(task.id, resources.map(cloneResource))
    return cloneTask(task)
  }

  async findById(id: string): Promise<Task | undefined> {
    const task = this.#tasks.get(id)
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
