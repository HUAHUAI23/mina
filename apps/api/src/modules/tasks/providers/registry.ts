import type { Task } from '@mina/contracts/modules/tasks'

import type { ProviderPollResult, ProviderStartResult, TaskProvider } from './provider'

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
