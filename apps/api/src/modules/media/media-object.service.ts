import { createHash } from 'node:crypto'

import type { MediaObjectKind } from '@mina/contracts/modules/media/media-object'

import type { ObjectStorage, PresignedPutObjectUrl } from '../../lib/storage/object-storage'
import { HttpError } from '../../lib/http/http-error'
import type {
  MediaObject,
  MediaObjectOrigin,
  MediaObjectPurpose,
  MediaObjectRetention,
} from './media-object'
import type { MediaObjectRepository } from './media-object.repository'
import {
  extensionFromMimeType,
  mediaDerivedObjectName,
  type MediaDerivedObjectNameKind,
  mediaOriginalObjectName,
} from './media-storage-key'
import { mediaObjectKindFromMimeType } from './media-type'
import type { RemoteMediaFetcher } from './remote-media-fetcher'

export interface CreateMediaObjectFromBufferInput {
  accountId: string
  body: Uint8Array
  kind: MediaObjectKind
  mimeType?: string
  origin: MediaObjectOrigin
  parentMediaObjectId?: string
  purpose: MediaObjectPurpose
  retention: MediaObjectRetention
  sourceTaskId?: string
  sourceTaskResourceId?: string
  metadata?: Record<string, unknown>
  objectNameKind?: MediaDerivedObjectNameKind | 'original'
}

export interface CreateMediaObjectFromRemoteUrlInput {
  accountId: string
  kind?: MediaObjectKind
  maxBytes?: number
  metadata?: Record<string, unknown>
  origin: MediaObjectOrigin
  parentMediaObjectId?: string
  purpose: MediaObjectPurpose
  retention: MediaObjectRetention
  sourceTaskId?: string
  sourceTaskResourceId?: string
  timeoutMs?: number
  url: string
}

export interface CreatePresignedUploadInput {
  accountId: string
  byteSize?: number
  kind: MediaObjectKind
  mimeType: string
  purpose: MediaObjectPurpose
  retention: MediaObjectRetention
}

export interface CompletePresignedUploadInput {
  accountId: string
  mediaObjectId: string
  storageKey: string
}

export interface PresignedMediaUpload {
  mediaObject: MediaObject
  upload: PresignedPutObjectUrl
}

export interface MediaObjectServiceConfig {
  remoteFetchMaxBytes: number
  remoteFetchTimeoutMs: number
}

const DEFAULT_CONFIG: MediaObjectServiceConfig = {
  remoteFetchMaxBytes: 100 * 1024 * 1024,
  remoteFetchTimeoutMs: 30_000,
}

const nowIso = (): string => new Date().toISOString()
const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`
const checksum = (body: Uint8Array): string => createHash('sha256').update(body).digest('hex')

export class MediaObjectService {
  constructor(
    private readonly repository: MediaObjectRepository,
    private readonly storage: ObjectStorage,
    private readonly remoteMediaFetcher: RemoteMediaFetcher,
    private readonly config: MediaObjectServiceConfig = DEFAULT_CONFIG,
  ) {}

  async createFromBuffer(input: CreateMediaObjectFromBufferInput): Promise<MediaObject> {
    const id = createId('media')
    const extension = extensionFromMimeType(input.mimeType, input.kind)
    const objectName =
      input.objectNameKind && input.objectNameKind !== 'original'
        ? mediaDerivedObjectName(id, input.objectNameKind)
        : mediaOriginalObjectName(id, extension)
    const stored = await this.storage.putObject({
      accountId: input.accountId,
      body: input.body,
      ...(input.mimeType ? { contentType: input.mimeType } : {}),
      objectName,
      scope: 'media',
    })
    const timestamp = nowIso()
    return this.repository.create({
      id,
      accountId: input.accountId,
      kind: input.kind,
      status: 'ready',
      bucket: stored.bucket,
      storageKey: stored.key,
      url: stored.url,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      byteSize: input.body.byteLength,
      checksum: checksum(input.body),
      origin: input.origin,
      purpose: input.purpose,
      retention: input.retention,
      ...(input.parentMediaObjectId ? { parentMediaObjectId: input.parentMediaObjectId } : {}),
      ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
      ...(input.sourceTaskResourceId ? { sourceTaskResourceId: input.sourceTaskResourceId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  async createPresignedUpload(input: CreatePresignedUploadInput): Promise<PresignedMediaUpload> {
    const id = createId('media')
    const objectName = mediaOriginalObjectName(id, extensionFromMimeType(input.mimeType, input.kind))
    const upload = await this.storage.createPresignedPutUrl({
      accountId: input.accountId,
      contentType: input.mimeType,
      expiresInSeconds: 900,
      objectName,
      scope: 'media',
    })
    const mediaObject = await this.repository.createUploading({
      accountId: input.accountId,
      bucket: upload.key.split('/')[0] ?? 'media',
      byteSize: input.byteSize ?? 0,
      expiresAt: upload.expiresAt,
      id,
      kind: input.kind,
      mimeType: input.mimeType,
      origin: 'user_upload',
      purpose: input.purpose,
      retention: input.retention,
      storageKey: upload.key,
      url: upload.url,
    })
    return { mediaObject, upload }
  }

  async createFromRemoteUrl(input: CreateMediaObjectFromRemoteUrlInput): Promise<MediaObject> {
    const fetched = await this.remoteMediaFetcher.fetch({
      maxBytes: input.maxBytes ?? this.config.remoteFetchMaxBytes,
      timeoutMs: input.timeoutMs ?? this.config.remoteFetchTimeoutMs,
      url: input.url,
    })
    const inferredKind = input.kind ?? mediaObjectKindFromMimeType(fetched.contentType)
    if (!inferredKind) {
      throw new Error('Remote media content type is not supported.')
    }
    return this.createFromBuffer({
      accountId: input.accountId,
      body: fetched.body,
      kind: inferredKind,
      ...(fetched.contentType ? { mimeType: fetched.contentType } : {}),
      origin: input.origin,
      purpose: input.purpose,
      retention: input.retention,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.parentMediaObjectId ? { parentMediaObjectId: input.parentMediaObjectId } : {}),
      ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
      ...(input.sourceTaskResourceId ? { sourceTaskResourceId: input.sourceTaskResourceId } : {}),
    })
  }

  async getAccountStorageUsage(accountId: string): Promise<{ accountId: string; totalBytes: number }> {
    return {
      accountId,
      totalBytes: await this.repository.getAccountStorageUsage(accountId),
    }
  }

  async getReadyMediaObject(accountId: string, mediaObjectId: string): Promise<MediaObject> {
    const mediaObject = await this.repository.findById(accountId, mediaObjectId)
    if (!mediaObject || mediaObject.deletedAt) {
      throw new HttpError(404, 'MEDIA_OBJECT_NOT_FOUND', {
        fallbackMessage: 'Media object not found.',
        messageKey: 'api_error_media_object_not_found',
      })
    }
    if (mediaObject.status !== 'ready') {
      throw new HttpError(409, 'MEDIA_OBJECT_NOT_READY', {
        fallbackMessage: 'Media object is not ready.',
        messageKey: 'api_error_media_object_not_ready',
      })
    }
    return mediaObject
  }

  async getMediaObject(accountId: string, mediaObjectId: string): Promise<MediaObject> {
    const mediaObject = await this.repository.findById(accountId, mediaObjectId)
    if (!mediaObject || mediaObject.deletedAt) {
      throw new HttpError(404, 'MEDIA_OBJECT_NOT_FOUND', {
        fallbackMessage: 'Media object not found.',
        messageKey: 'api_error_media_object_not_found',
      })
    }
    return mediaObject
  }

  async createReadUrl(accountId: string, mediaObjectId: string, expiresInSeconds = 300): Promise<string> {
    const mediaObject = await this.getReadyMediaObject(accountId, mediaObjectId)
    return this.storage.createPresignedGetUrl({
      accountId,
      expiresInSeconds,
      key: mediaObject.storageKey,
    })
  }

  async readBody(accountId: string, mediaObjectId: string, maxBytes?: number): Promise<Uint8Array> {
    const mediaObject = await this.getReadyMediaObject(accountId, mediaObjectId)
    const stored = await this.storage.getObject({
      accountId,
      key: mediaObject.storageKey,
      ...(maxBytes !== undefined ? { maxBytes } : {}),
    })
    return stored.body
  }

  async completePresignedUpload(input: CompletePresignedUploadInput): Promise<MediaObject> {
    const mediaObject = await this.getMediaObject(input.accountId, input.mediaObjectId)
    if (mediaObject.status !== 'uploading') {
      throw new HttpError(409, 'MEDIA_OBJECT_NOT_UPLOADING', {
        fallbackMessage: 'Media object is not waiting for upload completion.',
        messageKey: 'api_error_media_object_not_uploading',
      })
    }
    if (mediaObject.storageKey !== input.storageKey) {
      throw new HttpError(422, 'MEDIA_UPLOAD_KEY_MISMATCH', {
        fallbackMessage: 'Upload storage key does not match the media object.',
        messageKey: 'api_error_media_upload_key_mismatch',
      })
    }
    return this.repository.updateStatus(input.accountId, input.mediaObjectId, 'ready', nowIso())
  }

  async promoteToLibrary(accountId: string, mediaObjectId: string): Promise<MediaObject> {
    const mediaObject = await this.getReadyMediaObject(accountId, mediaObjectId)
    if (mediaObject.retention === 'library') {
      return mediaObject
    }
    return this.repository.updateRetention(accountId, mediaObjectId, 'library', nowIso())
  }

  async findReadyByMediaUrl(accountId: string, url: string): Promise<MediaObject | undefined> {
    const match = /^mina:\/\/media\/([^/?#]+)$/.exec(url)
    if (!match?.[1]) {
      return undefined
    }
    return this.getReadyMediaObject(accountId, match[1])
  }

  async softDelete(accountId: string, mediaObjectId: string): Promise<void> {
    await this.repository.softDelete(accountId, mediaObjectId, nowIso())
  }

  async cleanupExpiredUploading(cutoffIso: string): Promise<MediaObject[]> {
    const expired = await this.repository.listExpiredUploading(cutoffIso)
    for (const mediaObject of expired) {
      await this.repository.softDelete(mediaObject.accountId, mediaObject.id, nowIso())
    }
    return expired
  }
}
