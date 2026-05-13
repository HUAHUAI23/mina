import type { BillingMetric, NodeExecutionOutput, NodeOutputResource, Task } from '@mina/contracts'

const outputUrl = (taskId: string, index: number, extension: string): string =>
  `mina://tasks/${taskId}/outputs/${index}.${extension}`

const buildVariables = (resources: NodeOutputResource[]): NodeExecutionOutput['variables'] => {
  const imageUrls = resources.filter((resource) => resource.kind === 'image').map((resource) => resource.url)
  const videoUrls = resources.filter((resource) => resource.kind === 'video').map((resource) => resource.url)
  const audioUrls = resources.filter((resource) => resource.kind === 'audio').map((resource) => resource.url)
  const lastFrameUrls = resources
    .filter((resource) => resource.role === 'last_frame')
    .map((resource) => resource.url)

  return {
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    ...(videoUrls.length > 0 ? { videoUrls } : {}),
    ...(audioUrls.length > 0 ? { audioUrls } : {}),
    ...(lastFrameUrls.length > 0 ? { lastFrameUrls } : {}),
  }
}

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

export class TaskProviderRegistry implements TaskProvider {
  constructor(private readonly providers: Record<string, TaskProvider>) {}

  async cancel(task: Task): Promise<void> {
    await this.get(task.provider).cancel?.(task)
  }

  async poll(task: Task): Promise<ProviderPollResult> {
    return this.get(task.provider).poll(task)
  }

  async start(task: Task): Promise<ProviderStartResult> {
    return this.get(task.provider).start(task)
  }

  private get(provider: string): TaskProvider {
    const taskProvider = this.providers[provider]
    if (!taskProvider) {
      throw new Error(`Unsupported task provider: ${provider}`)
    }
    return taskProvider
  }
}

export class DevTaskProvider implements TaskProvider {
  async poll(task: Task): Promise<ProviderPollResult> {
    return {
      output: this.buildOutput(task),
      status: 'succeeded',
    }
  }

  async start(task: Task): Promise<ProviderStartResult> {
    if (task.kind === 'video_generation') {
      return {
        externalTaskId: `external_${task.id}`,
        providerStatus: 'submitted',
        status: 'submitted',
      }
    }

    return {
      output: this.buildOutput(task),
      status: 'succeeded',
    }
  }

  private buildOutput(task: Task): NodeExecutionOutput {
    if (task.kind === 'image_generation') {
      const count = task.config.kind === 'image_generation' ? task.config.count : 1
      const resources: NodeOutputResource[] = Array.from({ length: count }, (_unused, index) => ({
        id: `${task.id}:image:${index}`,
        kind: 'image',
        role: 'generated_image',
        index,
        url: outputUrl(task.id, index, 'png'),
      }))

      return {
        resources,
        variables: buildVariables(resources),
      }
    }

    const resources: NodeOutputResource[] = [
      {
        id: `${task.id}:video:0`,
        kind: 'video',
        role: 'generated_video',
        index: 0,
        url: outputUrl(task.id, 0, 'mp4'),
      },
    ]

    if (task.config.kind === 'video_generation' && task.config.outputLastFrame) {
      resources.push({
        id: `${task.id}:last-frame:0`,
        kind: 'image',
        role: 'last_frame',
        index: 0,
        url: outputUrl(task.id, 1, 'png'),
      })
    }

    return {
      resources,
      variables: buildVariables(resources),
    }
  }
}
