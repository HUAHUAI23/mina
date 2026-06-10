import { webEnv } from '../config/env'

const mediaObjectUrlPattern = /^mina:\/\/media\/([^/?#]+)$/

const apiPath = (path: string): string => {
  const base = webEnv.apiBaseUrl === '/' ? window.location.origin : webEnv.apiBaseUrl
  return new URL(path, base).toString()
}

const withRefreshNonce = (url: string, refreshNonce: number | undefined): string => {
  if (!refreshNonce) {
    return url
  }
  const next = new URL(url)
  next.searchParams.set('_r', String(refreshNonce))
  return next.toString()
}

export const mediaObjectContentUrl = (mediaObjectId: string, refreshNonce?: number): string => {
  return withRefreshNonce(apiPath(`/api/media-objects/${encodeURIComponent(mediaObjectId)}/content`), refreshNonce)
}

export const accountAvatarContentUrl = (
  input: { avatarUpdatedAt?: string | undefined; refreshNonce?: number | undefined } | undefined,
): string | undefined => {
  if (!input?.avatarUpdatedAt) {
    return undefined
  }
  const params = new URLSearchParams()
  params.set('v', input.avatarUpdatedAt)
  return withRefreshNonce(apiPath(`/api/account/avatar/content?${params.toString()}`), input.refreshNonce)
}

export const isProbablyPresignedStorageUrl = (value: string): boolean => {
  if (!/^https?:\/\//i.test(value)) {
    return false
  }
  try {
    const url = new URL(value)
    const keys = new Set([...url.searchParams.keys()].map((key) => key.toLowerCase()))
    const hasAny = (...names: string[]): boolean => names.some((name) => keys.has(name.toLowerCase()))
    const hasAll = (...names: string[]): boolean => names.every((name) => keys.has(name.toLowerCase()))
    const hasPrefix = (prefix: string): boolean => [...keys].some((key) => key.startsWith(prefix.toLowerCase()))

    return (
      hasPrefix('x-amz-') ||
      hasPrefix('x-goog-') ||
      hasAll('signature', 'key-pair-id') ||
      hasAll('ossaccesskeyid', 'signature', 'expires') ||
      (hasAll('sig', 'se') && hasAny('sp', 'sv', 'sr')) ||
      (hasAll('q-signature', 'q-ak') && hasAny('q-sign-time', 'q-key-time'))
    )
  } catch {
    return false
  }
}

export const previewUrlForMedia = (
  input: { mediaObjectId?: string | undefined; url: string } | undefined,
  refreshNonce?: number,
): string | undefined => {
  if (!input) {
    return undefined
  }
  if (input.mediaObjectId) {
    return mediaObjectContentUrl(input.mediaObjectId, refreshNonce)
  }
  const mediaObjectId = mediaObjectUrlPattern.exec(input.url)?.[1]
  if (mediaObjectId) {
    return mediaObjectContentUrl(mediaObjectId, refreshNonce)
  }
  if (input.url.startsWith('s3://')) {
    return undefined
  }
  if (isProbablyPresignedStorageUrl(input.url)) {
    return undefined
  }
  return input.url
}
