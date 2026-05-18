import type {
  MediaObject,
  MediaObjectOrigin,
  MediaObjectPurpose,
  MediaObjectRetention,
  MediaObjectStatus,
} from '@mina/contracts/modules/media/media-object'
import { MediaObjectSchema } from '@mina/contracts/modules/media/media-object'
import type { ResourceKind } from '@mina/contracts/modules/tasks'

export interface CreateMediaObjectRecordInput {
  accountId: string
  bucket: string
  byteSize: number
  checksum?: string
  durationSeconds?: number
  expiresAt?: string
  height?: number
  id: string
  kind: ResourceKind
  metadata?: Record<string, unknown>
  mimeType?: string
  origin: MediaObjectOrigin
  parentMediaObjectId?: string
  purpose: MediaObjectPurpose
  retention: MediaObjectRetention
  sourceTaskId?: string
  sourceTaskResourceId?: string
  status: MediaObjectStatus
  storageKey: string
  url: string
  width?: number
}

export { MediaObjectSchema }
export type { MediaObject, MediaObjectOrigin, MediaObjectPurpose, MediaObjectRetention, MediaObjectStatus }
