import { describe, expect, test } from 'bun:test'

import { InMemoryObjectStorage } from './in-memory-object-storage'

describe('InMemoryObjectStorage', () => {
  test('stores objects under account roots and protects cross-account access', async () => {
    const storage = new InMemoryObjectStorage()
    const stored = await storage.putObject({
      accountId: 'account_1',
      body: 'image-bytes',
      contentType: 'image/png',
      objectName: 'outputs/image.png',
      scope: 'task-outputs',
    })

    expect(stored).toEqual({
      bucket: 'mina-memory-storage',
      key: 'users/account_1/task-outputs/outputs/image.png',
      url: 'memory://mina-memory-storage/users/account_1/task-outputs/outputs/image.png',
    })

    await expect(
      storage.createPresignedGetUrl({
        accountId: 'account_1',
        expiresInSeconds: 60,
        key: stored.key,
      }),
    ).resolves.toBe(stored.url)

    await expect(
      storage.deleteObject({
        accountId: 'account_2',
        key: stored.key,
      }),
    ).rejects.toThrow('Storage object key is outside of the account root.')
  })
})
