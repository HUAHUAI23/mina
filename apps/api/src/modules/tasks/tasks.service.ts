import type {
  MediaInput,
  NodeExecutionOutput,
  NodeOutputResource,
  Task,
  TaskConfig,
  TaskKind,
  TaskMode,
  TaskResource,
} from '@mina/contracts'

import { HttpError } from '../../lib/http/http-error'
import type { PricingService } from '../pricing/pricing.service'
import type { TaskProvider } from './tasks.provider'
import type { TaskRepository } from './tasks.repository'

interface CreateTaskInput {
  accountId: string
  config: TaskConfig
  inputResources?: MediaInput[]
}

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const taskKindFromConfig = (config: TaskConfig): TaskKind => config.kind

const taskModeFromKind = (kind: TaskKind): TaskMode => (kind === 'video_generation' ? 'async' : 'sync')

const providerFromConfig = (config: TaskConfig): string => config.provider

const modelFromConfig = (config: TaskConfig): string => config.model

const pricingInputFromConfig = (config: TaskConfig) => {
  if (config.kind === 'video_generation') {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      resolution: config.resolution,
      billingMetric: 'duration_second' as const,
      usageAmount: config.durationSeconds,
    }
  }

  return {
    taskKind: config.kind,
    provider: config.provider,
    model: config.model,
    billingMetric: 'token' as const,
    usageAmount: config.count,
  }
}

const taskResourceFromInput = (taskId: string, input: MediaInput, index: number): TaskResource => ({
  id: createId('task_resource'),
  taskId,
  direction: 'input',
  kind: input.kind,
  url: input.url,
  role: input.role,
  outputIndex: index,
  ...(input.metadata ? { metadata: input.metadata } : {}),
})

const taskResourceFromOutput = (taskId: string, output: NodeOutputResource): TaskResource => ({
  id: output.id,
  taskId,
  direction: 'output',
  kind: output.kind,
  url: output.url,
  role: output.role,
  outputIndex: output.index,
  ...(output.metadata ? { metadata: output.metadata } : {}),
})

export class TasksService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly pricingService: PricingService,
    private readonly taskProvider: TaskProvider,
  ) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    const kind = taskKindFromConfig(input.config)
    const mode = taskModeFromKind(kind)
    const pricing = await this.pricingService.estimate(pricingInputFromConfig(input.config))
    const id = createId('task')
    const createdAt = nowIso()
    const task: Task = {
      id,
      accountId: input.accountId,
      kind,
      mode,
      provider: providerFromConfig(input.config),
      model: modelFromConfig(input.config),
      status: 'queued',
      config: input.config,
      cost: {
        estimatedCost: pricing.estimatedCost,
        usage: {
          metric: pricing.billingMetric,
          amount: pricing.usageAmount,
        },
      },
      createdAt,
      updatedAt: createdAt,
    }

    const resources = (input.inputResources ?? []).map((resource, index) => taskResourceFromInput(id, resource, index))
    return this.taskRepository.create(task, resources)
  }

  async getTask(id: string): Promise<Task> {
    const task = await this.taskRepository.findById(id)
    if (!task) {
      throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found.')
    }

    return task
  }

  async getTaskOutput(id: string): Promise<NodeExecutionOutput | undefined> {
    return (await this.getTask(id)).output
  }

  async listTasks(accountId?: string): Promise<Task[]> {
    return this.taskRepository.list(accountId)
  }

  async listTaskResources(taskId: string): Promise<TaskResource[]> {
    return this.taskRepository.listResources(taskId)
  }

  async runTask(id: string): Promise<Task> {
    const task = await this.getTask(id)
    if (task.status !== 'queued') {
      return task
    }

    const startedAt = nowIso()
    const running: Task = {
      ...task,
      status: 'running',
      startedAt,
      updatedAt: startedAt,
    }
    await this.taskRepository.update(running)

    if (running.mode === 'async') {
      const submitted = await this.taskProvider.submit(running)
      const submittedTask: Task = {
        ...running,
        externalTaskId: submitted.externalTaskId,
        updatedAt: nowIso(),
      }
      return this.taskRepository.update(submittedTask)
    }

    return this.completeTask(running)
  }

  async pollAsyncTasks(): Promise<Task[]> {
    const tasks = await this.taskRepository.list()
    const runningAsyncTasks = tasks.filter((task) => task.status === 'running' && task.mode === 'async')
    const completed: Task[] = []

    for (const task of runningAsyncTasks) {
      completed.push(await this.completeTask(task))
    }

    return completed
  }

  async cancelTask(id: string): Promise<void> {
    const task = await this.getTask(id)
    if (task.status !== 'queued' && task.status !== 'running') {
      throw new HttpError(409, 'TASK_NOT_CANCELLABLE', 'Only queued or running tasks can be cancelled.')
    }

    await this.taskRepository.update({
      ...task,
      status: 'cancelled',
      completedAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  private async completeTask(task: Task): Promise<Task> {
    const providerOutput = await this.taskProvider.complete(task)
    const output: NodeExecutionOutput = {
      ...providerOutput,
      variables: {
        ...providerOutput.variables,
        actualCost: task.cost.estimatedCost,
      },
    }
    const completedAt = nowIso()
    const completedTask: Task = {
      ...task,
      status: 'succeeded',
      cost: {
        ...task.cost,
        actualCost: task.cost.estimatedCost,
      },
      output,
      completedAt,
      updatedAt: completedAt,
    }

    await this.appendOutputResources(task.id, output)
    return this.taskRepository.update(completedTask)
  }

  private async appendOutputResources(taskId: string, output: NodeExecutionOutput): Promise<void> {
    const resources = output.resources.map((resource) => taskResourceFromOutput(taskId, resource))
    await this.taskRepository.appendResources?.(taskId, resources)
  }
}
