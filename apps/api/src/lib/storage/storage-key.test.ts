import { describe, expect, test } from 'bun:test'

import { assertAccountStorageKey, buildAccountStorageKey } from './storage-key'

describe('storage keys', () => {
  test('stores every object under an account root', () => {
    expect(
      buildAccountStorageKey({
        accountId: 'account_1',
        objectName: 'media_1/original image.png',
        scope: 'media',
      }),
    ).toBe('users/account_1/media/media_1/original%20image.png')
  })

  test('rejects traversal and cross-account keys', () => {
    expect(() =>
      buildAccountStorageKey({
        accountId: 'account_1',
        objectName: '../secret.png',
        scope: 'uploads',
      }),
    ).toThrow('Storage key path segment is empty or reserved.')

    expect(() => assertAccountStorageKey('account_1', 'users/account_2/uploads/file.png')).toThrow(
      'Storage object key is outside of the account root.',
    )
  })
})
