import type { NodeOutputResource } from '@mina/contracts/modules/tasks'
import type { WorkflowPreviewImage } from '@mina/contracts/modules/workflows'

import { accountAvatarContentUrl, previewUrlForMedia } from '../../lib/media-url'

export type ImageMediaSource =
  | { type: 'account_avatar'; avatarUpdatedAt?: string | undefined }
  | { type: 'media'; media?: ({ mediaObjectId?: string | undefined; url: string } | NodeOutputResource | WorkflowPreviewImage) | undefined }
  | { type: 'url'; url?: string | undefined }

export const resolveImageSource = (source: ImageMediaSource, refreshNonce: number): string | undefined => {
  if (source.type === 'account_avatar') {
    return accountAvatarContentUrl({ avatarUpdatedAt: source.avatarUpdatedAt, refreshNonce })
  }
  if (source.type === 'media') {
    return previewUrlForMedia(source.media, refreshNonce)
  }
  return source.url ? previewUrlForMedia({ url: source.url }, refreshNonce) : undefined
}

export const imageSourceKey = (source: ImageMediaSource): string => {
  if (source.type === 'account_avatar') {
    return `account_avatar:${source.avatarUpdatedAt ?? ''}`
  }
  if (source.type === 'media') {
    return `media:${source.media?.mediaObjectId ?? ''}:${source.media?.url ?? ''}`
  }
  return `url:${source.url ?? ''}`
}
