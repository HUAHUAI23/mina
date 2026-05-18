import type { MediaObject, MediaObjectStatus } from './media-object'

export interface CreateUploadingMediaObjectInput {
  accountId: string
  bucket: string
  byteSize: number
  expiresAt: string
  id: string
  kind: MediaObject['kind']
  mimeType: string
  origin: MediaObject['origin']
  purpose: MediaObject['purpose']
  retention: MediaObject['retention']
  storageKey: string
  url: string
}

export interface MediaObjectRepository {
  create(mediaObject: MediaObject): Promise<MediaObject>
  createUploading(input: CreateUploadingMediaObjectInput): Promise<MediaObject>
  findById(accountId: string, id: string): Promise<MediaObject | undefined>
  getAccountStorageUsage(accountId: string): Promise<number>
  listExpiredUploading(cutoffIso: string): Promise<MediaObject[]>
  softDelete(accountId: string, id: string, deletedAtIso: string): Promise<void>
  updateStatus(accountId: string, id: string, status: MediaObjectStatus, updatedAtIso: string): Promise<MediaObject>
}
