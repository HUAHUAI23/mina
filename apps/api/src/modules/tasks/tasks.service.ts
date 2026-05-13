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

import { apiEnv } from '../../config/env'
import { HttpError } from '../../lib/http/http-error'
import type { PricingService } from '../pricing/pricing.service'
import { NoopTaskEventLog, taskEventPayload, type TaskEventLog } from './task-events'
import type { ProviderPollResult, ProviderStartResult, ProviderUsage, TaskProvider } from './tasks.provider'
import type { TaskRepository } from './tasks.repository'

interface CreateTaskInput {
  accountId: string
  config: TaskConfig
  idempotencyKey?: string
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
    billingMetric: 'image' as const,
    usageAmount: config.count,
  }
}

const taskResourceFromInput = (taskId: string, accountId: string, input: MediaInput, index: number): TaskResource => ({
  id: createId('task_resource'),
  accountId,
  taskId,
  direction: 'input',
  kind: input.kind,
  url: input.url,
  role: input.role,
  outputIndex: index,
  ...(input.metadata ? { metadata: input.metadata } : {}),
})

const taskResourceFromOutput = (taskId: string, accountId: string, output: NodeOutputResource): TaskResource => ({
  id: output.id,
  accountId,
  taskId,
  direction: 'output',
  kind: output.kind,
  url: output.url,
  role: output.role,
  outputIndex: output.index,
  ...(output.metadata ? { metadata: output.metadata } : {}),
})

const secondsFromNow = (seconds: number, from = new Date()): string =>
  new Date(from.getTime() + seconds * 1000).toISOString()

const boundedDelay = (seconds: number): number =>
  Math.min(Math.max(0, seconds), apiEnv.taskPollMaxIntervalSeconds)

const nextRetryAtFromProviderDelay = (seconds: number | undefined): string | undefined =>
  seconds === undefined ? undefined : secondsFromNow(boundedDelay(seconds))

const nextRetryAtFromPendingDelay = (seconds: number | undefined): string =>
  secondsFromNow(boundedDelay(seconds ?? apiEnv.taskPollDefaultIntervalSeconds))

const nextRetryAtFromTransportError = (retryCount: number): string => {
  const delay = apiEnv.taskPollDefaultIntervalSeconds * 2 ** Math.max(0, retryCount - 1)
  return secondsFromNow(boundedDelay(delay))
}

const hasExpired = (task: Task, at = new Date()): boolean =>
  task.expiresAt !== undefined && new Date(task.expiresAt) <= at

const actualCostFromUsage = (task: Task, actualUsage: ProviderUsage | undefined): number => {
  if (!actualUsage || actualUsage.metric !== task.cost.usage.metric || task.cost.usage.amount <= 0) {
    return task.cost.estimatedCost
  }

  return (task.cost.estimatedCost / task.cost.usage.amount) * actualUsage.amount
}

const metadataPayload = (metadata: Record<string, unknown> | undefined): Record<string, unknown> =>
  metadata ? { providerMetadata: metadata } : {}

export class TasksService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly pricingService: PricingService,
    private readonly taskProvider: TaskProvider,
    private readonly taskEventLog: TaskEventLog = new NoopTaskEventLog(),
  ) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    if (input.idempotencyKey) {
      const existing = await this.taskRepository.findByAccountIdAndIdempotencyKey(input.accountId, input.idempotencyKey)
      if (existing) {
        return existing
      }
    }

    const kind = taskKindFromConfig(input.config)
    const mode = taskModeFromKind(kind)
    const pricing = await this.pricingService.estimate(pricingInputFromConfig(input.config))
    const id = createId('task')
    const createdAt = nowIso()
    const task: Task = {
      id,
      accountId: input.accountId,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
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
      retryCount: 0,
      createdAt,
      updatedAt: createdAt,
    }

    const resources = (input.inputResources ?? []).map((resource, index) =>
      taskResourceFromInput(id, input.accountId, resource, index),
    )
    const created = await this.taskRepository.create(task, resources)
    await this.recordTaskEvent(created, 'task.created', 'Task was created.', {
      estimatedCost: pricing.estimatedCost,
      inputResourceCount: resources.length,
      usageAmount: pricing.usageAmount,
      usageMetric: pricing.billingMetric,
    })
    return created
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

    return this.startTask(task)
  }

  async startQueuedTasks(): Promise<Task[]> {
    const queuedTasks = await this.taskRepository.claimQueuedTasksForStart(
      apiEnv.taskPollBatchSize,
      apiEnv.taskPollLeaseSeconds,
    )
    const updatedTasks: Task[] = []

    for (const task of queuedTasks) {
      updatedTasks.push(await this.startTask(task))
    }

    return updatedTasks
  }

  private async startTask(task: Task): Promise<Task> {
    const startedAt = nowIso()
    const { error: _error, nextRetryAt: _nextRetryAt, ...taskWithoutTransientFields } = task
    const running: Task = {
      ...taskWithoutTransientFields,
      status: 'running',
      expiresAt: secondsFromNow(apiEnv.taskMaxRunningSeconds),
      startedAt,
      retryCount: 0,
      updatedAt: startedAt,
    }
    await this.taskRepository.update(running)
    await this.recordTaskEvent(running, 'task.started', 'Task started running.')

    try {
      const startResult = await this.taskProvider.start(running)
      return this.handleStartResult(running, startResult)
    } catch (error) {
      return this.retryStartingTask(task, error)
    }
  }

  async pollAsyncTasks(): Promise<Task[]> {
    const runningAsyncTasks = await this.taskRepository.claimRunningAsyncTasksForPolling(
      apiEnv.taskPollBatchSize,
      apiEnv.taskPollLeaseSeconds,
    )
    const updatedTasks: Task[] = []

    for (const task of runningAsyncTasks) {
      await this.recordTaskEvent(task, 'task.polling', 'Async task was claimed for provider polling.')
      try {
        if (hasExpired(task)) {
          updatedTasks.push(await this.failTask(task, 'TASK_EXPIRED', 'Task exceeded the maximum running time.'))
          continue
        }
        const result = await this.taskProvider.poll(task)
        updatedTasks.push(await this.handlePollResult(task, result))
      } catch (error) {
        updatedTasks.push(await this.retryPollingTask(task, error))
      }
    }

    return updatedTasks
  }

  async cancelTask(id: string): Promise<void> {
    const task = await this.getTask(id)
    if (task.status !== 'queued' && task.status !== 'running') {
      throw new HttpError(409, 'TASK_NOT_CANCELLABLE', 'Only queued or running tasks can be cancelled.')
    }

    if (task.status === 'running') {
      await this.taskProvider.cancel?.(task)
    }

    const timestamp = nowIso()
    const { nextRetryAt: _nextRetryAt, ...taskWithoutRetry } = task
    const cancelled = await this.taskRepository.update({
      ...taskWithoutRetry,
      status: 'cancelled',
      completedAt: timestamp,
      updatedAt: timestamp,
    })
    await this.recordTaskEvent(cancelled, 'task.cancelled', 'Task was cancelled.')
  }

  private async handleStartResult(task: Task, result: ProviderStartResult): Promise<Task> {
    if (result.status === 'succeeded') {
      return this.completeTask(task, result.output, result.actualUsage, undefined, result.metadata)
    }

    if (result.status === 'failed') {
      return this.failTask(task, result.code, result.message, result.providerStatus, result.metadata)
    }

    if (result.status === 'cancelled') {
      return this.cancelStartedTask(task, result)
    }

    const nextRetryAt = nextRetryAtFromProviderDelay(result.nextPollAfterSeconds)
    const submittedAt = nowIso()
    const submittedTask: Task = {
      ...task,
      mode: 'async',
      externalTaskId: result.externalTaskId,
      ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
      ...(result.metadata ? { providerMetadata: result.metadata } : {}),
      ...(nextRetryAt ? { nextRetryAt } : {}),
      submittedAt,
      updatedAt: submittedAt,
    }
    const updated = await this.taskRepository.update(submittedTask)
    await this.recordTaskEvent(updated, 'task.submitted', 'Async task was submitted to provider.', {
      externalTaskId: result.externalTaskId,
      nextRetryAt: updated.nextRetryAt,
      providerStatus: result.providerStatus,
      ...metadataPayload(result.metadata),
    })
    return updated
  }

  private async handlePollResult(task: Task, result: ProviderPollResult): Promise<Task> {
    if (result.status === 'pending') {
      return this.markTaskPending(task, result)
    }

    if (result.status === 'succeeded') {
      return this.completeTask(task, result.output, result.actualUsage, result.providerStatus, result.metadata)
    }

    if (result.status === 'cancelled') {
      return this.cancelPolledTask(task, result)
    }

    return this.failTask(task, result.code, result.message, result.providerStatus, result.metadata)
  }

  private async markTaskPending(task: Task, result: Extract<ProviderPollResult, { status: 'pending' }>): Promise<Task> {
    const timestamp = nowIso()
    const pending: Task = {
      ...task,
      status: 'running',
      ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
      ...(result.metadata ? { providerMetadata: result.metadata } : {}),
      lastPolledAt: timestamp,
      nextRetryAt: nextRetryAtFromPendingDelay(result.nextPollAfterSeconds),
      updatedAt: timestamp,
    }
    const updated = await this.taskRepository.update(pending)
    await this.recordTaskEvent(updated, 'task.poll.pending', 'Provider task is still pending.', {
      nextRetryAt: updated.nextRetryAt,
      progress: result.progress,
      providerStatus: result.providerStatus,
      ...metadataPayload(result.metadata),
    })
    return updated
  }

  private async completeTask(
    task: Task,
    providerOutput: NodeExecutionOutput,
    actualUsage: ProviderUsage | undefined,
    providerStatus?: string,
    providerMetadata?: Record<string, unknown>,
  ): Promise<Task> {
    const actualCost = actualCostFromUsage(task, actualUsage)
    const output: NodeExecutionOutput = {
      ...providerOutput,
      variables: {
        ...providerOutput.variables,
        actualCost,
      },
    }
    const completedAt = nowIso()
    const { error: _error, nextRetryAt: _nextRetryAt, ...taskWithoutTerminalFields } = task
    const completedTask: Task = {
      ...taskWithoutTerminalFields,
      status: 'succeeded',
      ...(providerStatus ? { providerStatus } : {}),
      ...(providerMetadata ? { providerMetadata } : {}),
      cost: {
        ...task.cost,
        actualCost,
      },
      output,
      completedAt,
      ...(task.mode === 'async'
        ? { lastPolledAt: completedAt }
        : task.lastPolledAt
          ? { lastPolledAt: task.lastPolledAt }
          : {}),
      retryCount: 0,
      updatedAt: completedAt,
    }

    await this.appendOutputResources(task, output)
    const updated = await this.taskRepository.update(completedTask)
    await this.recordTaskEvent(updated, 'task.succeeded', 'Task completed successfully.', {
      actualUsageAmount: actualUsage?.amount,
      outputResourceCount: output.resources.length,
      providerStatus,
      ...metadataPayload(providerMetadata),
    })
    return updated
  }

  private async cancelPolledTask(
    task: Task,
    result: Extract<ProviderPollResult, { status: 'cancelled' }>,
  ): Promise<Task> {
    const timestamp = nowIso()
    const { nextRetryAt: _nextRetryAt, ...taskWithoutRetry } = task
    const cancelled = await this.taskRepository.update({
      ...taskWithoutRetry,
      status: 'cancelled',
      ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
      ...(result.metadata ? { providerMetadata: result.metadata } : {}),
      completedAt: timestamp,
      lastPolledAt: timestamp,
      updatedAt: timestamp,
    })
    await this.recordTaskEvent(cancelled, 'task.cancelled', result.message ?? 'Provider task was cancelled.', {
      providerStatus: result.providerStatus,
      ...metadataPayload(result.metadata),
    })
    return cancelled
  }

  private async cancelStartedTask(
    task: Task,
    result: Extract<ProviderStartResult, { status: 'cancelled' }>,
  ): Promise<Task> {
    const timestamp = nowIso()
    const { nextRetryAt: _nextRetryAt, ...taskWithoutRetry } = task
    const cancelled = await this.taskRepository.update({
      ...taskWithoutRetry,
      status: 'cancelled',
      ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
      ...(result.metadata ? { providerMetadata: result.metadata } : {}),
      completedAt: timestamp,
      updatedAt: timestamp,
    })
    await this.recordTaskEvent(cancelled, 'task.cancelled', result.message ?? 'Provider cancelled task during start.', {
      providerStatus: result.providerStatus,
      ...metadataPayload(result.metadata),
    })
    return cancelled
  }

  private async appendOutputResources(task: Task, output: NodeExecutionOutput): Promise<void> {
    const resources = output.resources.map((resource) => taskResourceFromOutput(task.id, task.accountId, resource))
    await this.taskRepository.appendResources?.(task.id, resources)
  }

  private async retryPollingTask(task: Task, error: unknown): Promise<Task> {
    const retryCount = (task.retryCount ?? 0) + 1
    if (retryCount > apiEnv.taskProviderErrorMaxRetries) {
      return this.failTask(task, 'TASK_POLL_RETRY_EXHAUSTED', error)
    }

    const timestamp = nowIso()
    const message = error instanceof Error ? error.message : 'Task provider polling failed.'
    const retried = await this.taskRepository.update({
      ...task,
      error: {
        code: 'TASK_POLL_RETRY',
        message,
      },
      lastPolledAt: timestamp,
      nextRetryAt: nextRetryAtFromTransportError(retryCount),
      retryCount,
      updatedAt: timestamp,
    })
    await this.recordTaskEvent(retried, 'task.poll.retry', message, {
      nextRetryAt: retried.nextRetryAt,
      retryCount,
    })
    return retried
  }

  private async retryStartingTask(task: Task, error: unknown): Promise<Task> {
    const retryCount = (task.retryCount ?? 0) + 1
    if (retryCount > apiEnv.taskProviderErrorMaxRetries) {
      return this.failTask(task, 'TASK_START_RETRY_EXHAUSTED', error)
    }

    const timestamp = nowIso()
    const message = error instanceof Error ? error.message : 'Task provider start failed.'
    const retried = await this.taskRepository.update({
      ...task,
      error: {
        code: 'TASK_START_RETRY',
        message,
      },
      nextRetryAt: nextRetryAtFromTransportError(retryCount),
      retryCount,
      updatedAt: timestamp,
    })
    await this.recordTaskEvent(retried, 'task.start.retry', message, {
      nextRetryAt: retried.nextRetryAt,
      retryCount,
    })
    return retried
  }

  private async failTask(
    task: Task,
    code: string,
    error: unknown,
    providerStatus?: string,
    providerMetadata?: Record<string, unknown>,
  ): Promise<Task> {
    const failedAt = nowIso()
    const message = error instanceof Error ? error.message : String(error || 'Task execution failed.')
    const { nextRetryAt: _nextRetryAt, ...taskWithoutRetry } = task
    const failed = await this.taskRepository.update({
      ...taskWithoutRetry,
      status: 'failed',
      ...(providerStatus ? { providerStatus } : {}),
      ...(providerMetadata ? { providerMetadata } : {}),
      error: {
        code,
        message,
      },
      completedAt: failedAt,
      ...(task.mode === 'async'
        ? { lastPolledAt: failedAt }
        : task.lastPolledAt
          ? { lastPolledAt: task.lastPolledAt }
          : {}),
      updatedAt: failedAt,
    })
    await this.recordTaskEvent(failed, 'task.failed', message, {
      providerStatus,
      ...metadataPayload(providerMetadata),
    })
    return failed
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
