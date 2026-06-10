
import type { MediaObject, MediaObjectRetention, MediaObjectStatus } from '../../../modules/media/media-object'
import type { CreateUploadingMediaObjectInput, MediaObjectRepository } from '../../../modules/media/media-object.repository'
import { clone } from '../shared/clone'

export class FakeMediaObjectRepository implements MediaObjectRepository {
  readonly #mediaObjects = new Map<string, MediaObject>()

  async create(mediaObject: MediaObject): Promise<MediaObject> {
    this.#mediaObjects.set(mediaObject.id, clone(mediaObject))
    return clone(mediaObject)
  }

  async createUploading(input: CreateUploadingMediaObjectInput): Promise<MediaObject> {
    const timestamp = new Date().toISOString()
    const mediaObject: MediaObject = {
      accountId: input.accountId,
      bucket: input.bucket,
      byteSize: input.byteSize,
      createdAt: timestamp,
      expiresAt: input.expiresAt,
      id: input.id,
      kind: input.kind,
      mimeType: input.mimeType,
      origin: input.origin,
      purpose: input.purpose,
      retention: input.retention,
      status: 'uploading',
      storageKey: input.storageKey,
      updatedAt: timestamp,
      url: input.url,
    }
    this.#mediaObjects.set(mediaObject.id, clone(mediaObject))
    return clone(mediaObject)
  }

  async findById(accountId: string, id: string): Promise<MediaObject | undefined> {
    const mediaObject = this.#mediaObjects.get(id)
    return mediaObject?.accountId === accountId ? clone(mediaObject) : undefined
  }

  async getAccountStorageUsage(accountId: string): Promise<number> {
    return [...this.#mediaObjects.values()]
      .filter((mediaObject) => mediaObject.accountId === accountId && mediaObject.status === 'ready' && !mediaObject.deletedAt)
      .reduce((total, mediaObject) => total + mediaObject.byteSize, 0)
  }

  async listExpiredUploading(cutoffIso: string): Promise<MediaObject[]> {
    return [...this.#mediaObjects.values()]
      .filter(
        (mediaObject) =>
          mediaObject.status === 'uploading' &&
          (mediaObject.expiresAt ? mediaObject.expiresAt <= cutoffIso : mediaObject.updatedAt <= cutoffIso),
      )
      .map(clone)
  }

  async softDelete(accountId: string, id: string, deletedAtIso: string): Promise<void> {
    const mediaObject = this.#mediaObjects.get(id)
    if (!mediaObject || mediaObject.accountId !== accountId) {
      return
    }
    this.#mediaObjects.set(id, {
      ...mediaObject,
      status: 'deleted',
      deletedAt: deletedAtIso,
      updatedAt: deletedAtIso,
    })
  }

  async updateStatus(
    accountId: string,
    id: string,
    status: MediaObjectStatus,
    updatedAtIso: string,
  ): Promise<MediaObject> {
    const mediaObject = this.#mediaObjects.get(id)
    if (!mediaObject || mediaObject.accountId !== accountId) {
      throw new Error('Media object not found.')
    }
    const updated: MediaObject = {
      ...mediaObject,
      status,
      ...(status === 'deleted' ? { deletedAt: updatedAtIso } : {}),
      updatedAt: updatedAtIso,
    }
    this.#mediaObjects.set(id, clone(updated))
    return clone(updated)
  }

  async updateRetention(
    accountId: string,
    id: string,
    retention: MediaObjectRetention,
    updatedAtIso: string,
  ): Promise<MediaObject> {
    const mediaObject = this.#mediaObjects.get(id)
    if (!mediaObject || mediaObject.accountId !== accountId) {
      throw new Error('Media object not found.')
    }
    const updated: MediaObject = {
      ...mediaObject,
      retention,
      updatedAt: updatedAtIso,
    }
    this.#mediaObjects.set(id, clone(updated))
    return clone(updated)
  }
}
