import { describe, expect, test } from 'bun:test'

import { FakeAccountsRepository } from '../../test/fakes'
import { AccountsService } from './accounts.service'
import { hashPassword } from './password'

describe('AccountsService', () => {
  test('register creates an account before issuing a usable session', async () => {
    const repository = new FakeAccountsRepository()
    const service = new AccountsService(repository)

    const response = await service.register({
      email: 'new-user@example.com',
      password: 'correct horse battery staple',
      username: 'new_user',
    })
    const actor = await service.getActorForSessionToken(response.session.token)

    expect(actor.userId).toBe(response.user.id)
    expect(actor.accountId).toMatch(/^account_/)
  })

  test('login rejects users that do not have an initialized account', async () => {
    const repository = new FakeAccountsRepository()
    await repository.addUser({
      displayName: undefined,
      email: 'legacy@example.com',
      id: 'user_legacy',
      role: 'user',
      username: 'legacy',
    })
    await repository.addPasswordCredential({
      passwordHash: await hashPassword('correct horse battery staple'),
      userId: 'user_legacy',
    })
    const service = new AccountsService(repository)

    await expect(
      service.login({
        identifier: 'legacy',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_INITIALIZED',
      status: 409,
    })
  })
})
