import type {
  NodeExecutionOutput,
  Task,
  TaskResource,
} from '@mina/contracts/modules/tasks'
import type { TaskConfig } from '@mina/contracts/modules/tasks'

import { apiEnv } from '../../config/env'
import { HttpError } from '../../lib/http/http-error'
import type { PricingService } from '../pricing/pricing.service'
import { TaskLifecycle } from './lifecycle'
import type { ModelRegistry } from './models/model-registry'
import type { OutputPostProcessor } from './output/output-post-processor'
import type { TaskOutputFinalizer } from './output/task-output-finalizer'
import type { TaskProvider } from './providers/provider'
import { taskResourceFromInput } from './resources'
import type { TaskRetryConfig } from './retry'
import { NoopTaskEventLog, taskEventPayload, type TaskEventLog } from './task-events'
import type { TaskRepository } from './tasks.repository'

interface CreateTaskInput {
  accountId: string
  config: TaskConfig
  idempotencyKey?: string
}

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const retryConfig = (): TaskRetryConfig => ({
  defaultIntervalSeconds: apiEnv.taskPollDefaultIntervalSeconds,
  maxIntervalSeconds: apiEnv.taskPollMaxIntervalSeconds,
})

export class TasksService {
  private readonly lifecycle: TaskLifecycle

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly pricingService: PricingService,
    taskProvider: TaskProvider,
    private readonly modelRegistry: ModelRegistry,
    outputFinalizer: TaskOutputFinalizer,
    outputPostProcessor: OutputPostProcessor,
    private readonly taskEventLog: TaskEventLog = new NoopTaskEventLog(),
  ) {
    this.lifecycle = new TaskLifecycle({
      config: {
        maxRunningSeconds: apiEnv.taskMaxRunningSeconds,
        providerErrorMaxRetries: apiEnv.taskProviderErrorMaxRetries,
        retry: retryConfig(),
      },
      taskEventLog,
      outputFinalizer,
      outputPostProcessor,
      taskProvider,
      taskRepository,
    })
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    if (input.idempotencyKey) {
      const existing = await this.taskRepository.findByIdempotencyKey(input.idempotencyKey)
      if (existing) {
        return existing
      }
    }

    const spec = this.modelRegistry.get(input.config.kind, input.config.provider, input.config.model)
    const config = spec.parseConfig(input.config)
    const mode = spec.getTaskMode(config)
    const pricing = await this.pricingService.estimate(spec.getPricingInput(config))
    const id = createId('task')
    const createdAt = nowIso()
    const task: Task = {
      id,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      accountId: input.accountId,
      kind: config.kind,
      mode,
      provider: config.provider,
      model: config.model,
      status: 'queued',
      config,
      cost: {
        estimatedCost: pricing.estimatedCost,
        usage: {
          metric: pricing.billingMetric,
          amount: pricing.usageAmount,
        },
      },
      retryCount: 0,
      createdAt,
      updatedAt: createdAt,
    }

    const resources = spec.collectInputResources(config).map((resource, index) =>
      taskResourceFromInput(id, input.accountId, resource, index, createId),
    )
    const result = await this.taskRepository.create(task, resources)
    if (!result.created) {
      return result.task
    }

    await this.recordTaskEvent(result.task, 'task.created', 'Task was created.', {
      estimatedCost: pricing.estimatedCost,
      inputResourceCount: resources.length,
      usageAmount: pricing.usageAmount,
      usageMetric: pricing.billingMetric,
    })
    return result.task
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

    return this.lifecycle.startTask(task)
  }

  async startQueuedTasks(): Promise<Task[]> {
    const queuedTasks = await this.taskRepository.claimQueuedTasksForStart(
      apiEnv.taskPollBatchSize,
      apiEnv.taskPollLeaseSeconds,
    )
    const updatedTasks: Task[] = []

    for (const task of queuedTasks) {
      updatedTasks.push(await this.lifecycle.startTask(task))
    }

    return updatedTasks
  }

  async pollAsyncTasks(): Promise<Task[]> {
    const runningAsyncTasks = await this.taskRepository.claimRunningAsyncTasksForPolling(
      apiEnv.taskPollBatchSize,
      apiEnv.taskPollLeaseSeconds,
    )
    const updatedTasks: Task[] = []

    for (const task of runningAsyncTasks) {
      updatedTasks.push(await this.lifecycle.pollTask(task))
    }

    return updatedTasks
  }

  async cancelTask(id: string): Promise<void> {
    const task = await this.getTask(id)
    if (task.status !== 'queued' && task.status !== 'running') {
      throw new HttpError(409, 'TASK_NOT_CANCELLABLE', 'Only queued or running tasks can be cancelled.')
    }

    await this.lifecycle.cancelTask(task)
  }

  private async recordTaskEvent(
    task: Task,
    eventType: string,
    message: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.taskEventLog.record({
      eventType,
      message,
      payload: {
        ...taskEventPayload(task),
        ...payload,
      },
      taskId: task.id,
    })
  }
}
