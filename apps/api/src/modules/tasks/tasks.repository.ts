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
