import type { PricingEstimate, PricingEstimateRequest, PricingRule } from '@mina/contracts/modules/pricing'

import { HttpError } from '../../lib/http/http-error'
import type { PricingRepository } from './pricing.repository'

const isRuleActive = (rule: PricingRule, at: Date): boolean => {
  const activeFrom = new Date(rule.activeFrom)
  const activeTo = rule.activeTo ? new Date(rule.activeTo) : undefined

  return activeFrom <= at && (!activeTo || activeTo > at)
}

const matchesPricingKey = (rule: PricingRule, pricingKey: string | undefined): boolean =>
  rule.pricingKey === pricingKey || rule.pricingKey === undefined

export class PricingService {
  constructor(private readonly pricingRepository: PricingRepository) {}

  async estimate(input: PricingEstimateRequest, at = new Date()): Promise<PricingEstimate> {
    const rules = await this.pricingRepository.listRules()
    const matched = rules
      .filter(
        (rule) =>
          rule.taskKind === input.taskKind &&
          rule.provider === input.provider &&
          rule.model === input.model &&
          rule.billingMetric === input.billingMetric &&
          matchesPricingKey(rule, input.pricingKey) &&
          isRuleActive(rule, at),
      )
      .sort((left, right) => {
        const priorityDiff = right.priority - left.priority
        if (priorityDiff !== 0) {
          return priorityDiff
        }

        const leftSpecificity = left.pricingKey ? 1 : 0
        const rightSpecificity = right.pricingKey ? 1 : 0
        return rightSpecificity - leftSpecificity
      })[0]

    if (!matched) {
      throw new HttpError(422, 'PRICING_RULE_NOT_FOUND', 'No active pricing rule matches the task configuration.')
    }

    return {
      ruleId: matched.id,
      billingMetric: matched.billingMetric,
      usageAmount: input.usageAmount,
      unitPrice: matched.unitPrice,
      estimatedCost: input.usageAmount * matched.unitPrice,
      currency: matched.currency,
    }
  }
}
