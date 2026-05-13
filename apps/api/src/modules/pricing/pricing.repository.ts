import type { PricingRule } from '@mina/contracts'

export interface PricingRepository {
  listRules(): Promise<PricingRule[]>
}

const nowIso = new Date('2026-01-01T00:00:00.000Z').toISOString()

export const createDefaultPricingRules = (): PricingRule[] => [
  {
    id: 'price_image_dev_image',
    taskKind: 'image_generation',
    provider: 'dev',
    model: 'dev-image',
    billingMetric: 'image',
    unitPrice: 1,
    currency: 'credit',
    activeFrom: nowIso,
    priority: 10,
  },
  {
    id: 'price_video_720p_duration',
    taskKind: 'video_generation',
    provider: 'dev',
    model: 'dev-video',
    resolution: '720p',
    billingMetric: 'duration_second',
    unitPrice: 5,
    currency: 'credit',
    activeFrom: nowIso,
    priority: 20,
  },
  {
    id: 'price_video_1080p_duration',
    taskKind: 'video_generation',
    provider: 'dev',
    model: 'dev-video',
    resolution: '1080p',
    billingMetric: 'duration_second',
    unitPrice: 10,
    currency: 'credit',
    activeFrom: nowIso,
    priority: 30,
  },
]

export class InMemoryPricingRepository implements PricingRepository {
  readonly #rules: PricingRule[]

  constructor(rules: PricingRule[] = createDefaultPricingRules()) {
    this.#rules = rules.map((rule) => ({ ...rule }))
  }

  async listRules(): Promise<PricingRule[]> {
    return this.#rules.map((rule) => ({ ...rule }))
  }
}
