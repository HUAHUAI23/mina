import { z } from 'zod'

import { BillingMetricSchema, TaskKindSchema } from '../tasks/task.schemas'

export const PricingRuleSchema = z.object({
  id: z.string().min(1),
  taskKind: TaskKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  pricingKey: z.string().min(1).optional(),
  billingMetric: BillingMetricSchema,
  unitPrice: z.number().nonnegative(),
  currency: z.string().min(1).default('credit'),
  activeFrom: z.string().datetime(),
  activeTo: z.string().datetime().optional(),
  priority: z.number().int().default(0),
})

export const PricingEstimateRequestSchema = z.object({
  taskKind: TaskKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  pricingKey: z.string().min(1).optional(),
  billingMetric: BillingMetricSchema,
  usageAmount: z.number().nonnegative(),
})

export const PricingEstimateSchema = z.object({
  ruleId: z.string().min(1),
  billingMetric: BillingMetricSchema,
  usageAmount: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  estimatedCost: z.number().nonnegative(),
  currency: z.string().min(1),
})

export type PricingEstimate = z.infer<typeof PricingEstimateSchema>
export type PricingEstimateRequest = z.infer<typeof PricingEstimateRequestSchema>
export type PricingRule = z.infer<typeof PricingRuleSchema>
