import { sql } from 'drizzle-orm'

import { createDefaultAccount, createDefaultUser } from '../modules/accounts/accounts.data'
import { createDefaultPricingRules } from '../modules/pricing/pricing.repository'
import { createDbClient } from './client'
import { accounts, pricingRules, users } from './schema'

const db = createDbClient()

const defaultUser = createDefaultUser()
const defaultAccount = createDefaultAccount()
const pricingRuleValues = createDefaultPricingRules().map((rule) => ({
  id: rule.id,
  taskKind: rule.taskKind,
  provider: rule.provider,
  model: rule.model,
  pricingKey: rule.pricingKey ?? null,
  billingMetric: rule.billingMetric,
  unitPrice: String(rule.unitPrice),
  currency: rule.currency,
  activeFrom: new Date(rule.activeFrom),
  activeTo: rule.activeTo ? new Date(rule.activeTo) : null,
  priority: rule.priority,
}))

await db
  .insert(users)
  .values({
    id: defaultUser.id,
    email: defaultUser.email,
    displayName: defaultUser.displayName ?? null,
    role: defaultUser.role,
    createdAt: new Date(defaultUser.createdAt),
    updatedAt: new Date(defaultUser.updatedAt),
  })
  .onConflictDoUpdate({
    target: users.id,
    set: {
      email: sql`excluded.email`,
      displayName: sql`excluded.display_name`,
      role: sql`excluded.role`,
      updatedAt: new Date(),
    },
  })

await db
  .insert(accounts)
  .values({
    id: defaultAccount.id,
    ownerUserId: defaultAccount.ownerUserId,
    name: defaultAccount.name,
    storageRootPrefix: defaultAccount.storageRootPrefix,
    createdAt: new Date(defaultAccount.createdAt),
    updatedAt: new Date(defaultAccount.updatedAt),
  })
  .onConflictDoUpdate({
    target: accounts.id,
    set: {
      ownerUserId: sql`excluded.owner_user_id`,
      name: sql`excluded.name`,
      storageRootPrefix: sql`excluded.storage_root_prefix`,
      updatedAt: new Date(),
    },
  })

await db
  .insert(pricingRules)
  .values(pricingRuleValues)
  .onConflictDoUpdate({
    target: pricingRules.id,
    set: {
      taskKind: sql`excluded.task_kind`,
      provider: sql`excluded.provider`,
      model: sql`excluded.model`,
      pricingKey: sql`excluded.pricing_key`,
      billingMetric: sql`excluded.billing_metric`,
      unitPrice: sql`excluded.unit_price`,
      currency: sql`excluded.currency`,
      activeFrom: sql`excluded.active_from`,
      activeTo: sql`excluded.active_to`,
      priority: sql`excluded.priority`,
      updatedAt: new Date(),
    },
  })

console.log(`Seeded 1 user, 1 account, and ${pricingRuleValues.length} pricing rules.`)
