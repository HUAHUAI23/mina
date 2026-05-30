import type { Task } from '@mina/contracts/modules/tasks'

import type { ProviderPollResult, ProviderStartResult, TaskProvider } from './provider'

interface TaskMediaUrlResolver {
  resolve(task: Task): Promise<Task>
}

export class MediaResolvingTaskProvider implements TaskProvider {
  constructor(
    private readonly inner: TaskProvider,
    private readonly resolver: TaskMediaUrlResolver,
  ) {}

  async cancel(task: Task): Promise<void> {
    await this.inner.cancel?.(task)
  }

  async poll(task: Task): Promise<ProviderPollResult> {
    return this.inner.poll(task)
  }

  async start(task: Task): Promise<ProviderStartResult> {
    return this.inner.start(await this.resolver.resolve(task))
  }
}
