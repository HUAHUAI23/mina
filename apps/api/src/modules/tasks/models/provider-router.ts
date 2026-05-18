import type { Task } from '@mina/contracts/modules/tasks'

import type { ProviderPollResult, ProviderStartResult, TaskProvider } from '../providers/provider'
import type { ModelRegistry } from './model-registry'

export class ProviderRouter implements TaskProvider {
  constructor(private readonly registry: ModelRegistry) {}

  async cancel(task: Task): Promise<void> {
    const spec = this.registry.getForTask(task)
    await spec.cancel?.(spec.parseTask(task))
  }

  async poll(task: Task): Promise<ProviderPollResult> {
    const spec = this.registry.getForTask(task)
    return spec.poll(spec.parseTask(task))
  }

  async start(task: Task): Promise<ProviderStartResult> {
    const spec = this.registry.getForTask(task)
    return spec.start(spec.parseTask(task))
  }
}
