import { describe, expect, test } from 'bun:test'
import type { PricingRule } from '@mina/contracts'

import { InMemoryPricingRepository } from './pricing.repository'
import { PricingService } from './pricing.service'

const activeFrom = new Date('2026-01-01T00:00:00.000Z').toISOString()

const createRule = (overrides: Partial<PricingRule>): PricingRule => ({
  id: 'price_default',
  taskKind: 'video_generation',
  provider: 'dev',
  model: 'model-x',
  billingMetric: 'duration_second',
  unitPrice: 2,
  currency: 'credit',
  activeFrom,
  priority: 0,
  ...overrides,
})

describe('PricingService', () => {
  test('uses the matching pricing key for specialized model pricing', async () => {
    const pricingService = new PricingService(
      new InMemoryPricingRepository([
        createRule({ id: 'price_default', priority: 1, unitPrice: 2 }),
        createRule({
          id: 'price_1080p_10s',
          pricingKey: 'resolution:1080p|duration:10s',
          priority: 1,
          unitPrice: 12,
        }),
      ]),
    )

    const estimate = await pricingService.estimate({
      taskKind: 'video_generation',
      provider: 'dev',
      model: 'model-x',
      pricingKey: 'resolution:1080p|duration:10s',
      billingMetric: 'duration_second',
      usageAmount: 10,
    })

    expect(estimate.ruleId).toBe('price_1080p_10s')
    expect(estimate.estimatedCost).toBe(120)
  })

  test('falls back to generic model pricing when no pricing key is defined on the rule', async () => {
    const pricingService = new PricingService(new InMemoryPricingRepository([createRule({ unitPrice: 3 })]))

    const estimate = await pricingService.estimate({
      taskKind: 'video_generation',
      provider: 'dev',
      model: 'model-x',
      pricingKey: 'resolution:720p',
      billingMetric: 'duration_second',
      usageAmount: 5,
    })

    expect(estimate.ruleId).toBe('price_default')
    expect(estimate.estimatedCost).toBe(15)
  })
})
