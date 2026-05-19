import { readStoredAuthToken } from '../../auth/auth-session'
import { webEnv } from '../../../config/env'

const mediaObjectUrlPattern = /^mina:\/\/media\/([^/?#]+)$/

const apiPath = (path: string): string => {
  const base = webEnv.apiBaseUrl === '/' ? window.location.origin : webEnv.apiBaseUrl
  return new URL(path, base).toString()
}

export const mediaObjectContentUrl = (mediaObjectId: string): string => {
  const token = readStoredAuthToken()
  const params = token ? `?token=${encodeURIComponent(token)}` : ''
  return apiPath(`/api/media-objects/${encodeURIComponent(mediaObjectId)}/content${params}`)
}

export const previewUrlForMedia = (
  input: { mediaObjectId?: string | undefined; url: string } | undefined,
): string | undefined => {
  if (!input) {
    return undefined
  }
  if (input.mediaObjectId) {
    return mediaObjectContentUrl(input.mediaObjectId)
  }
  const mediaObjectId = mediaObjectUrlPattern.exec(input.url)?.[1]
  if (mediaObjectId) {
    return mediaObjectContentUrl(mediaObjectId)
  }
  if (input.url.startsWith('s3://')) {
    return undefined
  }
  return input.url
}
