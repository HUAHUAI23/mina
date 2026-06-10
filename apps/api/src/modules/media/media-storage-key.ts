import type { MediaObjectKind } from '@mina/contracts/modules/media/media-object'

const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'text/plain': 'txt',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const DEFAULT_EXTENSION_BY_KIND: Record<MediaObjectKind, string> = {
  audio: 'bin',
  file: 'bin',
  image: 'bin',
  video: 'bin',
}

export const extensionFromMimeType = (mimeType: string | undefined, kind: MediaObjectKind): string =>
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
