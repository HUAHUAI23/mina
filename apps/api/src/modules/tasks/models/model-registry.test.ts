import { describe, expect, test } from 'bun:test'
import type { Task } from '@mina/contracts/modules/tasks'

import { DevImageSpec } from '../providers/dev/image.spec'
import { ModelRegistry } from './model-registry'
import { ProviderRouter } from './provider-router'

const devTask = (overrides: Partial<Task> = {}): Task => ({
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
    params: {
      count: 2,
      size: '1024x1024',
    },
  },
  cost: {
    estimatedCost: 2,
    usage: {
      amount: 2,
      metric: 'image',
    },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('ModelRegistry and ProviderRouter', () => {
  test('rejects duplicate registrations', () => {
    const registry = new ModelRegistry()
    registry.register(new DevImageSpec())

    expect(() => registry.register(new DevImageSpec())).toThrow('Duplicate task model registration')
  })

  test('throws a domain error for missing models', () => {
    const registry = new ModelRegistry()

    expect(() => registry.get('image_generation', 'missing', 'missing')).toThrow('Unsupported task model')
  })

  test('dispatches provider calls through the selected spec', async () => {
    const registry = new ModelRegistry()
    registry.register(new DevImageSpec())
    const router = new ProviderRouter(registry)

    const result = await router.start(devTask())

    expect(result.status).toBe('succeeded')
    if (result.status !== 'succeeded') {
      throw new Error('Expected provider result to succeed.')
    }
    expect(result.output.resources).toHaveLength(2)
  })

})
