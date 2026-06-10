import type { MediaObjectKind } from '@mina/contracts/modules/media/media-object'
import type { ResourceKind } from '@mina/contracts/modules/tasks'

export const resourceKindFromMimeType = (mimeType: string | undefined): ResourceKind | undefined => {
  if (!mimeType) {
    return undefined
  }
  if (mimeType.startsWith('image/')) {
    return 'image'
  }
  if (mimeType.startsWith('video/')) {
    return 'video'
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }
  return undefined
}

export const mediaObjectKindFromMimeType = (mimeType: string | undefined): MediaObjectKind | undefined =>
  resourceKindFromMimeType(mimeType) ?? (mimeType ? 'file' : undefined)
