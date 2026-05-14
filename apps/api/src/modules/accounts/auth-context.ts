import type { UserRole } from '@mina/contracts/modules/accounts'

import { DEFAULT_ACCOUNT_ID, DEFAULT_USER_ID } from './accounts.data'

export interface AuthActor {
  accountId: string
  role: UserRole
  userId: string
}

export const createSystemAdminActor = (
  overrides: Partial<AuthActor> = {},
): AuthActor => ({
  accountId: DEFAULT_ACCOUNT_ID,
  role: 'admin',
  userId: DEFAULT_USER_ID,
  ...overrides,
})
