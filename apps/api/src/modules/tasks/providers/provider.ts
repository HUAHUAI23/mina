import type { BillingMetric, NodeExecutionOutput, Task } from '@mina/contracts/modules/tasks'

export interface ProviderUsage {
  amount: number
  metric: BillingMetric
}

export type ProviderStartResult =
  | {
      actualUsage?: ProviderUsage
      metadata?: Record<string, unknown>
      output: NodeExecutionOutput
      status: 'succeeded'
    }
  | {
      code: string
      message: string
      metadata?: Record<string, unknown>
      providerStatus?: string
      status: 'failed'
    }
  | {
      message?: string
      metadata?: Record<string, unknown>
      providerStatus?: string
      status: 'cancelled'
    }
  | {
      externalTaskId: string
      metadata?: Record<string, unknown>
      nextPollAfterSeconds?: number
      providerStatus?: string
      status: 'submitted'
    }

export type ProviderPollResult =
  | {
      metadata?: Record<string, unknown>
      nextPollAfterSeconds?: number
      progress?: number
      providerStatus?: string
      status: 'pending'
    }
  | {
      actualUsage?: ProviderUsage
      metadata?: Record<string, unknown>
      output: NodeExecutionOutput
      providerStatus?: string
      status: 'succeeded'
    }
  | {
      code: string
      message: string
      metadata?: Record<string, unknown>
      providerStatus?: string
      status: 'failed'
    }
  | {
      message?: string
      metadata?: Record<string, unknown>
      providerStatus?: string
      status: 'cancelled'
    }

export interface TaskProvider {
  cancel?(task: Task): Promise<void>
  poll(task: Task): Promise<ProviderPollResult>
  start(task: Task): Promise<ProviderStartResult>
}
