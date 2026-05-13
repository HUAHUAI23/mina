import type { Account, User } from '@mina/contracts'

export const DEFAULT_USER_ID = 'user_demo'
export const DEFAULT_ACCOUNT_ID = 'demo-account'

const nowIso = new Date('2026-01-01T00:00:00.000Z').toISOString()

export const createDefaultUser = (): User => ({
  id: DEFAULT_USER_ID,
  email: 'demo@mina.local',
  displayName: 'Demo User',
  role: 'admin',
  createdAt: nowIso,
  updatedAt: nowIso,
})

export const createDefaultAccount = (): Account => ({
  id: DEFAULT_ACCOUNT_ID,
  ownerUserId: DEFAULT_USER_ID,
  name: 'Demo Account',
  storageRootPrefix: `users/${DEFAULT_ACCOUNT_ID}`,
  createdAt: nowIso,
  updatedAt: nowIso,
})
