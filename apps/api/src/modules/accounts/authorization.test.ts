import { describe, expect, test } from 'bun:test'

import { HttpError } from '../../lib/http/http-error'
import { assertAccountMember, assertCanManagePublicResource, assertCanRequestPublicShare } from './authorization'
import type { AuthActor } from './auth-context'

const adminActor: AuthActor = {
  accountId: 'account_1',
  role: 'admin',
  userId: 'user_admin',
}

const userActor: AuthActor = {
  accountId: 'account_1',
  role: 'user',
  userId: 'user_regular',
}

describe('authorization policies', () => {
  test('allows only admins to manage public resources', () => {
    expect(() => assertCanManagePublicResource(adminActor)).not.toThrow()
    expect(() => assertCanManagePublicResource(userActor)).toThrow(HttpError)
    try {
      assertCanManagePublicResource(userActor)
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).status).toBe(403)
      expect((error as HttpError).code).toBe('ADMIN_REQUIRED')
    }
  })

  test('denies cross-account access', () => {
    expect(() => assertAccountMember(adminActor, 'account_1')).not.toThrow()
    expect(() => assertAccountMember(adminActor, 'account_2')).toThrow(HttpError)
  })

  test('keeps public share request flow explicitly unimplemented', () => {
    expect(() => assertCanRequestPublicShare(userActor)).toThrow('Public share requests are not implemented yet.')
  })
})
