import type { NodeExecutionOutput, Task } from '@mina/contracts/modules/tasks'

import { actualCostFromUsage } from './pricing'
import type { OutputPostProcessor } from './output/output-post-processor'
import type {
  ProviderPollResult,
  ProviderStartResult,
  ProviderUsage,
  TaskProvider,
} from './providers/provider'
import { taskResourceFromOutput } from './resources'
import {
  hasExpired,
  nextRetryAtFromPendingDelay,
  nextRetryAtFromProviderDelay,
  nextRetryAtFromTransportError,
  secondsFromNow,
  type TaskRetryConfig,
} from './retry'
import { taskEventPayload, type TaskEventLog } from './task-events'
import type { TaskRepository } from './tasks.repository'

interface TaskLifecycleConfig {
  maxRunningSeconds: number
  providerErrorMaxRetries: number
  retry: TaskRetryConfig
}

interface TaskLifecycleDependencies {
  config: TaskLifecycleConfig
  outputPostProcessor: OutputPostProcessor
  taskEventLog: TaskEventLog
  taskProvider: TaskProvider
  taskRepository: TaskRepository
}

const nowIso = (): string => new Date().toISOString()

const metadataPayload = (metadata: Record<string, unknown> | undefined): Record<string, unknown> =>
  metadata ? { providerMetadata: metadata } : {}

export class TaskLifecycle {
  constructor(private readonly dependencies: TaskLifecycleDependencies) {}

  async startTask(task: Task): Promise<Task> {
    const startedAt = nowIso()
    const { error: _error, nextRetryAt: _nextRetryAt, ...taskWithoutTransientFields } = task
    const running: Task = {
      ...taskWithoutTransientFields,
      status: 'running',
      expiresAt: secondsFromNow(this.dependencies.config.maxRunningSeconds),
      startedAt,
      retryCount: 0,
      updatedAt: startedAt,
    }
    await this.dependencies.taskRepository.update(running)
    await this.recordTaskEvent(running, 'task.started', 'Task started running.')

    try {
      const startResult = await this.dependencies.taskProvider.start(running)
      return this.handleStartResult(running, startResult)
    } catch (error) {
      return this.retryStartingTask(task, error)
    }
  }

  async pollTask(task: Task): Promise<Task> {
    await this.recordTaskEvent(task, 'task.polling', 'Async task was claimed for provider polling.')
    try {
      if (hasExpired(task)) {
        return this.failTask(task, 'TASK_EXPIRED', 'Task exceeded the maximum running time.')
      }
      const result = await this.dependencies.taskProvider.poll(task)
      return this.handlePollResult(task, result)
    } catch (error) {
      return this.retryPollingTask(task, error)
    }
  }

  async cancelTask(task: Task): Promise<void> {
    if (task.status === 'running') {
      await this.dependencies.taskProvider.cancel?.(task)
    }

    const timestamp = nowIso()
    const { nextRetryAt: _nextRetryAt, ...taskWithoutRetry } = task
    const cancelled = await this.dependencies.taskRepository.update({
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

    const nextRetryAt = nextRetryAtFromProviderDelay(result.nextPollAfterSeconds, this.dependencies.config.retry)
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
    const updated = await this.dependencies.taskRepository.update(submittedTask)
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

  private async markTaskPending(
    task: Task,
    result: Extract<ProviderPollResult, { status: 'pending' }>,
  ): Promise<Task> {
    const timestamp = nowIso()
    const pending: Task = {
      ...task,
      status: 'running',
      ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
      ...(result.metadata ? { providerMetadata: result.metadata } : {}),
      lastPolledAt: timestamp,
      nextRetryAt: nextRetryAtFromPendingDelay(result.nextPollAfterSeconds, this.dependencies.config.retry),
      updatedAt: timestamp,
    }
    const updated = await this.dependencies.taskRepository.update(pending)
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
    const processedOutput = await this.dependencies.outputPostProcessor.process(task, providerOutput)
    const output: NodeExecutionOutput = {
      ...processedOutput,
      variables: {
        ...processedOutput.variables,
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
    const updated = await this.dependencies.taskRepository.update(completedTask)
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
    const cancelled = await this.dependencies.taskRepository.update({
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
    const cancelled = await this.dependencies.taskRepository.update({
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
    await this.dependencies.taskRepository.appendResources?.(task.id, resources)
  }

  private async retryPollingTask(task: Task, error: unknown): Promise<Task> {
    const retryCount = (task.retryCount ?? 0) + 1
    if (retryCount > this.dependencies.config.providerErrorMaxRetries) {
      return this.failTask(task, 'TASK_POLL_RETRY_EXHAUSTED', error)
    }

    const timestamp = nowIso()
    const message = error instanceof Error ? error.message : 'Task provider polling failed.'
    const retried = await this.dependencies.taskRepository.update({
      ...task,
      error: {
        code: 'TASK_POLL_RETRY',
        message,
      },
      lastPolledAt: timestamp,
      nextRetryAt: nextRetryAtFromTransportError(retryCount, this.dependencies.config.retry),
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
    if (retryCount > this.dependencies.config.providerErrorMaxRetries) {
      return this.failTask(task, 'TASK_START_RETRY_EXHAUSTED', error)
    }

    const timestamp = nowIso()
    const message = error instanceof Error ? error.message : 'Task provider start failed.'
    const retried = await this.dependencies.taskRepository.update({
      ...task,
      error: {
        code: 'TASK_START_RETRY',
        message,
      },
      nextRetryAt: nextRetryAtFromTransportError(retryCount, this.dependencies.config.retry),
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
    const failed = await this.dependencies.taskRepository.update({
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
    await this.dependencies.taskEventLog.record({
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
