import { useCallback, useEffect, useMemo, useState } from 'react'

export const DEFAULT_MEDIA_MAX_RETRIES = 2

export interface RefreshableMediaUrlInput {
  key: string
  maxRetries?: number | undefined
  resolveUrl(refreshNonce: number): string | undefined
}

export interface RefreshableMediaUrlState {
  failed: boolean
  refresh(): boolean
  refreshNonce: number
  src: string | undefined
}

export const useRefreshableMediaUrl = ({
  key,
  maxRetries = DEFAULT_MEDIA_MAX_RETRIES,
  resolveUrl,
}: RefreshableMediaUrlInput): RefreshableMediaUrlState => {
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const src = useMemo(() => resolveUrl(refreshNonce), [refreshNonce, resolveUrl])
  const failed = Boolean(src) && retryCount > maxRetries

  useEffect(() => {
    setRefreshNonce(0)
    setRetryCount(0)
  }, [key])

  const refresh = useCallback(() => {
    if (!src || retryCount >= maxRetries) {
      setRetryCount((current) => current + 1)
      return false
    }
    setRetryCount((current) => current + 1)
    setRefreshNonce((current) => current + 1)
    return true
  }, [maxRetries, retryCount, src])

  return {
    failed,
    refresh,
    refreshNonce,
    src,
  }
}
