import type { ResourceKind } from '@mina/contracts/modules/tasks'

const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const DEFAULT_EXTENSION_BY_KIND: Record<ResourceKind, string> = {
  audio: 'bin',
  image: 'bin',
  video: 'bin',
}

export const extensionFromMimeType = (mimeType: string | undefined, kind: ResourceKind): string =>
  mimeType ? (MIME_EXTENSION_MAP[mimeType.toLowerCase()] ?? DEFAULT_EXTENSION_BY_KIND[kind]) : DEFAULT_EXTENSION_BY_KIND[kind]

export const mediaOriginalObjectName = (mediaObjectId: string, extension: string): string =>
  `${mediaObjectId}/original.${extension}`

export type MediaDerivedObjectNameKind = 'first_frame' | 'last_frame' | 'video_cover'

export const mediaDerivedObjectName = (
  mediaObjectId: string,
  kind: MediaDerivedObjectNameKind,
): string => {
  if (kind === 'first_frame') return `${mediaObjectId}/first-frame.jpg`
  if (kind === 'last_frame') return `${mediaObjectId}/last-frame.jpg`
  return `${mediaObjectId}/cover.jpg`
}
