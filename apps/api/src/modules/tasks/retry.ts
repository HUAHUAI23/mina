import type { Task } from '@mina/contracts/modules/tasks'

export interface TaskRetryConfig {
  defaultIntervalSeconds: number
  maxIntervalSeconds: number
}

export const secondsFromNow = (seconds: number, from = new Date()): string =>
  new Date(from.getTime() + seconds * 1000).toISOString()

export const boundedDelay = (seconds: number, config: Pick<TaskRetryConfig, 'maxIntervalSeconds'>): number =>
  Math.min(Math.max(0, seconds), config.maxIntervalSeconds)

export const nextRetryAtFromProviderDelay = (
  seconds: number | undefined,
  config: TaskRetryConfig,
): string | undefined => (seconds === undefined ? undefined : secondsFromNow(boundedDelay(seconds, config)))

export const nextRetryAtFromPendingDelay = (seconds: number | undefined, config: TaskRetryConfig): string =>
  secondsFromNow(boundedDelay(seconds ?? config.defaultIntervalSeconds, config))

export const nextRetryAtFromTransportError = (retryCount: number, config: TaskRetryConfig): string => {
  const delay = config.defaultIntervalSeconds * 2 ** Math.max(0, retryCount - 1)
  return secondsFromNow(boundedDelay(delay, config))
}

export const hasExpired = (task: Task, at = new Date()): boolean =>
  task.expiresAt !== undefined && new Date(task.expiresAt) <= at
