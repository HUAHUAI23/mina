import { describe, expect, test } from 'bun:test'

import { assertAccountStorageKey } from '../../lib/storage/storage-key'
import { FakeMediaObjectRepository, FakeObjectStorage } from '../../test/fakes'
import { MediaObjectService } from './media-object.service'
import type { RemoteMediaFetcher } from './remote-media-fetcher'

const createService = (fetcher?: RemoteMediaFetcher) => {
  const repository = new FakeMediaObjectRepository()
  const storage = new FakeObjectStorage()
  const service = new MediaObjectService(
    repository,
    storage,
    fetcher ?? {
      fetch: async () => {
        throw new Error('fetcher not configured')
      },
    },
  )

  return { repository, service, storage }
}

describe('MediaObjectService', () => {
  test('creates ready media objects from buffers under the account media root', async () => {
    const { service } = createService()
    const mediaObject = await service.createFromBuffer({
      accountId: 'account_1',
      body: new TextEncoder().encode('image-bytes'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'user_upload',
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    })

    expect(mediaObject.status).toBe('ready')
    expect(mediaObject.byteSize).toBe(11)
    expect(mediaObject.storageKey).toBe(`users/account_1/media/${mediaObject.id}/original.png`)
    expect(mediaObject.url).toBe(`fake://mina-test-storage/${mediaObject.storageKey}`)
    expect(mediaObject.checksum).toHaveLength(64)
    expect(() => assertAccountStorageKey('account_1', mediaObject.storageKey)).not.toThrow()
  })

  test('creates media objects from remote URLs and aggregates ready usage', async () => {
    const { repository, service } = createService({
      fetch: async () => ({
        body: new TextEncoder().encode('remote-image'),
        byteSize: 12,
        contentType: 'image/jpeg',
      }),
    })
    const mediaObject = await service.createFromRemoteUrl({
      accountId: 'account_1',
      origin: 'external_import',
      purpose: 'task_output',
      retention: 'task_scoped',
      url: 'https://cdn.test/output.jpg',
    })

    expect(mediaObject.kind).toBe('image')
    expect(mediaObject.mimeType).toBe('image/jpeg')
    expect(await service.getAccountStorageUsage('account_1')).toEqual({
      accountId: 'account_1',
      totalBytes: 12,
    })

    await repository.softDelete('account_1', mediaObject.id, new Date().toISOString())
    expect(await service.getAccountStorageUsage('account_1')).toEqual({
      accountId: 'account_1',
      totalBytes: 0,
    })
  })

  test('cleans up expired uploading media objects and excludes failed objects from usage', async () => {
    const { repository, service } = createService()
    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    const now = new Date().toISOString()
    await repository.create({
      id: 'media_uploading',
      accountId: 'account_1',
      kind: 'image',
      status: 'uploading',
      bucket: 'bucket',
      storageKey: 'users/account_1/media/media_uploading/original.png',
      url: 'fake://bucket/users/account_1/media/media_uploading/original.png',
      byteSize: 100,
      origin: 'user_upload',
      purpose: 'temporary',
      retention: 'temporary',
      expiresAt: expiredAt,
      createdAt: expiredAt,
      updatedAt: expiredAt,
    })
    await repository.create({
      id: 'media_failed',
      accountId: 'account_1',
      kind: 'image',
      status: 'failed',
      bucket: 'bucket',
      storageKey: 'users/account_1/media/media_failed/original.png',
      url: 'fake://bucket/users/account_1/media/media_failed/original.png',
      byteSize: 200,
      origin: 'user_upload',
      purpose: 'temporary',
      retention: 'temporary',
      createdAt: now,
      updatedAt: now,
    })

    const cleaned = await service.cleanupExpiredUploading(now)

    expect(cleaned.map((mediaObject) => mediaObject.id)).toEqual(['media_uploading'])
    await expect(service.getReadyMediaObject('account_1', 'media_uploading')).rejects.toThrow(
      'Media object is not ready.',
    )
    expect(await service.getAccountStorageUsage('account_1')).toEqual({
      accountId: 'account_1',
      totalBytes: 0,
    })
  })

  test('maps remote fetch failures to controlled service errors', async () => {
    const { service } = createService({
      fetch: async () => {
        throw new Error('Remote media fetch timed out.')
      },
    })

    await expect(
      service.createFromRemoteUrl({
        accountId: 'account_1',
        kind: 'image',
        origin: 'task_output',
        purpose: 'task_output',
        retention: 'task_scoped',
        url: 'https://cdn.test/output.png',
      }),
    ).rejects.toThrow('Remote media fetch timed out.')
  })
})
