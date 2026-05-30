import { describe, expect, test } from 'bun:test'
import type { Task } from '@mina/contracts/modules/tasks'

import { MediaResolvingTaskProvider } from './media-resolving-task-provider'
import type { ProviderPollResult, ProviderStartResult, TaskProvider } from './provider'

const now = new Date('2026-01-01T00:00:00.000Z').toISOString()

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task_1',
  accountId: 'account',
  kind: 'image_generation',
  mode: 'sync',
  provider: 'dev',
  model: 'dev-image',
  status: 'running',
  config: {
    kind: 'image_generation',
    provider: 'dev',
    model: 'dev-image',
    prompt: 'image',
    media: {
      inputImages: [],
      referenceImages: [],
      referenceAudios: [],
      referenceVideos: [],
    },
    params: {},
  },
  cost: {
    estimatedCost: 1,
    usage: {
      amount: 1,
      metric: 'image',
    },
  },
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

class RecordingProvider implements TaskProvider {
  cancelCalls = 0
  pollTask: Task | undefined
  startTask: Task | undefined

  async cancel(): Promise<void> {
    this.cancelCalls += 1
  }

  async poll(input: Task): Promise<ProviderPollResult> {
    this.pollTask = input
    return { status: 'pending' }
  }

  async start(input: Task): Promise<ProviderStartResult> {
    this.startTask = input
    return {
      output: { resources: [], variables: {} },
      status: 'succeeded',
    }
  }
}

class StubMediaUrlResolver {
  calls = 0
  readonly resolvedTask = task({ id: 'task_resolved' })

  async resolve(): Promise<Task> {
    this.calls += 1
    return this.resolvedTask
  }
}

describe('MediaResolvingTaskProvider', () => {
  test('resolves provider media urls before starting the inner provider', async () => {
    const inner = new RecordingProvider()
    const resolver = new StubMediaUrlResolver()
    const provider = new MediaResolvingTaskProvider(inner, resolver)

    await provider.start(task())

    expect(resolver.calls).toBe(1)
    expect(inner.startTask?.id).toBe('task_resolved')
  })

  test('does not resolve media urls for poll or cancel', async () => {
    const inner = new RecordingProvider()
    const resolver = new StubMediaUrlResolver()
    const provider = new MediaResolvingTaskProvider(inner, resolver)
    const runningTask = task({ id: 'task_running' })

    await provider.poll(runningTask)
    await provider.cancel(runningTask)

    expect(resolver.calls).toBe(0)
    expect(inner.pollTask?.id).toBe('task_running')
    expect(inner.cancelCalls).toBe(1)
  })
})
