
import type { PricingRule } from '@mina/contracts/modules/pricing'

import { createDefaultPricingRules } from '../../../modules/pricing/pricing.repository'
import type { PricingRepository } from '../../../modules/pricing/pricing.repository'

export class FakePricingRepository implements PricingRepository {
  readonly #rules: PricingRule[]

  constructor(rules: PricingRule[] = createDefaultPricingRules()) {
    this.#rules = rules.map((rule) => ({ ...rule }))
  }

  async listRules(): Promise<PricingRule[]> {
    return this.#rules.map((rule) => ({ ...rule }))
  }
}
