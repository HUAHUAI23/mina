import type { MediaObject, MediaObjectStatus } from './media-object'

export interface MediaObjectRepository {
  create(mediaObject: MediaObject): Promise<MediaObject>
  findById(accountId: string, id: string): Promise<MediaObject | undefined>
  getAccountStorageUsage(accountId: string): Promise<number>
  listExpiredUploading(cutoffIso: string): Promise<MediaObject[]>
  softDelete(accountId: string, id: string, deletedAtIso: string): Promise<void>
  updateStatus(accountId: string, id: string, status: MediaObjectStatus, updatedAtIso: string): Promise<MediaObject>
}
