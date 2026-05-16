import type { MediaObject, MediaObjectStatus } from './media-object'

export interface MediaObjectRepository {
  create(mediaObject: MediaObject): Promise<MediaObject>
  findById(accountId: string, id: string): Promise<MediaObject | undefined>
  getAccountStorageUsage(accountId: string): Promise<number>
  listExpiredUploading(cutoffIso: string): Promise<MediaObject[]>
  softDelete(accountId: string, id: string, deletedAtIso: string): Promise<void>
  updateStatus(accountId: string, id: string, status: MediaObjectStatus, updatedAtIso: string): Promise<MediaObject>
}

const cloneMediaObject = (mediaObject: MediaObject): MediaObject => structuredClone(mediaObject)

export class InMemoryMediaObjectRepository implements MediaObjectRepository {
  readonly #mediaObjects = new Map<string, MediaObject>()

  async create(mediaObject: MediaObject): Promise<MediaObject> {
    this.#mediaObjects.set(mediaObject.id, cloneMediaObject(mediaObject))
    return cloneMediaObject(mediaObject)
  }

  async findById(accountId: string, id: string): Promise<MediaObject | undefined> {
    const mediaObject = this.#mediaObjects.get(id)
    return mediaObject?.accountId === accountId ? cloneMediaObject(mediaObject) : undefined
  }

  async getAccountStorageUsage(accountId: string): Promise<number> {
    return Array.from(this.#mediaObjects.values())
      .filter((mediaObject) => mediaObject.accountId === accountId && mediaObject.status === 'ready' && !mediaObject.deletedAt)
      .reduce((total, mediaObject) => total + mediaObject.byteSize, 0)
  }

  async listExpiredUploading(cutoffIso: string): Promise<MediaObject[]> {
    return Array.from(this.#mediaObjects.values())
      .filter(
        (mediaObject) =>
          mediaObject.status === 'uploading' &&
          (mediaObject.expiresAt ? mediaObject.expiresAt <= cutoffIso : mediaObject.updatedAt <= cutoffIso),
      )
      .map(cloneMediaObject)
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
    this.#mediaObjects.set(id, cloneMediaObject(updated))
    return cloneMediaObject(updated)
  }
}
