import type { UserRole } from '@mina/contracts/modules/accounts'

export interface AuthActor {
  accountId: string
  role: UserRole
  userId: string
}
