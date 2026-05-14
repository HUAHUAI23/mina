import { HttpError } from '../../lib/http/http-error'
import type { AuthActor } from './auth-context'

export const assertAdmin = (actor: AuthActor): void => {
  if (actor.role !== 'admin') {
    throw new HttpError(403, 'ADMIN_REQUIRED', 'Administrator privileges are required.')
  }
}

export const assertAccountMember = (actor: AuthActor, accountId: string): void => {
  if (actor.accountId !== accountId) {
    throw new HttpError(403, 'ACCOUNT_ACCESS_DENIED', 'Account access is denied.')
  }
}

export const assertCanManagePublicResource = (actor: AuthActor): void => {
  assertAdmin(actor)
}

export const assertCanRequestPublicShare = (_actor: AuthActor): never => {
  throw new HttpError(501, 'PUBLIC_SHARE_REQUEST_NOT_IMPLEMENTED', 'Public share requests are not implemented yet.')
}
