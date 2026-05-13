import type { PricingRule } from '@mina/contracts'
import { PricingRuleSchema } from '@mina/contracts'
import { desc } from 'drizzle-orm'

import type { MinaDbClient } from '../../db/client'
import { pricingRules } from '../../db/schema'
import type { PricingRepository } from './pricing.repository'

type PricingRuleRow = typeof pricingRules.$inferSelect

const toIso = (value: Date): string => value.toISOString()

const pricingRuleFromRow = (row: PricingRuleRow): PricingRule =>
  PricingRuleSchema.parse({
    id: row.id,
    taskKind: row.taskKind,
    provider: row.provider,
    model: row.model,
    ...(row.resolution ? { resolution: row.resolution } : {}),
    billingMetric: row.billingMetric,
    unitPrice: Number(row.unitPrice),
    currency: row.currency,
    activeFrom: toIso(row.activeFrom),
    ...(row.activeTo ? { activeTo: toIso(row.activeTo) } : {}),
    priority: row.priority,
  })

export class DrizzlePricingRepository implements PricingRepository {
  constructor(private readonly db: MinaDbClient) {}

  async listRules(): Promise<PricingRule[]> {
    const rows = await this.db.select().from(pricingRules).orderBy(desc(pricingRules.priority))
    return rows.map(pricingRuleFromRow)
  }
}
